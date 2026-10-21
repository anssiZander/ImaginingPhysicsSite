// Coordinates in the orthonormal basis (|r>, |w>). This introductory diagram
// uses conventional D; the pinned column and wave simulations still use -D.
export const CANDIDATES = 16;
export const THETA = Math.asin(1 / Math.sqrt(CANDIDATES));
export const START = Object.freeze({r: Math.sqrt(15) / 4, w: 1 / 4});

export function reflect(vector, kind) {
  if (kind === 'oracle') return {r: vector.r, w: -vector.w};
  if (kind !== 'diffuser') throw new RangeError('Unknown reflection');
  const projection = START.r * vector.r + START.w * vector.w;
  return {r: 2 * START.r * projection - vector.r,
    w: 2 * START.w * projection - vector.w};
}

export function checkpoint(step) {
  if (!Number.isSafeInteger(step) || step < 0) throw new RangeError('Expected a nonnegative step');
  let vector = {...START};
  for (let index = 1; index <= step; index++) {
    vector = reflect(vector, index % 2 ? 'oracle' : 'diffuser');
  }
  return vector;
}

// A geometric sweep between the exact endpoints, not a physical gate path.
export function sweep(from, to, fraction) {
  if (fraction <= 0) return {...from};
  if (fraction >= 1) return {...to};
  const start = Math.atan2(from.w, from.r);
  const difference = Math.atan2(from.r * to.w - from.w * to.r,
    from.r * to.r + from.w * to.w);
  const angle = start + fraction * difference;
  return {r: Math.cos(angle), w: Math.sin(angle)};
}
