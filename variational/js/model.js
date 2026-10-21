// Pure numerical model. No DOM, rendering, or browser dependencies.
export const NODE_COUNT = 65;
export const BRUSH_MIN = 0.00375;
export const BRUSH_MAX = 0.28;
export const G = 9.81;
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

function cycloidAngle(ratio) {
  let lo = 1e-6, hi = 2 * Math.PI - 1e-6;
  for (let i = 0; i < 80; i++) {
    const a = (lo + hi) / 2;
    if ((a - Math.sin(a)) / (2 * Math.sin(a / 2) ** 2) < ratio) lo = a;
    else hi = a;
  }
  return (lo + hi) / 2;
}

const theta = cycloidAngle(3 / 1.8);
const radius = 1.8 / (2 * Math.sin(theta / 2) ** 2);
const CHAIN_LENGTH = 3.6;
let chainLo = 0.01, chainHi = 5;
for (let i = 0; i < 80; i++) {
  const c = (chainLo + chainHi) / 2;
  if (Math.sinh(c) / c < CHAIN_LENGTH / 3) chainLo = c;
  else chainHi = c;
}
const chainC = (chainLo + chainHi) / 2;
const chainA = 3 / (2 * chainC);
const chainTarget = -G * chainA ** 2 * (Math.cosh(chainC) * Math.sinh(chainC) - chainC);

export const MODES = {
  length: {
    id: 'length', name: 'Shortest path', short: 'Length', symbol: 'ℓ', unit: 'm',
    title: 'Take the short way.',
    description: 'Two fixed points. How little curve can you put between them?',
    target: 3.4, tolerance: 0.005, scale: 3.4,
    xMax: 3, yEnd: 1.6, bounds: [-0.65, 2.28], coefficientBounds: [-1.5, 1.5],
    axis: 'distance density · m', solution: 'A straight line',
    formula: 'ℓ[y] = ∫₀¹ √(xᵤ² + yᵤ²) du',
    physical: 'Length adds up tiny pieces of the curve.',
    targetLabel: 'Straight-line minimum',
    x: u => 3 * u, dx: () => 3,
    base: u => 1.6 * u, dbase: () => 1.6,
    envelope: u => 3 * u * (1 - u), denvelope: u => 3 * (1 - 2 * u),
  },
  catenary: {
    id: 'catenary', name: 'Hanging chain', short: 'Catenary', symbol: 'U', unit: 'J',
    title: 'Find the natural hang.',
    description: 'One chain. A fixed length. Let gravity choose the curve.',
    target: chainTarget, tolerance: 0.01, scale: Math.abs(chainTarget),
    xMax: 3, yEnd: 0, bounds: [-0.18, 1.17], coefficientBounds: [-0.9, 1.2],
    axis: 'potential-energy density · J', solution: 'A catenary',
    formula: 'U[y] = −μg ∫₀¹ y √(xᵤ² + yᵤ²) du',
    physical: 'The chain redistributes as you pull, keeping its 3.60 m length.',
    targetLabel: 'Catenary minimum', chainLength: CHAIN_LENGTH, a: chainA, c: chainC,
    x: u => 3 * u, dx: () => 3,
    base: u => chainA * (Math.cosh(chainC) - Math.cosh(3 * (u - 0.5) / chainA)),
    dbase: u => -3 * Math.sinh(3 * (u - 0.5) / chainA),
    envelope: u => 0.75 * chainA * (Math.cosh(chainC) - Math.cosh(3 * (u - 0.5) / chainA)),
    denvelope: u => -2.25 * Math.sinh(3 * (u - 0.5) / chainA),
  },
  brachistochrone: {
    id: 'brachistochrone', name: 'Fastest descent', short: 'Time', symbol: 'T', unit: 's',
    title: 'Race gravity.',
    description: 'A bead starts at rest. Shape the frictionless track for the fastest ride.',
    target: theta * Math.sqrt(radius / G), tolerance: 0.006,
    scale: theta * Math.sqrt(radius / G),
    xMax: 3, yEnd: 1.8, bounds: [-0.23, 2.48], coefficientBounds: [-0.88, 1.6],
    axis: 'time density · s', solution: 'A cycloid',
    formula: 'T[y] = ∫₀¹ √(xᵤ² + yᵤ²) / √(2gy) du',
    physical: 'Steeper first means faster sooner. But extra distance still counts.',
    targetLabel: 'Cycloidal minimum', theta, radius,
    x: u => {
      const a = theta * u;
      return radius * (Math.abs(a) < 0.01 ? a ** 3 / 6 - a ** 5 / 120 + a ** 7 / 5040 : a - Math.sin(a));
    },
    dx: u => radius * theta * 2 * Math.sin(theta * u / 2) ** 2,
    base: u => radius * 2 * Math.sin(theta * u / 2) ** 2,
    dbase: u => radius * theta * Math.sin(theta * u),
    envelope: u => radius * 2 * Math.sin(theta * u / 2) ** 2 * (1 - u),
    denvelope: u => radius * theta * Math.sin(theta * u) * (1 - u) - radius * 2 * Math.sin(theta * u / 2) ** 2,
  },
};

// Normalized, nonnegative cubic B-spline weights keep q within coefficient bounds.
// The envelope, rather than a forced endpoint sample, pins the whole smooth curve.
export function basis(u, count = NODE_COUNT) {
  const z = clamp(u, 0, 1) * (count - 1);
  const values = [];
  let total = 0, dtotal = 0;
  for (let i = Math.floor(z) - 1; i <= Math.floor(z) + 2; i++) {
    if (i < 0 || i >= count) continue;
    const r = z - i, a = Math.abs(r), sign = Math.sign(r);
    const w = a < 1 ? (4 - 6 * a * a + 3 * a ** 3) / 6 : a < 2 ? (2 - a) ** 3 / 6 : 0;
    const dw = (a < 1 ? sign * (-12 * a + 9 * a * a) / 6 : a < 2 ? -sign * (2 - a) ** 2 / 2 : 0) * (count - 1);
    values.push({ i, w, dw }); total += w; dtotal += dw;
  }
  return values.map(v => ({ i: v.i, w: v.w / total, dw: (v.dw * total - v.w * dtotal) / total ** 2 }));
}

// Carry forward older saved curves when the editor's resolution increases.
// Sampling the old spline field retains its shape approximately and stays
// within its bounds, since every new coefficient is a convex combination.
export function resizeCurve(coefficients) {
  if (coefficients.length === NODE_COUNT) return [...coefficients];
  return Array.from({ length: NODE_COUNT }, (_, i) => basis(i / (NODE_COUNT - 1), coefficients.length)
    .reduce((sum, b) => sum + coefficients[b.i] * b.w, 0));
}

function rawPoint(mode, coefficients, u) {
  u = clamp(u, 0, 1);
  let q = 0, dq = 0;
  for (const b of basis(u)) { q += coefficients[b.i] * b.w; dq += coefficients[b.i] * b.dw; }
  const x = mode.x(u), dx = mode.dx(u);
  const y = mode.base(u) + mode.envelope(u) * q;
  const dy = mode.dbase(u) + mode.denvelope(u) * q + mode.envelope(u) * dq;
  return { u, x, y, dx, dy, q };
}

// Coefficient arrays are immutable snapshots. Cache the one global constraint
// solve per snapshot, not per plot sample. The scalar rescales the vertical shape.
const scaleCache = new WeakMap();
export function chainNormalization(mode, coefficients) {
  if (mode.id !== 'catenary') return 1;
  if (scaleCache.has(coefficients)) return scaleCache.get(coefficients);
  const slopes = [], weights = [], n = (NODE_COUNT - 1) * 4;
  for (let j = 0; j < n; j++) {
    for (let k = 0; k < GX.length; k++) {
      slopes.push(rawPoint(mode, coefficients, (j + 0.5 + 0.5 * GX[k]) / n).dy ** 2);
      weights.push(GW[k] / (2 * n));
    }
  }
  const arc = scale => slopes.reduce((sum, slope, i) => sum + weights[i] * Math.sqrt(9 + scale * scale * slope), 0);
  let lo = 0, hi = 1;
  while (arc(hi) < mode.chainLength) hi *= 2;
  let value = (lo + hi) / 2;
  for (let iteration = 0; iteration < 40; iteration++) {
    const length = arc(value);
    if (Math.abs(length - mode.chainLength) < 1e-12) break;
    if (length < mode.chainLength) lo = value; else hi = value;
    const derivative = slopes.reduce((sum, slope, i) => sum + weights[i] * value * slope / Math.sqrt(9 + value * value * slope), 0);
    const next = value - (length - mode.chainLength) / derivative;
    value = next > lo && next < hi ? next : (lo + hi) / 2;
  }
  scaleCache.set(coefficients, value);
  return value;
}

export function evaluate(mode, coefficients, u) {
  const raw = rawPoint(mode, coefficients, u);
  const normalization = chainNormalization(mode, coefficients);
  const { x, dx, q } = raw;
  const y = raw.y * normalization, dy = raw.dy * normalization;
  u = raw.u;
  let f;
  if (mode.id === 'catenary') f = -G * y * Math.hypot(dx, dy);
  else if (mode.id === 'length') f = Math.hypot(dx, dy);
  else if (u < 1e-8) f = mode.target * Math.sqrt(1 + q);
  else f = Math.hypot(dx, dy) / Math.sqrt(2 * G * y);
  return { u, x, y, dx, dy, f };
}

const GX = [0, -0.5384693101056831, 0.5384693101056831, -0.906179845938664, 0.906179845938664];
const GW = [0.5688888888888889, 0.4786286704993665, 0.4786286704993665, 0.2369268850561891, 0.2369268850561891];

// Split at every spline knot; sixteen subintervals resolve sharp fine edits.
export function integrate(mode, coefficients, start = 0, end = 1, subdivisions = 16) {
  const n = (NODE_COUNT - 1) * subdivisions;
  let sum = 0;
  for (let j = Math.floor(start * n); j < Math.ceil(end * n); j++) {
    const a = Math.max(start, j / n), b = Math.min(end, (j + 1) / n);
    if (b <= a) continue;
    const midpoint = (a + b) / 2, half = (b - a) / 2;
    for (let k = 0; k < GX.length; k++) sum += half * GW[k] * evaluate(mode, coefficients, midpoint + half * GX[k]).f;
  }
  return sum;
}

export function parameterAtX(mode, x) {
  if (mode.id !== 'brachistochrone') return clamp(x / mode.xMax, 0, 1);
  let lo = 0, hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (mode.x(mid) < x) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

export const zeroCurve = () => Array(NODE_COUNT).fill(0);

export function newCurve(mode, seed = Math.random()) {
  const phase = seed * 2 * Math.PI;
  return Array.from({ length: NODE_COUNT }, (_, i) => {
    const u = i / (NODE_COUNT - 1);
    const q = 0.65 * Math.sin(2 * Math.PI * u + phase) + 0.3 * Math.cos(4 * Math.PI * u - phase / 2) + 0.25;
    return clamp(q, ...mode.coefficientBounds);
  });
}

// Take up a chain edit in its nearby shoulders before the remaining global
// length normalization. The grabbed point stays fixed. A compact,
// smooth profile prevents a local bump from lifting the entire hanging chain.
export function redistributeChain(mode, initial, proposed, anchor, width, pinCenter = true) {
  if (mode.id !== 'catenary') return proposed;
  const scale = chainNormalization(mode, initial), center = basis(anchor);
  const motion = pinCenter
    ? Math.abs(scale * mode.envelope(anchor) * center.reduce((sum, b) => sum + b.w * (proposed[b.i] - initial[b.i]), 0))
    : Math.max(...proposed.map((c, i) => Math.abs(scale * mode.envelope(i / (NODE_COUNT - 1)) * (c - initial[i]))));
  if (motion < 1e-12) return proposed;
  const radius = Math.min(0.48, Math.max(2 * width, (pinCenter ? 0.14 : 0.28) + 1.5 * motion));
  const shoulders = proposed.map((_, i) => Math.max(0, 1 - ((i / (NODE_COUNT - 1) - anchor) / radius) ** 2) ** 3);
  const pin = proposed.map((_, i) => Math.exp(-0.5 * ((i / (NODE_COUNT - 1) - anchor) / 0.015) ** 2));
  const pinGain = center.reduce((sum, b) => sum + b.w * pin[b.i], 0);
  const shoulderGain = center.reduce((sum, b) => sum + b.w * shoulders[b.i], 0);
  // Smoothing has no pinned handle: a broad local adjustment can take up the
  // freed length without reintroducing the narrow bump being brushed away.
  const profile = pinCenter ? shoulders.map((w, i) => w - shoulderGain * pin[i] / pinGain) : shoulders;
  let lower = -Infinity, upper = Infinity;
  profile.forEach((weight, i) => {
    if (Math.abs(weight) < 1e-12) return;
    const a = (mode.coefficientBounds[0] - proposed[i]) / weight;
    const b = (mode.coefficientBounds[1] - proposed[i]) / weight;
    lower = Math.max(lower, Math.min(a, b));
    upper = Math.min(upper, Math.max(a, b));
  });
  const samples = [], n = (NODE_COUNT - 1) * 4;
  for (let j = 0; j < n; j++) for (let k = 0; k < GX.length; k++) {
    const u = (j + 0.5 + 0.5 * GX[k]) / n;
    const slope = scale * rawPoint(mode, proposed, u).dy;
    const direction = scale * basis(u).reduce((sum, b) => sum + profile[b.i] * (mode.denvelope(u) * b.w + mode.envelope(u) * b.dw), 0);
    samples.push({ slope, direction, weight: GW[k] / (2 * n) });
  }
  const measure = amount => {
    let length = 0, derivative = 0;
    for (const p of samples) {
      const slope = p.slope + amount * p.direction, ds = Math.hypot(3, slope);
      length += p.weight * ds;
      derivative += p.weight * slope * p.direction / ds;
    }
    return { length, derivative };
  };
  const start = measure(0), error = start.length - mode.chainLength;
  if (Math.abs(error) < 1e-12 || Math.abs(start.derivative) < 1e-12) return proposed;
  let edge = error * start.derivative > 0 ? lower : upper;
  if (!Number.isFinite(edge) || edge === 0) return proposed;
  // Arc length is convex along this profile. If shortening passes its minimum,
  // stop there; forcing the correction farther would add a new unwanted fold.
  if (error > 0 && measure(edge).derivative * start.derivative < 0) {
    let a = 0, b = edge;
    for (let iteration = 0; iteration < 30; iteration++) {
      const mid = (a + b) / 2;
      if (measure(mid).derivative * start.derivative > 0) a = mid; else b = mid;
    }
    edge = (a + b) / 2;
  }
  if ((measure(edge).length - mode.chainLength) * error <= 0) {
    let a = 0, b = edge;
    for (let iteration = 0; iteration < 36; iteration++) {
      const mid = (a + b) / 2;
      if ((measure(mid).length - mode.chainLength) * error > 0) a = mid; else b = mid;
    }
    edge = (a + b) / 2;
  }
  return proposed.map((c, i) => clamp(c + edge * profile[i], ...mode.coefficientBounds));
}

export function deform(mode, initial, anchor, deltaY, width) {
  // At 65 knots the fixed-length chain's local correction needs roughly one
  // knot of support; a thinner stroke would make its global rescale visible.
  if (mode.id === 'catenary') width = Math.max(width, 0.015);
  const x = mode.x(anchor) / mode.xMax;
  const weights = Array.from({ length: NODE_COUNT }, (_, i) => Math.exp(-0.5 * ((mode.x(i / (NODE_COUNT - 1)) / mode.xMax - x) / width) ** 2));
  const center = basis(anchor);
  const gain = chainNormalization(mode, initial) * mode.envelope(anchor) * center.reduce((sum, b) => sum + b.w * weights[b.i], 0);
  if (Math.abs(gain) < 1e-8) return [...initial];

  // Limit the entire stroke when a coefficient supporting the grabbed point
  // reaches its bound. Clamping each coefficient alone lets the brush's wings
  // keep spreading after its center has stopped. Distant saturated coefficients
  // do not block a new stroke elsewhere on the curve.
  const [lower, upper] = mode.coefficientBounds;
  let minimum = -Infinity, maximum = Infinity;
  for (const b of center) {
    if (b.w <= 1e-12) continue;
    minimum = Math.max(minimum, (lower - initial[b.i]) / weights[b.i]);
    maximum = Math.min(maximum, (upper - initial[b.i]) / weights[b.i]);
  }
  const amplitude = clamp(deltaY / gain, minimum, maximum);
  const proposed = initial.map((c, i) => clamp(c + amplitude * weights[i], lower, upper));
  return redistributeChain(mode, initial, proposed, anchor, width);
}

export function sample(mode, coefficients, count = 300) {
  return Array.from({ length: count + 1 }, (_, i) => evaluate(mode, coefficients, i / count));
}
