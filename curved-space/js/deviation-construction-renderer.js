import { CONFIG } from './config.js';
import { add, cross, frame, normalize, projectPolygon, projectSegment, projectVisible, rgb, scale, tangentVector } from './math.js';
import { vectorInVelocityFrame } from './deviation-construction.js';

export function drawDeviationStrip(renderer, batch, model) {
  const build = model.construction, c = build.config, view = renderer.sphere;
  const offset = renderer.firstPerson ? c.firstPersonSurfaceOffset : c.surfaceOffset;
  for (const cell of build.strip?.cells ?? []) {
    const points = cell.points.map(p => renderer.world(p, offset));
    const polygon = projectPolygon(points, renderer.matrix, view.width, view.height);
    const color = renderer.rgba(renderer.signedColor(cell.curvature), build.phase === 'transport' ? c.transportAreaOpacity : c.areaOpacity);
    for (let i = 1; i + 1 < polygon.length; i++) batch.triangle(polygon[0], polygon[i], polygon[i + 1], color);
  }
}

export function drawDeviationConstruction(renderer, batch, model) {
  const build = model.construction, c = build.config, view = renderer.sphere;
  const radius = CONFIG.geometry.sphereRadius, close = renderer.firstPerson;
  const offset = close ? c.firstPersonSurfaceOffset : c.surfaceOffset;
  const glyphScale = close ? c.firstPersonGlyphScale : 1;
  const rgba = (name, alpha = 1) => [...rgb(c.colors[name] ?? name), alpha];
  const project = p => projectVisible(p, renderer.matrix, view.width, view.height);
  const line = (a, b, color, width = c.lineWidthPx) => {
    const segment = projectSegment(a, b, renderer.matrix, view.width, view.height);
    if (segment) batch.line(...segment, width, color);
  };
  const label = (position, text, color, dx = 0, dy = -10, checkOcclusion = true, parts = null, kind = '') => {
    const p = project(position);
    renderer.deviationLabels.push({ x: (p?.[0] ?? 0) + dx, y: (p?.[1] ?? 0) + dy,
      visible: !!p && (!checkOcclusion || renderer.visible(position)), text, color, parts, kind });
  };
  const curve = (points, name, alpha, timeLabel) => {
    for (let i = 1; i < points.length; i++) line(renderer.world(points[i - 1], offset), renderer.world(points[i], offset), rgba(name, alpha));
    // The stored connector runs teal -> yellow; xi points yellow -> teal.
    // Draw only its arrival head at teal, without duplicate straight Log arrows.
    const end = points[0];
    if (end) {
      const tip = renderer.world(end, offset), direction = scale(tangentVector(end.latitude, end.longitude, end.angle), -1);
      const head = Math.min(c.arrowheadLength, model.gap * 0.2) * radius * glyphScale;
      const side = cross(frame(end.latitude, end.longitude).normal, direction), neck = add(tip, scale(direction, -head));
      for (const wing of [-1, 1]) line(tip, add(neck, scale(side, wing * head * 0.3)), rgba(name, alpha));
    }
    const middle = points[Math.floor(points.length / 2)];
    if (middle) label(renderer.world(middle, offset), `ξ ${timeLabel}`, c.colors[name], 0, timeLabel === 'old' ? c.separationLabelGapPx : -c.separationLabelGapPx);
  };
  if (build.start) curve(build.start.connector.points, 'old', c.oldOpacity, 'old');
  if (model.connector.valid) curve(model.connector.points, 'current', 1, 'new');
  if (build.strip) {
    const middle = build.strip.grid[Math.round((build.strip.grid.length - 1) * c.boundaryLabelFraction)];
    label(renderer.world(middle[0], offset), 'v₁ Δt', CONFIG.colors.geodesicA, 22, 0);
    label(renderer.world(middle.at(-1), offset), 'v₂ Δt', CONFIG.colors.geodesicB, -22, 0);
    const relation = build.phase === 'transport' ? build.areaRelation : null;
    if (relation) {
      const row = build.strip.grid[Math.round((build.strip.grid.length - 1) * c.areaRelationFraction)];
      const center = row[Math.floor(row.length / 2)];
      // This differential equation uses local Gaussian curvature, including on
      // the torus; it is not the area-averaged curvature of the finite strip.
      const color = CONFIG.colors[renderer.signedColor(model.surface.principal(model.particles[1].latitude).gaussian)];
      const velocity = CONFIG.colors.geodesicB, xi = c.colors.current, neutral = CONFIG.colors.curvatureZero;
      const parts = [
        { text: '∇', color: neutral }, { text: 'v', subscript: true, color: velocity },
        { text: '∇', color: neutral }, { text: 'v', subscript: true, color: velocity }, { text: 'ξ', color: xi },
        { text: ' = −', color: neutral }, { text: 'K', color }, { text: 'ξ', color: xi },
        { text: '\nUnit speed · transverse Jacobi field', color: neutral, small: true },
      ];
      label(renderer.world(center, offset), parts.map(part => part.text).join(''), color, 0, 0, true, parts, 'area-relation');
    }
  }
  view.drawBatch(batch); batch.vertices.length = 0;

  // Carry a copy of teal v1 along the *new* connector to yellow v2. The
  // geodesics and their own velocity vectors remain fixed during this phase.
  const carried = build.sampleTransport();
  if (!carried) return;
  const { velocityOffset, arrowScale } = renderer.geodesicView;
  const base = renderer.world(carried, velocityOffset), teal = CONFIG.colors.geodesicA;
  if (!close && !renderer.visible(base)) return;
  const points = model.connector.points, endIndex = build.transportFraction * (points.length - 1);
  for (let i = 1; i <= Math.floor(endIndex); i++) {
    if (i % 2) line(renderer.world(points[i - 1], velocityOffset), renderer.world(points[i], velocityOffset), rgba(teal, c.transportPathOpacity), c.transportPathWidthPx);
  }
  view.gl.disable(view.gl.DEPTH_TEST); view.drawBatch(batch); batch.vertices.length = 0;
  renderer.globeArrow(carried, carried.angle, arrowScale, rgba(teal), velocityOffset, CONFIG.deviation.velocityArrowThickness, true);
  const arrowLength = CONFIG.geometry.arrowLength * arrowScale * radius;
  const tip = add(base, scale(tangentVector(carried.latitude, carried.longitude, carried.angle), arrowLength));
  label(tip, 'Pv₁', teal, -c.velocityLabelGapPx, -2 * c.velocityLabelGapPx, false);
  const yellow = model.particles[1], yellowBase = renderer.world(yellow, velocityOffset);
  const yellowTip = add(yellowBase, scale(tangentVector(yellow.latitude, yellow.longitude, yellow.angle), arrowLength));
  if (close || renderer.visible(yellowBase)) label(yellowTip, 'v₂', CONFIG.colors.geodesicB, c.velocityLabelGapPx, -c.velocityLabelGapPx, false);

  // Once the copy arrives, compare velocities at one common base. No separate
  // derivative magnification: this connector is exactly Pv1 - v2 in arrow units.
  const reveal = build.comparisonReveal;
  const decomposition = build.velocityDecomposition;
  if (reveal > 0 && decomposition) {
    const difference = add(tip, scale(yellowTip, -1));
    const previous = scale(vectorInVelocityFrame(yellow, decomposition.transportedPrevious), arrowLength / model.config.deviation.speed);
    const previousTip = add(yellowTip, previous), normal = frame(yellow.latitude, yellow.longitude).normal;
    const hasPrevious = Math.hypot(...decomposition.transportedPrevious) > 1e-8;
    const color = CONFIG.colors[renderer.signedColor(build.strip?.curvatureIntegral ?? model.surface.principal(yellow.latitude).gaussian)];
    const arrow = (from, to, name, fraction) => {
      const displacement = scale(add(to, scale(from, -1)), fraction), length = Math.hypot(...displacement);
      if (length < 1e-9) return;
      const end = add(from, displacement), direction = normalize(displacement), side = cross(normal, direction);
      const head = Math.min(c.arrowheadLength * glyphScale * radius, length * 0.3), neck = add(end, scale(direction, -head));
      line(from, end, rgba(name, reveal), c.velocityDifferenceWidthPx);
      for (const wing of [-1, 1]) line(end, add(neck, scale(side, wing * head * 0.3)), rgba(name, reveal), c.velocityDifferenceWidthPx);
    };
    if (hasPrevious) {
      // Keep the total as a faint dashed chord; the two colored arrows add
      // head-to-tail, even when the extra change opposes the previous value.
      if (Math.hypot(...difference) > 1e-9) for (let i = 0; i < c.velocityDifferenceDashCount; i += 2) {
        line(add(yellowTip, scale(difference, i / c.velocityDifferenceDashCount)),
          add(yellowTip, scale(difference, (i + 1) / c.velocityDifferenceDashCount)),
          rgba(CONFIG.colors.curvatureZero, c.velocityDifferenceGuideOpacity * reveal), c.velocityDifferenceGuideWidthPx);
      }
      arrow(yellowTip, previousTip, 'old', Math.min(1, reveal * 2));
      arrow(previousTip, tip, color, Math.max(0, reveal * 2 - 1));
      label(add(yellowTip, scale(difference, 0.5)), 'Δv new', CONFIG.colors.curvatureZero, 0, c.velocityLabelGapPx, false);
      label(add(yellowTip, scale(previous, 0.5)), 'Pₜ Δv old', c.colors.old, 0, 2 * c.velocityLabelGapPx, false);
    } else {
      arrow(yellowTip, tip, color, reveal);
      label(add(yellowTip, scale(difference, 0.5)), build.start.time < 1e-10 ? 'first short step · initially parallel' : 'previous Δv = 0',
        CONFIG.colors.curvatureZero, 0, 2 * c.velocityLabelGapPx, false);
    }
    const symbol = hasPrevious ? 'δv' : 'Δv';
    const parts = [
      { text: `${symbol} ≈ (∇`, color }, { text: 'v', subscript: true, color: CONFIG.colors.geodesicB },
      { text: '∇', color }, { text: 'v', subscript: true, color: CONFIG.colors.geodesicB },
      { text: 'ξ', color: c.colors.current }, { text: ') Δt', color },
    ];
    label(scale(add(previousTip, tip), 0.5), `${symbol} ≈ (∇ᵥ∇ᵥξ) Δt`, color, 0, (hasPrevious ? 3 : 1) * c.velocityLabelGapPx, false, parts);
  }
  view.gl.disable(view.gl.DEPTH_TEST); view.drawBatch(batch);
}
