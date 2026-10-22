"use strict";
const MODEL_URL='./vendor/models'; /* saved inside the app (downloaded when the APK is built) */
// --- Tuning knobs -----------------------------------------------------------
const CONFIRM_FRAMES=3;   // consecutive straight-on frames that must agree
const TURN_CONFIRM=2;     // frames that must agree on the turned view
const TURN_MISSES=3;      // wrong frames tolerated on the turned view before failing
const TURN_TIMEOUT=9000;  // ms allowed to complete the head turn
const MARGIN=0.10, SIDE_MARGIN=0.08, SIDE_EXTRA=0.08; // turned views vary more, so slightly looser
const MIN_SCORE=0.70, MIN_FACE=0.22;
const SCAN_SIZE=320, TURN_SIZE=416, ENROLL_SIZE=416;
// -----------------------------------------------------------------------------
let stream=null,modelsReady=false,loading=null,scanning=false,locked=false,scanToken=0,seenId=null,seenCount=0,enrolling=false;
let phase='front',candidate=null,turnDir='l',turnStart=0,turnCount=0,turnMiss=0;
const regVideo=document.getElementById('registerVideo'),scanVideo=document.getElementById('scanVideo');
const regStatus=document.getElementById('registerStatus'),result=document.getElementById('scanResult'),next=document.getElementById('nextScan');
const strictSel=document.getElementById('strictness'),modeSel=document.getElementById('scanMode');
function remember(sel,key){try{const v=localStorage.getItem(key);if(v&&[...sel.options].some(o=>o.value===v))sel.value=v}catch{}sel.onchange=()=>{try{localStorage.setItem(key,sel.value)}catch{}}}
remember(strictSel,'facecheck-strictness');remember(modeSel,'facecheck-scanmode');
const threshold=()=>Number(strictSel.value)||.45, mode=()=>modeSel.value==='fast'?'fast':'3d';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function message(msg,kind=''){result.textContent=msg;result.className='result '+kind}
// Spoken head-turn cues (Web Speech API). Same cue is not repeated more often than every `gap` ms.
const CUE={f:'Look straight at the camera',l:'Turn your head left',r:'Turn your head right'};
let lastSay='',lastSayAt=0;
function say(text,gap=3500){try{if(!('speechSynthesis'in window))return;const now=Date.now();if(text===lastSay&&now-lastSayAt<gap)return;lastSay=text;lastSayAt=now;speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.rate=.95;u.volume=1;speechSynthesis.speak(u)}catch{}}
function stopSay(){try{if('speechSynthesis'in window)speechSynthesis.cancel()}catch{}lastSay='';lastSayAt=0}
// Some phones only allow speech after a tap: prime it on the first touch.
document.addEventListener('pointerdown',()=>{try{if('speechSynthesis'in window){const u=new SpeechSynthesisUtterance('');u.volume=0;speechSynthesis.speak(u)}}catch{}},{once:true});

async function models(){if(modelsReady)return;if(!loading)loading=(async()=>{if(!window.faceapi)throw Error('Recognition library unavailable. Check internet and reload.');await Promise.all([faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)]);modelsReady=true})().catch(e=>{loading=null;throw e});return loading}
let facing=(()=>{try{return localStorage.getItem('attendance-cam')==='environment'?'environment':'user'}catch{return 'user'}})(),torchOn=false;
async function start(video){if(!navigator.mediaDevices?.getUserMedia)throw Error('Camera requires HTTPS or localhost.');if(!stream)stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:facing},width:{ideal:640},height:{ideal:480}},audio:false});video.srcObject=stream;applyMirror();await video.play()}
function stop(){scanToken++;scanning=false;if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}regVideo.srcObject=null;scanVideo.srcObject=null;torchOn=false;updateTorchUI()}
// ---- camera controls: front/back switch and flash (torch)
let toastTimer=0;
function toast(t){const e=document.getElementById('toast');if(!e)return;e.textContent=t;e.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>e.classList.remove('show'),3200)}
function applyMirror(){[regVideo,scanVideo].forEach(v=>v.classList.toggle('rear',facing==='environment'))}
function updateTorchUI(){document.querySelectorAll('[data-cam=torch]').forEach(b=>{b.classList.toggle('on',torchOn);b.setAttribute('aria-pressed',torchOn)})}
async function switchCamera(){
  if(enrolling){toast('Wait for the face capture to finish, then switch camera.');return}
  const prev=facing;facing=facing==='user'?'environment':'user';torchOn=false;updateTorchUI();applyMirror();
  try{localStorage.setItem('attendance-cam',facing)}catch{}
  if(!stream){toast(facing==='environment'?'Back camera will be used when you open the camera.':'Front camera will be used when you open the camera.');return}
  const video=currentTab==='scan'?scanVideo:regVideo,old=stream;stream=null;old.getTracks().forEach(t=>t.stop());
  try{await start(video);toast(facing==='environment'?'Back camera on.':'Front camera on.')}
  catch(e){facing=prev;applyMirror();try{localStorage.setItem('attendance-cam',facing)}catch{}try{await start(video)}catch{}toast('Could not switch camera on this device.')}
}
const hasTorch=t=>{try{return !!(t&&t.getCapabilities&&t.getCapabilities().torch)}catch{return false}};
// Phones with several back cameras may open one without a flash: look for one that has a torch.
async function findTorchStream(){
  try{const devs=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='videoinput'&&!/front|user|selfie/i.test(d.label||''));
    for(const d of devs){try{const s=await navigator.mediaDevices.getUserMedia({video:{deviceId:{exact:d.deviceId},width:{ideal:640},height:{ideal:480}},audio:false});if(hasTorch(s.getVideoTracks()[0]))return s;s.getTracks().forEach(x=>x.stop())}catch{}}}catch{}
  return null;
}
async function toggleTorch(){
  if(!stream||!stream.getVideoTracks()[0]){toast('Open the camera first.');return}
  const video=currentTab==='scan'?scanVideo:regVideo;
  if(!hasTorch(stream.getVideoTracks()[0])){
    if(facing==='user'){toast('The front camera has no flash. Use the switch-camera button to use the back camera.');return}
    toast('Looking for the camera that has a flash…');
    const old=stream;stream=null;old.getTracks().forEach(t=>t.stop());
    const s=await findTorchStream();
    if(s){stream=s;video.srcObject=s;applyMirror();try{await video.play()}catch{}}
    else{try{await start(video)}catch{}toast('This phone or browser does not allow flash control from a web app (iPhones never do). Use the phone\'s own torch or a brighter room.');return}
  }
  const t=stream.getVideoTracks()[0],want=!torchOn;
  try{
    await t.applyConstraints({advanced:[{torch:want}]});
    const st=(t.getSettings&&t.getSettings())||{};
    if('torch' in st&&st.torch!==want)throw Error('torch not applied');
    torchOn=want;updateTorchUI();toast(torchOn?'Flash on.':'Flash off.');
  }catch{torchOn=false;updateTorchUI();toast('Could not turn the flash on. Try the back camera.')}
}
document.querySelectorAll('[data-cam=switch]').forEach(b=>b.onclick=switchCamera);
document.querySelectorAll('[data-cam=torch]').forEach(b=>b.onclick=toggleTorch);
applyMirror();
async function detect(video,size){if(video.readyState<2||!video.videoWidth)return [];return faceapi.detectAllFaces(video,new faceapi.TinyFaceDetectorOptions({inputSize:size,scoreThreshold:.6})).withFaceLandmarks().withFaceDescriptors()}

// ---- Head pose from landmarks (nose position between the two jaw edges) ----
// ratio ~0.5 = straight; high = user's LEFT (screen is mirrored); low = user's RIGHT.
const poseRatio=f=>{const p=f.landmarks.positions;return (p[30].x-p[0].x)/(p[16].x-p[0].x)};
const poseOf=r=>r>.40&&r<.60?'f':r>=.64?'l':r<=.36?'r':null;
const DIR_MSG={l:'Now slowly turn your head LEFT',r:'Now slowly turn your head RIGHT'};

// Reject blurry / tiny / cut-off faces (and, when not turning, sideways faces).
function quality(f,video,turning){
  const b=f.detection.box,vw=video.videoWidth,vh=video.videoHeight;
  if(f.detection.score<(turning?.6:MIN_SCORE))return 'Hold still and improve the lighting.';
  if(b.width<vw*(turning?.16:MIN_FACE))return 'Move closer to the camera.';
  if(b.x<-4||b.y<-4||b.x+b.width>vw+4||b.y+b.height>vh+4)return 'Keep your whole face inside the frame.';
  if(!turning&&poseOf(poseRatio(f))!=='f')return 'Look straight at the camera.';
  return null;
}

// ---- Matching ---------------------------------------------------------------
const dist=(a,b)=>Math.sqrt(a.reduce((v,x,i)=>v+(x-b[i])**2,0));
const mean=ds=>ds[0].map((_,i)=>ds.reduce((v,d)=>v+d[i],0)/ds.length);
const round=d=>Array.from(d,x=>+x.toFixed(4));
const samplesOf=s=>{const arr=Array.isArray(s.faceDescriptors)&&s.faceDescriptors.length?s.faceDescriptors:(Array.isArray(s.faceDescriptor)?[s.faceDescriptor]:[]);return arr.map((d,i)=>({d,p:(s.facePoses&&s.facePoses[i])||'f'}))};
const has3d=s=>{const p=samplesOf(s).map(x=>x.p);return p.includes('l')&&p.includes('r')};
// Compare only against samples taken from the SAME head angle; average the 2 closest.
function studentDist(s,d,pose){const ds=samplesOf(s).filter(x=>x.p===pose&&x.d.length===d.length).map(x=>dist(x.d,d)).sort((a,b)=>a-b);if(!ds.length)return Infinity;const k=Math.min(2,ds.length);return ds.slice(0,k).reduce((a,b)=>a+b,0)/k}
function rank(d,pose){return db.students.map(s=>({s,dist:studentDist(s,d,pose)})).filter(m=>isFinite(m.dist)).sort((a,b)=>a.dist-b.dist)}

// ---- Registration: guided 3D capture (front, left, right) --------------------
const STEPS=[{p:'f',n:3,msg:'Look straight at the camera'},{p:'l',n:2,msg:'Slowly turn your head LEFT'},{p:'r',n:2,msg:'Now slowly turn your head RIGHT'}];
document.getElementById('registerCamera').onclick=async()=>{try{regStatus.textContent='Loading face models…';await models();await start(regVideo);regStatus.textContent='Camera ready. Position one face in the frame.'}catch(e){regStatus.textContent=e.message}};
document.getElementById('saveFace').onclick=async()=>{
  if(enrolling)return;
  const name=document.getElementById('studentName').value.trim();if(!document.getElementById('studentLevel').value.trim()){regStatus.textContent='Enter the student level first.';return}
  if(!name)return regStatus.textContent='Enter a student name first.';
  const existing=db.students.find(s=>s.name.toLowerCase()===name.toLowerCase());
  if(existing&&!confirm('"'+existing.name+'" is already registered. Replace their saved face data with a new 3D capture?'))return;
  const btn=document.getElementById('saveFace');enrolling=true;btn.disabled=true;
  try{
    if(!stream)throw Error('Open camera first.');
    const got=[];let si=0,inStep=0,tries=0;
    while(si<STEPS.length&&tries<90){
      tries++;
      if(!stream||currentTab!=='register')throw Error('Camera stopped. Try again.');
      const st=STEPS[si],faces=await detect(regVideo,ENROLL_SIZE);
      let status=st.msg+' ('+(inStep+1)+'/'+st.n+')';
      if(faces.length!==1)status=faces.length?'Only one face must be visible.':'No face detected. Improve lighting.';
      else{
        const f=faces[0],q=quality(f,regVideo,st.p!=='f');
        if(q)status=q;
        else if(poseOf(poseRatio(f))!==st.p)status=st.msg;
        else{
          const d=Array.from(f.descriptor),same=got.filter(g=>g.p===st.p),front=got.filter(g=>g.p==='f');
          if(same.every(g=>dist(g.d,d)<(st.p==='f'?.40:.50))&&(st.p==='f'||front.every(g=>dist(g.d,d)<.65))){
            got.push({d,p:st.p});inStep++;if(inStep>=st.n){si++;inStep=0}
            status=si<STEPS.length?'✓ Got it. '+STEPS[si].msg+' ('+(inStep+1)+'/'+STEPS[si].n+')':'Saving…';
          }else{got.length=0;si=0;inStep=0;status='A different face was seen. Restarting — look straight at the camera.'}
        }
      }
      regStatus.textContent=status;
      if(si<STEPS.length&&(status.startsWith(STEPS[si].msg)||status.startsWith('✓ Got it')))say(CUE[STEPS[si].p],4000);
      await sleep(350);
    }
    if(si<STEPS.length)throw Error('Could not finish the 3D capture. Improve lighting, keep your face large in the frame, and try again.');
    const avg=mean(got.filter(g=>g.p==='f').map(g=>g.d)),others=db.students.filter(s=>s!==existing).map(s=>({s,d:studentDist(s,avg,'f')})).filter(m=>isFinite(m.d)).sort((a,b)=>a.d-b.d),close=others[0];
    if(close&&close.d<.45)throw Error('This face looks the same as "'+close.s.name+'" who is already registered.');
    if(close&&close.d<.55&&!confirm('This face is quite similar to "'+close.s.name+'". The scanner may confuse them. Register anyway?'))throw Error('Registration cancelled.');
    const rec={faceDescriptor:round(avg),faceDescriptors:got.map(g=>round(g.d)),facePoses:got.map(g=>g.p),enrolledAt:new Date().toISOString()};
    var lv=document.getElementById('studentLevel').value.trim().toUpperCase();var mt=((document.getElementById('studentMatric')||{}).value||'').trim().toUpperCase();var co=((document.getElementById('studentCarry')||{}).value||'').split(/[,;\s]+/).map(function(x){return x.trim().toUpperCase()}).filter(Boolean);if(existing)Object.assign(existing,rec,{level:lv},mt?{matric:mt}:{},co.length?{co:co}:{});else db.students.push({id:uid(),name,level:lv,matric:mt,co:co,...rec});
    save();document.getElementById('studentName').value='';if(document.getElementById('studentMatric'))document.getElementById('studentMatric').value='';if(document.getElementById('studentCarry'))document.getElementById('studentCarry').value='';regStatus.textContent='✓ '+name+' registered with 3D face data.';say('Registered successfully',0);
  }catch(e){regStatus.textContent=e.message}
  finally{enrolling=false;btn.disabled=false}
};

// ---- Scanning ------------------------------------------------------------------
function resetScan(){seenId=null;seenCount=0;phase='front';candidate=null;turnCount=0;turnMiss=0}
async function onTabChange(tab){stopSay();stop();locked=false;resetScan();next.disabled=true;if(tab==='scan'){if(!sessionOpen()){message('No class is running. Ask your lecturer to start one.','error');return}if(!db.students.some(s=>samplesOf(s).length)){message('No students registered yet. Ask your lecturer.','error');return}try{message('Starting camera and loading face models…');await models();if(currentTab!=='scan')return;await start(scanVideo);if(currentTab!=='scan'){stop();return}message('Look straight at the camera…');scanning=true;const token=++scanToken;scanLoop(token)}catch(e){message(e.message,'error')}}}

function finish(s,d,method){
  locked=true;const session=currentSession();
  const already=db.attendance.some(a=>a.sessionId===session.id&&a.studentId===s.id);
  if(!already){db.attendance.push({id:uid(),studentId:s.id,sessionId:session.id,at:new Date().toISOString(),method,distance:+d.toFixed(4)});save()}
  message('✓ '+s.name+' — '+(already?'Already present':'Marked present'),'success');say('Successful',0);next.disabled=false;
}
function frontStep(faces){
  if(faces.length!==1){seenId=null;seenCount=0;return message(faces.length>1?'One student at a time.':'Look straight at the camera…')}
  const q=quality(faces[0],scanVideo,false);if(q){seenId=null;seenCount=0;return message(q)}
  const ranked=rank(Array.from(faces[0].descriptor),'f'),best=ranked[0],second=ranked[1];
  if(best&&best.dist<threshold()&&(!second||second.dist-best.dist>=MARGIN)){
    if(seenId===best.s.id)seenCount++;else{seenId=best.s.id;seenCount=1}
    if(seenCount<CONFIRM_FRAMES)return message('Recognising…');
    if(mode()==='fast')return finish(best.s,best.dist,'face');
    if(!has3d(best.s)){locked=true;next.disabled=false;return message(best.s.name+' needs 3D re-registration (tab 1), or set Scan mode to Fast in tab 2.','error')}
    phase='turn';candidate=best.s;turnDir=Math.random()<.5?'l':'r';turnStart=Date.now();turnCount=0;turnMiss=0;message(DIR_MSG[turnDir]);say(CUE[turnDir]);
  }else{seenId=null;seenCount=0;message('Face not recognised. Hold still and face the camera.','error')}
}
function turnStep(faces){
  if(faces.length>1)return message('One student at a time.');
  if(!faces.length){say(CUE[turnDir]);return message(DIR_MSG[turnDir])}
  const f=faces[0],q=quality(f,scanVideo,true);if(q)return message(q);
  const p=poseOf(poseRatio(f));
  if(p!==turnDir){turnCount=0;say(CUE[turnDir]);return message(p==='f'||p===null?DIR_MSG[turnDir]:'Turn the OTHER way — '+DIR_MSG[turnDir].replace('Now s','s'))}
  const ranked=rank(Array.from(f.descriptor),turnDir),best=ranked[0],second=ranked[1];
  if(best&&best.s.id===candidate.id&&best.dist<threshold()+SIDE_EXTRA&&(!second||second.dist-best.dist>=SIDE_MARGIN)){
    if(++turnCount>=TURN_CONFIRM)finish(candidate,best.dist,'face-3d');
  }else if(++turnMiss>=TURN_MISSES){resetScan();message('3D check failed — face did not match when turned. Try again.','error')}
}
async function scanLoop(token){
  while(scanning&&token===scanToken&&currentTab==='scan'&&!locked){
    if(!sessionOpen()){message('Class duration has ended. Start a new class.','error');break}
    try{
      if(phase==='turn'&&Date.now()-turnStart>TURN_TIMEOUT){resetScan();message('Head turn not detected in time. Look straight and try again.','error');await sleep(800);continue}
      const faces=await detect(scanVideo,phase==='turn'?TURN_SIZE:SCAN_SIZE);
      if(token!==scanToken||locked)break;
      if(phase==='turn')turnStep(faces);else frontStep(faces);
    }catch(e){message('Scan error: '+e.message,'error');await sleep(700)}
    await sleep(60);
  }
  scanning=false;
}
next.onclick=()=>{if(!sessionOpen()){message('Class has ended.','error');return}locked=false;resetScan();next.disabled=true;message('Ready for next student…');scanning=true;scanLoop(++scanToken)};
window.addEventListener('pagehide',stop);
