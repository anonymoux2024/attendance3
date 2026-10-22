// ATTENDANCE sync server for Cloudflare Workers + D1 (FEG-TEC 4.2: student-app scan routes, registration from home, 1-hour open phones; 4.5: student database /roster).
// Optional secret ENROL_CODE: if set, students must type it to register, and it is also needed to download the student database (/s/roster).
// Bindings: DB (D1 database). Secret: ACCESS_KEY (staff key; the app sends it as ?auth=...). Required for the student app.
const H={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,PATCH,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type','Content-Type':'application/json'};
const out=(b,s=200)=>new Response(JSON.stringify(b),{status:s,headers:H});
const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
const enc=s=>new TextEncoder().encode(s);
async function mac(key,msg){const k=await crypto.subtle.importKey('raw',enc(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(await crypto.subtle.sign('HMAC',k,enc(msg))).slice(0,12)}
const f128=a=>Array.isArray(a)&&a.length===128&&a.every(x=>typeof x==='number'&&isFinite(x));
const REG='register';
let ready=false;
async function passOk(env,id,now){if(!/^[0-9a-f]{32}$/.test(String(id||'')))return false;return !!(await env.DB.prepare('SELECT 1 FROM pass WHERE id=? AND rev=0 AND exp>?').bind(id,now).first())}

/* ---- student routes: no staff key, but every call needs a signed QR code or an unguessable ticket ---- */
async function student(req,env,u,p){
  if(!env.ACCESS_KEY)return out({error:'The school server has no ACCESS_KEY set.'},500);
  const now=Date.now();
  /* open phone: a signed, short-lived code from the lecturer turns this phone into a pass that lasts up to 1 hour (never past the class end) */
  if(p==='/s/open'&&req.method==='GET'){
    const w=(u.searchParams.get('q')||'').slice(0,200).split('|');
    if(w.length!==5||w[0]!=='FC3')return out({error:'That is not an open-phone code.'},400);
    const [,sid,ts,end,mc]=w;
    if(!/^[\w-]{8,64}$/.test(sid)||!/^[0-9a-z]{1,8}$/.test(ts)||!/^[0-9a-z]{1,8}$/.test(end)||!/^[0-9a-f]{12}$/.test(mc))return out({error:'That is not an open-phone code.'},400);
    if(await mac(env.ACCESS_KEY,['P',sid,ts,end].join('|'))!==mc)return out({error:'Invalid code.'},400);
    const tms=parseInt(ts,36)*1000,ems=parseInt(end,36)*1000;
    if(now>ems)return out({error:'This class has ended.'},410);
    if(now-tms>45000||tms-now>15000)return out({error:'Code expired. Scan the new one.'},410);
    const att=sid!==REG;let s={};
    if(att){const row=await env.DB.prepare("SELECT j FROM r WHERE c='sessions' AND id=?").bind(sid).first();if(!row)return out({error:'Class is not ready yet. Try again in a few seconds.'},404);s=JSON.parse(row.j)}
    await env.DB.prepare('DELETE FROM pass WHERE exp<?').bind(now-3600000).run();
    const n=(await env.DB.prepare('SELECT COUNT(*) AS c FROM pass WHERE sid=? AND rev=0 AND exp>?').bind(sid,now).first()).c;
    if(n>=20)return out({error:'Too many phones are open already. Ask your lecturer.'},429);
    const exp=Math.min(now+3600000,ems),id=hex(crypto.getRandomValues(new Uint8Array(16)));
    await env.DB.prepare('INSERT INTO pass (id,sid,t,exp,rev) VALUES (?,?,?,?,0)').bind(id,sid,now,exp).run();
    return out({pass:id,exp,att,title:s.title||'',code:s.code||'',level:s.level||''});
  }
  if(p==='/s/join'&&req.method==='GET'&&u.searchParams.get('pass')){
    const pid=u.searchParams.get('pass');if(!/^[0-9a-f]{32}$/.test(pid))return out({error:'Bad pass.'},400);
    const pr=await env.DB.prepare('SELECT sid,exp,rev FROM pass WHERE id=?').bind(pid).first();
    if(!pr||pr.rev||now>pr.exp)return out({error:'This phone is no longer open. Scan the open-phone code again.'},410);
    if(pr.sid===REG)return out({error:'This phone is open for registration only.'},403);
    const row=await env.DB.prepare("SELECT j FROM r WHERE c='sessions' AND id=?").bind(pr.sid).first();
    if(!row)return out({error:'Class is not ready yet. Try again in a few seconds.'},404);
    const pre='p'+pid.slice(0,8),recent=(await env.DB.prepare('SELECT COUNT(*) AS c FROM sub WHERE sid=? AND seq LIKE ? AND t>?').bind(pr.sid,pre+'%',now-60000).first()).c;
    if(recent>=8)return out({error:'Too many scans from this phone. Wait a minute.'},429);
    const s=JSON.parse(row.j),turn=crypto.getRandomValues(new Uint8Array(1))[0]&1?'l':'r',id=hex(crypto.getRandomValues(new Uint8Array(16)));
    await env.DB.prepare('DELETE FROM sub WHERE t<?').bind(now-3600000).run();
    try{await env.DB.prepare("INSERT INTO sub (id,sid,seq,turn,t,exp,state) VALUES (?,?,?,?,?,?,'join')").bind(id,pr.sid,pre+'.'+hex(crypto.getRandomValues(new Uint8Array(4))),turn,now,now+90000).run()}
    catch{return out({error:'Try again.'},409)}
    return out({ticket:id,title:s.title||'',code:s.code||'',level:s.level||'',turn,ttl:90});
  }
  if(p==='/s/join'&&req.method==='GET'){
    const w=(u.searchParams.get('q')||'').slice(0,200).split('|');
    if(w.length!==6||w[0]!=='FC2')return out({error:'That is not a class QR code.'},400);
    const [,sid,ts,seq,end,mc]=w;
    if(!/^[\w-]{8,64}$/.test(sid)||!/^[0-9a-z]{1,8}$/.test(ts)||!/^\d{1,6}$/.test(seq)||!/^[0-9a-z]{1,8}$/.test(end)||!/^[0-9a-f]{12}$/.test(mc))return out({error:'That is not a class QR code.'},400);
    if(await mac(env.ACCESS_KEY,[sid,ts,seq,end].join('|'))!==mc)return out({error:'Invalid QR code.'},400);
    const tms=parseInt(ts,36)*1000,ems=parseInt(end,36)*1000;
    if(now>ems)return out({error:'This class has ended.'},410);
    if(now-tms>30000||tms-now>15000)return out({error:'QR code expired. Scan the new one.'},410);
    const row=await env.DB.prepare("SELECT j FROM r WHERE c='sessions' AND id=?").bind(sid).first();
    if(!row)return out({error:'Class is not ready yet. Try again in a few seconds.'},404);
    const s=JSON.parse(row.j),turn=crypto.getRandomValues(new Uint8Array(1))[0]&1?'l':'r',id=hex(crypto.getRandomValues(new Uint8Array(16)));
    await env.DB.prepare('DELETE FROM sub WHERE t<?').bind(now-3600000).run();
    try{await env.DB.prepare("INSERT INTO sub (id,sid,seq,turn,t,exp,state) VALUES (?,?,?,?,?,?,'join')").bind(id,sid,seq,turn,now,now+90000).run()}
    catch{return out({error:'This QR code was already used. Wait for the next one.'},409)}
    return out({ticket:id,title:s.title||'',code:s.code||'',level:s.level||'',turn,ttl:90});
  }
  if(p==='/s/submit'&&req.method==='POST'){
    if(Number(req.headers.get('content-length')||0)>20000)return out({error:'Too large.'},413);
    let b;try{b=await req.json()}catch{return out({error:'Bad scan data.'},400)}
    if(!b||!/^[0-9a-f]{32}$/.test(b.ticket||'')||!f128(b.front)||!f128(b.side))return out({error:'Bad scan data.'},400);
    const r=await env.DB.prepare("UPDATE sub SET state='sub',j=? WHERE id=? AND state='join' AND exp>?").bind(JSON.stringify({front:b.front,side:b.side}),b.ticket,now).run();
    if(!r.meta||!r.meta.changes)return out({error:'Your scan session expired. Scan the QR code again.'},410);
    return out({ok:true});
  }
  if(p==='/s/result'&&req.method==='GET'){
    const id=u.searchParams.get('ticket')||'';if(!/^[0-9a-f]{32}$/.test(id))return out({error:'Bad ticket.'},400);
    const r=await env.DB.prepare('SELECT state,res FROM sub WHERE id=?').bind(id).first();
    if(!r)return out({state:'gone'});return out({state:r.state,res:r.res?JSON.parse(r.res):null});
  }
  if(p==='/s/enroll'&&req.method==='POST'){
    if(Number(req.headers.get('content-length')||0)>70000)return out({error:'Too large.'},413);
    let b;try{b=await req.json()}catch{return out({error:'Bad registration data.'},400)}
    if(!b||typeof b!=='object')return out({error:'Bad registration data.'},400);
    if(env.ENROL_CODE&&String(b.code||'').trim()!==env.ENROL_CODE&&!(await passOk(env,b.pass,now)))return out({error:'Wrong enrolment code.'},403);
    const mt=String(b.matric||'').trim().toUpperCase(),nm=String(b.name||'').trim(),lv=String(b.level||'').trim().toUpperCase(),fd=b.faceDescriptors,fp=b.facePoses;
    if(nm.length<2||nm.length>100||!lv||lv.length>20)return out({error:'Enter your full name and level.'},400);
    if(!/^[A-Z0-9][A-Z0-9\/\-. ]{2,29}$/.test(mt))return out({error:'Enter your matriculation number.'},400);
    if(!Array.isArray(fd)||!Array.isArray(fp)||fd.length!==fp.length||fd.length<5||fd.length>12||!fd.every(f128)||!fp.every(x=>x==='f'||x==='l'||x==='r')||!fp.includes('f')||!fp.includes('l')||!fp.includes('r'))return out({error:'Incomplete face capture. Try again.'},400);
    const ph=typeof b.photo==='string'&&b.photo.length<=30000&&b.photo.startsWith('data:image/jpeg;base64,')?b.photo:'';
    await env.DB.prepare('DELETE FROM enr WHERE t<?').bind(now-30*86400000).run();
    const n=(await env.DB.prepare("SELECT COUNT(*) AS c FROM enr WHERE state='pending'").first()).c;
    if(n>=300)return out({error:'Too many waiting registrations. Tell your lecturer.'},429);
    const id=hex(crypto.getRandomValues(new Uint8Array(16)));
    await env.DB.prepare("INSERT INTO enr (id,t,state,j) VALUES (?,?,'pending',?)").bind(id,now,JSON.stringify({name:nm,matric:mt,level:lv,faceDescriptors:fd,facePoses:fp,photo:ph})).run();
    return out({ticket:id});
  }
  if(p==='/s/enrolstatus'&&req.method==='GET'){
    const id=u.searchParams.get('ticket')||'';if(!/^[0-9a-f]{32}$/.test(id))return out({error:'Bad ticket.'},400);
    const r=await env.DB.prepare('SELECT state,res FROM enr WHERE id=?').bind(id).first();
    if(!r)return out({state:'gone'});return out({state:r.state==='pending'?'pending':'done',res:r.res?JSON.parse(r.res):null});
  }
  if(p==='/s/roster'&&req.method==='GET'){
    if(env.ENROL_CODE&&String(u.searchParams.get('code')||'').trim()!==env.ENROL_CODE)return out({error:'Wrong enrolment code.'},403);
    return rosterRead(env,Number(u.searchParams.get('v'))||0);
  }
  return out({error:'not found'},404);
}

/* ---- staff routes: registration requests made at home (need the staff key) ---- */
async function staffE(req,env,id){
  if(!id&&req.method==='GET'){
    const rs=(await env.DB.prepare("SELECT id,t,j FROM enr WHERE state='pending' ORDER BY t LIMIT 30").all()).results;
    return out({reqs:rs.map(r=>({id:r.id,t:r.t,...JSON.parse(r.j)}))});
  }
  if(id&&req.method==='POST'){
    let b;try{b=await req.json()}catch{return out({error:'bad json'},400)}
    await env.DB.prepare("UPDATE enr SET state='done',j=NULL,res=? WHERE id=?").bind(JSON.stringify({ok:!!(b&&b.ok),msg:String(b&&b.msg||'').slice(0,200)}),id).run();
    return out({ok:true});
  }
  return out({error:'method not allowed'},405);
}

/* ---- staff routes: count / close the phones opened with the lecturer's open-phone code ---- */
async function staffP(req,env,q){
  const sid=q[1],now=Date.now();
  if(!q[2]&&req.method==='GET'){const n=(await env.DB.prepare('SELECT COUNT(*) AS c FROM pass WHERE sid=? AND rev=0 AND exp>?').bind(sid,now).first()).c;return out({n})}
  if(q[2]&&req.method==='POST'){await env.DB.prepare('UPDATE pass SET rev=1 WHERE sid=?').bind(sid).run();return out({ok:true})}
  return out({error:'method not allowed'},405);
}

/* ---- staff routes for the lecturer phone (need the staff key): pick up scans, post the verdict ---- */
async function staffQ(req,env,q){
  const sid=q[1],now=Date.now();
  if(!q[2]&&req.method==='GET'){
    const subs=(await env.DB.prepare("SELECT id,turn,j FROM sub WHERE sid=? AND state='sub' LIMIT 20").bind(sid).all()).results.map(r=>({id:r.id,turn:r.turn,...JSON.parse(r.j)}));
    const used=(await env.DB.prepare('SELECT seq FROM sub WHERE sid=? AND t>?').bind(sid,now-180000).all()).results.map(r=>r.seq);
    return out({subs,used});
  }
  if(q[2]&&req.method==='POST'){
    let b;try{b=await req.json()}catch{return out({error:'bad json'},400)}
    if(!b||!/^[0-9a-f]{32}$/.test(b.id||''))return out({error:'bad body'},400);
    await env.DB.prepare("UPDATE sub SET state='done',j=NULL,res=? WHERE id=? AND sid=?").bind(JSON.stringify({ok:!!b.ok,msg:String(b.msg||'').slice(0,200),name:String(b.name||'').slice(0,100)}),b.id,sid).run();
    return out({ok:true});
  }
  return out({error:'method not allowed'},405);
}

/* ---- student database (4.5): the HOD uploads it with the staff key; staff phones and the student app download it ---- */
const RCH=400,RMAX=15000; // rows per stored chunk, and the largest list accepted
async function rosterRead(env,have){
  const mrow=await env.DB.prepare("SELECT j FROM r WHERE c='roster' AND id='meta'").first(),m=mrow?JSON.parse(mrow.j):null;
  if(!m||!m.v)return out({v:0,t:0,n:0,list:[]});
  if(have&&have===m.v)return out({same:true,v:m.v,t:m.t,n:m.n});
  const rs=(await env.DB.prepare("SELECT id,j FROM r WHERE c='roster' AND id!='meta'").all()).results;
  rs.sort((a,b)=>parseInt(a.id.slice(1))-parseInt(b.id.slice(1)));
  const list=[];for(const r of rs)for(const x of JSON.parse(r.j))list.push(x);
  return out({v:m.v,t:m.t,n:list.length,list});
}
async function rosterWrite(req,env){
  if(Number(req.headers.get('content-length')||0)>3000000)return out({error:'List too large.'},413);
  let b;try{b=await req.json()}catch{return out({error:'bad json'},400)}
  if(!b||!Array.isArray(b.list))return out({error:'bad body'},400);
  const seen=new Set(),list=[];
  for(const x of b.list){
    if(!Array.isArray(x))continue;
    const n=String(x[0]||'').replace(/\s+/g,' ').trim().slice(0,100),mt=String(x[1]||'').trim().toUpperCase().slice(0,30),lv=String(x[2]||'').trim().toUpperCase().slice(0,20);
    if(n.length<2)continue;const k=mt||n.toLowerCase();if(seen.has(k))continue;seen.add(k);list.push([n,mt,lv]);
    if(list.length>=RMAX)break;
  }
  const v=Date.now(),st=[env.DB.prepare("DELETE FROM r WHERE c='roster'")];
  for(let i=0;i*RCH<list.length;i++)st.push(env.DB.prepare("INSERT INTO r (c,id,j) VALUES ('roster',?,?)").bind('c'+i,JSON.stringify(list.slice(i*RCH,(i+1)*RCH))));
  st.push(env.DB.prepare("INSERT INTO r (c,id,j) VALUES ('roster','meta',?)").bind(JSON.stringify({v,t:v,n:list.length})));
  await env.DB.batch(st);
  return out({v,t:v,n:list.length});
}


/* ---- 5.0 sync: every row keeps its edit time (u) and the server revision it arrived in (v) ---- */
const SYNC_COLS=['students','lecturers','courses','sessions','attendance','history'],FUTURE_MS=5*60*1000,TOMB_MS=90*86400000;
let lastPrune=0;
const stampOf=(v,now)=>{let u=Number(v&&v._u);if(!isFinite(u)||u<=0)u=now;return Math.min(Math.round(u),now+FUTURE_MS)};
const curRev=async env=>{const r=await env.DB.prepare("SELECT n FROM rv WHERE k='rev'").first();return r?Number(r.n):0};
/* One batch = one revision. A row is only replaced when the incoming edit time is newer than the stored one,
   so a phone that syncs late can no longer overwrite a newer change made on another phone. */
async function writeRows(env,byc){
  const now=Date.now(),up="INSERT INTO r (c,id,j,u,v) VALUES (?,?,?,?,(SELECT n FROM rv WHERE k='rev')) ON CONFLICT(c,id) DO UPDATE SET j=excluded.j,u=excluded.u,v=excluded.v WHERE excluded.u>r.u";
  const st=[env.DB.prepare("UPDATE rv SET n=n+1 WHERE k='rev'")];
  for(const [c,rows] of Object.entries(byc)){
    if(c!=='meta'&&!SYNC_COLS.includes(c))continue;
    for(const [id,v] of Object.entries(rows||{})){
      if(!v||typeof v!=='object'||!id||id.length>80)continue;
      const u=stampOf(v,now);v._u=u;
      st.push(env.DB.prepare(up).bind(c,String(id),JSON.stringify(v),u))}}
  const res=await env.DB.batch(st);
  let acc=0;for(let i=1;i<res.length;i++)if(res[i]&&res[i].meta&&res[i].meta.changes>0)acc++;
  if(now-lastPrune>3600000){lastPrune=now;
    try{await env.DB.prepare("DELETE FROM r WHERE c!='roster' AND u>0 AND u<? AND json_extract(j,'$.deleted')=1").bind(now-TOMB_MS).run()}catch{}}
  return {accepted:acc,rejected:st.length-1-acc,rev:await curRev(env)}}
async function syncAll(req,env,u){
  if(req.method==='GET'){
    const rev=await curRev(env);let since=u.searchParams.has('since')?Number(u.searchParams.get('since')):-1;
    if(!isFinite(since)||since>rev)since=-1;
    if(u.searchParams.get('probe'))return out({ok:true,rev});
    if(since>=0&&since===rev)return out({ok:true,unchanged:true,rev});
    const q="SELECT c,id,j FROM r WHERE c IN ('students','lecturers','courses','sessions','attendance','history','meta') AND v>?";
    const {results}=await env.DB.prepare(q).bind(since).all(),rows={};
    for(const r of results){(rows[r.c]=rows[r.c]||{})[r.id]=JSON.parse(r.j)}
    return out({ok:true,rev,rows,full:since<0})}
  if(req.method==='PATCH'||req.method==='POST'){
    let b;try{b=await req.json()}catch{return out({error:'bad json'},400)}
    if(!b||typeof b!=='object')return out({error:'bad body'},400);
    return out({ok:true,...(await writeRows(env,b))})}
  return out({error:'method not allowed'},405)}
export default{async fetch(req,env){
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:H});
  const u=new URL(req.url),p=u.pathname,stu=p.startsWith('/s/');
  if(!stu&&env.ACCESS_KEY&&u.searchParams.get('auth')!==env.ACCESS_KEY)return out({error:'denied'},401);
  const m=p.match(/^\/fc\/(students|lecturers|courses|sessions|attendance|history|meta|all)\.json$/),q=p.match(/^\/q\/([\w-]{8,64})(\/res)?$/),e=p.match(/^\/enr(?:\/([0-9a-f]{32}))?$/),pp=p.match(/^\/p\/([\w-]{8,64})(\/close)?$/),ro=p==='/roster';
  if(!m&&!q&&!e&&!pp&&!stu&&!ro)return out({ok:true,service:'attendance-sync'});
  if(!env.DB)return out({error:'D1 binding named DB is missing'},500);
  if(!ready){await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS r (c TEXT NOT NULL, id TEXT NOT NULL, j TEXT NOT NULL, u INTEGER NOT NULL DEFAULT 0, v INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (c,id))'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS rv (k TEXT PRIMARY KEY, n INTEGER NOT NULL)'),
    env.DB.prepare("INSERT OR IGNORE INTO rv (k,n) VALUES ('rev',0)"),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS sub (id TEXT PRIMARY KEY, sid TEXT NOT NULL, seq TEXT NOT NULL, turn TEXT NOT NULL, t INTEGER NOT NULL, exp INTEGER NOT NULL, state TEXT NOT NULL, j TEXT, res TEXT, UNIQUE(sid,seq))'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS enr (id TEXT PRIMARY KEY, t INTEGER NOT NULL, state TEXT NOT NULL, j TEXT, res TEXT)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS pass (id TEXT PRIMARY KEY, sid TEXT NOT NULL, t INTEGER NOT NULL, exp INTEGER NOT NULL, rev INTEGER NOT NULL DEFAULT 0)')]);
    /* databases made by version 4.x have no u/v columns yet: add them once */
    const cols=(await env.DB.prepare('PRAGMA table_info(r)').all()).results.map(x=>x.name);
    if(!cols.includes('u'))await env.DB.prepare('ALTER TABLE r ADD COLUMN u INTEGER NOT NULL DEFAULT 0').run();
    if(!cols.includes('v'))await env.DB.prepare('ALTER TABLE r ADD COLUMN v INTEGER NOT NULL DEFAULT 0').run();
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS r_cv ON r (c,v)').run();
    ready=true}
  if(stu)return student(req,env,u,p);
  if(ro)return req.method==='GET'?rosterRead(env,Number(u.searchParams.get('v'))||0):req.method==='POST'?rosterWrite(req,env):out({error:'method not allowed'},405);
  if(q)return staffQ(req,env,q);
  if(pp)return staffP(req,env,pp);
  if(e)return staffE(req,env,e[1]);
  const c=m[1];
  if(c==='all')return syncAll(req,env,u);
  if(req.method==='GET'){
    const {results}=await env.DB.prepare('SELECT id,j FROM r WHERE c=?').bind(c).all();
    if(c==='meta')return out(results.length?JSON.parse(results[0].j):null);
    if(!results.length)return out(null);
    const o={};for(const r of results)o[r.id]=JSON.parse(r.j);return out(o);
  }
  if(req.method==='PATCH'){
    let b;try{b=await req.json()}catch{return out({error:'bad json'},400)}
    if(!b||typeof b!=='object')return out({error:'bad body'},400);
    await writeRows(env,c==='meta'?{meta:{_:b}}:{[c]:b});
    return out(b);
  }
  return out({error:'method not allowed'},405);
}};
