import { evaluate, clamp } from './model.js';

// Dimensionless local differential tests, independent of the endpoint solution.
export function geometricELResidual(mode, p, ddx, ddy, dddy = 0) {
  const speed = Math.hypot(p.dx, p.dy);
  const cross = p.dx * ddy - p.dy * ddx;
  if (mode.id === 'length') return mode.xMax * Math.abs(cross) / speed ** 3;
  if (mode.id === 'brachistochrone') {
    // (1 + y_x² + 2 y y_xx)/(1 + y_x²), evaluated without steep slopes.
    return Math.abs(1 + 2 * p.y * cross / (p.dx * speed ** 2));
  }
  // Eliminate the unknown constant length multiplier from the chain's EL
  // equation: (1+y_x²)y_xxx - y_x y_xx² = 0, with nonzero curvature.
  // Both catenary orientations are stationary; color is not a minimum test.
  // Each cyan interval admits a constant multiplier; separate intervals need
  // not share one. The global endpoint/length problem is checked by the score.
  const slope = p.dy / p.dx, second = ddy / p.dx ** 2, third = dddy / p.dx ** 3;
  if (Math.abs(second) < 1e-8) return 1;
  return mode.xMax ** 2 * Math.abs((1 + slope ** 2) * third - slope * second ** 2) / (1 + slope ** 2) ** 2.5;
}

export function localELResidual(mode, coefficients, u) {
  // Differentiate analytic tangents, never screen pixels. Avoid the cycloid's
  // singular x-parameter at release; its regular limiting neighborhood is used.
  const h = 0.0001, v = clamp(u, 0.0005, 0.9995);
  const p = evaluate(mode, coefficients, v);
  const a = evaluate(mode, coefficients, v - h), b = evaluate(mode, coefficients, v + h);
  const ddx = (b.dx - a.dx) / (2 * h), ddy = (b.dy - a.dy) / (2 * h);
  const dddy = mode.id === 'catenary' ? (b.dy - 2 * p.dy + a.dy) / h ** 2 : 0;
  return geometricELResidual(mode, p, ddx, ddy, dddy);
}
