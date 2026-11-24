const $=s=>document.querySelector(s);
const LS=(k,d)=>{try{const v=JSON.parse(localStorage.getItem(k));return v??d}catch{return d}};
const save=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
const TF={'1m':{b:'1m',t:'1min'},'5m':{b:'5m',t:'5min'},'15m':{b:'15m',t:'15min'},'1h':{b:'1h',t:'1h'},'4h':{b:'4h',t:'4h'},'1d':{b:'1d',t:'1day'}};
let list=LS('wl',[{src:'binance',sym:'BTCUSDT'},{src:'binance',sym:'ETHUSDT'},{src:'td',sym:'XAU/USD'},{src:'td',sym:'EUR/USD'}]);
let cur=LS('cur',list[0]),tf=LS('tf','5m'),tdKey=LS('tdkey',''),emaOn=LS('ema',true),allLines=LS('lines',{});
let ws=null,timer=null,gen=0,bars=[],draw=false,pl=[];
const key=()=>cur.src+':'+cur.sym;

const chart=LightweightCharts.createChart($('#chart'),{autoSize:true,
 layout:{background:{color:'#0e141b'},textColor:'#7d8da0'},
 grid:{vertLines:{color:'#16202b'},horzLines:{color:'#16202b'}},
 rightPriceScale:{borderColor:'#243243'},timeScale:{borderColor:'#243243',timeVisible:true,secondsVisible:false},
 crosshair:{mode:0}});
const cs=chart.addCandlestickSeries({upColor:'#2bb3a3',downColor:'#ef5b5b',borderVisible:false,wickUpColor:'#2bb3a3',wickDownColor:'#ef5b5b'});
const vol=chart.addHistogramSeries({priceFormat:{type:'volume'},priceScaleId:'',color:'#3a4a5e'});
vol.priceScale().applyOptions({scaleMargins:{top:.85,bottom:0}});
const e20=chart.addLineSeries({color:'#f0b429',lineWidth:1,priceLineVisible:false,lastValueVisible:false});
const e50=chart.addLineSeries({color:'#6aa8ff',lineWidth:1,priceLineVisible:false,lastValueVisible:false});

function ema(n){const k=2/(n+1);let e;return bars.map((b,i)=>{e=i?b.close*k+e*(1-k):b.close;return i>=n-1?{time:b.time,value:e}:{time:b.time,whitespace:true}}).filter(x=>!x.whitespace)}
function paint(){
 cs.setData(bars);
 vol.setData(bars.filter(b=>b.volume>0).map(b=>({time:b.time,value:b.volume,color:b.close>=b.open?'#2bb3a355':'#ef5b5b55'})));
 e20.setData(emaOn?ema(20):[]);e50.setData(emaOn?ema(50):[]);head();
}
function upsert(b){
 const l=bars[bars.length-1];
 if(l&&b.time<l.time)return;
 if(l&&l.time===b.time)bars[bars.length-1]=b;else bars.push(b);
 cs.update(b);if(b.volume>0)vol.update({time:b.time,value:b.volume,color:b.close>=b.open?'#2bb3a355':'#ef5b5b55'});
 if(emaOn){e20.setData(ema(20));e50.setData(ema(50))}head();
}
function head(){
 const l=bars[bars.length-1],p=bars[bars.length-2];if(!l)return;
 $('#price').textContent=l.close.toLocaleString('en',{maximumFractionDigits:6});
 if(p){const c=(l.close/p.close-1)*100;$('#chg').textContent=(c>=0?'+':'')+c.toFixed(2)+'%';$('#chg').style.color=c>=0?'var(--up)':'var(--dn)'}
}
const msg=t=>{$('#msg').textContent=t||''};
const dot=c=>{$('#dot').className=c||''};

async function hist(){
 if(cur.src==='binance'){
  const r=await fetch(`https://api.binance.com/api/v3/klines?symbol=${cur.sym}&interval=${TF[tf].b}&limit=500`);
  const j=await r.json();if(!Array.isArray(j))throw new Error(j.msg||'نماد پیدا نشد');
  return j.map(k=>({time:k[0]/1000,open:+k[1],high:+k[2],low:+k[3],close:+k[4],volume:+k[5]}));
 }
 return td(500);
}
async function td(n){
 if(!tdKey)throw new Error('کلید Twelve Data را در ⚙ تنظیمات وارد کن');
 const r=await fetch(`https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(cur.sym)}&interval=${TF[tf].t}&outputsize=${n}&order=ASC&timezone=UTC&apikey=${tdKey}`);
 const j=await r.json();if(j.status==='error'||!j.values)throw new Error(j.message||'خطا در دریافت داده');
 return j.values.map(v=>{const d=v.datetime;return{time:Date.parse(d.length===10?d+'T00:00:00Z':d.replace(' ','T')+'Z')/1000,open:+v.open,high:+v.high,low:+v.low,close:+v.close,volume:+(v.volume||0)}});
}
function stopLive(){if(ws){ws.onclose=null;ws.close();ws=null}clearInterval(timer);timer=null}
function live(g){
 if(cur.src==='binance'){
  const open=()=>{
   ws=new WebSocket(`wss://stream.binance.com:9443/ws/${cur.sym.toLowerCase()}@kline_${TF[tf].b}`);
   ws.onopen=()=>dot('live');
   ws.onmessage=e=>{const k=JSON.parse(e.data).k;if(g!==gen)return;upsert({time:k.t/1000,open:+k.o,high:+k.h,low:+k.l,close:+k.c,volume:+k.v})};
   ws.onclose=()=>{dot('err');if(g===gen)setTimeout(()=>g===gen&&open(),3000)};
  };open();
 }else{
  dot('live');
  timer=setInterval(async()=>{try{const a=await td(2);if(g!==gen)return;a.forEach(upsert);dot('live')}catch{dot('err')}},20000);
 }
}
async function load(){
 stopLive();const g=++gen;msg('در حال دریافت…');dot('');
 $('#sym').textContent=cur.sym;
 pl.forEach(l=>cs.removePriceLine(l));pl=[];
 try{
  bars=await hist();if(g!==gen)return;
  paint();chart.timeScale().fitContent();msg('');
  (allLines[key()]||[]).forEach(addLine);
  live(g);
 }catch(e){bars=[];paint();msg(e.message);dot('err')}
}
function addLine(price){pl.push(cs.createPriceLine({price,color:'#f0b429',lineWidth:1,lineStyle:2,axisLabelVisible:true}))}
chart.subscribeClick(p=>{
 if(!draw||!p.point)return;const price=cs.coordinateToPrice(p.point.y);if(price==null)return;
 addLine(price);(allLines[key()]??=[]).push(price);save('lines',allLines);setDraw(false);
});
function setDraw(v){draw=v;$('#bDraw').classList.toggle('on',v);msg(v?'روی قیمت مورد نظر روی چارت بزن':'')}

function ui(){
 $('#chips').innerHTML='';list.forEach(s=>{const b=document.createElement('button');b.textContent=s.sym;
  b.className=s.src===cur.src&&s.sym===cur.sym?'on':'';b.onclick=()=>{cur=s;save('cur',cur);ui();load()};$('#chips').append(b)});
 $('#tfs').innerHTML='';Object.keys(TF).forEach(t=>{const b=document.createElement('button');b.textContent=t;
  b.className=t===tf?'on':'';b.onclick=()=>{tf=t;save('tf',t);ui();load()};$('#tfs').append(b)});
 $('#bEma').classList.toggle('on',emaOn);
}
$('#bDraw').onclick=()=>setDraw(!draw);
$('#bClr').onclick=()=>{pl.forEach(l=>cs.removePriceLine(l));pl=[];delete allLines[key()];save('lines',allLines)};
$('#bEma').onclick=()=>{emaOn=!emaOn;save('ema',emaOn);ui();paint()};
$('#bAdd').onclick=()=>$('#dAdd').showModal();
$('#aOk').onclick=()=>{
 const sym=$('#aSym').value.trim().toUpperCase().replace(/\s/g,'');if(!sym)return;
 const s={src:$('#aSrc').value,sym};if(!list.some(x=>x.src===s.src&&x.sym===s.sym))list.push(s);
 save('wl',list);cur=s;save('cur',cur);$('#aSym').value='';$('#dAdd').close();ui();load();
};
$('#bDel').onclick=()=>{
 if(list.length<2||!confirm(`حذف ${cur.sym}؟`))return;
 list=list.filter(x=>!(x.src===cur.src&&x.sym===cur.sym));save('wl',list);cur=list[0];save('cur',cur);ui();load();
};
$('#cfg').onclick=()=>{$('#kKey').value=tdKey;$('#dCfg').showModal()};
$('#kOk').onclick=()=>{tdKey=$('#kKey').value.trim();save('tdkey',tdKey);$('#dCfg').close();if(cur.src==='td')load()};
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
$('#kCsv').onchange=async e=>{
 const f=e.target.files[0];if(!f)return;
 const rows=(await f.text()).trim().split(/\r?\n/).map(r=>r.split(/[,;\t]/));
 const out=rows.map(r=>{
  const t=/^\d+$/.test(r[0])?(+r[0]>1e11?r[0]/1000:+r[0]):Date.parse(r[0].replace(/\./g,'-').replace(' ','T')+(r[0].length>10?'Z':'T00:00:00Z'))/1000;
  return{time:t,open:+r[1],high:+r[2],low:+r[3],close:+r[4],volume:+(r[5]||0)};
 }).filter(b=>b.time&&b.close).sort((a,b)=>a.time-b.time);
 if(!out.length){alert('فایل خوانده نشد');return}
 stopLive();gen++;bars=out;$('#sym').textContent=f.name;dot('');paint();chart.timeScale().fitContent();msg('');$('#dCfg').close();
};
ui();load();
if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js');
