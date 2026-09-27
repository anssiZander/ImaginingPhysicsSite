import { cross, dot, normalize, TAU } from './math.js';

// Piecewise axial scaling extends the cylinder without stretching its cone.
export function arrowAxialDimensions(geometry, lengthScale = 1, headLength = null) {
  const sourceHead = geometry.arrowLength * geometry.arrowHeadFraction;
  const total = geometry.arrowLength * lengthScale;
  const head = Math.min(headLength ?? sourceHead, total * (geometry.arrowMaxHeadFraction ?? 0.8));
  return [geometry.arrowLength - sourceHead, sourceHead, total - head, head];
}

// A closed cylinder and cone along local +X, with smooth side normals and flat caps.
export function createArrowVertices(geometry) {
  const result = [], segments = geometry.arrowRadialSegments;
  const length = geometry.arrowLength, neck = length * (1 - geometry.arrowHeadFraction);
  const shaftRadius = geometry.arrowShaftWidth / 2, headRadius = geometry.arrowHeadWidth / 2;
  const radial = angle => [0, Math.cos(angle), Math.sin(angle)];
  const position = (x, radius, angle) => [x, radius * Math.cos(angle), radius * Math.sin(angle)];
  const coneNormal = angle => normalize([headRadius / (length - neck), Math.cos(angle), Math.sin(angle)]);
  const triangle = (a, na, b, nb, c, nc) => {
    const edge1 = b.map((v, i) => v - a[i]), edge2 = c.map((v, i) => v - a[i]);
    if (dot(cross(edge1, edge2), na.map((v, i) => v + nb[i] + nc[i])) < 0) {
      [b, c] = [c, b]; [nb, nc] = [nc, nb];
    }
    result.push(...a, ...na, ...b, ...nb, ...c, ...nc);
  };
  for (let i = 0; i < segments; i++) {
    const a = i / segments * TAU, b = (i + 1) / segments * TAU;
    const p = position(0, shaftRadius, a), q = position(0, shaftRadius, b);
    const r = position(neck, shaftRadius, a), s = position(neck, shaftRadius, b);
    triangle(p, radial(a), q, radial(b), r, radial(a));
    triangle(q, radial(b), s, radial(b), r, radial(a));
    triangle([0, 0, 0], [-1, 0, 0], p, [-1, 0, 0], q, [-1, 0, 0]);
    const h1 = position(neck, headRadius, a), h2 = position(neck, headRadius, b);
    triangle(h1, coneNormal(a), h2, coneNormal(b), [length, 0, 0], coneNormal((a + b) / 2));
    triangle([neck, 0, 0], [-1, 0, 0], h1, [-1, 0, 0], h2, [-1, 0, 0]);
  }
  return new Float32Array(result);
}
