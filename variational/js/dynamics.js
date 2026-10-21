import { NODE_COUNT, G, basis, clamp } from './model.js';

export const DURATION_MIN = 0.5, DURATION_MAX = 1.5;
export const DYNAMICS_BOUNDS = [[-2, 2], [-4.2, 2]];

export function createDynamics(duration = 1) {
  const T = clamp(duration, DURATION_MIN, DURATION_MAX), mass = 1, distance = 3;
  return {
    id: 'dynamics', name: 'Dynamics', short: 'Action', symbol: 'S', unit: 'J·s',
    title: 'One trip. One clock.', description: 'Same ends. Same time. Let gravity choose the motion.',
    duration: T, mass, xMax: distance, yEnd: 0, xBounds: [-0.5, 3.5], bounds: [-3.4, 1.7],
    target: mass * distance ** 2 / (2 * T) - mass * G ** 2 * T ** 3 / 24,
    // A positive action scale, independent of the arbitrary zero of potential.
    scale: mass * distance ** 2 / T + mass * G ** 2 * T ** 3 / 12, tolerance: 0.005,
    axis: 'Lagrangian L(t) · J', solution: 'A ballistic trajectory', targetLabel: 'Ballistic minimum',
    formula: 'S[r] = ∫₀ᵀ [m/2 (ẋ² + ẏ²) + mgy] dt',
  };
}

// Both components use an endpoint-vanishing envelope over a straight chord.
// Consequently changing duration preserves the edited geometric path exactly.
export function evaluateDynamics(mode, coefficients, u) {
  u = clamp(u, 0, 1);
  let qx = 0, qy = 0, dqx = 0, dqy = 0;
  for (const b of basis(u)) {
    qx += coefficients[b.i] * b.w; dqx += coefficients[b.i] * b.dw;
    qy += coefficients[NODE_COUNT + b.i] * b.w; dqy += coefficients[NODE_COUNT + b.i] * b.dw;
  }
  const envelope = 3 * u * (1 - u), derivative = 3 * (1 - 2 * u);
  const x = mode.xMax * u + envelope * qx, y = envelope * qy;
  const dx = mode.xMax + derivative * qx + envelope * dqx, dy = derivative * qy + envelope * dqy;
  const vx = dx / mode.duration, vy = dy / mode.duration;
  const lagrangian = mode.mass * (0.5 * (vx * vx + vy * vy) + G * y);
  return { u, t: u * mode.duration, x, y, dx, dy, vx, vy, lagrangian, f: mode.duration * lagrangian };
}

const GX = [0, -0.5384693101056831, 0.5384693101056831, -0.906179845938664, 0.906179845938664];
const GW = [0.5688888888888889, 0.4786286704993665, 0.4786286704993665, 0.2369268850561891, 0.2369268850561891];
export function integrateDynamics(mode, coefficients, start = 0, end = 1, subdivisions = 4) {
  const n = (NODE_COUNT - 1) * subdivisions;
  let sum = 0;
  for (let j = Math.floor(start * n); j < Math.ceil(end * n); j++) {
    const a = Math.max(start, j / n), b = Math.min(end, (j + 1) / n);
    if (b <= a) continue;
    for (let k = 0; k < GX.length; k++) sum += (b - a) / 2 * GW[k] * evaluateDynamics(mode, coefficients, (a + b) / 2 + (b - a) / 2 * GX[k]).f;
  }
  return sum;
}

export function optimalDynamics(mode) {
  return [...Array(NODE_COUNT).fill(0), ...Array(NODE_COUNT).fill(-G * mode.duration ** 2 / 6)];
}

export function newDynamics(mode, seed = Math.random()) {
  const phase = seed * 2 * Math.PI;
  return Array.from({ length: 2 * NODE_COUNT }, (_, i) => {
    const u = (i % NODE_COUNT) / (NODE_COUNT - 1);
    return i < NODE_COUNT ? 0.25 * Math.sin(2 * Math.PI * u + phase)
      : 0.12 * Math.sin(2 * Math.PI * u + phase) + 0.06 * Math.cos(4 * Math.PI * u);
  });
}

export function deformDynamics(mode, initial, anchor, deltaX, deltaY, width) {
  const weights = Array.from({ length: NODE_COUNT }, (_, i) => Math.exp(-0.5 * ((i / (NODE_COUNT - 1) - anchor) / width) ** 2));
  const center = basis(anchor);
  const gain = 3 * anchor * (1 - anchor) * center.reduce((s, b) => s + b.w * weights[b.i], 0);
  if (Math.abs(gain) < 1e-8) return [...initial];
  const amplitudes = [deltaX / gain, deltaY / gain];
  let fraction = 1;
  // Limit the entire vector stroke at the grabbed center, including its wings.
  for (let axis = 0; axis < 2; axis++) for (const b of center) {
    if (b.w <= 1e-12) continue;
    const change = amplitudes[axis] * weights[b.i], current = initial[axis * NODE_COUNT + b.i];
    if (change > 0) fraction = Math.min(fraction, (DYNAMICS_BOUNDS[axis][1] - current) / change);
    else if (change < 0) fraction = Math.min(fraction, (DYNAMICS_BOUNDS[axis][0] - current) / change);
  }
  fraction = clamp(fraction, 0, 1);
  return initial.map((c, i) => {
    const axis = i < NODE_COUNT ? 0 : 1;
    return clamp(c + fraction * amplitudes[axis] * weights[i % NODE_COUNT], ...DYNAMICS_BOUNDS[axis]);
  });
}

export function dynamicsELResidual(mode, coefficients, u) {
  const h = 0.0001, v = clamp(u, 0.0005, 0.9995);
  const a = evaluateDynamics(mode, coefficients, v - h), b = evaluateDynamics(mode, coefficients, v + h);
  const ax = (b.dx - a.dx) / (2 * h * mode.duration ** 2);
  const ay = (b.dy - a.dy) / (2 * h * mode.duration ** 2);
  return Math.hypot(ax, ay - G) / G;
}
