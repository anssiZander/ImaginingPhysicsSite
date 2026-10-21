// Finite-dimensional Grover state vectors. This module has no spatial wave,
// particle, Hamiltonian, or box-model dependencies. Durations are playback times.
const models = new Map();

export function gridModel(side = 4) {
  if (!Number.isInteger(side) || side < 2 || side > 5) throw new RangeError('Grid size must be 2, 3, 4 or 5.');
  if (models.has(side)) return models.get(side);
  const stateCount = side * side, symbol = side % 2 ? 'B' : 'H';
  const iterations = Math.round(Math.PI / (4 * Math.asin(1 / Math.sqrt(stateCount))) - .5);
  const labels = Array.from({length: stateCount}, (_, q) => side % 2
    ? `${Math.floor(q / side)},${q % side}` : q.toString(2).padStart(2 * Math.log2(side), '0'));
  const gates = Object.freeze([
    {kind: 'prepare', name: `${symbol} · prepare balanced state`, symbol, iteration: 0, duration: 2.4},
    ...Array.from({length: iterations}, (_, i) => [
      {kind: 'oracle', name: 'Oracle · marked-state sign flip', symbol: 'Oω', iteration: i + 1, duration: 1.6},
      {kind: 'inverse', name: `${symbol} · diffuser 1/3`, symbol, iteration: i + 1, duration: 2.4},
      {kind: 'reference', name: 'Initial-state sign flip · diffuser 2/3', symbol: 'Sᵢ', iteration: i + 1, duration: 1.6},
      {kind: 'forward', name: `${symbol} · diffuser 3/3`, symbol, iteration: i + 1, duration: 2.4},
    ]).flat(),
  ].map(Object.freeze));
  const model = Object.freeze({side, stateCount, iterations, labels, gates, mixTime: 2.4, inverseTime: 2.4});
  models.set(side, model);
  return model;
}

export function basisState(q = 0, side = 4) {
  const {stateCount} = gridModel(side);
  if (!Number.isInteger(q) || q < 0 || q >= stateCount) throw new RangeError('Invalid logical state.');
  const state = new Float64Array(2 * stateCount);
  state[2 * q] = 1;
  return state;
}

export function hadamard(state) {
  const {side, stateCount} = gridModel(Math.sqrt(state.length / 2));
  // Ordinary H tensor n on the 4- and 16-state qubit registers.
  if (side % 2 === 0) {
    const out = Float64Array.from(state);
    for (let stride = 1; stride < stateCount; stride *= 2) {
      for (let block = 0; block < stateCount; block += 2 * stride) {
        for (let q = 0; q < stride; q++) for (let part = 0; part < 2; part++) {
          const lo = 2 * (block + q) + part, hi = lo + 2 * stride;
          const a = out[lo], b = out[hi];
          out[lo] = a + b; out[hi] = a - b;
        }
      }
    }
    return out.map(value => value / Math.sqrt(stateCount));
  }
  // The 9- and 25-state options are generalized amplitude amplification,
  // not qubit Hadamards: B[(x,y),(u,v)] = exp(2*pi*i*(x*v-y*u)/side)/side.
  // B = B dagger, B squared = I, and every entry has magnitude 1/side.
  const out = new Float64Array(state.length);
  for (let x = 0; x < side; x++) for (let y = 0; y < side; y++) {
    const q = 2 * (side * x + y);
    for (let u = 0; u < side; u++) for (let v = 0; v < side; v++) {
      const r = 2 * (side * u + v), angle = 2 * Math.PI * (x * v - y * u) / side;
      const re = Math.cos(angle) / side, im = Math.sin(angle) / side;
      out[q] += re * state[r] - im * state[r + 1];
      out[q + 1] += im * state[r] + re * state[r + 1];
    }
  }
  return out;
}

export function oracle(state, target) {
  return state.map((value, k) => Math.floor(k / 2) === target ? -value : value);
}

export function referenceFlip(state, initial = 0) {
  // S_i = I - 2|i><i|: flip only the initial-state amplitude.
  // H S_i H = I - 2|s_i><s_i| = -D. Keep this global sign visible;
  // Grover probabilities are identical to the inversion-about-mean convention.
  return state.map((value, k) => Math.floor(k / 2) === initial ? -value : value);
}

// The component subtracted twice by the complete mixer: |s_i><s_i|a>.
// With the all-zero input every entry is the ordinary complex mean of a.
export function mixerProjection(state, initial = 0) {
  const s = hadamard(basisState(initial, Math.sqrt(state.length / 2)));
  let re = 0, im = 0;
  for (let k = 0; k < state.length; k += 2) {
    re += s[k] * state[k] + s[k + 1] * state[k + 1];
    im += s[k] * state[k + 1] - s[k + 1] * state[k];
  }
  return s.map((value, k) => k % 2 ? s[k - 1] * im + value * re : value * re - s[k + 1] * im);
}

// A display choice between exact gate endpoints, not extra Grover operations.
// For a Hermitian reflection G, rotate its -1 eigenspace through exp(-i*pi*p):
// U(p) = (I+G)/2 + exp(-i*pi*p)(I-G)/2. This keeps total probability at 1.
// Both occurrences of H use precisely this same path; there is no inverse-time
// animation inherited from a spatial model. Endpoints use the exact matrices.
function animateReflection(state, reflected, p) {
  if (p <= 0) return Float64Array.from(state);
  if (p >= 1) return reflected;
  const out = new Float64Array(state.length), c = Math.cos(Math.PI * p), s = Math.sin(Math.PI * p);
  for (let r = 0; r < state.length; r += 2) {
    const minusRe = .5 * (state[r] - reflected[r]);
    const minusIm = .5 * (state[r + 1] - reflected[r + 1]);
    out[r] = .5 * (state[r] + reflected[r]) + c * minusRe + s * minusIm;
    out[r + 1] = .5 * (state[r + 1] + reflected[r + 1]) + c * minusIm - s * minusRe;
  }
  return out;
}

export function evolveGate(state, kind, progress, target, initial = 0) {
  let end;
  if (['prepare', 'inverse', 'forward'].includes(kind)) end = hadamard(state);
  else if (kind === 'oracle') end = oracle(state, target);
  else if (kind === 'reference') end = referenceFlip(state, initial);
  // H S_i H is itself a Hermitian reflection. Animate that whole operator
  // directly, using the post-oracle state and exact full-mixer endpoint.
  else if (kind === 'mixer') end = hadamard(referenceFlip(hadamard(state), initial));
  else throw new Error(`Unknown gate: ${kind}`);
  return animateReflection(state, end, progress);
}

export function probabilities(state) {
  return Float64Array.from({length: state.length / 2}, (_, q) => state[2 * q] ** 2 + state[2 * q + 1] ** 2);
}
export function normSquared(state) { return state.reduce((sum, value) => sum + value * value, 0); }
export function expectedProbability(iterations, side = 4) {
  return Math.sin((2 * iterations + 1) * Math.asin(1 / Math.sqrt(gridModel(side).stateCount))) ** 2;
}

export class SearchSimulation {
  constructor(target = 15, initial = 0, side = 4) {
    this.model = gridModel(side); this.target = Math.min(target, this.model.stateCount - 1);
    this.initial = initial; this.combineMixer = false; this.reset();
  }
  reset() {
    this.amplitudes = basisState(this.initial, this.model.side); this.completed = 0; this.active = null; this.last = null;
    this.mixerInput = null;
    this.paused = false; this.autoplay = false; this.time = 0; this.checkpoints = [];
  }
  get canCombineMixer() {
    return !this.active && !['inverse', 'reference'].includes(this.last?.kind);
  }
  setCombineMixer(value) {
    if (!this.canCombineMixer || typeof value !== 'boolean' || value === this.combineMixer) return false;
    this.combineMixer = value;
    return true;
  }
  setGridSize(side) {
    if (!Number.isInteger(side) || side < 2 || side > 5 || side === this.model.side) return false;
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
  gateAt(index) {
    if (!Number.isInteger(index) || index < 0) return null;
    if (index < this.model.gates.length) return this.model.gates[index];
    // Continue the same four gates beyond the recommended measurement round.
    const template = this.model.gates[1 + (index - 1) % 4];
    return {...template, iteration: Math.floor((index - 1) / 4) + 1};
  }
  get nextGate() { return this.gateAt(this.completed); }
  previousStep() {
    if (!this.active && this.completed === 0) return false;
    let target = this.completed;
    if (!this.active) target -= this.combineMixer && this.gateAt(target - 1).kind === 'forward' ? 3 : 1;
    // Restore exact checkpoints in the selected mode. This also handles
    // stepping inside a mixer that was previously completed in combined mode.
    this.reset();
    while (this.completed < target) {
      this.startNext(); this.advance(this.active.duration);
    }
    return true;
  }
  startNext() {
    if (this.active) return false;
    const next = this.nextGate;
    // Retain the post-oracle reference through all three gates and their endpoint.
    // Previous step reconstructs it along with the other exact checkpoints.
    if (next.kind === 'inverse') this.mixerInput = Float64Array.from(this.amplitudes);
    else if (next.kind === 'oracle') this.mixerInput = null;
    const gate = this.combineMixer && next.kind === 'inverse'
      ? {...next, kind: 'mixer', name: `Combined mixer · ${next.symbol} Sᵢ ${next.symbol}`} : next;
    this.active = {...gate, index: this.completed, elapsed: 0, progress: 0,
      startAmplitudes: Float64Array.from(this.amplitudes)};
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
      this.last = gate; this.active = null; this.completed += gate.kind === 'mixer' ? 3 : 1;
      this.checkpoints.push({step: this.completed, kind: gate.kind, iteration: gate.iteration,
        targetProbability: probabilities(this.amplitudes)[this.target]});
      if (this.autoplay && this.completed < this.model.gates.length) this.startNext();
      else this.autoplay = false;
    }
  }
  snapshot() {
    const gate = this.active || this.last;
    const kind = gate?.kind || 'input', progress = this.active?.progress ?? (this.last ? 1 : 0);
    const operationKind = this.combineMixer && ['inverse', 'reference', 'forward'].includes(kind) ? 'mixer'
      : !this.combineMixer && kind === 'mixer' ? 'forward' : kind;
    const completedOperations = this.combineMixer
      ? this.checkpoints.filter(item => !['inverse', 'reference'].includes(item.kind)).length : this.completed;
    return {side: this.model.side, stateCount: this.model.stateCount, iterations: this.model.iterations,
      mixTime: this.model.mixTime, inverseTime: this.model.inverseTime, target: this.target, initial: this.initial,
      completed: this.completed, busy: !!this.active, paused: this.paused, time: this.time,
      kind, iteration: gate?.iteration || 0, progress, norm: normSquared(this.amplitudes),
      combineMixer: this.combineMixer, canCombineMixer: this.canCombineMixer, operationKind, operationProgress: progress,
      completedOperations, totalOperations: this.combineMixer ? 1 + 2 * this.model.iterations : this.model.gates.length,
      completedIterations: Math.max(0, Math.floor((this.completed - 1) / 4)),
      recommendedReached: this.completed >= this.model.gates.length,
      probabilities: Array.from(probabilities(this.amplitudes)), amplitudes: Array.from(this.amplitudes),
      mixerInput: this.mixerInput ? Array.from(this.mixerInput) : null,
      checkpoints: this.checkpoints.map(item => ({...item}))};
  }
}
