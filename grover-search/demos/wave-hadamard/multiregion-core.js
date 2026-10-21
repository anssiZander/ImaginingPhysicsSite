// Scalar logical packets in one continuous 2D box. Every grid uses exact
// unitary gate evolution in its retained sine-mode subspace.
export const SIDE = 4;
export const MAX_SIDE = 5;
const models = new Map(), preparations = new Map();

export function gridModel(side = SIDE) {
  if (!Number.isInteger(side) || side < 2 || side > MAX_SIDE) throw new RangeError('Grid size must be 2, 3, 4 or 5.');
  if (models.has(side)) return models.get(side);
  const stateCount = side * side;
  const iterations = Math.round(Math.PI / (4 * Math.asin(1 / Math.sqrt(stateCount))) - .5);
  const mixTime = 2.4, inverseTime = mixTime, inverseFactor = -1;
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
    { kind: 'prepare', name: 'Prepare balanced state', symbol: 'H', iteration: 0, duration: mixTime },
    ...Array.from({ length: iterations }, (_, i) => [
      { kind: 'oracle', name: 'Oracle phase', symbol: 'Oω', iteration: i + 1, duration: 1.6 },
      { kind: 'inverse', name: 'Inverse mixer', symbol: 'H†', iteration: i + 1, duration: inverseTime },
      { kind: 'reference', name: 'Reference phase', symbol: 'Sᵢ', iteration: i + 1, duration: 1.6 },
      { kind: 'forward', name: 'Forward mixer', symbol: 'H', iteration: i + 1, duration: mixTime },
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

// For 2x2 and 4x4, retain the original qubit Hadamard exactly.
// Odd grids use the Hermitian complex Hadamard
// H[(x,y),(u,v)] = exp(2*pi*i*(x*v-y*u)/side)/side.
// Character orthogonality gives H^2=I and every entry has modulus 1/side.
// Thus the SAME non-free projector Hamiltonian below prepares every input
// uniformly and its inverse still reverses signed time. No free-box mixer.
export function hadamard(state) {
  const { side, stateCount: STATE_COUNT } = modelOfState(state);
  if (side % 2) {
    const out = new Float64Array(state.length);
    for (let x = 0; x < side; x++) for (let y = 0; y < side; y++) {
      const q = 2 * (side * x + y);
      for (let u = 0; u < side; u++) for (let v = 0; v < side; v++) {
        const r = 2 * (side * u + v), angle = 2 * Math.PI * (x * v - y * u) / side;
        const c = Math.cos(angle) / side, s = Math.sin(angle) / side;
        out[q] += c * state[r] - s * state[r + 1];
        out[q + 1] += s * state[r] + c * state[r + 1];
      }
    }
    return out;
  }
  const out = Float64Array.from(state);
  for (let stride = 1; stride < STATE_COUNT; stride *= 2) {
    for (let block = 0; block < STATE_COUNT; block += 2 * stride) {
      for (let i = 0; i < stride; i++) for (let part = 0; part < 2; part++) {
        const lo = 2 * (block + i) + part, hi = lo + 2 * stride;
        const a = out[lo], b = out[hi];
        out[lo] = a + b; out[hi] = a - b;
      }
    }
  }
  return out.map(value => value / Math.sqrt(STATE_COUNT));
}

// H_mix = pi*hbar/(2*T) (I-H). Since H^2=I, the exact propagator is
// U(p) = (I+H)/2 + exp(-i*pi*p) (I-H)/2. p is signed gate time / T.
// The two terms are orthogonal eigenspace projections, not an image blend.
export function evolveMixer(state, p) {
  const { stateCount: STATE_COUNT } = modelOfState(state);
  const transformed = hadamard(state), out = new Float64Array(state.length);
  const c = Math.cos(Math.PI * p), s = Math.sin(Math.PI * p);
  for (let q = 0; q < STATE_COUNT; q++) {
    const r = 2 * q, i = r + 1;
    const minusRe = .5 * (state[r] - transformed[r]);
    const minusIm = .5 * (state[i] - transformed[i]);
    out[r] = .5 * (state[r] + transformed[r]) + c * minusRe + s * minusIm;
    out[i] = .5 * (state[i] + transformed[i]) + c * minusIm - s * minusRe;
  }
  return out;
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
  if (kind === 'inverse') return evolveMixer(state, -progress);
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
// Use the actual prepared phases, including complex phases on odd grids,
// to define the marked/unmarked search basis for the selected input.
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
