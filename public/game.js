"use strict";
(() => {
const canvas=document.getElementById("game"),ctx=canvas.getContext("2d");
const $=id=>document.getElementById(id);
const COLORS=["#e87568","#e7a44f","#6797d1","#8b79c2","#54a879"];
const state={tool:"road",paused:false,speed:1,week:1,score:0,budget:120,zoom:1,offsetX:0,offsetY:0,vehicles:[],roads:[],lights:new Set(),roundabouts:new Set(),bridges:new Set(),tunnels:new Set(),homes:[],destinations:[],drag:null,hover:null,roadStart:null,elapsed:0,spawn:0,deliveries:0,failed:0,upgrade:false,selectedMap:0,vehicleSpeed:1,capacity:1};
let W=0,H=0,dpr=1,cell=34,cols=0,rows=0,terrain=[],worldW=0,worldH=0,last=performance.now(),toastTimer=0;
const key=(x,y)=>x+","+y, parse=k=>k.split(",").map(Number);
function resize(){const r=canvas.getBoundingClientRect();dpr=Math.min(devicePixelRatio||1,2);W=r.width;H=r.height;canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);cell=Math.max(25,Math.min(38,Math.floor(Math.min(W/17,H/14))));cols=Math.max(15,Math.ceil(W/cell)+4);rows=Math.max(12,Math.ceil(H/cell)+4);worldW=cols*cell;worldH=rows*cell;state.offsetX=(W-worldW)/2;state.offsetY=(H-worldH)/2;makeTerrain();if(!state.homes.length)setupMap();draw();}
function makeTerrain(){
 terrain=[];
 for(let y=0;y<rows;y++){terrain[y]=[];for(let x=0;x<cols;x++){const n=Math.sin(x*.43+y*.17)*.5+Math.cos(y*.31-x*.11)*.5;terrain[y][x]=n>.78?"tree":n<-.78?"grass2":"grass";}}
 for(let y=0;y<rows;y++){const riverX=Math.floor(cols*(.69+.045*Math.sin(y/rows*4.1)));for(let x=0;x<cols;x++)if(Math.abs(x-riverX)<=1.35)terrain[y][x]="water";}
 for(let y=Math.floor(rows*.15);y<Math.floor(rows*.38);y++)for(let x=Math.floor(cols*.15);x<Math.floor(cols*.34);x++)terrain[y][x]="park";
}
function setupMap(){
 const left=2,right=cols-3,top=2,bottom=rows-3,sx=right-left,sy=bottom-top;
 const pts=[
  {h:[left+sx*.35,top+sy*.20],d:[left+sx*.49,top+sy*.48],c:0},
  {h:[left+sx*.29,top+sy*.52],d:[left+sx*.51,top+sy*.70],c:1},
  {h:[left+sx*.17,top+sy*.78],d:[left+sx*.48,top+sy*.83],c:2},
  {h:[left+sx*.54,top+sy*.35],d:[left+sx*.58,top+sy*.58],c:3}
 ];
 state.homes=pts.map((p,i)=>({x:Math.round(p.h[0]),y:Math.round(p.h[1]),c:p.c,id:i}));
 state.destinations=pts.map((p,i)=>({x:Math.round(p.d[0]),y:Math.round(p.d[1]),c:p.c,id:i}));
}function center(x,y){return{x:(x+.5)*cell,y:(y+.5)*cell};}
function screenToGrid(px,py){return{x:Math.floor((px-state.offsetX)/cell),y:Math.floor((py-state.offsetY)/cell)};}
function inBounds(p){return p.x>=0&&p.y>=0&&p.x<cols&&p.y<rows;}
function showToast(msg){$("toast").textContent=msg;$("hint").textContent=msg;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{$("toast").textContent=state.tool==="road"?"Connect homes to destinations of the same colour":"Tool: "+state.tool;$("hint").textContent="Select Road, then drag across the map to build.";},3200);}
function roadExists(a,b){return state.roads.some(r=>(r.a===key(a.x,a.y)&&r.b===key(b.x,b.y))||(r.b===key(a.x,a.y)&&r.a===key(b.x,b.y)));}
function addRoad(a,b){if(!inBounds(a)||!inBounds(b)||Math.abs(a.x-b.x)+Math.abs(a.y-b.y)!==1)return false;if(roadExists(a,b))return true;if(state.budget<=0){showToast("Road budget exhausted — wait for the next week or choose Road funding.");return false;}const ka=key(a.x,a.y),kb=key(b.x,b.y);if((terrain[a.y][a.x]==="water"||terrain[b.y][b.x]==="water")&&!state.bridges.has(ka)&&!state.bridges.has(kb)){showToast("Water blocks construction. Select Bridge first.");return false;}state.roads.push({a:ka,b:kb});state.budget--;return true;}
function removeAt(p){const k=key(p.x,p.y);const before=state.roads.length;state.roads=state.roads.filter(r=>r.a!==k&&r.b!==k);if(before!==state.roads.length){state.budget=Math.min(180,state.budget+Math.min(3,before-state.roads.length));return true;}return false;}
function buildSpecial(p,kind){if(!inBounds(p))return;const k=key(p.x,p.y);if(kind==="light"){if(state.lights.has(k)){state.lights.delete(k);showToast("Traffic light removed.");}else{state.lights.add(k);showToast("Traffic light installed at "+(p.x+1)+", "+(p.y+1)+".");}}else if(kind==="roundabout"){if(state.roundabouts.has(k))state.roundabouts.delete(k);else state.roundabouts.add(k);showToast("Roundabout "+(state.roundabouts.has(k)?"installed.":"removed."));}else if(kind==="bridge"||kind==="tunnel"){const set=kind==="bridge"?state.bridges:state.tunnels;if(set.has(k))set.delete(k);else set.add(k);showToast(kind==="bridge"?"Bridge marker placed — connect roads across water.":"Tunnel entrance marked.");}}
function neighbors(k){const p=parse(k),out=[];for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const x=p[0]+dx,y=p[1]+dy,kk=key(x,y);if(state.roads.some(r=>(r.a===k&&r.b===kk)||(r.b===k&&r.a===kk)))out.push(kk);}return out;}
function findPath(start,end){const s=key(start.x,start.y),g=key(end.x,end.y),q=[s],prev=new Map([[s,null]]);while(q.length){const n=q.shift();if(n===g)break;for(const z of neighbors(n)){if(!prev.has(z)){prev.set(z,n);q.push(z);}}}if(!prev.has(g))return null;const p=[];for(let n=g;n!==null;n=prev.get(n))p.push(n);return p.reverse();}
function routeFor(home){const dest=state.destinations.find(d=>d.c===home.c);return dest?findPath(home,dest):null;}
function connectedCount(){return state.homes.filter(h=>routeFor(h)).length;}
function spawnVehicle(){const available=state.homes.filter(h=>routeFor(h));if(!available.length)return;const h=available[Math.floor(Math.random()*available.length)],path=routeFor(h);if(!path||path.length<2)return;const first=parse(path[0]);if(state.vehicles.some(v=>v.path[v.i]===path[0]&&Math.hypot(v.x-first[0],v.y-first[1])<1))return;state.vehicles.push({x:first[0],y:first[1],path,i:0,t:0,c:h.c,speed:.8+Math.random()*.45,wait:0});}
function update(dt){if(state.paused||state.upgrade)return;dt*=state.speed;state.elapsed+=dt;state.spawn+=dt;if(state.spawn>Math.max(1.6,4.2-state.week*.18)&&state.vehicles.length<Math.min(50,8+state.week*3)*state.capacity){state.spawn=0;spawnVehicle();}
for(const v of state.vehicles){if(v.i>=v.path.length-1){v.done=true;state.score+=100;state.deliveries++;continue;}const next=v.path[v.i+1],cur=v.path[v.i],p=parse(cur),n=parse(next);const at=key(n[0],n[1]);let speed=v.speed*state.vehicleSpeed;if(state.lights.has(at)&&v.t>.65&&Math.floor(state.elapsed/3)%2===0)speed=0;if(state.vehicles.some(o=>o!==v&&!o.done&&o.path[o.i]===next&&Math.hypot(o.x-n[0],o.y-n[1])<.45))speed=0;if(speed===0)v.wait+=dt;else v.wait=Math.max(0,v.wait-dt);v.t+=dt*.72*speed;if(v.t>=1){v.i++;v.t=0;if(v.i>=v.path.length-1){v.done=true;state.score+=100;state.deliveries++;continue;}}const a=parse(v.path[v.i]),b=parse(v.path[Math.min(v.i+1,v.path.length-1)]);v.x=a[0]+(b[0]-a[0])*v.t;v.y=a[1]+(b[1]-a[1])*v.t;}
state.vehicles=state.vehicles.filter(v=>!v.done);
if(state.elapsed>=state.week*32){state.week++;state.budget=Math.min(180,state.budget+22);state.upgrade=true;$("upgradeModal").classList.remove("hidden");showToast("Week "+(state.week-1)+" complete — choose an upgrade.");}
updateHud();}
function updateHud(){const conn=connectedCount(),flow=Math.max(8,Math.min(100,100-state.vehicles.filter(v=>v.wait>.8).length*10-state.vehicles.length*.7));$("week").textContent=String(state.week).padStart(2,"0");$("score").textContent=state.score.toLocaleString();$("traffic").textContent=Math.round(flow)+"%";$("activeCars").textContent=state.vehicles.length;$("connected").textContent=conn+" / "+state.homes.length;$("roadsCount").textContent=state.roads.length+" segments";$("lightsCount").textContent=state.lights.size+" active";$("deliveryCount").textContent=state.deliveries;$("budget").textContent=state.budget;$("budgetFill").style.width=Math.min(100,state.budget/180*100)+"%";$("carFill").style.width=Math.min(100,state.vehicles.length/Math.max(1,8+state.week*3)*100)+"%";$("connectedFill").style.width=conn/state.homes.length*100+"%";$("flowFill").style.width=flow+"%";$("flowValue").textContent=flow>75?"Excellent":flow>45?"Moderate":"Congested";$("tipText").textContent=conn<state.homes.length?"Connect each coloured home to its matching destination. Build around the park and use bridges to cross the river.":flow<50?"Traffic is building up. Try adding an alternate route or managing a busy junction with a traffic light.":"Your network is connected. Keep routes short and avoid unnecessary intersections.";}
function drawTerrain(){
 ctx.fillStyle="#d8d1b9";ctx.fillRect(0,0,worldW,worldH);
 for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
  const p=center(x,y),t=terrain[y][x];
  ctx.fillStyle=t==="park"?"#d8dfbd":t==="tree"?"#d7d1b9":t==="grass2"?"#e4deca":"#e9e3d0";ctx.fillRect(p.x-cell/2,p.y-cell/2,cell+1,cell+1);
  ctx.strokeStyle="rgba(132,124,102,.12)";ctx.lineWidth=.6;ctx.strokeRect(p.x-cell/2,p.y-cell/2,cell,cell);
  if(t==="tree"){ctx.fillStyle="rgba(111,123,91,.18)";ctx.beginPath();ctx.ellipse(p.x+2,p.y+4,cell*.22,cell*.15,0,0,Math.PI*2);ctx.fill();ctx.fillStyle="#9fae85";ctx.beginPath();ctx.arc(p.x,p.y,cell*.17,0,Math.PI*2);ctx.fill();ctx.fillStyle="#b5c49a";ctx.beginPath();ctx.arc(p.x-cell*.06,p.y-cell*.06,cell*.11,0,Math.PI*2);ctx.fill();}
  else if(t==="park"){ctx.fillStyle="#b6c69a";ctx.beginPath();ctx.arc(p.x+Math.sin(x)*cell*.17,p.y+Math.cos(y)*cell*.17,cell*.1,0,Math.PI*2);ctx.fill();}
 }
 const rx=y=>cols*cell*(.69+.045*Math.sin(y/Math.max(1,worldH)*4.1));
 ctx.beginPath();ctx.moveTo(rx(0)-cell*1.45,0);for(let y=0;y<=worldH;y+=8)ctx.lineTo(rx(y)-cell*1.45,y);ctx.lineTo(worldW+cell*2,worldH);ctx.lineTo(worldW+cell*2,0);ctx.closePath();
 const water=ctx.createLinearGradient(worldW*.63,0,worldW,0);water.addColorStop(0,"#50c9d0");water.addColorStop(.45,"#40c6cf");water.addColorStop(1,"#55d3d5");ctx.fillStyle=water;ctx.fill();
 ctx.strokeStyle="rgba(255,255,255,.32)";ctx.lineWidth=1.2;for(let i=0;i<14;i++){const y=25+i*cell*.72,x=rx(y)-cell*1.05;ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x+cell*.28,y-3,x+cell*.55,y+1);ctx.stroke();}
}
function drawRoads(){
 ctx.lineCap="round";ctx.lineJoin="round";
 for(const r of state.roads){const a=parse(r.a),b=parse(r.b),p=center(a[0],a[1]),q=center(b[0],b[1]);
  ctx.strokeStyle="rgba(111,107,91,.26)";ctx.lineWidth=cell*.47;ctx.beginPath();ctx.moveTo(p.x+1,p.y+2);ctx.lineTo(q.x+1,q.y+2);ctx.stroke();
  ctx.strokeStyle="#c7c4b7";ctx.lineWidth=cell*.43;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.stroke();
  ctx.strokeStyle="#e4e0d3";ctx.lineWidth=cell*.34;ctx.beginPath();ctx.moveTo(p.x,p.y-.4);ctx.lineTo(q.x,q.y-.4);ctx.stroke();
 }
 const nodes=new Set();state.roads.forEach(r=>{nodes.add(r.a);nodes.add(r.b);});
 for(const k of nodes){const a=parse(k),p=center(a[0],a[1]);ctx.fillStyle="#c7c4b7";ctx.beginPath();ctx.arc(p.x,p.y,cell*.215,0,Math.PI*2);ctx.fill();ctx.fillStyle="#e4e0d3";ctx.beginPath();ctx.arc(p.x,p.y,cell*.17,0,Math.PI*2);ctx.fill();}
}
function drawSpecials(){for(const k of state.lights){const a=parse(k),p=center(a[0],a[1]);ctx.fillStyle="#34463d";ctx.beginPath();ctx.roundRect(p.x-cell*.14,p.y-cell*.25,cell*.28,cell*.5,3);ctx.fill();for(let i=0;i<3;i++){ctx.fillStyle=["#e86e63","#e6bb5c","#72c681"][i];ctx.beginPath();ctx.arc(p.x,p.y-cell*.14+i*cell*.14,cell*.055,0,Math.PI*2);ctx.fill();}}for(const k of state.roundabouts){const a=parse(k),p=center(a[0],a[1]);ctx.strokeStyle="#a9aaa0";ctx.lineWidth=cell*.23;ctx.beginPath();ctx.arc(p.x,p.y,cell*.3,0,Math.PI*2);ctx.stroke();ctx.strokeStyle="#f8f6ee";ctx.lineWidth=cell*.08;ctx.beginPath();ctx.arc(p.x,p.y,cell*.3,0,Math.PI*2);ctx.stroke();}for(const k of state.bridges){const a=parse(k),p=center(a[0],a[1]);ctx.fillStyle="#c39a69";ctx.fillRect(p.x-cell*.24,p.y-cell*.25,cell*.48,cell*.5);ctx.strokeStyle="#f5e1bb";ctx.lineWidth=2;for(let i=-1;i<=1;i++){ctx.beginPath();ctx.moveTo(p.x-cell*.2,p.y+i*cell*.12);ctx.lineTo(p.x+cell*.2,p.y+i*cell*.12);ctx.stroke();}}for(const k of state.tunnels){const a=parse(k),p=center(a[0],a[1]);ctx.fillStyle="#777e83";ctx.beginPath();ctx.arc(p.x,p.y,cell*.24,Math.PI,Math.PI*2);ctx.fill();ctx.fillStyle="#3d4d4d";ctx.fillRect(p.x-cell*.24,p.y,p.x+cell*.24-(p.x-cell*.24),cell*.15);}}
function drawBuildings(){
 for(const h of state.homes){const p=center(h.x,h.y),c="#c82e58";
  ctx.fillStyle="rgba(78,75,62,.20)";ctx.beginPath();ctx.ellipse(p.x+2,p.y+cell*.27,cell*.48,cell*.23,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle="#f5f0df";ctx.fillRect(p.x-cell*.34,p.y-cell*.18,cell*.68,cell*.48);ctx.fillStyle="#d6d0bd";ctx.fillRect(p.x-cell*.34,p.y+cell*.20,cell*.68,cell*.10);
  ctx.fillStyle=c;ctx.fillRect(p.x-cell*.36,p.y-cell*.34,cell*.72,cell*.49);ctx.fillStyle="rgba(255,255,255,.22)";ctx.fillRect(p.x-cell*.31,p.y-cell*.30,cell*.62,cell*.045);
  ctx.fillStyle="#3c4b4b";ctx.fillRect(p.x-cell*.25,p.y+cell*.09,cell*.5,cell*.13);ctx.fillStyle="#e8e5d8";for(let i=0;i<3;i++)ctx.fillRect(p.x-cell*.19+i*cell*.18,p.y+cell*.12,cell*.08,cell*.08);
  ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(p.x+cell*.23,p.y-cell*.38,cell*.14,0,Math.PI*2);ctx.fill();ctx.fillStyle=c;ctx.beginPath();ctx.arc(p.x+cell*.23,p.y-cell*.38,cell*.105,0,Math.PI*2);ctx.fill();
 }
 for(const d of state.destinations){const p=center(d.x,d.y),c="#1687b5";
  ctx.fillStyle="rgba(78,75,62,.20)";ctx.beginPath();ctx.ellipse(p.x+2,p.y+cell*.28,cell*.5,cell*.23,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle="#f6f1df";ctx.fillRect(p.x-cell*.39,p.y-cell*.22,cell*.78,cell*.48);ctx.fillStyle="#d6d0bd";ctx.fillRect(p.x-cell*.39,p.y+cell*.17,cell*.78,cell*.1);
  ctx.fillStyle=c;ctx.fillRect(p.x-cell*.39,p.y-cell*.32,cell*.78,cell*.17);ctx.fillStyle="#b7d3d2";ctx.fillRect(p.x-cell*.29,p.y-cell*.08,cell*.16,cell*.15);ctx.fillRect(p.x-cell*.06,p.y-cell*.08,cell*.16,cell*.15);ctx.fillRect(p.x+cell*.17,p.y-cell*.08,cell*.12,cell*.15);
  ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(p.x+cell*.33,p.y-cell*.37,cell*.14,0,Math.PI*2);ctx.fill();ctx.fillStyle=c;ctx.beginPath();ctx.arc(p.x+cell*.33,p.y-cell*.37,cell*.105,0,Math.PI*2);ctx.fill();
  ctx.fillStyle="#fff";ctx.font="bold "+Math.max(9,cell*.27)+"px system-ui";ctx.textAlign="center";ctx.fillText("♥",p.x+cell*.33,p.y-cell*.33);
 }
}
function drawVehicles(){for(const v of state.vehicles){const p=center(v.x,v.y),a=parse(v.path[v.i]),b=parse(v.path[Math.min(v.i+1,v.path.length-1)]),ang=Math.atan2(b[1]-a[1],b[0]-a[0]);ctx.save();ctx.translate(p.x,p.y);ctx.rotate(ang);ctx.fillStyle="#53665a";ctx.beginPath();ctx.roundRect(-cell*.24,-cell*.12,cell*.48,cell*.24,cell*.08);ctx.fill();ctx.fillStyle=COLORS[v.c];ctx.beginPath();ctx.roundRect(-cell*.18,-cell*.1,cell*.36,cell*.2,cell*.05);ctx.fill();ctx.fillStyle="#d7e8e4";ctx.fillRect(cell*.02,-cell*.075,cell*.1,cell*.15);ctx.fillStyle="#fff2c2";ctx.fillRect(cell*.2,-cell*.075,cell*.025,cell*.05);ctx.fillRect(cell*.2,cell*.025,cell*.025,cell*.05);ctx.restore();}}
function draw(){if(!W||!H)return;ctx.clearRect(0,0,W,H);ctx.save();ctx.translate(state.offsetX,state.offsetY);drawTerrain();drawRoads();drawSpecials();drawBuildings();drawVehicles();if(state.hover&&inBounds(state.hover)){const p=center(state.hover.x,state.hover.y);ctx.strokeStyle="#4b9468";ctx.lineWidth=2;ctx.setLineDash([4,3]);ctx.strokeRect(p.x-cell/2,p.y-cell/2,cell,cell);ctx.setLineDash([]);}ctx.restore();}
function nearestCell(e){const r=canvas.getBoundingClientRect();return screenToGrid(e.clientX-r.left,e.clientY-r.top);}
canvas.addEventListener("pointermove",e=>{state.hover=nearestCell(e);if(state.drag&&state.tool==="road"){const p=state.hover;if(inBounds(p)){const lastp=state.drag.last;if(lastp.x!==p.x||lastp.y!==p.y){let x=lastp.x,y=lastp.y,guard=0;while((x!==p.x||y!==p.y)&&guard++<100){if(x!==p.x)x+=Math.sign(p.x-x);else y+=Math.sign(p.y-y);addRoad({x:state.drag.last.x,y:state.drag.last.y},{x,y});state.drag.last={x,y};}}}}draw();});
canvas.addEventListener("pointerdown",e=>{canvas.setPointerCapture(e.pointerId);const p=nearestCell(e);if(!inBounds(p))return;if(state.tool==="road"){state.drag={last:p};}else if(state.tool==="erase"){removeAt(p);showToast("Road segments removed.");}else buildSpecial(p,state.tool);updateHud();draw();});
canvas.addEventListener("pointerup",()=>{state.drag=null;updateHud();});
canvas.addEventListener("contextmenu",e=>{e.preventDefault();const p=nearestCell(e);if(inBounds(p)){removeAt(p);updateHud();draw();}});
function setTool(t){state.tool=t;document.querySelectorAll(".tool").forEach(b=>b.classList.toggle("selected",b.dataset.tool===t));const hints={road:"Drag over the map to draw connected road tiles.",erase:"Tap a road tile to remove its connected segments.",light:"Tap a junction to install or remove a traffic signal.",roundabout:"Tap a junction to place a roundabout.",bridge:"Mark water tiles with a bridge, then draw roads across them.",tunnel:"Tap terrain to mark a tunnel entrance."};showToast(hints[t]);}
document.querySelectorAll(".tool").forEach(b=>b.addEventListener("click",()=>setTool(b.dataset.tool)));
document.addEventListener("keydown",e=>{const map={"1":"road","2":"erase","3":"light","4":"roundabout","5":"bridge","6":"tunnel"};if(map[e.key])setTool(map[e.key]);if(e.code==="Space"){e.preventDefault();state.paused=!state.paused;$("pause").textContent=state.paused?"▶":"Ⅱ";}if(e.key==="Escape")state.drag=null;});
$("pause").onclick=()=>{state.paused=!state.paused;$("pause").textContent=state.paused?"▶":"Ⅱ";$("mapStatus").textContent=state.paused?"PAUSED":"LIVE SIMULATION";};
$("speed").onclick=()=>{state.speed=state.speed===1?2:state.speed===2?3:1;$("speed").textContent="▶ "+state.speed+"×";};
$("restart").onclick=()=>{state.vehicles=[];state.roads=[];state.lights.clear();state.roundabouts.clear();state.bridges.clear();state.tunnels.clear();state.score=0;state.week=1;state.budget=120;state.elapsed=0;state.deliveries=0;state.spawn=0;state.paused=false;state.upgrade=false;$("upgradeModal").classList.add("hidden");updateHud();showToast("City reset. Build roads to connect matching colours.");};
$("zoomIn").onclick=()=>{cell=Math.min(55,cell+3);draw();$("zoomText").textContent=Math.round(cell/34*100)+"%";};
$("zoomOut").onclick=()=>{cell=Math.max(20,cell-3);draw();$("zoomText").textContent=Math.round(cell/34*100)+"%";};
$("centerMap").onclick=()=>{state.offsetX=(W-worldW)/2;state.offsetY=(H-worldH)/2;draw();};
$("howTo").onclick=()=>showToast("1 Road: drag to draw. 2 Remove: tap roads. 3 Signal: tap a junction. Connect each home with the destination of the same colour.");
document.querySelectorAll(".upgrade").forEach(b=>b.onclick=()=>{const u=b.dataset.upgrade;if(u==="budget")state.budget=Math.min(180,state.budget+45);if(u==="speed")state.vehicleSpeed*=1.15;if(u==="capacity")state.capacity*=1.15;state.upgrade=false;$("upgradeModal").classList.add("hidden");showToast("Upgrade applied: "+b.querySelector("b").textContent);});
function loop(now){const dt=Math.min(.05,(now-last)/1000);last=now;update(dt);draw();requestAnimationFrame(loop);}
window.__trafficFlowDebug=()=>({week:state.week,roads:state.roads.length,cars:state.vehicles.length,homes:state.homes.length,connected:connectedCount(),score:state.score,budget:state.budget});
new ResizeObserver(resize).observe(canvas);resize();updateHud();showToast("Connect homes to destinations of the same colour");requestAnimationFrame(loop);
})();