"use strict";
/* Student app 4.2: name suggestions on the registration form.
   The department's student list is downloaded from the school server and kept on this phone, so suggestions work offline.
   Picking a suggestion fills the matric number (and the level when it is empty). Needs student.js loaded first (API, call). */
(()=>{
const R=id=>document.getElementById(id),nameIn=R('rname'),matIn=R('rmatric'),lvlIn=R('rlevel'),codeIn=R('rcode'),KEY='fc-roster-s',CODE='fc-roster-code';
if(!nameIn||!matIn)return;
let store=load(),idx=[],picked='',autoM=false,sel=-1,shown=[],busy=false;
function load(){try{const o=JSON.parse(localStorage.getItem(KEY));if(o&&Array.isArray(o.list))return o}catch{}return{v:0,list:[]}}
const fold=s=>String(s==null?'':s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
function rebuild(){idx=store.list.map(a=>{const f=fold(a[0]);return{a,f,w:f.split(' '),mk:String(a[1]||'').toLowerCase().replace(/[^a-z0-9]/g,'')}})}
function search(q){
  const qf=fold(q);if(qf.length<2)return[];const toks=qf.split(' '),out=[];
  for(const x of idx){let ok=true,score=0;
    for(const tk of toks){let hit=-1;for(let w=0;w<x.w.length;w++){if(x.w[w].startsWith(tk)){hit=w;break}}
      if(hit<0&&/\d/.test(tk)&&x.mk.includes(tk))hit=3;if(hit<0){ok=false;break}score+=hit}
    if(!ok)continue;if(x.f.startsWith(qf))score-=5;out.push({a:x.a,s:score,f:x.f})}
  out.sort((p,q)=>p.s-q.s||(p.f<q.f?-1:p.f>q.f?1:0));return out.slice(0,6).map(o=>o.a)}

/* download the list (only what changed since the saved copy); no internet just keeps the saved copy */
async function pull(){
  if(busy||typeof API==='undefined'||!API)return;busy=true;
  try{
    let code='';try{code=localStorage.getItem(CODE)||''}catch{}
    const r=await callOnline('/s/roster?v='+(store.v||0)+(code?'&code='+encodeURIComponent(code):''));
    if(!r.ok){if(/enrolment code/i.test(r.err||'')){const b=R('rcodeBox');if(b)b.hidden=false;hint(code?'That enrolment code did not work. Check it with your department.':'Enter the enrolment code from your department to get name suggestions.')}return}
    hint('');
    if(r.d.same)return;
    store={v:r.d.v||0,list:Array.isArray(r.d.list)?r.d.list:[]};
    try{localStorage.setItem(KEY,JSON.stringify(store))}catch{}
    rebuild();
  }finally{busy=false}}

/* suggestions dropdown */
const lab=nameIn.closest('label'),box=document.createElement('div'),note=document.createElement('p');
box.className='suggest';box.hidden=true;box.setAttribute('role','listbox');note.className='fine';note.id='rosterHint';note.hidden=true;
lab.classList.add('hasSuggest');lab.appendChild(box);lab.insertAdjacentElement('afterend',note);
nameIn.setAttribute('autocomplete','off');
function hint(t){note.textContent=t;note.hidden=!t}
function hide(){box.hidden=true;sel=-1}
function paint(){[...box.children].forEach((b,i)=>b.classList.toggle('on',i===sel))}
function show(){
  shown=search(nameIn.value);box.replaceChildren();
  if(!shown.length)return hide();
  shown.forEach(a=>{const b=document.createElement('button');b.type='button';b.setAttribute('role','option');
    const n=document.createElement('span');n.textContent=a[0];const s=document.createElement('small');s.textContent=(a[1]||'No matric number')+(a[2]?' · '+a[2]:'');
    b.append(n,s);b.onclick=()=>pick(a);box.appendChild(b)});
  sel=-1;box.hidden=false}
function pick(a){nameIn.value=a[0];matIn.value=a[1]||'';if(a[2]&&lvlIn&&!lvlIn.value.trim())lvlIn.value=a[2];picked=a[0];autoM=!!a[1];hide()}
nameIn.addEventListener('input',()=>{
  /* editing the name after picking drops the matric number that was filled in for the old name */
  if(autoM&&fold(nameIn.value)!==fold(picked)){matIn.value='';autoM=false}
  show()});
nameIn.addEventListener('focus',()=>{if(nameIn.value.trim().length>=2)show()});
nameIn.addEventListener('keydown',e=>{if(box.hidden)return;
  if(e.key==='ArrowDown'){e.preventDefault();sel=(sel+1)%shown.length;paint()}
  else if(e.key==='ArrowUp'){e.preventDefault();sel=(sel<=0?shown.length:sel)-1;paint()}
  else if(e.key==='Enter'&&sel>=0){e.preventDefault();pick(shown[sel])}
  else if(e.key==='Escape'||e.key==='Tab')hide()});
matIn.addEventListener('input',()=>{autoM=false});
box.addEventListener('mousedown',e=>e.preventDefault());
document.addEventListener('pointerdown',e=>{if(!lab.contains(e.target))hide()});
if(codeIn)codeIn.addEventListener('change',()=>{const v=codeIn.value.trim();try{if(v)localStorage.setItem(CODE,v)}catch{}pull()});

rebuild();
const go=R('goReg');if(go)go.addEventListener('click',pull);
setTimeout(pull,1200);window.addEventListener('online',pull);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)pull()});
window.fcRosterS={search,pull,all:()=>store.list.slice()};
})();
