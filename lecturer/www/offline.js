/* FEG-TECH 5.1: "Offline readiness" card on the Class tab (restored from 4.6, adapted to the 5.0 service worker and sync engine).
   Shows what is saved on this phone and lets the lecturer tap "Prepare for offline" on good internet before class.
   Automatic sync when internet returns is handled by sync5.js, so this file only refreshes the card. Loads last. */
(()=>{
"use strict";
const el=(t,c,x)=>{const e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e};
const RK='fc-offline-ready',MU='./vendor/models/',
  LIB='./vendor/face-api.min.js',
  MAN=['tiny_face_detector_model','face_landmark_68_model','face_recognition_model'].map(n=>MU+n+'-weights_manifest.json');
const cfg=()=>{try{return JSON.parse(localStorage.getItem('fc-sync'))||{}}catch{return {}}};
/* Android app: the face engine and models are files inside the app, so check that they can be read */
const has=async u=>{try{const r=await fetch(u,{cache:'no-store'});return r.ok}catch{return false}};
const sync=()=>window.fcSync?window.fcSync():Promise.resolve();

const anchor=document.querySelector('#class .qrcard');if(!anchor)return;
const card=el('div','card'),h=el('h2',null,'Offline readiness'),list=el('div'),msg=el('p','muted',''),btn=el('button',null,'Prepare for offline');
btn.type='button';card.id='offlineCard';card.append(h,list,msg,btn);anchor.after(card);

async function draw(){
  const app=await has('index.html'),lib=await has(LIB),mods=(await Promise.all(MAN.map(has))).every(Boolean);
  const n=(db.students||[]).length,d3=typeof has3d==='function'?db.students.filter(has3d).length:n;
  const t=+localStorage.getItem(RK)||0,online=navigator.onLine,hasSync=!!cfg().url;
  const rows=[
    [app,'App files saved on this phone'],
    [lib,'Face engine saved'],
    [mods,'Face models saved'],
    [n>0&&d3===n,'Roster on this phone: '+n+' student'+(n===1?'':'s')+(n&&d3<n?' ('+(n-d3)+' without 3D face data)':'')],
    [t>0,t?'Last prepared: '+new Date(t).toLocaleString():'Not prepared yet']
  ];
  list.textContent='';
  for(const [ok,txt] of rows){const p=el('p',null,(ok?'\u2713 ':'\u2717 ')+txt);p.style.margin='4px 0';p.style.opacity=ok?'1':'.75';list.append(p)}
  if(!btn.disabled)msg.textContent=online?(hasSync?'Tap the button on good internet before class.':'Connect this phone to online sync first, then tap the button.'):'No internet now. Data on this phone is safe and will sync when internet returns.';
}
btn.onclick=async()=>{
  if(!navigator.onLine)return msg.textContent='You need internet for this step. Do it before class.';
  btn.disabled=true;
  try{
    msg.textContent='Syncing data\u2026';
    if(cfg().url)await sync();
    if(window.fcRoster&&cfg().url){msg.textContent='Saving student list\u2026';try{await window.fcRoster.pull()}catch{}}
    msg.textContent='Saving face models\u2026';
    if(typeof models==='function')await models();
    localStorage.setItem(RK,String(Date.now()));
    btn.disabled=false;await draw();msg.textContent='Done. This phone has what it needs for class.';
  }catch(e){btn.disabled=false;await draw();msg.textContent='Could not finish: '+(e&&e.message||e)}
};

addEventListener('online',()=>setTimeout(draw,2500));
addEventListener('offline',draw);
draw();setInterval(draw,15000);
})();
