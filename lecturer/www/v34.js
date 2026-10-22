/* Feg-tech 3.5: eligibility per course per level for lecturers. Loads last. */
(()=>{
const $=id=>document.getElementById(id);
const el=(t,c,x)=>{const e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e};
/* an HOD threshold saved on this phone before it was synced is adopted once */
try{if(!db.thr){const v=Number(localStorage.getItem(THR_KEY));if(v>=1&&v<=100){db.thr=v;save()}}}catch{}
const card=el('div','card'),sel=el('select'),lab=el('label','','Course and level '),wrap=el('div','table-wrap'),tbl=el('table'),meta=el('p','muted'),acts=el('div','actions'),xb=el('button','secondary','Excel'),pb=el('button','secondary','PDF');
lab.append(sel);wrap.append(tbl);acts.append(xb,pb);
card.append(el('h2','','Eligibility by course'),el('p','muted','Each student is measured only against the classes of one course at their own level.'),lab,meta,wrap,acts);
card.hidden=true;document.querySelector('#class details.card').before(card);
const mineOf=me=>db.sessions.filter(s=>sessIsMine(s,me.id));
const rows=()=>eligRows({lect:window.curLect.id,grp:sel.value});
const label=()=>sel.value?sel.selectedOptions[0].textContent:'All my courses';
function draw(){const me=window.curLect;card.hidden=!me;if(!me)return;
  const old=sel.value,m=new Map();mineOf(me).forEach(s=>{const k=gk(s);if(!m.has(k))m.set(k,(s.code?s.code+' · ':'')+s.title+' · '+(s.level||'no level'))});
  sel.replaceChildren(new Option('All my courses',''));[...m].sort((a,b)=>a[1].localeCompare(b[1])).forEach(([k,l])=>sel.append(new Option(l,k)));sel.value=m.has(old)?old:'';
  const r=rows();eligTable(tbl,r);meta.textContent=r.length?r.length+' result'+(r.length===1?'':'s')+' · minimum '+hodThr()+'%':'No classes held yet for your courses.'}
sel.onchange=draw;xb.onclick=()=>eligXls(rows(),label());pb.onclick=()=>eligPdf(rows(),label());
const r2=render;render=()=>{r2();draw()};
draw();
})();
