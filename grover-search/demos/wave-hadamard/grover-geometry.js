import { modelOfState, expectedProbability, evolveGate, projectGroverState } from './multiregion-core.js?v=20261014-particles';

const clamp01 = value => Math.max(0, Math.min(1, value));
const gateNames = { input: 'Input', prepare: 'Prepare H', oracle: 'Oracle Oω', inverse: 'Inverse H†', reference: 'Reference Sᵢ', forward: 'Forward H' };
function descriptions(model, initial) { return {
  input: 'Start in the selected logical packet |'+model.labels[initial]+'⟩. Preparation spreads probability over all '+model.stateCount+' modes.',
  prepare: 'The exact unitary mixer creates equal probabilities in all '+model.stateCount+' modes. The cyan point marks the prepared state |s⟩.',
  oracle: 'The oracle turns the marked amplitude through π. All logical probabilities stay fixed during this phase gate.',
  inverse: 'The inverse unitary follows the opposite Hamiltonian sign. The normalized projection stays on the sphere; its weight can change.',
  reference: 'A π phase pulse on |'+model.labels[initial]+'⟩ is the central operation of the diffuser.',
  forward: 'The forward mixer completes this Grover iteration. Interference increases the marked amplitude.',
}; }

export function createGroverGeometry(root) {
  const get = name => root.querySelector(`[data-geometry="${name}"]`);
  const nodes = Object.fromEntries([
    'sphere', 'backGrid', 'frontGrid', 'axes', 'xLabel', 'yLabel',
    'northLabel', 'southLabel', 'northDot', 'southDot',
    'vector', 'tip', 'tipHalo', 'frontTrace', 'backTrace', 'gateStart',
    'preparedDot', 'preparedLabel', 'status', 'target', 'description',
    'markedValue', 'markedBar', 'weightValue', 'weightBar', 'outsideValue',
    'conditionalValue', 'normValue', 'liveDescription', 'resetView',
  ].map(name => [name, get(name)]));
  const center = [180, 153], radius = 108;
  const defaultView = { yaw: .65, pitch: .26 };
  let yaw = defaultView.yaw, pitch = defaultView.pitch;
  let lastKey = '', curveKey = '', gridKey = '', samples = [], frame = null, drag = null;

  const percent = value => `${(100 * value).toFixed(1)}%`;
  const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
  let right, up, eye;

  function camera() {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    right = [cy, -sy, 0]; up = [-sy * sp, -cy * sp, cp]; eye = [sy * cp, cy * cp, sp];
  }
  function project(v) {
    return [center[0] + radius * dot(v, right), center[1] - radius * dot(v, up), dot(v, eye)];
  }
  const xy = p => `${p[0].toFixed(3)} ${p[1].toFixed(3)}`;

  // Split paths at the sphere's front/back boundary. Null vectors break a path
  // if the normalized projection becomes undefined; no false connecting arc.
  function hemispherePaths(points) {
    const paths = { front: '', back: '' };
    for (let i = 1; i < points.length; i++) {
      if (!points[i - 1] || !points[i]) continue;
      const a = project(points[i - 1]), b = project(points[i]);
      const frontA = a[2] >= 0, frontB = b[2] >= 0;
      if (frontA === frontB) paths[frontA ? 'front' : 'back'] += `M${xy(a)}L${xy(b)}`;
      else {
        const t = a[2] / (a[2] - b[2]), cross = a.map((value, k) => value + t * (b[k] - value));
        paths[frontA ? 'front' : 'back'] += `M${xy(a)}L${xy(cross)}`;
        paths[frontB ? 'front' : 'back'] += `M${xy(cross)}L${xy(b)}`;
      }
    }
    return paths;
  }

  function positionDot(node, vector, size = 4) {
    node.setAttribute('visibility', vector ? 'visible' : 'hidden');
    if (!vector) return;
    const [x, y, depth] = project(vector);
    node.setAttribute('cx', x.toFixed(3)); node.setAttribute('cy', y.toFixed(3));
    node.setAttribute('r', size);
    node.setAttribute('opacity', depth < 0 ? '.55' : '1');
  }
  function label(node, vector, dx = 0, dy = 0) {
    const [x, y] = project(vector);
    node.setAttribute('x', (x + dx).toFixed(3)); node.setAttribute('y', (y + dy).toFixed(3));
  }

  function draw() {
    if (!frame || root.hidden) return;
    camera();
    const { stateCount: STATE_COUNT } = modelOfState(frame.startAmplitudes);
    const viewKey = `${yaw}/${pitch}/${STATE_COUNT}`;
    if (viewKey !== gridKey) {
      gridKey = viewKey;
      const circles = [];
      for (const z of [-.5, 0, .5]) {
        const r = Math.sqrt(1 - z * z);
        circles.push(Array.from({ length: 129 }, (_, i) => {
          const t = i * Math.PI / 64; return [r * Math.cos(t), r * Math.sin(t), z];
        }));
      }
      for (let longitude = 0; longitude < 4; longitude++) {
        const phi = longitude * Math.PI / 4;
        circles.push(Array.from({ length: 129 }, (_, i) => {
          const t = i * Math.PI / 64; return [Math.sin(t) * Math.cos(phi), Math.sin(t) * Math.sin(phi), Math.cos(t)];
        }));
      }
      const paths = circles.map(hemispherePaths);
      nodes.frontGrid.setAttribute('d', paths.map(p => p.front).join(''));
      nodes.backGrid.setAttribute('d', paths.map(p => p.back).join(''));
      nodes.axes.setAttribute('d', [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map(v =>
        `M${xy(project(v.map(x => -1.16 * x)))}L${xy(project(v.map(x => 1.16 * x)))}`).join(''));
      label(nodes.xLabel, [1.22, 0, 0], 0, 4); label(nodes.yLabel, [0, 1.22, 0], 0, 4);
      label(nodes.northLabel, [0, 0, 1.22], 0, -5); label(nodes.southLabel, [0, 0, -1.22], 0, 11);
      positionDot(nodes.northDot, [0, 0, 1], 2.6); positionDot(nodes.southDot, [0, 0, -1], 2.6);
      const prepared = [2 * Math.sqrt(STATE_COUNT - 1) / STATE_COUNT, 0, 2 / STATE_COUNT - 1];
      positionDot(nodes.preparedDot, prepared, 5.5); label(nodes.preparedLabel, prepared, 12, 3);
    }

    const { target, initial, kind, progress, state, startAmplitudes, stepKey } = frame;
    const nextCurveKey = stepKey;
    if (nextCurveKey !== curveKey) {
      curveKey = nextCurveKey;
      samples = Array.from({ length: 129 }, (_, i) => projectGroverState(kind === 'input' ? startAmplitudes : evolveGate(startAmplitudes, kind, i / 128, target, initial), target, initial).bloch.vector);
    }
    const prefix = samples.slice(0, Math.floor(progress * 128) + 1);
    prefix.push(state.bloch.vector);
    const trace = kind !== 'input' ? hemispherePaths(prefix) : { front: '', back: '' };
    nodes.frontTrace.setAttribute('d', trace.front); nodes.backTrace.setAttribute('d', trace.back);
    positionDot(nodes.gateStart, samples[0], 4.2);
    const vector = state.bloch.vector;
    nodes.vector.setAttribute('visibility', vector ? 'visible' : 'hidden');
    if (vector) {
      const tip = project(vector);
      nodes.vector.setAttribute('d', `M${center.join(' ')}L${xy(tip)}`);
      nodes.vector.setAttribute('stroke-dasharray', tip[2] < 0 ? '5 3' : 'none');
      nodes.vector.setAttribute('opacity', tip[2] < 0 ? '.65' : '1');
    }
    positionDot(nodes.tipHalo, vector, 9); positionDot(nodes.tip, vector, 4.2);
    root.dataset.viewYaw = String(yaw); root.dataset.viewPitch = String(pitch);
  }

  function orbit(nextYaw, nextPitch) {
    yaw = nextYaw; pitch = Math.max(-1.15, Math.min(1.15, nextPitch)); draw();
  }
  nodes.sphere.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, yaw, pitch };
    nodes.sphere.setPointerCapture(event.pointerId); nodes.sphere.focus();
  });
  nodes.sphere.addEventListener('pointermove', event => {
    if (drag?.id !== event.pointerId) return;
    orbit(drag.yaw + (event.clientX - drag.x) * .009, drag.pitch - (event.clientY - drag.y) * .009);
  });
  const stopDrag = () => { drag = null; };
  nodes.sphere.addEventListener('pointerup', stopDrag);
  nodes.sphere.addEventListener('pointercancel', stopDrag);
  nodes.sphere.addEventListener('lostpointercapture', stopDrag);
  nodes.sphere.addEventListener('keydown', event => {
    const turns = { ArrowLeft: [-.12, 0], ArrowRight: [.12, 0], ArrowUp: [0, .12], ArrowDown: [0, -.12] };
    if (turns[event.key]) { event.preventDefault(); orbit(yaw + turns[event.key][0], pitch + turns[event.key][1]); }
    else if (event.key === 'Home') { event.preventDefault(); orbit(defaultView.yaw, defaultView.pitch); }
  });
  nodes.resetView.addEventListener('click', () => orbit(defaultView.yaw, defaultView.pitch));

  return {
    update({ target, initial = 0, kind = 'input', progress = 0, running = false, paused = false,
      iteration = 0, complete = false, amplitudes, startAmplitudes = amplitudes, stepKey = 'input' }) {
      const model = modelOfState(amplitudes), { side, labels: LABELS, iterations: ITERATIONS } = model;
      progress = clamp01(progress);
      const key = `${stepKey}/${progress}/${running}/${paused}`;
      if (key === lastKey) return;
      lastKey = key;
      const state = projectGroverState(amplitudes, target, initial);
      frame = { target, initial, kind, progress, state, startAmplitudes, stepKey };
      draw();
      nodes.target.textContent = `Target |${LABELS[target]}⟩`;
      const inputText = `|${LABELS[initial]}⟩`;
      const gateName = kind === 'input' ? 'Input '+inputText : kind === 'reference' ? 'Reference '+inputText : gateNames[kind];
      const round = iteration ? `Round ${iteration}/${ITERATIONS} · ` : '';
      nodes.status.textContent = complete ? 'Search complete' : `${round}${gateName}${running ? ` · ${paused ? 'paused · ' : ''}${Math.round(100 * progress)}%` : kind !== 'input' ? ' · held' : ''}`;
      nodes.description.textContent = !state.bloch.vector ? 'The projection has zero weight, so its direction is undefined.'
        : complete ? ITERATIONS+' Grover iterations reach '+percent(expectedProbability(ITERATIONS,side))+' marked probability.' : descriptions(model, initial)[kind];
      nodes.markedValue.textContent = percent(state.targetProbability);
      nodes.weightValue.textContent = percent(state.bloch.weight);
      nodes.outsideValue.textContent = percent(state.outsideProbability);
      nodes.conditionalValue.textContent = state.bloch.conditionalMarked === null ? '—' : percent(state.bloch.conditionalMarked);
      nodes.normValue.textContent = state.bloch.vector ? '|r| = 1' : 'r undefined';
      nodes.markedBar.style.width = percent(state.targetProbability);
      nodes.weightBar.style.width = percent(state.bloch.weight);
      nodes.liveDescription.textContent = `${gateName}. The gold unit vector represents the normalized marked/unmarked projection. Subspace weight ${percent(state.bloch.weight)}; actual marked probability ${percent(state.targetProbability)}. Drag or use arrow keys to rotate the view.`;
      root.dataset.kind = kind;
      root.dataset.iteration = String(iteration);
      root.dataset.progress = String(progress);
      root.dataset.target = String(target);
      root.dataset.blochVector = JSON.stringify(state.bloch.vector);
      root.dataset.subspaceProbability = String(state.bloch.weight);
      root.dataset.conditionalMarked = String(state.bloch.conditionalMarked);
      root.dataset.markedProbability = String(state.targetProbability);
      root.dataset.outsideProbability = String(state.outsideProbability);
    },
  };
}
