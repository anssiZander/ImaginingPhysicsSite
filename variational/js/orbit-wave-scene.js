import { clamp } from './model.js';
import { MU, SOURCE, DEFAULT_ORBIT_CAMERA, orbitFamily, orbitFan, orbitPoint,
  orbitAtAction, orbitAtTime, orbitBranches, orbitCaustic } from './orbit-wave.js';
import { cameraBounds, panCamera, zoomCamera, advanceFlight } from './action-wave-controls.js';
import { startOrbitFlight, startOrbitFan, orbitParticles } from './orbit-wave-controls.js';

const $ = id => document.getElementById(id);
const canvas = $('wave-canvas'), ctx = canvas.getContext('2d');
const CYAN = '#5ae0d3', VIOLET = '#b79bfa', AMBER = '#ffc779', TAU = 2 * Math.PI;
const MASS_MARKER_RADIUS = 0.14;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const state = { speed: 1.8, spacing: 1.5, branch: 'both', fronts: true, rays: true, normals: true,
  probe: { x: 1.2, y: 0.8 }, phase: 0, playing: !reducedMotion.matches,
  camera: { ...DEFAULT_ORBIT_CAMERA }, flight: null, fanFlight: null };
let width = 1, height = 1, scale = 1, xmin = -1, xmax = 1, ymin = -1, ymax = 1;
let family, frontRays, guideRays, geometry = null, probeCache = null;
let framePending = false, lastTime = null, pointer = null, pan = null;
const fmt = (v, digits = 2) => (Math.abs(v) < 0.5 * 10 ** -digits ? 0 : v).toFixed(digits);
const px = x => (x - xmin) * scale, py = y => (y - ymin) * scale;
const shown = kind => kind === 'fold' || state.branch === 'both' || state.branch === kind;
const colorOf = kind => kind === 'after' ? VIOLET : kind === 'fold' ? AMBER : CYAN;
const phasePeriod = () => state.spacing / family.phaseEnergy;
function text(id, value) { if ($(id).textContent !== value) $(id).textContent = value; }

function requestFrame() {
  if (framePending || document.hidden) return;
  framePending = true; requestAnimationFrame(frame);
}

function rebuildFamily() {
  family = orbitFamily(state.speed);
  frontRays = orbitFan(state.speed, 512, 128);
  guideRays = orbitFan(state.speed, 32, 128);
  geometry = null; probeCache = null;
}

function updateCamera() {
  scale = state.camera.scale;
  ({ xmin, xmax, ymin, ymax } = cameraBounds(state.camera, width, height));
  text('zoom-value', `${Math.round(100 * scale / DEFAULT_ORBIT_CAMERA.scale)}%`);
  geometry = null; probeCache = null; requestFrame();
}

function resize() {
  const rect = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
  width = Math.max(1, rect.width); height = Math.max(1, rect.height);
  canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); updateCamera();
}

function rayPath(ray, endS = ray.maxS) {
  const path = new Path2D(); path.moveTo(px(SOURCE.x), py(SOURCE.y));
  for (let i = 1; i <= 192; i++) {
    const p = orbitPoint(ray, endS * i / 192); path.lineTo(px(p.x), py(p.y));
  }
  return path;
}

function buildGeometry() {
  const envelope = orbitCaustic(state.speed), caustic = new Path2D();
  let previous = null;
  for (let i = 0; i <= frontRays.length; i++) {
    const ray = frontRays[i % frontRays.length];
    if (ray.foldS > ray.maxS) { previous = null; continue; }
    const point = orbitPoint(ray, ray.foldS);
    if (previous) { caustic.moveTo(px(previous.x), py(previous.y)); caustic.lineTo(px(point.x), py(point.y)); }
    previous = point;
  }
  geometry = { envelope, caustic, fan: guideRays.map(ray => rayPath(ray)) };
}

function drawGrid() {
  const nominal = (ymax - ymin) / 8, base = 10 ** Math.floor(Math.log10(nominal));
  const step = [1, 2, 5, 10].find(n => n * base >= nominal) * base;
  ctx.font = '10px "Segoe UI", sans-serif'; ctx.fillStyle = '#66788e';
  ctx.lineWidth = 1; ctx.strokeStyle = '#93aec00c'; ctx.beginPath();
  for (let x = Math.ceil(xmin / step) * step; x < xmax; x += step) {
    ctx.moveTo(px(x), 0); ctx.lineTo(px(x), height);
    if (Math.abs(x) > step / 10) ctx.fillText(fmt(x, step < 1 ? 1 : 0), px(x) + 5, clamp(py(0) + 17, 65, height - 80));
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

function drawBackdrop() {
  const e = geometry.envelope;
  ctx.beginPath(); ctx.rect(0, 0, width, height);
  ctx.ellipse(px(e.x), py(e.y), e.a * scale, e.b * scale, 0, 0, TAU);
  ctx.fillStyle = '#ffc77905'; ctx.fill('evenodd');
  drawGrid();
  if (state.rays) {
    ctx.strokeStyle = '#abc2db'; ctx.lineWidth = 0.8; ctx.globalAlpha = 0.17;
    for (const path of geometry.fan) ctx.stroke(path);
    ctx.globalAlpha = 1;
  }
}

function drawFronts() {
  if (!state.fronts) { text('front-sampling', ''); return; }
  // Fronts inside the opaque marker are hidden. The much smaller numerical
  // cutoff must not thin the visible wave field over the entire canvas.
  const maxP = Math.sqrt(2 * (family.energy + MU / MASS_MARKER_RADIUS));
  const every = Math.max(1, Math.ceil(3 * maxP / (scale * state.spacing)));
  const gap = state.spacing * every, offset = (state.phase % every) * state.spacing;
  const paths = { before: new Path2D(), after: new Path2D() };
  function segment(a, b, kind) {
    const path = paths[kind === 'after' ? 'after' : 'before'];
    path.moveTo(px(a.x), py(a.y)); path.lineTo(px(b.x), py(b.y));
  }
  for (let W = offset; W < family.loopAction; W += gap) {
    if (W < 1e-8) continue;
    let previous = null;
    for (let i = 0; i <= frontRays.length; i++) {
      const point = orbitAtAction(frontRays[i % frontRays.length], W);
      if (point && previous) {
        if (point.kind === previous.kind) segment(previous, point, point.kind);
        else {
          const middle = { x: (previous.x + point.x) / 2, y: (previous.y + point.y) / 2 };
          segment(previous, middle, previous.kind); segment(middle, point, point.kind);
        }
      }
      previous = point;
    }
  }
  for (const kind of ['after', 'before']) if (shown(kind)) {
    ctx.strokeStyle = colorOf(kind); ctx.globalAlpha = 0.07; ctx.lineWidth = 4; ctx.stroke(paths[kind]);
    ctx.globalAlpha = state.branch === 'both' ? kind === 'after' ? 0.46 : 0.68 : 0.8;
    ctx.lineWidth = 1.05; ctx.stroke(paths[kind]);
  }
  ctx.globalAlpha = 1;
  text('front-sampling', every === 1 ? '' : `Showing 1 of every ${every} fronts`);
}

function drawCaustic() {
  ctx.strokeStyle = AMBER; ctx.lineWidth = 1.4; ctx.globalAlpha = 0.75; ctx.setLineDash([5, 6]);
  ctx.stroke(geometry.caustic); ctx.setLineDash([]); ctx.globalAlpha = 1;
  const e = geometry.envelope, x = px(e.x), y = py(-e.b);
  if (x > 120 && x < width - 120 && y > 92 && y < height - 60) {
    ctx.font = '10px "Segoe UI", sans-serif'; ctx.fillStyle = '#c8af83'; ctx.textAlign = 'center';
    ctx.fillText('caustic · routes merge', x, y - 12); ctx.textAlign = 'left';
  }
}

function drawArrow(point, branch, index) {
  const magnitude = Math.hypot(branch.px, branch.py);
  if (magnitude < 1e-7) return;
  const dx = branch.px / magnitude, dy = branch.py / magnitude, color = colorOf(branch.kind);
  const ax = px(point.x), ay = py(point.y), bx = ax + 46 * dx, by = ay + 46 * dy;
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.7; ctx.beginPath();
  ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
  ctx.moveTo(bx - 7 * dx - 4 * dy, by - 7 * dy + 4 * dx); ctx.lineTo(bx, by);
  ctx.lineTo(bx - 7 * dx + 4 * dy, by - 7 * dy - 4 * dx); ctx.stroke();
  ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.beginPath();
  ctx.moveTo(ax - 16 * dy, ay + 16 * dx); ctx.lineTo(ax + 16 * dy, ay - 16 * dx); ctx.stroke(); ctx.setLineDash([]);
  ctx.font = '11px "Segoe UI", sans-serif'; ctx.fillText(String(index + 1), bx + 5, by + 3);
}

function probeRays() {
  if (!probeCache || probeCache.x !== state.probe.x || probeCache.y !== state.probe.y) {
    probeCache = { ...state.probe, result: orbitBranches(state.probe.x, state.probe.y, state.speed) };
    probeCache.paths = probeCache.result.branches.map(branch => rayPath(branch.ray, branch.s));
  }
  return probeCache.result;
}

function drawProbe(result) {
  for (const [index, branch] of result.branches.entries()) {
    if (!shown(branch.kind)) continue;
    const color = colorOf(branch.kind), path = probeCache.paths[index];
    ctx.strokeStyle = '#0d1521'; ctx.lineWidth = 5; ctx.stroke(path);
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke(path);
    for (let i = 1; i < 8; i++) {
      const p = orbitAtTime(branch.ray, branch.t * i / 8);
      ctx.beginPath(); ctx.arc(px(p.x), py(p.y), 2.2, 0, TAU); ctx.fillStyle = color; ctx.fill();
    }
    if (state.normals) drawArrow(state.probe, branch, index);
  }
  const x = px(state.probe.x), y = py(state.probe.y);
  ctx.beginPath(); ctx.arc(x, y, 13, 0, TAU); ctx.fillStyle = '#eaf4ff12'; ctx.fill();
  ctx.strokeStyle = result.branches.length || result.kind === 'source' ? '#dae7f5' : AMBER; ctx.lineWidth = 1; ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, 5, 0, TAU); ctx.fillStyle = ctx.strokeStyle; ctx.fill();
  ctx.font = '600 13px "Segoe UI", sans-serif'; ctx.fillText('B', x + 14, y - 14);
}

function drawSourceAndCentre() {
  const x = px(0), y = py(0), r = MASS_MARKER_RADIUS * scale;
  const glow = ctx.createRadialGradient(x, y, 0, x, y, Math.max(25, r * 2.4));
  glow.addColorStop(0, '#ffc77980'); glow.addColorStop(1, '#ffc77900'); ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(x, y, Math.max(25, r * 2.4), 0, TAU); ctx.fill();
  ctx.fillStyle = '#4b3325'; ctx.strokeStyle = '#ffd49a'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = AMBER; ctx.font = '11px "Segoe UI", sans-serif'; ctx.fillText('M', x + r + 6, y - r - 2);
  const ax = px(SOURCE.x), ay = py(SOURCE.y);
  const sourceGlow = ctx.createRadialGradient(ax, ay, 0, ax, ay, 24);
  sourceGlow.addColorStop(0, '#bfffff60'); sourceGlow.addColorStop(1, '#5ae0d300'); ctx.fillStyle = sourceGlow;
  ctx.beginPath(); ctx.arc(ax, ay, 24, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(ax, ay, 5, 0, TAU); ctx.fillStyle = '#edfff9'; ctx.fill();
  ctx.font = '600 12px "Segoe UI", sans-serif'; ctx.fillText('A', ax - 23, ay - 13);
  ctx.font = '10px "Segoe UI", sans-serif'; ctx.fillStyle = '#94b9bc'; ctx.fillText('source', ax - 42, ay + 20);
}

function drawFlight(flight) {
  if (!flight) return;
  const fan = flight.kind === 'fan';
  for (const particle of orbitParticles(flight)) {
    if (fan && !shown(particle.kind)) continue;
    const color = colorOf(particle.kind), x = px(particle.x), y = py(particle.y);
    if (x < -30 || x > width + 30 || y < -30 || y > height + 30) continue;
    if (!particle.arrived) for (let i = 7; i > 0; i--) {
      const t = particle.t - i * 0.018;
      if (t <= 0) continue;
      const trail = orbitAtTime(particle.ray, t);
      if (!trail) continue;
      ctx.globalAlpha = 0.4 * (1 - i / 8); ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(px(trail.x), py(trail.y), 3 * (1 - i / 10), 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, fan ? 13 : 19);
    glow.addColorStop(0, `${color}90`); glow.addColorStop(1, `${color}00`); ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(x, y, fan ? 13 : 19, 0, TAU); ctx.fill();
    ctx.fillStyle = fan ? color : '#f3fffc'; ctx.strokeStyle = color; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, fan ? 4 : particle.arrived ? 5 + particle.index * 3 : 6, 0, TAU);
    if (!particle.arrived || particle.index === 0) ctx.fill(); ctx.stroke();
  }
}

function updateReadout(result) {
  const t = (state.phase % 1) * phasePeriod();
  $('wave-time').value = state.phase % 1; text('wave-time-value', `${fmt(t)} s`);
  $('wave-time').setAttribute('aria-valuetext', `${fmt(t)} seconds`);
  $('launch-particle').disabled = !result.branches.some(branch => shown(branch.kind));
  const flight = state.flight, arrived = flight && flight.elapsed >= flight.duration;
  text('launch-particle', flight ? arrived ? '↺ Fly A → B again' : '↺ Relaunch A → B' : '● Launch A → B');
  text('flight-time', flight ? arrived ? 'Arrived at B' : `${fmt(flight.elapsed)} / ${fmt(flight.duration)} s` : '');
  const fan = state.fanFlight;
  text('launch-fan', fan ? '↺ Relaunch fan' : '✦ Launch fan');
  text('fan-time', fan ? fan.elapsed >= fan.duration ? 'Circuit finished' : `${fmt(fan.elapsed)} / ${fmt(fan.duration)} s` : 'One burst · 32 particles');
}

function draw() {
  if (!geometry) buildGeometry();
  ctx.clearRect(0, 0, width, height); drawBackdrop(); drawFronts(); drawCaustic();
  const result = probeRays(); drawProbe(result); drawSourceAndCentre(); drawFlight(state.fanFlight); drawFlight(state.flight);
  updateReadout(result);
  ctx.font = '10px "Segoe UI", sans-serif'; ctx.fillStyle = '#7d90a6'; ctx.textAlign = 'right';
  ctx.fillText('μ = 8 m³/s² · first circuit · V(A) = 0', width - 18, height - 17); ctx.textAlign = 'left';
}

function frame(now) {
  framePending = false;
  const dt = lastTime === null ? 0 : Math.min((now - lastTime) / 1000, 0.05); lastTime = now;
  if (state.playing && !document.hidden) {
    const elapsed = 0.6 * dt;
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
  $('long-key').hidden = state.branch === 'before'; document.querySelector('.short-key').hidden = state.branch === 'after';
  $('launch-speed').value = state.speed; $('front-spacing').value = state.spacing;
  text('speed-value', `${fmt(state.speed)} m/s`); text('spacing-value', `${fmt(state.spacing)} J·s`);
  text('orbit-energy', `ε = ${fmt(family.energy)} J`); text('orbit-period', `Orbit: ${fmt(family.period)} s`);
  $('wave-fronts').checked = state.fronts; $('ray-fan').checked = state.rays; $('normals').checked = state.normals;
  updatePlay(); requestFrame();
}

function cancelFlight() { state.flight = null; }
function launchParticle() {
  state.flight = startOrbitFlight(state.probe, probeRays().branches.filter(branch => shown(branch.kind)));
  if (!state.flight) return;
  state.playing = true; lastTime = null; updatePlay(); requestFrame();
}
function launchFan() {
  state.fanFlight = startOrbitFan(state.speed); state.rays = true;
  state.playing = true; lastTime = null; updateControls();
}
document.querySelectorAll('[data-branch]').forEach(button => button.addEventListener('click', () => {
  if (state.branch === button.dataset.branch) return;
  cancelFlight(); state.branch = button.dataset.branch; updateControls();
}));
$('launch-speed').addEventListener('input', event => {
  cancelFlight(); state.fanFlight = null; state.speed = Number(event.target.value); rebuildFamily(); updateControls();
});
$('front-spacing').addEventListener('input', event => { state.spacing = Number(event.target.value); updateControls(); });
for (const [id, key] of [['wave-fronts', 'fronts'], ['ray-fan', 'rays'], ['normals', 'normals']]) $(id).addEventListener('change', event => { state[key] = event.target.checked; requestFrame(); });
$('launch-particle').addEventListener('click', launchParticle); $('launch-fan').addEventListener('click', launchFan);
$('wave-play').addEventListener('click', () => { state.playing = !state.playing; lastTime = null; updatePlay(); requestFrame(); });
$('wave-restart').addEventListener('click', () => {
  state.phase = 0;
  if (state.flight) state.flight = { ...state.flight, elapsed: 0 };
  if (state.fanFlight) state.fanFlight = { ...state.fanFlight, elapsed: 0 };
  lastTime = null; updatePlay(); requestFrame();
});
$('wave-time').addEventListener('input', event => {
  cancelFlight(); state.fanFlight = null; state.playing = false; state.phase = Number(event.target.value); updatePlay(); requestFrame();
});
$('probe-caustic').addEventListener('click', () => {
  cancelFlight(); const e = orbitCaustic(state.speed), angle = Math.atan2((state.probe.y - e.y) / e.b, (state.probe.x - e.x) / e.a);
  state.probe = { x: e.x + e.a * Math.cos(angle), y: e.y + e.b * Math.sin(angle) }; requestFrame();
});
$('probe-reset').addEventListener('click', () => { cancelFlight(); state.probe = { x: 1.2, y: 0.8 }; requestFrame(); });
$('view-reset').addEventListener('click', () => { state.camera = { ...DEFAULT_ORBIT_CAMERA }; updateCamera(); });
canvas.addEventListener('wheel', event => {
  event.preventDefault(); const rect = canvas.getBoundingClientRect();
  const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1);
  state.camera = zoomCamera(state.camera, width, height, event.clientX - rect.left, event.clientY - rect.top, delta); updateCamera();
}, { passive: false });
function moveProbe(event) {
  cancelFlight(); const rect = canvas.getBoundingClientRect();
  state.probe = { x: xmin + clamp(event.clientX - rect.left, 12, width - 12) / scale,
    y: ymin + clamp(event.clientY - rect.top, 12, height - 12) / scale }; requestFrame();
}
canvas.addEventListener('pointerdown', event => {
  if (pointer !== null || ![0, 1].includes(event.button)) return;
  event.preventDefault(); pointer = event.pointerId; canvas.setPointerCapture(pointer); canvas.focus({ preventScroll: true });
  if (event.button === 1) { pan = { x: event.clientX, y: event.clientY }; canvas.style.cursor = 'grabbing'; }
  else moveProbe(event);
});
canvas.addEventListener('pointermove', event => {
  if (event.pointerId !== pointer) return;
  if (pan) {
    if (typeof event.buttons === 'number' && !(event.buttons & 4)) { endPointer(); return; }
    event.preventDefault(); state.camera = panCamera(state.camera, event.clientX - pan.x, event.clientY - pan.y);
    pan = { x: event.clientX, y: event.clientY }; updateCamera();
  } else moveProbe(event);
});
function endPointer() {
  const previous = pointer; pointer = null; pan = null; canvas.style.cursor = '';
  if (previous !== null && canvas.hasPointerCapture(previous)) canvas.releasePointerCapture(previous);
}
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, event => { if (event.pointerId === pointer) endPointer(); });
for (const type of ['mousedown', 'auxclick']) canvas.addEventListener(type, event => { if (event.button === 1) event.preventDefault(); });
canvas.addEventListener('keydown', event => {
  if (event.key === 'Escape') { endPointer(); canvas.blur(); return; }
  if (['+', '=', '-', '_'].includes(event.key)) {
    event.preventDefault(); state.camera = zoomCamera(state.camera, width, height, width / 2, height / 2, ['+', '='].includes(event.key) ? -120 : 120); updateCamera(); return;
  }
  const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }, step = directions[event.key];
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
  const rect = $('math-dialog').getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $('math-dialog').close();
});
window.addEventListener('pageshow', event => { if (event.persisted) { location.reload(); return; } updateControls(); });
rebuildFamily(); updateControls();
new ResizeObserver(resize).observe(canvas.parentElement);
