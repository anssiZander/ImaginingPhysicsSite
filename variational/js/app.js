import * as curves from './model.js';
import { localELResidual } from './local-el.js';
import { createDynamics, evaluateDynamics, integrateDynamics, optimalDynamics, newDynamics, dynamicsELResidual } from './dynamics.js';
import { dragCurve } from './dragging.js';
import { smoothCurve, SMOOTH_STEP } from './smoothing.js';

const { NODE_COUNT, clamp, parameterAtX } = curves;
const MODES = { ...curves.MODES, dynamics: createDynamics() };
const isDynamics = mode => mode.id === 'dynamics';
const evaluate = (mode, c, u) => isDynamics(mode) ? evaluateDynamics(mode, c, u) : curves.evaluate(mode, c, u);
const integrate = (mode, c, a = 0, b = 1) => isDynamics(mode) ? integrateDynamics(mode, c, a, b) : curves.integrate(mode, c, a, b);
const newCurve = (mode, seed) => isDynamics(mode) ? newDynamics(mode, seed) : curves.newCurve(mode, seed);
const zeroCurve = mode => isDynamics(mode) ? optimalDynamics(mode) : curves.zeroCurve();
const sample = (mode, c, count = 300) => Array.from({ length: count + 1 }, (_, i) => evaluate(mode, c, i / count));
const graphDensity = (mode, p) => isDynamics(mode) ? p.lagrangian : p.f;

const $ = id => document.getElementById(id);
const world = $('world'), graph = $('graph'), error = $('error');
const wc = world.getContext('2d'), gc = graph.getContext('2d'), ec = error.getContext('2d');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const COLOR = { cyan: '#5ae0d3', amber: '#ffc779', green: '#81e58f', red: '#ff7a8b', violet: '#b79bfa', muted: '#7e90a8', text: '#e6edf8', grid: '#d3e8ff0b' };
const ERROR_TOP = 10; // Roof: ten times the reference scale (|J*|, or S₀ in Dynamics).
const ERROR_UNITS = 10; // Display E = 10 × relativeGap, with plain labels 0, 50, 100.
const exactSamples = new Map(), optimalLevels = new Map();
function refreshExact(mode) {
  const points = sample(mode, zeroCurve(mode));
  exactSamples.set(mode.id, points);
  optimalLevels.set(mode.id, Math.max(...points.map(p => Math.abs(graphDensity(mode, p)))));
}
Object.values(MODES).forEach(refreshExact);
const state = {
  mode: MODES.brachistochrone, current: [], target: [],
  width: 0.14, guide: false, assist: true, editWidth: null, selected: null, dragging: null, keyboard: false,
  solved: false, revealed: false, interacted: false, generating: false,
  feedbackDirection: 0, feedbackUntil: 0, previousIntegral: null, nearMinimum: false,
  frame: 0, lastTime: 0, slowEase: false,
  playing: false, playhead: 0,
};
let worldSize = { width: 1, height: 1 }, graphSize = { width: 1, height: 1 }, errorSize = { width: 1, height: 1 };
let transform, previousScoreText = '', previousVariationColor = '', previousVariationLabel = '';
let analysisSnapshot = null;

function format(value, digits = 2) {
  return value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false });
}

function functionalEquation(mode) {
  if (isDynamics(mode)) return `<math xmlns="http://www.w3.org/1998/Math/MathML" display="inline" aria-label="${mode.formula}"><mrow>
    <mi>S</mi><mrow><mo stretchy="false">[</mo><mi mathvariant="bold">r</mi><mo stretchy="false">]</mo></mrow><mo>=</mo>
    <msubsup><mo>∫</mo><mn>0</mn><mi>T</mi></msubsup><mrow><mo>[</mo><mfrac><mi>m</mi><mn>2</mn></mfrac><mo>(</mo>
    <msup><mover><mi>x</mi><mo>˙</mo></mover><mn>2</mn></msup><mo>+</mo><msup><mover><mi>y</mi><mo>˙</mo></mover><mn>2</mn></msup>
    <mo>)</mo><mo>+</mo><mi>m</mi><mi>g</mi><mi>y</mi><mo>]</mo></mrow><mspace width="0.25em"/><mi mathvariant="normal">d</mi><mi>t</mi>
    </mrow></math>`;
  const speed = '<msqrt><mrow><msubsup><mi>x</mi><mi>u</mi><mn>2</mn></msubsup><mo>+</mo><msubsup><mi>y</mi><mi>u</mi><mn>2</mn></msubsup></mrow></msqrt>';
  const density = mode.id === 'brachistochrone'
    ? `<mfrac>${speed}<msqrt><mrow><mn>2</mn><mi>g</mi><mi>y</mi></mrow></msqrt></mfrac>`
    : mode.id === 'catenary' ? `<mi>y</mi><mspace width="0.15em"/>${speed}` : speed;
  const factor = mode.id === 'catenary' ? '<mo>−</mo><mi>μ</mi><mi>g</mi><mspace width="0.2em"/>' : '';
  return `<math xmlns="http://www.w3.org/1998/Math/MathML" display="inline" aria-label="${mode.formula}"><mrow>
    <mrow><mi>${mode.symbol}</mi><mo stretchy="false">[</mo><mi>y</mi><mo stretchy="false">]</mo></mrow><mo>=</mo>${factor}
    <msubsup><mo>∫</mo><mn>0</mn><mn>1</mn></msubsup>${density}
    <mspace width="0.25em"/><mi mathvariant="normal">d</mi><mi>u</mi>
  </mrow></math>`;
}

const mathCopy = {
  length: `<h3>Shortest path → a straight line</h3>
    <p>With the endpoints fixed, minimize arc length. The curve uses a parameter <i>u</i> from 0 to 1; a subscript <i>u</i> means differentiation with respect to it.</p>
    <div class="equation">${functionalEquation(MODES.length)}</div>
    <p>Here x = 3u, y(0) = 0, and y(1) = 1.6 m. In the usual x-coordinate, F = √(1 + y′²). Euler–Lagrange gives d/dx(y′/√(1 + y′²)) = 0, so y′ is constant.</p>
    <div class="equation">y*(u) = 1.6u &nbsp; · &nbsp; ℓ* = √(3² + 1.6²) = 3.4 m</div>`,
  catenary: `<h3>Minimum potential energy → a catenary</h3>
    <p>A uniform chain has length L = 3.60 m and mass per unit length μ = 1 kg/m. Its supports are 3 m apart at the same height. The downward coordinate y makes the gravitational potential energy negative below the supports.</p>
    <div class="equation">${functionalEquation(MODES.catenary)}</div>
    <p>The constraint is ∫ ds = L, with ds = √(xᵤ² + yᵤ²) du.</p>
    <p>The length constraint matters. A pull first redistributes nearby parts of the chain to retain L, keeping the grabbed point free. Large edits can need a smaller adjustment farther away when the nearby chain cannot supply enough length. The highlighted interval marks the part you are pulling.</p>
    <p>Add a Lagrange multiplier λ. The augmented integrand in x is (λ − μgy)√(1 + y′²). Its Beltrami identity gives (λ − μgy)/√(1 + y′²) = constant. Integrating gives the catenary:</p>
    <div class="equation">y*(x) = a[cosh(3/2a) − cosh((x − 1.5)/a)]<br>2a sinh(3/2a) = 3.60</div>
    <p>This is the exact hanging-chain problem. A parabola instead comes from the small-slope model with a load uniform per horizontal distance.</p>`,
  brachistochrone: `<h3>Shortest travel time → a brachistochrone</h3>
    <p>Johann Bernoulli posed the fastest-descent challenge in 1696. A frictionless bead is released from rest at A. Conservation of energy gives v = √(2gy), with y measured downward and g = 9.81 m/s².</p>
    <div class="equation">${functionalEquation(MODES.brachistochrone)}</div>
    <p>In x-coordinates, the Beltrami identity gives y(1 + y′²) = 2R. The solution is a cycloid:</p>
    <div class="equation">x = R(θ − sin θ), &nbsp; y = R(1 − cos θ)<br>T* = θ<sub>B</sub>√(R/g)</div>
    <p>R and θ<sub>B</sub> are fixed by B = (3, 1.8) m. We use u = θ/θ<sub>B</sub> to keep the integrand finite at the release point. On the exact cycloid this time density is constant, so the graph becomes flat. Other parameter choices give a different-looking density but the same integral.</p>`,
};

function updateMath() {
  const m = state.mode;
  const dynamicsCopy = `<h3>Fixed endpoints. Fixed arrival time.</h3>
    <p>A particle of mass m = 1 kg travels from A = (0, 0) to B = (3, 0) in T = ${format(m.duration || 1)} s under constant downward gravity, g = 9.81 m/s². Grab any interior part of the path and move it in either direction; the grabbed point keeps its timestamp. Spacing between equal-time dots shows speed. Playback follows your edited history.</p>
    <div class="equation">${functionalEquation(MODES.dynamics)}</div>
    <p>Since y points downward, potential energy is −mgy and the Lagrangian is kinetic energy plus mgy. The graph shows L(t) against seconds; shaded area below zero subtracts from the action.</p>
    <div class="equation">ẍ = 0, &nbsp; ÿ = g<br>x*(t) = 3t/T, &nbsp; y*(t) = ½gt(t − T)<br>S* = 9m/(2T) − mg²T³/24</div>
    <p>Initial velocity is (3/T, −gT/2). Changing T keeps your geometric path and changes its timing, the optimal arch, and the action target. Every interior spline node is shown as a draggable dot at t = kT/${NODE_COUNT - 1}; the seven larger rings mark eighths of the duration. You can also grab between dots. The endpoints stay fixed.</p>
    <div class="equation">S[r* + η] − S[r*] = ½m ∫₀ᵀ |η̇|² dt</div>
    <p>For fixed endpoints and time, the linear terms cancel by integration by parts. The excess action is exactly quadratic and nonnegative. A wider range of Hamilton-principle problems can have stationary actions that are not minima.</p>`;
  $('math-content').innerHTML = `${isDynamics(m) ? dynamicsCopy : mathCopy[m.id]}
    <h3>Where the variation enters</h3>
    ${isDynamics(m) ? `<p>Vary both components: r → r + εη, with η(0) = η(T) = 0. Integrating the velocity terms by parts gives</p>
    <div class="equation">δS = m ∫₀ᵀ [−ẍη<sub>x</sub> + (g − ÿ)η<sub>y</sub>] dt.</div>
    <p>The variations η<sub>x</sub> and η<sub>y</sub> are independent. Their coefficients must vanish, giving ẍ = 0 and ÿ = g. Fixing both endpoints and T determines the initial velocity; it is not separately prescribed.</p>` : `<p>Move from y to y + εη, with η = 0 at both endpoints. The first-order change in an unconstrained functional is</p>
    <div class="equation">δJ = ∫ (F<sub>y</sub> − d/du F<sub>yᵤ</sub>) η du.</div>
    <p>For this to vanish for every allowed η, the expression in parentheses must be zero: the Euler–Lagrange equation. For the chain, apply it to the augmented functional with its length multiplier.</p>`}
    <h3>Why the error settles gently</h3>
    <p>${isDynamics(m) ? `The error track uses E = ${ERROR_UNITS}(S − S*) / S₀, where S₀ = 9m/T + mg²T³/12 is a positive reference scale. This remains well behaved when S* is zero or negative.` : `The error track uses E = ${ERROR_UNITS}(J − J*) / |J*|.`} Zero is at the bottom and ${ERROR_UNITS * ERROR_TOP} at the roof. This wide, fixed linear scale makes small deviations barely lift the blob. Larger errors can leave the track. Its position uses the full integral, before rounding.</p>
    <p>At a minimum the first variation vanishes. For a small admissible change y* + εη, the excess integral is of order ε². Doubling a small deviation therefore gives roughly four times the error. The marker preserves this gentle response near the optimum; it does not magnify tiny errors.</p>
    <h3>Color along the path: a local equation</h3>
    <p>Cyan means the local Euler–Lagrange residual is small; red means a mismatch. This does not compare distance to the ghost solution. ${isDynamics(m) ? 'Here we test the acceleration error √(ẍ² + (ÿ − g)²)/g.' : m.id === 'length' ? 'Here we test curvature: a straight segment can be cyan at any position and slope.' : m.id === 'brachistochrone' ? 'Here we test 1 + y′² + 2yy″ = 0 in physical x-coordinates, using its regular parameter form.' : 'For the chain, eliminating the unknown constant length multiplier gives (1 + y′²)y‴ − y′(y″)² = 0, with y″ ≠ 0. Both catenary orientations can be locally stationary; cyan does not certify a minimum. Each cyan interval admits a local constant multiplier; separate intervals may correspond to different multipliers. A globally stationary chain also needs one shared multiplier and the endpoint and length conditions.'}</p>
    <p>The dimensionless residual is cyan below 0.03, blending to red by 0.30. During a drag, the selected segment temporarily shows yellow/red/green feedback about the total integral. The blob always describes the total error.</p>
    <h3>A more forgiving brush</h3>
    <p>Gentle assist changes how much of the neighboring curve follows your hand: more when you pull toward the exact solution, less when you pull away. The grabbed point has the same freedom and limits as an unassisted drag, so you can still make deliberate bumps, including tiny ones with Fine reach. The chain still redistributes to keep its length. This is an artificial teaching aid that acts only while you edit. Switch it off for the original brush. The plots and integral always use your actual displayed curve.</p>
    <p class="fine-print">The goal is within ${format(100 * m.tolerance, 1)}% of ${isDynamics(m) ? 'the positive reference scale S₀' : 'the magnitude of the minimum'}. A tolerance on the integral is not a proof of exact stationarity.</p>`;
}

function setMode(id, initial = false) {
  if (state.dragging) endDrag({ pointerId: state.dragging.id });
  if (scrubPointer !== null) {
    const previous = scrubPointer; scrubPointer = null;
    if (graph.hasPointerCapture(previous)) graph.releasePointerCapture(previous);
  }
  MODES.dynamics = createDynamics(); refreshExact(MODES.dynamics);
  state.width = 0.14; state.guide = false; state.assist = true;
  const url = new URL(location.href);
  url.searchParams.set('scene', id); history.replaceState(null, '', url);
  state.mode = MODES[id];
  state.current = newCurve(state.mode, id === 'brachistochrone' ? 0.09 : id === 'catenary' ? 0.22 : 0.08);
  state.target = [...state.current];
  state.revealed = false;
  state.solved = false; state.selected = null; state.dragging = null; state.interacted = false; state.generating = false;
  state.playing = false; state.playhead = 0; state.keyboard = false;
  state.lastTime = 0; state.slowEase = false; state.nearMinimum = false; analysisSnapshot = null;
  resetFeedback();
  const m = state.mode;
  document.querySelectorAll('[data-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === id)));
  $('score-symbol').textContent = `${m.symbol}[${isDynamics(m) ? 'r' : 'y'}]`;
  $('score-unit').textContent = m.unit;
  $('target-label').textContent = m.targetLabel;
  $('target-value').textContent = `${format(m.target)} ${m.unit}`.trim();
  $('formula').innerHTML = functionalEquation(m);
  $('world-unit').textContent = id === 'catenary' ? 'metres · L = 3.60 m · y ↓' : isDynamics(m) ? 'm · g = 9.81 m/s² · y ↓' : 'metres · y ↓';
  $('dynamics-controls').hidden = !isDynamics(m);
  $('duration').value = MODES.dynamics.duration; $('duration').disabled = false;
  $('duration-value').textContent = `${format(MODES.dynamics.duration)} s`;
  $('curve-help').textContent = isDynamics(m) ? 'Left-drag in any direction. Right-drag to smooth.' : 'Left-drag to shape. Right-drag to smooth.';
  world.setAttribute('aria-label', isDynamics(m) ? 'Editable timed path. Drag any interior point horizontally or vertically, including every spline node. Arrow keys move the selected point; brackets select the previous or next node. Cyan is local Euler–Lagrange agreement; red is a mismatch.' : 'Editable curve. Drag vertically. Left and right select a point; up and down move it. Cyan is local Euler–Lagrange agreement; red is a mismatch.');
  world.setAttribute('aria-label', `${world.getAttribute('aria-label')} Hold the right mouse button and brush along the curve to gradually smooth it. Reach controls the affected neighborhood.`);
  $('area-label').textContent = isDynamics(m) ? 'Signed area = action' : 'Area = integral';
  updateBrush(); $('guide').checked = state.guide; $('assist').checked = state.assist; updatePlaybackControls();
  $('solution-badge').hidden = !state.revealed;
  $('scene-caption').style.opacity = '1';
  world.classList.remove('dragging', 'smoothing', 'grabbable');
  updateMath();
  requestFrame();
  if (!initial) { announce(`${m.name}. ${m.description}`); }
}

function announce(message) { $('announcement').textContent = message; }

function variationColor() {
  return state.nearMinimum ? COLOR.green : state.feedbackDirection < 0 ? COLOR.red : COLOR.amber;
}

function setFeedbackDirection(direction) {
  state.feedbackDirection = direction;
}

function updateVariationStyle() {
  const color = variationColor();
  if (color !== previousVariationColor) {
    document.documentElement.style.setProperty('--variation', color);
    document.documentElement.style.setProperty('--variation-fill', `${color}55`);
    document.documentElement.style.setProperty('--variation-border', `${color}aa`);
    previousVariationColor = color;
  }
  const label = state.nearMinimum ? 'Near minimum' : state.feedbackDirection > 0 ? 'Improving' : state.feedbackDirection < 0 ? 'Worsening' : 'Your variation';
  if (label !== previousVariationLabel) {
    $('variation-label').textContent = label;
    previousVariationLabel = label;
  }
}

function resetFeedback() {
  state.editWidth = null;
  state.feedbackUntil = 0;
  state.previousIntegral = null;
  setFeedbackDirection(0);
}

function updateFeedback(value, time) {
  const active = state.selected !== null && (state.dragging || time < state.feedbackUntil);
  if (!active) setFeedbackDirection(0);
  else if (state.previousIntegral !== null) {
    // Use the actual displayed curve and full precision, even when the rounded
    // score stays the same. Direction is relative to the last change, not the
    // start of the gesture, so reversing across an optimum changes color.
    const change = value - state.previousIntegral;
    if (Math.abs(change) > state.mode.scale * 1e-8) setFeedbackDirection(change < 0 ? 1 : -1);
  }
  state.previousIntegral = value;
  return active && !state.dragging;
}

function setupCanvas(canvas, size) {
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  size.width = Math.max(1, rect.width); size.height = Math.max(1, rect.height);
  canvas.width = Math.round(size.width * ratio); canvas.height = Math.round(size.height * ratio);
  canvas.getContext('2d').setTransform(ratio, 0, 0, ratio, 0, 0);
}

function requestFrame() {
  if (!state.frame) state.frame = requestAnimationFrame(render);
}

function render(time) {
  state.frame = 0;
  const elapsed = state.lastTime ? time - state.lastTime : 0;
  const dt = state.lastTime ? Math.min(50, elapsed) : 16;
  state.lastTime = time;
  if (state.playing) {
    state.playhead = Math.min(1, state.playhead + elapsed / (1000 * state.mode.duration));
    if (state.playhead === 1) state.playing = false;
    updatePlaybackControls();
  }
  const brushing = state.dragging?.smoothing;
  if (brushing) {
    const drag = state.dragging;
    state.selected = hitTest(drag.pointer);
    // A fixed cadence makes the amount independent of pointer event frequency.
    // Moving away from the curve pauses the brush, without storing up work.
    drag.smoothTime = state.selected === null ? 0 : drag.smoothTime + dt / 1000;
    const passes = Math.floor(drag.smoothTime / SMOOTH_STEP);
    if (passes > 0) {
      drag.smoothTime -= passes * SMOOTH_STEP;
      const edit = smoothCurve(state.mode, state.target, state.selected, drag.width, passes);
      state.editWidth = edit.width;
      if (edit.coefficients.some((c, i) => c !== state.target[i])) {
        state.target = edit.coefficients;
        edited();
      }
      if (isDynamics(state.mode)) { state.playhead = state.selected; updatePlaybackControls(); }
    }
  }
  const tau = state.slowEase ? 170 : state.dragging ? 32 : 55;
  const alpha = reducedMotion.matches ? 1 : 1 - Math.exp(-dt / tau);
  let moving = false;
  const next = state.current.map((c, i) => {
    const diff = state.target[i] - c;
    if (Math.abs(diff) < 0.00001) return state.target[i];
    moving = true;
    return c + diff * alpha;
  });
  if (next.some((c, i) => c !== state.current[i])) state.current = next;
  if (!analysisSnapshot || analysisSnapshot.mode !== state.mode || analysisSnapshot.coefficients !== state.current) {
    const points = sample(state.mode, state.current);
    for (const p of points) p.residual = isDynamics(state.mode) ? dynamicsELResidual(state.mode, state.current, p.u) : localELResidual(state.mode, state.current, p.u);
    analysisSnapshot = { mode: state.mode, coefficients: state.current, value: integrate(state.mode, state.current), points };
  }
  const { value, points } = analysisSnapshot;
  const relativeGap = Math.max(0, (value - state.mode.target) / state.mode.scale);
  state.nearMinimum = relativeGap <= state.mode.tolerance;
  const feedbackPending = updateFeedback(value, time);
  updateVariationStyle();
  drawWorld(points);
  drawGraph(points);
  drawErrorMarker(relativeGap);
  if (!moving) state.generating = false;
  updateScore(value, relativeGap);
  if (moving || feedbackPending || state.playing || (brushing && state.selected !== null)) requestFrame();
  else { state.lastTime = 0; state.slowEase = false; }
}

function worldTransform() {
  const { width: w, height: h } = worldSize;
  const left = w < 450 ? 44 : 58, right = w < 450 ? 30 : 44;
  const top = 22, bottom = 50;
  const [ymin, ymax] = state.mode.bounds;
  const [xmin, xmax] = state.mode.xBounds || [0, state.mode.xMax];
  const sx = (w - left - right) / (xmax - xmin), sy = (h - top - bottom) / (ymax - ymin);
  return { sx, sy, left, right: w - right, top, bottom: h - bottom,
    x: x => left + (x - xmin) * sx, y: y => top + (y - ymin) * sy,
    invertX: x => xmin + (x - left) / sx, invertY: y => ymin + (y - top) / sy };
}

function niceStep(range, ticks = 5) {
  const value = Math.max(range / ticks, 1e-9);
  const base = 10 ** Math.floor(Math.log10(value));
  const ratio = value / base;
  return base * (ratio < 1.5 ? 1 : ratio < 3.5 ? 2 : ratio < 7.5 ? 5 : 10);
}

function tickLabel(value, step) {
  const v = Math.abs(value) < step / 100 ? 0 : value;
  return v.toFixed(Math.min(2, Math.max(0, -Math.floor(Math.log10(step)))));
}

function path(ctx, points, tx, ty) {
  ctx.beginPath();
  points.forEach((p, i) => i === 0 ? ctx.moveTo(tx(p), ty(p)) : ctx.lineTo(tx(p), ty(p)));
}

function localPathColor(residual) {
  const mix = clamp((residual - 0.03) / 0.27, 0, 1);
  const cyan = [90, 224, 211], red = [255, 122, 139];
  return `rgb(${cyan.map((c, i) => Math.round(c + mix * (red[i] - c))).join(',')})`;
}

function drawLocalPath(c, points, t) {
  c.save(); c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = 3;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    c.strokeStyle = localPathColor((a.residual + b.residual) / 2);
    c.beginPath(); c.moveTo(t.x(a.x), t.y(a.y)); c.lineTo(t.x(b.x), t.y(b.y)); c.stroke();
  }
  c.restore();
}

function selectedInterval() {
  if (state.selected === null) return null;
  const width = (state.dragging || performance.now() < state.feedbackUntil) ? state.editWidth ?? state.width : state.width;
  if (isDynamics(state.mode)) return [clamp(state.selected - 1.25 * width, 0, 1), clamp(state.selected + 1.25 * width, 0, 1)];
  const m = state.mode, x = m.x(state.selected), reach = width * m.xMax * 1.25;
  return [parameterAtX(m, x - reach), parameterAtX(m, x + reach)];
}

function drawWorld(points) {
  const c = wc, { width: w, height: h } = worldSize, m = state.mode;
  const highlight = variationColor();
  c.clearRect(0, 0, w, h);
  transform = worldTransform();
  const t = transform;
  c.font = '10px "Segoe UI", sans-serif';
  const xstep = w < 450 ? 1 : 0.5, ystep = niceStep(m.bounds[1] - m.bounds[0], 6);
  for (let x = Math.ceil((m.xBounds?.[0] || 0) / xstep) * xstep; x <= (m.xBounds?.[1] || m.xMax) + 1e-6; x += xstep) {
    const px = t.x(x);
    c.strokeStyle = COLOR.grid; c.lineWidth = 1;
    c.beginPath(); c.moveTo(px, 2); c.lineTo(px, h - 27); c.stroke();
    c.fillStyle = COLOR.muted; c.textAlign = 'center';
    c.fillText(tickLabel(x, xstep), px, h - 13);
  }
  for (let y = Math.ceil(m.bounds[0] / ystep) * ystep; y < m.bounds[1] + 1e-6; y += ystep) {
    const py = t.y(y);
    c.strokeStyle = Math.abs(y) < 1e-8 ? '#a9bcd526' : COLOR.grid;
    c.beginPath(); c.moveTo(25, py); c.lineTo(w - 17, py); c.stroke();
    c.fillStyle = COLOR.muted; c.textAlign = 'right'; c.fillText(tickLabel(y, ystep), t.left - 14, py + 3);
  }
  c.fillStyle = COLOR.muted; c.textAlign = 'right'; c.fillText('x', w - 16, h - 13);
  c.textAlign = 'left'; c.fillText('y ↓', 13, 13);
  c.font = '9px "Segoe UI", sans-serif';
  c.fillStyle = COLOR.cyan; c.fillText('● local E–L', Math.max(52, w / 2 - 76), 13);
  c.fillStyle = COLOR.red; c.fillText('● mismatch', Math.max(133, w / 2 + 5), 13);

  // A subtle visual link between the two pinned ends.
  c.save(); c.setLineDash([3, 6]); c.strokeStyle = '#9aafc32a'; c.lineWidth = 1;
  c.beginPath(); c.moveTo(t.x(0), t.y(0)); c.lineTo(t.x(m.xMax), t.y(m.yEnd)); c.stroke(); c.restore();

  if (state.guide) {
    c.save(); c.setLineDash([5, 6]); c.strokeStyle = COLOR.violet; c.globalAlpha = 0.65; c.lineWidth = 1.5;
    path(c, exactSamples.get(m.id), p => t.x(p.x), p => t.y(p.y)); c.stroke(); c.restore();
  }
  const interval = selectedInterval();
  if (interval && !isDynamics(m)) {
    const center = evaluate(m, state.current, state.selected);
    const x0 = t.x(m.x(interval[0])), x1 = t.x(m.x(interval[1]));
    const glow = c.createLinearGradient(x0, 0, x1, 0);
    glow.addColorStop(0, `${highlight}00`); glow.addColorStop(0.5, `${highlight}0b`); glow.addColorStop(1, `${highlight}00`);
    c.fillStyle = glow; c.fillRect(x0, 0, x1 - x0, h - 27);
    c.save(); c.setLineDash([3, 5]); c.strokeStyle = `${highlight}30`; c.beginPath();
    c.moveTo(t.x(center.x), t.y(center.y) + 17); c.lineTo(t.x(center.x), h - 27); c.stroke(); c.restore();
  }
  drawLocalPath(c, points, t);

  if (m.id === 'catenary') {
    // Tiny links follow the local tangent, making the fixed-length object tangible.
    c.save(); c.globalAlpha = 0.65; c.lineWidth = 1;
    for (let i = 9; i < points.length - 4; i += 12) {
      const p = points[i], angle = Math.atan2(p.dy * t.sy, p.dx * t.sx);
      c.strokeStyle = localPathColor(p.residual);
      c.save(); c.translate(t.x(p.x), t.y(p.y)); c.rotate(angle);
      c.beginPath(); c.ellipse(0, 0, 4, 2.4, 0, 0, 2 * Math.PI); c.stroke(); c.restore();
    }
    c.restore();
  }
  if (interval) {
    const segment = sampleInterval(interval[0], interval[1], 90);
    if (state.dragging || performance.now() < state.feedbackUntil) {
      c.save(); c.strokeStyle = highlight; c.lineWidth = 3.8; c.lineCap = 'round';
      c.shadowBlur = 15; c.shadowColor = `${highlight}44`; path(c, segment, p => t.x(p.x), p => t.y(p.y)); c.stroke(); c.restore();
    }
    const p = evaluate(m, state.current, state.selected), px = t.x(p.x), py = t.y(p.y);
    c.strokeStyle = `${highlight}70`; c.lineWidth = 1;
    c.beginPath(); c.arc(px, py, state.dragging ? 16 : 12, 0, 2 * Math.PI); c.stroke();
    c.fillStyle = highlight; c.beginPath(); c.arc(px, py, 4.5, 0, 2 * Math.PI); c.fill();
    c.fillStyle = highlight; c.font = '10px "Segoe UI", sans-serif'; c.textAlign = 'center';
    c.fillText(state.dragging?.smoothing ? 'Smoothing' : isDynamics(m) ? `t = ${format(state.selected * m.duration)} s` : `u = ${state.selected.toFixed(2)}`, clamp(px, 48, w - 48), Math.max(25, py - 24));
  }
  if (isDynamics(m)) drawTimeMarkers(c, t);
  endpoint(0, 0, 'A', isDynamics(m) ? 't = 0.00 s' : m.id === 'catenary' ? 'support' : m.id === 'brachistochrone' ? 'release' : 'fixed');
  endpoint(m.xMax, m.yEnd, 'B', isDynamics(m) ? `t = ${format(m.duration)} s` : m.id === 'catenary' ? 'support' : 'fixed');
}

function drawTimeMarkers(c, t) {
  for (let i = 1; i < NODE_COUNT - 1; i++) {
    const p = evaluate(state.mode, state.current, i / (NODE_COUNT - 1)), large = i % ((NODE_COUNT - 1) / 8) === 0;
    c.beginPath(); c.arc(t.x(p.x), t.y(p.y), large ? 5 : 1.7, 0, 2 * Math.PI);
    c.fillStyle = large ? '#101722' : '#eef3fa80'; c.fill();
    if (large) { c.strokeStyle = '#eef3fab0'; c.lineWidth = 1.3; c.stroke(); }
  }
  const bead = evaluate(state.mode, state.current, state.playhead);
  c.save(); c.shadowColor = COLOR.violet; c.shadowBlur = 16;
  c.fillStyle = COLOR.text; c.strokeStyle = COLOR.violet; c.lineWidth = 2;
  c.beginPath(); c.arc(t.x(bead.x), t.y(bead.y), 7, 0, 2 * Math.PI); c.fill(); c.stroke(); c.restore();
}

function endpoint(x, y, label, note) {
  const c = wc, t = transform, px = t.x(x), py = t.y(y), atEnd = x > 0;
  c.fillStyle = '#101722'; c.strokeStyle = '#e6edf84d'; c.lineWidth = 1;
  c.beginPath(); c.arc(px, py, 10, 0, 2 * Math.PI); c.fill(); c.stroke();
  c.fillStyle = COLOR.text; c.beginPath(); c.arc(px, py, 4, 0, 2 * Math.PI); c.fill();
  c.font = '600 13px "Segoe UI", sans-serif'; c.textAlign = atEnd ? 'right' : 'left';
  c.fillText(label, px + (atEnd ? -17 : 17), py - 12);
  c.fillStyle = COLOR.muted; c.font = '9px "Segoe UI", sans-serif';
  c.fillText(note, px + (atEnd ? -17 : 17), py + 3);
}

function sampleInterval(a, b, count) {
  return Array.from({ length: count + 1 }, (_, i) => evaluate(state.mode, state.current, a + (b - a) * i / count));
}

function drawGraph(points) {
  const c = gc, { width: w, height: h } = graphSize, m = state.mode;
  const highlight = variationColor();
  c.clearRect(0, 0, w, h);
  const left = 52, right = 18, top = 28, bottom = 36;
  const pw = Math.max(1, w - left - right), ph = Math.max(1, h - top - bottom);
  const optimum = exactSamples.get(m.id);
  // The initial 2x headroom is also the ceiling: the density scale stays fixed.
  const cap = 2 * optimalLevels.get(m.id);
  const graphRange = m.id === 'catenary' ? [-cap, 0] : isDynamics(m) ? [-cap, cap] : [0, cap];
  graph.setAttribute('aria-label', `${m.axis}. ${isDynamics(m) ? `Lagrangian versus time from 0 to ${format(m.duration)} seconds. The signed area is action; negative area subtracts. The violet cursor follows playback and scrubbing.` : 'Integrand versus parameter u, from 0 to 1.'} The highlighted interval matches the edited curve. Fixed vertical scale: ${format(graphRange[0])} to ${format(graphRange[1])}, twice the optimal peak density in magnitude. Peaks outside the plot are clipped; the score includes the full integral. Green means within the optimum tolerance. Outside that tolerance, red means the integral is increasing; yellow is the default, including improving edits.`);
  const density = p => graphDensity(m, p);
  const tx = u => left + u * pw, ty = f => top + (graphRange[1] - f) / (graphRange[1] - graphRange[0]) * ph;
  const zero = ty(0), step = niceStep(graphRange[1] - graphRange[0], h < 220 ? 3 : 5);
  c.font = '10px "Segoe UI", sans-serif';
  for (let f = Math.ceil(graphRange[0] / step) * step; f <= graphRange[1] + step * 1e-9; f += step) {
    const py = ty(f);
    c.strokeStyle = Math.abs(f) < 1e-7 ? '#8da2bd36' : '#d3e8ff0c'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(left, py); c.lineTo(w - right, py); c.stroke();
    c.textAlign = 'right'; c.fillStyle = COLOR.muted; c.fillText(tickLabel(f, step), left - 9, py + 3);
  }
  for (let u = 0; u <= 1.001; u += 0.25) {
    c.strokeStyle = '#d3e8ff0b'; c.beginPath(); c.moveTo(tx(u), top); c.lineTo(tx(u), h - bottom); c.stroke();
    c.textAlign = 'center'; c.fillStyle = COLOR.muted; c.fillText(isDynamics(m) ? format(u * m.duration) : u === 0 || u === 1 ? u.toFixed(0) : u.toFixed(2), tx(u), h - bottom + 17);
  }
  c.fillStyle = COLOR.muted; c.textAlign = 'left'; c.font = '10px "Segoe UI", sans-serif';
  c.fillText(m.axis, left, 13);
  c.textAlign = 'right'; c.fillText(isDynamics(m) ? 'time t · seconds' : 'curve parameter u', w - right, h - 2);

  c.save(); c.beginPath(); c.rect(left, top, pw, ph); c.clip();
  const fill = c.createLinearGradient(0, top, 0, h - bottom);
  fill.addColorStop(0, '#5ae0d32e'); fill.addColorStop(1, '#5ae0d308');
  path(c, points, p => tx(p.u), p => ty(density(p)));
  c.lineTo(tx(1), zero); c.lineTo(tx(0), zero); c.closePath(); c.fillStyle = fill; c.fill();
  const interval = selectedInterval();
  if (interval) {
    const segment = sampleInterval(...interval, 90);
    const px0 = tx(interval[0]), px1 = tx(interval[1]);
    c.fillStyle = `${highlight}09`; c.fillRect(px0, top, px1 - px0, ph);
    path(c, segment, p => tx(p.u), p => ty(density(p))); c.lineTo(px1, zero); c.lineTo(px0, zero); c.closePath();
    c.fillStyle = `${highlight}31`; c.fill();
    c.save(); c.strokeStyle = `${highlight}35`; c.setLineDash([3, 5]);
    for (const u of interval) { c.beginPath(); c.moveTo(tx(u), top); c.lineTo(tx(u), h - bottom); c.stroke(); }
    c.restore();
  }
  if (state.guide) {
    c.save(); c.setLineDash([4, 5]); c.strokeStyle = '#b79bfaaa'; c.lineWidth = 1.2;
    path(c, optimum, p => tx(p.u), p => ty(density(p))); c.stroke(); c.restore();
  }
  c.strokeStyle = COLOR.cyan; c.lineWidth = 2;
  path(c, points, p => tx(p.u), p => ty(density(p))); c.stroke();
  if (interval) {
    const segment = sampleInterval(...interval, 90);
    c.strokeStyle = highlight; c.lineWidth = 2.5;
    path(c, segment, p => tx(p.u), p => ty(density(p))); c.stroke();
    const p = evaluate(m, state.current, state.selected);
    c.fillStyle = highlight; c.beginPath(); c.arc(tx(p.u), ty(density(p)), 3.5, 0, 2 * Math.PI); c.fill();
    const local = integrate(m, state.current, ...interval);
    $('local-value').textContent = `section: ${format(local)} ${m.unit}`;
  } else $('local-value').textContent = 'Move onto the curve';
  if (isDynamics(m)) {
    const p = evaluate(m, state.current, state.playhead);
    c.strokeStyle = COLOR.violet; c.lineWidth = 1; c.setLineDash([4, 4]);
    c.beginPath(); c.moveTo(tx(p.u), top); c.lineTo(tx(p.u), h - bottom); c.stroke(); c.setLineDash([]);
    c.fillStyle = COLOR.violet; c.beginPath(); c.arc(tx(p.u), ty(density(p)), 4, 0, 2 * Math.PI); c.fill();
  }
  c.restore();
}

function drawErrorMarker(relativeGap) {
  const c = ec, { width, height } = errorSize;
  c.clearRect(0, 0, width, height);
  // Align this compact center rail with the physical plotting area.
  const stageTop = world.parentElement.offsetTop;
  const top = stageTop + 22, floor = stageTop + worldSize.height - 50;
  const trackHeight = Math.max(1, floor - top), x = width / 2 + 8;
  // No square root, logarithm, zoom, dead zone, or extra easing: near a minimum
  // the excess integral is second order, and the marker must show that faithfully.
  const y = floor - trackHeight * relativeGap / ERROR_TOP;
  const color = variationColor();
  error.setAttribute('aria-label', `Error marker: ${format(ERROR_UNITS * relativeGap)} on a fixed linear scale, zero at the bottom and ${ERROR_UNITS * ERROR_TOP} at the roof. Error units are ten times the excess integral divided by ${isDynamics(state.mode) ? 'the positive action reference scale' : 'the magnitude of the minimum'}. The track is between the physical path and the integrand.${relativeGap > ERROR_TOP ? ' The marker is above the visible scale.' : ''} Small deviations near the optimum have a second-order effect on its height.`);
  c.save();
  c.font = '10px "Segoe UI", sans-serif'; c.fillStyle = COLOR.text;
  c.textAlign = 'center'; c.fillText('ERROR', width / 2, 26);
  c.strokeStyle = '#8da2bd50'; c.lineWidth = 1;
  c.beginPath(); c.moveTo(x, top); c.lineTo(x, floor); c.stroke();
  c.font = '9px "Segoe UI", sans-serif'; c.textAlign = 'right'; c.fillStyle = COLOR.muted;
  for (const fraction of [0, 0.5, 1]) {
    const tickY = floor - fraction * trackHeight;
    c.beginPath(); c.moveTo(x - 4, tickY); c.lineTo(x + 4, tickY); c.stroke();
    c.fillText(`${Math.round(ERROR_UNITS * ERROR_TOP * fraction)}`, x - 12, tickY + 3);
  }
  c.strokeStyle = '#5ae0d380'; c.lineWidth = 2;
  c.beginPath(); c.moveTo(x - 10, floor); c.lineTo(x + 10, floor); c.stroke();
  c.textAlign = 'center'; c.fillStyle = COLOR.cyan;
  c.fillText('minimum', width / 2, floor + 23);

  // Let large errors leave the roof rather than pinning the marker to its top.
  c.save(); c.beginPath(); c.rect(0, top, width, trackHeight + 15); c.clip();
  const halo = c.createRadialGradient(x, y, 2, x, y, 18);
  halo.addColorStop(0, `${color}70`); halo.addColorStop(1, `${color}00`);
  c.fillStyle = halo; c.beginPath(); c.arc(x, y, 18, 0, 2 * Math.PI); c.fill();
  const body = c.createRadialGradient(x - 3, y - 3, 1, x, y, 9);
  body.addColorStop(0, '#f3fff8'); body.addColorStop(0.45, color); body.addColorStop(1, `${color}aa`);
  c.fillStyle = body; c.beginPath(); c.arc(x, y, 8.5, 0, 2 * Math.PI); c.fill();
  c.restore();
  if (relativeGap > ERROR_TOP) {
    c.strokeStyle = color; c.lineWidth = 2;
    c.beginPath(); c.moveTo(x - 4, top + 8); c.lineTo(x, top + 3); c.lineTo(x + 4, top + 8); c.stroke();
  }
  c.restore();
}

function updateScore(value, relativeGap) {
  const m = state.mode;
  const solved = relativeGap <= m.tolerance && !state.generating;
  const valueText = format(value);
  if (valueText !== previousScoreText) { $('integral-value').textContent = valueText; previousScoreText = valueText; }
  $('gap-value').textContent = isDynamics(m) ? `ΔS = ${format(Math.max(0, value - m.target))} J·s` : `${format(relativeGap * 100, 2)}% above minimum`;
  // The canvas and score are updated from the same eased snapshot.
  document.querySelector('.integral-pane').classList.toggle('solved', solved && !state.revealed);
  if (state.generating) $('status-text').textContent = 'Shaping a new challenge…';
  else if (state.revealed) {
    const arrived = relativeGap < 1e-8;
    $('status-text').textContent = arrived ? `${m.solution}. The exact minimum.` : 'Moving to the exact solution…';
    $('solution-badge').textContent = arrived ? 'Exact solution shown' : 'Revealing the solution…';
  }
  else if (solved) $('status-text').textContent = 'Minimum found. Beautifully done.';
  else $('status-text').textContent = m.id === 'catenary' ? 'Lower energy. Same chain length.' : 'Pull the curve. Lower the integral.';
  if (solved && !state.solved && !state.revealed) announce(`Minimum found! ${m.symbol} is ${valueText} ${m.unit}, within the goal tolerance.`);
  state.solved = solved;
}

function pointerLocation(event) {
  const rect = world.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function hitTest(point, touch = false) {
  if (!transform) return null;
  if (isDynamics(state.mode)) {
    // Search the whole timed path in screen space, including every spline knot.
    // Project between samples so a steep or backtracking stretch stays grabbable.
    const segments = 8 * (NODE_COUNT - 1);
    let best = null, distance = touch ? 30 : 22;
    const start = evaluate(state.mode, state.current, 0);
    let x = transform.x(start.x), y = transform.y(start.y);
    for (let i = 1; i <= segments; i++) {
      const p = evaluate(state.mode, state.current, i / segments);
      const nextX = transform.x(p.x), nextY = transform.y(p.y);
      const dx = nextX - x, dy = nextY - y, lengthSquared = dx * dx + dy * dy;
      const fraction = lengthSquared > 0 ? clamp(((point.x - x) * dx + (point.y - y) * dy) / lengthSquared, 0, 1) : 0;
      const d = Math.hypot(point.x - x - fraction * dx, point.y - y - fraction * dy);
      if (d < distance) { best = (i - 1 + fraction) / segments; distance = d; }
      x = nextX; y = nextY;
    }
    return best > 0 && best < 1 ? best : null;
  }
  // Screen-space nearest point handles the cycloid's vertical start and steep bends.
  let best = null, bestDistance = touch ? 46 : 32;
  for (let i = 6; i < 295; i++) {
    const p = evaluate(state.mode, state.current, i / 300);
    const distance = Math.hypot(point.x - transform.x(p.x), point.y - transform.y(p.y));
    if (distance < bestDistance) { bestDistance = distance; best = p.u; }
  }
  const endpoints = [[0, 0], [state.mode.xMax, state.mode.yEnd]];
  if (endpoints.some(([x, y]) => Math.hypot(point.x - transform.x(x), point.y - transform.y(y)) < 14)) return null;
  return best;
}

world.addEventListener('pointerdown', event => {
  if (![0, 2].includes(event.button) || state.dragging) return;
  const smoothing = event.button === 2;
  const pointer = pointerLocation(event), anchor = hitTest(pointer, event.pointerType === 'touch');
  if (anchor === null && !smoothing) return;
  event.preventDefault(); world.focus({ preventScroll: true }); world.setPointerCapture(event.pointerId);
  state.keyboard = false; state.selected = anchor;
  state.dragging = { id: event.pointerId, anchor, startX: pointer.x, startY: pointer.y, initial: [...state.current], width: state.width, assist: state.assist, smoothing, pointer, smoothTime: 0 };
  if (isDynamics(state.mode)) {
    state.playing = false; state.playhead = anchor ?? state.playhead; $('duration').disabled = true; updatePlaybackControls();
  }
  state.target = [...state.current]; state.slowEase = false;
  resetFeedback();
  world.classList.add(smoothing ? 'smoothing' : 'dragging');
  requestFrame();
});

world.addEventListener('pointermove', event => {
  const pointer = pointerLocation(event);
  if (state.dragging) {
    if (state.dragging.id !== event.pointerId) return;
    event.preventDefault();
    const drag = state.dragging;
    if (!(event.buttons & (drag.smoothing ? 2 : 1))) { endDrag(event); return; }
    if (drag.smoothing) drag.pointer = pointer;
    else {
      setDragTarget(drag.initial, drag.anchor, (pointer.x - drag.startX) / transform.sx, (pointer.y - drag.startY) / transform.sy, drag.width, drag.assist);
      edited();
    }
  } else {
    resetFeedback();
    state.selected = hitTest(pointer, event.pointerType === 'touch');
    state.keyboard = false;
    world.classList.toggle('grabbable', state.selected !== null);
  }
  requestFrame();
});

function setDragTarget(initial, anchor, dx, dy, width = state.width, assist = state.assist) {
  const edit = dragCurve(state.mode, initial, anchor, dx, dy, width, assist);
  state.target = edit.coefficients; state.editWidth = edit.width;
}

function edited() {
  state.revealed = false; state.interacted = true; state.slowEase = false; state.generating = false;
  state.feedbackUntil = performance.now() + 600;
  $('solution-badge').hidden = true; $('scene-caption').style.opacity = '0';
}

function endDrag(event) {
  if (!state.dragging || event.pointerId !== state.dragging.id) return;
  if (event.type === 'pointerup' && (event.buttons & (state.dragging.smoothing ? 2 : 1))) return;
  if (world.hasPointerCapture(event.pointerId)) world.releasePointerCapture(event.pointerId);
  state.dragging = null; world.classList.remove('dragging', 'smoothing');
  $('duration').disabled = false;
  if (state.feedbackUntil) state.feedbackUntil = performance.now() + 600;
  if (event.pointerType === 'touch') state.selected = null;
  requestFrame();
}
world.addEventListener('pointerup', endDrag);
world.addEventListener('pointercancel', endDrag);
world.addEventListener('lostpointercapture', event => {
  if (state.dragging?.id === event.pointerId) { state.dragging = null; $('duration').disabled = false; world.classList.remove('dragging', 'smoothing'); requestFrame(); }
});
world.addEventListener('contextmenu', event => event.preventDefault());
window.addEventListener('blur', () => {
  if (state.dragging) endDrag({ pointerId: state.dragging.id });
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.dragging) endDrag({ pointerId: state.dragging.id });
});
world.addEventListener('pointerleave', () => {
  if (!state.dragging && !state.keyboard) { state.selected = null; resetFeedback(); world.classList.remove('grabbable'); requestFrame(); }
});
world.addEventListener('focus', () => {
  if (!state.dragging) { state.selected ??= 0.5; state.keyboard = true; requestFrame(); }
});
world.addEventListener('blur', () => {
  if (!state.dragging) { state.selected = null; state.keyboard = false; resetFeedback(); requestFrame(); }
});
world.addEventListener('keydown', event => {
  if (state.dragging) {
    if (event.key === 'Escape') { event.preventDefault(); endDrag({ pointerId: state.dragging.id }); }
    return;
  }
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Escape', '[', ']'].includes(event.key)) return;
  event.preventDefault(); state.keyboard = true; state.selected ??= 0.5;
  if (event.key === 'Escape') { state.selected = null; world.blur(); }
  else if (isDynamics(state.mode)) {
    state.playing = false;
    if (event.key === '[' || event.key === ']') {
      const node = state.selected * (NODE_COUNT - 1);
      const next = event.key === ']' ? Math.floor(node + 1e-8) + 1 : Math.ceil(node - 1e-8) - 1;
      state.selected = clamp(next, 1, NODE_COUNT - 2) / (NODE_COUNT - 1); resetFeedback();
    } else {
      const step = event.shiftKey ? 9 : 3;
      const dx = (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0) / transform.sx;
      const dy = (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0) / transform.sy;
      setDragTarget(state.target, state.selected, dx, dy);
      edited();
    }
    state.playhead = state.selected; updatePlaybackControls();
  }
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    resetFeedback();
    const x = state.mode.x(state.selected) + (event.key === 'ArrowRight' ? 1 : -1) * state.mode.xMax * 0.025;
    state.selected = clamp(parameterAtX(state.mode, x), 0.04, 0.96);
  } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    const delta = (event.key === 'ArrowDown' ? 1 : -1) * (event.shiftKey ? 9 : 3) / transform.sy;
    setDragTarget(state.target, state.selected, 0, delta);
    edited();
  }
  requestFrame();
});

document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => {
  if (state.mode.id !== button.dataset.mode) setMode(button.dataset.mode);
}));
$('brush').addEventListener('input', event => {
  state.width = Number(event.target.value); state.editWidth = null; updateBrush(); requestFrame();
});
function updateBrush() {
  $('brush').value = state.width;
  const name = state.width < 0.04 ? 'Fine' : state.width < 0.10 ? 'Local' : state.width < 0.19 ? 'Broad' : 'Wide';
  $('brush-size').textContent = name;
  $('brush').setAttribute('aria-valuetext', `${name} reach, ${format(100 * state.width, 1)} percent of ${isDynamics(state.mode) ? 'the duration' : 'the horizontal span'}`);
  $('brush').title = (isDynamics(state.mode) ? 'The brush reaches a fraction of the time interval.' : 'Left: finer details. Right: a broader pull.') + (state.assist ? ' Gentle assist makes neighbors follow more toward the solution and less away from it.' : '');
}
$('assist').addEventListener('change', event => {
  state.assist = event.target.checked; resetFeedback(); updateBrush(); requestFrame();
  announce(state.assist ? 'Gentle assist on. Neighbors follow more toward the solution; the grabbed point stays free.' : 'Gentle assist off. Unassisted variations.');
});
$('guide').addEventListener('change', event => { state.guide = event.target.checked; requestFrame(); });
$('new-curve').addEventListener('click', () => {
  state.playing = false; state.playhead = 0; updatePlaybackControls();
  state.target = newCurve(state.mode); state.revealed = false; state.solved = false; state.interacted = false;
  state.slowEase = true; state.selected = null; state.generating = true;
  resetFeedback();
  $('solution-badge').hidden = true; $('scene-caption').style.opacity = '1';
  requestFrame(); announce('A new curve. The endpoints are still fixed.');
});
$('reveal').addEventListener('click', () => {
  state.playing = false; state.playhead = 0; updatePlaybackControls();
  state.target = zeroCurve(state.mode); state.revealed = true; state.slowEase = true; state.selected = null; state.generating = false;
  resetFeedback();
  $('solution-badge').hidden = false; $('scene-caption').style.opacity = '0';
  requestFrame(); announce(`${state.mode.solution}. Revealing the analytic solution.`);
});

function updatePlaybackControls() {
  $('play').textContent = state.playing ? 'Ⅱ Pause' : state.playhead >= 1 ? '↻ Replay' : '▶ Play';
  $('play').setAttribute('aria-pressed', String(state.playing));
  $('scrub').value = state.playhead;
  const duration = MODES.dynamics.duration;
  $('time-value').textContent = `${format(state.playhead * duration)} / ${format(duration)} s`;
  $('scrub').setAttribute('aria-valuetext', `${format(state.playhead * duration)} seconds of ${format(duration)} seconds`);
}

$('duration').addEventListener('input', event => {
  if (!isDynamics(state.mode) || state.dragging) return;
  state.playing = false; state.revealed = false; state.solved = false; state.selected = null;
  MODES.dynamics = createDynamics(Number(event.target.value)); state.mode = MODES.dynamics;
  refreshExact(state.mode); resetFeedback();
  $('duration-value').textContent = `${format(state.mode.duration)} s`;
  $('target-value').textContent = `${format(state.mode.target)} ${state.mode.unit}`;
  $('solution-badge').hidden = true; updatePlaybackControls(); updateMath(); requestFrame();
});
$('play').addEventListener('click', () => {
  if (!isDynamics(state.mode) || state.dragging) return;
  if (!state.playing && state.playhead >= 1) state.playhead = 0;
  state.playing = !state.playing; state.selected = null; resetFeedback();
  updatePlaybackControls(); requestFrame();
});
$('scrub').addEventListener('input', event => {
  state.playing = false; state.playhead = Number(event.target.value); updatePlaybackControls(); requestFrame();
});
let scrubPointer = null;
function scrubGraph(event) {
  const r = graph.getBoundingClientRect();
  state.playing = false;
  state.playhead = clamp((event.clientX - r.left - 52) / (r.width - 70), 0, 1);
  updatePlaybackControls(); requestFrame();
}
graph.addEventListener('pointerdown', event => {
  if (!isDynamics(state.mode) || event.button !== 0) return;
  event.preventDefault(); scrubPointer = event.pointerId; graph.setPointerCapture(event.pointerId); scrubGraph(event);
});
graph.addEventListener('pointermove', event => { if (scrubPointer === event.pointerId) scrubGraph(event); });
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) graph.addEventListener(type, event => {
  if (event.pointerId !== scrubPointer) return;
  scrubPointer = null;
  if (graph.hasPointerCapture(event.pointerId)) graph.releasePointerCapture(event.pointerId);
});
$('math-open').addEventListener('click', () => $('math-dialog').showModal());
$('math-close').addEventListener('click', () => $('math-dialog').close());
$('math-dialog').addEventListener('click', event => {
  if (event.target !== $('math-dialog')) return;
  const r = $('math-dialog').getBoundingClientRect();
  if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) $('math-dialog').close();
});

const requestedScene = new URLSearchParams(location.search).get('scene');
setMode(Object.hasOwn(MODES, requestedScene) ? requestedScene : state.mode.id, true);
const resizeObserver = new ResizeObserver(() => {
  setupCanvas(world, worldSize); setupCanvas(graph, graphSize); setupCanvas(error, errorSize); requestFrame();
});
resizeObserver.observe(world.parentElement); resizeObserver.observe(graph.parentElement); resizeObserver.observe(error.parentElement);
window.addEventListener('pageshow', event => {
  // Browser Back can revive an entire edited page from the back/forward cache.
  if (event.persisted) { location.reload(); return; }
  updateBrush(); $('guide').checked = state.guide; $('assist').checked = state.assist;
  $('duration').value = MODES.dynamics.duration; updatePlaybackControls();
});
