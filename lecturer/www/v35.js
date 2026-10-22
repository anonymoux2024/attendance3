/* Feg-tech 3.6: Student app mode. The QR is signed, students scan on their own phone, this phone checks the face. Loads last. */
(()=>{
const $=id=>document.getElementById(id),RK='fc-remote';
const el=(t,c,x)=>{const e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e};
const cfg=()=>{try{return JSON.parse(localStorage.getItem('fc-sync'))||{}}catch{return {}}};
const ready=()=>!!(cfg().url&&cfg().key),on=()=>localStorage.getItem(RK)==='1'&&ready();
const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
async function mac(key,msg){const e=new TextEncoder(),k=await crypto.subtle.importKey('raw',e.encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(await crypto.subtle.sign('HMAC',k,e.encode(msg))).slice(0,12)}
async function staff(path,method,body){const c=cfg(),r=await fetch(c.url.replace(/\/+$/,'')+'/'+path+'?auth='+encodeURIComponent(c.key),{method,headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});if(!r.ok)throw Error('Server '+r.status);return r.json()}

/* ---- switch ---- */
const row=el('label','card'),cb=el('input'),info=el('p','muted','');cb.type='checkbox';cb.checked=on();
row.append(cb,' Students scan on their own phone (Student app)');row.style.display='block';
document.querySelector('#class .qrcard').before(row,info);
const note=t=>info.textContent=t;
cb.onchange=()=>{if(cb.checked&&!ready()){cb.checked=false;return alert('Connect this phone to online sync first (use the department share link).')}localStorage.setItem(RK,cb.checked?'1':'0');note(cb.checked?'Student app mode is ON. The QR code is now for the Student app only.':'Student app mode is off. The QR code works with the scan screen in this app.');if(dOpen())dashDraw()};
if(on())note('Student app mode is ON. The QR code is now for the Student app only.');

/* ---- signed QR (FC2) ---- */
const od=dashDraw;let dtk=0;
dashDraw=function(){
  if(!on()||!dOpen())return od();
  const k=++dtk,s=dSes,seq=dSeq,ts=Math.floor(Date.now()/1000).toString(36),end=Math.floor(new Date(s.endsAt)/1000).toString(36);
  mac(cfg().key,[s.id,ts,seq,end].join('|')).then(m=>{if(k!==dtk||!dOpen())return;$('qrHint').hidden=true;$('qrCanvas').hidden=false;drawQr($('qrCanvas'),['FC2',s.id,ts,seq,end,m].join('|'),560)}).catch(()=>note('Could not sign the QR code.'))};
$('createClass').addEventListener('click',()=>setTimeout(()=>window.fcSync&&window.fcSync(true),50));

/* ---- judge one scan sent by a student phone ---- */
const ok128=a=>Array.isArray(a)&&a.length===128&&a.every(x=>typeof x==='number'&&isFinite(x));
function judge(sub,ses){
  if(!ok128(sub.front)||!ok128(sub.side)||(sub.turn!=='l'&&sub.turn!=='r'))return{ok:false,msg:'Bad scan data. Try again.'};
  const rf=rank(sub.front,'f'),b=rf[0],b2=rf[1];
  if(!(b&&b.dist<threshold()&&(!b2||b2.dist-b.dist>=MARGIN))){
    let d='';try{if(localStorage.getItem('fc-diag')!=='0'){
      const f=x=>x==null?'-':(+x).toFixed(3);
      d=!b?' [roster has 0 face records on this phone]':
        b.dist>=threshold()?' [too far: best '+f(b.dist)+', need under '+f(threshold())+']':
        ' [too close to another record: best '+f(b.dist)+', next '+f(b2&&b2.dist)+', gap '+f(b2&&b2.dist-b.dist)+', need '+f(MARGIN)+(b2&&b2.s.name===b.s.name?'; SAME NAME saved twice':'')+']'}}catch(e){}
    return{ok:false,msg:('Face not recognised. Try again.'+d).slice(0,200)}}
  const s=b.s;if(!has3d(s))return{ok:false,msg:'Your 3D face data is missing. Ask your lecturer to register you again.'};
  const rs=rank(sub.side,sub.turn),c=rs[0],c2=rs[1];
  if(!(c&&c.s.id===s.id&&c.dist<threshold()+SIDE_EXTRA&&(!c2||c2.dist-c.dist>=SIDE_MARGIN))){
    let d='';try{if(localStorage.getItem('fc-diag')!=='0'){
      const f=x=>x==null?'-':(+x).toFixed(3);
      d=!c?' [no 3D records]':c.s.id!==s.id?' [turn matched a different record; front '+f(b.dist)+', turn '+f(c.dist)+']':
        c.dist>=threshold()+SIDE_EXTRA?' [turn too far: '+f(c.dist)+', need under '+f(threshold()+SIDE_EXTRA)+']':
        ' [turn too close to another: gap '+f(c2&&c2.dist-c.dist)+', need '+f(SIDE_MARGIN)+']'}}catch(e){}
    return{ok:false,msg:('3D check failed. Try again.'+d).slice(0,200)}}
  if(ses.level&&s.level&&ses.level!==s.level&&!(s.co||[]).some(c=>ck(c)===ck(ses.code||ses.title)))return{ok:false,name:s.name,msg:'This class is for '+ses.level+' students.'};
  if(db.attendance.some(a=>a.sessionId===ses.id&&a.studentId===s.id))return{ok:true,name:s.name,msg:'Already present'};
  db.attendance.push({id:uid(),studentId:s.id,sessionId:ses.id,at:new Date().toISOString(),method:'student-app',distance:+b.dist.toFixed(4)});
  return{ok:true,name:s.name,msg:'Marked present',marked:true}}

window.fcJudge=judge; /* 6.0: also used by local.js (hotspot mode) */

/* ---- poll the server while the class QR is on screen ---- */
let busy=false,seen=0;
async function poll(){
  if(busy||!on()||currentTab==='scan'||!dSes||!dOpen()||document.hidden)return;
  busy=true;const ses=dSes;
  try{
    const r=await staff('q/'+ses.id,'GET');let marked=false;
    for(const sub of r.subs||[]){let v;try{v=judge(sub,ses)}catch(e){v={ok:false,msg:'Could not check this scan.'}}
      if(v.marked){marked=true;seen++}
      await staff('q/'+ses.id+'/res','POST',{id:sub.id,ok:v.ok,name:v.name||'',msg:v.msg})}
    if(marked)save();
    note('Student app mode is ON · '+seen+' marked from student phones this session');
    if((r.used||[]).includes(String(dSeq))||marked)dashRotate()
  }catch(e){note('Student app mode: '+(e.message==='Failed to fetch'?'cannot reach the server.':e.message))}
  finally{busy=false}}
setInterval(poll,2000);
})();
