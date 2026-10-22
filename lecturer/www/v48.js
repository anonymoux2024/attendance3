"use strict";
/* FEG-TECH 4.8: the running class now survives minimizing, screen-off and app restarts.
   - The live class is remembered on the phone and its QR comes back by itself.
   - "Live class" card: Show QR, +15 min, End class.
   - "Recent classes" card: Reopen a class that ended (same class, same attendance).
   Uses globals from qr.js (dSes, dSeq, dTimer, dOpen, dashStart, dashStop, dashDraw) and app.js (db, save). Loads last. */
(()=>{
const $=id=>document.getElementById(id),LK='fc-live',DAY=864e5;
const el=(t,c,x)=>{const e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e};
const say=m=>{try{toast(m)}catch{alert(m)}};
const sync=()=>setTimeout(()=>window.fcSync&&window.fcSync(true),50);
const mine=s=>{const me=window.curLect;return !me||!s.lecturerId||s.lecturerId===me.id};
const ends=s=>new Date(s.endsAt).getTime();
const isLive=s=>!!s&&Date.now()<ends(s);

/* ---- remember / restore the live class ---- */
function persist(){try{if(dSes&&dOpen())localStorage.setItem(LK,JSON.stringify({id:dSes.id}));else localStorage.removeItem(LK)}catch{}}
function resume(){
  if(dSes&&dOpen())return true;
  let id=null;try{id=(JSON.parse(localStorage.getItem(LK))||{}).id}catch{}
  if(!id)return false;
  const s=db.sessions.find(x=>x.id===id);
  if(!s||!isLive(s)){try{localStorage.removeItem(LK)}catch{}return false}
  if(!mine(s))return false;
  dSes=s;dSeq=Math.floor(Date.now()/1000);return true}

/* ---- live class card ---- */
const live=el('div','card livecard');live.hidden=true;
const lTitle=el('b','','Live class'),lBig=el('div','big',''),lSub=el('p','muted',''),lAct=el('div','actions');
const bShow=el('button','','Show QR'),bExt=el('button','secondary','+15 min'),bEnd=el('button','danger','End class');
[bShow,bExt,bEnd].forEach(b=>b.type='button');lAct.append(bShow,bExt,bEnd);live.append(lTitle,lBig,lSub,lAct);

/* ---- recent classes card ---- */
const recent=el('div','card');recent.id='recentCard';recent.hidden=true;
const rHead=el('h2','','Recent classes'),rNote=el('p','muted','Classes that ended in the last 24 hours. Reopen one to keep taking attendance for the same class — students already marked stay marked.'),rBox=el('div');
recent.append(rHead,rNote,rBox);

const anchor=document.querySelector('#class .tdhead');
if(!anchor)return;
anchor.after(live,recent);

function endNow(s){s.endsAt=new Date().toISOString();save();if(dSes&&dSes.id===s.id){dashStop();dashDraw()}persist();sync()}

bShow.onclick=()=>{if(!resume())return;dashStart();const q=document.querySelector('#class .qrcard');q&&q.scrollIntoView({behavior:'smooth',block:'center'})};
bExt.onclick=()=>{if(!dSes)return;const s=dSes;s.endsAt=new Date(ends(s)+15*60000).toISOString();s.duration=(s.duration||45)+15;save();dashStart();sync();say('Class extended by 15 minutes.')};
bEnd.onclick=()=>{if(!dSes||!dOpen())return;if(!confirm('End this class now? You can reopen it later from Recent classes.'))return;endNow(dSes);paint();say('Class ended.')};

function reopen(s){
  if(dOpen()&&dSes.id!==s.id){if(!confirm('Another class is live. End it and reopen this one?'))return;endNow(dSes)}
  const d=prompt('Reopen for how many minutes?',String(Math.max(15,s.duration||45)));if(d===null)return;
  const m=Math.round(Number(d));if(!(m>=1&&m<=1440))return alert('Enter a number of minutes between 1 and 1440.');
  s.endsAt=new Date(Date.now()+m*60000).toISOString();
  s.duration=Math.max(1,Math.round((ends(s)-new Date(s.created).getTime())/60000));
  save();dSes=s;dSeq=Math.floor(Date.now()/1000);persist();dashStart();sync();paint();
  const q=document.querySelector('#class .qrcard');q&&q.scrollIntoView({behavior:'smooth',block:'center'});say('Class reopened.')}

/* ---- keep the cards up to date ---- */
let sig='';
function paint(){
  if(dSes){const cur=db.sessions.find(x=>x.id===dSes.id);if(cur&&cur!==dSes)dSes=cur}
  const on=!!dSes&&dOpen();live.hidden=!on;
  if(on){const left=Math.max(0,ends(dSes)-Date.now()),m=Math.floor(left/60000),s=Math.floor(left%60000/1000),n=db.attendance.filter(a=>a.sessionId===dSes.id).length;
    lBig.textContent=(dSes.code?dSes.code+' · ':'')+dSes.title;
    lSub.textContent=m+':'+String(s).padStart(2,'0')+' left · '+n+' present · '+(dSes.level||'—');
    if(dTimer==null&&currentTab==='class')dashStart()}
  const now=Date.now(),list=db.sessions.filter(s=>mine(s)&&!isLive(s)&&now-ends(s)<DAY&&!s._join).sort((a,b)=>ends(b)-ends(a)).slice(0,6);
  const sg=list.map(s=>s.id+s.endsAt).join(',')+'|'+db.attendance.length;
  recent.hidden=!list.length;
  if(sg!==sig){sig=sg;rBox.replaceChildren();list.forEach(s=>{const r=el('div','student'),i=el('div'),b=el('div','btns'),bt=el('button','','Reopen'),n=db.attendance.filter(a=>a.sessionId===s.id).length;bt.type='button';
    i.append(el('strong','',(s.code?s.code+' · ':'')+s.title),el('small','',(s.level||'—')+' · '+n+' present · ended '+new Date(s.endsAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})));
    bt.onclick=()=>reopen(s);b.append(bt);r.append(i,b);rBox.append(r)})}
}

/* ---- starting a new class from the form ---- */
let prev=null;
document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('#createClass');if(!b)return;
  prev=dOpen()?dSes:null;
  if(prev&&!confirm('A class is already live ('+(prev.code||prev.title)+'). End it and start a new one?')){e.stopPropagation();e.preventDefault();prev=null}
},true);
$('createClass').addEventListener('click',()=>{
  if(prev&&dSes!==prev&&prev.id!==(dSes&&dSes.id)){prev.endsAt=new Date().toISOString();save()}
  prev=null;persist();paint()});

/* ---- bring the QR back after screen-off / minimize / restart ---- */
function back(){if(document.hidden)return;if(resume()&&currentTab==='class')dashStart();paint()}
document.addEventListener('visibilitychange',back);
addEventListener('pageshow',back);
addEventListener('focus',back);
setInterval(()=>{if(document.hidden)return;if(currentTab==='class'&&resume()&&dTimer==null&&dOpen())dashStart();paint()},1000);
resume();paint();
})();
