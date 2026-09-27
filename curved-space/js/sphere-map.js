import { CONFIG } from './config.js';
import { clamp, degrees, radians } from './math.js';

// Coordinates on the polar stereographic plane, with a fixed orientation.
// Both pole choices preserve orientation: east/north map to a rotated orthonormal basis.
export function polarPoint(point, pole = 1) {
  const r = Math.tan((Math.PI / 2 - pole * point.latitude) / 2);
  if (!Number.isFinite(r) || r > 1e8) return null; // The opposite pole is at infinity.
  return [r * Math.sin(point.longitude), -pole * r * Math.cos(point.longitude)];
}

export function polarInverse([x, y], pole = 1) {
  const r = Math.hypot(x, y);
  return { latitude: pole * (Math.PI / 2 - 2 * Math.atan(r)), longitude: r ? Math.atan2(x, -pole * y) : 0 };
}

// Return CSS-pixel directions: north is up. No anisotropic canvas scaling.
export function sphereMapDirection(point, angle, polar = false, pole = 1) {
  const direction = angle + (polar ? pole * point.longitude : 0);
  return [Math.cos(direction), -Math.sin(direction)];
}

export function polarScreenPoint(point, layout, pole = 1) {
  const p = polarPoint(point, pole);
  return p ? [layout.width / 2 + p[0] * layout.scale, layout.height / 2 - p[1] * layout.scale, 0] : null;
}

export function clipMapSegment(a, b, width, height) {
  if (!a || !b) return null;
  let start = 0, end = 1;
  for (const [axis, limit] of [[0, width], [1, height]]) for (const sign of [-1, 1]) {
    const f = sign < 0 ? a[axis] : limit - a[axis];
    const g = sign < 0 ? b[axis] : limit - b[axis];
    if (f < 0 && g < 0) return null;
    if (f < 0) start = Math.max(start, f / (f - g));
    if (g < 0) end = Math.min(end, f / (f - g));
    if (start > end) return null;
  }
  const at = t => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 0];
  return [at(start), at(end)];
}

export class SphereMapView {
  constructor(config = CONFIG.sphereMap) {
    this.config = config;
    this.enabled = config.polarOnStart;
    this.pole = 1;
    this.radius = this.targetRadius = config.defaultRadius;
  }
  frame(point) {
    this.pole = point.latitude < 0 ? -1 : 1;
    const r = Math.hypot(...polarPoint(point, this.pole));
    this.radius = this.targetRadius = clamp(r * this.config.fitMargin, this.config.minRadius, this.config.maxRadius);
  }
  toggle(point) {
    this.enabled = !this.enabled;
    if (this.enabled) this.frame(point);
  }
  zoom(delta) {
    this.targetRadius = clamp(this.targetRadius * Math.exp(delta * this.config.zoomSensitivity), this.config.minRadius, this.config.maxRadius);
  }
  update(seconds) { this.radius += (this.targetRadius - this.radius) * (1 - Math.exp(-this.config.zoomEasingRate * seconds)); }
  layout(width, height) {
    return { width, height, scale: Math.max(1, Math.min(width, height) - 2 * this.config.paddingPx) / (2 * this.radius) };
  }
  latitudeGridStep() {
    const target = degrees(2 * Math.atan(this.radius)) / this.config.latitudeGridRings;
    const steps = this.config.latitudeGridStepsDeg;
    return radians(steps.find(step => step >= target) ?? steps.at(-1));
  }
}
