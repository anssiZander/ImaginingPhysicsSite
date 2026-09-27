import { CONFIG } from './config.js';
import { add, angularDistance, dot, frame, scale, TAU, tangentVector, wrapPi } from './math.js';

/** The coordinate names latitude/longitude are also used for torus tube/ring angles. */
export class Surface {
  constructor(type = 'sphere', config = CONFIG) {
    this.type = type;
    this.config = config;
    this.isTorus = type === 'torus';
    this.R = config.surface.torus.majorRadius;
    this.r = config.surface.torus.minorRadius;
    if (!(this.R > this.r && this.r > 0)) throw new Error('Torus radii must satisfy R > r > 0.');
    this.chartHeight = this.isTorus ? TAU : Math.PI;
    this.totalArea = this.isTorus ? TAU * TAU * this.R * this.r : 4 * Math.PI;
  }

  position(latitude, longitude, offset = 0) {
    const f = frame(latitude, longitude);
    if (!this.isTorus) return scale(f.normal, 1 + offset);
    return add([this.R * Math.sin(longitude), 0, this.R * Math.cos(longitude)], scale(f.normal, this.r + offset));
  }

  metric(latitude) {
    return this.isTorus ? { east: this.R + this.r * Math.cos(latitude), north: this.r } : { east: Math.cos(latitude), north: 1 };
  }

  principal(latitude) {
    // Positive-convex convention: eigenvalues of dN for the outward unit normal.
    // Other texts use -dN; reversing that convention flips both k values, not K.
    const east = this.isTorus ? Math.cos(latitude) / (this.R + this.r * Math.cos(latitude)) : 1;
    const north = this.isTorus ? 1 / this.r : 1;
    return { east, north, gaussian: east * north };
  }

  distance(a, b) {
    if (!this.isTorus) return angularDistance(a, b);
    const dv = wrapPi(b.latitude - a.latitude), du = wrapPi(b.longitude - a.longitude);
    const g = this.metric(a.latitude + dv / 2);
    return Math.hypot(g.north * dv, g.east * du);
  }

  signedDistance(p) {
    return this.isTorus ? Math.hypot(Math.hypot(p[0], p[2]) - this.R, p[1]) - this.r : Math.hypot(...p) - 1;
  }

  visible(point, eye) {
    const delta = point.map((x, i) => x - eye[i]), length = Math.hypot(...delta);
    const direction = scale(delta, 1 / length);
    // Labels also need self-occlusion on the torus; a normal-facing test alone is insufficient.
    let t = 0;
    for (let i = 0; i < 120 && t < length - 0.008; i++) {
      const d = this.signedDistance(add(eye, scale(direction, t)));
      if (d < 0.001) return false;
      t += Math.max(0.002, d * 0.8);
    }
    return t >= length - 0.008;
  }
}

/** Unit-speed geodesic. The sphere uses exact Cartesian great-circle motion,
 * so pole crossings never encounter a coordinate singularity. The torus uses RK4.
 */
export function geodesicEndpoint(surface, start, angle, distance) {
  if (!surface.isTorus) {
    const p = frame(start.latitude, start.longitude).normal;
    const v = tangentVector(start.latitude, start.longitude, angle);
    const c = Math.cos(distance), s = Math.sin(distance);
    const next = add(scale(p, c), scale(v, s)), velocity = add(scale(v, c), scale(p, -s));
    const latitude = Math.atan2(next[1], Math.hypot(next[0], next[2]));
    const longitude = Math.atan2(next[0], next[2]), f = frame(latitude, longitude);
    return { latitude, longitude, angle: Math.atan2(dot(velocity, f.north), dot(velocity, f.east)) };
  }
  let state = [start.latitude, start.longitude, angle];
  const steps = Math.max(1, Math.ceil(Math.abs(distance) / surface.config.surface.torus.geodesicStep));
  const h = distance / steps;
  const derivative = ([v, , beta]) => {
    const du = Math.cos(beta) / (surface.R + surface.r * Math.cos(v));
    return [Math.sin(beta) / surface.r, du, -Math.sin(v) * du];
  };
  const shifted = (x, k, amount) => x.map((value, i) => value + amount * k[i]);
  for (let i = 0; i < steps; i++) {
    const a = derivative(state), b = derivative(shifted(state, a, h / 2));
    const c = derivative(shifted(state, b, h / 2)), d = derivative(shifted(state, c, h));
    state = state.map((value, j) => value + h / 6 * (a[j] + 2 * b[j] + 2 * c[j] + d[j]));
  }
  return { latitude: state[0], longitude: state[1], angle: state[2] };
}
