import { CONFIG } from './config.js';
import { clamp, TAU } from './math.js';

// Principal coordinates stay unchanged; rotate every rendered part together.
export function tidalToWorld(point, basis = CONFIG.tidal.principalDirections) {
  return [0, 1, 2].map(j => point.reduce((sum, x, i) => sum + x * basis[i][j], 0));
}

// Exact radial release from rest in Newtonian point-mass gravity.
// r/r0 = cos^2(eta), t = tau * (eta + sin(eta) cos(eta)).
// The linear Jacobi solutions share this trajectory: transverse scale r/r0;
// radial scale partial r(t,r0) / partial r0 at fixed GM, with zero initial rates.
export function radialFall(time, config = CONFIG.tidal) {
  const initialRadius = config.initialRadius, tau = 1 / Math.sqrt(2 * config.strength);
  const collapseTime = Math.PI / 2 * tau;
  if (!(initialRadius > 0 && config.strength > 0 && Math.abs(time) < collapseTime)) throw new RangeError('Point-mass fall requires positive radius/strength and time before the center is reached.');
  const target = Math.abs(time) / tau;
  let lo = 0, hi = Math.PI / 2;
  for (let i = 0; i < config.fallSolveIterations; i++) {
    const mid = (lo + hi) / 2;
    if (mid + Math.sin(mid) * Math.cos(mid) < target) lo = mid;
    else hi = mid;
  }
  const eta = time === 0 ? 0 : Math.sign(time) * (lo + hi) / 2;
  const s = Math.sin(eta), c = Math.cos(eta), f = eta + s * c;
  const transverse = c * c, transverseRate = -Math.tan(eta) / tau;
  const radial = transverse + 1.5 * f * Math.tan(eta);
  const radialRate = (s * c + 1.5 * f / transverse) / (2 * tau * transverse);
  const strength = config.strength / transverse ** 3;
  const eigenvalues = [2 * strength, -strength, -strength];
  const scales = [radial, transverse, transverse], rates = [radialRate, transverseRate, transverseRate];
  return {
    initialRadius, radius: initialRadius * transverse, radiusRatio: transverse,
    velocity: initialRadius * transverseRate, acceleration: -initialRadius * config.strength / transverse ** 2,
    gravitationalParameter: config.strength * initialRadius ** 3, collapseTime,
    eigenvalues, axes: scales.map((scale, i) => ({ scale, velocity: rates[i], acceleration: eigenvalues[i] * scale })),
  };
}

// A fixed spherical-coordinate grid as seen from the central falling observer.
// Its radial lines intersect the local transverse plane at x = r(t) tan(theta),
// hence their spacing contracts by exactly the same factor as both blue axes.
export function tidalGridMotion(time, config = CONFIG.tidal) {
  const fall = radialFall(time, config);
  return { offset: fall.initialRadius - fall.radius, velocity: -fall.velocity, acceleration: -fall.acceleration,
    radius: fall.radius, initialRadius: fall.initialRadius, transverseScale: fall.radiusRatio,
    angularSpacing: config.backgroundGrid.spacing / fall.initialRadius };
}

export function shellDirections(count, phase = 0) {
  if (!Number.isInteger(count) || count < 8 || count % 2) throw new Error('tidal.particlesPerShell must be even and at least 8.');
  // Explicit axis masses ensure every separation arrow ends on a test particle.
  const points = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const pairs = (count - 6) / 2, goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < pairs; i++) {
    const y = (i + 0.5) / pairs, r = Math.sqrt(1 - y * y), azimuth = i * goldenAngle + phase;
    const point = [r * Math.cos(azimuth), y, r * Math.sin(azimuth)];
    points.push(point, point.map(x => -x)); // Exact antipodal symmetry: no center-of-mass drift.
  }
  return points;
}

export class TidalForces {
  constructor(config = CONFIG) {
    this.config = config;
    this.isTidal = true;
    // Reject invalid durations on startup instead of reaching the source singularity.
    radialFall(config.tidal.duration, config.tidal);
    this.playbackRate = config.tidal.playbackRate;
    this.shellCount = config.tidal.initialShells;
    this.shells = config.tidal.shellRadii.map((radius, i) => ({ radius, directions: shellDirections(config.tidal.particlesPerShell, i * TAU / Math.sqrt(2)) }));
    this.reset();
  }
  get motion() {
    if (this.motionTime !== this.time) { this.motionTime = this.time; this.motionCache = radialFall(this.time, this.config.tidal); }
    return this.motionCache;
  }
  get eigenvalues() { return this.motion.eigenvalues; }
  get axes() { return this.motion.axes; }
  get scales() { return this.axes.map(axis => axis.scale); }
  get particleCount() { return this.shellCount * this.config.tidal.particlesPerShell; }
  reset() { this.time = 0; this.state = 'idle'; }
  pause() { if (this.state === 'running') this.state = 'paused'; }
  toggle() {
    if (this.state === 'running') this.pause();
    else { if (this.state === 'complete') this.reset(); this.state = 'running'; }
  }
  setShellCount(value) { this.shellCount = clamp(Math.round(value), 1, this.shells.length); }
  setPlaybackRate(value) { this.playbackRate = clamp(value, this.config.tidal.minPlaybackRate, this.config.tidal.maxPlaybackRate); }
  // Only wall-clock playback uses the speed control; seek and physics use seconds.
  advancePlayback(seconds) { this.advance(seconds * this.playbackRate); }
  seek(time) {
    this.time = clamp(time, 0, this.config.tidal.duration);
    this.state = this.time === 0 ? 'idle' : this.time === this.config.tidal.duration ? 'complete' : 'paused';
  }
  advance(seconds) {
    if (this.state !== 'running' || seconds <= 0) return;
    this.time = Math.min(this.config.tidal.duration, this.time + seconds);
    if (this.time >= this.config.tidal.duration) this.state = 'complete';
  }
  // Positions and velocities share the same analytic solution as the GPU centers.
  particle(shell, index) {
    const s = this.shells[shell], axes = this.axes, initial = s.directions[index].map(x => x * s.radius);
    return {
      initial,
      position: initial.map((x, i) => x * axes[i].scale),
      velocity: initial.map((x, i) => x * axes[i].velocity),
      acceleration: initial.map((x, i) => x * axes[i].acceleration),
    };
  }
  diagnostics() {
    const axes = this.axes;
    return {
      state: this.state, time: this.time, duration: this.config.tidal.duration,
      playbackRate: this.playbackRate,
      fall: { radius: this.motion.radius, initialRadius: this.motion.initialRadius, velocity: this.motion.velocity,
        acceleration: this.motion.acceleration, gravitationalParameter: this.motion.gravitationalParameter },
      shellCount: this.shellCount, shellRadii: this.shells.slice(0, this.shellCount).map(s => s.radius),
      particlesPerShell: this.config.tidal.particlesPerShell, particleCount: this.particleCount,
      eigenvalues: this.eigenvalues, scales: axes.map(a => a.scale),
      rates: axes.map(a => a.velocity), volumeRatio: axes.reduce((volume, a) => volume * a.scale, 1),
      principalParticles: [0, 2, 4].map(i => this.particle(0, i)),
    };
  }
}
