/* FEG-TECH 6.0 (Android app): HOTSPOT MODE. Student phones join this phone's hotspot (or the same Wi-Fi), scan the class QR code and
   their face, and THIS phone decides, with no internet at all. The Java part (LocalServerPlugin) only receives the HTTP request;
   everything below answers it, using the roster already saved on this phone. Loads last (after v35.js, which provides window.fcJudge). */
(()=>{
"use strict";
const Cap=window.Capacitor;
if(!(Cap&&Cap.isNativePlatform&&Cap.isNativePlatform()))return; /* the web version has no hotspot mode */
const LS=(Cap.Plugins&&Cap.Plugins.LocalServer)||(Cap.registerPlugin&&Cap.registerPlugin('LocalServer'));
const anchor=document.querySelector('#class .qrcard');if(!LS||!anchor)return;
const $=id=>document.getElementById(id),PORT=8765,ON='fc-local',ADDR='fc-local-addr',SEC='fc-local-secret';
const el=(t,c,x)=>{const e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e};
const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
const secret=()=>{let s=localStorage.getItem(SEC);if(!s){s=hex(crypto.getRandomValues(new Uint8Array(16)));localStorage.setItem(SEC,s)}return s};
/* same signature scheme as the online QR (HMAC-SHA256, first 12 hex characters); the secret never leaves this phone */
async function mac(key,msg){const e=new TextEncoder(),k=await crypto.subtle.importKey('raw',e.encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(await crypto.subtle.sign('HMAC',k,e.encode(msg))).slice(0,12)}
const isOn=()=>localStorage.getItem(ON)==='1';

let addrs=[],running=false,seen=0;
const ip=()=>{const a=localStorage.getItem(ADDR);const f=addrs.find(x=>x.ip===a);return (f||addrs[0]||{}).ip||''};

/* ---------------- card on the Class tab ---------------- */
const card=el('div','card'),h=el('h2',null,'Hotspot mode (no internet)'),row=el('label'),cb=el('input'),sel=el('select'),msg=el('p','muted','');
card.id='hotspotCard';cb.type='checkbox';row.append(cb,' Students scan over this phone\u2019s hotspot');row.style.display='block';sel.style.margin='6px 0';
card.append(h,row,sel,msg);anchor.before(card);
function ui(){
  cb.checked=isOn();sel.hidden=!isOn()||addrs.length<2;
  sel.textContent='';for(const a of addrs){const o=el('option',null,a.ip+'  ('+a.name+')');o.value=a.ip;sel.append(o)}sel.value=ip();
  if(!isOn())msg.textContent='Off. Turn on to let students scan with no internet: prepare the data first (Offline readiness below), switch the phone\u2019s data off, turn on the hotspot, and have students join it.';
  else if(!running)msg.textContent='Starting\u2026';
  else if(!ip())msg.textContent='ON, but this phone has no hotspot or Wi-Fi address yet. Turn on the hotspot (phone Settings) and wait a few seconds.';
  else msg.textContent='ON \u00b7 students join this phone\u2019s hotspot, then open the Student app and scan the QR code. Address '+ip()+':'+PORT+' \u00b7 '+seen+' marked this session. Keep this app open on this screen.'}
async function refresh(){
  if(!isOn()||!running)return;
  try{const r=await LS.addresses();const before=ip();addrs=r.addresses||[];ui();if(ip()!==before&&typeof dOpen==='function'&&dOpen())dashDraw()}catch{}}
async function startServer(){
  const r=await LS.start({port:PORT});addrs=r.addresses||[];running=true;ui()}
cb.onchange=async()=>{
  if(cb.checked){
    try{localStorage.setItem(ON,'1');await startServer()}
    catch(e){localStorage.setItem(ON,'0');running=false;ui();msg.textContent='Could not start hotspot mode: '+(e&&e.message||e)}}
  else{localStorage.setItem(ON,'0');running=false;try{await LS.stop()}catch{}ui()}
  if(typeof dOpen==='function'&&dOpen())dashDraw()};
sel.onchange=()=>{localStorage.setItem(ADDR,sel.value);ui();if(typeof dOpen==='function'&&dOpen())dashDraw()};

/* ---------------- the class QR code (FL1) ---------------- */
const od=dashDraw;let dtk=0;
dashDraw=function(){
  if(!isOn()||!dOpen())return od();
  if(!running||!ip()){$('qrCanvas').hidden=true;$('qrHint').hidden=false;$('qrHint').textContent='Hotspot mode is on, but no hotspot address was found. Turn on this phone\u2019s hotspot.';return}
  const k=++dtk,s=dSes,seq=dSeq,a=ip(),ts=Math.floor(Date.now()/1000).toString(36),end=Math.floor(new Date(s.endsAt)/1000).toString(36);
  mac(secret(),[s.id,ts,seq,end].join('|')).then(m=>{if(k!==dtk||!dOpen())return;$('qrHint').hidden=true;$('qrCanvas').hidden=false;
    drawQr($('qrCanvas'),['FL1',a+':'+PORT,s.id,ts,seq,end,m].join('|'),560)}).catch(()=>{$('qrHint').hidden=false;$('qrHint').textContent='Could not sign the QR code.'})};

/* ---------------- answering student phones (same replies as the school server) ---------------- */
const tickets=new Map(),usedSeq=new Set();
const send=(id,status,obj)=>LS.respond({id,status,body:JSON.stringify(obj)});
const ok128=a=>Array.isArray(a)&&a.length===128&&a.every(x=>typeof x==='number'&&isFinite(x));
const rid=()=>hex(crypto.getRandomValues(new Uint8Array(16)));

async function join(q,J){
  const w=String(q.get('q')||'').slice(0,300).split('|');
  if(w.length!==7||w[0]!=='FL1')return J(400,{error:'That is not a class QR code.'});
  const [,host,sid,ts,seq,end,mc]=w;
  if(!/^[\w-]{8,64}$/.test(sid)||!/^[0-9a-z]{1,8}$/.test(ts)||!/^\d{1,6}$/.test(seq)||!/^[0-9a-z]{1,8}$/.test(end)||!/^[0-9a-f]{12}$/.test(mc))return J(400,{error:'That is not a class QR code.'});
  if(await mac(secret(),[sid,ts,seq,end].join('|'))!==mc)return J(400,{error:'Invalid QR code.'});
  const now=Date.now(),tms=parseInt(ts,36)*1000,ems=parseInt(end,36)*1000;
  if(now>ems)return J(410,{error:'This class has ended.'});
  if(now-tms>30000||tms-now>15000)return J(410,{error:'QR code expired. Scan the new one.'});
  const ses=(db.sessions||[]).find(x=>x.id===sid);
  if(!ses)return J(404,{error:'Class is not ready yet. Try again in a few seconds.'});
  if(!dSes||dSes.id!==sid||!dOpen())return J(410,{error:'This class is not open on the lecturer phone.'});
  const key=sid+':'+seq;
  if(usedSeq.has(key))return J(409,{error:'This QR code was already used. Wait for the next one.'});
  usedSeq.add(key);
  const id=rid(),turn=crypto.getRandomValues(new Uint8Array(1))[0]&1?'l':'r';
  tickets.set(id,{sid,seq,turn,exp:now+90000,state:'join',res:null});
  if(String(dSeq)===String(seq))dashRotate(); /* one student per QR code: show a new one straight away */
  return J(200,{ticket:id,title:ses.title||'',code:ses.code||'',level:ses.level||'',turn,ttl:90});
}
async function submit(body,J){
  let b;try{b=JSON.parse(body||'')}catch{return J(400,{error:'Bad scan data.'})}
  if(!b||!/^[0-9a-f]{32}$/.test(b.ticket||'')||!ok128(b.front)||!ok128(b.side))return J(400,{error:'Bad scan data.'});
  const t=tickets.get(b.ticket);
  if(!t||t.state!=='join'||Date.now()>t.exp)return J(410,{error:'Your scan session expired. Scan the QR code again.'});
  const ses=(db.sessions||[]).find(x=>x.id===t.sid);
  let v;try{v=ses?window.fcJudge({front:b.front,side:b.side,turn:t.turn},ses):{ok:false,msg:'This class was not found. Scan the QR code again.'}}catch(e){v={ok:false,msg:'Could not check this scan.'}}
  if(v.marked){try{save()}catch{}seen++;try{render()}catch{}ui()}
  t.state='done';t.res={ok:!!v.ok,name:v.name||'',msg:v.msg||''};
  return J(200,{ok:true});
}
function result(q,J){
  const id=String(q.get('ticket')||'');if(!/^[0-9a-f]{32}$/.test(id))return J(400,{error:'Bad ticket.'});
  const t=tickets.get(id);return t?J(200,{state:t.state,res:t.res}):J(200,{state:'gone'})}
async function handle(ev){
  const J=(st,o)=>send(ev.id,st,o),q=new URLSearchParams(ev.query||'');
  if(!isOn())return J(503,{error:'Hotspot mode is off on the lecturer phone.'});
  if(ev.path==='/s/ping'&&ev.method==='GET')return J(200,{ok:true,service:'fegtech-lecturer-hotspot',version:window.APP_VERSION||''});
  if(ev.path==='/s/join'&&ev.method==='GET')return join(q,J);
  if(ev.path==='/s/submit'&&ev.method==='POST')return submit(ev.body,J);
  if(ev.path==='/s/result'&&ev.method==='GET')return result(q,J);
  return J(404,{error:'not found'})}
LS.addListener('request',ev=>{handle(ev).catch(e=>send(ev.id,500,{error:'Lecturer app error: '+(e&&e.message||e)}))});

setInterval(()=>{const n=Date.now();for(const [k,t] of tickets)if(n>t.exp+600000)tickets.delete(k);if(usedSeq.size>5000)usedSeq.clear()},60000);
setInterval(refresh,8000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});

ui();
if(isOn())startServer().catch(e=>{running=false;ui();msg.textContent='Could not start hotspot mode: '+(e&&e.message||e)});
})();
