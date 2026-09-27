import { CONFIG } from './config.js';
import { clamp, radians, TAU, wrapPi } from './math.js';
import { appendBoundary, measureRegion, measureTorusRegion } from './area.js';
import { loopPreview, loopWaypoints } from './loops.js';
import { Surface } from './surface.js';

/**
 * Levi-Civita parallel transport on the unit sphere and a ring torus.
 * alpha is the angle in the orthonormal (east, north) basis.
 * Along a path (latitude phi, longitude lambda): d alpha = -sin(phi) d lambda.
 * The same connection holds on the torus when phi is its tube angle and lambda
 * its ring angle. The metrics differ. Each coordinate-linear step is integrated
 * analytically, including diagonals.
 */
export function transportIncrement(latitude0, latitude1, longitudeDelta) {
  const halfDelta = (latitude1 - latitude0) / 2;
  const sinc = Math.abs(halfDelta) < 1e-8 ? 1 - halfDelta * halfDelta / 6 : Math.sin(halfDelta) / halfDelta;
  return -longitudeDelta * Math.sin((latitude0 + latitude1) / 2) * sinc;
}

export class Transport {
  constructor(config = CONFIG) {
    this.config = config;
    this.surface = new Surface(config.surface.type, config);
    this.torusStartDeg = config.surface.torus.startTubeDeg;
    this.initialAngle = radians(config.initial.directionDeg);
    this.loopSettings = { type: config.loop.type, widthDeg: config.loop.longitudeSpanDeg, heightDeg: config.loop.heightDeg, radiusDeg: config.loop.circleRadiusDeg };
    this.reset();
  }

  reset() {
    this.latitude = radians(this.surface.isTorus ? this.torusStartDeg : this.config.initial.latitudeDeg);
    this.longitude = radians(this.config.initial.longitudeDeg);
    this.rotation = 0;
    this.distance = 0;
    this.revision = (this.revision || 0) + 1;
    this.start = this.snapshot();
    this.boundary = [{ latitude: this.latitude, longitude: this.longitude }];
    this.pathRevision = (this.pathRevision || 0) + 1;
    this.regionCache = null;
    this.regionRevision = -1;
    this.trail = [this.snapshot()];
    this.history = [];
    this.lastHistoryDistance = 0;
    this.polarLimit = false;
    this.demo = null;
    this.waypoints = loopWaypoints(this.start, this.loopSettings, this.config, this.surface);
    this.preview = loopPreview(this.start, this.waypoints, this.config.loop.previewStepRadians);
  }

  get angle() { return this.initialAngle + this.rotation; }
  setSurface(type) {
    this.surface = new Surface(type, this.config);
    this.reset();
  }
  setTorusStart(degrees) { this.torusStartDeg = degrees; this.reset(); }
  snapshot() { return { latitude: this.latitude, longitude: this.longitude, rotation: this.rotation, distance: this.distance }; }

  setDirection(deg) {
    // Linearity of transport lets the initial direction change without erasing the path.
    this.initialAngle = radians(deg);
    this.revision++;
  }

  moveTo(latitude, longitude, forceSample = false) {
    const dlat = latitude - this.latitude, dlon = longitude - this.longitude;
    this.rotation += transportIncrement(this.latitude, latitude, dlon);
    const g = this.surface.metric((this.latitude + latitude) / 2);
    this.distance += Math.hypot(g.north * dlat, g.east * dlon);
    this.latitude = latitude;
    this.longitude = longitude;
    appendBoundary(this.boundary, this);
    this.pathRevision++;
    this.record(forceSample);
    this.revision++;
  }

  record(force = false) {
    const tail = this.trail[this.trail.length - 1];
    // Also limit longitude spacing so projected paths remain smooth near the poles.
    if (force || this.distance - tail.distance >= this.config.trail.sampleSpacingRadians || Math.abs(this.longitude - tail.longitude) > this.config.movement.maxLongitudeStepRadians) {
      this.trail.push(this.snapshot());
      if (this.trail.length > this.config.trail.maxPoints) this.trail.shift();
    }
    if (this.distance - this.lastHistoryDistance >= this.config.trail.historySpacingRadians) {
      this.history.push(this.snapshot());
      this.lastHistoryDistance = this.distance;
      if (this.history.length > this.config.trail.maxHistoryArrows) this.history.shift();
    }
  }

  move(east, north, seconds, speedDegPerSecond) {
    if ((!east && !north) || seconds <= 0) { this.polarLimit = false; return; }
    this.demo = null;
    const norm = Math.hypot(east, north);
    const distance = radians(speedDegPerSecond) * seconds;
    const steps = Math.max(1, Math.ceil(distance / this.config.movement.maxStepRadians));
    const latLimit = radians(this.config.movement.latitudeLimitDeg);
    this.polarLimit = false;
    for (let i = 0; i < steps; i++) {
      const d = distance / steps;
      const desiredLat = this.latitude + north / norm * d / this.surface.metric(this.latitude).north;
      const nextLat = this.surface.isTorus ? desiredLat : clamp(desiredLat, -latLimit, latLimit);
      this.polarLimit ||= nextLat !== desiredLat;
      const dlon = east / norm * d / this.surface.metric((this.latitude + nextLat) / 2).east;
      const lonSteps = Math.max(1, Math.ceil(Math.abs(dlon) / this.config.movement.maxLongitudeStepRadians));
      const lat0 = this.latitude, lon0 = this.longitude;
      for (let j = 1; j <= lonSteps; j++) this.moveTo(lat0 + (nextLat - lat0) * j / lonSteps, lon0 + dlon * j / lonSteps);
    }
  }

  startDemo() {
    this.reset();
    this.demo = { paused: false, leg: 0, waypoints: this.waypoints };
  }

  setLoop(settings) {
    this.loopSettings = { ...this.loopSettings, ...settings };
    this.reset();
  }

  completeDemo() {
    // Reuse the exact same transport integrator for immediate slider updates.
    this.startDemo();
    while (this.demo) this.advanceDemo(1, this.config.movement.maxSpeedDegPerSecond);
  }

  advanceDemo(seconds, speedDegPerSecond) {
    if (!this.demo || this.demo.paused) return;
    let remaining = radians(speedDegPerSecond) * this.config.loop.speedMultiplier * seconds;
    while (remaining > 1e-12 && this.demo) {
      const [lat, lon] = this.demo.waypoints[this.demo.leg];
      const dlat = lat - this.latitude, dlon = lon - this.longitude;
      const g = this.surface.metric(this.latitude);
      const length = Math.hypot(g.north * dlat, g.east * dlon);
      const travel = Math.min(remaining, length, this.config.movement.maxStepRadians);
      const f = length < 1e-12 ? 1 : travel / length;
      this.moveTo(this.latitude + f * dlat, this.longitude + f * dlon, f >= 1 - 1e-9);
      remaining -= travel;
      if (f >= 1 - 1e-9) {
        this.demo.leg++;
        if (this.demo.leg === this.demo.waypoints.length) this.demo = null;
      }
    }
  }

  get isClosed() {
    return !this.demo && this.distance >= radians(this.config.loop.minimumLengthForClosureDeg) && this.surface.distance(this.start, this) <= radians(this.config.loop.closureToleranceDeg);
  }

  get closedRegion() {
    if (!this.isClosed) return null;
    if (this.regionRevision !== this.pathRevision) {
      const geometry = this.surface.isTorus ? measureTorusRegion(this.boundary, this.surface) : { ...measureRegion(this.boundary), boundsArea: true };
      if (!this.surface.isTorus) geometry.curvatureIntegral = geometry.area;
      const gap = this.surface.distance(this.start, this);
      const closingLatitude = this.surface.isTorus ? this.latitude + wrapPi(this.start.latitude - this.latitude) : this.start.latitude;
      const closingRotation = transportIncrement(this.latitude, closingLatitude, wrapPi(this.start.longitude - this.longitude));
      const deflection = wrapPi(this.rotation + closingRotation);
      // Orientation is observable modulo 2π. Select the equivalent angle on the
      // same branch as the independently measured area, rather than copying it.
      const theta = geometry.boundsArea ? deflection + TAU * Math.round((geometry.curvatureIntegral - deflection) / TAU) : deflection;
      this.regionCache = { ...geometry, gap, approximate: gap > 1e-8, deflection, theta };
      this.regionRevision = this.pathRevision;
    }
    return this.regionCache;
  }

  get holonomy() { return this.closedRegion?.deflection ?? null; }
}
