"use strict";
/* Student app 4.3: small camera buttons on the live camera (switch front/back, light, improve picture).
   Loads last. Needs student.js (stream, vid) and register.js (the #rv video).
   Improve picture: the preview is brightened a little, and when the room is dark the frames used for face detection and the
   registration photo are brightened too. In normal light the frames are left exactly as the camera gives them. */
(()=>{
const $=id=>document.getElementById(id),vid=$('v'),rvid=$('rv'),reg=$('reg'),EK='fc-enh',DARK=95,TARGET=115;
let enhOn=true,lightOn=false,last=null,gain=1,busy=false;
try{enhOn=localStorage.getItem(EK)!=='0'}catch{}
document.documentElement.classList.toggle('enh',enhOn);
const active=()=>reg.hidden?vid:rvid;
const trk=()=>{try{return stream&&stream.getVideoTracks()[0]||null}catch{return null}};
const caps=t=>{try{return t.getCapabilities?t.getCapabilities():{}}catch{return{}}};

/* ---- picture enhance: measure brightness on a tiny copy, lift dark frames with a gamma curve ---- */
const sm=document.createElement('canvas'),sx=sm.getContext('2d',{willReadFrequently:true}),bg=document.createElement('canvas'),bx=bg.getContext('2d',{willReadFrequently:true});
sm.width=48;sm.height=36;
function meanOf(v){
  if(!v||v.readyState<2||!v.videoWidth)return 128;
  try{sx.drawImage(v,0,0,48,36);const d=sx.getImageData(0,0,48,36).data;let s=0;for(let i=0;i<d.length;i+=4)s+=.299*d[i]+.587*d[i+1]+.114*d[i+2];return s/(d.length/4)}catch{return 128}}
/* returns the video itself when no change is needed, otherwise a canvas with the brightened frame (same size as the video) */
function src(v){
  if(!enhOn||!v||v.readyState<2||!v.videoWidth)return v;
  const m=meanOf(v);if(m>=DARK)return v;
  try{
    const g=Math.max(.5,Math.log(TARGET/255)/Math.log(Math.max(m,20)/255)),lut=new Uint8ClampedArray(256);
    for(let i=0;i<256;i++)lut[i]=255*Math.pow(i/255,g);
    if(bg.width!==v.videoWidth||bg.height!==v.videoHeight){bg.width=v.videoWidth;bg.height=v.videoHeight}
    bx.drawImage(v,0,0);const im=bx.getImageData(0,0,bg.width,bg.height),d=im.data;
    for(let i=0;i<d.length;i+=4){d[i]=lut[d[i]];d[i+1]=lut[d[i+1]];d[i+2]=lut[d[i+2]]}
    bx.putImageData(im,0,0);return bg
  }catch{return v}}
window.fcEnh={src};

/* ---- buttons ---- */
const bars=[];
function mk(emoji,label,fn){const b=document.createElement('button');b.type='button';b.textContent=emoji;b.setAttribute('aria-label',label);b.title=label;b.addEventListener('click',fn);return b}
document.querySelectorAll('.cam').forEach(c=>{
  const bar=document.createElement('div');bar.className='camtools';bar.hidden=true;
  const f=mk('🔄','Switch camera',flip),l=mk('🔦','Light',light),e=mk('✨','Improve picture',enh);
  bar.append(f,l,e);c.append(bar);bars.push({bar,cam:c,l,e})});
let torchHw=false;
function paint(){bars.forEach(b=>{b.l.classList.toggle('on',lightOn);b.l.setAttribute('aria-pressed',String(lightOn));
  b.e.classList.toggle('on',enhOn);b.e.setAttribute('aria-pressed',String(enhOn));
  b.cam.classList.toggle('lit',lightOn&&!torchHw)})}
/* light: the phone's torch when the camera has one (usually the back camera); otherwise a white screen frame that lights the face */
async function applyLight(){
  const t=trk();let hw=false;
  if(t&&caps(t).torch){try{await t.applyConstraints({advanced:[{torch:lightOn}]});hw=lightOn}catch{}}
  torchHw=hw;paint()}
function light(){lightOn=!lightOn;applyLight()}
function enh(){enhOn=!enhOn;try{localStorage.setItem(EK,enhOn?'1':'0')}catch{}
  document.documentElement.classList.toggle('enh',enhOn);if(!enhOn)document.documentElement.style.removeProperty('--g');paint()}
/* switch camera without restarting the scan: the running scan keeps going on the new picture */
async function flip(){
  if(busy||!stream)return;busy=true;
  const old=trk(),from=((old&&old.getSettings&&old.getSettings().facingMode)||(active().classList.contains('rear')?'environment':'user')),to=from==='user'?'environment':'user';
  const get=f=>navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:f},width:{ideal:640},height:{ideal:480}},audio:false});
  try{
    stream.getTracks().forEach(t=>t.stop());
    let ns;try{ns=await get(to)}catch{ns=await get(from)}
    stream=ns;const v=active();v.srcObject=ns;await v.play().catch(()=>{});last=ns;await onStream()
  }catch{}finally{busy=false}}
/* a new camera stream started (by the app or by flip): show the buttons, switch mirroring, ask for steadier focus and exposure */
async function onStream(){
  const t=trk();
  if(!t){bars.forEach(b=>b.bar.hidden=true);torchHw=false;paint();return}
  const c=caps(t),f=(t.getSettings&&t.getSettings().facingMode)||'';
  if(f){vid.classList.toggle('rear',f==='environment');rvid.classList.toggle('rear',f==='environment')}
  const adv={};
  if((c.focusMode||[]).includes('continuous'))adv.focusMode='continuous';
  if((c.exposureMode||[]).includes('continuous'))adv.exposureMode='continuous';
  if((c.whiteBalanceMode||[]).includes('continuous'))adv.whiteBalanceMode='continuous';
  if(Object.keys(adv).length){try{await t.applyConstraints({advanced:[adv]})}catch{}}
  bars.forEach(b=>b.bar.hidden=false);await applyLight()}
function tick(){
  if(document.hidden)return;
  if(stream!==last){last=stream;onStream()}
  if(stream&&enhOn){const m=meanOf(active()),want=m<DARK?Math.min(1.7,Math.max(1,TARGET/Math.max(m,30))):1;
    gain=gain*.6+want*.4;document.documentElement.style.setProperty('--g',gain.toFixed(2))}}
setInterval(tick,500);paint();tick();
/* screen changes: tell the page which screen just appeared so it can slide in (see style.css) */
['home','reg'].forEach(id=>{const el=$(id);if(el)new MutationObserver(()=>{if(!el.hidden)el.classList.add('mv')}).observe(el,{attributes:true,attributeFilter:['hidden']})});
})();
