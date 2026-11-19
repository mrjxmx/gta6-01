// Solano Heat — small math and seeded-random helpers shared by every module.
// The city is generated from a fixed seed so Port Solano is the same city on every load;
// gameplay randomness (traffic colours, pedestrian shirts) uses the same generator reseeded
// per run, which also lets the screenshot scenes be staged deterministically.

/** mulberry32: a tiny fast seeded PRNG. Returns a function giving floats in [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seeded random source with the convenience picks the game keeps making. */
export class Rng {
  constructor(seed) { this.next = mulberry32(seed); }
  /** Float in [min, max). */
  range(min, max) { return min + this.next() * (max - min); }
  /** Integer in [min, max] inclusive. */
  int(min, max) { return Math.floor(this.range(min, max + 1)); }
  /** One item of the array. */
  pick(items) { return items[Math.floor(this.next() * items.length)]; }
  /** True with probability p. */
  chance(p) { return this.next() < p; }
}

export function clamp(value, min, max) { return value < min ? min : value > max ? max : value; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function distance(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); }
export function distanceSq(x1, y1, x2, y2) { const dx = x2 - x1; const dy = y2 - y1; return dx * dx + dy * dy; }
/** Shortest signed turn from angle a to angle b, in (-PI, PI]. */
export function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
/** Move an angle toward a target by at most maxStep. */
export function turnToward(angle, target, maxStep) {
  const d = angleDelta(angle, target);
  return angle + clamp(d, -maxStep, maxStep);
}
/** True when the circle overlaps the axis-aligned rectangle. */
export function circleHitsRect(cx, cy, r, rect) {
  const nx = clamp(cx, rect.x, rect.x + rect.w);
  const ny = clamp(cy, rect.y, rect.y + rect.h);
  return distanceSq(cx, cy, nx, ny) < r * r;
}
/** Push a circle out of an axis-aligned rectangle; returns the corrected {x, y}. */
export function pushCircleOutOfRect(cx, cy, r, rect) {
  const nx = clamp(cx, rect.x, rect.x + rect.w);
  const ny = clamp(cy, rect.y, rect.y + rect.h);
  let dx = cx - nx; let dy = cy - ny;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return { x: cx, y: cy };
  if (d2 > 0.0001) {
    const d = Math.sqrt(d2);
    return { x: nx + (dx / d) * r, y: ny + (dy / d) * r };
  }
  // Centre inside the rect: leave by the nearest face.
  const left = cx - rect.x; const right = rect.x + rect.w - cx;
  const top = cy - rect.y; const bottom = rect.y + rect.h - cy;
  const m = Math.min(left, right, top, bottom);
  if (m === left) return { x: rect.x - r, y: cy };
  if (m === right) return { x: rect.x + rect.w + r, y: cy };
  if (m === top) return { x: cx, y: rect.y - r };
  return { x: cx, y: rect.y + rect.h + r };
}
