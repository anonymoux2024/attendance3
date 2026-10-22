"use strict";
/* ATTENDANCE Student app: scan the class QR, then the face. Only face numbers (never photos) leave this phone, and the lecturer's phone decides. */
const MODEL_URL='./vendor/models'; /* saved inside the app (downloaded when the APK is built) */
const MIN_SCORE=.70,MIN_FACE=.22,TURN_MS=12000;
const $=id=>document.getElementById(id),vid=$('v'),msgEl=$('msg'),courseEl=$('course'),again=$('again');
const API=String(window.FC_API||'').replace(/\/+$/,''); /* fixed in config.js; a link can no longer redirect face data elsewhere */
let stream=null,token=0,loading=null;
/* ---- 6.0 Android app: the class can also be on the lecturer's phone (QR starting FL1|) over the hotspot, with no internet ---- */
let base=API,wifiBound=false; /* base = where join/submit/result go: the school server, or the lecturer's phone */
const LOCAL_RE=/^(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}):\d{2,5}$/; /* private addresses only, so a QR code can never send face data to the internet */
const WB=()=>{const C=window.Capacitor;return C&&C.isNativePlatform&&C.isNativePlatform()?((C.Plugins&&C.Plugins.WifiBind)||(C.registerPlugin&&C.registerPlugin('WifiBind'))):null};
async function useLocal(host){base='http://'+host;if(!wifiBound){wifiBound=true;const w=WB();if(w){try{await w.bind()}catch{}}}}
function useOnline(){base=API;if(wifiBound){wifiBound=false;const w=WB();if(w){try{w.unbind()}catch{}}}}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const msg=(t,k='')=>{msgEl.textContent=t;msgEl.className='msg '+k};
const CUE={l:'Turn your head left',r:'Turn your head right'},TURN={l:'Now slowly turn your head LEFT',r:'Now slowly turn your head RIGHT'};
function say(t){try{if(!('speechSynthesis'in window))return;speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(t);u.rate=.95;speechSynthesis.speak(u)}catch{}}
function stopCam(){token++;if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}vid.srcObject=null}
async function cam(facing){stopCam();if(!navigator.mediaDevices?.getUserMedia)throw Error('The camera needs a secure (https) connection.');stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:facing},width:{ideal:640},height:{ideal:480}},audio:false});vid.classList.toggle('rear',facing==='environment');vid.srcObject=stream;await vid.play();return token}
function models(){return loading||(loading=(async()=>{if(!window.faceapi)throw Error('Face library did not load. Check your internet and reload.');await Promise.all([faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)])})().catch(e=>{loading=null;throw e}))}
const detect=size=>vid.readyState<2||!vid.videoWidth?Promise.resolve([]):faceapi.detectAllFaces((window.fcEnh?fcEnh.src(vid):vid),new faceapi.TinyFaceDetectorOptions({inputSize:size,scoreThreshold:.6})).withFaceLandmarks().withFaceDescriptors();
/* same head-pose and quality rules as the staff app, so the face numbers match what was registered */
const poseRatio=f=>{const p=f.landmarks.positions;return(p[30].x-p[0].x)/(p[16].x-p[0].x)};
const poseOf=r=>r>.40&&r<.60?'f':r>=.64?'l':r<=.36?'r':null;
function quality(f,turning){const b=f.detection.box,vw=vid.videoWidth,vh=vid.videoHeight;
  if(f.detection.score<(turning?.6:MIN_SCORE))return 'Hold still and improve the lighting.';
  if(b.width<vw*(turning?.16:MIN_FACE))return 'Move closer to the camera.';
  if(b.x<-4||b.y<-4||b.x+b.width>vw+4||b.y+b.height>vh+4)return 'Keep your whole face inside the frame.';
  if(!turning&&poseOf(poseRatio(f))!=='f')return 'Look straight at the camera.';return null}
const dist=(a,b)=>Math.sqrt(a.reduce((v,x,i)=>v+(x-b[i])**2,0));
const mean=ds=>ds[0].map((_,i)=>ds.reduce((v,d)=>v+d[i],0)/ds.length);
const round=d=>Array.from(d,x=>+x.toFixed(4));
async function req(b,path,opt){try{const r=await fetch(b+path,opt),j=await r.json().catch(()=>({}));return r.ok?{ok:true,d:j}:{ok:false,err:r.status===404&&j.error==='not found'?'The school server has not been updated yet. Ask the department to deploy the latest worker.js.':j.error||'Server error '+r.status}}catch{return{ok:false,net:true,err:b===API?'No internet connection to the school server.':'Cannot reach the lecturer\'s phone. Join the lecturer\'s hotspot Wi-Fi, keep the lecturer\'s app open, and try again.'}}}
const call=(path,opt)=>req(base,path,opt),callOnline=(path,opt)=>req(API,path,opt); /* call: the class (server or lecturer phone). callOnline: always the school server (registration, student list) */
function reader(){let det=null;if('BarcodeDetector'in window){try{det=new BarcodeDetector({formats:['qr_code']})}catch{}}
  if(!det&&typeof jsQR!=='function')return null;const cv=document.createElement('canvas'),cx=cv.getContext('2d',{willReadFrequently:true});
  return async()=>{if(det){try{const r=await det.detect(vid);if(r.length)return r.map(c=>c.rawValue)}catch{}}
    if(typeof jsQR==='function'&&vid.videoWidth){const k=Math.min(1,720/vid.videoWidth);cv.width=Math.round(vid.videoWidth*k);cv.height=Math.round(vid.videoHeight*k);cx.drawImage(vid,0,0,cv.width,cv.height);const im=cx.getImageData(0,0,cv.width,cv.height),c=jsQR(im.data,im.width,im.height,{inversionAttempts:'attemptBoth'});if(c&&c.data)return[c.data]}return[]}}
function fail(t){stopCam();useOnline();msg(t,'error');again.hidden=false}

async function start(){
  again.hidden=true;courseEl.textContent='';useOnline();
  models().catch(()=>{});
  try{msg('Starting camera…');const tk=await cam('environment'),read=reader();
    if(!read)return msg('QR reader could not load. Check your internet and reload.','error');
    msg('Point the camera at the class QR code');let last='';
    while(tk===token){const vals=await read();
      for(const raw of vals){
        const isL=String(raw).startsWith('FL1|'),isO=String(raw).startsWith('FC2|');
        if(!isL&&!isO){if(last!=='x'){last='x';msg('That is not a class QR code for this app.','error')}continue}
        if(isL){const host=String(raw).split('|')[1]||'';if(!LOCAL_RE.test(host)){if(last!=='h'){last='h';msg('This QR code has an invalid hotspot address.','error')}continue}await useLocal(host)}
        else{if(!API){if(last!=='n'){last='n';msg('This app is not connected to the school server yet. Tell the department.','error')}continue}useOnline()}
        const r=await call('/s/join?q='+encodeURIComponent(raw));
        if(tk!==token)return;
        if(r.ok)return face(r.d);
        if(r.err!==last){last=r.err;msg(r.err,'error')}}
      await sleep(vals.length?900:200)}
  }catch(e){msg(e.name==='NotAllowedError'?'Camera permission was denied. Allow the camera for this site, then reload.':e.message,'error')}}

async function face(d){
  courseEl.textContent=(d.code?d.code+' · ':'')+d.title+(d.level?' · '+d.level:'');
  try{
    msg('Loading face models…');await models();const tk=await cam('user'),t0=Date.now();
    let phase='front',front=[],side=[],ts=0,fm=null;msg('Look straight at the camera');
    while(tk===token){
      if(Date.now()-t0>(d.ttl-10)*1000)return fail('This took too long. Scan the QR code again.');
      if(phase==='turn'&&Date.now()-ts>TURN_MS)return fail('Head turn not detected in time. Scan the QR code again.');
      const faces=await detect(phase==='turn'?416:320);if(tk!==token)return;
      if(faces.length!==1){msg(faces.length?'One face only, please.':phase==='turn'?TURN[d.turn]:'Look straight at the camera…');await sleep(120);continue}
      const f=faces[0],q=quality(f,phase==='turn'),desc=Array.from(f.descriptor);
      if(q){msg(q);await sleep(100);continue}
      if(phase==='front'){
        front=front.every(x=>dist(x,desc)<.40)?[...front,desc]:[desc];msg('Hold still…');
        if(front.length>=3){fm=mean(front);phase='turn';ts=Date.now();msg(TURN[d.turn]);say(CUE[d.turn])}
      }else{
        if(poseOf(poseRatio(f))!==d.turn){side=[];msg(TURN[d.turn]);say(CUE[d.turn]);await sleep(150);continue}
        if(dist(fm,desc)>.65){side=[];msg('Keep the same face in the frame.');continue}
        side=side.every(x=>dist(x,desc)<.50)?[...side,desc]:[desc];
        if(side.length>=2){stopCam();msg('Checking with your lecturer…');
          const r=await call('/s/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ticket:d.ticket,front:round(fm),side:round(mean(side))})});
          if(!r.ok)return fail(r.err);return wait(d.ticket)}}
      await sleep(60)}
  }catch(e){fail(e.name==='NotAllowedError'?'Camera permission was denied. Allow the camera for this site, then reload.':e.message)}}

async function wait(ticket){
  const end=Date.now()+45000;msg('Checking with your lecturer…');
  while(Date.now()<end){await sleep(1500);const r=await call('/s/result?ticket='+ticket);
    if(r.ok&&r.d.state==='done'){const x=r.d.res||{};if(x.ok){msg('✓ '+(x.name?x.name+' — ':'')+x.msg,'success');say('Successful');useOnline();again.hidden=false;return}return fail(x.msg||'Not accepted. Scan the QR code again.')}
    if(r.ok&&r.d.state==='gone')return fail('Your scan session expired. Scan the QR code again.');
    if(!r.ok&&r.net)msg(r.err)}
  fail('No reply from your lecturer\'s phone. Make sure the lecturer\'s QR screen is open, then scan again.')}

again.onclick=start;window.addEventListener('pagehide',()=>{stopCam();useOnline()});start();
