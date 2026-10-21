// Deliberate editing assistance, separate from the physical model and score.
import { NODE_COUNT, BRUSH_MIN, BRUSH_MAX, basis, clamp, chainNormalization, deform, evaluate, redistributeChain, zeroCurve } from './model.js';
import { DYNAMICS_BOUNDS, deformDynamics, evaluateDynamics, optimalDynamics } from './dynamics.js';

export function dragCurve(mode, initial, anchor, deltaX, deltaY, width, assist = true) {
  const dynamics = mode.id === 'dynamics';
  const direct = dynamics ? deformDynamics(mode, initial, anchor, deltaX, deltaY, width)
    : deform(mode, initial, anchor, deltaY, width);
  if (!assist) return { coefficients: direct, width };

  // The original brush sets the grabbed point and its travel limits. Assistance
  // only changes the falloff around it; it never scales or attracts the handle.
  // Using this bounded stroke also freezes the wings during extra overdrag.
  const center = basis(anchor);
  const q = (coefficients, offset = 0) => center.reduce((sum, b) => sum + b.w * coefficients[offset + b.i], 0);
  const gain = dynamics ? 3 * anchor * (1 - anchor) : chainNormalization(mode, initial) * mode.envelope(anchor);
  const dx = dynamics ? gain * (q(direct) - q(initial)) : 0;
  const dy = gain * (q(direct, dynamics ? NODE_COUNT : 0) - q(initial, dynamics ? NODE_COUNT : 0));
  const distance = Math.hypot(dx, dy);
  if (distance < 1e-12) return { coefficients: direct, width };

  const point = dynamics ? evaluateDynamics : evaluate;
  const start = point(mode, initial, anchor), goal = point(mode, dynamics ? optimalDynamics(mode) : zeroCurve(), anchor);
  const ex = dynamics ? goal.x - start.x : 0, ey = goal.y - start.y;
  const error = Math.hypot(ex, ey);
  // A pull toward the guide recruits more neighbors. Away/perpendicular pulls
  // stay local. Assistance fades again when a stroke overshoots the guide.
  const toward = clamp((error - Math.hypot(ex - dx, ey - dy)) / distance, 0, 1);
  const local = Math.max(BRUSH_MIN, 0.6 * width);
  const broad = Math.min(BRUSH_MAX, Math.hypot(1.25 * width, 0.65 * Math.sqrt(distance * error) / mode.xMax));
  const reach = local + toward * (broad - local);
  if (Math.abs(reach - width) < 1e-12) return { coefficients: direct, width };
  const coordinate = u => dynamics ? u : mode.x(u) / mode.xMax;
  const weights = Array.from({ length: NODE_COUNT }, (_, i) => Math.exp(-0.5 * ((coordinate(i / (NODE_COUNT - 1)) - coordinate(anchor)) / reach) ** 2));
  const coefficients = [...initial];
  for (let axis = 0; axis < (dynamics ? 2 : 1); axis++) {
    const offset = axis * NODE_COUNT, bounds = dynamics ? DYNAMICS_BOUNDS[axis] : mode.coefficientBounds;
    const value = amplitude => center.reduce((sum, b) => sum + b.w * clamp(initial[offset + b.i] + amplitude * weights[b.i], ...bounds), 0);
    const target = q(direct, offset);
    let amplitude = (target - q(initial, offset)) / center.reduce((sum, b) => sum + b.w * weights[b.i], 0);
    // The weighted sum is piecewise linear. Recompute its slope when a control
    // coefficient saturates, preserving the full original handle displacement.
    for (let iteration = 0; iteration < center.length + 1; iteration++) {
      const remainder = target - value(amplitude);
      if (Math.abs(remainder) < 1e-12) break;
      const slope = center.reduce((sum, b) => {
        const c = initial[offset + b.i] + amplitude * weights[b.i];
        return sum + (c > bounds[0] && c < bounds[1] ? b.w * weights[b.i] : 0);
      }, 0);
      if (slope < 1e-15) return { coefficients: direct, width };
      amplitude += remainder / slope;
    }
    if (mode.id === 'catenary') {
      const shape = amount => redistributeChain(mode, initial,
        initial.map((c, i) => clamp(c + amount * weights[i], ...bounds)), anchor, reach);
      const targetY = point(mode, direct, anchor).y;
      const initialScale = chainNormalization(mode, initial);
      const directRescale = Math.abs(chainNormalization(mode, direct) / initialScale - 1);
      let result = shape(amplitude);
      // A remaining global length adjustment can move the handle. Match its
      // direct position without discarding the new local redistribution.
      for (let iteration = 0; iteration < 5; iteration++) {
        const remainder = targetY - point(mode, result, anchor).y;
        if (Math.abs(remainder) < 1e-9) {
          // Neighbor assistance must not reintroduce a larger whole-chain lift.
          return Math.abs(chainNormalization(mode, result) / initialScale - 1) <= directRescale + 1e-9
            ? { coefficients: result, width: reach } : { coefficients: direct, width };
        }
        const h = 1e-5 * Math.max(1, Math.abs(amplitude));
        const slope = (point(mode, shape(amplitude + h), anchor).y - point(mode, shape(amplitude - h), anchor).y) / (2 * h);
        if (Math.abs(slope) < 1e-8) break;
        amplitude += clamp(remainder / slope, -1, 1);
        result = shape(amplitude);
      }
      return { coefficients: direct, width };
    }
    for (let i = 0; i < NODE_COUNT; i++) coefficients[offset + i] = clamp(initial[offset + i] + amplitude * weights[i], ...bounds);
  }
  return { coefficients, width: reach };
}
