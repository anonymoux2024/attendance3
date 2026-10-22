/* Tiny offline QR generator: byte mode, EC level L, versions 1-5 (single block). */
function qrMatrix(text){
  const bytes=[...new TextEncoder().encode(text)],dcw=[19,34,55,80,108],ecn=[7,10,15,20,26];
  let v=0;while(v<5&&bytes.length>dcw[v]-2)v++;if(v>=5)return null;
  const ver=v+1,size=17+4*ver,bits=[],put=(x,n)=>{for(let i=n-1;i>=0;i--)bits.push((x>>>i)&1)};
  put(4,4);put(bytes.length,8);bytes.forEach(b=>put(b,8));put(0,Math.min(4,dcw[v]*8-bits.length));while(bits.length%8)bits.push(0);
  const data=[];for(let i=0;i<bits.length;i+=8)data.push(parseInt(bits.slice(i,i+8).join(''),2));
  for(let p=0;data.length<dcw[v];p^=1)data.push(p?0x11:0xEC);
  const exp=[],log=[];let x=1;for(let i=0;i<255;i++){exp[i]=x;log[x]=i;x<<=1;if(x&256)x^=0x11d}
  const mul=(a,b)=>a&&b?exp[(log[a]+log[b])%255]:0,n=ecn[v];
  let gen=[1];for(let i=0;i<n;i++){const r=Array(gen.length+1).fill(0);gen.forEach((g,j)=>{r[j]^=g;r[j+1]^=mul(g,exp[i])});gen=r}
  let rem=Array(n).fill(0);for(const b of data){const f=b^rem.shift();rem.push(0);for(let j=0;j<n;j++)rem[j]^=mul(gen[j+1],f)}
  const cw=data.concat(rem),M=()=>Array.from({length:size},()=>Array(size).fill(0)),m=M(),fn=M();
  const set=(r,c,val)=>{if(r<0||c<0||r>=size||c>=size)return;m[r][c]=val?1:0;fn[r][c]=1};
  const finder=(r,c)=>{for(let i=-1;i<=7;i++)for(let j=-1;j<=7;j++)set(r+i,c+j,i>=0&&i<=6&&j>=0&&j<=6&&Math.max(Math.abs(i-3),Math.abs(j-3))!==2)};
  finder(0,0);finder(0,size-7);finder(size-7,0);
  for(let i=8;i<size-8;i++){set(6,i,i%2==0);set(i,6,i%2==0)}
  if(ver>1){const c=size-7;for(let i=-2;i<=2;i++)for(let j=-2;j<=2;j++)set(c+i,c+j,Math.max(Math.abs(i),Math.abs(j))!==1)}
  const fmt=(mm,mask,mark)=>{let d=(1<<3)|mask,r=d;for(let i=0;i<10;i++)r=(r<<1)^((r>>>9)*0x537);const b=((d<<10)|r)^0x5412,s=(row,col,i)=>{if(mark)fn[row][col]=1;mm[row][col]=(b>>>i)&1};
    for(let i=0;i<=5;i++)s(i,8,i);s(7,8,6);s(8,8,7);s(8,7,8);for(let i=9;i<15;i++)s(8,14-i,i);
    for(let i=0;i<8;i++)s(8,size-1-i,i);for(let i=8;i<15;i++)s(size-15+i,8,i);mm[size-8][8]=1;if(mark)fn[size-8][8]=1};
  fmt(m,0,true);
  let bi=0;const total=cw.length*8;
  for(let right=size-1;right>=1;right-=2){if(right==6)right=5;for(let vert=0;vert<size;vert++)for(let j=0;j<2;j++){const xx=right-j,up=((right+1)&2)==0,yy=up?size-1-vert:vert;if(!fn[yy][xx]&&bi<total){m[yy][xx]=(cw[bi>>3]>>>(7-(bi&7)))&1;bi++}}}
  const MK=[(r,c)=>(r+c)%2==0,(r,c)=>r%2==0,(r,c)=>c%3==0,(r,c)=>(r+c)%3==0,(r,c)=>(Math.floor(r/2)+Math.floor(c/3))%2==0,(r,c)=>r*c%2+r*c%3==0,(r,c)=>(r*c%2+r*c%3)%2==0,(r,c)=>((r+c)%2+r*c%3)%2==0];
  let best=null,bestP=1e9;
  for(let k=0;k<8;k++){const t=m.map(r=>r.slice());for(let r=0;r<size;r++)for(let c=0;c<size;c++)if(!fn[r][c]&&MK[k](r,c))t[r][c]^=1;fmt(t,k,false);
    let p=0;for(let a=0;a<size;a++)for(const g of[(i)=>t[a][i],(i)=>t[i][a]]){let run=1;for(let i=1;i<size;i++){if(g(i)==g(i-1)){run++;if(run==5)p+=3;else if(run>5)p++}else run=1}}
    for(let r=0;r<size-1;r++)for(let c=0;c<size-1;c++)if(t[r][c]==t[r][c+1]&&t[r][c]==t[r+1][c]&&t[r][c]==t[r+1][c+1])p+=3;
    if(p<bestP){bestP=p;best=t}}
  return{size,m:best};
}
function drawQr(canvas,text,px){const q=qrMatrix(text);if(!q)return false;const s=Math.max(2,Math.floor(px/(q.size+8))),w=(q.size+8)*s;canvas.width=canvas.height=w;const g=canvas.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,w,w);g.fillStyle='#000';for(let r=0;r<q.size;r++)for(let c=0;c<q.size;c++)if(q.m[r][c])g.fillRect((c+4)*s,(r+4)*s,s,s);return true}
