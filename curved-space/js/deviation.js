import { CONFIG } from './config.js';
import { Surface, geodesicEndpoint } from './surface.js';
import { angularDistance, clamp, dot, frame, radians, wrapPi } from './math.js';

/** The short geodesic from a to b, including its initial tangent (the logarithm).
 * On the torus, shoot the exponential map and solve its two endpoint coordinates.
 * This is a local connector, not a claim about global shortest paths/cut loci.
 */
export function separationConnector(surface, a, b) {
  const c = surface.config.deviation;
  let length, angle, error = 0;
  if (!surface.isTorus) {
    length = angularDistance(a, b);
    const f = frame(a.latitude, a.longitude), target = frame(b.latitude, b.longitude).normal;
    angle = Math.atan2(dot(target, f.north), dot(target, f.east));
  } else {
    const dv = wrapPi(b.latitude - a.latitude), du = wrapPi(b.longitude - a.longitude);
    const g = surface.metric(a.latitude + dv / 2), targetMetric = surface.metric(b.latitude);
    let x = du * g.east, y = dv * g.north;
    const residual = (east, north) => {
      const end = geodesicEndpoint(surface, a, Math.atan2(north, east), Math.hypot(east, north));
      return [wrapPi(end.longitude - b.longitude) * targetMetric.east, wrapPi(end.latitude - b.latitude) * targetMetric.north];
    };
    for (let i = 0; i < c.connectorIterations; i++) {
      const f = residual(x, y);
      error = Math.hypot(...f);
      if (error < c.connectorTolerance) break;
      const h = c.connectorDifferenceStep, fx = residual(x + h, y), fy = residual(x, y + h);
      const a11 = (fx[0] - f[0]) / h, a21 = (fx[1] - f[1]) / h;
      const a12 = (fy[0] - f[0]) / h, a22 = (fy[1] - f[1]) / h;
      const det = a11 * a22 - a12 * a21;
      if (Math.abs(det) < 1e-10) break;
      const dx = (a22 * f[0] - a12 * f[1]) / det, dy = (a11 * f[1] - a21 * f[0]) / det;
      const trust = Math.min(1, c.connectorTrustStep / Math.hypot(dx, dy));
      x -= dx * trust; y -= dy * trust;
    }
    length = Math.hypot(x, y); angle = Math.atan2(y, x);
    error = Math.hypot(...residual(x, y));
  }
  const segments = Math.max(2, Math.ceil(length / c.connectorSampleStep));
  const points = Array.from({ length: segments + 1 }, (_, i) => geodesicEndpoint(surface, a, angle, length * i / segments));
  return { length, angle, points, error, valid: error < c.connectorTolerance * 10 };
}

/** Two finite geodesics plus a Jacobi field on their central reference geodesic.
 * j''(s) = -K(s)j(s), j(0)=epsilon, j'(0)=0, with s = speed * time.
 * Finite separation and the infinitesimal prediction are deliberately independent.
 */
export class GeodesicDeviation {
  constructor(config = CONFIG) {
    this.config = config;
    this.isDeviation = true;
    this.surface = new Surface(config.surface.type, config);
    this.torusStartDeg = config.surface.torus.startTubeDeg;
    this.separation = config.deviation.initialSeparation;
    this.directionDeg = config.deviation.directionDeg;
    this.playbackRate = config.deviation.playbackRate;
    this.comparisonEnabled = config.deviation.showOtherPath;
    this.reset();
  }
  get latitude() { return this.reference.latitude; }
  get longitude() { return this.reference.longitude; }
  get curvature() { return this.surface.principal(this.latitude).gaussian; }
  get acceleration() { return -this.curvature * this.config.deviation.speed ** 2 * this.jacobi; }
  get time() { return this.distance / this.config.deviation.speed; }

  reset() {
    const angle = radians(this.directionDeg);
    this.reference = {
      latitude: radians(this.surface.isTorus ? this.torusStartDeg : this.config.initial.latitudeDeg),
      longitude: radians(this.config.initial.longitudeDeg), angle,
    };
    this.start = { ...this.reference };
    // Shift perpendicular to the launch direction along a geodesic, then carry
    // the launch velocity by the same rotation as that connector's own tangent.
    this.particles = [-1, 1].map(sign => {
      const offsetAngle = angle + sign * Math.PI / 2;
      const point = geodesicEndpoint(this.surface, this.reference, offsetAngle, this.separation / 2);
      point.angle = angle + wrapPi(point.angle - offsetAngle);
      return point;
    });
    this.trails = this.particles.map(p => [{ ...p }]);
    this.distance = this.lastTrailDistance = 0;
    this.jacobi = this.separation;
    this.jacobiDerivative = 0;
    this.state = 'idle';
    this.measure();
    this.initialConnector = this.connector;
    this.construction?.reset();
  }

  setParameters({ separation = this.separation, directionDeg = this.directionDeg }) {
    const resume = this.state === 'running';
    this.separation = clamp(separation, this.config.deviation.minSeparation, this.config.deviation.maxSeparation);
    this.directionDeg = directionDeg;
    this.reset();
    if (resume) this.state = 'running';
  }
  setSurface(type) { this.surface = new Surface(type, this.config); this.reset(); }
  setTorusStart(angle) { this.torusStartDeg = angle; this.reset(); }
  setComparisonEnabled(enabled) {
    this.comparisonEnabled = enabled;
    if (enabled) { this.measure(); this.checkComparisonLimit(); }
    else if (['local-limit', 'connector-limit'].includes(this.state)) this.state = 'paused';
  }
  toggle() {
    if (this.construction?.enabled) { this.construction.toggle(); return; }
    if (this.state === 'running') this.state = 'paused';
    else {
      if (!['idle', 'paused'].includes(this.state)) this.reset();
      this.state = 'running';
    }
  }
  pause() { if (this.state === 'running') this.state = 'paused'; this.construction?.pause(); }
  restart() { this.reset(); if (this.construction?.enabled) this.construction.toggle(); else this.state = 'running'; }
  setPlaybackRate(value) { this.playbackRate = clamp(value, this.config.deviation.minPlaybackRate, this.config.deviation.maxPlaybackRate); }
  advancePlayback(seconds, trailSampleStep) {
    if (this.construction?.enabled) this.construction.advancePlayback(seconds);
    else this.advance(seconds * this.playbackRate, trailSampleStep);
  }
  measure() {
    this.connector = separationConnector(this.surface, this.particles[0], this.particles[1]);
    this.gap = this.connector.length;
  }

  checkComparisonLimit() {
    if (!this.connector.valid) this.state = 'connector-limit';
    else if (this.gap > this.config.deviation.localComparisonLimit || Math.abs(this.jacobi) > this.config.deviation.localComparisonLimit) this.state = 'local-limit';
  }

  step(h, trailSampleStep = this.config.deviation.trailSampleStep) {
    const p = this.reference;
    const midpoint = geodesicEndpoint(this.surface, p, p.angle, h / 2);
    const end = geodesicEndpoint(this.surface, p, p.angle, h);
    const k0 = this.curvature, km = this.surface.principal(midpoint.latitude).gaussian, k1 = this.surface.principal(end.latitude).gaussian;
    const j = this.jacobi, q = this.jacobiDerivative;
    // RK4 for the two-component Jacobi equation using curvature along the path.
    const a = [q, -k0 * j];
    const b = [q + h * a[1] / 2, -km * (j + h * a[0] / 2)];
    const c = [q + h * b[1] / 2, -km * (j + h * b[0] / 2)];
    const d = [q + h * c[1], -k1 * (j + h * c[0])];
    this.jacobi += h / 6 * (a[0] + 2 * b[0] + 2 * c[0] + d[0]);
    this.jacobiDerivative += h / 6 * (a[1] + 2 * b[1] + 2 * c[1] + d[1]);
    this.reference = end;
    this.particles = this.particles.map(point => geodesicEndpoint(this.surface, point, point.angle, h));
    this.distance += h;
    if (this.distance - this.lastTrailDistance >= trailSampleStep - 1e-12) {
      this.particles.forEach((point, i) => {
        this.trails[i].push({ ...point });
        if (this.trails[i].length > this.config.deviation.maxTrailPoints) this.trails[i].shift();
      });
      this.lastTrailDistance = this.distance;
    }
  }

  advance(seconds, trailSampleStep = this.config.deviation.trailSampleStep) {
    if (this.state !== 'running' || seconds <= 0) return;
    const c = this.config.deviation;
    let remaining = Math.min(seconds * c.speed, c.maxDistance - this.distance);
    while (remaining > 1e-12) {
      const h = Math.min(remaining, c.maxStep, trailSampleStep);
      this.step(h, trailSampleStep); remaining -= h;
      if (this.comparisonEnabled && Math.abs(this.jacobi) > c.localComparisonLimit) { this.state = 'local-limit'; break; }
    }
    // The hidden companion still advances, so toggling never resets either path.
    // Its local logarithm/Jacobi comparison need not constrain a solo geodesic.
    if (this.comparisonEnabled) { this.measure(); this.checkComparisonLimit(); }
    else { this.gap = NaN; this.connector = { valid: false, points: [], length: NaN, error: NaN }; }
    if (this.state === 'running' && this.distance >= c.maxDistance - 1e-10) this.state = 'complete';
  }

  diagnostics() {
    return {
      state: this.state, comparisonEnabled: this.comparisonEnabled, initialSeparation: this.separation, directionDeg: this.directionDeg,
      speed: this.config.deviation.speed, playbackRate: this.playbackRate, time: this.time, distance: this.distance,
      actualSeparation: this.gap, jacobi: this.jacobi, jacobiDerivative: this.jacobiDerivative,
      jacobiMagnitude: Math.abs(this.jacobi), gaussianCurvature: this.curvature,
      relativeAcceleration: this.acceleration,
      connectorError: this.connector.error, connectorValid: this.connector.valid,
      particles: this.particles.map(p => ({ ...p })), reference: { ...this.reference },
      trailPoints: this.trails.map(t => t.length),
    };
  }
}
