import { CONFIG } from './config.js';
import { add, cross, dot, frame, normalize, projectPolygon, projectSegment, projectVisible, rgb, scale, TAU } from './math.js';

// Same geometry in world units and inset pixels. Shrink continuously as either
// component vanishes, keeping the square inside the projection triangle.
export function projectionCornerSize(length, tangentLength, normalScalar, c = CONFIG.geodesic) {
  return length * Math.min(c.cornerFraction, c.cornerComponentFraction * Math.min(tangentLength, Math.abs(normalScalar)));
}

export function constructionArrowDimensions(length, c = CONFIG.geodesic, unitsPerPixel = 0) {
  const headLength = Math.min(c.arrowHeadLength, length * c.arrowMaxHeadFraction);
  const baseThickness = c.firstPerson.arrowLength / c.arrowLength * headLength / c.arrowHeadLength;
  const thickness = Math.min(baseThickness * c.arrowMaxWidthScale,
    Math.max(baseThickness, unitsPerPixel * c.arrowMinShaftWidthPx / c.arrowShaftWidth));
  return { length, headLength, thickness };
}

// h v is the tangent displacement used by the integrator, in either camera.
// Only glyph thickness/normal/plane styling differs between the two views.
export function constructionDimensions(stepSize, close, torus, c = CONFIG.geodesic) {
  const size = close ? c.firstPerson.arrowLength / c.arrowLength : torus ? c.torusDiagramScale : 1;
  return { size, arrowLength: stepSize,
    planeRadius: Math.max(close ? c.firstPerson.planeRadius : c.planeRadius * size, stepSize * c.planeStepFactor),
    normalLength: close ? c.firstPerson.normalLength : c.normalLength * size };
}

function drawConstructionHistory(renderer, batch, model, offset) {
  const c = CONFIG.geodesic, h = c.history, radius = CONFIG.geometry.sphereRadius;
  const line = (a, b, width, color) => {
    const segment = projectSegment(a, b, renderer.matrix, renderer.sphere.width, renderer.sphere.height);
    if (segment) batch.line(...segment, width, color);
  };
  let visibleSteps = 0, departureVisible = false;
  const draw = (point, vectors, length, opacity, projection) => {
    if (!renderer.visible(renderer.world(point, offset))) return false;
    const origin = renderer.world(point, offset), f = frame(point.latitude, point.longitude);
    const color = (name, alpha = opacity) => [...rgb(c.colors[name]), alpha];
    const tip = vector => add(origin, scale(vector, length * radius));
    const arrow = (vector, name, base = origin) => {
      const magnitude = Math.hypot(...vector);
      if (magnitude < 1e-7) return;
      const direction = normalize(vector), end = add(base, scale(vector, length * radius));
      const side = normalize(cross(direction, Math.abs(dot(direction, f.normal)) < 0.95 ? f.normal : f.east));
      const headLength = Math.min(h.headLength, length * magnitude * c.arrowMaxHeadFraction);
      const neck = add(end, scale(direction, -headLength * radius));
      const width = h.headHalfWidth * headLength / h.headLength * radius;
      line(base, end, h.lineWidthPx, color(name));
      line(end, add(neck, scale(side, width)), h.lineWidthPx, color(name));
      line(end, add(neck, scale(side, -width)), h.lineWidthPx, color(name));
    };
    arrow(vectors.old, 'old');
    if (!projection) return true;
    arrow(vectors.tangent, 'tangent');
    arrow(vectors.normalComponent, 'component');
    arrow(vectors.normalComponent, 'component', tip(vectors.tangent));
    // Small plane outlines identify the tangent plane at each past projection.
    const planeRadius = length * h.planeRadiusFactor;
    const at = angle => add(origin, scale(add(scale(f.east, Math.cos(angle)), scale(f.north, Math.sin(angle))), planeRadius * radius));
    for (let i = 0; i < h.planeSegments; i++) line(at(i * TAU / h.planeSegments), at((i + 1) * TAU / h.planeSegments), h.planeLineWidthPx, color('plane', opacity * h.planeOpacity));
    return true;
  };
  const initial = model.history[0];
  if (initial) draw(initial.start, initial, initial.length, h.minOpacity, false);
  for (const entry of model.history) {
    // The most recent projection is still drawn by the active construction.
    if (model.phase === 'project' && model.phaseComplete && entry.index === model.completedSteps) continue;
    const age = model.completedSteps - entry.index;
    const opacity = Math.max(h.minOpacity, h.opacity * Math.exp(-age / h.fadeSteps));
    if (draw(entry.end, entry, entry.length, opacity, true)) visibleSteps++;
  }
  if (model.step && !(model.phase === 'project' && model.phaseComplete)) {
    departureVisible = draw(model.step.start, { old: model.step.oldVelocity }, model.step.length, h.opacity, false);
  }
  return { visibleSteps, departureVisible };
}

// Local construction glyphs use the same vectors as the step integrator.
export function drawGeodesicConstruction(renderer, batch, model) {
  const c = CONFIG.geodesic, s = model.sample(), view = renderer.sphere;
  const radius = CONFIG.geometry.sphereRadius, close = renderer.firstPerson;
  const { arrowLength, planeRadius, normalLength } = constructionDimensions(model.stepSize, close, model.surface.isTorus, c);
  const cornerLength = projectionCornerSize(arrowLength, s.tangentLength, s.normalScalar, c);
  const offset = close ? c.firstPerson.surfaceOffset : c.surfaceOffset;
  const f = frame(s.point.latitude, s.point.longitude);
  const origin = renderer.world(s.point, offset), project = p => projectVisible(p, renderer.matrix, view.width, view.height);
  const color = (name, alpha = 1) => [...rgb(c.colors[name]), alpha];
  const line = (a, b, width, rgba) => {
    const segment = projectSegment(a, b, renderer.matrix, view.width, view.height);
    if (segment) batch.line(...segment, width, rgba);
  };
  const tip = v => add(origin, scale(v, arrowLength * radius));
  for (let i = 1; i < s.path.length; i++) line(renderer.world(s.path[i - 1], offset), renderer.world(s.path[i], offset), close ? CONFIG.firstPerson.trailWidthPx : c.trailWidthPx, color('old', 0.85));
  view.drawBatch(batch);
  batch.vertices.length = 0;

  // Keep completed constructions in world space. Cull their anchor patches
  // against the surface, then show the components even when they point inward.
  const history = drawConstructionHistory(renderer, batch, model, offset);
  view.gl.disable(view.gl.DEPTH_TEST);
  view.drawBatch(batch);
  batch.vertices.length = 0;

  // The current visible patch gets prominent explanatory overlays. They show a
  // component entering the surface without disappearing inside the solid mesh.
  const patchVisible = close || renderer.visible(renderer.world(s.point, 0.012));
  if (patchVisible) {
    const at = (a, b) => add(origin, scale(add(scale(f.east, a), scale(f.north, b)), planeRadius * radius));
    const rim = Array.from({ length: c.planeSegments }, (_, i) => at(Math.cos(i * TAU / c.planeSegments), Math.sin(i * TAU / c.planeSegments)));
    const polygon = projectPolygon(rim, renderer.matrix, view.width, view.height);
    for (let i = 1; i + 1 < polygon.length; i++) batch.triangle(polygon[0], polygon[i], polygon[i + 1], color('plane', c.planeOpacity));
    for (let i = 0; i < c.planeSegments; i++) {
      line(rim[i], rim[(i + 1) % rim.length], c.planeOutlineWidthPx, color('plane', c.planeOutlineOpacity));
    }
    for (let i = -c.planeGridDivisions + 1; i < c.planeGridDivisions; i++) {
      const x = i / c.planeGridDivisions, extent = Math.sqrt(1 - x * x);
      line(at(x, -extent), at(x, extent), c.planeGridWidthPx, color('plane', c.planeGridOpacity));
      line(at(-extent, x), at(extent, x), c.planeGridWidthPx, color('plane', c.planeGridOpacity));
    }
    if (c.curvature.enabled) {
      const k = c.curvature, principal = model.surface.principal(s.point.latitude);
      const axisRadius = planeRadius * k.axisRadiusFraction;
      const headLength = Math.min(k.arrowheadLength, axisRadius * k.maxHeadFraction);
      const headWidth = k.arrowheadHalfWidth * headLength / k.arrowheadLength;
      // Same principal directions and signed palette as Parallel Transport.
      // Clip the heads as polygons too, so close/side views cannot lose wedges.
      for (const [i, axis, side, value] of [[0, f.east, f.north, principal.east], [1, f.north, f.east, principal.north]]) {
        const name = renderer.signedColor(value), rgba = renderer.rgba(name, k.opacity);
        const axisPoint = (x, y = 0) => add(origin, scale(add(scale(axis, x), scale(side, y)), radius));
        line(axisPoint(-axisRadius), axisPoint(axisRadius), k.axisWidthPx, rgba);
        for (const sign of [-1, 1]) {
          const neck = sign * (axisRadius - headLength);
          const head = projectPolygon([axisPoint(sign * axisRadius), axisPoint(neck, headWidth), axisPoint(neck, -headWidth)], renderer.matrix, view.width, view.height);
          for (let j = 1; j + 1 < head.length; j++) batch.triangle(head[0], head[j], head[j + 1], rgba);
        }
        const label = project(axisPoint(-planeRadius * k.labelRadiusFraction));
        renderer.principalLabels[i] = { x: label?.[0] ?? 0, y: label?.[1] ?? 0, visible: !!label, color: CONFIG.colors[name] };
      }
    }
    if (s.components > 0) {
      const a = tip(s.tangent), b = tip(s.old);
      for (let i = 0; i < c.componentDashSegments; i += 2) {
        const at = t => add(a, scale(add(b, scale(a, -1)), t));
        line(at(i / c.componentDashSegments), at((i + 1) / c.componentDashSegments), c.componentLineWidthPx, color('component', s.components));
      }
      // Right-angle corner at the foot of the projection.
      const side = scale(s.next, -cornerLength * radius), up = scale(s.normal, Math.sign(s.normalScalar) * cornerLength * radius);
      line(add(a, side), add(add(a, side), up), 1, color('tangent', s.components));
      line(add(add(a, side), up), add(a, up), 1, color('tangent', s.components));
    }
    const marker = project(origin);
    if (marker) batch.disk(marker, close ? c.firstPerson.markerRadiusPx : c.markerRadiusPx, color('old'));
  }
  // Clip filled polygons and lines before projection; this plane can cross the eye.
  view.gl.disable(view.gl.DEPTH_TEST);
  view.drawBatch(batch);
  if (patchVisible) {
    const arrow = (vector, length, name, opacity = 1, base = origin) => {
      const magnitude = Math.hypot(...vector);
      if (magnitude < 1e-7 || opacity < 0.001) return;
      const direction = normalize(vector);
      const side = Math.abs(dot(direction, f.normal)) < 0.95 ? normalize(cross(direction, f.normal)) : f.east;
      const normal = normalize(cross(side, direction));
      const midpoint = add(base, scale(vector, length * radius * 0.5));
      const m = renderer.matrix;
      const depth = m[3] * midpoint[0] + m[7] * midpoint[1] + m[11] * midpoint[2] + m[15];
      const unitsPerPixel = Math.max(0, 2 * depth / (view.height * Math.hypot(m[1], m[5], m[9]) * radius));
      const dimensions = constructionArrowDimensions(length * magnitude, c, unitsPerPixel);
      renderer.constructionArrow.draw(base, direction, normal, dimensions.thickness, color(name, opacity), renderer.matrix, renderer.eye, [dimensions.length / dimensions.thickness, 1, 1], false, dimensions.headLength / dimensions.thickness);
    };
    arrow(s.normal, normalLength, 'normal');
    if (s.components > 0) {
      arrow(s.tangent, arrowLength, 'tangent', s.components * (model.phase === 'project' ? 0.55 : 1));
      arrow(s.normalComponent, arrowLength, 'component', s.components);
      arrow(s.normalComponent, arrowLength, 'component', s.components * 0.8, tip(s.tangent));
    }
    if (model.phase === 'project') arrow(s.old, arrowLength, 'old', c.ghostOpacity);
    arrow(s.displayed, arrowLength, model.phase === 'project' ? 'tangent' : 'old');
    const label = (position, text, name, below = false) => {
      const p = project(position);
      const shift = renderer.topView ? (name === 'normal' ? -1 : name === 'component' ? 1 : 0) * CONFIG.topView.normalLabelOffsetPx : 0;
      renderer.deviationLabels.push({ x: (p?.[0] ?? 0) + shift, y: (p?.[1] ?? 0) + (below ? c.labelGapPx : -c.labelGapPx), visible: !!p && !close, text, color: c.colors[name] });
    };
    label(add(origin, scale(s.normal, normalLength * radius)), 'n', 'normal');
    label(tip(s.old), 'v old', 'old');
    if (s.components > 0) {
      label(tip(s.tangent), 'vₜ', 'tangent', true);
      label(tip(s.normalComponent), 'vₙ', 'component');
    }
  }
  renderer.constructionView = { firstPerson: close, patchVisible, arrowLength, arrowHeadLength: constructionArrowDimensions(arrowLength, c).headLength, cornerLength, planeRadius, normalLength, displayedVector: s.displayed, normal: s.normal, origin, phase: model.phase, components: s.components, historySteps: model.history.length, visibleHistorySteps: history.visibleSteps, departureVisible: history.departureVisible };
}
