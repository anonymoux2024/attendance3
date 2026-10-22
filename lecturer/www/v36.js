/* Feg-tech 4.0: students register at home in the Student app. This phone pulls the requests; the lecturer approves them. Also refreshes the student list for class. Loads last. */
(()=>{
const $=id=>document.getElementById(id);
const el=(t,c,x)=>{const e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e};
const cfg=()=>{try{return JSON.parse(localStorage.getItem('fc-sync'))||{}}catch{return {}}},ready=()=>!!(cfg().url&&cfg().key);
async function staff(path,method,body){const c=cfg(),r=await fetch(c.url.replace(/\/+$/,'')+'/'+path+'?auth='+encodeURIComponent(c.key),{method,headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});if(!r.ok)throw Error('Server '+r.status);return r.json()}

/* ---- card on the Register screen ---- */
const card=el('div','card'),st=el('p','muted',''),box=el('div'),btn=el('button','secondary','Check now');
card.append(el('h2','','Registration requests'),el('p','muted','Students who registered at home in the Student app appear here. Compare the photo with the student, then Approve or Reject.'),st,box,btn);
const anchor=$('register').querySelector('h2');anchor.before(card);
let busy=false;
const verdict=async(r,ok,msg)=>{await staff('enr/'+r.id,'POST',{ok,msg})};
async function approve(r,row){
  try{
    const d=r.faceDescriptors,p=r.facePoses,fr=d.filter((_,i)=>p[i]==='f'),avg=mean(fr),name=String(r.name).trim(),level=String(r.level).trim().toUpperCase();
    const mt=String(r.matric||'').trim().toUpperCase(),same=db.students.find(s=>(mt&&s.matric&&s.matric===mt)||((!mt||!s.matric)&&ck(s.name)===ck(name)&&(s.level||'')===level));
    const near=db.students.filter(s=>s!==same).map(s=>({s,d:studentDist(s,avg,'f')})).filter(m=>isFinite(m.d)).sort((a,b)=>a.d-b.d)[0];
    if(near&&near.d<.45){alert('This face looks the same as "'+near.s.name+'", who is already registered. Request rejected.');await verdict(r,false,'This face is already registered under another name. See your lecturer.');row.remove();return}
    if(near&&near.d<.55&&!confirm('This face is quite similar to "'+near.s.name+'". The scanner may confuse them. Approve anyway?'))return;
    if(same&&!confirm('"'+same.name+'" is already registered. Replace their saved face data?'))return;
    const rec={faceDescriptor:round(avg),faceDescriptors:d.map(round),facePoses:p,enrolledAt:new Date().toISOString(),photo:r.photo||'',matric:mt,source:'student-app'};
    if(same)Object.assign(same,rec,{name,level});else db.students.push({id:uid(),name,level,...rec});
    save();await verdict(r,true,'Registered. You can scan in class.');row.remove();toast(name+' registered.');note()
  }catch(e){toast('Could not approve: '+e.message)}}
async function reject(r,row){if(!confirm('Reject '+r.name+'?'))return;try{await verdict(r,false,'Not approved. See your lecturer.');row.remove();note()}catch(e){toast('Could not reject: '+e.message)}}
function note(){const n=box.children.length;st.textContent=n?n+' waiting for approval.':'No requests waiting.';if(window.fcDot)window.fcDot('register',n)}
function draw(reqs){box.replaceChildren();
  for(const r of reqs){const row=el('div','student'),info=el('div'),b=el('div','btns'),ok=el('button','small','Approve'),no=el('button','danger small','Reject');
    if(r.photo){const im=new Image();im.src=r.photo;im.alt='';im.style.cssText='width:56px;height:70px;object-fit:cover;border-radius:8px;margin-right:10px';row.append(im)}
    info.append(el('strong','',r.name),el('small','',(r.matric||'no matric no.')+' · '+(r.level||'—')+' · '+new Date(r.t).toLocaleString()));
    ok.onclick=()=>approve(r,row);no.onclick=()=>reject(r,row);b.append(ok,no);row.append(info,b);box.append(row)}
  note()}
async function poll(manual){
  if(busy)return;if(!ready()){st.textContent='Connect this phone to online sync first (use the department share link).';return}
  if(!manual&&(document.hidden||(currentTab!=='register'&&!window.curLect)))return;
  busy=true;try{const r=await staff('enr','GET');draw(r.reqs||[])}catch(e){st.textContent=e.message==='Failed to fetch'?'Cannot reach the server.':e.message==='Server 401'?'Access denied. Check the access key in Online Sync.':e.message}finally{busy=false}}
btn.onclick=()=>poll(true);setInterval(poll,20000);

/* ---- pull the full student list (incl. approved-by-other-lecturers) before class ---- */
let last=0;const full=()=>{if(!ready()||!window.fcSync||Date.now()-last<120000)return;last=Date.now();window.fcSync(false)};
document.addEventListener('visibilitychange',()=>{if(!document.hidden)full()});setTimeout(full,6000);
const sw=switchTab;switchTab=async t=>{await sw(t);if(t==='register')poll();if(t==='class'||t==='scan'||t==='register')full()};
})();
