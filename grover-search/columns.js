import { SearchSimulation, mixerProjection } from './demos/ordinary/ordinary-core.js?v=20261014-continue-rounds';
import { HistogramRenderer } from './demos/ordinary/histogram-renderer.js?v=20261014-continue-rounds';

// The article supplies a compact view. All gate math and the orbitable renderer
// come unchanged from the pinned Ordinary-Grover branch.
const byId = id => document.getElementById(id);
const lab = byId('column-lab');
const simulation = new SearchSimulation();
let renderer, visible = false, dirty = true, previousTime;
const format = value => `${value < -1e-8 ? '−' : '+'}${Math.abs(value).toFixed(4)}`;
const complex = (values, offset) => Math.abs(values[offset + 1]) < 1e-8
  ? format(values[offset]) : `${format(values[offset])} ${format(values[offset + 1])}i`;
const name = {input:'Initial basis state', prepare:'H · preparation', oracle:'Oracle · marked phase',
  inverse:'H · mixer 1/3', reference:'Sᵢ · flip the input', forward:'H · mixer 3/3', mixer:'M · combined mixer'};
const replaceText = (id, value) => { if (byId(id).textContent !== value) byId(id).textContent = value; };

function render() {
  if (!renderer) return;
  const state = simulation.snapshot();
  const view = byId('lab-view').value;
  const current = mixerProjection(state.amplitudes, 0);
  const input = mixerProjection(state.mixerInput || state.amplitudes, 0);
  const component = view === 'imaginary' ? 1 : 0;
  const values = Array.from({length:16}, (_, q) => current[q*2 + component]);
  const inputValues = Array.from({length:16}, (_, q) => input[q*2 + component]);
  const meanGuide = {visible:byId('lab-mean-toggle').checked && view !== 'probability', uniform:true,
    values, inputValues, outputValues:inputValues.map(a => -a), shifts:inputValues.map(a => -2*a),
    showResult:!!state.mixerInput || (!state.busy && state.kind === 'oracle')};
  renderer.draw({...state, labels:simulation.model.labels, meanGuide}, {
    columnView:view, valueLabels:true, phaseColors:true
  });
  const round = state.iteration ? ` · round ${state.iteration}` : '';
  const stopping = state.recommendedReached ? (state.completed === 13 && !state.busy ? ' · recommended stop' : ' · beyond recommended stop') : '';
  replaceText('lab-status', `${name[state.operationKind]}${round}${state.busy ? state.paused ? ' · paused' : ' · running' : ''}${stopping}`);
  replaceText('lab-probability', `${(100*state.probabilities[15]).toFixed(2)}%`);
  replaceText('lab-amplitude', complex(state.amplitudes, 30));
  replaceText('lab-mean', complex(current, 0));
  replaceText('lab-norm', `${(100*state.norm).toFixed(2)}%`);
  byId('lab-next').disabled = state.busy;
  byId('lab-back').disabled = state.completed === 0 && !state.busy;
  byId('lab-pause').disabled = !state.busy;
  byId('lab-reset').disabled = false;
  byId('lab-pause').textContent = state.paused ? 'Resume' : 'Pause';
  byId('lab-combine').disabled = !state.canCombineMixer;
  byId('lab-combine').setAttribute('aria-pressed', String(state.combineMixer));
  byId('lab-next').title = state.combineMixer && simulation.nextGate.kind === 'inverse'
    ? 'Apply the complete mixer' : simulation.nextGate.name;
  const kinds = ['prepare', 'oracle', 'inverse', 'reference', 'forward'];
  const lastIndex = kinds.indexOf(state.kind === 'mixer' ? 'forward' : state.kind);
  for (const gate of lab.querySelectorAll('[data-gate]')) {
    const index = kinds.indexOf(gate.dataset.gate);
    gate.classList.toggle('active', state.busy && (state.operationKind === 'mixer' ? index >= 2 : index === lastIndex));
    gate.classList.toggle('done', index === 0 ? state.completed > 0 : !state.busy && index <= lastIndex);
  }
  byId('lab-measure').classList.toggle('recommended', state.recommendedReached);
  byId('lab-measure').setAttribute('aria-label', state.recommendedReached
    ? 'Recommended measurement point reached after three rounds' : 'Recommended measurement point not yet reached');
  lab.dataset.completed = String(state.completed);
  lab.dataset.ready = 'true';
  dirty = false;
}

function initializeColumns() {
  if (renderer) return;
  try {
    renderer = new HistogramRenderer(byId('column-canvas'), {
      onChange:() => { dirty = true; },
      onError:message => { byId('lab-fallback').hidden = !message; byId('lab-fallback').textContent = message; }
    });
    byId('lab-fallback').hidden = true;
    render();
  } catch (error) {
    byId('lab-fallback').textContent = `${error.message} The checkpoint table below remains available.`;
    lab.dataset.ready = 'error';
  }
}
const change = action => () => { action(); dirty = true; render(); };
byId('lab-next').addEventListener('click', change(() => simulation.startNext()));
byId('lab-back').addEventListener('click', change(() => simulation.previousStep()));
byId('lab-reset').addEventListener('click', change(() => simulation.reset()));
byId('lab-pause').addEventListener('click', change(() => { simulation.paused = !simulation.paused; }));
byId('lab-combine').addEventListener('click', change(() => simulation.setCombineMixer(!simulation.combineMixer)));
byId('lab-view').addEventListener('change', change(() => {}));
byId('lab-mean-toggle').addEventListener('change', change(() => {}));
byId('lab-level').addEventListener('click', change(() => renderer?.setView({elevation:0})));
byId('lab-camera').addEventListener('click', change(() => renderer?.resetView()));
new ResizeObserver(() => { dirty = true; }).observe(byId('column-canvas'));
new IntersectionObserver(entries => {
  visible = entries[0].isIntersecting;
  if (visible) initializeColumns();
}, {rootMargin:'100px'}).observe(lab);
function frame(time) {
  const dt = previousTime === undefined ? 0 : Math.min(.05, (time - previousTime)/1000);
  previousTime = time;
  if (renderer && visible && !document.hidden && simulation.active && !simulation.paused && !renderer.lost) {
    simulation.advance(dt); dirty = true;
  }
  if (renderer && visible && dirty) render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

