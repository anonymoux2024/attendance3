/* FEG-TECH 4.4: students grouped by level, carryover display, 1-minute undo, edit/delete history. Loads last. */
(()=>{
const $=id=>document.getElementById(id),el=(t,c,x)=>{const e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e};
const SNAP='fc-sync-snap',hist=()=>db.history||(db.history=[]),isLect=()=>!!window.curLect,who=()=>window.curLect?window.curLect.name:'HOD';
const lvCmp=(a,b)=>String(a.level||'~').localeCompare(String(b.level||'~'),undefined,{numeric:true})||String(a.name||'').localeCompare(String(b.name||''));
/* restore deleted records (used by Undo): drop tombstones and force a re-push */
window.fcRestore=(c,recs)=>{try{const snap=JSON.parse(localStorage.getItem(SNAP)||'{}'),ids=new Set(recs.map(r=>r.id));db[c]=db[c]||[];db.tomb=(db.tomb||[]).filter(t=>!(t.c===c&&ids.has(t.id)));
  for(const r of recs){delete snap[c+'/'+r.id];r._u=Date.now();if(!db[c].some(x=>x.id===r.id))db[c].push(r)}localStorage.setItem(SNAP,JSON.stringify(snap))}catch{}};
/* ---- history + 60 s undo (undo bar is for lecturers) ---- */
let undoT=0;
function showUndo(e,undo){clearInterval(undoT);let bar=$('undoBar');if(!bar){bar=el('div','undobar');bar.id='undoBar';document.body.append(bar)}
  bar.replaceChildren();const b=el('button'),end=Date.now()+60000;
  const tick=()=>{const s=Math.ceil((end-Date.now())/1000);if(s<=0){clearInterval(undoT);bar.hidden=true;return}b.textContent='Undo ('+s+'s)'};
  b.onclick=()=>{clearInterval(undoT);bar.hidden=true;try{undo();e.undone=true;e.detail+=' · undone by '+who();save();render();toast('Undone.')}catch{toast('Could not undo.')}};
  bar.append(el('span','',(e.action==='delete'?'Deleted: ':'Edited: ')+e.label),b);bar.hidden=false;tick();undoT=setInterval(tick,1000)}
window.hlog=(action,kind,label,detail,undo)=>{const e={id:uid(),at:new Date().toISOString(),who:who(),role:isLect()?'Lecturer':'HOD',action,kind,label,detail:detail||'',undone:false};
  hist().push(e);save();if(isLect()&&undo)showUndo(e,undo)};
/* ---- students arranged by level, with carryover shown ---- */
function group(box){if(!box)return;let last=null;[...box.querySelectorAll('.student')].forEach((row,i)=>{const s=db.students[i];if(!s)return;const lv=s.level||'No level';
  if(lv!==last){last=lv;box.insertBefore(el('h3','lvhead','Level '+lv),row)}
  if(s.co&&s.co.length)row.insertBefore(el('small','costudent','Carryover: '+s.co.join(', ')),row.children[1]||null)})}
const r2=render;render=()=>{db.students.sort(lvCmp);r2();group($('manageList'));group($('studentList'))};
/* ---- HOD > Records: students by level (edit carryovers) + edit/delete history ---- */
const hv=$('hv-attendance');if(hv){
  const sc=el('div','card'),sl=el('div');sc.append(el('h2','','Students by level'),el('p','muted','Tap Edit to set a student\u2019s carryover courses.'),sl);
  const hc=el('div','card'),hw=el('div','table-wrap'),ht=el('table');hc.append(el('h2','','Edit & delete history'),el('p','muted','Every edit or delete by a lecturer or the HOD, newest first.'),hw);hw.append(ht);hv.append(sc,hc);
  let s1='',s2='';
  const drawS=()=>{const sg=db.students.length+JSON.stringify(db.students.map(s=>[s.id,s.name,s.level,s.matric,s.co]));if(sg===s1)return;s1=sg;sl.replaceChildren();if(!db.students.length){sl.append(el('p','muted','No students yet.'));return}
    [...db.students].sort(lvCmp).forEach((s,i,a)=>{if(!i||(a[i-1].level||'')!==(s.level||''))sl.append(el('h3','lvhead','Level '+(s.level||'No level')));
      const r=el('div','student'),i2=el('div'),b=el('button','secondary small','Edit');i2.append(el('strong','',s.name+(s.matric?' · '+s.matric:'')));if(s.co&&s.co.length)i2.append(el('small','costudent','Carryover: '+s.co.join(', ')));
      b.onclick=()=>{window.fcEditStudent&&fcEditStudent(s);s1='';drawS()};r.append(i2,b);sl.append(r)})};
  const drawH=()=>{const h=[...hist()].reverse().slice(0,200),sg=h.length+':'+(h[0]&&h[0].id)+':'+h.filter(x=>x.undone).length;if(sg===s2)return;s2=sg;ht.replaceChildren();
    const hr=el('tr');['When','Who','Action','What','Details'].forEach(x=>hr.append(el('th','',x)));ht.append(hr);
    if(!h.length){const r=el('tr'),c=el('td','','No edits or deletes yet.');c.colSpan=5;r.append(c);ht.append(r)}
    h.forEach(e=>{const r=el('tr');[new Date(e.at).toLocaleString(),e.who+(e.role==='HOD'?'':' (Lecturer)'),(e.action==='delete'?'Deleted':'Edited')+(e.undone?' · undone':''),e.kind+': '+e.label,e.detail].forEach(x=>r.append(el('td','',x)));ht.append(r)})};
  setInterval(()=>{if(!hv.hidden){drawS();drawH()}},1500)}
render();
})();
