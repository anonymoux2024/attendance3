"use strict";
/* FEG-TECH 4.7: "Student database" and "Online Sync & Settings" moved from the HOD dashboard to Reports, each in its own collapsible section.
   The elements keep their ids, so everything that already works with them keeps working. "Change HOD PIN" stays on the dashboard. */
(()=>{
const $=id=>document.getElementById(id),rep=$('hv-reports'),sync=$('syncCard'),pin=$('pinChange');
if(!rep||!sync)return;
const NS='http://www.w3.org/2000/svg';
const ic=n=>{const s=document.createElementNS(NS,'svg'),u=document.createElementNS(NS,'use');s.setAttribute('class','ic');s.setAttribute('aria-hidden','true');u.setAttribute('href','#i-'+n);s.append(u);return s};
function fold(id,title,icon,cls){const d=document.createElement('details');d.className='fold'+(cls?' '+cls:'');d.id=id;
  const s=document.createElement('summary'),t=document.createElement('span'),ch=document.createElement('i'),b=document.createElement('div');
  t.textContent=title;ch.className='chev';b.className='foldbody';s.append(ic(icon),t,ch);d.append(s,b);return{d,b}}
function plain(el){el.classList.remove('card');const h=el.querySelector('h2');if(h)h.remove()}
/* Change HOD PIN stays on the dashboard, in its own small card where the sync card used to be */
if(pin){const sec=document.createElement('div');sec.className='card';sec.id='secCard';const h2=document.createElement('h2');h2.textContent='Security';sec.append(h2,pin);sync.before(sec)}
/* red Online Sync & Settings section with a warning */
const fs=fold('foldSync','Online Sync & Settings','cloud','danger');
const warn=document.createElement('div');warn.className='warnbox';warn.setAttribute('role','note');
warn.innerHTML='<b>Do not change anything here.</b><p>These settings connect every phone to the shared attendance data. A wrong change can stop syncing or cut phones off from each other, and it can be hard to undo.</p><p>If something is not working, <strong>seek support</strong> from Feg-tech or your system administrator before you touch anything.</p>';
plain(sync);fs.b.append(warn,sync);
/* Student database section */
const fr=fold('foldRoster','Student database','users');
let ros=$('rosterHodCard');
if(ros){plain(ros);fr.b.append(ros)}
rep.append(fr.d,fs.d);
if(!ros)setTimeout(()=>{ros=$('rosterHodCard');if(ros){plain(ros);fr.b.append(ros)}},800);
})();
