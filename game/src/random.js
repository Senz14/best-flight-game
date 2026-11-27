// A tiny seeded random generator (mulberry32) plus the helpers the world builder uses.
// The course, the clouds and the ring line all come from one seed, so ?seed=N always
// stages the same sky, the same hills and the same rings.

export function createRandom(seed) {
  let state = seed >>> 0;
  return function next() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function range(random, low, high) {
  return low + random() * (high - low);
}

export function pick(random, list) {
  return list[Math.floor(random() * list.length)];
}

// Smooth 1-D value noise: a row of random control points, cosine-interpolated.
export function makeRidge(random, points, low, high) {
  const control = [];
  for (let index = 0; index < points; index += 1) control.push(range(random, low, high));
  return function at(t) {
    const scaled = Math.max(0, Math.min(points - 1.001, t * (points - 1)));
    const index = Math.floor(scaled);
    const frac = scaled - index;
    const smooth = (1 - Math.cos(frac * Math.PI)) / 2;
    return control[index] + (control[index + 1] - control[index]) * smooth;
  };
}

export function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function wrapAngle(degrees) {
  let value = degrees % 360;
  if (value > 180) value -= 360;
  if (value < -180) value += 360;
  return value;
}
