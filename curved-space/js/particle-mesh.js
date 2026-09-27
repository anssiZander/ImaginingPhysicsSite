import { frame, TAU } from './math.js';

// A unit sphere shared by every instance. Normals equal these unit positions.
export function createParticleSphere(longitudes, latitudes) {
  const positions = [], indices = [];
  for (let y = 0; y <= latitudes; y++) for (let x = 0; x <= longitudes; x++) {
    positions.push(...frame(-Math.PI / 2 + Math.PI * y / latitudes, TAU * x / longitudes).normal);
  }
  for (let y = 0; y < latitudes; y++) for (let x = 0; x < longitudes; x++) {
    const a = y * (longitudes + 1) + x, b = a + longitudes + 1;
    indices.push(a, a + 1, b, b, a + 1, b + 1);
  }
  return { positions: new Float32Array(positions), indices: new Uint16Array(indices) };
}
