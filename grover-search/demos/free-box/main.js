import { SearchSimulation, expectedProbability, probabilities,
  sineCoefficients, boxProbability } from './multiregion-core.js?v=20261014-particles';
import { FlowRenderer } from './flow-renderer.js?v=20261014-particles';

const GRID = 512;
const PARTICLE_COUNT_MAX = 100000;
const simulation = new SearchSimulation(15);
const params = { speed: 1, visGain: .8, visGamma: .55, showPhase: true, showGrid: true,
  showCurrent: true, showParticles: true, showTrails: true, particleCount: 25000,
  particleSize: 1.5, arrowGrid: 16, currentGain: 1.5, trailHalfLife: .1 };
const byId = id => document.getElementById(id);
const dom = Object.fromEntries(['gridSize', 'gridSizeValue', 'gridSummary', 'appTitle', 'stateCountLabel',
  'circuitXLabel', 'circuitYLabel', 'circuitTitle', 'circuitDescription', 'inverseCaption', 'c', 'waveArea', 'waveLabels', 'stage', 'waveHeader', 'waveFooter',
  'goalGrid', 'targetSummary', 'prepare', 'oracle', 'inverse', 'reference', 'forward', 'next', 'full',
  'reset', 'pause', 'progressBar', 'stageStatus', 'speed', 'speedValue',
  'phaseToggle', 'gridToggle', 'ui', 'uibody', 'minui', 'circuitPanel', 'circuitToggle', 'circuitStatus',
  'circuitTarget', 'circuitReadout', 'iterationTrack', 'modeProbability', 'boxProbability', 'normValue',
  'waveTarget', 'waveProbability', 'gateDescription', 'error', 'loading',
  'currentToggle', 'particlesToggle', 'trailsToggle',
  'particleProbability', 'flowStatus'].map(id => [id, byId(id)]));
const canvas = dom.c;
let gl, waveTexture, waveFbo, vao, reconstruction, renderer, flow, ready = false;
let waveDirty = true, renderDirty = true, frameRecordingActive = false, lastTime = null, glError = 0;
let lastUiKey = '', previousBusy = null, cachedBoxProbability = 0;
const targetButtons = [], waveCells = [];
const gateButtons = ['prepare', 'oracle', 'inverse', 'reference', 'forward'];
const circuitGates = Array.from(document.querySelectorAll('[data-circuit-kind]'));

function formatProbability(p) { return `${(100 * Math.max(0, Math.min(1, p))).toFixed(1)}%`; }
function markChanged() { waveDirty = true; renderDirty = true; lastUiKey = ''; }

function makeTargetGrid() {
  const { side, stateCount, labels: LABELS, iterations, inverseFactor } = simulation.model;
  targetButtons.length = 0; dom.goalGrid.replaceChildren();
  dom.goalGrid.setAttribute('aria-label', 'Select one of ' + stateCount + ' marked modes in the same layout as the wave');
  dom.inverse.textContent = 'A† · forward wait ' + inverseFactor + 'T';
  dom.reference.textContent = 'Reference phase |' + LABELS[0] + '⟩';
  dom.full.textContent = 'Run full search · ' + iterations + ' iterations';
  waveCells.length = 0; dom.waveLabels.replaceChildren();
  document.documentElement.style.setProperty('--grid-side', side);
  dom.gridSize.value = side; dom.gridSizeValue.textContent = side + '×' + side;
  dom.gridSize.setAttribute('aria-valuetext', side + ' by ' + side + ', ' + stateCount + ' states');
  dom.gridSummary.textContent = stateCount + ' spatial states. Changing size resets the search.';
  dom.appTitle.textContent = 'Grover · free ' + side + '×' + side;
  document.title = dom.appTitle.textContent + ' · ' + stateCount + ' states';
  dom.stateCountLabel.textContent = 'FREE BOX EVOLUTION · ' + stateCount + ' LOGICAL MODES';
  canvas.setAttribute('aria-label', 'Continuous two-dimensional probability wave with ' + stateCount + ' outcome regions');
  dom.circuitXLabel.textContent = 'x (' + side + ')'; dom.circuitYLabel.textContent = 'y (' + side + ')';
  dom.circuitTitle.textContent = 'Grover circuit: two ' + side + '-level position registers';
  dom.circuitPanel.setAttribute('aria-label', dom.circuitTitle.textContent);
  dom.circuitDescription.textContent = 'Preparation runs once. Oracle, inverse mixer, reference phase and forward mixer repeat ' + iterations + ' times.';
  dom.inverseCaption.textContent = 'WAIT ' + inverseFactor + 'T';
  dom.full.title = 'Prepare and run ' + iterations + ' Grover iterations';
  dom.iterationTrack.innerHTML = Array.from({ length: iterations }, (_, i) => '<span data-iteration="' + (i+1) + '">Iteration ' + (i+1) + '<b>—</b></span>').join('');
  for (let y = side - 1; y >= 0; y--) for (let x = 0; x < side; x++) {
    const q = side * x + y, button = document.createElement('button');
    button.type = 'button'; button.dataset.target = q;
    button.setAttribute('aria-label', `Mark |${LABELS[q]}⟩, column ${x + 1}, row ${y + 1} from bottom`);
    button.innerHTML = `<span>|${LABELS[q]}⟩</span><b>0.0%</b><i></i>`;
    button.addEventListener('click', () => chooseTarget(q));
    dom.goalGrid.append(button); targetButtons[q] = button;
    const cell = document.createElement('div'); cell.className = 'waveCell'; cell.dataset.region = q;
    cell.innerHTML = `<span>|${LABELS[q]}⟩</span><b>0.0%</b>`;
    dom.waveLabels.append(cell); waveCells[q] = cell;
  }
}

function setGridSize(value) {
  if (!simulation.setGridSize(Number(value))) return false;
  flow?.reset(params.particleCount, simulation.initial, simulation.model.side);
  makeTargetGrid(); markChanged(); syncUi(); layout(); return true;
}
function chooseTarget(q) {
  if (!simulation.setTarget(q)) return false;
  flow?.reset(params.particleCount,simulation.initial,simulation.model.side);
  markChanged(); syncUi(); return true;
}
function reset() { simulation.reset(); flow?.reset(params.particleCount,simulation.initial,simulation.model.side); markChanged(); syncUi(); }
function startNext() { if (simulation.startNext()) { markChanged(); syncUi(); return true; } return false; }
function runFull() { if (simulation.runFull()) { flow?.reset(params.particleCount,simulation.initial,simulation.model.side); markChanged(); syncUi(); return true; } return false; }
function togglePause() { simulation.paused = !simulation.paused; lastUiKey = ''; syncUi(); }
// Kept for recording integrations; the reading view uses the fixed 25,000-tracer preset.
function setParticleCount(value) {
  if (simulation.active) return false;
  params.particleCount = Math.max(256, Math.min(PARTICLE_COUNT_MAX, Math.round(Number(value) || 25000)));
  reset(); return true;
}

function syncUi() {
  const { side, stateCount: STATE_COUNT, labels: LABELS, gates: GATES, iterations: ITERATIONS, inverseFactor } = simulation.model;
  const gate = simulation.active || simulation.last;
  const kind = gate?.kind || 'input', progress = simulation.active?.progress ?? (simulation.last ? 1 : 0);
  const iteration = gate?.iteration || 0, busy = !!simulation.active, complete = simulation.completed === GATES.length;
  const key = `${simulation.revision}/${simulation.target}/${simulation.completed}/${kind}/${progress}/${busy}/${simulation.paused}`;
  if (key === lastUiKey) return;
  lastUiKey = key;
  const p = probabilities(simulation.amplitudes), target = simulation.target;
  cachedBoxProbability = boxProbability(simulation.amplitudes, target);
  for (let q = 0; q < STATE_COUNT; q++) {
    const button = targetButtons[q], text = formatProbability(p[q]), isTarget = q === target;
    button.classList.toggle('selected', isTarget);
    button.setAttribute('aria-pressed', String(isTarget)); button.disabled = busy;
    button.querySelector('b').textContent = text;
    button.querySelector('i').style.width = text;
    waveCells[q].classList.toggle('marked', isTarget);
    waveCells[q].querySelector('b').textContent = text;
    button.dataset.probability = p[q];
  }
  const targetText = `|${LABELS[target]}⟩`;
  dom.targetSummary.textContent = `Goal ${targetText} · column ${Math.floor(target / side) + 1}, row ${(target % side) + 1} from bottom`;
  dom.waveTarget.textContent = `MARKED ${targetText}`;
  dom.waveProbability.textContent = formatProbability(p[target]);
  dom.modeProbability.textContent = formatProbability(p[target]);
  dom.boxProbability.textContent = formatProbability(cachedBoxProbability);
  dom.normValue.textContent = p.reduce((sum, value) => sum + value, 0).toFixed(6);
  const nextKind = GATES[simulation.completed]?.kind;
  for (const id of gateButtons) dom[id].disabled = busy || nextKind !== id;
  dom.next.disabled = busy || complete;
  dom.full.disabled = busy;
  dom.pause.textContent = simulation.paused ? 'Resume' : 'Pause';
  dom.oracle.textContent = `Oracle · ${targetText}`;
  dom.progressBar.style.width = `${100 * progress}%`;
  const round = iteration ? `Round ${iteration}/${ITERATIONS} · ` : '';
  const status = complete ? 'Complete · ' + ITERATIONS + ' Grover iterations' : busy
    ? `${simulation.paused ? 'Paused' : 'Running'} · ${round}${gate.name} · ${Math.round(100 * progress)}%`
    : gate ? `${round}${gate.name} complete` : 'Ready · input |'+LABELS[0]+'⟩';
  dom.stageStatus.textContent = status;
  dom.circuitStatus.textContent = status;
  dom.circuitTarget.textContent = `w = ${targetText}`;
  const order = ['prepare', 'oracle', 'inverse', 'reference', 'forward'];
  for (const element of circuitGates) {
    const ownKind = element.dataset.circuitKind;
    const active = busy && ownKind === kind;
    const done = ownKind === 'prepare' ? simulation.completed > 0 : iteration > 0 &&
      (order.indexOf(ownKind) < order.indexOf(kind) || (!busy && ownKind === kind));
    element.classList.toggle('active', active);
    element.classList.toggle('complete', done && !active);
    element.classList.toggle('future', !active && !done);
  }
  dom.circuitPanel.classList.toggle('paused', simulation.paused);
  dom.circuitReadout.classList.toggle('complete', complete);
  for (const marker of dom.iterationTrack.children) {
    const n = Number(marker.dataset.iteration);
    const result = simulation.checkpoints.find(checkpoint => checkpoint.kind === 'forward' && checkpoint.iteration === n);
    marker.classList.toggle('complete', !!result);
    marker.classList.toggle('active', iteration === n && !result);
    marker.querySelector('b').textContent = result ? formatProbability(result.targetProbability) : '—';
  }
  const descriptions = {
    input: 'Begin in one localized mode. Prepare the balanced state to start the search.',
    prepare: 'Free-box evolution for T prepares '+(100/STATE_COUNT).toFixed(3)+'% in each of '+STATE_COUNT+' logical modes, with definite relative phases.',
    oracle: 'Only the marked mode changes phase. Its probability stays fixed while its contribution interferes differently in space.',
    inverse: 'Keep evolving forward under the same free Hamiltonian for '+inverseFactor+'T. The full revival at '+(2*side)+'T makes this A†.',
    reference: 'The |'+LABELS[0]+'⟩ coefficient turns through π while every other logical coefficient stays fixed.',
    forward: 'Free evolution for T completes the reflection. Unmarked contributions cancel and the marked mode grows.',
  };
  dom.gateDescription.textContent = complete ? (100*expectedProbability(ITERATIONS,side)).toFixed(3)+'% marked-mode probability after '+ITERATIONS+' iterations.' : descriptions[kind];
  document.documentElement.dataset.stage = String(simulation.completed);
  document.documentElement.dataset.gate = kind;
  document.documentElement.dataset.progress = String(progress);
  document.documentElement.dataset.target = String(target);
  if (flow) {
    const stats = flow.statistics(target, progress, !busy || simulation.paused);
    dom.particleProbability.textContent = formatProbability(stats.boxProbability);
    const model = ['input','prepare','inverse','forward'].includes(kind) ? 'Schrödinger probability current' : 'conserved phase-gate transport';
    dom.flowStatus.textContent = `${stats.count.toLocaleString()} tracers · ${model}`;
    document.documentElement.dataset.particleFailures = String(stats.failures);
    document.documentElement.dataset.particleLag = String(stats.maxLag);
  }
  if (previousBusy !== busy) { previousBusy = busy; dom.waveArea.classList.toggle('busy', busy); }
}

function installEvents() {
  dom.gridSize.addEventListener('input', () => setGridSize(dom.gridSize.value));
  gateButtons.forEach(id => dom[id].addEventListener('click', startNext));
  dom.next.addEventListener('click', startNext); dom.full.addEventListener('click', runFull);
  dom.reset.addEventListener('click', reset); dom.pause.addEventListener('click', togglePause);
  dom.speed.addEventListener('input', () => { params.speed = Number(dom.speed.value); dom.speedValue.textContent = `${params.speed.toFixed(2)}×`; });
  dom.phaseToggle.addEventListener('click', () => {
    params.showPhase = !params.showPhase; dom.phaseToggle.textContent = params.showPhase ? 'ON' : 'OFF';
    dom.phaseToggle.setAttribute('aria-pressed', String(params.showPhase)); renderDirty = true;
  });
  dom.gridToggle.addEventListener('click', () => {
    params.showGrid = !params.showGrid; dom.gridToggle.textContent = params.showGrid ? 'ON' : 'OFF';
    dom.gridToggle.setAttribute('aria-pressed', String(params.showGrid));
    dom.waveLabels.hidden = !params.showGrid; renderDirty = true;
  });
  for (const [id, key] of [['currentToggle','showCurrent'],['particlesToggle','showParticles'],['trailsToggle','showTrails']]) {
    dom[id].addEventListener('click', () => {
      params[key] = !params[key]; dom[id].setAttribute('aria-pressed', String(params[key]));
      if (key === 'showTrails') flow?.clearTrails();
      renderDirty = true;
    });
  }
  dom.minui.addEventListener('click', () => {
    dom.uibody.hidden = !dom.uibody.hidden; dom.minui.textContent = dom.uibody.hidden ? '+' : '−';
    dom.minui.setAttribute('aria-expanded', String(!dom.uibody.hidden));
  });
  dom.circuitToggle.addEventListener('click', () => {
    const collapsed = dom.circuitPanel.classList.toggle('collapsed');
    dom.circuitToggle.textContent = collapsed ? '+' : '−'; dom.circuitToggle.setAttribute('aria-expanded', String(!collapsed));
  });
  canvas.addEventListener('click', event => {
    const bounds = canvas.getBoundingClientRect(), side = simulation.model.side;
    const x = Math.min(side - 1, Math.max(0, Math.floor(side * (event.clientX - bounds.left) / bounds.width)));
    const y = Math.min(side - 1, Math.max(0, Math.floor(side * (bounds.bottom - event.clientY) / bounds.height)));
    chooseTarget(side * x + y);
  });
  window.addEventListener('keydown', event => {
    if (event.target.matches('input,button,summary,[contenteditable]')) return;
    if (event.code === 'Space') { event.preventDefault(); togglePause(); }
    if (event.key.toLowerCase() === 'r') reset();
  });
  new ResizeObserver(layout).observe(dom.stage);
  window.addEventListener('resize', layout);
}

function layout() {
  const side = Math.max(160, Math.floor(Math.min(dom.stage.clientWidth,
    dom.stage.clientHeight - dom.waveHeader.offsetHeight - dom.waveFooter.offsetHeight - 24)));
  dom.waveArea.style.width = `${side}px`; dom.waveArea.style.height = `${side}px`;
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const pixels = Math.round(side * dpr);
  if (canvas.width !== pixels || canvas.height !== pixels) { canvas.width = pixels; canvas.height = pixels; renderDirty = true; }
}

function compileShader(type, source) {
  const shader = gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
  return shader;
}
function createProgram(vertex, fragment, uniforms, varyings) {
  const program = gl.createProgram();
  const vs = compileShader(gl.VERTEX_SHADER, vertex), fs = compileShader(gl.FRAGMENT_SHADER, fragment);
  gl.attachShader(program, vs); gl.attachShader(program, fs);
  if (varyings) gl.transformFeedbackVaryings(program, varyings, gl.INTERLEAVED_ATTRIBS);
  gl.linkProgram(program);
  gl.deleteShader(vs); gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  return { program, uniforms: Object.fromEntries(uniforms.map(name => [name, gl.getUniformLocation(program, name)])) };
}
async function loadShader(name) {
  const url = new URL(`./shaders/${name}`, import.meta.url);
  url.search = new URL(import.meta.url).search;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Unable to load ${name}: ${response.status}`);
  return response.text();
}

function reconstructWave() {
  gl.bindFramebuffer(gl.FRAMEBUFFER, waveFbo); gl.viewport(0, 0, GRID, GRID);
  gl.useProgram(reconstruction.program);
  gl.uniform2fv(reconstruction.uniforms['uCoefficients[0]'], Float32Array.from(sineCoefficients(simulation.amplitudes)));
  gl.uniform1f(reconstruction.uniforms.uGridSize, GRID);
  gl.uniform1i(reconstruction.uniforms.uSide, simulation.model.side);
  gl.drawArrays(gl.TRIANGLES, 0, 3); waveDirty = false;
}
function render() {
  gl.bindVertexArray(vao);
  if (waveDirty) reconstructWave();
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, canvas.width, canvas.height);
  gl.useProgram(renderer.program); const u = renderer.uniforms;
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, waveTexture); gl.uniform1i(u.uWave, 0);
  gl.uniform1f(u.uVisGain, params.visGain); gl.uniform1f(u.uVisGamma, params.visGamma);
  gl.uniform1i(u.uShowPhase, params.showPhase ? 1 : 0); gl.uniform1i(u.uShowGrid, params.showGrid ? 1 : 0);
  gl.uniform1i(u.uSide, simulation.model.side);
  gl.uniform1i(u.uTarget, simulation.target);
  const gate = simulation.active;
  gl.uniform1i(u.uGateRegion, gate?.kind === 'oracle' ? simulation.target : gate?.kind === 'reference' ? 0 : -1);
  gl.uniform1f(u.uGateFlash, gate ? Math.sin(Math.PI * gate.progress) : 0);
  gl.uniform1f(u.uPixelSize, 1 / canvas.width);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  flow.render(canvas, { ...params, target: simulation.target }, simulation.active);
  glError = gl.getError() || glError;
  document.documentElement.dataset.glError = String(glError);
  renderDirty = false;
}
function advance(seconds) {
  if (simulation.active && !simulation.paused && Number.isFinite(seconds) && seconds > 0) {
    let remaining = seconds;
    while (simulation.active && remaining > 1e-12) {
      const gate = simulation.active, dt = Math.min(.02, remaining, gate.duration-gate.elapsed);
      if (dt <= 1e-12) break;
      flow?.step(gate, simulation.target, Math.min(1,(gate.elapsed+dt)/gate.duration), dt, params);
      simulation.advance(dt); remaining -= dt;
    }
    markChanged();
  }
  syncUi();
  if (ready && (waveDirty || renderDirty)) render();
}

// Recording keeps the inherited bridge; the named API is also used by the
// reproducible browser verification page. Reads expose the actual GPU texture.
const api = {
  isReady: () => ready,
  viewerSettings: () => ({ ...params }),
  state: () => ({ ...simulation.snapshot(), boxProbability: cachedBoxProbability, grid: GRID, speed: params.speed }),
  reset, setTarget: chooseTarget, startNext, runFull, togglePause,
  setParticleCount, setGridSize,
  readParticles: () => flow.readParticles(),
  readFlow: () => { if (simulation.active) flow.prepare(simulation.active, simulation.target); return flow.readField(simulation.active?.progress ?? 1); },
  particleStats: () => flow.statistics(simulation.target, simulation.active?.progress ?? (simulation.last ? 1 : 0), true),
  setSpeed(value) { params.speed = Math.max(.1, Math.min(3, Number(value) || 1)); dom.speed.value = params.speed; dom.speedValue.textContent = `${params.speed.toFixed(2)}×`; },
  advanceTime(seconds) { advance(seconds); return this.state(); },
  beginFrameRecording() { frameRecordingActive = true; },
  endFrameRecording() { frameRecordingActive = false; lastTime = null; },
  renderRecordingFrame({ fps = 60 } = {}) { advance(params.speed / fps); },
  readWave() {
    if (waveDirty) render();
    const pixels = new Float32Array(GRID * GRID * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, waveFbo); gl.readPixels(0, 0, GRID, GRID, gl.RGBA, gl.FLOAT, pixels);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); return pixels;
  },
  gpuInfo() {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return { renderer: gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER), grid: GRID, error: gl.getError() || glError };
  },
};
window.GroverMultiRegion = api;
window.BohmianGrover2D = api;

async function main() {
  makeTargetGrid(); installEvents(); layout(); syncUi();
  gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false });
  if (!gl || !gl.getExtension('EXT_color_buffer_float')) throw new Error('This wave view requires WebGL2 with floating-point render targets.');
  const linear = !!gl.getExtension('OES_texture_float_linear');
  gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.DITHER);
  vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const [vertex, waveSource, renderSource] = await Promise.all([
    loadShader('fullscreen.vert'), loadShader('mode_wave.frag'), loadShader('multiregion_render.frag'),
  ]);
  reconstruction = createProgram(vertex, waveSource, ['uCoefficients[0]', 'uGridSize', 'uSide']);
  renderer = createProgram(vertex, renderSource, ['uSide', 'uWave', 'uVisGain', 'uVisGamma', 'uShowPhase', 'uShowGrid', 'uTarget', 'uGateRegion', 'uGateFlash', 'uPixelSize']);
  waveTexture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, waveTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, linear ? gl.LINEAR : gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, linear ? gl.LINEAR : gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, GRID, GRID, 0, gl.RGBA, gl.FLOAT, null);
  waveFbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, waveFbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, waveTexture, 0);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Could not create the floating-point wave texture.');
  const initializedFlow = new FlowRenderer(gl, GRID, loadShader, createProgram);
  await initializedFlow.init(vertex); flow = initializedFlow;
  flow.reset(params.particleCount,simulation.initial,simulation.model.side);
  ready = true; lastUiKey = ''; syncUi(); dom.loading.hidden = true; document.documentElement.dataset.webgl2 = 'ready';
  document.documentElement.dataset.viewMode = 'single'; render();
  requestAnimationFrame(function loop(now) {
    const dt = lastTime === null ? 0 : Math.min(.05, Math.max(0, (now - lastTime) / 1000));
    lastTime = now;
    if (!frameRecordingActive) advance(dt * params.speed);
    requestAnimationFrame(loop);
  });
}
main().catch(error => {
  console.error(error); dom.loading.hidden = true; dom.error.hidden = false;
  dom.error.textContent = error.message; document.documentElement.dataset.webgl2 = 'error';
});
