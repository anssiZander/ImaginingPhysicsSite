import { add, cross, frame, radians, scale, TAU, wrapPi } from './math.js';
import { geodesicEndpoint } from './surface.js';

/** Closed preset paths, in unwrapped geographic coordinates. The first point is omitted. */
export function loopWaypoints(start, settings, config, surface = null) {
  const { latitude: lat, longitude: lon } = start;
  if (settings.type === 'rectangle') {
    const east = lon + radians(settings.widthDeg);
    if (surface?.isTorus && Math.cos(lat) < 0) {
      // On the inside, put the rectangle on the upper side of the tube so its
      // region is visible from above. Keep the same positive boundary orientation.
      const upper = lat - radians(settings.heightDeg);
      return [[upper, lon], [upper, east], [lat, east], [lat, lon]];
    }
    const north = lat + radians(settings.heightDeg);
    return [[lat, east], [north, east], [north, lon], [lat, lon]];
  }

  if (surface?.isTorus) {
    // Intrinsic circle: shoot equal-length geodesics in every tangent direction.
    // Radius is expressed as tube-radius * angular slider value.
    const radius = radians(settings.radiusDeg) * surface.r;
    const center = geodesicEndpoint(surface, start, 0, radius);
    const points = [], count = config.surface.torus.circleSegments;
    let previous = start.longitude;
    for (let i = 1; i < count; i++) {
      const p = geodesicEndpoint(surface, center, center.angle + Math.PI + i / count * TAU, radius);
      const longitude = previous + wrapPi(p.longitude - previous);
      points.push([p.latitude, longitude]);
      previous = longitude;
    }
    points.push([lat, previous + wrapPi(lon - previous)]);
    return points;
  }

  const radius = radians(settings.radiusDeg), f = frame(lat, lon);
  // Displace the center east of the start. u points from the center toward the
  // start, and (u, v, center) is right-handed, so traversal has positive area.
  const center = add(scale(f.normal, Math.cos(radius)), scale(f.east, Math.sin(radius)));
  const u = add(scale(f.normal, Math.sin(radius)), scale(f.east, -Math.cos(radius)));
  const v = cross(center, u), points = [];
  let previousLongitude = lon;
  for (let i = 1; i < config.loop.circleSegments; i++) {
    const t = i / config.loop.circleSegments * TAU;
    const p = add(scale(center, Math.cos(radius)),
      scale(add(scale(u, Math.cos(t)), scale(v, Math.sin(t))), Math.sin(radius)));
    const longitude = previousLongitude + wrapPi(Math.atan2(p[0], p[2]) - previousLongitude);
    points.push([Math.atan2(p[1], Math.hypot(p[0], p[2])), longitude]);
    previousLongitude = longitude;
  }
  points.push([lat, previousLongitude + wrapPi(lon - previousLongitude)]);
  return points;
}

/** Subdivide meridians/parallels as well as circles so the 3D preview follows the surface. */
export function loopPreview(start, waypoints, maxStep) {
  const points = [{ latitude: start.latitude, longitude: start.longitude }];
  for (const [latitude, longitude] of waypoints) {
    const from = points.at(-1);
    const count = Math.max(1, Math.ceil(Math.max(Math.abs(latitude - from.latitude), Math.abs(longitude - from.longitude)) / maxStep));
    for (let i = 1; i <= count; i++) points.push({
      latitude: from.latitude + (latitude - from.latitude) * i / count,
      longitude: from.longitude + (longitude - from.longitude) * i / count,
    });
  }
  return points;
}
