// Attractive Kepler field, m = 1, y positive downward. No softened force.
// Levi-Civita coordinates z = u², dt = |u|² ds give u'' = (epsilon/2)u.
export const MU = 8;
export const SOURCE = Object.freeze({ x: -2.4, y: 0 });
export const SOURCE_RADIUS = 2.4;
// A numerical guard around the point singularity, independent of the drawn M.
export const CORE_RADIUS = 1e-6;
export const DEFAULT_ORBIT_CAMERA = Object.freeze({ x: -1.2, y: 0, scale: 100 });
const TAU = 2 * Math.PI;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export function orbitFamily(speed) {
  if (!(speed > 0 && speed < Math.sqrt(2 * MU / SOURCE_RADIUS))) {
    throw new RangeError('Choose a positive speed below escape speed for the bound-orbit family.');
  }
  const energy = speed * speed / 2 - MU / SOURCE_RADIUS;
  const a = -MU / (2 * energy), omega = Math.sqrt(-energy / 2);
  const periodS = Math.PI / omega, period = TAU * Math.sqrt(a ** 3 / MU);
  // Adding MU/r_A to V sets V(A)=0. The force and W are unchanged, while
  // S = W - E_A t now has fronts moving along momentum even for bound orbits.
  return { speed, energy, phaseEnergy: speed * speed / 2, a, omega, periodS, period,
    loopAction: TAU * Math.sqrt(MU * a) };
}

export function orbitPoint(ray, s) {
  const { omega, energy } = ray.family, angle = omega * s;
  const C = Math.cos(angle), F = Math.sin(angle) / omega;
  const ux = ray.ux1 * F, uy = Math.sqrt(SOURCE_RADIUS) * C + ray.uy1 * F;
  const dux = ray.ux1 * C, duy = -omega * omega * Math.sqrt(SOURCE_RADIUS) * F + ray.uy1 * C;
  const r = ux * ux + uy * uy;
  const x = ux * ux - uy * uy, y = 2 * ux * uy;
  const vx = r > 1e-20 ? 2 * (ux * dux - uy * duy) / r : null;
  const vy = r > 1e-20 ? 2 * (ux * duy + uy * dux) / r : null;
  // Integral of F². The series avoids cancellation very close to the source.
  const q = angle * angle;
  const integralF2 = Math.abs(angle) < 0.05
    ? s ** 3 * (1 / 3 - q / 15 + 2 * q * q / 315 - q ** 3 / 2835 + 2 * q ** 4 / 155925)
    : (s - F * C) / (2 * omega * omega);
  const t = SOURCE_RADIUS * s + (ray.c - SOURCE_RADIUS * omega * omega) * integralF2 + ray.b * F * F;
  const W = 2 * energy * t + 2 * MU * s;
  const jacobian = C * ray.family.speed ** 2 + energy * F * ray.radialVelocity;
  const kind = Math.abs(jacobian) < 1e-9 ? 'fold' : jacobian > 0 ? 'before' : 'after';
  return { x, y, vx, vy, r, t, W, S: W - ray.family.phaseEnergy * t, s, kind };
}

export function createOrbitRay(speed, angle, samples = 0) {
  const family = orbitFamily(speed), vx0 = speed * Math.cos(angle), vy0 = speed * Math.sin(angle);
  const root = Math.sqrt(SOURCE_RADIUS);
  const ray = { family, angle, vx0, vy0, ux1: root * vy0 / 2, uy1: -root * vx0 / 2,
    c: SOURCE_RADIUS * speed * speed / 4, b: -SOURCE_RADIUS * vx0 / 2, radialVelocity: -vx0 };
  ray.foldS = Math.atan2(speed * speed, -family.energy * ray.radialVelocity / family.omega) / family.omega;
  // The first periapsis is found analytically, so a narrow close encounter
  // cannot fall between samples. Only near-collisions with r = 0 terminate.
  const B = SOURCE_RADIUS - family.a, D = ray.b / family.omega;
  const eccentricRadius = Math.hypot(B, D);
  const angularMomentum = SOURCE.x * vy0;
  // h² / [mu (1 + e)] avoids subtracting nearly equal radii on tight passes.
  ray.periapsis = angularMomentum ** 2 / (MU * (1 + eccentricRadius / family.a));
  ray.hitCore = ray.periapsis <= CORE_RADIUS;
  ray.maxS = family.periodS;
  if (ray.hitCore) {
    const periAngle = ((Math.atan2(D, B) + Math.PI) % TAU + TAU) % TAU;
    let lo = 0, hi = periAngle / (2 * family.omega);
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (orbitPoint(ray, mid).r > CORE_RADIUS) lo = mid; else hi = mid;
    }
    ray.maxS = (lo + hi) / 2;
  }
  const end = orbitPoint(ray, ray.maxS);
  ray.maxT = end.t; ray.maxW = end.W;
  if (samples > 0) {
    const count = Math.max(16, Math.round(samples));
    ray.table = { count, t: new Float64Array(count + 1), W: new Float64Array(count + 1) };
    for (let i = 0; i <= count; i++) {
      const point = orbitPoint(ray, ray.maxS * i / count);
      ray.table.t[i] = point.t; ray.table.W[i] = point.W;
    }
  }
  return ray;
}

// Monotone inversion, bracketed even at an apocentre with zero radial speed.
// A table only narrows the bracket; positions still use the analytic solution.
function parameterAt(ray, value, key) {
  const maximum = key === 'W' ? ray.maxW : ray.maxT;
  if (!Number.isFinite(value) || value < -1e-10 || value > maximum + 1e-9) return null;
  if (value <= 0) return 0;
  if (value >= maximum) return ray.maxS;
  let lo = 0, hi = ray.maxS;
  if (ray.table) {
    let left = 0, right = ray.table.count;
    const values = ray.table[key];
    while (right - left > 1) {
      const mid = (left + right) >> 1;
      if (values[mid] < value) left = mid; else right = mid;
    }
    lo = ray.maxS * left / ray.table.count; hi = ray.maxS * right / ray.table.count;
  }
  let s = (lo + hi) / 2;
  for (let i = 0; i < 48; i++) {
    const p = orbitPoint(ray, s), error = p[key] - value;
    if (Math.abs(error) < 2e-12 * Math.max(1, maximum)) return s;
    if (error < 0) lo = s; else hi = s;
    const derivative = key === 'W' ? 2 * (ray.family.energy * p.r + MU) : p.r;
    const next = s - error / derivative;
    s = Number.isFinite(next) && next > lo && next < hi ? next : (lo + hi) / 2;
  }
  return (lo + hi) / 2;
}

export function orbitAtAction(ray, W) {
  const s = parameterAt(ray, W, 'W');
  return s === null ? null : orbitPoint(ray, s);
}

export function orbitAtTime(ray, t) {
  const s = parameterAt(ray, t, 't');
  return s === null ? null : orbitPoint(ray, s);
}

export function orbitCaustic(speed) {
  const family = orbitFamily(speed), a = 2 * family.a - SOURCE_RADIUS / 2;
  return { x: SOURCE.x / 2, y: 0, a, b: Math.sqrt(a * a - SOURCE_RADIUS ** 2 / 4) };
}

// Fixed energy, at most one circuit. Both square roots of B and both roots
// of the boundary quadratic are needed: there can be FOUR arrival routes.
export function orbitBranches(x, y, speed) {
  const family = orbitFamily(speed), r = Math.hypot(x, y);
  if (r <= CORE_RADIUS) return { kind: 'core', branches: [], blocked: 0 };
  if (Math.hypot(x - SOURCE.x, y - SOURCE.y) < 1e-7) return { kind: 'source', branches: [], blocked: 0 };
  const rootX = Math.sqrt(Math.max(0, (r + x) / 2));
  const rootY = (y < 0 ? -1 : 1) * Math.sqrt(Math.max(0, (r - x) / 2));
  const A = 2 * family.a, constant = r + SOURCE_RADIUS - A;
  const d0 = Math.sqrt(SOURCE_RADIUS) * rootY;
  const discriminant = d0 * d0 - A * constant;
  const tolerance = 2e-12 * Math.max(1, A * A, d0 * d0);
  if (discriminant < -tolerance) return { kind: 'none', branches: [], blocked: 0 };
  const fold = Math.abs(discriminant) <= tolerance, rootD = Math.sqrt(Math.max(0, discriminant));
  const branches = []; let blocked = 0;
  for (const sign of [1, -1]) {
    const ubx = sign * rootX, uby = sign * rootY, d = sign * d0;
    for (const root of fold ? [0] : [-rootD, rootD]) {
      const C = (d + root) / A;
      if (C <= -1 || C >= 1) continue;
      const s = Math.acos(clamp(C, -1, 1)) / family.omega;
      const F = Math.sin(family.omega * s) / family.omega;
      const ux1 = ubx / F, uy1 = (uby - Math.sqrt(SOURCE_RADIUS) * C) / F;
      const vx = -2 * uy1 / Math.sqrt(SOURCE_RADIUS), vy = 2 * ux1 / Math.sqrt(SOURCE_RADIUS);
      const ray = createOrbitRay(speed, Math.atan2(vy, vx));
      if (s > ray.maxS + 1e-9) { blocked++; continue; }
      const end = orbitPoint(ray, s);
      if (branches.some(branch => Math.abs(branch.s - s) < 1e-7
        && Math.hypot(branch.ray.vx0 - ray.vx0, branch.ray.vy0 - ray.vy0) < 1e-7)) continue;
      branches.push({ ray, s, t: end.t, W: end.W, px: end.vx, py: end.vy,
        kind: fold ? 'fold' : end.kind, clockwise: SOURCE.x * ray.vy0 > 0 });
    }
  }
  branches.sort((a, b) => a.t - b.t);
  return { kind: branches.length ? fold ? 'fold' : 'rays' : blocked ? 'blocked' : 'none', branches, blocked };
}

export function orbitFan(speed, count = 32, samples = 0) {
  return Array.from({ length: count }, (_, i) => createOrbitRay(speed, TAU * i / count, samples));
}
