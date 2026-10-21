// Scalar logical packets in one continuous 2D box. Every grid uses exact
// unitary gate evolution in its retained sine-mode subspace.
export const SIDE = 4;
export const MAX_SIDE = 5;
// Fixed box and mass: changing retained modes changes T, not the physical Hamiltonian.
export const REVIVAL_TIME = 19.2;
export const FREE_OMEGA = 2 * Math.PI / REVIVAL_TIME;
const models = new Map(), preparations = new Map();

export function gridModel(side = SIDE) {
  if (!Number.isInteger(side) || side < 2 || side > MAX_SIDE) throw new RangeError('Grid size must be 2, 3, 4 or 5.');
  if (models.has(side)) return models.get(side);
  const stateCount = side * side;
  const iterations = Math.round(Math.PI / (4 * Math.asin(1 / Math.sqrt(stateCount))) - .5);
  const mixTime = REVIVAL_TIME / (2 * side), inverseFactor = 2 * side - 1, inverseTime = REVIVAL_TIME - mixTime;
  const labels = Array.from({ length: stateCount }, (_, q) =>
    side === 2 || side === 4 ? q.toString(2).padStart(2 * Math.log2(side), '0') : Math.floor(q / side) + ',' + q % side);
  // Orthogonal cell-centered sine packets. The last column has a distinct normalization.
  const packetTransform = Array.from({ length: side }, (_, j) =>
    Float64Array.from({ length: side }, (_, n) =>
      (n === side - 1 ? 1 / Math.sqrt(side) : Math.sqrt(2 / side)) * Math.sin(Math.PI * (j + .5) * (n + 1) / side)));
  const cellOverlaps = Array.from({ length: side }, (_, j) =>
    Array.from({ length: side }, (_, n) =>
      Float64Array.from({ length: side }, (_, m) => sineOverlap(n + 1, m + 1, j / side, (j + 1) / side))));
  const gates = Object.freeze([
    { kind: 'prepare', name: 'Prepare · free evolution T', symbol: 'A', iteration: 0, duration: mixTime },
    ...Array.from({ length: iterations }, (_, i) => [
      { kind: 'oracle', name: 'Oracle phase', symbol: 'Oω', iteration: i + 1, duration: 1.6 },
      { kind: 'inverse', name: 'A† · forward wait ' + inverseFactor + 'T', symbol: 'A†', iteration: i + 1, duration: inverseTime },
      { kind: 'reference', name: 'Reference phase', symbol: 'Sᵢ', iteration: i + 1, duration: 1.6 },
      { kind: 'forward', name: 'Forward mixer · free evolution T', symbol: 'A', iteration: i + 1, duration: mixTime },
    ]).flat(),
  ].map(Object.freeze));
  const model = Object.freeze({ side, stateCount, iterations, mixTime, inverseTime, inverseFactor,
    labels, packetTransform, cellOverlaps, gates });
  models.set(side, model);
  return model;
}
export function modelOfState(state) { return gridModel(Math.sqrt(state.length / 2)); }

export function basisState(q = 0, side = SIDE) {
  const { stateCount: STATE_COUNT } = gridModel(side);
  if (!Number.isInteger(q) || q < 0 || q >= STATE_COUNT) throw new RangeError('Invalid logical state.');
  const state = new Float64Array(2 * STATE_COUNT);
  state[2 * q] = 1;
  return state;
}

// Exact free-box propagation: E_nm/hbar = FREE_OMEGA*(n^2+m^2).
// p counts preparation intervals T. Production gates only use positive p.
export function evolveMixer(state, p) {
  const { side: SIDE } = modelOfState(state), modes = sineCoefficients(state);
  for (let n = 0; n < SIDE; n++) for (let m = 0; m < SIDE; m++) {
    const q = 2 * (SIDE*n+m), angle = Math.PI*p*((n+1)**2+(m+1)**2)/SIDE;
    const c = Math.cos(angle), s = Math.sin(angle), re = modes[q], im = modes[q+1];
    modes[q] = c*re+s*im; modes[q+1] = c*im-s*re;
  }
  return packetCoefficients(modes);
}

export function phasePulse(state, target, p) {
  const out = Float64Array.from(state), r = 2 * target, i = r + 1;
  const c = Math.cos(Math.PI * p), s = Math.sin(Math.PI * p);
  out[r] = c * state[r] + s * state[i];
  out[i] = c * state[i] - s * state[r];
  return out;
}

export function evolveGate(state, kind, progress, target, initial = 0) {
  if (kind === 'prepare' || kind === 'forward') return evolveMixer(state, progress);
  // The inverse continues forward through the rest of a complete box revival.
  if (kind === 'inverse') return evolveMixer(state, modelOfState(state).inverseFactor * progress);
  if (kind === 'oracle') return phasePulse(state, target, progress);
  if (kind === 'reference') return phasePulse(state, initial, progress);
  throw new Error(`Unknown gate: ${kind}`);
}

export function probabilities(state) {
  return Float64Array.from({ length: state.length / 2 }, (_, q) => state[2 * q] ** 2 + state[2 * q + 1] ** 2);
}
export function normSquared(state) { return state.reduce((sum, value) => sum + value * value, 0); }
export function expectedProbability(iterations, side = SIDE) {
  const { stateCount: STATE_COUNT } = gridModel(side);
  return Math.sin((2 * iterations + 1) * Math.asin(1 / Math.sqrt(STATE_COUNT))) ** 2;
}

export function sineCoefficients(state) {
  const { side: SIDE, packetTransform: PACKET_TRANSFORM } = modelOfState(state);
  const out = new Float64Array(state.length);
  for (let n = 0; n < SIDE; n++) for (let m = 0; m < SIDE; m++) {
    for (let x = 0; x < SIDE; x++) for (let y = 0; y < SIDE; y++) {
      const weight = PACKET_TRANSFORM[x][n] * PACKET_TRANSFORM[y][m];
      const q = 2 * (SIDE * x + y), k = 2 * (SIDE * n + m);
      out[k] += weight * state[q]; out[k + 1] += weight * state[q + 1];
    }
  }
  return out;
}
export function packetCoefficients(modes) {
  const { side: SIDE, packetTransform: PACKET_TRANSFORM } = modelOfState(modes);
  const out = new Float64Array(modes.length);
  for (let x = 0; x < SIDE; x++) for (let y = 0; y < SIDE; y++) {
    for (let n = 0; n < SIDE; n++) for (let m = 0; m < SIDE; m++) {
      const weight = PACKET_TRANSFORM[x][n]*PACKET_TRANSFORM[y][m];
      const q = 2*(SIDE*x+y), k = 2*(SIDE*n+m);
      out[q] += weight*modes[k]; out[q+1] += weight*modes[k+1];
    }
  }
  return out;
}
export function axisPacket(j, x, side = SIDE) {
  const { packetTransform: PACKET_TRANSFORM } = gridModel(side);
  return PACKET_TRANSFORM[j].reduce((sum, weight, n) => sum + weight * Math.SQRT2 * Math.sin((n + 1) * Math.PI * x), 0);
}
export function waveAt(state, x, y) {
  const { side: SIDE } = modelOfState(state);
  const fx = Array.from({ length: SIDE }, (_, j) => axisPacket(j, x, SIDE));
  const fy = Array.from({ length: SIDE }, (_, j) => axisPacket(j, y, SIDE));
  const out = [0, 0];
  for (let j = 0; j < SIDE; j++) for (let k = 0; k < SIDE; k++) {
    const q = 2 * (SIDE * j + k), weight = fx[j] * fy[k];
    out[0] += weight * state[q]; out[1] += weight * state[q + 1];
  }
  return out;
}

// Analytic integrals distinguish a mode's probability from probability inside
// its geometrical box. No density readback or numerical quadrature is needed.
function sineOverlap(n, m, a, b) {
  if (n === m) return b - a - (Math.sin(2 * n * Math.PI * b) - Math.sin(2 * n * Math.PI * a)) / (2 * n * Math.PI);
  const primitive = x => Math.sin((n - m) * Math.PI * x) / ((n - m) * Math.PI) - Math.sin((n + m) * Math.PI * x) / ((n + m) * Math.PI);
  return primitive(b) - primitive(a);
}
export function boxProbability(state, target) {
  const { side, stateCount: STATE_COUNT, cellOverlaps: CELL_OVERLAPS } = modelOfState(state);
  const c = sineCoefficients(state), ix = CELL_OVERLAPS[Math.floor(target / side)], iy = CELL_OVERLAPS[target % side];
  let weight = 0;
  for (let q = 0; q < STATE_COUNT; q++) for (let r = 0; r < STATE_COUNT; r++) {
    weight += (c[2 * q] * c[2 * r] + c[2 * q + 1] * c[2 * r + 1]) * ix[Math.floor(q / side)][Math.floor(r / side)] * iy[q % side][r % side];
  }
  return Math.max(0, Math.min(1, weight));
}

export function effectiveBlochState(marked, unmarked) {
  const [mr, mi] = marked, [ur, ui] = unmarked;
  const m = mr * mr + mi * mi, u = ur * ur + ui * ui, weight = m + u;
  if (weight < 1e-12) return { vector: null, weight, conditionalMarked: null };
  return { vector: [2 * (mr * ur + mi * ui) / weight, 2 * (mr * ui - mi * ur) / weight, (m - u) / weight],
    weight: Math.min(1, weight), conditionalMarked: m / weight };
}
// Use the actual free-evolution phases to define the marked/unmarked
// search basis for the selected input.
export function preparedStateFor(initial = 0, side = SIDE) {
  const key = side + '/' + initial;
  if (!preparations.has(key)) preparations.set(key, evolveMixer(basisState(initial, side), 1));
  return preparations.get(key);
}
export function projectGroverState(state, target, initial = 0) {
  const { side, stateCount } = modelOfState(state), prepared = preparedStateFor(initial, side);
  const marked = [0, 0], unmarked = [0, 0];
  // Align with the actual prepared phases, including complex odd-grid mixers.
  for (let q = 0; q < stateCount; q++) {
    const re = side * (prepared[2*q] * state[2*q] + prepared[2*q+1] * state[2*q+1]);
    const im = side * (prepared[2*q] * state[2*q+1] - prepared[2*q+1] * state[2*q]);
    if (q === target) { marked[0] = re; marked[1] = im; }
    else { unmarked[0] += re / Math.sqrt(stateCount - 1); unmarked[1] += im / Math.sqrt(stateCount - 1); }
  }
  const bloch = effectiveBlochState(marked, unmarked);
  return { bloch, targetProbability: marked[0] ** 2 + marked[1] ** 2, outsideProbability: Math.max(0, 1 - bloch.weight) };
}

export class SearchSimulation {
  // Keep the existing (target, initial) arguments; grid size is the third.
  constructor(target = 15, initial = 0, side = SIDE) {
    this.model = gridModel(side); this.target = Math.min(target, this.model.stateCount - 1);
    this.initial = initial; this.reset();
  }
  reset() {
    this.amplitudes = basisState(this.initial, this.model.side); this.completed = 0; this.active = null; this.last = null;
    this.paused = false; this.autoplay = false; this.time = 0; this.revision = (this.revision || 0) + 1;
    this.checkpoints = [];
  }
  setGridSize(side) {
    if (!Number.isInteger(side) || side < 2 || side > MAX_SIDE || side === this.model.side) return false;
    const oldSide = this.model.side;
    const resize = q => side * Math.min(side - 1, Math.floor(q / oldSide)) + Math.min(side - 1, q % oldSide);
    this.target = resize(this.target); this.initial = resize(this.initial);
    this.model = gridModel(side); this.reset(); return true;
  }
  setTarget(target) {
    if (this.active || !Number.isInteger(target) || target < 0 || target >= this.model.stateCount) return false;
    this.target = target; this.reset(); return true;
  }
  setInitial(initial) {
    if (this.active || !Number.isInteger(initial) || initial < 0 || initial >= this.model.stateCount) return false;
    this.initial = initial; this.reset(); return true;
  }
  startNext() {
    if (this.active || this.completed >= this.model.gates.length) return false;
    this.active = { ...this.model.gates[this.completed], index: this.completed, elapsed: 0, progress: 0,
      initial: this.initial, startAmplitudes: Float64Array.from(this.amplitudes) };
    if (this.active.kind === 'reference') this.active.name = `Reference phase |${this.model.labels[this.initial]}⟩`;
    return true;
  }
  runFull() { if (this.active) return false; this.reset(); this.autoplay = true; return this.startNext(); }
  advance(dt) {
    if (this.paused || !Number.isFinite(dt) || dt <= 0) return;
    let remaining = dt;
    while (this.active && remaining > 1e-12) {
      const gate = this.active, step = Math.min(remaining, gate.duration - gate.elapsed);
      gate.elapsed += step; this.time += step; remaining -= step;
      gate.progress = Math.min(1, gate.elapsed / gate.duration);
      if (gate.duration - gate.elapsed < 1e-10) gate.progress = 1;
      this.amplitudes = evolveGate(gate.startAmplitudes, gate.kind, gate.progress, this.target, this.initial);
      if (gate.progress < 1) break;
      this.last = gate; this.active = null; this.completed++;
      this.checkpoints.push({ step: this.completed, kind: gate.kind, iteration: gate.iteration,
        targetProbability: probabilities(this.amplitudes)[this.target] });
      if (this.autoplay && this.completed < this.model.gates.length) this.startNext();
      else this.autoplay = false;
    }
  }
  snapshot() {
    const gate = this.active || this.last;
    return { side: this.model.side, stateCount: this.model.stateCount, iterations: this.model.iterations,
      mixTime: this.model.mixTime, inverseTime: this.model.inverseTime, target: this.target, initial: this.initial, completed: this.completed, busy: !!this.active, paused: this.paused,
      time: this.time, kind: gate?.kind || 'input', iteration: gate?.iteration || 0,
      progress: this.active?.progress ?? (this.last ? 1 : 0), norm: normSquared(this.amplitudes),
      probabilities: Array.from(probabilities(this.amplitudes)), amplitudes: Array.from(this.amplitudes),
      checkpoints: this.checkpoints.map(item => ({ ...item })) };
  }
}

// Default-grid exports preserve existing numerical tools; runtime code uses its model.
const defaultModel = gridModel();
export const STATE_COUNT = defaultModel.stateCount, ITERATIONS = defaultModel.iterations;
export const MIX_TIME = defaultModel.mixTime, LABELS = defaultModel.labels, GATES = defaultModel.gates;
export const PACKET_TRANSFORM = defaultModel.packetTransform, PREPARED_STATE = preparedStateFor();
