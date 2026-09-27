export const TAU = Math.PI * 2;
export const radians = (degrees) => degrees * Math.PI / 180;
export const degrees = (angle) => angle * 180 / Math.PI;
export const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
export const wrapPi = (x) => ((x + Math.PI) % TAU + TAU) % TAU - Math.PI;
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const normalize = (a) => scale(a, 1 / (Math.hypot(...a) || 1));

export function frame(latitude, longitude) {
  const s = Math.sin(latitude), c = Math.cos(latitude);
  const sl = Math.sin(longitude), cl = Math.cos(longitude);
  return {
    normal: [c * sl, s, c * cl],
    east: [cl, 0, -sl],
    north: [-s * sl, c, -s * cl],
  };
}

export function tangentVector(latitude, longitude, angle) {
  const f = frame(latitude, longitude);
  return add(scale(f.east, Math.cos(angle)), scale(f.north, Math.sin(angle)));
}

export function angularDistance(a, b) {
  const x = frame(a.latitude, a.longitude).normal;
  const y = frame(b.latitude, b.longitude).normal;
  return Math.atan2(Math.hypot(...cross(x, y)), clamp(dot(x, y), -1, 1));
}

// Column-major matrices, matching WebGL uniforms.
export function perspective(fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2), nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}

export function lookAt(eye, target = [0, 0, 0], up = [0, 1, 0]) {
  const z = normalize(add(eye, scale(target, -1))), x = normalize(cross(up, z)), y = cross(z, x);
  return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1]);
}

export function multiply(a, b) {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    out[c * 4 + r] = a[r] * b[c * 4] + a[r + 4] * b[c * 4 + 1] + a[r + 8] * b[c * 4 + 2] + a[r + 12] * b[c * 4 + 3];
  }
  return out;
}

export function project(p, m, width, height) {
  const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
  const x = (m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12]) / w;
  const y = (m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]) / w;
  const z = (m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]) / w;
  return [(x + 1) * width / 2, (1 - y) * height / 2, z];
}

function clipCoordinates(p, m) {
  return [0, 1, 2, 3].map(i => m[i] * p[0] + m[i + 4] * p[1] + m[i + 8] * p[2] + m[i + 12]);
}

function clipToScreen(p, width, height) {
  return [(p[0] / p[3] + 1) * width / 2, (1 - p[1] / p[3]) * height / 2, p[2] / p[3]];
}

// Clip BEFORE the perspective divide. Close cameras can straddle a trail segment;
// projecting a point behind the eye first would flip it across the entire screen.
export function projectSegment(a, b, matrix, width, height) {
  const p = clipCoordinates(a, matrix), q = clipCoordinates(b, matrix);
  let start = 0, end = 1;
  for (const axis of [0, 1, 2]) for (const sign of [-1, 1]) {
    const f = p[3] + sign * p[axis], g = q[3] + sign * q[axis];
    if (f < 0 && g < 0) return null;
    if (f < 0) start = Math.max(start, f / (f - g));
    if (g < 0) end = Math.min(end, f / (f - g));
    if (start > end) return null;
  }
  const at = t => clipToScreen(p.map((v, i) => v + (q[i] - v) * t), width, height);
  return [at(start), at(end)];
}

export function projectVisible(p, matrix, width, height) {
  const c = clipCoordinates(p, matrix);
  if (c[3] <= 0 || c.slice(0, 3).some(v => Math.abs(v) > c[3])) return null;
  return clipToScreen(c, width, height);
}

// Sutherland-Hodgman clipping in homogeneous coordinates. A polygon can fill
// the screen even when none of its original corners are inside the frustum.
export function projectPolygon(points, matrix, width, height) {
  let polygon = points.map(p => clipCoordinates(p, matrix));
  for (const axis of [0, 1, 2]) for (const sign of [-1, 1]) {
    const input = polygon; polygon = [];
    if (!input.length) return [];
    let a = input.at(-1), da = a[3] + sign * a[axis];
    for (const b of input) {
      const db = b[3] + sign * b[axis];
      if ((da >= 0) !== (db >= 0)) {
        const t = da / (da - db);
        polygon.push(a.map((value, i) => value + t * (b[i] - value)));
      }
      if (db >= 0) polygon.push(b);
      a = b; da = db;
    }
  }
  return polygon.filter(p => p[3] > 0).map(p => clipToScreen(p, width, height));
}

export function rgb(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
}
