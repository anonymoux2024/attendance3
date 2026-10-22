/* Launch screen, PIN, Access Granted, Teacher Dashboard QR, student QR+face flow. Uses globals from app.js, face.js, hod.js. */
const PIN_CODE='1234',QR_TTL=20,QR_ROT=10;
let qrAct=null,qrTok=0,qrKey='',qrPend=null,dSes=null,dSeq=0,dLeft=0,dTimer=null,qrUsed=new Set;
try{qrUsed=new Set(JSON.parse(localStorage.getItem('fc-used')||'[]'))}catch{}
currentSession=()=>db.sessions.find(s=>s.id===qrAct)||db.sessions.at(-1)||null;
const qot=onTabChange;onTabChange=async t=>{if(t==='scan'){await qot('none');return}return qot(t)};
const qsw=switchTab;switchTab=async t=>{qrTok++;const st=t==='scan';document.body.classList.toggle('student',st);document.body.classList.toggle('armed',st);$('tapMsg').textContent='';await qsw(t);if(t==='hod')renderHod();if(t==='class')dashShow();else dashStop()};
/* ---- student: QR then face ---- */
function qrParse(raw){const p=String(raw).split('|');if(p[0]!=='FC1'||p.length<8)return null;return{id:p[1],code:p[2],level:p[3],ts:parseInt(p[4],36),seq:p[5],end:parseInt(p[6],36),name:p.slice(7).join('|')}}
function qrCheck(raw){const q=qrParse(raw);if(!q)return 'That is not a class QR code.';const now=Date.now()/1000;if(now>q.end)return 'This class has ended.';if(Math.abs(now-q.ts)>QR_TTL)return 'QR code expired. Scan the new one (check your phone date and time are automatic).';if(qrUsed.has(q.id+':'+q.seq))return 'This QR code was already used. Wait for the next one.';qrPend=q;return true}
function qrJoin(q){let s=db.sessions.find(x=>x.id===q.id);if(!s){s={id:q.id,title:q.name,code:q.code,level:q.level,duration:Math.max(1,Math.round((q.end-q.ts)/60)),created:new Date(q.ts*1000).toISOString(),endsAt:new Date(q.end*1000).toISOString()};db.sessions.push(s);save()}qrAct=s.id;qrKey=q.id+':'+q.seq}
/* Reads QR codes from a video: native BarcodeDetector when present, otherwise the jsQR library (iPhone, Firefox, desktop). */
function qrReader(video){
  let det=null;if('BarcodeDetector' in window){try{det=new BarcodeDetector({formats:['qr_code']})}catch{}}
  if(!det&&typeof jsQR!=='function')return null;
  const cv=document.createElement('canvas'),cx=cv.getContext('2d',{willReadFrequently:true});
  return async()=>{
    if(det){try{const r=await det.detect(video);if(r.length)return r.map(c=>c.rawValue)}catch{}}
    if(typeof jsQR==='function'&&video.videoWidth){
      const k=Math.min(1,720/video.videoWidth);cv.width=Math.round(video.videoWidth*k);cv.height=Math.round(video.videoHeight*k);
      cx.drawImage(video,0,0,cv.width,cv.height);const im=cx.getImageData(0,0,cv.width,cv.height),c=jsQR(im.data,im.width,im.height,{inversionAttempts:'attemptBoth'});
      if(c&&c.data)return [c.data]}
    return []}}
async function qrPhase(){
  stop();locked=false;resetScan();next.disabled=true;const tk=++qrTok;
  try{message('Starting camera…');facing='environment';await start(scanVideo);
    const read=qrReader(scanVideo);
    if(!read){message('QR reader could not load. Check your internet connection and reload the app.','error');return}
    message('Point the camera at the class QR code…');let last='';
    while(tk===qrTok&&currentTab==='scan'){const vals=await read();for(const raw of vals){const e=qrCheck(raw);if(e===true){qrJoin(qrPend);stop();facing='user';message('Class found. Now look at the camera…');await qot('scan');return}if(e!==last){last=e;message(e,'error')}}await sleep(vals.length?600:200)}
  }catch(e){message(e.name==='NotAllowedError'?'Camera permission was denied. Allow the camera for this site and tap Scan Now again.':e.message,'error')}}
$('tapScan').onclick=()=>{document.body.classList.remove('armed');qrPhase()};
next.onclick=()=>{next.disabled=true;qrPhase()};
const qfin=finish;finish=(s,d,m)=>{qfin(s,d,m);qrUsed.add(qrKey);try{localStorage.setItem('fc-used',JSON.stringify([...qrUsed].slice(-300)))}catch{}qrPing()};
const qch='BroadcastChannel' in window?new BroadcastChannel('fc-qr'):null;
function qrPing(){qch&&qch.postMessage('rotate');try{localStorage.setItem('fc-rot',String(Date.now()))}catch{}}
if(qch)qch.onmessage=()=>dashRotate();addEventListener('storage',e=>{if(e.key==='fc-rot')dashRotate()});
/* ---- teacher dashboard ---- */
function dashClock(){const d=new Date();$('classDate').value=d.toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'});$('classTime').value=d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
setInterval(dashClock,1000);dashClock();
const dOpen=()=>dSes&&Date.now()<new Date(dSes.endsAt).getTime();
function dashPayload(){const f=v=>String(v||'').replace(/\|/g,'/'),s=dSes,head=['FC1',s.id,f(s.code),f(s.level),Math.floor(Date.now()/1000).toString(36),dSeq,Math.floor(new Date(s.endsAt)/1000).toString(36)].join('|')+'|';let n=f(s.title),p=head+n;while(new TextEncoder().encode(p).length>106&&n){n=n.slice(0,-1);p=head+n}return p}
function dashDraw(){if(!dOpen()){dashStop();$('qrCanvas').hidden=true;$('qrHint').hidden=false;$('qrHint').textContent='Class ended.';$('qrTimer').textContent='';return}$('qrHint').hidden=true;$('qrCanvas').hidden=false;drawQr($('qrCanvas'),dashPayload(),560)}
function dashRotate(){if(!dTimer||!dOpen())return;dSeq++;dLeft=QR_ROT;dashDraw()}
function dashStart(){dashStop();dLeft=QR_ROT;dashDraw();dTimer=setInterval(()=>{dLeft--;if(dLeft<=0)dashRotate();$('qrTimer').textContent=dTimer?'Refreshes in '+dLeft+'s':''},1000)}
function dashStop(){if(dTimer){clearInterval(dTimer);dTimer=null}}
function dashShow(){if(dOpen())dashStart()}
$('createClass').onclick=()=>{const title=$('className').value.trim(),code=$('classCode').value.trim().toUpperCase(),level=$('classLevel').value.trim().toUpperCase(),dur=Number($('classDuration').value);if(!title||!code||!level||!Number.isInteger(dur)||dur<1||dur>1440)return alert('Enter the course name, course code, level and a duration between 1 and 1440 minutes.');const c=new Date(),s={id:uid(),lecturerId:(window.curLect||{}).id||null,courseId:$('courseSel').value||null,title,code,level,duration:dur,created:c.toISOString(),endsAt:new Date(c.getTime()+dur*60000).toISOString()};db.sessions.push(s);save();qrAct=s.id;dSes=s;dSeq=1;dashStart()};
currentTab='home';switchTab('home');
