/* Change ONLY the number below when the app is updated, e.g. 'FEG-TECH 6.0'. It labels the app AND names the saved offline copy
   (sw.js reads this file), so a new number is what tells every phone "a new version is available". */
var APP_VERSION='FEG-TECH 5.1';
if(typeof document!=='undefined'){window.APP_VERSION=APP_VERSION;document.addEventListener('DOMContentLoaded',()=>document.querySelectorAll('.ver').forEach(e=>e.textContent=window.APP_VERSION))}
