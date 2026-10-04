import { CONFIG } from './config.js';
import { FirstPersonCamera, OrbitCamera, TopViewCamera } from './camera.js';
import { Renderer } from './renderer.js';
import { Transport } from './transport.js';
import { GeodesicDeviation } from './deviation.js';
import { DeviationConstruction } from './deviation-construction.js';
import { TidalForces } from './tidal.js';
import { GeodesicConstruction } from './geodesic.js';
import { projectionCornerSize } from './geodesic-renderer.js';
import { SphereMapView } from './sphere-map.js';
import { degrees, dot, frame, radians, tangentVector, wrapPi } from './math.js';

const $ = (id) => document.getElementById(id);
const model = new Transport();
const deviation = new GeodesicDeviation();
const deviationConstruction = new DeviationConstruction(deviation);
let previousOtherPath = null;
const tidal = new TidalForces();
const construction = new GeodesicConstruction();
let mode = CONFIG.mode;
const activeModel = () => mode === 'tidal' ? tidal : mode === 'geodesic' ? construction : mode === 'deviation' ? deviation : model;
const camera = new OrbitCamera();
const deviationCamera = new OrbitCamera({ ...CONFIG.camera, ...CONFIG.deviation.camera });
const tidalCamera = new OrbitCamera({ ...CONFIG.camera, ...CONFIG.tidal.camera });
const constructionCamera = new OrbitCamera({ ...CONFIG.camera, ...CONFIG.geodesic.camera });
const deviationCloseCamera = new FirstPersonCamera();
const constructionCloseCamera = new FirstPersonCamera({ ...CONFIG.firstPerson, ...CONFIG.geodesic.firstPerson });
const topCameras = Object.fromEntries(['transport', 'geodesic', 'deviation'].map(name => [name, new TopViewCamera()]));
const activeCamera = () => isTopView() ? topCameras[mode] : isFirstPerson() ? mode === 'geodesic' ? constructionCloseCamera : deviationCloseCamera : mode === 'tidal' ? tidalCamera : mode === 'geodesic' ? constructionCamera : mode === 'deviation' ? deviationCamera : camera;
const keys = new Set();
const sphereMap = new SphereMapView();
if (sphereMap.enabled) sphereMap.frame(model);
const options = { trail: CONFIG.trail.visible, history: CONFIG.trail.historyArrowsVisible, tangent: CONFIG.geometry.tangentVisible, otherPath: CONFIG.deviation.showOtherPath, firstPerson: CONFIG.firstPerson.enabled, tidalGrid: CONFIG.tidal.backgroundGrid.visible, geodesicFirstPerson: CONFIG.geodesic.firstPerson.enabled, sphereMap };
options.topView = Object.fromEntries(['transport', 'geodesic', 'deviation'].map(name => [name, name === 'deviation' ? CONFIG.deviation.topViewOnStart : CONFIG.topView.enabled]));
const isTopView = () => !!options.topView[mode];
const isFirstPerson = () => !isTopView() && (mode === 'geodesic' ? options.geodesicFirstPerson : mode === 'deviation' && options.firstPerson);
let speed = CONFIG.movement.speedDegPerSecond;
let renderer;
let pointer = null;
let lastTime = 0;
let lastReadout = 0;
let frameTime = 0;
let failed = false;
let latestStatus = '';
let deviationEdit = null;
let lastDeviationEdit = null;
let tidalScrubbing = false;
let constructionEditing = false;

// Round only at the display boundary, including values edited in config.js.
function formatNumber(value, decimals = CONFIG.display.decimals) {
  const precision = Math.min(decimals, CONFIG.display.decimals);
  return Number(value.toFixed(precision)).toFixed(precision); // Normalize rounded negative zero.
}
const compactNumber = value => String(Number(formatNumber(value)));

function updateVectorLabel(element, label) {
  element.style.color = label.color;
  element.classList.toggle('area-relation-label', label.kind === 'area-relation');
  const content = JSON.stringify([label.text, label.parts]);
  if (element.dataset.labelContent === content) return;
  element.dataset.labelContent = content;
  if (!label.parts) { element.textContent = label.text; return; }
  element.replaceChildren(...label.parts.map(part => {
    const span = document.createElement(part.subscript ? 'sub' : part.small ? 'small' : 'span');
    span.textContent = part.text; span.style.color = part.color;
    return span;
  }));
}

function fail(error) {
  failed = true;
  keys.clear();
  $('error-message').textContent = error.message || String(error);
  $('error').hidden = false;
  console.error(error);
}

function updateRange(input) {
  const progress = (Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min));
  input.style.setProperty('--fill', `${progress * 100}%`);
}

function updateSpeedOutput() {
  $('speed-output').textContent = model.surface.isTorus ? `${formatNumber(radians(speed))} u/s` : `${compactNumber(speed)}°/s`;
  $('speed').setAttribute('aria-valuetext', $('speed-output').textContent);
}

function status(message) {
  if (message !== latestStatus) { latestStatus = message; $('status').textContent = message; }
}

const signedColor = value => Math.abs(value) < CONFIG.curvature.zeroTolerance ? CONFIG.colors.curvatureZero : value < 0 ? CONFIG.colors.areaNegative : CONFIG.colors.areaPositive;

function updateDeviationReadout() {
  const d = deviation;
  const fixed = value => formatNumber(Math.abs(value));
  const signed = value => `${Number(formatNumber(value)) === 0 ? '' : value < 0 ? '−' : '+'}${fixed(value)}`;
  $('gap-value').innerHTML = d.connector.valid ? `${fixed(d.gap)} <small>u</small>` : '—';
  $('jacobi-value').innerHTML = `${fixed(d.jacobi)} <small>u</small>`;
  $('jacobi-caption').textContent = d.jacobi < 0 ? 'j < 0: the paths have crossed their focus' : 'small-separation approximation';
  $('deviation-curvature').innerHTML = `${signed(d.curvature)} <small>u⁻²</small>`;
  $('deviation-curvature').style.color = signedColor(d.curvature);
  $('deviation-acceleration').innerHTML = `${signed(d.acceleration)} <small>u/s²</small>`;
  $('deviation-acceleration').style.color = signedColor(d.curvature);
  $('curvature-effect').textContent = Math.abs(d.curvature) < 1e-5 ? 'Instantaneous curvature contribution is zero.' : d.curvature < 0 ? 'Negative curvature defocuses nearby paths.' : 'Positive curvature focuses nearby paths.';
  $('elapsed-time').textContent = `t = ${formatNumber(d.time)} s`;
  $('deviation-speed-output').textContent = `${formatNumber(d.playbackRate)}×`;
  $('deviation-speed').setAttribute('aria-valuetext', `${formatNumber(d.playbackRate)} times normal playback`);
  updateRange($('deviation-speed'));
  $('geodesic-speed').textContent = `${options.otherPath ? 'Equal speeds' : 'Surface speed'}: ${formatNumber(CONFIG.deviation.speed)} u/s · ${formatNumber(d.playbackRate * (isFirstPerson() ? CONFIG.firstPerson.playbackRate : 1))}× playback`;
  $('launch-geodesics').disabled = !!deviationEdit;
  $('restart-geodesics').disabled = !!deviationEdit;
  $('launch-geodesics').textContent = d.state === 'running' ? 'Ⅱ Pause' : d.state === 'paused' ? '▷ Resume' : d.state === 'idle' ? options.otherPath ? '▷ Launch geodesics' : '▷ Launch geodesic' : '▷ Launch again';
  const messages = {
    idle: options.otherPath ? 'Ready. Equal speeds; initial velocities are parallel across the separation.' : 'Ready. Follow the orange geodesic and its parallel-transported velocity.',
    running: options.otherPath ? 'Following two geodesics. The Jacobi prediction is exact in the infinitesimal limit.' : 'Following the orange geodesic. Its velocity is parallel transported: ∇ᵥ v = 0.',
    paused: 'Paused. Resume or adjust the initial conditions.',
    complete: 'Run complete. Launch again, or change the initial conditions.',
    'local-limit': 'The paths have left the local neighborhood. Try a smaller initial separation.',
    'connector-limit': 'The local separation could not be resolved. Restart with a smaller gap.',
  };
  status(deviationEdit ? deviationEdit.resume ? 'Adjust the starting vectors. Release the slider to relaunch.' : 'Adjust the starting vectors. Playback stays stopped while you drag.' : messages[d.state]);
  if (deviationConstruction.enabled) updateDeviationConstructionReadout();
}

function updateDeviationConstructionReadout() {
  const b = deviationConstruction;
  $('deviation-build-step').textContent = `Step ${b.completedSteps + (b.phase === 'transport' && b.phaseComplete ? 0 : 1)}`;
  for (const phase of ['move', 'transport']) $(`deviation-phase-${phase}`).setAttribute('aria-current', b.phase === phase ? 'step' : 'false');
  $('deviation-build-instruction').textContent = {
    ready: 'Advance both geodesics, then carry teal v₁ to yellow v₂.',
    move: 'Both points advance along their geodesics. Their new velocities remain tangent.',
    transport: 'Carry teal v₁ along the new connector to yellow v₂, keeping its length.',
  }[b.phase];
  $('build-old').textContent = b.start ? formatNumber(b.start.connector.length) : '—';
  $('build-xi').textContent = formatNumber(deviation.gap);
  $('build-velocity-1').textContent = formatNumber(CONFIG.deviation.speed);
  $('build-velocity-2').textContent = formatNumber(CONFIG.deviation.speed);
  const compared = b.comparisonReveal > 0 ? b.comparison : null;
  const split = compared ? b.velocityDecomposition : null;
  $('build-velocity-difference').textContent = compared ? formatNumber(compared.magnitude) : '—';
  $('build-previous-difference').textContent = split ? formatNumber(Math.hypot(...split.transportedPrevious)) : '—';
  $('build-extra-difference').textContent = split ? formatNumber(Math.hypot(...split.extra)) : '—';
  $('build-velocity-angle').textContent = compared ? formatNumber(Math.abs(compared.angle)) : '—';
  const differenceColor = signedColor(b.strip?.curvatureIntegral ?? deviation.surface.principal(deviation.particles[1].latitude).gaussian);
  document.querySelectorAll('.build-difference').forEach(element => { element.style.color = differenceColor; });
  $('deviation-build-area').textContent = `${formatNumber(b.strip?.area ?? 0)} u²`;
  $('deviation-build-area').style.color = signedColor(b.strip?.curvatureIntegral ?? deviation.curvature);
  $('deviation-build-dt').textContent = `${formatNumber(b.start ? deviation.time - b.start.time : 0)} s`;
  $('deviation-build-scale').textContent = 'One scale · cyan + red/blue = new Δv.';
  $('deviation-step-output').textContent = `${formatNumber(b.stepSize)} u`;
  $('deviation-step-size').setAttribute('aria-valuetext', `${formatNumber(b.stepSize)} surface units`);
  updateRange($('deviation-step-size'));
  $('deviation-build-manual').setAttribute('aria-pressed', String(!b.automatic));
  $('deviation-build-auto').setAttribute('aria-pressed', String(b.automatic));
  $('launch-geodesics').disabled = !!deviationEdit || b.terminal;
  $('launch-geodesics').textContent = b.terminal ? 'Step limit · Restart' : b.playing ? 'Ⅱ Pause phase' : !b.phaseComplete ? '▷ Resume phase' : b.automatic ? '▷ Start automatic' : b.phase === 'move' ? '▷ Transport v₁ → v₂' : '▷ Move both geodesics';
  status(b.terminal ? 'Local construction limit reached. Restart or reduce the separation.' : b.playing ? 'Smooth construction phase · pauses for inspection.' : 'Space advances one phase. Compare vectors only after parallel transport.');
}

function updateReadout() {
  $('follow-camera').setAttribute('aria-pressed', String(activeCamera().follow));
  if (mode === 'geodesic') {
    updateConstructionReadout();
    if (window.parallelTransport) document.body.dataset.diagnostics = JSON.stringify(window.parallelTransport.getState());
    return;
  }
  if (mode === 'tidal') {
    updateTidalReadout();
    if (window.parallelTransport) document.body.dataset.diagnostics = JSON.stringify(window.parallelTransport.getState());
    return;
  }
  if (mode === 'deviation') {
    updateDeviationReadout();
    if (window.parallelTransport) document.body.dataset.diagnostics = JSON.stringify(window.parallelTransport.getState());
    return;
  }
  const torus = model.surface.isTorus;
  const latitude = degrees(torus ? wrapPi(model.latitude) : model.latitude), longitude = degrees(wrapPi(model.longitude));
  const cardinal = (value, positive, negative) => Math.abs(value) < 0.05 ? '0.0°' : `${formatNumber(Math.abs(value), 1)}° ${value >= 0 ? positive : negative}`;
  $('latitude-value').textContent = torus ? `${formatNumber(latitude, 1)}°` : cardinal(latitude, 'N', 'S');
  $('longitude-value').textContent = torus ? `${formatNumber(longitude, 1)}°` : cardinal(longitude, 'E', 'W');
  const angle = ((degrees(model.angle) % 360) + 360) % 360;
  $('direction-value').innerHTML = `${formatNumber(angle, 1)}<span>°</span>`;
  $('compass-vector').setAttribute('transform', `rotate(${-angle} 36 36)`);
  const region = model.closedRegion, holonomy = region?.theta ?? null;
  const signed = (number) => `${Number(formatNumber(number)) < 0 ? '−' : ''}${formatNumber(Math.abs(number))}`;
  document.documentElement.style.setProperty('--area-angle', signedColor(holonomy ?? 1));
  $('holonomy-value').classList.toggle('subdued', holonomy === null);
  $('holonomy-value').innerHTML = holonomy === null ? '—' : `${signed(holonomy)}<span class="unit">rad</span>`;
  $('holonomy-caption').textContent = holonomy === null ? 'Return to start to compare' : 'rotation of the vector';
  const hasArea = !!region?.boundsArea;
  $('area-value').innerHTML = hasArea ? `${signed(region.curvatureIntegral)}<span class="unit">${torus ? 'rad' : 'sr'}</span>` : '—';
  $('area-value').classList.toggle('subdued', !hasArea);
  $('area-caption').textContent = hasArea ? torus ? `Surface area A = ${signed(region.area)} u²` : `${formatNumber(Math.abs(region.area) / (4 * Math.PI) * 100)}% of sphere · signed` : torus ? 'curvature over the region' : 'on the unit sphere';
  $('loop-relation').textContent = region ? !hasArea ? 'This loop winds around the torus and does not bound a surface patch.' : `${region.approximate ? 'Small gap included. ' : ''}${torus ? 'θ = ∫ K dA' : 'θ = A / R²'} = ${signed(holonomy)} rad${torus ? '' : ' · R = 1'}. Angle chosen modulo 2π.` : torus ? 'On a torus, θ matches ∫ K dA, the curvature over the region.' : 'On this unit sphere, area A and angle θ have the same numerical value.';
  $('loop-relation').classList.toggle('closed', !!region);
  $('closure-badge').hidden = !region;
  if (region) $('closure-badge').textContent = !hasArea ? 'LOOP CLOSED · WRAPS AROUND TORUS' : region.approximate ? 'NEAR START · SMALL GAP INCLUDED' : 'LOOP CLOSED · REGION SHADED';
  $('deflection-label').textContent = holonomy === null ? '' : `θ = ${signed(holonomy)} rad`;
  $('follow-camera').setAttribute('aria-pressed', String(camera.follow));
  $('demo-text').textContent = model.demo ? (model.demo.paused ? 'Resume loop' : 'Pause loop') : 'Run closed loop';
  $('demo-icon').textContent = model.demo && !model.demo.paused ? 'Ⅱ' : '▷';
  const k = model.surface.principal(model.latitude);
  for (const [id, value] of [['k1-value', k.east], ['k2-value', k.north], ['gaussian-value', k.gaussian]]) {
    $(id).textContent = `${Number(formatNumber(value)) === 0 ? '' : value < 0 ? '−' : '+'}${formatNumber(Math.abs(value))}`;
    $(id).style.color = signedColor(value);
  }

  if (model.polarLimit) status(`Chart limit: ±${compactNumber(CONFIG.movement.latitudeLimitDeg)}°. Move east, west, or toward the equator.`);
  else if (model.demo) status(model.demo.paused ? 'Loop paused. Resume, or take over with WASD.' : 'Transporting around a closed loop… WASD takes over.');
  else if (holonomy !== null) status(`${region.approximate ? 'Near the start' : 'Loop closed'}: ${hasArea ? `${torus ? '∫K dA' : 'A'} = ${signed(region.curvatureIntegral)} ${torus ? 'rad' : 'sr'} · ` : ''}θ = ${signed(holonomy)} rad.`);
  else if (model.distance > 0) status('Keep going. Return to the start to reveal the loop rotation.');
  else status('Ready. Move the vector or run a loop.');
  if (window.parallelTransport) document.body.dataset.diagnostics = JSON.stringify(window.parallelTransport.getState());
}

function updateTidalReadout() {
  $('tidal-clock').textContent = formatNumber(tidal.time);
  $('tidal-clock-state').textContent = { idle: 'Initially at rest', running: `Time is advancing · ${formatNumber(tidal.playbackRate)}×`, paused: 'Time paused', complete: 'Run complete' }[tidal.state];
  $('tidal-fall-readout').textContent = `r = ${formatNumber(tidal.motion.radius)} u · mass below ↓`;
  $('tidal-time-output').textContent = `${formatNumber(tidal.time)} / ${formatNumber(CONFIG.tidal.duration)} s`;
  if (!tidalScrubbing) $('tidal-time').value = tidal.time;
  $('tidal-time').setAttribute('aria-valuetext', `${formatNumber(tidal.time)} seconds`);
  $('tidal-shells-output').textContent = `${tidal.shellCount} ${tidal.shellCount === 1 ? 'shell' : 'shells'}`;
  $('tidal-shells').setAttribute('aria-valuetext', $('tidal-shells-output').textContent);
  $('tidal-speed-output').textContent = `${formatNumber(tidal.playbackRate)}×`;
  $('tidal-speed').setAttribute('aria-valuetext', `${formatNumber(tidal.playbackRate)} times normal speed`);
  $('tidal-particle-count').textContent = `${tidal.particleCount} masses · ${CONFIG.tidal.particlesPerShell} per shell`;
  $('play-tidal').textContent = { idle: '▷ Start time', running: 'Ⅱ Pause', paused: '▷ Resume', complete: '▷ Replay' }[tidal.state];
  $('play-tidal').disabled = tidalScrubbing;
  for (let i = 0; i < 3; i++) {
    $(`tidal-length-${i}`).textContent = `${formatNumber(tidal.scales[i] * tidal.shells[0].radius)} u`;
    $(`tidal-eigenvalue-${i}`).textContent = `λ${['₁', '₂', '₃'][i]} = ${tidal.eigenvalues[i] < 0 ? '−' : '+'}${formatNumber(Math.abs(tidal.eigenvalues[i]) * 1000)} ×10⁻³ s⁻²`;
  }
  updateRange($('tidal-time')); updateRange($('tidal-shells')); updateRange($('tidal-speed'));
  status({ idle: 'All test masses are initially stationary. Start time to see their relative acceleration.', running: 'Red stretches; blue compresses. Each arrow joins the center to an outer-shell test mass.', paused: 'Time paused. Drag the time slider to compare the shell at different moments.', complete: 'Ellipsoid reached. Scrub time, replay, or reset to the initial stationary sphere.' }[tidal.state]);
}

function updateConstructionControls(sync = false) {
  const c = CONFIG.geodesic;
  if (sync) {
    $('construction-direction').value = construction.directionDeg;
    $('construction-step-size').min = c.minStep;
    $('construction-step-size').max = construction.surface.isTorus ? c.torusMaxStep : c.sphereMaxStep;
    $('construction-step-size').step = c.stepIncrement;
    $('construction-step-size').value = construction.stepSize;
    $('construction-speed').min = c.minPlaybackRate;
    $('construction-speed').max = c.maxPlaybackRate;
    $('construction-speed').step = c.playbackRateStep;
    $('construction-speed').value = construction.playbackRate;
  }
  $('construction-direction-output').textContent = `${compactNumber(construction.directionDeg)}°`;
  $('construction-step-size-output').textContent = `${formatNumber(construction.stepSize)} u`;
  $('construction-speed-output').textContent = `${formatNumber(construction.playbackRate)}×`;
  for (const id of ['construction-direction', 'construction-step-size', 'construction-speed']) {
    $(id).setAttribute('aria-valuetext', $(`${id}-output`).textContent); updateRange($(id));
  }
  $('construction-manual').setAttribute('aria-pressed', String(!construction.automatic));
  $('construction-auto').setAttribute('aria-pressed', String(construction.automatic));
}

function updateConstructionReadout() {
  const m = construction, s = m.sample();
  const projected = m.phase === 'project' && m.phaseComplete;
  $('construction-step').textContent = `Step ${m.completedSteps + (projected ? 0 : 1)}`;
  $('construction-phase').textContent = m.phase === 'ready' ? 'Ready to move' : m.phase === 'move' ? 'Move along v' : m.phase === 'resolve' ? 'Resolve the components' : projected ? 'Tangent velocity ready' : s.restore > 0 ? 'Restore unit speed' : 'Project onto the plane';
  for (const phase of ['move', 'resolve', 'project']) $(`phase-${phase}`).setAttribute('aria-current', m.phase === phase ? 'step' : 'false');
  $('construction-instruction').textContent = { ready: 'Advance along v, then inspect its projection at the new point.', move: 'Carry the old vector unchanged while moving to the next surface point.', resolve: 'Gold = green tangent component + red normal component.', project: projected ? 'The next unit velocity lies in the new tangent plane.' : 'Remove the red normal component, then restore the vector to unit length.' }[m.phase];
  $('construction-old').textContent = formatNumber(Math.hypot(...s.old));
  $('construction-tangent').textContent = formatNumber(s.tangentLength);
  $('construction-normal').textContent = `${Number(formatNumber(s.normalScalar)) === 0 ? '' : s.normalScalar < 0 ? '−' : '+'}${formatNumber(Math.abs(s.normalScalar))}`;
  $('construction-next').disabled = constructionEditing || m.complete;
  $('construction-next').textContent = m.playing ? 'Ⅱ Pause motion' : !m.phaseComplete ? '▷ Resume phase' : m.automatic ? '▷ Start automatic' : m.phase === 'move' ? '▷ Resolve components' : m.phase === 'resolve' ? '▷ Project velocity' : '▷ Move to next point';
  updateConstructionControls();
  status(m.complete ? 'Run complete. Reset to build another path.' : m.playing ? `${m.automatic ? 'Automatic progression' : 'Animating one phase'} · each phase eases to a stop.` : 'Inspect the plane and components. Space or the action button advances; R resets.');
}

function updateConstructionDiagram() {
  const s = construction.sample(), x = 24, y = 96, length = 150;
  const tangentX = x + length * s.tangentLength, oldY = y - length * s.normalScalar;
  const path = (id, ax, ay, bx, by) => $(id).setAttribute('d', `M${ax} ${ay}L${bx} ${by}`);
  path('diagram-old', x, y, tangentX, oldY);
  path('diagram-tangent', x, y, tangentX, y);
  path('diagram-component', x, y, x, oldY);
  path('diagram-drop', tangentX, y, tangentX, oldY);
  const corner = Math.min(CONFIG.geodesic.diagramCornerMaxPx, projectionCornerSize(length, s.tangentLength, s.normalScalar));
  const cornerY = y - Math.sign(s.normalScalar) * corner;
  $('diagram-corner').setAttribute('d', `M${tangentX - corner} ${y}V${cornerY}H${tangentX}`);
  for (const id of ['diagram-tangent', 'diagram-component', 'diagram-drop', 'diagram-corner']) $(id).style.opacity = String(s.components * (id === 'diagram-tangent' || Math.abs(s.normalScalar) > 1e-5 ? 1 : 0));
  path('diagram-current', x, y, x + length * dot(s.displayed, s.next), y - length * dot(s.displayed, s.normal));
  $('diagram-current').style.opacity = construction.phase === 'project' ? '1' : '0';
  $('diagram-old').style.opacity = construction.phase === 'project' ? String(CONFIG.geodesic.ghostOpacity) : '1';
}

function updateViewControls() {
  const deviationMode = mode === 'deviation', tidalMode = mode === 'tidal', firstPerson = isFirstPerson(), topView = isTopView();
  document.body.dataset.firstPerson = String(firstPerson);
  document.body.dataset.otherPath = String(options.otherPath);
  $('show-other-path').checked = options.otherPath;
  $('show-tidal-grid').checked = options.tidalGrid;
  $('tidal-grid-note').hidden = !tidalMode || !options.tidalGrid;
  $('first-person').hidden = !deviationMode && mode !== 'geodesic';
  $('side-view').hidden = mode !== 'geodesic' || !firstPerson;
  $('top-view').hidden = tidalMode;
  $('top-view').textContent = deviationMode && topView ? 'Outside View' : 'Top View';
  $('top-view').title = deviationMode
    ? topView ? 'Switch to a fixed outside camera' : 'Look down with a parallel-transported camera orientation'
    : 'Look straight down at the point with a parallel-transported camera orientation; click again to restore the previous view';
  // Deviation names the destination view, so expose this as an action button.
  if (deviationMode) $('top-view').removeAttribute('aria-pressed');
  else $('top-view').setAttribute('aria-pressed', String(topView));
  $('first-person').setAttribute('aria-pressed', String(firstPerson));
  $('first-person').textContent = firstPerson ? 'First person · On' : 'First person';
  $('follow-camera').hidden = firstPerson || topView || tidalMode;
  document.querySelector('.surface-toolbar').hidden = tidalMode;
  $('camera-help').textContent = topView ? 'Transported direction ↑ · Scroll to zoom · Double-click to reset zoom' : firstPerson ? 'Drag to orbit dot · Scroll to zoom · Double-click to reset' : tidalMode ? 'Free-falling frame · Drag to orbit' : 'Drag to orbit · Scroll to zoom';
  $('geodesic-speed').textContent = `${options.otherPath ? 'Equal speeds' : 'Surface speed'}: ${formatNumber(CONFIG.deviation.speed)} u/s${firstPerson ? ` · ${compactNumber(CONFIG.firstPerson.playbackRate)}× playback` : options.otherPath ? ' · initially parallel' : ' · velocity parallel transported'}`;
  document.querySelectorAll('.comparison-only').forEach(element => { element.hidden = !deviationMode || !options.otherPath; });
  const build = deviationMode && deviationConstruction.enabled;
  document.body.dataset.deviationConstruction = String(build);
  $('deviation-construction').setAttribute('aria-pressed', String(build));
  for (const id of ['deviation-build-panel', 'deviation-step-control', 'deviation-progression']) $(id).hidden = !build;
  $('show-other-path').disabled = build;
  document.querySelector('.deviation-readouts').hidden = !deviationMode || !options.otherPath || build;
  $('orange-legend').textContent = options.otherPath ? '● v₂ · geodesic 2' : '● v · geodesic';
  $('deviation-formula').innerHTML = options.otherPath ? '∇<sub>v</sub>∇<sub>v</sub> ξ = −R(ξ, v)v' : '∇<sub>v</sub> v = 0';
  $('deviation-equation-caption').textContent = options.otherPath ? 'Transverse separation: j̈ = −K |v|² j' : 'Velocity is parallel transported along the geodesic';
  $('sphere-canvas').setAttribute('aria-label', `Interactive ${model.surface.type}. ${firstPerson ? 'First-person view following the orange particle. Drag to orbit the point, scroll to zoom, and double-click to restore the level forward view.' : deviationMode ? `${options.otherPath ? 'Two geodesics and their separation.' : 'One geodesic and its parallel-transported velocity.'} Drag to orbit and scroll to zoom.` : 'Use W A S D to move the vector. Drag to orbit and scroll to zoom.'}`);
  if (tidalMode) {
    $('sphere-title').textContent = '3D Tidal forces';
    $('surface-badge').textContent = 'LOCAL VACUUM TIDAL FIELD';
    $('sphere-canvas').setAttribute('aria-label', 'Concentric shells of small test masses deform under tidal acceleration. Colored separation arrows follow the three principal axes. Drag to orbit and scroll to zoom.');
  }
  if (mode === 'geodesic') $('sphere-canvas').setAttribute('aria-label', `Step-by-step geodesic construction with a tangent plane, surface normal, and velocity projection components. Drag to orbit ${firstPerson ? 'the orange point' : 'the surface'}, scroll to zoom, and double-click to reset the camera.`);
  if (topView) $('sphere-canvas').setAttribute('aria-label', `Top View of the ${model.surface.type}, following ${mode === 'deviation' ? 'the orange geodesic' : 'the point'} directly along the surface normal. Screen up follows the parallel-transported tangent. Scroll to zoom; double-click to reset zoom.`);
  if (renderer) renderer.sphere.resize();
}

function reset() {
  keys.clear();
  finishDeviationEdit(false);
  tidalScrubbing = false;
  constructionEditing = false;
  activeModel().reset();
  frameSphereMap();
  updateReadout();
}

function toggleDemo() {
  keys.clear();
  if (mode === 'geodesic') { if (!constructionEditing) construction.toggle(); updateReadout(); return; }
  if (mode === 'tidal') { if (!tidalScrubbing) tidal.toggle(); updateReadout(); return; }
  if (mode === 'deviation') { deviation.toggle(); updateReadout(); return; }
  if (model.demo) model.demo.paused = !model.demo.paused;
  else { model.startDemo(); camera.follow = true; frameSphereMap(); }
  updateReadout();
}

function changeLoop(settings) {
  keys.clear();
  const wasRunning = !!model.demo, wasPaused = model.demo?.paused;
  const wasComplete = !wasRunning && !!model.closedRegion;
  model.setLoop(settings);
  if (wasComplete) model.completeDemo();
  else if (wasRunning) { model.startDemo(); model.demo.paused = wasPaused; }
  frameSphereMap();
  updateLoopControls();
  updateReadout();
}

function updateLoopControls() {
  const circle = model.loopSettings.type === 'circle';
  $('rectangle-mode').setAttribute('aria-pressed', String(!circle));
  $('circle-mode').setAttribute('aria-pressed', String(circle));
  for (const id of ['rectangle-height-control', 'rectangle-width-control']) $(id).hidden = circle;
  for (const id of ['circle-size-control', 'circle-explanation']) $(id).hidden = !circle;
  for (const [id, property] of [['loop-height', 'heightDeg'], ['loop-width', 'widthDeg'], ['loop-radius', 'radiusDeg']]) {
    $(id).value = model.loopSettings[property];
    $(`${id}-output`).textContent = id === 'loop-radius' && model.surface.isTorus ? `${formatNumber(radians(model.loopSettings[property]) * model.surface.r)} u` : `${compactNumber(model.loopSettings[property])}°${id === 'loop-radius' ? ' radius' : ''}`;
    $(id).setAttribute('aria-valuetext', $(`${id}-output`).textContent);
    updateRange($(id));
  }
}

function updateSurfaceControls() {
  const torus = model.surface.isTorus;
  $('sphere-mode').setAttribute('aria-pressed', String(!torus));
  $('torus-mode').setAttribute('aria-pressed', String(torus));
  $('torus-starts').hidden = !torus;
  for (const [name, value] of [['outer', 0], ['inner', 180], ['top', 90]]) $(`torus-${name}`).setAttribute('aria-pressed', String(model.torusStartDeg === value));
  $('sphere-title').textContent = torus ? 'The torus' : 'The sphere';
  $('surface-badge').textContent = torus ? `R = ${compactNumber(model.surface.R)} · r = ${compactNumber(model.surface.r)}` : 'UNIT RADIUS · K = 1';
  $('map-badge').textContent = torus ? 'PERIODIC COORDINATES' : 'LOCAL DIRECTIONS';
  $('latitude-label').textContent = torus ? 'TUBE ANGLE v' : 'LATITUDE';
  $('longitude-label').textContent = torus ? 'RING ANGLE u' : 'LONGITUDE';
  $('coordinate-tag').textContent = torus ? 'u / v' : 'λ / φ';
  $('direction-label').textContent = torus ? 'DIRECTION FROM +u' : 'DIRECTION FROM EAST';
  $('area-title').textContent = torus ? 'CURVATURE ∫K dA' : 'SIGNED AREA A';
  $('projection-note').textContent = torus ? 'Opposite edges join in both directions. Shading shows signed curvature contributions.' : "Arrows show local east/north direction, independent of the map's stretching.";
  $('principal-note').textContent = torus ? 'κ₁: around the ring · κ₂: around the tube. Positive means convex.' : 'Every tangent direction is principal. Positive means convex.';
  $('height-help').textContent = torus ? 'Tube-angle span from the starting point' : 'Latitude span from the starting point';
  $('width-help').textContent = torus ? 'Ring-angle span from the starting point' : 'Longitude span along the equator';
  $('circle-size-help').textContent = torus ? 'Equal surface distance from the center' : 'Angular radius on the sphere';
  $('circle-formula').textContent = torus ? 'θ = ∫ K dA' : 'A = 2π(1 − cos ρ)';
  $('circle-note').textContent = torus ? 'A geodesic circle on the curved surface.' : 'A circle on the sphere stretches on the map.';
  $('demo-help').textContent = torus ? 'Curvature over the region turns the vector.' : 'One loop. Equal area and angle.';
  $('movement-help').textContent = torus ? 'W/S around tube · A/D around ring' : 'Move north / west / south / east';
  $('direction-help').innerHTML = torus ? '0° along ring <span>90° around tube</span><span>Updates without clearing your path</span>' : '0° east <span>90° north</span><span>Updates without clearing your path</span>';
  updateSpeedOutput();
  $('sphere-canvas').setAttribute('aria-label', `Interactive ${torus ? 'torus' : 'sphere'}. ${mode === 'deviation' ? 'Two geodesics and their separation. ' : 'Use W A S D to move the vector. '}Drag to orbit and scroll to zoom.`);
  $('launch-direction-help').textContent = torus ? '0° around ring · 90° around tube' : '0° east · 90° north';
  const latLabels = document.querySelectorAll('.latitude-labels span');
  const lonLabels = document.querySelectorAll('.longitude-labels span');
  (torus ? ['180°', '0°', '−180°'] : ['90° N', '0°', '90° S']).forEach((text, i) => latLabels[i].textContent = text);
  (torus ? ['−180°', '−90°', '0°', '90°', '180°'] : ['180° W', '90° W', '0°', '90° E', '180° E']).forEach((text, i) => lonLabels[i].textContent = text);
  updateLoopControls();
  updateViewControls();
  updateConstructionControls(true);
  updateMapControls();
}

function updateMapControls() {
  const torus = model.surface.isTorus, polar = !torus && sphereMap.enabled;
  const panel = document.querySelector('.map-panel');
  panel.classList.toggle('polar-map', polar);
  $('polar-view').hidden = torus;
  $('polar-view').setAttribute('aria-pressed', String(polar));
  $('polar-view').textContent = polar ? 'Polar view · On' : 'Polar view';
  $('polar-center-label').hidden = !polar;
  $('polar-center-label').textContent = sphereMap.pole > 0 ? 'N' : 'S';
  for (const selector of ['.latitude-labels', '.longitude-labels']) document.querySelector(selector).hidden = polar;
  $('map-title').textContent = polar ? (sphereMap.pole > 0 ? 'North polar map' : 'South polar map') : 'The map';
  if (!torus) {
    $('map-badge').textContent = polar ? 'STEREOGRAPHIC' : 'LOCAL DIRECTIONS';
    $('circle-note').textContent = polar ? 'A geodesic circle in an angle-preserving view.' : 'A circle on the sphere stretches on the map.';
    $('projection-note').textContent = polar ? 'Local angles preserved. Scroll to zoom · Double-click to reframe.' : "Arrows show local east/north direction, independent of the map's stretching.";
    $('coordinate-tag').textContent = polar ? (sphereMap.pole > 0 ? 'N' : 'S') : 'λ / φ';
    $('map-canvas').setAttribute('aria-label', polar ? 'Polar stereographic map with angle-preserving arrows. Use W A S D to move, scroll to zoom, and double-click to reframe around the nearer pole.' : 'Longitude latitude map with local east/north direction arrows. Use W A S D to move.');
  } else {
    $('map-canvas').setAttribute('aria-label', 'Longitude latitude projection of the same vector and path. Use W A S D to move.');
  }
  if (renderer) renderer.map.resize();
}

function frameSphereMap() {
  if (mode === 'transport' && !model.surface.isTorus && sphereMap.enabled) {
    sphereMap.frame(model);
    updateMapControls();
  }
}

function changeSurface(type) {
  if (model.surface.type === type) return;
  keys.clear();
  finishDeviationEdit(false);
  model.setSurface(type);
  deviation.setSurface(type);
  construction.setSurface(type);
  constructionCamera.follow = true;
  camera.follow = true;
  frameSphereMap();
  updateSurfaceControls();
  updateReadout();
}

function changeMode(next) {
  keys.clear();
  pointer = null;
  $('sphere-canvas').classList.remove('dragging');
  finishDeviationEdit(false);
  tidalScrubbing = false;
  constructionEditing = false;
  if (mode !== next) {
    if (model.demo) model.demo.paused = true;
    deviation.pause();
    tidal.pause();
    construction.pause();
  }
  mode = next;
  const isDeviation = mode === 'deviation';
  // Reuse the same heading, controls, and event handlers across compact views.
  const compactView = mode !== 'transport';
  document.body.dataset.compactView = String(compactView);
  const heading = $('surface-heading'), viewControls = document.querySelector('.view-controls');
  if (compactView) {
    if (mode === 'tidal') document.querySelector('.topbar').append(heading);
    else document.querySelector('.surface-toolbar').insertBefore(heading, document.querySelector('.sign-legend'));
    $(`${mode}-sidebar`).append(viewControls);
  } else {
    document.querySelector('.sphere-panel').prepend(heading);
    document.querySelector('.sphere-footer').append(viewControls);
  }
  document.body.dataset.mode = mode;
  for (const name of ['transport', 'geodesic', 'deviation', 'tidal']) {
    $(`${name}-mode`).setAttribute('aria-pressed', String(mode === name));
    document.querySelectorAll(`.${name}-only`).forEach(element => { element.hidden = mode !== name; });
  }
  document.querySelector('.map-panel').hidden = mode !== 'transport';
  document.querySelector('.workspace').setAttribute('aria-label', mode === 'tidal' ? 'Three-dimensional tidal deformation of test-mass shells' : mode === 'geodesic' ? 'Step-by-step geodesic construction' : isDeviation ? 'Geodesic deviation on a curved surface' : 'Synchronized views of parallel transport');
  $('follow-camera').textContent = isDeviation ? '◎ Follow geodesics' : '◎ Follow vector';
  if (renderer) { renderer.sphere.resize(); renderer.map.resize(); }
  updateSurfaceControls();
  updateReadout();
}

function updateDeviationControls() {
  // Do not assign range.value here: the browser owns the thumb during a drag.
  $('separation-output').textContent = `${formatNumber(deviation.separation)} u`;
  $('separation').setAttribute('aria-valuetext', `${formatNumber(deviation.separation)} surface units`);
  $('launch-direction-output').textContent = `${compactNumber(deviation.directionDeg)}°`;
  $('launch-direction').setAttribute('aria-valuetext', `${compactNumber(deviation.directionDeg)} degrees`);
  for (const id of ['separation', 'launch-direction']) updateRange($(id));
}

function beginDeviationEdit(input, kind, identifier) {
  if (deviationEdit) return;
  deviationEdit = { input, kind, identifier, resume: !deviationConstruction.enabled && deviation.state === 'running', previews: 0, heldFrames: 0, advancedSeconds: 0, sampleTime: deviation.time };
  deviation.pause();
  updateReadout();
}

function finishDeviationEdit(resume = true) {
  if (!deviationEdit) return;
  const edit = deviationEdit;
  deviationEdit = null;
  // Retain one read-only interaction sample for verifying real browser drags.
  lastDeviationEdit = { control: edit.input.id, previews: edit.previews, heldFrames: edit.heldFrames, advancedSeconds: edit.advancedSeconds, resumed: resume && edit.resume && mode === 'deviation' };
  if (resume && edit.resume && mode === 'deviation') deviation.toggle();
  updateReadout();
}

function setupDeviationSliders() {
  const rangeKeys = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);
  for (const [id, key] of [['separation', 'separation'], ['launch-direction', 'directionDeg']]) {
    const input = $(id);
    input.addEventListener('pointerdown', event => {
      if (event.button === 0) beginDeviationEdit(input, 'pointer', event.pointerId);
      // Let the native range handle capture and dragging; never prevent its default action.
    });
    input.addEventListener('keydown', event => {
      if (rangeKeys.has(event.key)) beginDeviationEdit(input, 'keyboard', event.key);
    });
    input.addEventListener('input', () => {
      // The change-only fallback supports assistive technologies without pointer events.
      beginDeviationEdit(input, 'change');
      deviation.setParameters({ [key]: Number(input.value) });
      deviationEdit.previews++;
      deviationEdit.sampleTime = deviation.time;
      updateDeviationControls();
      updateReadout();
    });
    input.addEventListener('change', () => {
      // Native change can fire before pointerup. Only release ends a pointer/key edit.
      if (deviationEdit?.kind === 'change') finishDeviationEdit();
    });
    input.addEventListener('blur', () => { if (deviationEdit?.input === input) finishDeviationEdit(false); });
  }
  // Listen on the window so releasing outside the slider still completes the edit.
  window.addEventListener('pointerup', event => {
    if (deviationEdit?.kind === 'pointer' && deviationEdit.identifier === event.pointerId) finishDeviationEdit();
  });
  window.addEventListener('pointercancel', event => {
    if (deviationEdit?.kind === 'pointer' && deviationEdit.identifier === event.pointerId) finishDeviationEdit(false);
  });
  window.addEventListener('keyup', event => {
    if (deviationEdit?.kind === 'keyboard' && deviationEdit.identifier === event.key) finishDeviationEdit();
  });
  window.addEventListener('blur', () => finishDeviationEdit(false));
  document.addEventListener('visibilitychange', () => { if (document.hidden) finishDeviationEdit(false); });
}

function setupControls() {
  // Fixed label pool shared by all modes; construction needs labels at both paths.
  for (let i = 4; i < 16; i++) {
    const label = document.createElement('span');
    label.id = `geodesic-label-${i}`; label.className = 'geodesic-label'; label.hidden = true;
    label.setAttribute('aria-hidden', 'true'); $('sphere-stage').append(label);
  }
  const dc = CONFIG.deviation.construction;
  for (const [name, color] of Object.entries(dc.colors)) document.documentElement.style.setProperty(`--build-${name}`, color);
  $('deviation-step-size').min = dc.minStep; $('deviation-step-size').max = dc.maxStep;
  $('deviation-step-size').step = dc.stepIncrement; $('deviation-step-size').value = deviationConstruction.stepSize;
  $('deviation-step-size').addEventListener('input', event => { deviationConstruction.setStepSize(Number(event.target.value)); updateReadout(); });
  $('deviation-construction').addEventListener('click', () => {
    finishDeviationEdit(false);
    const enabled = !deviationConstruction.enabled;
    if (enabled) { previousOtherPath = options.otherPath; options.otherPath = true; }
    else if (previousOtherPath !== null) { options.otherPath = previousOtherPath; previousOtherPath = null; }
    deviation.setComparisonEnabled(options.otherPath);
    deviationConstruction.setEnabled(enabled);
    updateViewControls(); updateReadout();
  });
  for (const [id, automatic] of [['deviation-build-manual', false], ['deviation-build-auto', true]]) $(id).addEventListener('click', () => {
    deviation.pause(); deviationConstruction.automatic = automatic; updateReadout();
  });
  $('polar-view').addEventListener('click', () => {
    if (model.surface.isTorus) return;
    sphereMap.toggle(model);
    updateMapControls();
    updateReadout();
  });
  document.documentElement.style.setProperty('--background', CONFIG.colors.background);
  document.documentElement.style.setProperty('--first-person-sky', CONFIG.colors.firstPersonSky);
  document.documentElement.style.setProperty('--accent', CONFIG.colors.path);
  document.documentElement.style.setProperty('--arrow', CONFIG.colors.arrow);
  document.documentElement.style.setProperty('--positive', CONFIG.colors.areaPositive);
  document.documentElement.style.setProperty('--negative', CONFIG.colors.areaNegative);
  document.documentElement.style.setProperty('--neutral', CONFIG.colors.curvatureZero);
  for (const [name, color] of [['geodesic-a', 'geodesicA'], ['geodesic-b', 'geodesicB'], ['separation', 'separation']]) document.documentElement.style.setProperty(`--${name}`, CONFIG.colors[color]);
  $('separation').min = CONFIG.deviation.minSeparation;
  $('separation').max = CONFIG.deviation.maxSeparation;
  $('separation').step = CONFIG.deviation.separationStep;
  $('separation').value = deviation.separation;
  $('launch-direction').value = deviation.directionDeg;
  $('deviation-speed').min = CONFIG.deviation.minPlaybackRate;
  $('deviation-speed').max = CONFIG.deviation.maxPlaybackRate;
  $('deviation-speed').step = CONFIG.deviation.playbackRateStep;
  $('deviation-speed').value = deviation.playbackRate;
  $('deviation-speed').addEventListener('input', event => { deviation.setPlaybackRate(Number(event.target.value)); updateReadout(); });
  $('geodesic-speed').textContent = `Equal speeds: ${formatNumber(CONFIG.deviation.speed)} u/s · initially parallel`;
  setupDeviationSliders();
  updateDeviationControls();
  for (const [name, value] of Object.entries(CONFIG.geodesic.colors)) document.documentElement.style.setProperty(`--construction-${name}`, value);
  updateConstructionControls(true);
  for (const id of ['construction-direction', 'construction-step-size']) {
    const input = $(id);
    const begin = () => { constructionEditing = true; construction.pause(); updateReadout(); };
    input.addEventListener('pointerdown', begin);
    input.addEventListener('keydown', event => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) begin(); });
    input.addEventListener('input', () => {
      construction.setParameters(id === 'construction-direction' ? { directionDeg: Number(input.value) } : { stepSize: Number(input.value) });
      updateConstructionControls(); updateReadout();
    });
    input.addEventListener('blur', () => { constructionEditing = false; });
  }
  for (const event of ['pointerup', 'pointercancel', 'keyup', 'blur']) window.addEventListener(event, () => { constructionEditing = false; });
  $('construction-speed').addEventListener('input', event => { construction.setPlaybackRate(Number(event.target.value)); updateReadout(); });
  for (const [id, automatic] of [['construction-manual', false], ['construction-auto', true]]) $(id).addEventListener('click', () => { construction.setAutomatic(automatic); updateReadout(); });
  $('construction-next').addEventListener('click', toggleDemo);
  $('construction-reset').addEventListener('click', reset);
  for (const name of ['transport', 'geodesic', 'deviation', 'tidal']) $(`${name}-mode`).addEventListener('click', () => changeMode(name));
  $('tidal-shells').max = CONFIG.tidal.shellRadii.length;
  $('tidal-shells').value = tidal.shellCount;
  $('tidal-time').max = CONFIG.tidal.duration;
  $('tidal-time').step = CONFIG.tidal.timeStep;
  $('tidal-speed').min = CONFIG.tidal.minPlaybackRate;
  $('tidal-speed').max = CONFIG.tidal.maxPlaybackRate;
  $('tidal-speed').step = CONFIG.tidal.playbackRateStep;
  $('tidal-speed').value = tidal.playbackRate;
  CONFIG.tidal.axisColors.forEach((color, i) => { $(`tidal-axis-${i}`).style.color = color; });
  $('tidal-shells').addEventListener('input', event => { tidal.setShellCount(Number(event.target.value)); updateReadout(); });
  $('tidal-speed').addEventListener('input', event => { tidal.setPlaybackRate(Number(event.target.value)); updateReadout(); });
  const endTimeScrub = () => { if (tidalScrubbing) { tidalScrubbing = false; updateReadout(); } };
  $('tidal-time').addEventListener('pointerdown', () => { tidalScrubbing = true; tidal.pause(); updateReadout(); });
  $('tidal-time').addEventListener('keydown', event => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) { tidalScrubbing = true; tidal.pause(); }
  });
  $('tidal-time').addEventListener('input', event => { tidal.seek(Number(event.target.value)); updateReadout(); });
  for (const name of ['pointerup', 'pointercancel', 'keyup', 'blur']) window.addEventListener(name, endTimeScrub);
  $('tidal-time').addEventListener('blur', endTimeScrub);
  $('play-tidal').addEventListener('click', toggleDemo);
  $('reset-tidal').addEventListener('click', reset);
  $('tidal-camera-reset').addEventListener('click', () => tidalCamera.reset());
  $('show-tidal-grid').addEventListener('change', event => {
    options.tidalGrid = event.target.checked;
    updateViewControls(); updateReadout();
  });
  $('launch-geodesics').addEventListener('click', () => { deviation.toggle(); updateReadout(); });
  $('restart-geodesics').addEventListener('click', () => { deviation.restart(); updateReadout(); });
  $('show-other-path').addEventListener('change', event => {
    options.otherPath = event.target.checked;
    deviation.setComparisonEnabled(options.otherPath);
    updateViewControls(); updateReadout();
  });
  $('first-person').addEventListener('click', () => {
    const enabled = !isFirstPerson();
    options.topView[mode] = false;
    if (mode === 'geodesic') options.geodesicFirstPerson = enabled;
    else options.firstPerson = enabled;
    if (mode === 'deviation' && !enabled) deviationCamera.follow = false;
    pointer = null;
    $('sphere-canvas').classList.remove('dragging');
    updateViewControls(); updateReadout();
  });
  $('top-view').addEventListener('click', () => {
    options.topView[mode] = !isTopView();
    if (mode === 'deviation') {
      options.firstPerson = false;
      deviationCamera.follow = false;
    }
    pointer = null;
    $('sphere-canvas').classList.remove('dragging');
    updateViewControls(); updateReadout();
  });
  $('side-view').addEventListener('click', () => {
    const canvas = $('sphere-canvas').getBoundingClientRect();
    const inset = document.querySelector('.projection-card').getBoundingClientRect();
    const overlaps = inset.top < canvas.bottom && inset.bottom > canvas.top;
    // The projection extends right of the particle; leave room for the inset.
    const right = overlaps ? Math.min(canvas.right, inset.left) : canvas.right;
    const aspect = 2 * Math.max(canvas.width * 0.15, right - (canvas.left + canvas.width / 2)) / canvas.height;
    constructionCloseCamera.sideView(construction.stepSize, aspect, Math.abs(construction.sample().normalScalar) * construction.stepSize);
  });
  $('direction').value = CONFIG.initial.directionDeg;
  $('direction-output').textContent = `${compactNumber(CONFIG.initial.directionDeg)}°`;
  $('speed').min = CONFIG.movement.minSpeedDegPerSecond;
  $('speed').max = CONFIG.movement.maxSpeedDegPerSecond;
  $('speed').value = speed;
  updateSpeedOutput();
  for (const [id, property, minimum, maximum] of [
    ['loop-height', 'heightDeg', CONFIG.loop.minHeightDeg, CONFIG.loop.maxHeightDeg],
    ['loop-width', 'widthDeg', CONFIG.loop.minWidthDeg, CONFIG.loop.maxWidthDeg],
    ['loop-radius', 'radiusDeg', CONFIG.loop.minCircleRadiusDeg, CONFIG.loop.maxCircleRadiusDeg],
  ]) {
    $(id).min = minimum; $(id).max = maximum; $(id).step = CONFIG.loop.dimensionStepDeg;
    $(id).addEventListener('input', (event) => changeLoop({ [property]: Number(event.target.value) }));
  }
  for (const type of ['rectangle', 'circle']) $(`${type}-mode`).addEventListener('click', () => {
    if (model.loopSettings.type !== type) changeLoop({ type });
  });
  for (const type of ['sphere', 'torus']) $(`${type}-mode`).addEventListener('click', () => changeSurface(type));
  for (const [name, angle] of [['outer', 0], ['inner', 180], ['top', 90]]) $(`torus-${name}`).addEventListener('click', () => {
    const complete = mode === 'transport' && !model.demo && !!model.closedRegion;
    keys.clear(); finishDeviationEdit(false); model.setTorusStart(angle); deviation.setTorusStart(angle); construction.setTorusStart(angle); camera.follow = true; constructionCamera.follow = true;
    if (complete) model.completeDemo();
    updateSurfaceControls(); updateReadout();
  });
  updateSurfaceControls();
  for (const id of ['direction', 'speed']) updateRange($(id));
  $('direction').addEventListener('input', (event) => {
    model.setDirection(Number(event.target.value));
    $('direction-output').textContent = `${compactNumber(Number(event.target.value))}°`;
    updateRange(event.target);
    updateReadout();
  });
  $('speed').addEventListener('input', (event) => {
    speed = Number(event.target.value);
    updateSpeedOutput();
    updateRange(event.target);
  });
  for (const [id, key] of [['show-trail', 'trail'], ['show-history', 'history'], ['show-tangent', 'tangent']]) {
    $(id).checked = options[key];
    $(id).addEventListener('change', (event) => { options[key] = event.target.checked; });
  }
  $('reset').addEventListener('click', reset);
  $('demo').addEventListener('click', toggleDemo);
  $('follow-camera').addEventListener('click', () => { activeCamera().follow = !activeCamera().follow; updateReadout(); });
  changeMode(mode);
  // This size is only a map-fit constraint, never a driver of the workspace size.
  const workspace = document.querySelector('.workspace');
  new ResizeObserver(([entry]) => workspace.style.setProperty('--workspace-height', `${entry.contentRect.height}px`)).observe(workspace);
}

function setupInput() {
  const movement = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD']);
  const editingText = (target) => target?.isContentEditable || target?.tagName === 'TEXTAREA' || (target?.tagName === 'INPUT' && !['range', 'checkbox', 'button'].includes(target.type));
  window.addEventListener('keydown', (event) => {
    if (editingText(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
    if (mode === 'transport' && movement.has(event.code)) {
      event.preventDefault();
      keys.add(event.code);
    }
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') keys.add(event.code);
    if (event.code === 'KeyR' && !event.repeat) { event.preventDefault(); reset(); }
    if (event.code === 'Space' && !event.repeat && !['BUTTON', 'INPUT'].includes(event.target.tagName)) { event.preventDefault(); toggleDemo(); }
  });
  window.addEventListener('keyup', (event) => { keys.delete(event.code); });
  window.addEventListener('blur', () => { keys.clear(); pointer = null; $('sphere-canvas').classList.remove('dragging'); });
  document.addEventListener('visibilitychange', () => { keys.clear(); lastTime = 0; });

  const canvas = $('sphere-canvas');
  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    canvas.focus({ preventScroll: true });
    if (isTopView()) return;
    canvas.setPointerCapture(event.pointerId);
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.classList.add('dragging');
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!pointer || pointer.id !== event.pointerId) return;
    activeCamera().orbit(event.clientX - pointer.x, event.clientY - pointer.y);
    pointer.x = event.clientX; pointer.y = event.clientY;
    if (!isFirstPerson()) $('follow-camera').setAttribute('aria-pressed', 'false');
  });
  const release = (event) => { if (pointer?.id === event.pointerId) { pointer = null; canvas.classList.remove('dragging'); } };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('lostpointercapture', release);
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1;
    activeCamera().zoom(event.deltaY * unit);
  }, { passive: false });
  canvas.addEventListener('dblclick', () => { activeCamera().reset(); updateReadout(); });
  $('map-canvas').addEventListener('pointerdown', () => $('map-canvas').focus({ preventScroll: true }));
  $('map-canvas').addEventListener('wheel', event => {
    if (mode !== 'transport' || model.surface.isTorus || !sphereMap.enabled) return;
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? $('map-canvas').clientHeight : 1;
    sphereMap.zoom(event.deltaY * unit);
  }, { passive: false });
  $('map-canvas').addEventListener('dblclick', frameSphereMap);
  for (const button of document.querySelectorAll('[data-move]')) {
    button.addEventListener('pointerdown', (event) => { event.preventDefault(); button.setPointerCapture(event.pointerId); keys.add(button.dataset.move); });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, () => keys.delete(button.dataset.move));
  }
  for (const id of ['sphere-canvas', 'map-canvas']) $(id).addEventListener('webglcontextlost', (event) => { event.preventDefault(); fail(new Error('The graphics context was interrupted. Reload the page to restart WebGL2.')); });
}

function tick(time) {
  if (failed) return;
  try {
    const rawSeconds = lastTime ? (time - lastTime) / 1000 : 0;
    const dt = Math.min(rawSeconds, CONFIG.movement.maxFrameSeconds);
    lastTime = time;
    if (rawSeconds > 0) frameTime = frameTime ? frameTime * 0.96 + rawSeconds * 0.04 : rawSeconds;
    const east = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
    const north = Number(keys.has('KeyW')) - Number(keys.has('KeyS'));
    const boost = keys.has('ShiftLeft') || keys.has('ShiftRight') ? CONFIG.movement.boostMultiplier : 1;
    if (mode === 'geodesic') {
      if (!constructionEditing) construction.advancePlayback(dt);
      updateConstructionDiagram();
    } else if (mode === 'tidal') {
      if (!tidalScrubbing) tidal.advancePlayback(dt);
    } else if (mode === 'deviation') {
      if (deviationEdit) {
        deviationEdit.heldFrames++;
        deviationEdit.advancedSeconds += Math.max(0, deviation.time - deviationEdit.sampleTime);
        deviationEdit.sampleTime = deviation.time;
      } else deviation.advancePlayback(dt * (isFirstPerson() ? CONFIG.firstPerson.playbackRate : 1), isFirstPerson() ? CONFIG.firstPerson.trailSampleStep : CONFIG.deviation.trailSampleStep);
    }
    else if (east || north) model.move(east, north, dt, speed * boost);
    else { model.polarLimit = false; model.advanceDemo(dt, speed); }
    activeCamera().update(dt, activeModel());
    sphereMap.update(dt);
    renderer.draw(activeModel(), activeCamera(), options);
    // The compact phone layout places measurements above the actual canvas.
    const offsetX = $('sphere-canvas').offsetLeft, offsetY = $('sphere-canvas').offsetTop;
    const place = (element, point) => { element.style.left = `${point.x + offsetX}px`; element.style.top = `${point.y + offsetY}px`; };
    for (const [id, northPole] of [['north-label', true], ['south-label', false]]) {
      const p = renderer.polePosition(northPole), element = $(id);
      place(element, p); element.hidden = !p.visible;
    }
    const angleLabel = renderer.angleLabel;
    $('deflection-label').hidden = !angleLabel?.visible;
    if (angleLabel) place($('deflection-label'), angleLabel);
    for (let i = 0; i < 2; i++) {
      const label = renderer.principalLabels[i], element = $(`principal-label-${i + 1}`);
      element.hidden = !label?.visible;
      if (label) { place(element, label); element.style.color = label.color; }
    }
    for (let i = 0; i < 16; i++) {
      const label = renderer.deviationLabels[i], element = $(`geodesic-label-${i}`);
      element.hidden = !label?.visible;
      if (label) { place(element, label); updateVectorLabel(element, label); }
    }
    if (time - lastReadout >= CONFIG.render.readoutIntervalMs) { updateReadout(); lastReadout = time; }
    requestAnimationFrame(tick);
  } catch (error) { fail(error); }
}

async function start() {
  if (location.protocol === 'file:') throw new Error('This project loads JavaScript modules and separate shader files over HTTP. Use Live Server instead of opening the file directly.');
  setupControls();
  setupInput();
  renderer = await Renderer.create($('sphere-canvas'), $('map-canvas'));
  updateReadout();
  // Read-only diagnostics for browser verification and learning. No second simulation.
  window.parallelTransport = Object.freeze({
    getState: () => {
      const active = mode === 'tidal' ? model : activeModel(), viewCamera = activeCamera();
      const vector = tangentVector(active.latitude, active.longitude, active.isGeodesic ? active.currentPoint.angle : active.isDeviation ? active.reference.angle : model.angle);
      return {
        ready: !failed, mode, construction: construction.diagnostics(), constructionView: mode === 'geodesic' ? renderer.constructionView : null, deviation: deviation.diagnostics(), deviationConstruction: deviationConstruction.diagnostics(), tidal: tidal.diagnostics(), tidalView: mode === 'tidal' ? renderer.tidalView : null,
        editingGeodesicParameter: deviationEdit ? { control: deviationEdit.input.id, kind: deviationEdit.kind, resumeOnRelease: deviationEdit.resume } : null,
        lastGeodesicParameterEdit: lastDeviationEdit ? { ...lastDeviationEdit } : null,
        surface: mode === 'tidal' ? null : active.surface.type, principalCurvatures: mode === 'tidal' ? null : active.surface.principal(active.latitude),
        latitudeDeg: degrees(active.latitude), longitudeDeg: degrees(wrapPi(active.longitude)),
        directionDeg: degrees(model.angle), rotationDeg: degrees(model.rotation),
        distanceRadians: model.distance, initialDirectionDeg: degrees(model.initialAngle),
        tangentError: Math.abs(dot(vector, frame(active.latitude, active.longitude).normal)),
        vectorLength: Math.hypot(...vector), trailPoints: model.trail.length,
        holonomyDeg: model.holonomy === null ? null : degrees(model.holonomy),
        thetaRadians: model.closedRegion?.theta ?? null,
        loopSettings: { ...model.loopSettings },
        enclosedAreaSteradians: model.surface.isTorus ? null : model.closedRegion?.area ?? null,
        enclosedSurfaceArea: model.closedRegion?.area ?? null,
        curvatureIntegral: model.closedRegion?.curvatureIntegral ?? null,
        areaComparisonError: model.closedRegion?.boundsArea ? Math.abs(model.closedRegion.curvatureIntegral - model.closedRegion.theta) : null,
        areaHighlighted: !!renderer.closedRegion?.boundsArea,
        loopWinding: model.closedRegion ? { ring: model.closedRegion.ringWinding ?? 0, tube: model.closedRegion.tubeWinding ?? 0 } : null,
        boundaryPoints: model.boundary.length,
        mapView: mode === 'transport' ? renderer.mapView : null,
        arrowMeshTriangles: renderer.arrow.count / 3,
        demo: model.demo ? { leg: model.demo.leg, paused: model.demo.paused } : null,
        camera: { mode: isTopView() ? 'top' : isFirstPerson() ? 'first-person' : 'orbit', yaw: viewCamera.yaw, targetYaw: viewCamera.targetYaw, pitch: viewCamera.pitch, targetPitch: viewCamera.targetPitch, distance: viewCamera.distance, targetDistance: viewCamera.targetDistance, follow: viewCamera.follow, pose: renderer.cameraPose ? { eye: renderer.cameraPose.eye, target: renderer.cameraPose.target, distance: renderer.cameraPose.distance, forward: renderer.cameraPose.forward, up: renderer.cameraPose.up, normal: renderer.cameraPose.normal } : null },
        geodesicView: mode === 'deviation' ? renderer.geodesicView : null,
        views: ['sphere', 'map'].map((key) => ({ name: key, visible: renderer[key].canvas.clientWidth > 0, width: renderer[key].canvas.width, height: renderer[key].canvas.height, webgl2: renderer[key].gl instanceof WebGL2RenderingContext })),
        frames: renderer.frames, fps: frameTime ? 1 / frameTime : 0, options: { ...options },
      };
    },
  });
  document.body.dataset.ready = 'true';
  requestAnimationFrame(tick);
}

start().catch(fail);
