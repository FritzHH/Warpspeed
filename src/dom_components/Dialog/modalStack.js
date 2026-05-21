const active = new Set();
const BASE = 9000;
const STEP = 100;

export function claimModalZ() {
  let z = BASE;
  while (active.has(z)) z += STEP;
  active.add(z);
  return z;
}

export function releaseModalZ(z) {
  active.delete(z);
}
