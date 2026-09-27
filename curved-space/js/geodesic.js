import { CONFIG } from './config.js';
import { Surface } from './surface.js';
import { add, clamp, dot, frame, normalize, radians, scale, tangentVector } from './math.js';

const smooth = t => { const x = clamp(t, 0, 1); return x * x * (3 - 2 * x); };
const mix = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);

// Closest-point retraction of a short ambient tangent step. This constructs
// the path itself; it does not call the exact/RK4 geodesic solver.
export function retractToSurface(surface, position) {
  const longitude = Math.atan2(position[0], position[2]);
  const rho = Math.hypot(position[0], position[2]);
  const latitude = Math.atan2(position[1], surface.isTorus ? rho - surface.R : rho);
  return { latitude, longitude };
}

export function projectedStep(surface, start, velocity, length, samples = CONFIG.geodesic.pathSamplesPerStep) {
  const origin = surface.position(start.latitude, start.longitude);
  const at = fraction => retractToSurface(surface, add(origin, scale(velocity, length * fraction)));
  const end = at(1), normal = frame(end.latitude, end.longitude).normal;
  const normalScalar = dot(velocity, normal), normalComponent = scale(normal, normalScalar);
  const tangent = add(velocity, scale(normalComponent, -1)), tangentLength = Math.hypot(...tangent);
  if (tangentLength < 1e-8) throw new Error('Geodesic step is too large to project the velocity. Reduce geodesic step size.');
  const nextVelocity = scale(tangent, 1 / tangentLength);
  const path = Array.from({ length: samples + 1 }, (_, i) => at(i / samples));
  return { start: { ...start }, end, origin, oldVelocity: [...velocity], normal, normalScalar, normalComponent, tangent, tangentLength, nextVelocity, length, path, at };
}

export class GeodesicConstruction {
  constructor(config = CONFIG) {
    this.config = config;
    this.isGeodesic = true;
    this.surface = new Surface(config.surface.type, config);
    this.torusStartDeg = config.surface.torus.startTubeDeg;
    this.directionDeg = config.geodesic.directionDeg;
    this.steps = { sphere: config.geodesic.sphereStep, torus: config.geodesic.torusStep };
    this.automatic = config.geodesic.automatic;
    this.playbackRate = config.geodesic.playbackRate;
    this.reset();
  }
  get stepSize() { return this.steps[this.surface.type]; }
  get phaseDuration() { return this.config.geodesic.phaseSeconds[this.phase] ?? 0; }
  get phaseComplete() { return this.phase === 'ready' || this.elapsed >= this.phaseDuration; }
  get complete() { return this.completedSteps >= this.config.geodesic.maxSteps; }
  get latitude() { return this.sample().point.latitude; }
  get longitude() { return this.sample().point.longitude; }
  get currentPoint() { return this.sample().point; }
  reset() {
    this.point = { latitude: radians(this.surface.isTorus ? this.torusStartDeg : this.config.initial.latitudeDeg), longitude: radians(this.config.initial.longitudeDeg) };
    this.velocity = tangentVector(this.point.latitude, this.point.longitude, radians(this.directionDeg));
    this.trail = [{ ...this.point }];
    this.history = [];
    this.completedSteps = 0;
    this.phase = 'ready'; this.elapsed = 0; this.hold = 0;
    this.playing = false; this.step = null;
  }
  setSurface(type) { this.surface = new Surface(type, this.config); this.reset(); }
  setTorusStart(angle) { this.torusStartDeg = angle; this.reset(); }
  setParameters({ directionDeg = this.directionDeg, stepSize = this.stepSize }) {
    this.directionDeg = directionDeg;
    const c = this.config.geodesic;
    this.steps[this.surface.type] = clamp(stepSize, c.minStep, this.surface.isTorus ? c.torusMaxStep : c.sphereMaxStep);
    this.reset(); // Slider input previews only. A deliberate action starts the next phase.
  }
  setAutomatic(value) { this.automatic = value; this.pause(); }
  setPlaybackRate(value) { this.playbackRate = clamp(value, this.config.geodesic.minPlaybackRate, this.config.geodesic.maxPlaybackRate); }
  advancePlayback(seconds) { this.advance(seconds * this.playbackRate); }
  pause() { this.playing = false; }
  beginPhase() {
    if (this.complete) return;
    if (this.phase === 'ready' || this.phase === 'project') {
      this.step = projectedStep(this.surface, this.point, this.velocity, this.stepSize, this.config.geodesic.pathSamplesPerStep);
      this.phase = 'move';
    } else this.phase = this.phase === 'move' ? 'resolve' : 'project';
    this.elapsed = 0; this.hold = 0;
  }
  next() {
    if (this.playing || this.complete) return;
    if (this.phaseComplete) this.beginPhase();
    this.playing = true;
  }
  toggle() { if (this.playing) this.pause(); else this.next(); }
  finishPhase() {
    if (this.phase === 'project') {
      // Freeze the construction at this point. Later steps must not rotate or
      // rescale the old arrows and their projection components.
      const s = this.step;
      this.history.push({ index: this.completedSteps + 1, start: { ...s.start }, end: { ...s.end },
        old: [...s.oldVelocity], tangent: [...s.tangent], normal: [...s.normal],
        normalComponent: [...s.normalComponent], normalScalar: s.normalScalar,
        next: [...s.nextVelocity], length: s.length });
      const limit = this.config.geodesic.history.maxSteps;
      if (this.history.length > limit) this.history.splice(0, this.history.length - limit);
      this.point = { ...this.step.end }; this.velocity = [...this.step.nextVelocity];
      this.trail.push(...this.step.path.slice(1));
      if (this.trail.length > this.config.geodesic.maxTrailPoints) this.trail.splice(0, this.trail.length - this.config.geodesic.maxTrailPoints);
      this.completedSteps++;
    }
    if (!this.automatic || this.complete) this.playing = false;
    this.hold = this.config.geodesic.automaticHoldSeconds;
  }
  advance(seconds) {
    let remaining = Math.max(0, seconds);
    while (this.playing && remaining > 1e-12) {
      if (this.phaseComplete) {
        const used = Math.min(remaining, this.hold);
        this.hold -= used; remaining -= used;
        if (this.hold > 1e-12) break;
        this.beginPhase();
      }
      const used = Math.min(remaining, this.phaseDuration - this.elapsed);
      this.elapsed += used; remaining -= used;
      if (this.phaseComplete) this.finishPhase();
    }
  }
  sample() {
    const s = this.step, c = this.config.geodesic;
    const progress = this.phaseDuration ? clamp(this.elapsed / this.phaseDuration, 0, 1) : 0;
    const travel = this.phase === 'move' ? smooth(progress) : 1;
    const point = s ? s.at(travel) : { ...this.point };
    const f = frame(point.latitude, point.longitude), old = s?.oldVelocity ?? this.velocity;
    const normalScalar = dot(old, f.normal), normalComponent = scale(f.normal, normalScalar);
    const tangent = add(old, scale(normalComponent, -1)), tangentLength = Math.hypot(...tangent);
    const next = normalize(tangent);
    point.angle = Math.atan2(dot(next, f.north), dot(next, f.east));
    const remove = this.phase === 'project' ? smooth(progress / c.projectionFraction) : 0;
    const restore = this.phase === 'project' ? smooth((progress - c.projectionFraction) / (1 - c.projectionFraction)) : 0;
    const displayed = mix(add(old, scale(normalComponent, -remove)), next, restore);
    const components = this.phase === 'resolve' ? smooth(progress) : this.phase === 'project' ? 1 : 0;
    const activePath = s && !(this.phase === 'project' && this.phaseComplete)
      ? [...s.path.slice(1, Math.floor(travel * c.pathSamplesPerStep) + 1), point] : [];
    return { point, normal: f.normal, old, tangent, tangentLength, normalScalar, normalComponent, next, displayed, progress, travel, remove, restore, components, path: [...this.trail, ...activePath] };
  }
  diagnostics() {
    const v = this.sample();
    return { phase: this.phase, progress: v.progress, phaseComplete: this.phaseComplete, playing: this.playing, automatic: this.automatic, playbackRate: this.playbackRate, completedSteps: this.completedSteps, stepSize: this.stepSize, directionDeg: this.directionDeg, point: v.point, oldVelocity: v.old, tangent: v.tangent, normal: v.normal, normalComponent: v.normalComponent, normalScalar: v.normalScalar, nextVelocity: v.next, displayedVelocity: v.displayed, tangentError: dot(v.tangent, v.normal), speed: Math.hypot(...v.next), trailPoints: v.path.length, historySteps: this.history.length };
  }
}
