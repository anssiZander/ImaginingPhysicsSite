import { G, clamp } from './model.js';
import { ballisticPoint, fanRays, rayBranch } from './action-wave.js';

// Pixels per metre: physics settings and canvas resizing never change this.
export const DEFAULT_CAMERA = Object.freeze({ x: 0, y: 0.8, scale: 120 });
export const MIN_ZOOM = 30, MAX_ZOOM = 1200;

export function cameraBounds(camera, width, height) {
  return { xmin: camera.x - width / (2 * camera.scale), xmax: camera.x + width / (2 * camera.scale),
    ymin: camera.y - height / (2 * camera.scale), ymax: camera.y + height / (2 * camera.scale) };
}

export function panCamera(camera, dx, dy) {
  return { ...camera, x: camera.x - dx / camera.scale, y: camera.y - dy / camera.scale };
}

export function zoomCamera(camera, width, height, pixelX, pixelY, delta) {
  const scale = clamp(camera.scale * Math.exp(-delta * 0.0015), MIN_ZOOM, MAX_ZOOM);
  // Hold the world point under the cursor still, including at either zoom limit.
  return { x: camera.x + (pixelX - width / 2) * (1 / camera.scale - 1 / scale),
    y: camera.y + (pixelY - height / 2) * (1 / camera.scale - 1 / scale), scale };
}

export function startFlight(endpoint, rays) {
  const moving = rays.filter(ray => ray.t > 0 && Number.isFinite(ray.t)).map(ray => ({ ...ray }));
  if (!moving.length) return null;
  return { kind: 'probe', endpoint: { ...endpoint }, rays: moving, elapsed: 0,
    duration: Math.max(...moving.map(ray => ray.t)) };
}

export function startFanFlight(speed, bottom) {
  // End the one-shot batch after even the highest upward ray has fallen below
  // the launch viewport. Snapshot this horizon so zoom never changes the clock.
  const floor = Math.max(6, bottom + 1);
  return { kind: 'fan', rays: fanRays(speed), elapsed: 0,
    duration: (speed + Math.sqrt(speed * speed + 2 * G * floor)) / G };
}

export function advanceFlight(flight, dt) {
  return { ...flight, elapsed: Math.min(flight.duration, flight.elapsed + Math.max(0, dt)) };
}

export function flightParticles(flight) {
  if (flight.kind === 'fan') {
    if (flight.elapsed >= flight.duration) return [];
    return flight.rays.map(ray => ({ ...ballisticPoint(ray.vx0, ray.vy0, flight.elapsed),
      t: flight.elapsed, arrived: false, ray: { ...ray, kind: rayBranch(ray.vx0, ray.vy0, flight.elapsed) } }));
  }
  return flight.rays.map(ray => {
    const t = Math.min(ray.t, flight.elapsed), arrived = t >= ray.t;
    const position = arrived ? flight.endpoint : ballisticPoint(ray.vx0, ray.vy0, t);
    return { ...position, t, arrived, ray };
  });
}
