// Solano Heat — the people of Port Solano: pedestrians who stroll the sidewalks and the
// boardwalk, chat in pairs, and run screaming from gunfire, sirens and speeding cars.
// They are also witnesses: a crime committed in front of them is a crime the police hear of.

import { SHIRT_COLORS, WORLD } from './config.js';
import { clamp, distanceSq } from './rng.js';
import { isOnRoad } from './city.js';

const PED_SPEED = 62;
const FLEE_SPEED = 196;

/** A pedestrian: position, a wander target, a panic timer and a walk-cycle phase. */
export function makePed(x, y, rng) {
  return {
    x, y, tx: x, ty: y,
    angle: rng.range(0, Math.PI * 2),
    speed: 0, panic: 0, phase: rng.range(0, 6),
    shirt: rng.pick(SHIRT_COLORS),
    skin: rng.pick(['#f2c79b', '#c68863', '#8a5a3b', '#6e4530', '#ffd9b3']),
    pants: rng.pick(['#33415c', '#5c374c', '#2e4a3d', '#725b3f', '#22252a']),
    dead: false, downTime: 0, hasTarget: false,
  };
}

/** A point a pedestrian would happily walk to: open ground near where they stand. */
function pickTarget(ped, city, rng) {
  for (let tries = 0; tries < 8; tries += 1) {
    const x = clamp(ped.x + rng.range(-340, 340), 20, WORLD.width - 20);
    const y = clamp(ped.y + rng.range(-340, 340), 20, WORLD.height - 20);
    if (!city.isBlocked(x, y, 12)) { ped.tx = x; ped.ty = y; ped.hasTarget = true; return; }
  }
  ped.hasTarget = false;
}

/** Spawn the crowd, clustered on the boardwalk, downtown and the marina. */
export function spawnPeds(city, rng, count) {
  const clusters = [
    { x: 380, y: 900, r: 700 }, { x: 1550, y: 800, r: 620 }, { x: 2900, y: 300, r: 420 },
    { x: 2250, y: 1400, r: 640 }, { x: 3700, y: 2700, r: 480 }, { x: 900, y: 2650, r: 520 },
  ];
  const peds = [];
  let guard = 0;
  while (peds.length < count && guard < count * 40) {
    guard += 1;
    const c = rng.pick(clusters);
    const x = clamp(c.x + rng.range(-c.r, c.r), 16, WORLD.width - 16);
    const y = clamp(c.y + rng.range(-c.r, c.r), 16, WORLD.height - 16);
    if (city.isBlocked(x, y, 12)) continue;
    peds.push(makePed(x, y, rng));
  }
  return peds;
}

/**
 * Move one pedestrian. Danger (a point and a radius) makes them flee; a fast car close by
 * makes them dive aside. Returns 'hit' when a car in `cars` ran them down this step.
 */
export function updatePed(ped, dt, city, rng, danger, cars) {
  if (ped.dead) { ped.downTime += dt; return null; }
  let vx = 0; let vy = 0;
  if (ped.panic > 0) {
    ped.panic -= dt;
    const dx = ped.x - danger.x; const dy = ped.y - danger.y;
    const d = Math.hypot(dx, dy) || 1;
    vx = (dx / d) * FLEE_SPEED; vy = (dy / d) * FLEE_SPEED;
    ped.angle = Math.atan2(vy, vx);
  } else {
    if (!ped.hasTarget || distanceSq(ped.x, ped.y, ped.tx, ped.ty) < 18 * 18) {
      if (rng.chance(0.012)) pickTarget(ped, city, rng);
    } else {
      const dx = ped.tx - ped.x; const dy = ped.ty - ped.y;
      const d = Math.hypot(dx, dy) || 1;
      vx = (dx / d) * PED_SPEED; vy = (dy / d) * PED_SPEED;
      ped.angle = Math.atan2(vy, vx);
    }
  }
  // Dive away from anything with an engine moving fast toward them.
  for (const car of cars) {
    if (car.dead || Math.abs(car.speed) < 120) continue;
    const d2 = distanceSq(ped.x, ped.y, car.x, car.y);
    if (d2 < 62 * 62) {
      const dx = ped.x - car.x; const dy = ped.y - car.y;
      const d = Math.sqrt(d2) || 1;
      vx += (dx / d) * 240; vy += (dy / d) * 240;
      ped.panic = Math.max(ped.panic, 0.7);
    }
    if (d2 < (car.radius + 9) * (car.radius + 9)) return 'hit';
  }
  ped.speed = Math.hypot(vx, vy);
  if (ped.speed > 1) {
    ped.phase += dt * ped.speed * 0.09;
    const fixed = city.collideCircle(ped.x + vx * dt, ped.y + vy * dt, 10);
    ped.x = fixed.x; ped.y = fixed.y;
  }
  return null;
}

/** Alarm every pedestrian near a frightening event (a shot, a crash, a siren's wail). */
export function scarePeds(peds, x, y, radius) {
  for (const ped of peds) {
    if (!ped.dead && distanceSq(ped.x, ped.y, x, y) < radius * radius) ped.panic = Math.max(ped.panic, 2.6);
  }
}

/** Is any living pedestrian close enough to (x, y) to witness what happens there? */
export function witnessedBy(peds, x, y, radius = 300) {
  return peds.some((ped) => !ped.dead && distanceSq(ped.x, ped.y, x, y) < radius * radius);
}

/** Pedestrians prefer pavements: true when this one is standing on asphalt. */
export function pedOnRoad(ped) { return isOnRoad(ped.x, ped.y); }
