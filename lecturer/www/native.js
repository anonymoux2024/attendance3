/* FEG-TECH 6.0 (Android app): things a phone browser does by itself but an app window cannot:
   saving/sharing files (CSV export, backup), printing, and sharing the sync details. Loads before local.js. */
(()=>{
"use strict";
const Cap=window.Capacitor;
if(!(Cap&&Cap.isNativePlatform&&Cap.isNativePlatform()))return;
const P=n=>(Cap.Plugins&&Cap.Plugins[n])||(Cap.registerPlugin&&Cap.registerPlugin(n));
const FS=P('Filesystem'),SH=P('Share'),PR=P('NativePrint');
const toast=t=>{const e=document.getElementById('toast');if(!e)return alert(t);e.textContent=t;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),3500)};
const b64=blob=>new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(String(r.result).split(',')[1]||'');r.onerror=()=>rej(r.error);r.readAsDataURL(blob)});

/* download(name,data,type): write the file, then open the Android share sheet (Save to Drive / Files, WhatsApp, e-mail...) */
window.download=async function(filename,data,type){
  try{
    const name=String(filename||'file').replace(/[^\w.\- ]+/g,'_');
    let w;
    if(typeof data==='string')w=await FS.writeFile({path:name,data,directory:'CACHE',encoding:'utf8'});
    else w=await FS.writeFile({path:name,data:await b64(data instanceof Blob?data:new Blob([data],{type})),directory:'CACHE'});
    await SH.share({title:name,text:name,url:w.uri,dialogTitle:'Save or share '+name});
  }catch(e){const m=String(e&&e.message||e);if(!/cancel/i.test(m))toast('Could not save the file: '+m)}};

/* printing: the Android print screen has "Save as PDF" */
window.print=()=>{PR.print({name:'Attendance'}).catch(e=>toast('Could not open printing: '+(e&&e.message||e)))};

/* "Share link" in Online Sync: a link cannot open the app, so share the sync address and key as text to paste on the other phone */
const sb=document.getElementById('syncShare');
if(sb)sb.onclick=async()=>{
  let c={};try{c=JSON.parse(localStorage.getItem('fc-sync'))||{}}catch{}
  const st=document.getElementById('syncStatus');
  if(!c.url){if(st)st.textContent='Save the sync URL first.';return}
  try{await SH.share({title:'ATTENDANCE sync',text:'ATTENDANCE sync details\nSync URL: '+c.url+(c.key?'\nAccess key: '+c.key:'')+'\n\nOn the other phone: HOD > Reports > Online Sync & Settings, paste both, then tap Save & test.',dialogTitle:'Share sync details'})}
  catch(e){if(!/cancel/i.test(String(e&&e.message||e)))toast('Could not share: '+(e&&e.message||e))}};
})();
