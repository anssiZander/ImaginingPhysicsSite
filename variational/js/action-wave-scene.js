import { G, clamp } from './model.js';
import { ballisticPoint, fanRays, causticY, energyBranches } from './action-wave.js';
import { DEFAULT_CAMERA, cameraBounds, panCamera, zoomCamera, startFlight, startFanFlight, advanceFlight, flightParticles } from './action-wave-controls.js';

const $ = id => document.getElementById(id);
const canvas = $('wave-canvas'), ctx = canvas.getContext('2d');
const CYAN = '#5ae0d3', VIOLET = '#b79bfa', AMBER = '#ffc779';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const state = { speed: 6, spacing: 2, branch: 'both', rays: true, normals: true,
  probe: { x: 2.3, y: 0.1 }, phase: 0, playing: !reducedMotion.matches,
  camera: { ...DEFAULT_CAMERA }, flight: null, fanFlight: null };
let width = 1, height = 1, scale = 1, xmin = -1, ymin = -1, xmax = 1, ymax = 1;
let grid = null, framePending = false, lastTime = null, pointer = null, pan = null;

const fmt = (value, digits = 2) => (Math.abs(value) < 0.5 * 10 ** -digits ? 0 : value).toFixed(digits);
const px = x => (x - xmin) * scale, py = y => (y - ymin) * scale;
const shown = kind => kind === 'fold' || kind === 'source' || state.branch === 'both' || state.branch === kind;
const colorOf = kind => kind === 'long' ? VIOLET : kind === 'fold' ? AMBER : CYAN;
const phasePeriod = () => state.spacing / (state.speed * state.speed / 2);
function text(id, value) { if ($(id).textContent !== value) $(id).textContent = value; }

function requestFrame() {
  if (framePending || document.hidden) return;
  framePending = true; requestAnimationFrame(frame);
}

function updateCamera() {
  scale = state.camera.scale;
  ({ xmin, xmax, ymin, ymax } = cameraBounds(state.camera, width, height));
  text('zoom-value', `${Math.round(100 * scale / DEFAULT_CAMERA.scale)}%`);
  grid = null;
  requestFrame();
}

function resize() {
  const r = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
  width = Math.max(1, r.width); height = Math.max(1, r.height);
  canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  updateCamera();
}

function buildGrid() {
  const nx = Math.ceil(width / 7), ny = Math.ceil(height / 7), stride = nx + 1;
  const short = new Float64Array(stride * (ny + 1)), long = new Float64Array(short.length);
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    const rays = energyBranches(xmin + i / nx * (xmax - xmin), ymin + j / ny * (ymax - ymin), state.speed);
    const k = j * stride + i;
    short[k] = rays.branches[0]?.W ?? NaN;
    long[k] = (rays.branches[1] ?? rays.branches[0])?.W ?? NaN;
  }
  grid = { nx, ny, stride, short, long, dx: width / nx, dy: height / ny };
}

// Bilinear marching squares, with an asymptotic decider for saddle cells.
// Invalid cells are omitted so no contour bridges the unreachable region.
function contourPath(values, offset, gap) {
  const path = new Path2D(), { nx, ny, stride, dx, dy } = grid;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * stride + i;
    const a = values[k], b = values[k + 1], c = values[k + stride + 1], d = values[k + stride];
    if (!Number.isFinite(a + b + c + d)) continue;
    const lo = Math.min(a, b, c, d), hi = Math.max(a, b, c, d), x = i * dx, y = j * dy;
    for (let n = Math.ceil((lo - offset) / gap); n * gap + offset < hi; n++) {
      const level = n * gap + offset, points = [];
      if ((a < level) !== (b < level)) points.push([x + dx * (level - a) / (b - a), y]);
      if ((b < level) !== (c < level)) points.push([x + dx, y + dy * (level - b) / (c - b)]);
      if ((c < level) !== (d < level)) points.push([x + dx * (level - d) / (c - d), y + dy]);
      if ((d < level) !== (a < level)) points.push([x, y + dy * (level - a) / (d - a)]);
      if (points.length === 4 && (a - level) * (c - level) - (b - level) * (d - level) < 0) points.push(points.shift());
      for (let m = 0; m + 1 < points.length; m += 2) {
        path.moveTo(...points[m]); path.lineTo(...points[m + 1]);
      }
    }
  }
  return path;
}

function strokeFront(path, color, alpha = 0.7) {
  ctx.strokeStyle = color; ctx.globalAlpha = alpha * 0.11; ctx.lineWidth = 5; ctx.stroke(path);
  ctx.globalAlpha = alpha; ctx.lineWidth = 1.15; ctx.stroke(path); ctx.globalAlpha = 1;
}

function drawGrid() {
  const nominal = (ymax - ymin) / 8, base = 10 ** Math.floor(Math.log10(nominal));
  const step = [1, 2, 5, 10].find(n => n * base >= nominal) * base;
  ctx.font = '10px "Segoe UI", sans-serif'; ctx.fillStyle = '#66788e';
  ctx.lineWidth = 1; ctx.strokeStyle = '#93aec00c'; ctx.beginPath();
  for (let x = Math.ceil(xmin / step) * step; x < xmax; x += step) {
    ctx.moveTo(px(x), 0); ctx.lineTo(px(x), height);
    if (Math.abs(x) > step / 10) ctx.fillText(fmt(x, step < 1 ? 1 : 0), px(x) + 5, clamp(py(0) + 17, 60, height - 80));
  }
  for (let y = Math.ceil(ymin / step) * step; y < ymax; y += step) {
    ctx.moveTo(0, py(y)); ctx.lineTo(width, py(y));
    if (Math.abs(y) > step / 10) ctx.fillText(fmt(y, step < 1 ? 1 : 0), 10, py(y) - 6);
  }
  ctx.stroke(); ctx.strokeStyle = '#a7c2dc20'; ctx.beginPath();
  ctx.moveTo(px(0), 0); ctx.lineTo(px(0), height); ctx.moveTo(0, py(0)); ctx.lineTo(width, py(0)); ctx.stroke();
  ctx.fillStyle = '#92a3b8'; ctx.fillText('x / m', width - 39, clamp(py(0) - 10, 60, height - 75));
  ctx.fillText('y / m ↓', 10, height - 13);
}

function causticPath() {
  const path = new Path2D();
  for (let i = 0; i <= 240; i++) {
    const x = xmin + (xmax - xmin) * i / 240, y = causticY(x, state.speed);
    if (i === 0) path.moveTo(px(x), py(y)); else path.lineTo(px(x), py(y));
  }
  return path;
}

function drawForbidden() {
  const p = causticPath(); p.lineTo(width, 0); p.lineTo(0, 0); p.closePath();
  ctx.fillStyle = '#ffc77906'; ctx.fill(p);
}

function drawCaustic() {
  ctx.strokeStyle = AMBER; ctx.globalAlpha = 0.75; ctx.lineWidth = 1.5; ctx.setLineDash([5, 6]);
  ctx.stroke(causticPath()); ctx.setLineDash([]); ctx.globalAlpha = 1;
  const x = px(0), y = py(causticY(0, state.speed));
  if (x < 90 || x > width - 90 || y < 100 || y > height - 35) return;
  ctx.textAlign = 'center'; ctx.font = '11px "Segoe UI", sans-serif'; ctx.fillStyle = '#b4a385';
  ctx.fillText('unreachable at this speed', x, y - 40);
  ctx.fillStyle = AMBER; ctx.fillText('caustic · rays merge', x, y - 20);
  ctx.textAlign = 'left';
}

function rayPath(vx, vy, t) {
  const p = new Path2D(); p.moveTo(px(0), py(0));
  for (let i = 1; i <= 100; i++) {
    const r = ballisticPoint(vx, vy, t * i / 100); p.lineTo(px(r.x), py(r.y));
  }
  return p;
}

function drawFan() {
  if (!state.rays) return;
  ctx.strokeStyle = '#aac0da'; ctx.lineWidth = 0.9; ctx.globalAlpha = 0.16;
  for (const { vx0, vy0 } of fanRays(state.speed)) {
    const t = (-vy0 + Math.sqrt(vy0 * vy0 + 2 * G * Math.max(0, ymax + 0.1))) / G;
    ctx.stroke(rayPath(vx0, vy0, t));
  }
  ctx.globalAlpha = 1;
}

function drawFronts() {
  if (!grid) buildGrid();
  const maxP = Math.sqrt(Math.max(0, state.speed ** 2 + 2 * G * ymax));
  const every = Math.max(1, Math.ceil(3 * maxP / (scale * state.spacing)));
  const offset = (state.phase % every) * state.spacing;
  if (shown('long')) strokeFront(contourPath(grid.long, offset, state.spacing * every), VIOLET, state.branch === 'both' ? 0.47 : 0.8);
  if (shown('short')) strokeFront(contourPath(grid.short, offset, state.spacing * every), CYAN, state.branch === 'both' ? 0.65 : 0.8);
  // Cull unresolved levels only; neither the camera nor the action is rescaled.
  text('front-sampling', every === 1 ? '' : `Showing 1 of every ${every} fronts`);
}

function drawArrow(x, y, vx, vy, color, label) {
  const magnitude = Math.hypot(vx, vy);
  if (magnitude < 1e-7) return;
  const dx = vx / magnitude, dy = vy / magnitude, length = 46;
  const ax = px(x), ay = py(y), bx = ax + dx * length, by = ay + dy * length;
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2; ctx.beginPath();
  ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
  ctx.moveTo(bx - 7 * dx - 4 * dy, by - 7 * dy + 4 * dx); ctx.lineTo(bx, by);
  ctx.lineTo(bx - 7 * dx + 4 * dy, by - 7 * dy - 4 * dx); ctx.stroke();
  // A short tangent at B makes the orthogonality visible even between phase levels.
  ctx.globalAlpha = 0.7; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.beginPath();
  ctx.moveTo(ax - 17 * dy, ay + 17 * dx); ctx.lineTo(ax + 17 * dy, ay - 17 * dx); ctx.stroke();
  ctx.setLineDash([]); ctx.globalAlpha = 1;
  ctx.font = 'italic 13px Georgia, serif'; ctx.fillText(label, bx + 6, by + 3);
}

function probeRays() {
  const { x, y } = state.probe;
  return energyBranches(x, y, state.speed);
}

function drawProbe(result) {
  for (const ray of result.branches) {
    if (!shown(ray.kind) || ray.t === 0) continue;
    const path = rayPath(ray.vx0, ray.vy0, ray.t), color = colorOf(ray.kind);
    ctx.strokeStyle = '#0d1521'; ctx.lineWidth = 6; ctx.stroke(path);
    ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.stroke(path);
    // Equal-time dots describe timing; they are not moving phase crests.
    for (let i = 1; i < 8; i++) {
      const r = ballisticPoint(ray.vx0, ray.vy0, ray.t * i / 8);
      ctx.beginPath(); ctx.arc(px(r.x), py(r.y), 2.5, 0, 2 * Math.PI); ctx.fillStyle = color; ctx.fill();
    }
    if (state.normals) {
      drawArrow(state.probe.x, state.probe.y, ray.px, ray.py, color, ray.kind === 'long' ? 'p₂' : ray.kind === 'short' ? 'p₁' : 'p');
    }
  }
  const x = px(state.probe.x), y = py(state.probe.y);
  ctx.beginPath(); ctx.arc(x, y, 13, 0, 2 * Math.PI); ctx.fillStyle = '#eaf4ff12'; ctx.fill();
  ctx.strokeStyle = result.kind === 'none' ? AMBER : '#dae7f5'; ctx.lineWidth = 1; ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, 5, 0, 2 * Math.PI); ctx.fillStyle = result.kind === 'none' ? AMBER : '#eef6ff'; ctx.fill();
  ctx.font = '600 13px "Segoe UI", sans-serif'; ctx.fillText('B', x + 13, y - 13);
}

function drawSource() {
  const x = px(0), y = py(0), gradient = ctx.createRadialGradient(x, y, 0, x, y, 25);
  gradient.addColorStop(0, '#bfffff55'); gradient.addColorStop(1, '#5ae0d300');
  ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(x, y, 25, 0, 2 * Math.PI); ctx.fill();
  ctx.beginPath(); ctx.arc(x, y, 5, 0, 2 * Math.PI); ctx.fillStyle = '#eefffb'; ctx.fill();
  ctx.font = '600 12px "Segoe UI", sans-serif'; ctx.fillStyle = '#e3f7f3'; ctx.fillText('A', x - 22, y - 13);
  ctx.font = '10px "Segoe UI", sans-serif'; ctx.fillStyle = '#94b9bc'; ctx.fillText('source', x - 43, y + 19);
}

function drawFlight(flight, fan = false) {
  if (!flight) return;
  for (const particle of flightParticles(flight)) {
    const { x, y, t, ray, arrived } = particle, color = colorOf(ray.kind);
    if (fan && !shown(ray.kind)) continue;
    const sx = px(x), sy = py(y);
    if (sx < -25 || sx > width + 25 || sy < -25 || sy > height + 25) continue;
    if (!arrived) for (let i = 9; i > 0; i--) {
      const trailT = t - i * 0.008;
      if (trailT <= 0) continue;
      const trail = ballisticPoint(ray.vx0, ray.vy0, trailT);
      ctx.globalAlpha = 0.45 * (1 - i / 10); ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(px(trail.x), py(trail.y), 3.5 * (1 - i / 12), 0, 2 * Math.PI); ctx.fill();
    }
    ctx.globalAlpha = 1;
    const halo = ctx.createRadialGradient(sx, sy, 0, sx, sy, fan ? 13 : 19);
    halo.addColorStop(0, `${color}80`); halo.addColorStop(1, `${color}00`);
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(sx, sy, fan ? 13 : 19, 0, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = fan ? color : '#f5fffc'; ctx.strokeStyle = color; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(sx, sy, fan ? 4 : arrived && ray.kind === 'long' ? 9 : 6, 0, 2 * Math.PI);
    if (!arrived || ray.kind !== 'long') ctx.fill(); ctx.stroke();
  }
}

function updateReadout(result) {
  text('probe-coordinates', `(${fmt(state.probe.x)}, ${fmt(state.probe.y)}) m`);
  const status = { two: 'Two classical rays · same energy', fold: 'One merged ray · on the caustic', none: 'No ray reaches B at this speed',
    source: 'At the source · direction is not unique' };
  text('ray-status', status[result.kind]);
  $('ray-status').style.color = ['none', 'fold'].includes(result.kind) ? AMBER : '';
  const cards = result.branches.map(ray => {
    const name = { short: 'Short flight', long: 'Long flight', fold: 'Coalesced branches', source: 'Zero-duration limit' }[ray.kind];
    const normal = ray.px === null ? 'Direction undefined' : Math.hypot(ray.px, ray.py) < 1e-7 ? 'p = 0 · no normal' : `|p| = ${fmt(Math.hypot(ray.px, ray.py))} kg·m/s`;
    return `<article class="ray-card ${ray.kind}"><header>${name}<span>${fmt(ray.t)} s</span></header><p><b>W = ${fmt(ray.W)} J·s</b></p><p>${normal}</p></article>`;
  }).join('');
  if ($('ray-details').innerHTML !== cards) $('ray-details').innerHTML = cards;
  const t = (state.phase % 1) * phasePeriod();
  $('wave-time').value = state.phase % 1;
  text('wave-time-value', `${fmt(t)} s`);
  $('wave-time').setAttribute('aria-valuetext', `${fmt(t)} seconds`);
  $('launch-particle').disabled = !result.branches.some(ray => shown(ray.kind) && ray.t > 0);
  const flight = state.flight, arrived = flight && flight.elapsed >= flight.duration;
  text('launch-particle', flight ? arrived ? '↺ Fly A → B again' : '↺ Relaunch A → B' : '● Launch A → B');
  text('flight-time', flight ? arrived ? 'Arrived at B' : `${fmt(flight.elapsed)} / ${fmt(flight.duration)} s` : 'One dot per route');
  const fan = state.fanFlight, finished = fan && fan.elapsed >= fan.duration;
  text('launch-fan', fan ? '↺ Relaunch fan' : '✦ Launch fan');
  text('fan-time', fan ? finished ? 'Burst finished' : `32 particles · ${fmt(fan.elapsed)} s` : 'One burst · 32 particles');
}

function draw() {
  ctx.clearRect(0, 0, width, height);
  drawForbidden();
  drawGrid(); drawFan(); drawFronts();
  drawCaustic();
  const result = probeRays(); drawProbe(result); drawSource(); drawFlight(state.fanFlight, true); drawFlight(state.flight); updateReadout(result);
  ctx.font = '10px "Segoe UI", sans-serif'; ctx.fillStyle = '#7d90a6'; ctx.textAlign = 'right';
  ctx.fillText(`E = ${fmt(state.speed ** 2 / 2)} J · continuous source`, width - 18, height - 17);
  ctx.textAlign = 'left';
}

function frame(now) {
  framePending = false;
  const dt = lastTime === null ? 0 : Math.min((now - lastTime) / 1000, 0.05); lastTime = now;
  if (state.playing && !document.hidden) {
    const elapsed = 0.07 * dt;
    if (state.flight) state.flight = advanceFlight(state.flight, elapsed);
    if (state.fanFlight) state.fanFlight = advanceFlight(state.fanFlight, elapsed);
    state.phase += elapsed / phasePeriod();
  }
  draw();
  if (state.playing) requestFrame(); else lastTime = null;
}

function updatePlay() {
  text('wave-play', state.playing ? 'Ⅱ Pause' : '▶ Play');
  $('wave-play').setAttribute('aria-pressed', String(state.playing));
}

function updateControls() {
  document.querySelectorAll('[data-branch]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.branch === state.branch)));
  $('long-key').hidden = state.branch === 'short';
  document.querySelector('.short-key').hidden = state.branch === 'long';
  $('launch-speed').value = state.speed; $('front-spacing').value = state.spacing;
  text('speed-value', `${fmt(state.speed, 1)} m/s`); text('spacing-value', `${fmt(state.spacing, 2)} J·s`);
  $('ray-fan').checked = state.rays; $('normals').checked = state.normals;
  updatePlay(); requestFrame();
}

function cancelFlight() {
  state.flight = null;
}

function launchParticle() {
  const result = probeRays();
  state.flight = startFlight(state.probe, result.branches.filter(ray => shown(ray.kind)));
  if (!state.flight) return;
  state.playing = true; lastTime = null; updatePlay(); requestFrame();
}

function launchFan() {
  state.fanFlight = startFanFlight(state.speed, ymax);
  state.rays = true;
  state.playing = true; lastTime = null; updateControls();
}
document.querySelectorAll('[data-branch]').forEach(button => button.addEventListener('click', () => {
  if (state.branch === button.dataset.branch) return;
  cancelFlight(); state.branch = button.dataset.branch; updateControls();
}));
$('launch-speed').addEventListener('input', event => { cancelFlight(); state.fanFlight = null; state.speed = Number(event.target.value); grid = null; updateControls(); });
$('front-spacing').addEventListener('input', event => { state.spacing = Number(event.target.value); updateControls(); });
for (const [id, key] of [['ray-fan', 'rays'], ['normals', 'normals']]) $(id).addEventListener('change', event => { state[key] = event.target.checked; requestFrame(); });
$('launch-particle').addEventListener('click', launchParticle);
$('launch-fan').addEventListener('click', launchFan);
$('wave-play').addEventListener('click', () => {
  state.playing = !state.playing; lastTime = null; updatePlay(); requestFrame();
});
$('wave-restart').addEventListener('click', () => {
  state.phase = 0;
  if (state.flight) state.flight = { ...state.flight, elapsed: 0 };
  if (state.fanFlight) state.fanFlight = { ...state.fanFlight, elapsed: 0 };
  lastTime = null; updatePlay(); requestFrame();
});
$('wave-time').addEventListener('input', event => {
  cancelFlight(); state.fanFlight = null; state.playing = false;
  state.phase = Number(event.target.value);
  updatePlay(); requestFrame();
});
$('probe-caustic').addEventListener('click', () => { cancelFlight(); state.probe.y = causticY(state.probe.x, state.speed); requestFrame(); });
$('probe-reset').addEventListener('click', () => { cancelFlight(); state.probe = { x: 2.3, y: 0.1 }; requestFrame(); });
$('view-reset').addEventListener('click', () => { state.camera = { ...DEFAULT_CAMERA }; updateCamera(); });

canvas.addEventListener('wheel', event => {
  event.preventDefault();
  const r = canvas.getBoundingClientRect();
  const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1);
  state.camera = zoomCamera(state.camera, width, height, event.clientX - r.left, event.clientY - r.top, delta);
  updateCamera();
}, { passive: false });

function moveProbe(event) {
  cancelFlight();
  const r = canvas.getBoundingClientRect();
  state.probe = { x: xmin + clamp(event.clientX - r.left, 12, width - 12) / scale,
    y: ymin + clamp(event.clientY - r.top, 12, height - 12) / scale };
  requestFrame();
}
canvas.addEventListener('pointerdown', event => {
  if (pointer !== null || ![0, 1].includes(event.button)) return;
  event.preventDefault(); pointer = event.pointerId; canvas.setPointerCapture(pointer); canvas.focus({ preventScroll: true });
  if (event.button === 1) {
    pan = { x: event.clientX, y: event.clientY }; canvas.style.cursor = 'grabbing';
  } else moveProbe(event);
});
canvas.addEventListener('pointermove', event => {
  if (event.pointerId !== pointer) return;
  if (pan) {
    if (typeof event.buttons === 'number' && !(event.buttons & 4)) { endPointer(); return; }
    event.preventDefault();
    state.camera = panCamera(state.camera, event.clientX - pan.x, event.clientY - pan.y);
    pan = { x: event.clientX, y: event.clientY }; updateCamera();
  } else moveProbe(event);
});
function endPointer() {
  const previous = pointer; pointer = null; pan = null; canvas.style.cursor = '';
  if (previous !== null && canvas.hasPointerCapture(previous)) canvas.releasePointerCapture(previous);
}
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, event => { if (event.pointerId === pointer) endPointer(); });
// Suppress the browser's middle-button autoscroll and auxiliary click action.
for (const type of ['mousedown', 'auxclick']) canvas.addEventListener(type, event => { if (event.button === 1) event.preventDefault(); });
canvas.addEventListener('keydown', event => {
  if (event.key === 'Escape') { endPointer(); canvas.blur(); return; }
  if (['+', '=', '-', '_'].includes(event.key)) {
    event.preventDefault();
    state.camera = zoomCamera(state.camera, width, height, width / 2, height / 2, ['+', '='].includes(event.key) ? -120 : 120);
    updateCamera(); return;
  }
  const steps = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }, step = steps[event.key];
  if (!step) return;
  event.preventDefault(); cancelFlight(); const distance = event.shiftKey ? 0.2 : 0.025;
  state.probe = { x: clamp(state.probe.x + step[0] * distance, xmin + 12 / scale, xmax - 12 / scale),
    y: clamp(state.probe.y + step[1] * distance, ymin + 12 / scale, ymax - 12 / scale) }; requestFrame();
});
window.addEventListener('blur', endPointer);
document.addEventListener('visibilitychange', () => { endPointer(); lastTime = null; if (!document.hidden) requestFrame(); });
reducedMotion.addEventListener('change', event => { if (event.matches) { state.playing = false; updatePlay(); requestFrame(); } });
$('math-open').addEventListener('click', () => { state.playing = false; updatePlay(); $('math-dialog').showModal(); requestFrame(); });
$('math-close').addEventListener('click', () => $('math-dialog').close());
$('math-dialog').addEventListener('click', event => {
  if (event.target !== $('math-dialog')) return;
  const r = $('math-dialog').getBoundingClientRect();
  if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) $('math-dialog').close();
});
window.addEventListener('pageshow', event => {
  if (event.persisted) { location.reload(); return; }
  updateControls();
});
updateControls();
new ResizeObserver(resize).observe(canvas.parentElement);
