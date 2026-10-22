/* FEG-TEC 4.2: bottom tab navigation (lecturer + HOD), Account page, and "Open phones" (1-hour student phones). Loads last. */
(()=>{
const $=id=>document.getElementById(id);
const el=(t,c,x)=>{const e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e};
const cfg=()=>{try{return JSON.parse(localStorage.getItem('fc-sync'))||{}}catch{return {}}},ready=()=>!!(cfg().url&&cfg().key);
const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
async function mac(key,msg){const e=new TextEncoder(),k=await crypto.subtle.importKey('raw',e.encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(await crypto.subtle.sign('HMAC',k,e.encode(msg))).slice(0,12)}
async function staff(path,method,body){const c=cfg(),r=await fetch(c.url.replace(/\/+$/,'')+'/'+path+'?auth='+encodeURIComponent(c.key),{method,headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});if(!r.ok)throw Error('Server '+r.status);return r.json()}

/* ---------- icons (24px line icons, filled softly when the tab is active) ---------- */
document.body.insertAdjacentHTML('afterbegin','<svg width="0" height="0" style="position:absolute" aria-hidden="true">'+
'<symbol id="t-class" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="9" rx="1.6"/><rect x="14" y="3" width="7" height="5" rx="1.6"/><rect x="14" y="12" width="7" height="9" rx="1.6"/><rect x="3" y="16" width="7" height="5" rx="1.6"/></symbol>'+
'<symbol id="t-users" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.6"/><path d="M2.5 20.5v-1a5.5 5.5 0 0 1 5.5-5.5h2a5.5 5.5 0 0 1 5.5 5.5v1z"/><path d="M16 4.6a3.6 3.6 0 0 1 0 6.8"/><path d="M18.5 14.4a5.5 5.5 0 0 1 3 5v1.1"/></symbol>'+
'<symbol id="t-phone" viewBox="0 0 24 24"><rect x="6" y="2.5" width="12" height="19" rx="3"/><path d="M10.5 18.5h3"/></symbol>'+
'<symbol id="t-account" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.2"/><circle cx="12" cy="9.8" r="3"/><path d="M6.3 18.4a6.6 6.6 0 0 1 11.4 0"/></symbol>'+
'<symbol id="t-home" viewBox="0 0 24 24"><path d="M3.5 10.2 12 3l8.5 7.2V19a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><path d="M9.5 21v-6.5h5V21"/></symbol>'+
'<symbol id="t-book" viewBox="0 0 24 24"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/><path d="M8.5 7.5h7"/></symbol>'+
'<symbol id="t-records" viewBox="0 0 24 24"><rect x="4.5" y="3.5" width="15" height="18" rx="2.6"/><path d="M9 3.5h6v2.2a.8.8 0 0 1-.8.8H9.8a.8.8 0 0 1-.8-.8z"/><path d="M8.5 11.5h7M8.5 15.5h4.5"/></symbol>'+
'<symbol id="t-scan" viewBox="0 0 24 24"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M8 12h8"/></symbol>'+
'<symbol id="t-chart" viewBox="0 0 24 24"><path d="M3.5 3.5v15a2 2 0 0 0 2 2h15"/><rect x="7.5" y="11" width="3" height="6" rx=".8"/><rect x="12.5" y="7" width="3" height="10" rx=".8"/><rect x="17.5" y="13" width="3" height="4" rx=".8"/></symbol>'+
'</svg>');

/* ---------- pages added by this file ---------- */
const main=document.querySelector('main'),note=main.querySelector('p.note');
const phones=el('section','page hidden');phones.id='phones';
phones.innerHTML='<div class="tdhead"><div><h1>Open phones</h1><p class="muted">Keep a few student phones open for up to 1 hour</p></div></div>'+
'<div class="card"><p id="phState" class="muted"></p></div>'+
'<div class="card"><div class="qrbox"><canvas id="phQr" hidden></canvas><p id="phHint" class="muted">Connect this phone to online sync to use this.</p><p id="phTimer" class="muted"></p></div></div>'+
'<div class="card"><h2>Phones open now: <span id="phCount">0</span></h2><p class="muted">On a student phone, open the Student app, go to <b>Scan</b>, and scan this code once. That phone then stays open for registration and attendance until the hour ends or the class ends. Students can pass it round: each person still has to pass the face check on this lecturer phone.</p><div class="actions"><button id="phClose" type="button" class="danger">Close all open phones</button></div></div>';
const acct=el('section','page hidden');acct.id='account';
acct.innerHTML='<div class="tdhead"><div><h1>Account</h1><p class="muted">Your sign-in on this phone</p></div></div><div class="card acct"><div class="avatar" id="acAv">?</div><div><b id="acName">—</b><p class="muted" id="acId"></p></div></div><div class="card"><p class="muted" id="acVer"></p><div class="actions"><button id="acOut" type="button" class="danger">Sign out</button></div></div>';
note.before(phones,acct);
/* Scan settings and report exports live on the Account page */
acct.lastElementChild.before($('scanCard'));
acct.lastElementChild.insertAdjacentHTML('beforebegin',`<div class="card"><h2>Export &amp; backup</h2><p class="muted">Export attendance reports, back up your data, or restore a backup.</p><div class="actions"><button id="previewBtn" class="secondary">Preview export</button><button id="exportBtn" class="secondary">Export attendance CSV</button><button id="backupBtn" class="secondary">Backup data</button><label class="upload">Restore backup<input type="file" id="restoreInput" accept=".json,application/json" hidden></label></div></div>`);

for(const [id,prop,fn] of (window.fcLate||[]).splice(0)){const e=$(id);if(e)e[prop]=fn}

/* ---------- tab bar ---------- */
const SETS={
 lecturer:[['class','Class','t-class'],['register','Students','t-users'],['scan','Scan','t-scan'],['phones','Phones','t-phone'],['account','Account','t-account']],
 hod:[['main','Dashboard','t-home'],['lecturers','Lecturers','t-users'],['courses','Courses','t-book'],['attendance','Records','t-records'],['reports','Reports','t-chart']]};
const bar=el('nav','tabbar');bar.id='tabbar';bar.hidden=true;document.body.append(bar);
const dots={};let built='',hvNow='main';
function build(name){if(built===name)return;built=name;bar.replaceChildren();
  for(const [key,label,ic] of SETS[name]){const b=el('button');b.type='button';b.dataset.t=key;
    b.innerHTML='<svg class="ti" aria-hidden="true"><use href="#'+ic+'"/></svg><span></span><i class="dot2" hidden></i>';b.querySelector('span').textContent=label;
    b.onclick=()=>{if(name==='hod'){hvNow=key;window.fcHv&&window.fcHv(key);mark()}else switchTab(key)};bar.append(b)}
  for(const k in dots)window.fcDot(k,dots[k])}
window.fcDot=(k,n)=>{dots[k]=n;const d=bar.querySelector('[data-t="'+k+'"] .dot2');if(d)d.hidden=!n};
function mark(){const name=built,cur=name==='hod'?hvNow:currentTab;bar.querySelectorAll('button').forEach(b=>{const on=b.dataset.t===cur;b.classList.toggle('on',on);if(on)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')})}
function refresh(){const r=window.fcRole&&fcRole(),t=currentTab;let show=false;
  if(r==='lecturer'&&['class','register','phones','account'].includes(t)){build('lecturer');show=true}
  else if(r==='hod'&&t==='hod'){build('hod');show=true}
  bar.hidden=!show;document.body.classList.toggle('hasbar',show);if(show)mark()}
window.addEventListener('fc-hv',e=>{hvNow=e.detail;refresh()});

/* sign-in lands on the right tab; Home is no longer a stop */
const sw0=switchTab;
switchTab=async t=>{if(t==='home'){const r=window.fcRole&&fcRole();if(r==='lecturer')t='class';else if(r==='hod')t='hod'}
  await sw0(t);if(t==='phones')phonesShow();else phonesHide();if(t==='account')acctShow();refresh()};

/* ---------- Account ---------- */
function acctShow(){const m=window.fcMe&&fcMe();$('acName').textContent=m?m.name:'—';$('acId').textContent=m?'Staff ID: '+m.staffId:'';$('acAv').textContent=m&&m.name?m.name.trim()[0].toUpperCase():'?';$('acVer').textContent='App version: '+(window.APP_VERSION||'')}
$('acOut').onclick=()=>{if(confirm('Sign out of this phone?'))window.switchRole()};
/* HOD: sign-out button at the bottom of the dashboard */
const so=el('button','secondary','Sign out');so.type='button';so.onclick=()=>{if(confirm('Sign out of this phone?'))window.switchRole()};
const hm=$('hv-main'),ha=el('div','actions');ha.append(so);hm.append(ha);

/* ---------- Open phones ---------- */
const REG='register',ROT=20;let ptimer=null,pleft=0,pbusy=false,pn=0;
const classOpen=()=>typeof dSes!=='undefined'&&dSes&&dOpen();
const pSid=()=>classOpen()?dSes.id:REG;
async function pDraw(){
  if(!ready()){$('phQr').hidden=true;$('phHint').hidden=false;$('phHint').textContent='Connect this phone to online sync first (use the department share link).';$('phTimer').textContent='';$('phState').textContent='';return}
  const open=classOpen(),sid=pSid(),ts=Math.floor(Date.now()/1000),end=open?Math.floor(new Date(dSes.endsAt)/1000):ts+3600;
  $('phState').textContent=open?'Class running: '+(dSes.code||'')+' · '+(dSes.title||'')+'. Phones opened now can take attendance until the class ends (or 1 hour, whichever comes first), and can register students.':'No class is running. Phones opened now can be used for registration only. Start a class on the Class tab to include attendance.';
  try{const m=await mac(cfg().key,['P',sid,ts.toString(36),end.toString(36)].join('|'));if(currentTab!=='phones')return;
    $('phHint').hidden=true;$('phQr').hidden=false;drawQr($('phQr'),['FC3',sid,ts.toString(36),end.toString(36),m].join('|'),560)}
  catch{$('phHint').hidden=false;$('phHint').textContent='Could not sign the code.'}}
async function pCount(){if(pbusy||!ready()||currentTab!=='phones'||document.hidden)return;pbusy=true;
  try{const r=await staff('p/'+pSid(),'GET');pn=r.n||0;$('phCount').textContent=pn}catch{}finally{pbusy=false}}
function phonesShow(){phonesHide();pleft=ROT;pDraw();pCount();
  ptimer=setInterval(()=>{if(document.hidden)return;pleft--;if(pleft<=0){pleft=ROT;pDraw()}$('phTimer').textContent=ready()?'Refreshes in '+pleft+'s · tap the code to enlarge':'';if(pleft%5===0)pCount()},1000)}
function phonesHide(){if(ptimer){clearInterval(ptimer);ptimer=null}}
$('phQr').onclick=()=>$('phQr').closest('.qrbox').classList.toggle('full');
$('phClose').onclick=async()=>{if(!ready())return;if(!confirm('Close every open student phone? They will need to scan a new code.'))return;
  try{await staff('p/'+pSid()+'/close','POST',{});$('phCount').textContent=0;toast('All open phones closed.')}catch(e){toast('Could not close: '+e.message)}};

/* keep the lecturer phone awake while a class is running, so scans keep being judged */
let wl=null;async function wake(){try{if(wl||!navigator.wakeLock||document.hidden)return;if(window.curLect&&classOpen()){wl=await navigator.wakeLock.request('screen');wl.addEventListener('release',()=>wl=null)}}catch{}}
setInterval(wake,15000);document.addEventListener('visibilitychange',wake);
/* scan page: the top-left button takes the lecturer back to the dashboard */
const bk=$('adminBtn'),bkUse=bk.querySelector('use');bk.onclick=()=>{const r=window.fcRole&&fcRole();switchTab(r==='hod'?'hod':'class')};
const sw2=switchTab;switchTab=async t=>{await sw2(t);if(bkUse)bkUse.setAttribute('href',t==='scan'?'#i-arrow-left':'#i-key')};
setInterval(refresh,1500);
})();
