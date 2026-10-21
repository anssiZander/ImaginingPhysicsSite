import { G } from './model.js';

// Source (0, 0), y positive downward, V = -mgy. All actions are in J s.
export function principalAction(x, y, t, mass = 1, g = G) {
  if (!(t > 0) || !Number.isFinite(t)) throw new RangeError('Flight time must be positive.');
  return mass * ((x * x + y * y) / (2 * t) + g * y * t / 2 - g * g * t ** 3 / 24);
}

export function principalMomentum(x, y, t, mass = 1, g = G) {
  if (!(t > 0) || !Number.isFinite(t)) throw new RangeError('Flight time must be positive.');
  return { x: mass * x / t, y: mass * (y / t + g * t / 2) };
}

export function principalTimeDerivative(x, y, t, mass = 1, g = G) {
  if (!(t > 0) || !Number.isFinite(t)) throw new RangeError('Flight time must be positive.');
  return mass * (-(x * x + y * y) / (2 * t * t) + g * y / 2 - g * g * t * t / 8);
}

export function ballisticPoint(vx, vy, t, g = G) {
  return { x: vx * t, y: vy * t + g * t * t / 2 };
}

export function fanRays(speed, count = 32) {
  return Array.from({ length: count }, (_, i) => {
    const angle = 2 * Math.PI * i / count;
    return { vx0: speed * Math.cos(angle), vy0: speed * Math.sin(angle) };
  });
}

// Compare this ray's elapsed time with the other root of the fixed-energy problem.
// Upward rays touch the caustic when v0² + g vy0 t = 0, then enter the long sheet.
export function rayBranch(vx0, vy0, t, g = G) {
  const v2 = vx0 * vx0 + vy0 * vy0, difference = v2 + g * vy0 * t;
  if (Math.abs(difference) <= 1e-9 * v2) return 'fold';
  return difference > 0 ? 'short' : 'long';
}

export function pulseRay(x, y, t, mass = 1, g = G) {
  const S = principalAction(x, y, t, mass, g), p = principalMomentum(x, y, t, mass, g);
  return { kind: 'pulse', t, vx0: x / t, vy0: y / t - g * t / 2, px: p.x, py: p.y, S };
}

// Exact S = level contour; this is NOT the falling circle of equal launch speeds.
export function principalFront(level, t, mass = 1, g = G) {
  if (!(t > 0) || !Number.isFinite(t)) throw new RangeError('Flight time must be positive.');
  const radius2 = 2 * t * level / mass + g * g * t ** 4 / 3;
  return radius2 < 0 ? null : { x: 0, y: -g * t * t / 2, radius: Math.sqrt(radius2) };
}

export function causticY(x, speed, g = G) {
  return g * x * x / (2 * speed * speed) - speed * speed / (2 * g);
}

// Stationary values of S(x,y,T) + E T over flight duration T, E = m v0^2 / 2.
// Two durations mean two spatial rays, NOT two paths to the same spacetime event.
export function energyBranches(x, y, speed, mass = 1, g = G) {
  if (!(speed > 0) || !Number.isFinite(speed)) throw new RangeError('Launch speed must be positive.');
  const v2 = speed * speed, q = x * x + y * y, b = v2 + g * y;
  const discriminant = v2 * v2 + 2 * g * v2 * y - g * g * x * x;
  const tolerance = 32 * Number.EPSILON * Math.max(v2 * v2, Math.abs(2 * g * v2 * y), g * g * x * x);
  if (discriminant < -tolerance || b <= 0) return { kind: 'none', discriminant, branches: [] };
  const root = Math.sqrt(Math.max(0, discriminant)), E = mass * v2 / 2;
  const make = (t, kind) => {
    if (t === 0) return { kind: 'source', t: 0, W: 0, S: 0, vx0: null, vy0: null, px: null, py: null };
    const ray = pulseRay(x, y, t, mass, g);
    return { ...ray, kind, W: ray.S + E * t };
  };
  if (Math.abs(discriminant) <= tolerance) {
    return { kind: 'fold', discriminant, branches: [make(Math.sqrt(2 * b) / g, 'fold')] };
  }
  // Rationalized short root avoids catastrophic cancellation close to the source.
  const short = make(Math.sqrt(2 * q / (b + root)), 'short');
  const long = make(Math.sqrt(2 * (b + root)) / g, 'long');
  return { kind: q === 0 ? 'source' : 'two', discriminant, branches: [short, long] };
}
