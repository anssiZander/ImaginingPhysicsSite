import { add, clamp, cross, dot, frame, scale, tangentVector, wrapPi } from './math.js';
import { geodesicEndpoint } from './surface.js';
import { separationConnector } from './deviation.js';

const ease = x => x * x * (3 - 2 * x);
const magnitude = v => Math.hypot(...v);

// Components in a parallel frame: v/|v| and its positively rotated normal
// inside the tangent plane. Along each geodesic both basis vectors are parallel.
export function vectorInVelocityFrame(point, components) {
  return add(scale(tangentVector(point.latitude, point.longitude, point.angle), components[0]),
    scale(tangentVector(point.latitude, point.longitude, point.angle + Math.PI / 2), components[1]));
}

export function separationFields(surface, particles) {
  // One oriented field xi = d sigma / d lambda along the connecting geodesic:
  // lambda = 0 at yellow (1), lambda = 1 at teal (0). Its endpoint values live
  // in different tangent planes, but share the same orientation and length.
  const connector = separationConnector(surface, particles[1], particles[0]);
  return particles.map((p, i) => {
    const angle = (i ? connector.angle : connector.points.at(-1).angle) - p.angle;
    return { components: [connector.length * Math.cos(angle), connector.length * Math.sin(angle)], valid: connector.valid };
  });
}

// Differentiate this same oriented xi field along each boundary geodesic,
// after transporting nearby time samples to that endpoint's tangent plane.
// This measures finite separation; the Jacobi equation is its small-gap limit.
export function deviationDerivatives(surface, particles, speed, arcStep = surface.config.deviation.construction.derivativeArcStep) {
  const samples = [-1, 0, 1].map(sign => separationFields(surface,
    particles.map(p => geodesicEndpoint(surface, p, p.angle, sign * arcStep))));
  const dt = arcStep / speed;
  return particles.map((p, i) => {
    const [minus, center, plus] = samples.map(sample => sample[i].components);
    const first = center.map((_, k) => (plus[k] - minus[k]) / (2 * dt));
    const second = center.map((value, k) => (plus[k] - 2 * value + minus[k]) / (dt * dt));
    const curvature = surface.principal(p.latitude).gaussian;
    const prediction = [0, -curvature * speed * speed * center[1]];
    return { xi: center, first, second, prediction, curvature, valid: samples.every(s => s[i].valid) };
  });
}

// Transport the teal velocity along the current teal -> yellow connector.
// Its angle relative to the connector's geodesic tangent is constant. This
// transports the vector without interpolating or aiming it at yellow's v.
export function transportedNeighborVelocity(surface, particles, fraction = 1, connector = separationConnector(surface, ...particles)) {
  const [source, target] = particles, t = clamp(fraction, 0, 1);
  if (!connector.valid) return null;
  if (t === 0) return { ...source };
  const along = geodesicEndpoint(surface, source, connector.angle, connector.length * t);
  const angle = source.angle + wrapPi(along.angle - connector.angle);
  // Share the exact original endpoints, including the connector solver's tiny
  // endpoint tolerance, so the final arrows have precisely the same tail.
  if (t === 1) {
    // Near a pole the solver endpoint can use a different longitude chart.
    // Re-express the transported world vector in the destination's own basis.
    const vector = tangentVector(along.latitude, along.longitude, angle), basis = frame(target.latitude, target.longitude);
    return { ...target, angle: Math.atan2(dot(vector, basis.north), dot(vector, basis.east)) };
  }
  return { ...along, angle };
}

export function neighborVelocityComparison(surface, particles, speed, connector = separationConnector(surface, ...particles)) {
  const transported = transportedNeighborVelocity(surface, particles, 1, connector);
  if (!transported) return null;
  const angle = wrapPi(transported.angle - particles[1].angle);
  // Components in yellow's parallel velocity frame; xi points yellow -> teal.
  const relative = [speed * (Math.cos(angle) - 1), speed * Math.sin(angle)];
  return { transported, angle, relative, magnitude: magnitude(relative) };
}

export function sweptStrip(surface, start, distance, rows = surface.config.deviation.construction.stripRows, columns = surface.config.deviation.construction.stripColumns) {
  const grid = [], cells = [];
  let area = 0, curvatureIntegral = 0, valid = true;
  for (let i = 0; i <= rows; i++) {
    const ends = start.map(p => geodesicEndpoint(surface, p, p.angle, distance * i / rows));
    const connector = separationConnector(surface, ...ends);
    valid &&= connector.valid;
    grid.push(Array.from({ length: columns + 1 }, (_, j) => geodesicEndpoint(surface, ends[0], connector.angle, connector.length * j / columns)));
  }
  const triangle = points => {
    const positions = points.map(p => surface.position(p.latitude, p.longitude));
    const [a, b, c] = positions;
    const amount = surface.isTorus ? magnitude(cross(add(b, scale(a, -1)), add(c, scale(a, -1)))) / 2
      : 2 * Math.atan2(Math.abs(dot(a, cross(b, c))), 1 + dot(a, b) + dot(b, c) + dot(c, a));
    const curvature = points.reduce((sum, p) => sum + surface.principal(p.latitude).gaussian, 0) / 3;
    cells.push({ points, curvature }); area += amount; curvatureIntegral += amount * curvature;
  };
  for (let i = 0; i < rows; i++) for (let j = 0; j < columns; j++) {
    triangle([grid[i][j], grid[i + 1][j], grid[i + 1][j + 1]]);
    triangle([grid[i][j], grid[i + 1][j + 1], grid[i][j + 1]]);
  }
  return { cells, grid, area, curvatureIntegral, valid };
}

export class DeviationConstruction {
  constructor(model) {
    this.model = model;
    this.config = model.config.deviation.construction;
    this.enabled = false; this.automatic = false;
    this.stepSize = this.config.stepSize;
    model.construction = this;
    this.reset();
  }
  reset() {
    this.phase = 'ready'; this.progress = 0; this.phaseComplete = true;
    this.playing = false; this.hold = 0; this.completedSteps = 0;
    this.start = null; this.strip = null;
    this.stopReason = null;
    this.comparison = this.enabled ? neighborVelocityComparison(this.model.surface, this.model.particles, this.model.config.deviation.speed, this.model.connector) : null;
  }
  setEnabled(enabled) {
    this.model.pause(); this.enabled = enabled; this.reset();
  }
  setStepSize(value) { this.stepSize = clamp(value, this.config.minStep, this.config.maxStep); }
  pause() { this.playing = false; }
  get velocityDecomposition() {
    const previous = this.start?.velocityComparison;
    const deltaTime = this.start ? this.model.time - this.start.time : 0;
    if (!previous || !this.comparison || deltaTime <= 1e-10) return null;
    // Yellow's velocity frame is parallel along its geodesic. Keeping the old
    // components carries the previous relative velocity to the current point.
    const transportedPrevious = [...previous.relative], current = [...this.comparison.relative];
    const extra = current.map((value, i) => value - transportedPrevious[i]);
    return { transportedPrevious, current, extra, deltaTime,
      averageAcceleration: extra.map(value => value / deltaTime) };
  }
  get transportFraction() {
    return this.phase === 'transport' ? ease(clamp(this.progress / this.config.transportMoveFraction, 0, 1)) : 0;
  }
  get areaRelation() {
    const split = this.velocityDecomposition, strip = this.strip;
    if (!split || !strip?.valid || strip.area <= 1e-12) return null;
    const yellow = this.model.particles[1], endpoint = this.model.connector.points.at(-1);
    // The connector arrives teal -> yellow. Reverse its tangent, then take
    // the transverse component to orient xi-perp from yellow toward teal.
    const transverseSign = Math.sign(Math.sin(endpoint.angle + Math.PI - yellow.angle));
    return { area: strip.area, curvatureIntegral: strip.curvatureIntegral,
      averageGaussianCurvature: strip.curvatureIntegral / strip.area,
      predictedExtraTransverse: -this.model.config.deviation.speed * strip.curvatureIntegral,
      measuredExtraTransverse: split.extra[1] * transverseSign };
  }
  get comparisonReveal() {
    return this.phase === 'transport' ? ease(clamp((this.progress - this.config.transportMoveFraction) / (1 - this.config.transportMoveFraction), 0, 1)) : 0;
  }
  sampleTransport() {
    return this.phase === 'transport'
      ? transportedNeighborVelocity(this.model.surface, this.model.particles, this.transportFraction, this.model.connector) : null;
  }
  get terminal() {
    const stopped = !!this.stopReason || ['complete', 'local-limit', 'connector-limit'].includes(this.model.state);
    return stopped && ['ready', 'transport'].includes(this.phase) && this.phaseComplete;
  }
  toggle() {
    if (this.playing) { this.pause(); if (this.model.state === 'running') this.model.state = 'paused'; return; }
    if (this.terminal) return;
    if (this.phaseComplete) this.nextPhase();
    else this.playing = true;
  }
  nextPhase() {
    if (this.terminal) { this.playing = false; return; }
    this.phase = this.phase === 'move' ? 'transport' : 'move';
    this.phaseComplete = false; this.progress = this.hold = 0; this.playing = true;
    if (this.phase === 'move') {
      const m = this.model;
      this.start = { particles: m.particles.map(p => ({ ...p })), distance: m.distance, time: m.time,
        connector: separationConnector(m.surface, ...m.particles) };
      this.start.velocityComparison = neighborVelocityComparison(m.surface, m.particles, m.config.deviation.speed, this.start.connector);
      this.length = Math.min(this.stepSize, m.config.deviation.maxDistance - m.distance);
      this.strip = null;
    }
  }
  advancePlayback(seconds) {
    if (!this.enabled || !this.playing || seconds <= 0) return;
    let remaining = seconds * this.model.playbackRate;
    while (remaining > 1e-10 && this.playing) {
      if (this.phaseComplete) {
        const dt = Math.min(remaining, this.config.automaticHoldSeconds - this.hold);
        this.hold += dt; remaining -= dt;
        if (this.hold >= this.config.automaticHoldSeconds - 1e-10) this.nextPhase();
        continue;
      }
      const duration = this.config.phaseSeconds[this.phase];
      const dt = Math.min(remaining, (1 - this.progress) * duration);
      this.progress = Math.min(1, this.progress + dt / duration); remaining -= dt;
      if (this.phase === 'move') {
        const m = this.model, target = this.start.distance + this.length * ease(this.progress);
        m.state = 'running';
        m.advance(Math.max(0, target - m.distance) / m.config.deviation.speed);
        if (m.state !== 'running') { this.stopReason = m.state; this.playing = false; this.progress = 1; }
        else m.state = 'paused';
        this.comparison = neighborVelocityComparison(m.surface, m.particles, m.config.deviation.speed, m.connector);
        this.strip = sweptStrip(m.surface, this.start.particles, m.distance - this.start.distance);
        if (!this.strip.valid || !this.comparison) { this.stopReason = 'connector-limit'; this.playing = false; this.progress = 1; }
      }
      if (this.progress >= 1 - 1e-10) {
        this.progress = 1; this.phaseComplete = true;
        if (this.phase === 'transport') this.completedSteps++;
        if (!this.automatic) this.playing = false;
      }
    }
  }
  diagnostics() {
    return { enabled: this.enabled, phase: this.phase, progress: this.progress, phaseComplete: this.phaseComplete,
      playing: this.playing, automatic: this.automatic, completedSteps: this.completedSteps, stepSize: this.stepSize,
      startTime: this.start?.time ?? null, deltaTime: this.start ? this.model.time - this.start.time : 0,
      area: this.strip?.area ?? 0, curvatureIntegral: this.strip?.curvatureIntegral ?? 0, areaRelation: this.areaRelation,
      velocityComparison: this.comparison, velocityDecomposition: this.velocityDecomposition, transportedVelocity: this.sampleTransport(),
      transportFraction: this.transportFraction, comparisonReveal: this.comparisonReveal, stopReason: this.stopReason };
  }
}
