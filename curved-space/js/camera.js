import { CONFIG } from './config.js';
import { add, clamp, cross, frame, lookAt, normalize, radians, scale, tangentVector, wrapPi } from './math.js';
import { geodesicEndpoint } from './surface.js';

// Use the particle's tangent frame, never a global-up orbit angle. This remains
// continuous across chart seams and poles. Walking backward on the surface also
// keeps the eye outside a concave torus instead of cutting through it.
export function firstPersonPose(surface, particle, config = CONFIG.firstPerson, radius = CONFIG.geometry.sphereRadius, orbit = null) {
  const normal = frame(particle.latitude, particle.longitude).normal;
  const velocity = tangentVector(particle.latitude, particle.longitude, particle.angle);
  const behind = geodesicEndpoint(surface, particle, particle.angle, -config.setback);
  const defaultEye = add(surface.position(behind.latitude, behind.longitude), scale(normal, config.height));
  const anchor = surface.position(particle.latitude, particle.longitude);
  // Deviation retains its raised walking pivot; construction uses its plane.
  // The pivot travels with the particle but does not rotate with camera input.
  const distance = orbit?.distance ?? config.setback;
  const pivotOffset = add(add(defaultEye, scale(velocity, config.setback)), scale(anchor, -1));
  const pivot = config.orbitOnTangentPlane
    ? surface.position(particle.latitude, particle.longitude, config.surfaceOffset)
    : add(anchor, scale(pivotOffset, Math.min(1, distance / config.setback)));
  const heading = tangentVector(particle.latitude, particle.longitude, particle.angle + (orbit?.yaw ?? 0));
  const pitch = orbit?.pitch ?? radians(config.orbitPitchDeg ?? 0);
  const outward = add(scale(heading, -Math.cos(pitch)), scale(normal, Math.sin(pitch)));
  // March the camera boom against the exact signed-distance surface. In the
  // torus hole, limit it before either the nearby wall or the opposite tube.
  const collision = config.orbit ?? CONFIG.firstPerson.orbit;
  const surfaceClearance = config.orbitOnTangentPlane ? config.planeCameraClearance : collision.surfaceClearance;
  const collisionSteps = config.orbitOnTangentPlane ? config.planeCollisionSteps : collision.collisionSteps;
  // A tangent/outward ray from the convex sphere cannot re-enter the surface.
  let clearDistance = surface.isTorus ? 0 : distance;
  for (let i = 0; i < collisionSteps && clearDistance < distance; i++) {
    const clearance = surface.signedDistance(add(pivot, scale(outward, clearDistance))) - surfaceClearance;
    if (clearance <= collision.collisionTolerance) break;
    clearDistance = Math.min(distance, clearDistance + clearance * collision.collisionSafety);
  }
  const eye = scale(add(pivot, scale(outward, clearDistance)), radius);
  const target = scale(pivot, radius), forward = scale(outward, -1);
  const up = normalize(cross(cross(forward, normal), forward));
  return { eye, target, forward, up, normal, distance: clearDistance, view: lookAt(eye, add(eye, forward), up) };
}

// Fit narrow viewports once per viewport geometry, never by changing the zoom
// as the shell stretches: motion must remain visible against a fixed scale.
export function tidalCameraEye(camera, aspect, radius = CONFIG.geometry.sphereRadius) {
  const c = CONFIG.tidal.camera;
  const fit = Math.max(1, c.minimumAspect / aspect);
  return camera.eye(radius * fit);
}

export class OrbitCamera {
  constructor(config = CONFIG.camera) {
    this.config = config;
    this.reset();
  }
  reset() {
    this.yaw = this.targetYaw = radians(this.config.yawDeg);
    this.pitch = this.targetPitch = radians(this.config.pitchDeg);
    this.distance = this.targetDistance = this.config.distance;
    this.follow = this.config.followOnStart;
  }
  orbit(dx, dy) {
    this.follow = false;
    this.targetYaw -= dx * this.config.orbitRadiansPerPixel;
    this.targetPitch = clamp(this.targetPitch + dy * this.config.orbitRadiansPerPixel, radians(this.config.minPitchDeg), radians(this.config.maxPitchDeg));
  }
  zoom(delta) {
    this.targetDistance = clamp(this.targetDistance * Math.exp(delta * this.config.zoomSensitivity), this.config.minDistance, this.config.maxDistance);
  }
  update(seconds, position) {
    if (this.follow && !position.isTidal) {
      const torus = position.surface?.isTorus;
      const inner = torus && Math.cos(position.latitude) < 0;
      this.targetYaw = this.yaw + wrapPi(position.longitude + (inner ? Math.PI : 0) + radians(this.config.followYawOffsetDeg) - this.yaw);
      this.targetPitch = torus ? radians(position.isGeodesic ? position.config.geodesic.camera.torusFollowPitchDeg : position.isDeviation ? position.config.deviation.torusFollowPitchDeg : position.config.surface.torus.followPitchDeg) : clamp(position.latitude * this.config.followLatitudeFactor + radians(this.config.followPitchOffsetDeg), radians(this.config.minPitchDeg), radians(this.config.maxPitchDeg));
    }
    const amount = 1 - Math.exp(-this.config.easingRate * seconds);
    this.yaw += (this.targetYaw - this.yaw) * amount;
    this.pitch += (this.targetPitch - this.pitch) * amount;
    this.distance += (this.targetDistance - this.distance) * amount;
  }
  eye(radius = 1) {
    const distance = this.distance * radius, c = Math.cos(this.pitch);
    return [distance * c * Math.sin(this.yaw), distance * Math.sin(this.pitch), distance * c * Math.cos(this.yaw)];
  }
}

// Each experiment owns its close-view controls independently of its outside
// camera. Angles are relative to the particle's velocity and surface normal.
export class FirstPersonCamera extends OrbitCamera {
  constructor(settings = CONFIG.firstPerson) {
    const controls = settings.orbit ?? CONFIG.firstPerson.orbit;
    super({ ...controls, yawDeg: 0, pitchDeg: settings.orbitPitchDeg ?? 0, distance: settings.setback,
      minDistance: settings.setback * controls.minDistanceScale,
      followOnStart: false });
    this.settings = settings;
  }
  pose(surface, particle, radius = CONFIG.geometry.sphereRadius) {
    return firstPersonPose(surface, particle, this.settings, radius, this);
  }
  sideView(arrowLength, aspect = 1, normalComponentLength = 0) {
    this.targetYaw = this.yaw + wrapPi(radians(this.settings.sideViewYawDeg) - this.yaw);
    this.targetPitch = 0;
    const halfFov = Math.tan(radians(this.settings.fieldOfViewDeg) / 2);
    this.targetDistance = clamp(Math.max(this.settings.setback,
      arrowLength / (aspect * halfFov),
      Math.max(this.settings.normalLength, normalComponentLength) / halfFov) * this.settings.sideViewMargin,
    this.config.minDistance, this.config.maxDistance);
  }
}

// The normal direction stays locked; only distance eases. Each experiment owns
// its own instance, so zoom and the previous orbit/first-person views survive.
export class TopViewCamera extends OrbitCamera {
  constructor(settings = CONFIG.topView) {
    super({ ...settings, yawDeg: 0, pitchDeg: 90, followOnStart: false });
    this.isTopView = true;
  }
  orbit() {} // Top View always looks straight down at the tangent plane.
  pose(model, radius = CONFIG.geometry.sphereRadius) {
    const surface = model.surface, c = this.config;
    const point = model.isGeodesic ? model.currentPoint : model.isDeviation ? model.particles[1] : model;
    const normal = frame(point.latitude, point.longitude).normal;
    // Reuse the model's transported tangent, including its accumulated path
    // dependence. For construction this is the normalized projection at the
    // current eased position, using the same finite-step rule as the velocity.
    // No camera-only integration or starting-normal alignment: entering this
    // view mid-path gives exactly the same frame as following from the start.
    const anchor = surface.position(point.latitude, point.longitude);
    const up = tangentVector(point.latitude, point.longitude, point.angle);
    // On an inner torus patch the opposite wall can obstruct the normal ray.
    // Stay before that wall while keeping the camera exactly above its point.
    let distance = surface.isTorus ? Math.min(this.distance, 2 * c.surfaceClearance) : this.distance;
    for (let i = 0; i < c.collisionSteps && distance < this.distance; i++) {
      const clearance = surface.signedDistance(add(anchor, scale(normal, distance))) - c.surfaceClearance;
      if (clearance <= c.collisionTolerance) break;
      distance = Math.min(this.distance, distance + clearance * c.collisionSafety);
    }
    const target = scale(anchor, radius), eye = add(target, scale(normal, distance * radius));
    return { eye, target, normal, forward: scale(normal, -1), up, distance, view: lookAt(eye, target, up) };
  }
}
