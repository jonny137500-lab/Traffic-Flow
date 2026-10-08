"use strict";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");
const statusEl = document.getElementById("status");

let W = innerWidth, H = innerHeight, dpr = 1;
let paused = false, score = 0, last = performance.now(), spawnT = 0, nextCarId = 0;
let roadMode = false, removeMode = false;
const junctionLocks = new Map();
const nodes = [], edges = [], cars = [], houses = [], targets = [];
const lights = new Map();
const COLORS = ["#ff6b6b", "#58a6ff", "#ffd166", "#7ee787", "#c084fc", "#fb923c"];

function resize() {
  dpr = Math.min(devicePixelRatio || 1, 2);
  W = innerWidth; H = innerHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = W + "px"; canvas.style.height = H + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!nodes.length) buildMap();
}
addEventListener("resize", resize);

function addNode(x, y) {
  nodes.push({ id: nodes.length, x, y });
  return nodes[nodes.length - 1];
}
function addEdge(a, b) {
  if (a === b || edges.some(e => (e.a === a && e.b === b) || (e.a === b && e.b === a))) return;
  edges.push({ id: edges.length, a, b, length: 0 });
}
function buildMap() {
  const x = [W * .16, W * .50, W * .84];
  const y = [H * .22, H * .50, H * .78];
  for (const yy of y) for (const xx of x) addNode(xx, yy);

  const links = [[0,1],[1,2],[3,4],[4,5],[6,7],[7,8],[0,3],[3,6],[1,4],[4,7],[2,5],[5,8]];
  links.forEach(([a,b]) => addEdge(a,b));

  // Extra diagonals make routing choices instead of forcing every car through one junction.
  [[1,3],[1,5],[3,7],[5,7]].forEach(([a,b]) => addEdge(a,b));

  edges.forEach(e => e.length = Math.hypot(nodes[e.b].x - nodes[e.a].x, nodes[e.b].y - nodes[e.a].y));

  const starts = [0, 2, 6];
  const ends = [8, 6, 2];
  starts.forEach((node, i) => houses.push({ node, color: COLORS[i] }));
  ends.forEach((node, i) => targets.push({ node, color: COLORS[i] }));

  // Signalised junctions. Each signal controls two non-conflicting approaches.
  [1,3,4,5,7].forEach(node => lights.set(node, {
    phase: Math.random() * 2,
    green: 0,
    yellow: false,
    cycle: 9,
    yellowTime: 1.2,
    ns: 4.2,
    ew: 4.2
  }));
}

function neighbors(n) {
  const out = [];
  for (const e of edges) {
    if (e.a === n) out.push({ n: e.b, edge: e });
    else if (e.b === n) out.push({ n: e.a, edge: e });
  }
  return out;
}
function pathfind(start, goal) {
  const q = [start], prev = new Map([[start, null]]);
  while (q.length) {
    const n = q.shift();
    if (n === goal) break;
    for (const { n: x } of neighbors(n)) {
      if (!prev.has(x)) { prev.set(x, n); q.push(x); }
    }
  }
  if (!prev.has(goal)) return null;
  const path = [];
  for (let n = goal; n !== null; n = prev.get(n)) path.push(n);
  return path.reverse();
}
function directionAt(nodeId, fromId, toId) {
  const n = nodes[nodeId], from = nodes[fromId], to = nodes[toId];
  const inAngle = Math.atan2(n.y - from.y, n.x - from.x);
  const outAngle = Math.atan2(to.y - n.y, to.x - n.x);
  let d = Math.abs(Math.atan2(Math.sin(outAngle - inAngle), Math.cos(outAngle - inAngle)));
  // Horizontal approaches share the EW phase, vertical/diagonal approaches use the NS phase.
  const horizontal = Math.abs(Math.cos(inAngle)) > Math.abs(Math.sin(inAngle));
  return { horizontal, turn: d };
}
function signalState(nodeId, fromId, toId) {
  const l = lights.get(nodeId);
  if (!l) return "green";
  const t = l.phase % l.cycle;
  const horizontal = directionAt(nodeId, fromId, toId).horizontal;
  const greenStart = horizontal ? 0 : 4.2;
  const greenEnd = greenStart + 4.2;
  const yellowStart = greenEnd;
  const yellowEnd = yellowStart + l.yellowTime;
  const local = t;
  if (local >= yellowStart && local < yellowEnd) return horizontal ? "yellow" : "red";
  if (local >= greenStart && local < greenEnd) return "green";
  // The NS phase wraps through the end of the cycle.
  return horizontal
    ? "red"
    : (local >= 4.2 && local < 8.4 ? "green" : "red");
}
function updateLights(dt) {
  for (const l of lights.values()) l.phase = (l.phase + dt) % l.cycle;
}
function spawn() {
  const h = houses[Math.floor(Math.random() * houses.length)];
  const t = targets.find(x => x.color === h.color);
  if (!t) return;
  const p = pathfind(h.node, t.node);
  if (!p || p.length < 2) return;
  const n = nodes[p[0]], next = nodes[p[1]];
  if (cars.some(c => Math.hypot(c.x - n.x, c.y - n.y) < 38)) return;
  cars.push({
    id: ++nextCarId, color: h.color, path: p, seg: 0, t: 0,
    speed: 0, x: n.x, y: n.y,
    angle: Math.atan2(next.y - n.y, next.x - n.x),
    done: false, stuck: 0, wait: 0
  });
}
function edgeFor(a, b) {
  return edges.find(e => (e.a === a && e.b === b) || (e.a === b && e.b === a));
}
function canEnterJunction(c, nextNode) {
  const pathNext = c.path[c.seg + 2];
  if (pathNext == null) return true;
  const state = signalState(nextNode, c.path[c.seg], pathNext);
  if (state === "green") return true;
  // Reserve a small box around the junction: never enter on red/yellow.
  const n = nodes[nextNode];
  return Math.hypot(c.x - n.x, c.y - n.y) > 42;
}
function frontCar(c) {
  let closest = null, best = Infinity;
  for (const o of cars) {
    if (o === c || o.done || o.path[o.seg] !== c.path[c.seg] || o.path[o.seg + 1] !== c.path[c.seg + 1]) continue;
    const dx = o.x - c.x, dy = o.y - c.y;
    const ahead = dx * Math.cos(c.angle) + dy * Math.sin(c.angle);
    const side = Math.abs(-dx * Math.sin(c.angle) + dy * Math.cos(c.angle));
    if (ahead > 0 && ahead < 80 && side < 15 && ahead < best) { best = ahead; closest = o; }
  }
  return { car: closest, distance: best };
}
function junctionAvailable(nodeId, carId) {
  const owner = junctionLocks.get(nodeId);
  return owner == null || owner === carId;
}
function reserveJunction(c, nodeId) {
  if (nodeId == null || junctionAvailable(nodeId, c.id)) {
    if (nodeId != null) junctionLocks.set(nodeId, c.id);
    return true;
  }
  return false;
}
function releaseJunction(c) {
  for (const [nodeId, owner] of junctionLocks) if (owner === c.id) junctionLocks.delete(nodeId);
}
function releaseJunctionsBehind(c) {
  for (const [nodeId, owner] of junctionLocks) {
    if (owner === c.id && c.path[c.seg] === nodeId && c.t > 0.32) junctionLocks.delete(nodeId);
  }
}
function update(dt) {
  updateLights(dt);
  spawnT += dt;
  if (spawnT > .68 && cars.length < 90) { spawnT = 0; spawn(); }

  const step = Math.min(dt, .05);
  for (const c of cars) {
    if (c.done) continue;

    const a = nodes[c.path[c.seg]], b = nodes[c.path[c.seg + 1]];
    if (!a || !b) { c.done = true; continue; }

    const edgeLen = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
    const remaining = edgeLen * (1 - c.t);
    let desired = 118;

    // Stop before a red/yellow signal.
    const junction = c.path[c.seg + 1];
    if (c.path[c.seg + 2] != null && remaining < 62 && !canEnterJunction(c, junction)) {
      desired = 0;
    }
    if (c.path[c.seg + 2] != null && remaining < 38 && !reserveJunction(c, junction)) {
      desired = 0;
    }

    // Keep a hard minimum gap on the same road direction.
    const { car: lead, distance } = frontCar(c);
    if (lead) desired = Math.min(desired, Math.max(0, (distance - 26) * 4.5));

    const acc = desired > c.speed ? 260 : -420;
    c.speed = Math.max(0, Math.min(desired, c.speed + acc * step));
    c.t += c.speed * step / edgeLen;
    releaseJunctionsBehind(c);

    if (c.t >= 1) {
      const nextNode = c.path[c.seg + 1];
      if (c.path[c.seg + 2] != null && !reserveJunction(c, nextNode)) {
        c.t = 0.985;
        c.speed = 0;
      } else {
        c.t = 0;
        c.seg++;
        if (c.seg >= c.path.length - 1) {
          c.done = true;
          releaseJunction(c);
          score += 100;
          continue;
        }
      }
    }

    const aa = nodes[c.path[c.seg]], bb = nodes[c.path[c.seg + 1]];
    c.x = aa.x + (bb.x - aa.x) * c.t;
    c.y = aa.y + (bb.y - aa.y) * c.t;
    c.angle = Math.atan2(bb.y - aa.y, bb.x - aa.x);

    c.stuck = c.speed < 3 ? c.stuck + step : Math.max(0, c.stuck - step * 2);
    // Deadlock recovery: reroute a stationary car rather than letting a jam grow forever.
    if (c.stuck > 7) {
      const goal = c.path[c.path.length - 1];
      const np = pathfind(c.path[c.seg], goal);
      if (np && np.length > 1) { c.path = np; c.seg = 0; c.t = 0; c.speed = 0; }
      c.stuck = 0;
    }
  }
  for (let i = cars.length - 1; i >= 0; i--) if (cars[i].done) cars.splice(i, 1);
}

function drawRoad(e) {
  const a = nodes[e.a], b = nodes[e.b];
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
  ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(ang);
  ctx.fillStyle = "#303841"; ctx.fillRect(0, -17, len, 34);
  ctx.strokeStyle = "#69737d"; ctx.lineWidth = 1; ctx.strokeRect(0, -17, len, 34);
  ctx.strokeStyle = "#ffffff38"; ctx.lineWidth = 2; ctx.setLineDash([12, 12]);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len, 0); ctx.stroke(); ctx.setLineDash([]);
  ctx.restore();
}
function drawTrafficLight(nodeId) {
  const n = nodes[nodeId], l = lights.get(nodeId);
  const phase = l.phase % l.cycle;
  const nsGreen = phase >= 4.2 && phase < 8.4;
  const nsYellow = phase >= 8.4 && phase < 9;
  ctx.save(); ctx.translate(n.x, n.y);
  ctx.fillStyle = "#0b0f13"; ctx.fillRect(-26, -29, 52, 14);
  ctx.fillStyle = nsGreen ? "#303030" : "#49df6f"; ctx.beginPath(); ctx.arc(-13, -22, 4.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = nsYellow ? "#ffd34d" : "#303030"; ctx.beginPath(); ctx.arc(0, -22, 4.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = nsGreen ? "#303030" : "#ff5151"; ctx.beginPath(); ctx.arc(13, -22, 4.2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
function drawBuilding(n, color, house) {
  ctx.save(); ctx.translate(n.x, n.y);
  ctx.fillStyle = color; ctx.globalAlpha = .92;
  ctx.beginPath(); ctx.arc(0, 0, house ? 15 : 19, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1; ctx.fillStyle = "#10151b"; ctx.font = "bold 12px system-ui";
  ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(house ? "⌂" : "●", 0, 1); ctx.restore();
}
function draw() {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#182028"; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#ffffff04"; ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  edges.forEach(drawRoad);
  houses.forEach(h => drawBuilding(nodes[h.node], h.color, true));
  targets.forEach(t => drawBuilding(nodes[t.node], t.color, false));
  lights.forEach((_, id) => drawTrafficLight(id));

  for (const c of cars) {
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.angle);
    ctx.fillStyle = "#0c1014"; ctx.fillRect(-12, -7, 24, 14);
    ctx.fillStyle = c.color; ctx.fillRect(-9, -6, 16, 12);
    ctx.fillStyle = "#d9efff"; ctx.fillRect(0, -5, 6, 10);
    ctx.fillStyle = "#fff"; ctx.globalAlpha = .6; ctx.fillRect(8, -4, 2, 2); ctx.fillRect(8, 2, 2, 2);
    ctx.restore();
  }
  for (const n of nodes) {
    ctx.fillStyle = "#69747e"; ctx.beginPath(); ctx.arc(n.x, n.y, 3.5, 0, Math.PI * 2); ctx.fill();
  }
  scoreEl.textContent = score.toLocaleString();
  statusEl.textContent = paused ? "PAUSED" : cars.length + " CARS";
}
function loop(now) {
  const dt = Math.min(.1, (now - last) / 1000); last = now;
  if (!paused) update(dt);
  draw(); requestAnimationFrame(loop);
}

// Road editing: drag between junctions to add/remove roads.
let dragNode = null, pointerX = 0, pointerY = 0;
function hitNode(x, y) {
  let best = null, d = 22;
  for (const n of nodes) { const dd = Math.hypot(n.x - x, n.y - y); if (dd < d) { d = dd; best = n; } }
  return best;
}
canvas.addEventListener("pointermove", e => { pointerX = e.clientX; pointerY = e.clientY; });
canvas.addEventListener("pointerdown", e => {
  if (!roadMode) return;
  const n = hitNode(e.clientX, e.clientY);
  if (n) { dragNode = n; canvas.setPointerCapture(e.pointerId); }
});
canvas.addEventListener("pointerup", e => {
  if (!roadMode || !dragNode) return;
  const n = hitNode(e.clientX, e.clientY);
  if (n && n !== dragNode) {
    if (removeMode) {
      const i = edges.findIndex(x => (x.a === dragNode.id && x.b === n.id) || (x.a === n.id && x.b === dragNode.id));
      if (i >= 0) edges.splice(i, 1);
    } else addEdge(dragNode.id, n.id);
  }
  dragNode = null;
});
canvas.addEventListener("contextmenu", e => {
  e.preventDefault();
  let best = null, bd = 28;
  for (const edge of edges) {
    const a = nodes[edge.a], b = nodes[edge.b], vx = b.x - a.x, vy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((e.clientX - a.x) * vx + (e.clientY - a.y) * vy) / (vx * vx + vy * vy)));
    const d = Math.hypot(e.clientX - (a.x + vx * t), e.clientY - (a.y + vy * t));
    if (d < bd) { bd = d; best = edge; }
  }
  if (best) edges.splice(edges.indexOf(best), 1);
});

function setTool(mode) {
  roadMode = mode !== "drive";
  removeMode = mode === "erase";
  document.querySelectorAll(".tool").forEach(b => b.classList.remove("active"));
  document.getElementById(mode === "drive" ? "driveTool" : mode === "road" ? "roadTool" : "eraseTool").classList.add("active");
  canvas.style.cursor = roadMode ? "crosshair" : "default";
  document.getElementById("help").textContent =
    mode === "road" ? "修路中 · 从一个路口拖到另一个路口" :
    mode === "erase" ? "拆路中 · 从一个路口拖到另一个路口，或右键道路" :
    "驾驶中 · 交通灯自动控制车辆";
}
document.getElementById("driveTool").onclick = () => setTool("drive");
document.getElementById("roadTool").onclick = () => setTool("road");
document.getElementById("eraseTool").onclick = () => setTool("erase");

document.getElementById("pause").onclick = () => paused = !paused;
document.getElementById("reset").onclick = () => {
  cars.length = 0; score = 0; spawnT = 0; junctionLocks.clear();
  for (const l of lights.values()) l.phase = Math.random() * l.cycle;
};
resize();
for (let i = 0; i < 3; i++) spawn();
window.__trafficFlowDebug = () => ({cars:cars.length, score, paused, edges:edges.length, lights:[...lights].map(([id,l])=>({id,phase:l.phase})), nodes:nodes.map(n=>({id:n.id,x:n.x,y:n.y}))});
requestAnimationFrame(loop);
