"use strict";
/* Student registration (done once, at home): 3D face capture (front, left, right) + a small photo, sent to the school server.
   The lecturer approves it on their phone, then the face is used for scanning in class. Needs student.js loaded first. */
(()=>{
const R=id=>document.getElementById(id),reg=R('reg'),home=R('home'),rs=R('rstat'),go=R('rgo'),chk=R('rcheck'),ENR='fc-enr';
const STEPS=[{p:'f',n:3,m:'Look straight at the camera'},{p:'l',n:2,m:'Slowly turn your head LEFT'},{p:'r',n:2,m:'Now slowly turn your head RIGHT'}];
const set=(t,k='')=>{rs.textContent=t;rs.className='msg '+k};
let busy=false,lastSay=0;
const rvid=R('rv');
const det=()=>rvid.readyState<2||!rvid.videoWidth?Promise.resolve([]):faceapi.detectAllFaces((window.fcEnh?fcEnh.src(rvid):rvid),new faceapi.TinyFaceDetectorOptions({inputSize:416,scoreThreshold:.6})).withFaceLandmarks().withFaceDescriptors();
function view(on){reg.hidden=!on;home.hidden=on;if(on){stopCam();courseEl.textContent='';set('');chk.hidden=!localStorage.getItem(ENR)}else{if(!busy)start()}}
R('goReg').onclick=()=>view(true);R('rback').onclick=()=>{if(busy)return;view(false)};
function snap(f){const b=f.detection.box,m=.35,x=Math.max(0,b.x-b.width*m),y=Math.max(0,b.y-b.height*m),
  sw=Math.min(b.width*(1+2*m),rvid.videoWidth-x),sh=Math.min(b.height*(1+2*m),rvid.videoHeight-y),cv=document.createElement('canvas');
  cv.width=160;cv.height=Math.max(1,Math.round(160*sh/sw));cv.getContext('2d').drawImage((window.fcEnh?fcEnh.src(rvid):rvid),x,y,sw,sh,0,0,cv.width,cv.height);return cv.toDataURL('image/jpeg',.55)}
function cue(p){if(p==='f'||Date.now()-lastSay<4000)return;lastSay=Date.now();say(CUE[p])}
async function capture(){
  set('Loading face models…');await models();const tk=await cam('user');
  rvid.srcObject=stream;await rvid.play().catch(()=>{});
  const got=[];let si=0,inStep=0,tries=0,photo='';
  while(si<STEPS.length&&tries<140){
    if(tk!==token)throw Error('Camera stopped. Try again.');
    tries++;const st=STEPS[si],faces=await det();
    let s=st.m+' ('+(inStep+1)+'/'+st.n+')';
    if(faces.length!==1)s=faces.length?'Only one face must be visible.':'No face detected. Improve the lighting.';
    else{const f=faces[0],q=quality(f,st.p!=='f');
      if(q)s=q;
      else if(poseOf(poseRatio(f))!==st.p)s=st.m;
      else{const d=Array.from(f.descriptor),same=got.filter(g=>g.p===st.p),front=got.filter(g=>g.p==='f');
        if(same.every(g=>dist(g.d,d)<(st.p==='f'?.40:.50))&&(st.p==='f'||front.every(g=>dist(g.d,d)<.65))){
          got.push({d,p:st.p});if(!photo&&st.p==='f'&&got.length===3)photo=snap(f);
          inStep++;if(inStep>=st.n){si++;inStep=0}
          s=si<STEPS.length?'✓ Got it. '+STEPS[si].m+' ('+(inStep+1)+'/'+STEPS[si].n+')':'Sending…';
        }else{got.length=0;si=0;inStep=0;photo='';s='A different face was seen. Restarting. Look straight at the camera.'}}}
    set(s);if(si<STEPS.length&&s.startsWith(STEPS[si].m))cue(STEPS[si].p);
    await sleep(350)}
  stopCam();rvid.srcObject=null;
  if(si<STEPS.length)throw Error('Could not finish the capture. Improve the lighting, keep your face large in the frame, and try again.');
  return{faceDescriptors:got.map(g=>round(g.d)),facePoses:got.map(g=>g.p),photo}}
go.onclick=async()=>{
  if(busy)return;
  const name=R('rname').value.trim(),level=R('rlevel').value.trim().toUpperCase(),matric=R('rmatric').value.trim().toUpperCase();
  if(!API)return set('This app is not connected to the school server yet. Tell the department.','error');
  if(name.length<2)return set('Enter your full name.','error');
  if(!/^[A-Z0-9][A-Z0-9\/\-. ]{2,29}$/.test(matric))return set('Enter your matriculation number.','error');
  if(!level)return set('Enter your level.','error');
  busy=true;go.disabled=true;R('rback').disabled=true;
  try{
    const cap=await capture();
    set('Sending to the school server…');
    const r=await callOnline('/s/enroll',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,matric,level,code:R('rcode').value.trim(),...cap})});
    if(!r.ok){if(/enrolment code/i.test(r.err))R('rcodeBox').hidden=false;throw Error(r.err)}
    localStorage.setItem(ENR,r.d.ticket);chk.hidden=false;
    set('✓ Sent. Your lecturer must approve it. Tap "Check my registration" later.','success');say('Registration sent')
  }catch(e){stopCam();rvid.srcObject=null;set(e.name==='NotAllowedError'?'Camera permission was denied. Allow the camera for this site, then try again.':e.message,'error')}
  finally{busy=false;go.disabled=false;R('rback').disabled=false}};
chk.onclick=async()=>{
  const t=localStorage.getItem(ENR);if(!t)return set('Nothing to check yet.','error');
  const r=await callOnline('/s/enrolstatus?ticket='+t);
  if(!r.ok)return set(r.err,'error');
  if(r.d.state==='pending')return set('Still waiting for your lecturer to approve.');
  if(r.d.state==='gone'){localStorage.removeItem(ENR);chk.hidden=true;return set('This request was not found. Register again.','error')}
  const x=r.d.res||{};
  if(x.ok){localStorage.removeItem(ENR);chk.hidden=true;return set('✓ '+(x.msg||'Registered. You can scan in class.'),'success')}
  localStorage.removeItem(ENR);chk.hidden=true;set(x.msg||'Not approved. See your lecturer.','error')};
window.addEventListener('pagehide',()=>{rvid.srcObject=null});
})();
