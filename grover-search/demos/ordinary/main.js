import { SearchSimulation, expectedProbability, mixerProjection } from './ordinary-core.js?v=20261014-continue-rounds';
import { HistogramRenderer, columnHeight, columnValues, formatAmplitude } from './histogram-renderer.js?v=20261014-continue-rounds';

// Independent state-vector Grover circuit; no physics simulation is loaded.
const simulation = new SearchSimulation(15, 0, 4);
const dom = Object.fromEntries(['gridSize', 'gridSizeValue', 'gridSummary', 'stateCountLabel', 'appTitle', 'minui', 'uibody',
  'initialState', 'targetState', 'selectInitial', 'selectTarget', 'selectionHint', 'previous', 'next', 'full',
  'pause', 'reset', 'gateProgress', 'progressBar', 'stageStatus', 'speed', 'speedValue',
  'phaseColors', 'valueLabels', 'phaseLegend', 'columnView', 'columnHelp', 'heightLegend', 'c', 'plotArea', 'plotBadge', 'error',
  'markedLabel', 'markedProbability', 'orbitLeft', 'orbitRight', 'zoomOut', 'zoomIn', 'topView',
  'resetView', 'levelView', 'elevation', 'elevationValue', 'gateDescription', 'inspectState', 'circuitStatus', 'circuitDiagram',
  'circuitInputX', 'circuitInputY', 'circuitXLabel', 'circuitYLabel', 'circuitTitle', 'circuitDescription',
  'circuitPanel', 'circuitToggle', 'circuitTarget', 'circuitReadout', 'diffuserLabel', 'initialLabel', 'selectionTitle',
  'repeatCaption', 'prepareSymbol', 'inverseSymbol', 'forwardSymbol', 'combinedMixerSymbol', 'combineMixer', 'iterationTrack', 'mixerNote',
  'successValue', 'expectedValue', 'normValue', 'iterationsNote', 'theoryMixer',
  'meanPlane', 'meanGuidePanel', 'meanGuideTitle', 'meanInputLabel', 'meanInputValue', 'meanOutputRow', 'meanOutputLabel', 'meanOutputValue', 'meanShiftRow', 'meanShiftValue', 'meanGuideNote',
].map(id => [id, document.getElementById(id)]));
const gateNodes = [...document.querySelectorAll('[data-circuit-kind]')];
const options = { columnView: 'real', phaseColors: true, valueLabels: true, meanPlane: true, speed: 1 };
let renderer, ready = false, dirty = true, recording = false, lastTime = null, selection = null, hovered = -1;
const percent = p => `${(100 * Math.max(0, Math.min(1, p))).toFixed(2)}%`;
const ket = q => `|${simulation.model.labels[q]}⟩`;
const symbol = () => simulation.model.side % 2 ? 'B' : 'H';
const text = (node, value) => { if (node.textContent !== value) node.textContent = value; };
const markDirty = () => { dirty = true; };
function error(message) { text(dom.error, message); dom.error.hidden = !message; }
function iterationNode(iteration) {
  const node = document.createElement('span'); node.dataset.iteration = iteration;
  const value = document.createElement('b'); value.textContent = '—';
  node.append(document.createTextNode(`Iteration ${iteration}`), value); return node;
}

function buildGridUI() {
  const { side, stateCount, labels, iterations } = simulation.model;
  const combined = simulation.combineMixer;
  dom.gridSize.value = side; text(dom.gridSizeValue, `${side} × ${side}`);
  dom.gridSize.setAttribute('aria-valuetext', `${side} by ${side}, ${stateCount} states`);
  text(dom.gridSummary, `${stateCount} computational basis states. Changing size resets the search.`);
  text(dom.stateCountLabel, `${stateCount} states · ${iterations} ${iterations === 1 ? 'round' : 'rounds'} recommended`);
  document.title = `Ordinary Grover · ${side}×${side}`;
  text(dom.appTitle, document.title);
  for (const select of [dom.initialState, dom.targetState]) {
    select.replaceChildren(...labels.map((label, q) => {
      const option = document.createElement('option'); option.value = q;
      option.textContent = `|${label}⟩  ·  (${Math.floor(q / side)}, ${q % side})`; return option;
    }));
  }
  dom.iterationTrack.replaceChildren(...Array.from({length: iterations}, (_, i) => iterationNode(i+1)));
  text(dom.repeatCaption, `Recommended: ${iterations} ${iterations === 1 ? 'round' : 'rounds'} after preparation. Keep stepping to explore further rounds.`);
  text(dom.prepareSymbol, symbol()); text(dom.forwardSymbol, symbol());
  text(dom.inverseSymbol, symbol());
  text(dom.combinedMixerSymbol, `${symbol()} Sᵢ ${symbol()}`);
  text(dom.diffuserLabel, `DIFFUSER = ${symbol()} Sᵢ ${symbol()}`);
  text(dom.circuitXLabel, `x (${side})`); text(dom.circuitYLabel, `y (${side})`);
  text(dom.circuitTitle, `Grover circuit: two ${side}-level registers`);
  text(dom.circuitDescription, combined
    ? `Preparation runs once. Each round applies the oracle and combined mixer ${symbol()} Sᵢ ${symbol()}. Measure after ${iterations} rounds for the first Grover peak; further rounds remain available.`
    : `Preparation runs once. Each round applies oracle, ${symbol()}, initial-state sign flip Sᵢ and the same ${symbol()}. Measure after ${iterations} rounds for the first Grover peak; further rounds remain available.`);
  dom.circuitPanel.setAttribute('aria-label', dom.circuitTitle.textContent);
  const odd = side % 2;
  text(dom.mixerNote, (odd ? `B† = B: both steps use the same balanced ${stateCount}-state mixer. This is generalized amplitude amplification, not a qubit register.`
    : `H† = H: both steps use the same ${2*Math.log2(side)}-qubit Hadamard.`)
    + (combined ? ' Combined: one direct transition to the full mixer result.' : ''));
  text(dom.theoryMixer, odd ? `For ${side}×${side}, B[(x,y),(u,v)] = exp[2πi(xv−yu)/${side}]/${side}. This mathematical generalization is unitary and Hermitian, with equal preparation probabilities from any basis state. In the reflection formula below, replace H with B.`
    : 'On 2×2 and 4×4 grids, H is the tensor-product qubit Hadamard: H† = H and H² = I. H can produce negative amplitudes through interference, including in unmarked states.');
  text(dom.expectedValue, percent(expectedProbability(iterations,side)));
  text(dom.iterationsNote, `The first Grover peak occurs after ${iterations} amplification ${iterations === 1 ? 'round' : 'rounds'} for ${stateCount} states.`);
  dom.circuitDiagram.setAttribute('aria-label', dom.circuitDescription.textContent);
}
function setGridSize(side) {
  if (!simulation.setGridSize(Number(side))) return false;
  selection = null; hovered = -1; if (renderer) renderer.hover = -1;
  buildGridUI(); refresh(); return true;
}
function choose(which, q) {
  const changed = which === 'initial' ? simulation.setInitial(Number(q)) : simulation.setTarget(Number(q));
  if (!changed) return false;
  selection = null; refresh(); return true;
}
function reset() { simulation.reset(); selection = null; refresh(); }
function previousStep() {
  if (!simulation.previousStep()) return false;
  selection = null; refresh(); return true;
}
function setCombineMixer(value) {
  if (!simulation.setCombineMixer(value)) return false;
  buildGridUI(); refresh(); return true;
}
function startNext() {
  if (!simulation.startNext()) return false;
  selection = null; refresh(); return true;
}
function runFull() {
  if (!simulation.runFull()) return false;
  selection = null; refresh(); return true;
}
function togglePause() {
  if (!simulation.active) return false;
  simulation.paused = !simulation.paused; refresh(); return simulation.paused;
}
function setSelection(which) {
  if (simulation.active) return false;
  selection = selection === which ? null : which; refresh(); return true;
}
function setSpeed(value) {
  const speed = Number(value); if (!Number.isFinite(speed)) return false;
  options.speed = Math.max(.25, Math.min(3,speed)); dom.speed.value = options.speed;
  text(dom.speedValue, `${options.speed.toFixed(2).replace(/0$/, '')}×`); return true;
}
function setColumnView(view) {
  if (!['real', 'imaginary', 'probability'].includes(view)) return false;
  options.columnView = view; dom.columnView.value = view; refresh(); return true;
}
function description(kind) {
  const mixer = symbol();
  const amplitudeView = options.columnView !== 'probability';
  return {
    input: `The initial amplitude is +1 in ${ket(simulation.initial)}, and zero elsewhere. Apply ${mixer} to prepare the search.`,
    prepare: `${mixer} prepares amplitudes of magnitude 1/${simulation.model.side}${simulation.initial === 0 ? ', all positive at the endpoint' : ', with phases set by the chosen initial state'}. Each probability is ${(100/simulation.model.stateCount).toFixed(2)}%.`,
    oracle: amplitudeView ? `The oracle flips the marked amplitude ${ket(simulation.target)} to its negative. The column crosses zero; its probability stays unchanged.`
      : `The oracle flips the marked amplitude's sign. Probabilities stay unchanged; choose Real amplitude to see the column flip.`,
    inverse: `${mixer} = ${mixer}† mixes the amplitudes after the oracle. Unmarked columns can become negative: these are genuine intermediate circuit amplitudes.`,
    reference: `Sᵢ flips only the initial-state amplitude ${ket(simulation.initial)}. Every other amplitude stays fixed, and all probabilities stay unchanged.`,
    forward: `${mixer} completes amplification. ${mixer} Sᵢ ${mixer} has an overall minus sign relative to inversion about the mean; this changes no probability.`,
    mixer: `The columns move directly from the post-oracle state to the full ${mixer} Sᵢ ${mixer} result. The overall minus sign is retained.`,
  }[kind];
}
function nextLabel(gate) {
  if (simulation.combineMixer && ['inverse', 'reference', 'forward'].includes(gate.kind)) return `Apply mixer · ${symbol()} Sᵢ ${symbol()}`;
  return {prepare:`Apply ${symbol()} · prepare`,oracle:'Apply oracle · mark',inverse:`Apply ${symbol()} · diffuser 1/3`,reference:'Apply Sᵢ · flip initial',forward:`Apply ${symbol()} · diffuser 3/3`}[gate.kind];
}
function meanGuide(state) {
  const reference = state.mixerInput || state.amplitudes;
  const view = options.columnView === 'imaginary' ? 'imaginary' : 'real';
  const values = columnValues(mixerProjection(state.amplitudes, state.initial), view);
  const inputValues = columnValues(mixerProjection(reference, state.initial), view);
  return {visible: options.meanPlane && options.columnView !== 'probability', uniform: state.initial === 0,
    showResult: !!state.mixerInput || (state.kind === 'oracle' && !state.busy),
    values, inputValues, outputValues: inputValues.map(value => -value), shifts: inputValues.map(value => -2 * value)};
}
function syncUI(state, guide = meanGuide(state)) {
  const {stateCount,iterations} = simulation.model, gate = simulation.active, next = simulation.nextGate;
  const atRecommended = state.completed === 1+4*iterations && !state.busy;
  dom.initialState.value = state.initial; dom.targetState.value = state.target;
  for (const node of [dom.initialState,dom.targetState,dom.selectInitial,dom.selectTarget]) node.disabled = state.busy;
  dom.selectInitial.setAttribute('aria-pressed', selection === 'initial'); dom.selectTarget.setAttribute('aria-pressed', selection === 'target');
  text(dom.selectionTitle, selection ? `Pick ${selection === 'initial' ? 'initial' : 'marked'} state` : 'Choose initial / marked state');
  dom.c.classList.toggle('picking',!!selection);
  text(dom.selectionHint, state.busy ? 'Selection is locked during the operation. Drag to orbit.' : selection ? 'Click a column or square. Drag still orbits the camera.' : 'Use the selectors or pick a square. Drag to orbit.');
  dom.next.disabled = state.busy || !ready; dom.full.disabled = state.busy || !ready;
  dom.next.title = state.recommendedReached ? 'Continue beyond the recommended measurement point.' : 'Apply the next operation.';
  dom.previous.disabled = !ready || (!state.busy && state.completed === 0);
  dom.previous.title = state.busy ? 'Return to the start of this operation.' : 'Return to the previous checkpoint.';
  dom.pause.disabled = !state.busy; text(dom.pause,state.paused ? 'Resume' : 'Pause');
  dom.combineMixer.disabled = !state.canCombineMixer;
  dom.combineMixer.setAttribute('aria-pressed',state.combineMixer);
  dom.combineMixer.title = state.busy ? 'Finish the current operation before changing mixer mode.'
    : !state.canCombineMixer ? 'Complete the three mixer gates or reset before changing mixer mode.'
    : state.combineMixer ? 'Step through the three mixer gates separately.' : 'Animate directly to the full mixer result.';
  dom.circuitPanel.classList.toggle('mixerCombined',state.combineMixer);
  text(dom.next,nextLabel(next));
  const progress = state.operationProgress;
  dom.progressBar.style.width = `${progress*100}%`; dom.gateProgress.setAttribute('aria-valuenow',Math.round(progress*100));
  const operationName = state.operationKind === 'mixer' ? `Combined mixer · ${symbol()} Sᵢ ${symbol()}` : gate?.name;
  text(dom.stageStatus, gate ? `${state.paused ? 'Paused · ' : ''}${operationName}${gate.iteration ? ` · round ${gate.iteration}${gate.iteration > iterations ? ' · beyond recommended stop' : `/${iterations}`}` : ''}`
    : atRecommended ? 'Recommended measurement point · continue to explore'
    : state.recommendedReached ? `Beyond recommended stop · ${state.completedIterations} rounds completed`
    : state.completed ? 'Checkpoint · apply the next operation' : 'Ready to prepare');
  const stageLabel = {inverse:`${symbol()} · DIFFUSER 1/3`,reference:'Sᵢ · FLIP INITIAL',forward:`${symbol()} · DIFFUSER 3/3`,mixer:'COMBINED MIXER'}[state.operationKind] || state.kind.toUpperCase();
  text(dom.plotBadge,state.busy ? `${state.paused ? 'PAUSED · ' : ''}${stageLabel}${state.iteration ? ` · ROUND ${state.iteration}` : ''}`
    : atRecommended ? `RECOMMENDED MEASUREMENT · ROUND ${iterations}`
    : state.recommendedReached ? `${stageLabel} · ROUND ${state.iteration} · BEYOND RECOMMENDED STOP`
    : state.completed ? `${stageLabel} · CHECKPOINT` : 'INPUT STATE');
  const probability = state.probabilities[state.target], formatted = percent(probability);
  text(dom.markedLabel,`MARKED ${ket(state.target)}`); text(dom.initialLabel,`INITIAL ${ket(state.initial)}`);
  text(dom.markedProbability,formatted);
  text(dom.successValue,formatted); text(dom.normValue,percent(state.norm));
  text(dom.gateDescription,description(state.operationKind)); text(dom.circuitTarget,`w = ${ket(state.target)}`);
  const coordinate = value => simulation.model.side % 2 ? value : value.toString(2).padStart(Math.log2(simulation.model.side), '0');
  text(dom.circuitInputX, `|${coordinate(Math.floor(state.initial / state.side))}⟩`);
  text(dom.circuitInputY, `|${coordinate(state.initial % state.side)}⟩`);
  text(dom.circuitStatus,state.completedOperations > state.totalOperations
    ? `${state.completedOperations} operations · recommended stop at ${state.totalOperations}`
    : `${state.completedOperations} / ${state.totalOperations} operations`);
  for (const node of gateNodes) {
    const kind = node.dataset.circuitKind;
    const gateIndex = kind === 'prepare' ? 0 : 1 + 4 * Math.max(0,state.iteration-1) + (kind === 'mixer' ? 3 : ['oracle','inverse','reference','forward'].indexOf(kind));
    node.classList.toggle('active',state.busy && state.operationKind === kind);
    node.classList.toggle('complete',state.completed > gateIndex);
    node.classList.toggle('future',state.completed <= gateIndex && !(state.busy && state.operationKind === kind));
  }
  dom.circuitPanel.classList.toggle('paused',state.paused);
  dom.circuitReadout.classList.toggle('complete',state.recommendedReached);
  dom.circuitReadout.setAttribute('aria-label',state.recommendedReached
    ? `Recommended measurement after round ${iterations} reached. Further rounds are optional.`
    : `Recommended measurement after round ${iterations}.`);
  const shownIterations = Math.max(iterations,state.iteration);
  const expanded = dom.iterationTrack.children.length < shownIterations;
  while (dom.iterationTrack.children.length < shownIterations) dom.iterationTrack.append(iterationNode(dom.iterationTrack.children.length+1));
  while (dom.iterationTrack.children.length > shownIterations) dom.iterationTrack.lastElementChild.remove();
  if (expanded) dom.iterationTrack.scrollLeft = dom.iterationTrack.scrollWidth;
  for (const node of dom.iterationTrack.children) {
    const checkpoint = state.checkpoints.find(item => item.iteration === Number(node.dataset.iteration) && ['forward','mixer'].includes(item.kind));
    node.classList.toggle('active',state.busy && state.iteration === Number(node.dataset.iteration));
    node.classList.toggle('complete',!!checkpoint); text(node.lastElementChild,checkpoint ? percent(checkpoint.targetProbability) : '—');
  }
  const q = hovered >= 0 && hovered < stateCount ? hovered : state.kind === 'reference' ? state.initial : state.target;
  const phase = state.probabilities[q] > 1e-12 ? `${(Math.atan2(state.amplitudes[2*q+1],state.amplitudes[2*q])/Math.PI).toFixed(2)}π` : 'undefined at zero';
  text(dom.inspectState,`${ket(q)}${q === state.target ? ' · marked' : q === state.initial ? ' · initial' : ''}\nRe(a) ${formatAmplitude(state.amplitudes[2*q])}    Im(a) ${formatAmplitude(state.amplitudes[2*q+1])}\nProbability ${percent(state.probabilities[q])} · phase ${phase}`);
  dom.phaseLegend.hidden = !options.phaseColors;
  const name = {real:'real amplitude Re(a)',imaginary:'imaginary amplitude Im(a)',probability:'probability |a|²'}[options.columnView];
  text(dom.heightLegend,`Height = ${name}${options.columnView === 'probability' ? ' · fixed 0–100% scale' : ' · fixed −1 to +1 scale · grid at zero'}`);
  text(dom.columnHelp,options.columnView === 'probability' ? 'Probabilities cannot be negative. Choose Real amplitude to see the oracle flip.'
    : 'Amplitudes above zero are positive; below zero they are negative. Probability is Re(a)² + Im(a)².');
  dom.meanPlane.disabled = options.columnView === 'probability';
  dom.meanGuidePanel.hidden = !guide.visible;
  const part = options.columnView === 'imaginary' ? 'Im' : 'Re';
  const guideValue = guide.values[guide.uniform ? 0 : q];
  const precise = value => Math.abs(value) < .000005 ? '0.00000' : `${value > 0 ? '+' : '−'}${Math.abs(value).toFixed(5)}`;
  text(dom.meanGuideTitle, guide.uniform ? 'Mean & mixer shift' : 'Mixer reference levels');
  text(dom.meanInputLabel, guide.uniform ? `Current mean · ${part}(μ)` : `Current reference · ${ket(q)} · ${part}(p)`);
  text(dom.meanInputValue, precise(guideValue));
  text(dom.meanOutputLabel, guide.uniform ? 'Final mean · −μ₀' : 'Final reference · −p₀');
  text(dom.meanOutputValue, precise(guide.outputValues[guide.uniform ? 0 : q]));
  text(dom.meanShiftValue, precise(guide.shifts[guide.uniform ? 0 : q]));
  dom.meanOutputRow.hidden = dom.meanShiftRow.hidden = !guide.showResult;
  text(dom.meanGuideNote, guide.uniform
    ? guide.showResult ? `μ₀ is the mixer input mean. The gold plane follows the current columns${state.combineMixer ? ', moving with them during the combined mixer' : ', including the intermediate gate states'}. The full shift is −2μ₀.`
      : 'The gold plane tracks the mean amplitude. After the oracle, it fixes the shift a′ = a − 2μ for the full mixer.'
    : `The chosen input prepares different phases. Gold tiles follow the current pⱼ = sⱼ⟨s|a⟩. The full shift is −2pⱼ₀, using the mixer input reference. Hover a column for its reference and shift.`);
  if (renderer) { const degrees = Math.round(renderer.view.elevation*180/Math.PI); dom.elevation.value=degrees; text(dom.elevationValue,`${degrees}°`); }
}
function render() {
  const state = simulation.snapshot(), guide = meanGuide(state); syncUI(state, guide);
  renderer?.draw({...state, labels:simulation.model.labels, meanGuide:guide},options); dirty = false;
}
function refresh() { dirty = true; if (renderer && ready) render(); }
function advance(seconds) { simulation.advance(seconds); refresh(); return simulation.snapshot(); }

dom.gridSize.addEventListener('input',()=>setGridSize(dom.gridSize.value));
dom.initialState.addEventListener('change',()=>choose('initial',dom.initialState.value));
dom.targetState.addEventListener('change',()=>choose('target',dom.targetState.value));
dom.selectInitial.addEventListener('click',()=>setSelection('initial'));
dom.selectTarget.addEventListener('click',()=>setSelection('target'));
dom.next.addEventListener('click',startNext); dom.full.addEventListener('click',runFull);
dom.previous.addEventListener('click',previousStep);
dom.reset.addEventListener('click',reset); dom.pause.addEventListener('click',togglePause);
dom.combineMixer.addEventListener('click',()=>setCombineMixer(!simulation.combineMixer));
dom.speed.addEventListener('input',()=>setSpeed(dom.speed.value));
dom.columnView.addEventListener('change',()=>setColumnView(dom.columnView.value));
for (const key of ['phaseColors','valueLabels','meanPlane']) dom[key].addEventListener('change',()=>{ options[key]=dom[key].checked; refresh(); });
dom.orbitLeft.addEventListener('click',()=>renderer?.orbit(-.25)); dom.orbitRight.addEventListener('click',()=>renderer?.orbit(.25));
dom.zoomIn.addEventListener('click',()=>renderer?.zoom(1.15)); dom.zoomOut.addEventListener('click',()=>renderer?.zoom(1/1.15));
dom.topView.addEventListener('click',()=>renderer?.setView({yaw:0,elevation:85*Math.PI/180,zoom:1.15}));
dom.levelView.addEventListener('click',()=>renderer?.setView({elevation:0}));
dom.elevation.addEventListener('input',()=>renderer?.setView({elevation:Number(dom.elevation.value)*Math.PI/180}));
dom.resetView.addEventListener('click',()=>renderer?.resetView());
dom.minui.addEventListener('click',()=>{dom.uibody.hidden=!dom.uibody.hidden;dom.minui.setAttribute('aria-expanded',!dom.uibody.hidden);dom.minui.setAttribute('aria-label',dom.uibody.hidden?'Expand controls':'Collapse controls');text(dom.minui,dom.uibody.hidden?'+':'−');markDirty();});
dom.circuitToggle.addEventListener('click',()=>{const collapsed=dom.circuitPanel.classList.toggle('collapsed');dom.circuitToggle.setAttribute('aria-expanded',!collapsed);dom.circuitToggle.setAttribute('aria-label',collapsed?'Expand circuit':'Collapse circuit');text(dom.circuitToggle,collapsed?'+':'−');});
window.addEventListener('keydown',event=>{
  if (event.target.closest('input,select,button,summary,textarea,[contenteditable="true"]') || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.code === 'Space') { event.preventDefault(); togglePause(); }
  if (event.key.toLowerCase() === 'r') reset();
});

const api = {
  isReady:()=>ready && !renderer?.lost,
  state:()=>simulation.snapshot(), reset, setInitial:q=>choose('initial',q), setTarget:q=>choose('target',q),
  setGridSize, setCombineMixer, previousStep, startNext, runFull, togglePause, setSpeed, setColumnView, advanceTime:advance,
  cameraState:()=>({...renderer.view}),
  setCamera:view=>{ renderer.setView(view); refresh(); return {...renderer.view}; },
  resetCamera:()=>{ renderer.resetView(); refresh(); },
  projectState:(q,top=true)=>renderer.projectState(q,top),
  pickAt:(x,y)=>renderer.hitTest(x,y),
  histogram:()=>({side:simulation.model.side,view:options.columnView,values:columnValues(simulation.amplitudes,options.columnView),
    heights:columnValues(simulation.amplitudes,options.columnView).map(value=>columnHeight(value,simulation.model.side)),maximum:columnHeight(1,simulation.model.side),meanGuide:meanGuide(simulation.snapshot())}),
  beginFrameRecording:()=>{recording=true;lastTime=null;},
  endFrameRecording:()=>{recording=false;lastTime=null;},
  renderRecordingFrame:({fps=60}={})=>advance(options.speed/(Number.isFinite(fps) && fps>0 ? fps : 60)),
};
window.OrdinaryGrover = api;
// Keep the existing canvas recorder's deterministic-clock contract.
window.BohmianGrover2D = api;

buildGridUI();
try {
  renderer = new HistogramRenderer(dom.c, {onChange:markDirty,onError:error,
    onHover:q=>{hovered=q;markDirty();},
    onPick:q=>{hovered=q; if (selection) choose(selection,q); else refresh();},
  });
  ready = true; render();
  new ResizeObserver(markDirty).observe(dom.plotArea);
  window.addEventListener('resize',markDirty);
  function frame(time) {
    const dt = lastTime === null ? 0 : Math.min(.05,(time-lastTime)/1000); lastTime=time;
    if (!recording && simulation.active && !simulation.paused && !renderer.lost) {simulation.advance(dt*options.speed);dirty=true;}
    try {if (dirty) render();} catch (failure) {ready=false;error(failure.message);return;}
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
} catch (failure) {ready=false;error(failure.message);syncUI(simulation.snapshot());console.error(failure);}
