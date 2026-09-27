import { TAU, wrapPi } from './math.js';

// Keep the complete geometric boundary independently of the bounded display trail.
// Only EXACTLY straight, forward-going coordinate segments can be combined.
export function appendBoundary(path, point) {
  const next = { latitude: point.latitude, longitude: point.longitude };
  const b = path.at(-1), a = path.at(-2);
  if (b && b.latitude === next.latitude && b.longitude === next.longitude) return;
  if (a) {
    const x = b.longitude - a.longitude, y = b.latitude - a.latitude;
    const u = next.longitude - b.longitude, v = next.latitude - b.latitude;
    const lengthProduct = Math.hypot(x, y) * Math.hypot(u, v);
    if (lengthProduct > 0 && x * u + y * v > 0 && Math.abs(x * v - y * u) <= 1e-12 * lengthProduct) {
      path[path.length - 1] = next;
      return;
    }
  }
  path.push(next);
}

/**
 * Geometric area from the boundary, independent of the transported vector.
 * dA = cos(phi) d lambda d phi. A northern-cap area primitive is
 * (1 - sin(phi)) d lambda. Integrate it exactly on coordinate-linear edges.
 * Signed spherical area is defined modulo 4 pi; choose [-2 pi, 2 pi].
 */
export function measureRegion(boundary) {
  if (!boundary.length) return null;
  const points = boundary.map(p => ({ ...p }));
  const first = points[0], last = points.at(-1);
  const closing = { latitude: first.latitude, longitude: last.longitude + wrapPi(first.longitude - last.longitude) };
  points.push(closing);
  let rawArea = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const half = (b.latitude - a.latitude) / 2;
    const meanSin = Math.sin((a.latitude + b.latitude) / 2) * (Math.abs(half) < 1e-8 ? 1 - half * half / 6 : Math.sin(half) / half);
    rawArea += (b.longitude - a.longitude) * (1 - meanSin);
  }
  const wholeSphere = 2 * TAU;
  let area = ((rawArea + TAU) % wholeSphere + wholeSphere) % wholeSphere - TAU;
  if (Math.abs(area + TAU) < 1e-10 && rawArea > 0) area = TAU;
  if (Math.abs(area) < 1e-12) area = 0;
  const windingOffset = Math.round((rawArea - area) / wholeSphere);
  const longitudeWinding = Math.round((closing.longitude - first.longitude) / TAU);
  // Unwrap pole-enclosing paths via the NORTH edge of the chart. Subtracting
  // windingOffset below then chooses the smaller, oriented complementary region.
  const polygon = [...points];
  if (longitudeWinding) {
    polygon.push({ longitude: closing.longitude, latitude: Math.PI / 2 });
    polygon.push({ longitude: first.longitude, latitude: Math.PI / 2 });
  }
  polygon.push(first);
  return { area, rawArea, windingOffset, longitudeWinding, points, polygon };
}

/** Torus area and curvature are DIFFERENT integrals. Both are geometric boundary integrals. */
export function measureTorusRegion(boundary, surface) {
  const points = boundary.map(p => ({ ...p })), first = points[0], last = points.at(-1);
  const closing = {
    latitude: last.latitude + wrapPi(first.latitude - last.latitude),
    longitude: last.longitude + wrapPi(first.longitude - last.longitude),
  };
  points.push(closing);
  const ringWinding = Math.round((closing.longitude - first.longitude) / TAU);
  const tubeWinding = Math.round((closing.latitude - first.latitude) / TAU);
  const common = { points, ringWinding, tubeWinding, chartHeight: TAU, periodicY: true, shadeByCurvature: true, windingOffset: 0 };
  // A single essential torus loop does not bound a patch. Do not invent an area.
  if (ringWinding || tubeWinding) return { ...common, boundsArea: false, area: null, curvatureIntegral: null, polygon: [] };
  let area = 0, curvatureIntegral = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], half = (b.latitude - a.latitude) / 2;
    const mid = (a.latitude + b.latitude) / 2;
    const meanSin = Math.sin(mid) * (Math.abs(half) < 1e-8 ? 1 - half * half / 6 : Math.sin(half) / half);
    const du = b.longitude - a.longitude;
    // dA = r(R + r cos v) du dv; K dA = cos v du dv.
    area -= du * (surface.r * surface.R * mid + surface.r * surface.r * meanSin);
    curvatureIntegral -= du * meanSin;
  }
  return { ...common, boundsArea: true, area, curvatureIntegral, polygon: [...points, first] };
}

/** Antialiased winding fill shared by the map and sphere. Rows run south to north. */
export function createAreaMask(region, width, height, rowSamples = 2) {
  const data = new Uint8Array(width * height * 4);
  if (!region) return data;
  const row = new Float64Array(width), accumulated = new Float64Array(width);
  const edges = [], chartHeight = region.chartHeight || Math.PI;
  for (let i = 1; i < region.polygon.length; i++) {
    const a = region.polygon[i - 1], b = region.polygon[i];
    if (a.latitude === b.latitude) continue;
    const lo = region.periodicY ? Math.ceil((-Math.PI - Math.max(a.latitude, b.latitude)) / TAU) : 0;
    const hi = region.periodicY ? Math.floor((Math.PI - Math.min(a.latitude, b.latitude)) / TAU) : 0;
    for (let k = lo; k <= hi; k++) edges.push([a.longitude, a.latitude + k * TAU, b.longitude, b.latitude + k * TAU]);
  }
  for (let y = 0; y < height; y++) {
    accumulated.fill(0);
    for (let sample = 0; sample < rowSamples; sample++) {
      row.fill(-region.windingOffset);
      const latitude = ((y + (sample + 0.5) / rowSamples) / height - 0.5) * chartHeight;
      const crossings = [];
      for (const [ax, ay, bx, by] of edges) {
        if (latitude < Math.min(ay, by) || latitude >= Math.max(ay, by)) continue;
        crossings.push({ x: ax + (bx - ax) * (latitude - ay) / (by - ay), delta: by > ay ? -1 : 1 });
      }
      crossings.sort((a, b) => a.x - b.x);
      let winding = 0, previous = 0;
      for (const crossing of crossings) {
        if (winding) {
          const left = (previous / TAU + 0.5) * width, right = (crossing.x / TAU + 0.5) * width;
          for (let x = Math.floor(left); x < Math.ceil(right); x++) {
            const coverage = Math.max(0, Math.min(x + 1, right) - Math.max(x, left));
            const wrapped = ((x % width) + width) % width;
            row[wrapped] += winding * coverage;
          }
        }
        winding += crossing.delta;
        previous = crossing.x;
      }
      const sign = region.shadeByCurvature ? Math.sign(Math.cos(latitude)) : 1;
      for (let x = 0; x < width; x++) accumulated[x] += row[x] * sign / rowSamples;
    }
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4, value = accumulated[x];
      data[i] = Math.round(Math.min(1, Math.max(0, value)) * 255);
      data[i + 1] = Math.round(Math.min(1, Math.max(0, -value)) * 255);
      data[i + 3] = 255;
    }
  }
  return data;
}
