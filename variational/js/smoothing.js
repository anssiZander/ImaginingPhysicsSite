// A local editing brush, independent of the analytic solution and drag assist.
import { NODE_COUNT, clamp, redistributeChain } from './model.js';

export const SMOOTH_STEP = 1 / 60;

export function smoothCurve(mode, initial, anchor, width, passes = 1) {
  const timed = mode.id === 'dynamics';
  const coordinate = u => timed ? u : mode.x(u) / mode.xMax;
  const center = coordinate(anchor), spacing = 1 / (NODE_COUNT - 1);
  // A sub-knot Reach still needs enough support to smooth a between-node grab.
  const knotSpan = Math.max(center - coordinate(Math.max(0, anchor - spacing)),
    coordinate(Math.min(1, anchor + spacing)) - center);
  const radius = Math.max(1.25 * width, 2 * knotSpan);
  const weights = Array.from({ length: NODE_COUNT }, (_, i) => {
    const r = (coordinate(i * spacing) - center) / radius;
    return Math.max(0, 1 - r * r) ** 2;
  });
  let coefficients = initial;
  for (let pass = 0; pass < passes; pass++) {
    const before = coefficients;
    coefficients = before.map((c, index) => {
      const i = index % NODE_COUNT;
      if (i === 0 || i === NODE_COUNT - 1 || weights[i] === 0) return c;
      // Convex averaging cannot overshoot existing coefficient limits. Both
      // Dynamics axes are filtered separately, at their original timestamps.
      const average = (before[index - 1] + before[index + 1]) / 2;
      return c + 0.1 * weights[i] * (average - c);
    });
  }
  if (coefficients.some((c, i) => c !== initial[i])) {
    coefficients = redistributeChain(mode, initial, coefficients, clamp(anchor, 0, 1), radius / 1.25, false);
  }
  return { coefficients, width: radius / 1.25 };
}
