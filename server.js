const express=require('express'),http=require('http'),{Server}=require('socket.io');
const app=express(),srv=http.createServer(app),io=new Server(srv);
app.use(express.static(__dirname+'/public'));
const SU=['S','H','D','C'],RK=['7','8','9','10','J','Q','K','A'];
const R=c=>c.slice(0,-1),S=c=>c.slice(-1);
const ORD={sun:['A','10','K','Q','J','9','8','7'],hakm:['J','9','A','10','K','Q','8','7']};
const PT={sun:{A:11,10:10,K:4,Q:3,J:2,9:0,8:0,7:0},hakm:{J:20,9:14,A:11,10:10,K:4,Q:3,8:0,7:0}};
const fs=require('fs');let W={};try{W=JSON.parse(fs.readFileSync('coins.json','utf8'))}catch(e){}
const bal=t=>t in W?W[t]:(W[t]=5000);
const save=()=>fs.writeFile('coins.json',JSON.stringify(W),()=>{});
const rooms=new Map();
const isT=(rm,c)=>rm.mode=='hakm'&&S(c)==rm.trump;
const pw=(rm,c)=>(isT(rm,c)?100:0)+8-(isT(rm,c)?ORD.hakm:ORD.sun).indexOf(R(c));
const cp=(rm,c)=>(isT(rm,c)?PT.hakm:PT.sun)[R(c)];
const beats=(rm,a,b)=>S(a)!=S(b)?isT(rm,a):pw(rm,a)>pw(rm,b);
const legal=(rm,i)=>{const h=rm.hands[i];if(!rm.trick.length)return h;const f=h.filter(c=>S(c)==S(rm.trick[0].card));return f.length?f:h};
const shuf=a=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
const srt=(rm,h)=>h.sort((a,b)=>SU.indexOf(S(a))-SU.indexOf(S(b))||pw(rm,b)-pw(rm,a));

function mk(){let c;do c=''+(1000+Math.floor(Math.random()*9000));while(rooms.has(c));
 const rm={fee:500,pot:0,code:c,seats:[null,null,null,null],host:0,phase:'lobby',dealer:Math.floor(Math.random()*4),hands:[],trick:[],total:[0,0],pts:[0,0],mode:'sun',trump:null,turn:0,bidder:-1,lock:false,cnt:0,passes:0,last:null};
 rooms.set(c,rm);return rm}
function view(rm,i){return{code:rm.code,phase:rm.phase,you:i,host:rm.host,
 seats:rm.seats.map((s,j)=>s&&{name:s.name,av:s.av,bot:!!s.bot,n:(rm.hands[j]||[]).length}),
 hand:rm.hands[i]||[],legal:rm.phase=='play'&&rm.turn==i&&!rm.lock?legal(rm,i):[],
 floor:rm.phase=='bid'?rm.floor:null,mode:rm.mode,trump:rm.trump,bidder:rm.bidder,turn:rm.turn,left:Math.max(0,(rm.dl||0)-Date.now()),fee:rm.fee,prize:rm.prize||0,trick:rm.trick,total:rm.total,last:rm.last}}
function send(rm){tick(rm);rm.seats.forEach((s,i)=>s&&!s.bot&&io.to(s.id).emit('st',view(rm,i)))}
function tick(rm){clearTimeout(rm.tm);if(rm.lock||(rm.phase!='bid'&&rm.phase!='play'))return;
 const t=rm.turn,ph=rm.phase,s=rm.seats[t];if(!s)return;const ms=s.bot?1000:20000;rm.dl=Date.now()+ms;
 rm.tm=setTimeout(()=>{if(rm.lock||rm.turn!=t||rm.phase!=ph)return;if(ph=='bid')bid(rm,t,s.bot?botBid(rm):'pass');else play(rm,t,botPlay(rm))},ms)}
function deal(rm){const d=shuf(SU.flatMap(s=>RK.map(r=>r+s)));
 Object.assign(rm,{hands:[0,1,2,3].map(i=>d.slice(i*5,i*5+5)),floor:d[20],rest:d.slice(21),phase:'bid',turn:(rm.dealer+1)%4,passes:0,mode:'sun',trump:null,trick:[],pts:[0,0],cnt:0,bidder:-1,lock:false});
 rm.hands.forEach(h=>srt(rm,h));send(rm)}
function bid(rm,i,m){if(rm.phase!='bid'||rm.turn!=i)return;
 if(m=='pass'){if(++rm.passes==4){rm.dealer=(rm.dealer+1)%4;return deal(rm)}rm.turn=(i+1)%4}
 else if(m=='sun'||m=='hakm'){rm.mode=m;rm.trump=m=='hakm'?S(rm.floor):null;rm.bidder=i;
  for(let k=0;k<4;k++){const j=(i+k)%4;if(j==i)rm.hands[j].push(rm.floor,...rm.rest.splice(0,2));else rm.hands[j].push(...rm.rest.splice(0,3))}
  rm.hands.forEach(h=>srt(rm,h));rm.phase='play';rm.turn=(rm.dealer+1)%4}
 else return;
 send(rm)}
function play(rm,i,c){if(rm.phase!='play'||rm.turn!=i||rm.lock)return;const h=rm.hands[i];
 if(!h.includes(c)||!legal(rm,i).includes(c))return;
 h.splice(h.indexOf(c),1);rm.trick.push({seat:i,card:c});
 if(rm.trick.length<4){rm.turn=(i+1)%4;return send(rm)}
 rm.lock=true;send(rm);
 setTimeout(()=>{let b=rm.trick[0];for(const t of rm.trick.slice(1))if(beats(rm,t.card,b.card))b=t;
  const tm=b.seat%2;rm.pts[tm]+=rm.trick.reduce((a,t)=>a+cp(rm,t.card),0);rm.cnt++;if(rm.cnt==8)rm.pts[tm]+=10;
  rm.trick=[];rm.lock=false;rm.turn=b.seat;if(rm.cnt<8)return send(rm);endRound(rm)},1500)}
function endRound(rm){const sun=rm.mode=='sun',tot=sun?130:162,need=sun?66:82,cv=x=>Math.round(x/(sun?5:10)),bt=rm.bidder%2,ok=rm.pts[bt]>=need;
 const gp=ok?[cv(rm.pts[0]),cv(rm.pts[1])]:[0,0];if(!ok)gp[1-bt]=cv(tot);
 rm.total=rm.total.map((x,k)=>x+gp[k]);rm.last={pts:rm.pts,gp,ok,bt};
 if(Math.max(...rm.total)>=152&&rm.total[0]!=rm.total[1]){rm.phase='over';payout(rm);return send(rm)}
 rm.phase='score';send(rm);
 rm.tm2=setTimeout(()=>{if(rm.phase!='score')return;rm.dealer=(rm.dealer+1)%4;deal(rm)},5500)}
function payout(rm){const wt=rm.total[0]>rm.total[1]?0:1,ws=rm.seats.filter((s,i)=>i%2==wt&&s&&!s.bot);
 rm.prize=ws.length?Math.floor(rm.pot/ws.length):0;
 ws.forEach(s=>{W[s.tk]=bal(s.tk)+rm.prize;io.to(s.id).emit('coins',W[s.tk])});rm.pot=0;save()}
function botBid(rm){const h=rm.hands[rm.turn],fs=S(rm.floor);
 const n=h.filter(c=>S(c)==fs).length+(h.includes('J'+fs)?2:0)+(h.includes('9'+fs)?1:0)+(R(rm.floor)=='J'?1:0),a=h.filter(c=>R(c)=='A').length;
 return a>=3?'sun':n>=3?'hakm':'pass'}
function botPlay(rm){const l=legal(rm,rm.turn);
 if(!rm.trick.length)return l.reduce((a,c)=>pw(rm,c)>pw(rm,a)?c:a);
 let b=rm.trick[0].card;for(const t of rm.trick.slice(1))if(beats(rm,t.card,b))b=t.card;
 const low=a=>a.reduce((x,c)=>pw(rm,c)<pw(rm,x)?c:x),w=l.filter(c=>beats(rm,c,b));return low(w.length?w:l)}

io.on('connection',so=>{
 const J=(rm,d)=>{if(so.data&&so.data.room)return;const i=rm.seats.findIndex(s=>!s||s.bot);if(i<0)return so.emit('err','الغرفة ممتلئة');
  const tk=String(d.tk||'').slice(0,40);if(!tk)return so.emit('err','أعد تحميل الصفحة');
  if(rm.phase!='lobby')return so.emit('err','اللعبة بدأت');
  if(bal(tk)<rm.fee)return so.emit('err','رصيدك ما يكفي ('+rm.fee+' عملة)');
  W[tk]-=rm.fee;rm.pot+=rm.fee;save();so.emit('coins',W[tk]);
  rm.seats[i]={tk,paid:rm.fee,id:so.id,name:String(d.name||'لاعب').slice(0,12),av:String(d.av||'🦅').slice(0,4)};
  if(!rm.seats.some((s,k)=>k!=i&&s&&!s.bot))rm.host=i;so.data={room:rm.code,seat:i};so.join(rm.code);send(rm);
  if(rm.pub&&rm.seats.every(s=>s&&!s.bot))setTimeout(()=>{if(rm.phase=='lobby'){rm.total=[0,0];deal(rm)}},2500)};
 const me=()=>{const rm=rooms.get((so.data||{}).room);return rm?[rm,so.data.seat]:[]};
 const out=()=>{const[rm,seat]=me();if(!rm)return;so.leave(rm.code);so.data={};
  const sd=rm.seats[seat];
  if(sd&&sd.tk){if(rm.phase=='lobby'){W[sd.tk]=bal(sd.tk)+sd.paid;rm.pot-=sd.paid}
   so.emit('coins',W[sd.tk]);save()}
  rm.seats[seat]=rm.phase=='lobby'?null:{name:'بوت',av:'🤖',bot:true};
  const hs=rm.seats.findIndex(s=>s&&!s.bot);
  if(hs<0){clearTimeout(rm.tm);clearTimeout(rm.tm2);return void rooms.delete(rm.code)}
  if(!rm.seats[rm.host]||rm.seats[rm.host].bot)rm.host=hs;send(rm)};
 so.on('create',d=>{const rm=mk();J(rm,d||{});if(!rm.seats.some(Boolean))rooms.delete(rm.code)});
 so.on('join',d=>{const rm=rooms.get(String((d||{}).code));rm?J(rm,d):so.emit('err','الغرفة غير موجودة')});
 so.on('bots',()=>{const[rm,i]=me();if(!rm||rm.host!=i||rm.phase!='lobby')return;rm.seats=rm.seats.map((s,k)=>s||{name:'بوت '+(k+1),av:'🤖',bot:true});send(rm)});
 so.on('start',()=>{const[rm,i]=me();if(!rm||rm.host!=i||rm.phase!='lobby')return;if(rm.seats.some(s=>!s))return so.emit('err','لازم 4 لاعبين (أضف بوتات)');rm.total=[0,0];deal(rm)});
 so.on('again',()=>{const[rm,i]=me();if(!rm||rm.host!=i||rm.phase!='over')return;const hs=rm.seats.filter(s=>s&&!s.bot);
  if(hs.some(s=>bal(s.tk)<rm.fee))return so.emit('err','رصيد أحد اللاعبين ما يكفي');
  hs.forEach(s=>{W[s.tk]-=rm.fee;rm.pot+=rm.fee;io.to(s.id).emit('coins',W[s.tk])});save();rm.total=[0,0];rm.dealer=(rm.dealer+1)%4;deal(rm)});
 so.on('bid',m=>{const[rm,i]=me();if(rm)bid(rm,i,m)});
 so.on('play',c=>{const[rm,i]=me();if(rm)play(rm,i,c)});
 so.on('say',t=>{const[rm,i]=me();if(rm)io.to(rm.code).emit('say',{seat:i,t:String(t).slice(0,20)})});
 so.on('leave',out);so.on('disconnect',out);
 so.on('hi',t=>{if(t)so.emit('coins',bal(String(t).slice(0,40)))});
 so.on('quick',d=>{let rm=[...rooms.values()].find(r=>r.pub&&r.phase=='lobby'&&r.seats.some(s=>!s));
  if(!rm){rm=mk();rm.pub=true;rm.fee=100;const r=rm;setTimeout(()=>{if(r.phase=='lobby'&&rooms.has(r.code)){r.seats=r.seats.map((s,k)=>s||{name:'بوت '+(k+1),av:'🤖',bot:true});r.total=[0,0];deal(r)}},25000)}
  J(rm,d||{});if(!rm.seats.some(Boolean))rooms.delete(rm.code)});
 so.on('rtc',({to,data})=>{const[rm,i]=me();if(!rm)return;const s=rm.seats[to];if(s&&!s.bot)io.to(s.id).emit('rtc',{from:i,data})});
});
srv.listen(process.env.PORT||3000,()=>console.log('http://localhost:'+(process.env.PORT||3000)));