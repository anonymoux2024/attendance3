"use strict";
/* FEG-TECH 4.5: student database (name + matric list) with name suggestions on the Register screen.
   The HOD uploads the list (HOD dashboard); it is stored on the Cloudflare worker, and every staff phone and the
   Student app download it and keep a copy, so suggestions keep working offline. The list is kept on this phone
   under its own key, separate from registered (face-enrolled) students. */
(function(){
var KEY='fc-roster',MKEY='fc-roster-meta';
var rows=load(),meta=loadMeta(),idx=[],picked='',autoM=false,sel=-1,shown=[],busy=false,offline=false;
var nameIn=document.getElementById('studentName'),matIn=document.getElementById('studentMatric'),lvlIn=document.getElementById('studentLevel');
if(!nameIn||!matIn)return;

function load(){try{var a=JSON.parse(localStorage.getItem(KEY));if(Array.isArray(a))return a.filter(function(r){return r&&r.n})}catch(e){}return[]}
function persist(){try{localStorage.setItem(KEY,JSON.stringify(rows));localStorage.setItem(MKEY,JSON.stringify(meta));return true}catch(e){return false}}
function loadMeta(){try{var m=JSON.parse(localStorage.getItem(MKEY));if(m&&typeof m==='object')return m}catch(e){}return{v:0,t:0}}
function sync(){try{var c=JSON.parse(localStorage.getItem('fc-sync'));if(c&&c.url)return{base:String(c.url).replace(/\/+$/,''),key:c.key||''}}catch(e){}return null}
function role(){return window.fcRole?window.fcRole():null}
function enc(x){return encodeURIComponent(x)}
function toWire(){return rows.map(function(r){return[r.n,r.m||'',r.l||'']})}
function fromWire(a){return a.map(function(x){var r={n:String(x[0]||''),m:String(x[1]||'')};if(x[2])r.l=String(x[2]);return r}).filter(function(r){return r.n})}
async function push(){
  var c=sync();if(!c)throw Error('Connect online sync first.');
  var r=await fetch(c.base+'/roster?auth='+enc(c.key),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({list:toWire()})});
  if(!r.ok)throw Error(r.status===401?'Access denied. Check the access key.':'Server error '+r.status+(r.status===404?' (redeploy the latest worker.js)':''));
  var d=await r.json();meta={v:d.v,t:d.t};persist();
}
/* download the list the HOD uploaded; the HOD phone first sends any change that is still waiting to go up */
async function pull(){
  var c=sync();if(!c||busy)return;busy=true;
  try{
    if(meta.dirty&&role()==='hod'){delete meta.dirty;try{await push()}catch(e){meta.dirty=true;throw e}}
    var r=await fetch(c.base+'/roster?auth='+enc(c.key)+'&v='+(meta.v||0));
    if(!r.ok)throw Error(r.status===401?'Access denied.':'Server error '+r.status);
    var d=await r.json();offline=false;
    if(d.same){meta.t=d.t||meta.t}
    else if(!d.v){if(role()==='hod'&&rows.length){meta.dirty=true;persist();await push()}}  /* server empty: the HOD's own list goes up */
    else{rows=fromWire(d.list||[]);meta={v:d.v,t:d.t};if(!persist())throw Error('This phone has no room left to save the list.');rebuild()}
  }catch(e){offline=true}
  finally{busy=false;refreshInfo()}
}
function say(t){if(typeof window.toast==='function')window.toast(t)}
function fold(s){return String(s==null?'':s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim()}
function key(r){return r.m||fold(r.n)}
function rebuild(){idx=rows.map(function(r){var f=fold(r.n);return{r:r,f:f,w:f.split(' '),mk:String(r.m||'').toLowerCase().replace(/[^a-z0-9]/g,'')}})}

/* ---------- search ---------- */
function search(q){
  var qf=fold(q);if(qf.length<2)return[];
  var toks=qf.split(' '),out=[];
  for(var i=0;i<idx.length;i++){
    var x=idx[i],ok=true,score=0;
    for(var t=0;t<toks.length;t++){
      var tk=toks[t],hit=-1;
      for(var w=0;w<x.w.length;w++){if(x.w[w].indexOf(tk)===0){hit=w;break}}
      if(hit<0&&/\d/.test(tk)&&x.mk.indexOf(tk)>-1)hit=3;
      if(hit<0){ok=false;break}
      score+=hit;
    }
    if(!ok)continue;
    if(x.f.indexOf(qf)===0)score-=5;
    out.push({r:x.r,s:score,f:x.f});
  }
  out.sort(function(a,b){return a.s-b.s||(a.f<b.f?-1:a.f>b.f?1:0)});
  return out.slice(0,6).map(function(o){return o.r});
}

/* ---------- file reading ---------- */
function parseCSV(text){
  text=String(text).replace(/^\uFEFF/,'');
  var first=text.split(/\r?\n/,1)[0]||'';
  var cands=[['\t',(first.match(/\t/g)||[]).length],[';',(first.match(/;/g)||[]).length],[',',(first.match(/,/g)||[]).length]].sort(function(a,b){return b[1]-a[1]});
  var delim=cands[0][1]?cands[0][0]:',';
  var out=[],row=[],cur='',q=false;
  for(var i=0;i<text.length;i++){
    var c=text[i];
    if(q){if(c==='"'){if(text[i+1]==='"'){cur+='"';i++}else q=false}else cur+=c}
    else if(c==='"')q=true;
    else if(c===delim){row.push(cur);cur=''}
    else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cur);out.push(row);row=[];cur=''}
    else cur+=c;
  }
  if(cur!==''||row.length){row.push(cur);out.push(row)}
  return out;
}
function mapHeader(r){
  var m={name:-1,sur:-1,first:-1,other:-1,matric:-1,level:-1};
  r.forEach(function(c,i){
    var h=String(c==null?'':c).toLowerCase().replace(/[^a-z]/g,'');
    if(!h)return;
    if(/matric|regno|regnumber|registration|studentid|studentno|^id$/.test(h)){if(m.matric<0)m.matric=i}
    else if(/surname|lastname|familyname/.test(h)){if(m.sur<0)m.sur=i}
    else if(/firstname|givenname|forename/.test(h)){if(m.first<0)m.first=i}
    else if(/othername|middlename/.test(h)){if(m.other<0)m.other=i}
    else if(/fullname|^names?$|studentname|nameofstudent/.test(h)){if(m.name<0)m.name=i}
    else if(/level|^lvl$/.test(h)){if(m.level<0)m.level=i}
  });
  return(m.name>=0||m.sur>=0||m.first>=0)?m:null;
}
function guessCols(t){
  var cols=0,bn=0,bm=0,m={name:-1,sur:-1,first:-1,other:-1,matric:-1,level:-1};
  t.forEach(function(r){cols=Math.max(cols,r.length)});
  for(var c=0;c<cols;c++){
    var nm=0,mt=0,n=0;
    t.slice(0,60).forEach(function(r){
      var v=String(r[c]==null?'':r[c]).trim();if(!v)return;n++;
      if(/^[A-Za-z][A-Za-z.'\u2019\- ]*$/.test(v)&&v.indexOf(' ')>0)nm++;
      else if(/\d{3,}/.test(v)&&!/\s/.test(v)&&v.length>=5&&v.length<=25)mt++;
    });
    if(n){if(nm/n>bn){bn=nm/n;m.name=c}if(mt/n>bm){bm=mt/n;m.matric=c}}
  }
  return(m.name>=0&&bn>=.5)?m:null;
}
function toRecords(table){
  table=table.filter(function(r){return r.some(function(c){return String(c==null?'':c).trim()!==''})});
  if(!table.length)return[];
  var map=null,start=0;
  for(var i=0;i<Math.min(table.length,10);i++){var mm=mapHeader(table[i]);if(mm){map=mm;start=i+1;break}}
  if(!map)map=guessCols(table);
  if(!map)return[];
  var out=[];
  table.slice(start).forEach(function(r){
    function g(i){return i>=0&&r[i]!=null?String(r[i]).replace(/\s+/g,' ').trim():''}
    var n=map.name>=0?g(map.name):[g(map.sur),g(map.first),g(map.other)].filter(Boolean).join(' ');
    if(!n||/^(s\/?n|names?|full ?name|matric.*)$/i.test(n))return;
    var rec={n:n,m:g(map.matric).toUpperCase()};
    var l=g(map.level).toUpperCase();if(l)rec.l=l;
    out.push(rec);
  });
  return out;
}
function loadXLSX(){return new Promise(function(res,rej){
  if(window.XLSX)return res();
  var s=document.createElement('script');s.src='vendor/xlsx.full.min.js';
  s.onload=function(){res()};
  s.onerror=function(){rej(Error('Could not load the Excel reader. Check your internet, or save the list as CSV and import that.'))};
  document.head.appendChild(s);
})}
async function readFile(f){
  if(/\.xlsx?$/i.test(f.name)){
    await loadXLSX();
    var wb=XLSX.read(await f.arrayBuffer(),{type:'array'});
    return wb.SheetNames.map(function(n){return XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1,defval:'',raw:false})});
  }
  return[parseCSV(await f.text())];
}
function merge(recs){
  var by={},added=0,updated=0,i;
  rows.forEach(function(r){by[key(r)]=r});
  recs.forEach(function(r){var k=key(r);if(by[k]){if(by[k].n!==r.n||by[k].m!==r.m||by[k].l!==r.l)updated++}else added++;by[k]=r});
  rows=Object.keys(by).map(function(k){return by[k]}).sort(function(a,b){return fold(a.n)<fold(b.n)?-1:1});
  return{added:added,updated:updated};
}

/* ---------- screens: Register card (everyone) and Student database card (HOD dashboard) ---------- */
var lab=nameIn.closest('label'),card=document.createElement('div');
card.className='card';card.id='rosterCard';
card.innerHTML='<b>Student database</b><p class="muted" id="rosterInfo"></p><div class="actions"><button type="button" id="rosterImport">Import student list</button><button type="button" class="secondary" id="rosterClear">Clear list</button><button type="button" class="secondary" id="rosterRefresh">Refresh list</button></div><p class="muted" id="rosterNote"></p>';
lab.parentNode.insertBefore(card,lab);
var fileIn=document.createElement('input');fileIn.type='file';fileIn.hidden=true;fileIn.accept='.csv,.tsv,.txt,.xlsx,.xls,text/csv';document.body.appendChild(fileIn);
var hod=null,syncCard=document.getElementById('syncCard');
if(syncCard){
  hod=document.createElement('div');hod.className='card';hod.id='rosterHodCard';
  hod.innerHTML='<h2><svg class="ic" aria-hidden="true"><use href="#i-users"/></svg> Student database</h2><p class="muted" id="rosterHodInfo"></p><div class="actions"><button type="button" id="rosterHodUp">Upload student list</button><button type="button" class="secondary" id="rosterHodRef">Refresh</button><button type="button" class="danger" id="rosterHodClear">Remove list</button></div><p class="muted" id="rosterHodNote"></p>';
  syncCard.parentNode.insertBefore(hod,syncCard);
}
function when(t){try{return new Date(t).toLocaleString([],{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}catch(e){return''}}
function infoText(bad){
  var n=rows.length;
  if(!n)return sync()?'No student list yet. The HOD uploads one from Reports (HOD).':'No student list on this phone yet. Import one so names suggest as you type.';
  return n+' students'+(meta.t&&sync()?' · uploaded '+when(meta.t):'')+(offline&&sync()?' · offline, using the saved copy':'')+(meta.dirty?' · waiting to upload':'');
}
function showInfo(t,bad){[document.getElementById('rosterInfo'),document.getElementById('rosterHodInfo')].forEach(function(e){if(e){e.textContent=t;e.style.color=bad?'#ff8a80':''}})}
function refreshInfo(){
  showInfo(infoText());
  var s=!!sync(),b=function(id,on){var e=document.getElementById(id);if(e)e.hidden=!on};
  /* Register screen: staff phones with sync only refresh; the list is uploaded by the HOD */
  b('rosterImport',!s);b('rosterClear',!s&&rows.length>0);b('rosterRefresh',s);
  var nt=document.getElementById('rosterNote');if(nt)nt.textContent=s?'The HOD uploads the student list. It is saved on this phone, so suggestions work without internet.':'CSV or Excel file with a Name column and a Matric column (Level is optional). Connect online sync so the HOD can share one list with every phone.';
  b('rosterHodClear',rows.length>0);
  var hn=document.getElementById('rosterHodNote');if(hn)hn.textContent=s?'CSV or Excel with a Name column and a Matric column (Level optional). Uploading again adds new students and updates existing ones, so you can upload one level at a time. Lecturers and the Student app receive the list automatically and keep a copy for offline use.':'Connect online sync below first, so the list reaches the lecturers and the Student app. Until then it stays on this phone.';
}
async function doImport(f){
  try{
    showInfo('Reading '+f.name+'...');
    if(sync())await pull();
    var tables=await readFile(f),recs=[];
    tables.forEach(function(t){recs=recs.concat(toRecords(t))});
    if(!recs.length)throw Error('No students found. The file needs a column headed Name (or Surname and First name) and, ideally, one headed Matric.');
    var before=rows,beforeMeta=meta;var res=merge(recs);
    if(sync()){
      meta=Object.assign({},meta,{dirty:true});
      if(!persist()){rows=before;meta=beforeMeta;throw Error('This phone has no room left to save the list.')}
      rebuild();
      try{delete meta.dirty;await push();say('Uploaded '+rows.length+' students ('+res.added+' new, '+res.updated+' updated). Phones receive them automatically.')}
      catch(e){meta.dirty=true;persist();say('Saved here, but not uploaded yet ('+e.message+'). It will upload when you are online.')}
    }else{
      if(!persist()){rows=before;meta=beforeMeta;throw Error('This phone has no room left to save the list.')}
      rebuild();
      var noM=recs.filter(function(r){return !r.m}).length;
      say('Imported '+recs.length+' students ('+res.added+' new, '+res.updated+' updated)'+(noM?'. '+noM+' have no matric number.':'.'));
    }
    refreshInfo();
  }catch(e){showInfo(e&&e.message?e.message:'Could not read that file.',true)}
}
async function doClear(){
  if(!rows.length)return;
  if(!confirm('Remove the student list'+(sync()?' for everyone (all lecturers and the Student app)':' from this phone')+'? Registered students and their faces are not affected.'))return;
  rows=[];meta=Object.assign({},meta);hide();
  if(sync()){meta.dirty=true;persist();try{delete meta.dirty;await push()}catch(e){meta.dirty=true;persist()}}else persist();
  rebuild();refreshInfo();say('Student list removed.');
}
function pickFile(){fileIn.click()}
fileIn.onchange=function(){var f=fileIn.files&&fileIn.files[0];fileIn.value='';if(f)doImport(f)};
document.getElementById('rosterImport').onclick=pickFile;
document.getElementById('rosterClear').onclick=doClear;
document.getElementById('rosterRefresh').onclick=function(){pull().then(function(){say(offline?'Offline. Using the saved list.':'Student list is up to date.')})};
if(hod){
  document.getElementById('rosterHodUp').onclick=pickFile;
  document.getElementById('rosterHodClear').onclick=doClear;
  document.getElementById('rosterHodRef').onclick=function(){if(!sync())return say('Connect online sync first.');pull().then(function(){say(offline?'Offline. Using the saved list.':'Student list is up to date.')})};
}

/* ---------- Register screen: name suggestions ---------- */
var box=document.createElement('div');box.className='suggest';box.id='nameSuggest';box.hidden=true;box.setAttribute('role','listbox');
lab.classList.add('hasSuggest');lab.appendChild(box);
nameIn.setAttribute('autocomplete','off');
function hide(){box.hidden=true;sel=-1}
function paint(){[].forEach.call(box.children,function(b,i){b.classList.toggle('on',i===sel)})}
function show(){
  shown=search(nameIn.value);
  box.replaceChildren();
  if(!shown.length){hide();return}
  shown.forEach(function(r,i){
    var b=document.createElement('button');b.type='button';b.setAttribute('role','option');
    var n=document.createElement('span');n.textContent=r.n;
    var s=document.createElement('small');s.textContent=(r.m||'No matric number')+(r.l?' · '+r.l:'');
    b.append(n,s);b.onclick=function(){pick(r)};
    box.appendChild(b);
  });
  sel=-1;box.hidden=false;
}
function pick(r){
  nameIn.value=r.n;matIn.value=r.m||'';
  if(r.l&&lvlIn&&!lvlIn.value.trim())lvlIn.value=r.l;
  picked=r.n;autoM=!!r.m;hide();
}
nameIn.addEventListener('input',function(){
  /* editing the name after picking a suggestion drops the matric number that was filled in for the old name */
  if(autoM&&fold(nameIn.value)!==fold(picked)){matIn.value='';autoM=false}
  show();
});
nameIn.addEventListener('focus',function(){if(nameIn.value.trim().length>=2)show()});
nameIn.addEventListener('keydown',function(e){
  if(box.hidden)return;
  if(e.key==='ArrowDown'){e.preventDefault();sel=(sel+1)%shown.length;paint()}
  else if(e.key==='ArrowUp'){e.preventDefault();sel=(sel<=0?shown.length:sel)-1;paint()}
  else if(e.key==='Enter'&&sel>=0){e.preventDefault();pick(shown[sel])}
  else if(e.key==='Escape'||e.key==='Tab')hide();
});
matIn.addEventListener('input',function(){autoM=false});
box.addEventListener('mousedown',function(e){e.preventDefault()});
document.addEventListener('pointerdown',function(e){if(!lab.contains(e.target))hide()});

rebuild();refreshInfo();
var sw0=window.switchTab||(typeof switchTab==='function'?switchTab:null);
if(sw0){switchTab=async function(t){await sw0(t);if(t==='register'||t==='hod'){refreshInfo();pull()}}}
setTimeout(pull,1500);
document.addEventListener('visibilitychange',function(){if(!document.hidden)pull()});
window.addEventListener('online',pull);
setInterval(function(){if(!document.hidden)pull()},300000);
window.fcRoster={parseCSV:parseCSV,toRecords:toRecords,search:search,all:function(){return rows.slice()},pull:pull,meta:function(){return meta}};
})();
