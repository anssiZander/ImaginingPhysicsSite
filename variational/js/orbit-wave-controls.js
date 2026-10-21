import { orbitAtTime, orbitFan, orbitFamily } from './orbit-wave.js';

export function startOrbitFlight(endpoint, branches) {
  if (!branches.length) return null;
  return { kind: 'probe', endpoint: { ...endpoint }, branches: branches.slice(), elapsed: 0,
    duration: Math.max(...branches.map(branch => branch.t)) };
}

export function startOrbitFan(speed) {
  return { kind: 'fan', rays: orbitFan(speed, 32, 128), elapsed: 0, duration: orbitFamily(speed).period };
}

export function orbitParticles(flight) {
  if (flight.kind === 'fan') {
    if (flight.elapsed >= flight.duration) return [];
    return flight.rays.flatMap(ray => {
      if (ray.hitCore && flight.elapsed >= ray.maxT) return [];
      const p = orbitAtTime(ray, flight.elapsed);
      return p ? [{ ...p, ray, arrived: false }] : [];
    });
  }
  return flight.branches.map((branch, index) => {
    const t = Math.min(branch.t, flight.elapsed), arrived = t >= branch.t;
    const p = arrived ? flight.endpoint : orbitAtTime(branch.ray, t);
    return { ...p, t, ray: branch.ray, kind: branch.kind, arrived, index };
  });
}
