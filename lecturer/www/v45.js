/* FEG-TECH 4.5: HOD dashboard snapshot - top/bottom 15 students, classes held per lecturer, expected vs attended pie. Loads last. */
(()=>{
const $=id=>document.getElementById(id),el=(t,c,x)=>{const e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e};
const NS='http://www.w3.org/2000/svg',COL_OK='#22d3b6',COL_NO='#f59e0b';
const anchor=$('activeList')&&$('activeList').closest('.card');if(!anchor)return;
const sCard=el('div','card snap'),lCard=el('div','card snap'),pCard=el('div','card snap');sCard.id='snapStudents';lCard.id='snapLect';pCard.id='snapPie';
anchor.after(sCard,lCard,pCard);
const lname=id=>((db.lecturers||[]).find(l=>l.id===id)||{}).name||'Unassigned';
const enr=s=>db.students.filter(x=>!s.level||!x.level||x.level===s.level||(x.co||[]).some(c=>ck(c)===ck(s.code||s.title))).length;
const pres=s=>db.attendance.filter(a=>a.sessionId===s.id).length;
const gkey=s=>ck(s.code||s.title)+'|'+(s.level||'');
const glabel=s=>(s.code?s.code+' · '+s.title:s.title)+(s.level?' ('+s.level+')':'');
const pc=(p,t)=>t?Math.round(p/t*1000)/10:0;
function bar(p,color){const b=el('div','sbar'),i=el('i');i.style.width=Math.max(0,Math.min(100,p))+'%';if(color)i.style.background=color;b.append(i);return b}
/* ---- students: one overall figure per student (all their courses together) ---- */
function studentStats(){const m=new Map();(typeof eligRows==='function'?eligRows():[]).forEach(r=>{if(!r.total)return;const k=r.name+'|'+r.matric;let g=m.get(k);if(!g){g={name:r.name,matric:r.matric,level:r.level,present:0,total:0};m.set(k,g)}g.present+=r.present;g.total+=r.total});
  return [...m.values()].map(g=>({...g,pct:pc(g.present,g.total)}))}
function studentList(title,sub,rows,color){const w=el('div','snapcol');w.append(el('h3','',title),el('p','muted',sub));
  if(!rows.length){w.append(el('p','muted','No data yet.'));return w}
  rows.forEach((r,i)=>{const row=el('div','prow'),n=el('span','rk',i+1),mid=el('div'),nm=el('b','',r.name);mid.append(nm,el('small','',(r.matric?r.matric+' · ':'')+'Level '+r.level+' · '+r.present+'/'+r.total+' classes'),bar(r.pct,color));row.append(n,mid,el('strong','',r.pct+'%'));w.append(row)});return w}
function drawStudents(){sCard.replaceChildren(el('h2','','Student Attendance Snapshot'),el('p','muted','Overall attendance of each student across all their courses and levels.'));
  const st=studentStats();if(!st.length){sCard.append(el('p','muted','No attendance data yet. Results appear after classes have been held.'));return}
  const avg=pc(st.reduce((n,s)=>n+s.present,0),st.reduce((n,s)=>n+s.total,0));
  const sum=el('div','snapsum');[['Students tracked',st.length],['Average attendance',avg+'%'],['At or above '+hodThr()+'%',st.filter(s=>s.pct>=hodThr()).length],['Below '+hodThr()+'%',st.filter(s=>s.pct<hodThr()).length]].forEach(([l,v])=>{const d=el('div');d.append(el('b','',v),el('small','',l));sum.append(d)});sCard.append(sum);
  const hi=[...st].sort((a,b)=>b.pct-a.pct||b.present-a.present||a.name.localeCompare(b.name)),lo=[...st].sort((a,b)=>a.pct-b.pct||a.present-b.present||a.name.localeCompare(b.name));
  const nTop=Math.min(15,Math.ceil(st.length/2)),nLow=Math.min(15,Math.floor(st.length/2));
  const g=el('div','snapgrid');g.append(studentList('Highest attendance','Top '+nTop,hi.slice(0,nTop),COL_OK),studentList('Lowest attendance','Bottom '+nLow,lo.slice(0,nLow),COL_NO));sCard.append(g)}
/* ---- classes held per lecturer ---- */
function drawLect(){lCard.replaceChildren(el('h2','','Classes Held by Lecturer'));const m=new Map();(db.lecturers||[]).forEach(l=>m.set(l.id,{name:l.name,n:0}));
  db.sessions.forEach(s=>{const k=s.lecturerId||'';let g=m.get(k);if(!g){g={name:lname(s.lecturerId),n:0};m.set(k,g)}g.n++});
  const rows=[...m.values()].sort((a,b)=>b.n-a.n||a.name.localeCompare(b.name));if(!rows.length){lCard.append(el('p','muted','No lecturers yet.'));return}
  const mx=Math.max(1,...rows.map(r=>r.n));rows.forEach(r=>{const row=el('div','lrow'),t=el('div');t.append(el('span','',r.name),bar(r.n/mx*100,'#2b7cff'));row.append(t,el('strong','',r.n));lCard.append(row)});
  lCard.append(el('p','muted','Total classes held: '+db.sessions.length))}
/* ---- expected vs attended pie ---- */
let sel='';
function pie(att,abs){const sv=document.createElementNS(NS,'svg');sv.setAttribute('viewBox','-1 -1 2 2');sv.setAttribute('class','piesvg');sv.setAttribute('role','img');sv.setAttribute('aria-label','Attended '+att+', did not attend '+abs);
  const tot=att+abs,mk=(a0,a1,c)=>{const p=document.createElementNS(NS,'path'),x=a=>Math.cos(a*2*Math.PI-Math.PI/2),y=a=>Math.sin(a*2*Math.PI-Math.PI/2);
    p.setAttribute('d',`M0 0L${x(a0)} ${y(a0)}A1 1 0 ${a1-a0>.5?1:0} 1 ${x(a1)} ${y(a1)}Z`);p.setAttribute('fill',c);sv.append(p)};
  if(!tot)return sv;if(!abs||!att){const c=document.createElementNS(NS,'circle');c.setAttribute('r','1');c.setAttribute('fill',att?COL_OK:COL_NO);sv.append(c)}else{const f=att/tot;mk(0,f,COL_OK);mk(f,1,COL_NO)}return sv}
function drawPie(){const ss=db.sessions,opts=new Map();ss.forEach(s=>{if(!opts.has(gkey(s)))opts.set(gkey(s),glabel(s))});
  pCard.replaceChildren(el('h2','','Expected vs Attended'),el('p','muted','Students who were supposed to attend, against those who did, summed over every class held.'));
  const lab=el('label','','Class'),s=el('select');s.append(new Option('All classes',''));[...opts].sort((a,b)=>a[1].localeCompare(b[1])).forEach(([k,v])=>s.append(new Option(v,k)));if(!opts.has(sel))sel='';s.value=sel;s.onchange=()=>{sel=s.value;drawPie()};lab.append(s);pCard.append(lab);
  const use=ss.filter(x=>!sel||gkey(x)===sel);if(!use.length){pCard.append(el('p','muted','No classes held yet.'));return}
  const exp=use.reduce((n,x)=>n+enr(x),0),att=Math.min(exp,use.reduce((n,x)=>n+pres(x),0)),abs=Math.max(0,exp-att);
  const w=el('div','piewrap');w.append(pie(att,abs));const lg=el('div','pielg');
  [['Attended',att,COL_OK],['Did not attend',abs,COL_NO]].forEach(([l,v,c])=>{const r=el('div'),d=el('i');d.style.background=c;r.append(d,el('span','',l+': '+v+' ('+pc(v,exp)+'%)'));lg.append(r)});
  lg.append(el('p','muted','Expected total: '+exp+' across '+use.length+' class'+(use.length===1?'':'es')));w.append(lg);pCard.append(w)}
function draw(){try{drawStudents();drawLect();drawPie()}catch(e){console.error(e)}}
const r3=render;render=()=>{r3();if(typeof currentTab!=='undefined'&&currentTab==='hod')draw()};
window.addEventListener('fc-hv',e=>{if(e.detail==='main')draw()});
draw();
})();
