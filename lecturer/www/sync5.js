"use strict";
/* FEG-TECH 5.0 sync engine.
   Ideas taken from the Finance and Report Card apps:
   - every change is stamped with the time it was MADE (not the time it was synced), so a phone that syncs late can never
     overwrite a newer change from another phone;
   - the server keeps a revision number, so a normal check downloads nothing ("anything newer than revision N?");
   - the server refuses writes that are older than what it already holds, and tells us what it refused;
   - one request carries every collection; only changed rows travel;
   - offline = a clear message, nothing is lost: unsent changes are always detected again by comparing with the last-synced snapshot;
   - delete markers are removed a week after they were sent.
   Written so it can be tested without a browser: everything it needs is passed in. */
(function (root) {
  const COLLS = ["students", "lecturers", "courses", "sessions", "attendance", "history"];
  const SNAP = "fc-sync-snap", REV = "fc-rev", TOMB_KEEP_MS = 7 * 86400000, STORAGE_CHARS = 5000000;

  /* same fingerprint as versions 3.4 to 4.9 (so old snapshots stay valid); the two bookkeeping fields are ignored */
  function hash(r) {
    const s = JSON.stringify(r, (k, v) => (k === "_u" || k === "_h") ? undefined : v);
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return h + ":" + s.length;
  }

  function create(ctx) {
    const getDb = ctx.getDb, persist = ctx.persist, cfg = ctx.cfg, status = ctx.status || (() => {});
    const store = ctx.storage, fetchFn = ctx.fetch, now = ctx.now || Date.now;
    const online = ctx.online || (() => (typeof navigator === "undefined" || navigator.onLine !== false));
    const after = ctx.afterChange || (() => {});
    let busy = false, again = false, failCount = 0, lastOkAt = 0, touchT = 0, stampTimer = null, syncTimer = null, pollTimer = null;

    const base = () => cfg().url.replace(/\/+$/, "");
    const qs = extra => "?" + (cfg().key ? "auth=" + encodeURIComponent(cfg().key) + "&" : "") + (extra || "");
    async function api(path, method, body, extra) {
      const r = await fetchFn(base() + "/fc/" + path + ".json" + qs(extra), {
        method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
      if (!r.ok) throw Error(r.status === 401 || r.status === 403 ? "Access denied. Check the access key." : "Server error " + r.status);
      return r.json();
    }
    const readSnap = () => { try { return JSON.parse(store.getItem(SNAP)) || {}; } catch { return {}; } };
    const writeSnap = s => { try { store.setItem(SNAP, JSON.stringify(s)); } catch {} };
    const getRev = () => { const v = store.getItem(REV); return v === null ? null : Number(v); };
    const setRev = v => { try { store.setItem(REV, String(v)); } catch {} };
    const metaHash = db => hash({ d: db.dept || "", t: db.thr || 0 });

    /* 5.1: older versions could leave a stray true/false/null entry inside a list; it cannot be stamped or sent, so it is removed */
    function clean() {
      const db = getDb(); let n = 0;
      for (const c of COLLS) if (Array.isArray(db[c])) {
        const ok = db[c].filter(r => r && typeof r === "object" && !Array.isArray(r));
        if (ok.length !== db[c].length) { n += db[c].length - ok.length; db[c] = ok; }
      }
      if (n) { try { persist(); } catch {} }
      return n;
    }

    /* ---- stamp: give every new or edited record the time it was edited ---- */
    function stamp(t) {
      clean();
      const db = getDb(), snap = readSnap(); let n = 0;
      for (const c of COLLS) for (const r of db[c] || []) {
        if (r._join) continue;
        const h = hash(r);
        if (snap[c + "/" + r.id] !== h && r._h !== h) { r._u = t; r._h = h; n++; }
      }
      const mh = metaHash(db);
      if ((db.dept || db.thr) && snap.meta !== mh && db.deptH !== mh) { db.deptU = t; db.deptH = mh; n++; }
      return n;
    }
    /* call after every local save: remembers when the first edit of a burst happened and stamps shortly after */
    function touch() {
      if (!touchT) touchT = now();
      clearTimeout(stampTimer);
      stampTimer = setTimeout(() => { const t = touchT; touchT = 0; try { stamp(t); } catch {} }, 300);
    }

    /* ---- apply rows that came from the server ---- */
    function applyRows(rows, snap) {
      const db = getDb(); let changed = false;
      for (const c of COLLS) {
        const incoming = rows && rows[c]; if (!incoming) continue;
        db[c] = db[c] || [];
        const dead = new Set((db.tomb || []).filter(t => t.c === c).map(t => t.id));
        const idx = new Map(); db[c].forEach((x, i) => idx.set(x.id, i));
        const drop = new Set();
        for (const [id, rv] of Object.entries(incoming)) {
          if (!rv || typeof rv !== "object" || dead.has(id)) continue;
          const i = idx.get(id);
          if (rv.deleted) {
            if (i !== undefined && (db[c][i]._u || 0) <= (rv._u || 0)) { drop.add(id); changed = true; }
            delete snap[c + "/" + id]; continue;
          }
          rv.id = id; rv._h = hash(rv); snap[c + "/" + id] = rv._h;
          if (i === undefined) { db[c].push(rv); idx.set(id, db[c].length - 1); changed = true; }
          else if (db[c][i]._join || (rv._u || 0) > (db[c][i]._u || 0)) { db[c][i] = rv; changed = true; }
          else if ((rv._u || 0) < (db[c][i]._u || 0)) delete snap[c + "/" + id]; // ours is newer: it must still be sent
        }
        if (drop.size) db[c] = db[c].filter(x => !drop.has(x.id));
      }
      const m = rows && rows.meta && rows.meta._;
      if (m && (m._u || 0) > (db.deptU || 0)) {
        db.dept = m.dept || db.dept; db.thr = m.thr || db.thr; db.deptU = m._u; db.deptH = metaHash(db); snap.meta = db.deptH; changed = true;
      }
      return changed;
    }

    /* ---- everything this phone has that the server does not ---- */
    function collectPush(snap) {
      const db = getDb(), list = [], marks = {};
      for (const c of COLLS) for (const r of db[c] || []) {
        if (r._join) continue;
        const h = hash(r);
        if (snap[c + "/" + r.id] !== h) { const { _h, ...o } = r; list.push([c, r.id, o]); marks[c + "/" + r.id] = h; }
      }
      for (const t of db.tomb || []) if (!t.p) list.push([t.c, t.id, { deleted: true, _u: t.t }]);
      const mh = metaHash(db);
      if ((db.dept || db.thr) && snap.meta !== mh) { list.push(["meta", "_", { dept: db.dept || "", thr: db.thr || 0, _u: db.deptU || now() }]); marks.meta = mh; }
      return { list, marks };
    }

    function storageNote() {
      try {
        let n = 0; for (let i = 0; i < store.length; i++) { const k = store.key(i); n += k.length + (store.getItem(k) || "").length; }
        const pct = Math.round(n / STORAGE_CHARS * 100);
        return pct >= 70 ? " · Phone storage about " + Math.min(pct, 100) + "% full: back up and remove old data" : "";
      } catch { return ""; }
    }

    async function syncNow() {
      if (!cfg().url) return;
      if (busy) { again = true; return; } /* 5.1: a request made during a running sync (e.g. a new class) is run right after it, not dropped */
      if (!online()) { status("Offline — saved on this phone, will sync when online"); return; }
      busy = true; status("Syncing…");
      try {
        clean();
        const db = getDb(); let touched = stamp(now()) > 0;
        const snap = readSnap();
        let rev = getRev();
        const pr = await api("all", "GET", null, "since=" + (rev === null ? -1 : rev));
        if (!pr || typeof pr.rev !== "number" || (!pr.unchanged && !pr.rows))
          throw Error("The sync server needs the new worker.js (version 5.0). See CLOUDFLARE_SETUP.md.");
        let changed = pr.unchanged ? false : applyRows(pr.rows, snap);
        rev = pr.rev;

        const { list, marks } = collectPush(snap);
        if (list.length) {
          let rejected = 0, last = rev, chunks = 0;
          for (let i = 0; i < list.length; i += 30) {
            const body = {};
            for (const [c, id, rec] of list.slice(i, i + 30)) (body[c] = body[c] || {})[id] = rec;
            const r = await api("all", "PATCH", body);
            rejected += r.rejected || 0; last = r.rev; chunks++;
          }
          for (const k of Object.keys(marks)) snap[k] = marks[k];
          for (const t of db.tomb || []) if (!t.p) t.p = 1;
          if (last === rev + chunks && rejected === 0) rev = last;
          else { /* someone else wrote at the same moment, or the server kept a newer copy: pull what we missed */
            const p2 = await api("all", "GET", null, "since=" + rev);
            if (!p2.unchanged && p2.rows && applyRows(p2.rows, snap)) changed = true;
            rev = p2.rev;
          }
          touched = true;
        }
        /* forget snapshot entries for records that no longer exist; drop delete markers a week after they were sent */
        const live = new Set(); for (const c of COLLS) for (const r of db[c] || []) live.add(c + "/" + r.id);
        for (const k of Object.keys(snap)) if (k !== "meta" && !live.has(k)) delete snap[k];
        if (db.tomb) db.tomb = db.tomb.filter(t => !(t.p && now() - t.t > TOMB_KEEP_MS));
        writeSnap(snap); setRev(rev);
        if (changed || touched) persist();
        failCount = 0; lastOkAt = now();
        status((list.length ? "Synced — sent " + list.length + " change" + (list.length === 1 ? "" : "s") : changed ? "Synced — received changes" : "Synced — up to date") +
          " at " + new Date(now()).toLocaleTimeString() + storageNote());
        if (changed) after();
      } catch (e) {
        failCount++;
        const m = String(e && e.message || e);
        status(/Failed to fetch|NetworkError|Load failed/i.test(m) ? "Could not reach the sync server. Changes are saved on this phone and will be sent when it is back." : m);
      } finally { busy = false; if (again) { again = false; setTimeout(() => syncNow(), 300); } }
    }

    /* send soon after a change (waits for a pause so several saves go up together) */
    function notifyChange() { if (!cfg().url) return; clearTimeout(syncTimer); syncTimer = setTimeout(() => syncNow(), 2500); }

    /* check the connection without downloading anything */
    async function probe() { const r = await api("all", "GET", null, "probe=1"); if (typeof r.rev !== "number") throw Error("The sync server needs the new worker.js (version 5.0). See CLOUDFLARE_SETUP.md."); return r; }

    function reset() { store.removeItem(SNAP); store.removeItem(REV); }

    /* background checks: every 30 s while the app is on screen (slower after failures), and whenever the app comes back or the internet returns */
    function start(doc, win) {
      const POLL = 30000;
      const arm = () => {
        clearTimeout(pollTimer);
        pollTimer = setTimeout(async () => { if (cfg().url && online() && !doc.hidden) await syncNow(); arm(); }, Math.min(300000, POLL * Math.pow(2, Math.min(failCount, 4))));
      };
      arm();
      win.addEventListener("online", () => { if (cfg().url) syncNow(); });
      win.addEventListener("focus", () => { if (cfg().url && now() - lastOkAt > 3000) syncNow(); });
      doc.addEventListener("visibilitychange", () => {
        if (!cfg().url) return;
        if (!doc.hidden) { if (now() - lastOkAt > 3000) syncNow(); }
        else { try { stamp(now()); } catch {} syncNow(); } /* leaving the app: send unsent changes before the phone freezes it */
      });
    }
    return { syncNow, notifyChange, touch, stamp, probe, reset, start, hash, _api: api, _state: () => ({ busy, failCount }) };
  }

  const api = { create, hash };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.FcSync = api;
})(typeof window !== "undefined" ? window : globalThis);
