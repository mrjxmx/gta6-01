// Solano Heat — cars: the shared arcade physics every driver uses (player, traffic,
// police), the traffic system that keeps Port Solano's roads alive, and the parked cars
// waiting to be borrowed. A car is a plain object; who drives it is a field, not a class.

import { CAR_COLORS } from './config.js';
import { clamp, turnToward, angleDelta, distanceSq } from './rng.js';
import { V_ROADS, H_ROADS, ROAD_HALF, LANE_OFFSET, randomRoadPoint, isOnRoad } from './city.js';

/** Body styles: size, pace and toughness vary so stealing a truck feels unlike a coupe. */
export const CAR_TYPES = {
  coupe: { w: 46, h: 21, maxSpeed: 468, accel: 300, name: 'Cielo Coupe' },
  sedan: { w: 48, h: 22, maxSpeed: 408, accel: 252, name: 'Meridian Sedan' },
  hatch: { w: 42, h: 20, maxSpeed: 372, accel: 240, name: 'Palma Hatch' },
  wagon: { w: 50, h: 22, maxSpeed: 384, accel: 228, name: 'Surfrider Wagon' },
  truck: { w: 56, h: 25, maxSpeed: 336, accel: 204, name: 'Dockmaster Truck' },
  van: { w: 54, h: 24, maxSpeed: 348, accel: 210, name: 'Cargo Van' },
};
const TYPE_NAMES = Object.keys(CAR_TYPES);

export function makeCar(x, y, angle, color, type = 'sedan', kind = 'traffic') {
  const spec = CAR_TYPES[type];
  return {
    x, y, angle, speed: 0, type, kind, color,
    w: spec.w, h: spec.h, radius: spec.w * 0.46,
    maxSpeed: spec.maxSpeed, accel: spec.accel,
    health: 100, driver: kind === 'parked' ? null : 'ai',
    route: null, targetSpeed: 0, lightPhase: Math.random() * 6,
    honkAt: 0, dead: false,
  };
}

/**
 * One physics step for a driven car. control: throttle -1..1, steer -1..1, handbrake.
 * Returns the impact speed when the car struck a building this step (0 when it did not),
 * so the caller can price the crash in damage and noise.
 */
export function stepCar(car, control, dt, city) {
  const throttle = clamp(control.throttle, -1, 1);
  if (throttle > 0) car.speed += car.accel * throttle * dt;
  else if (throttle < 0) {
    if (car.speed > 24) car.speed += 430 * throttle * dt; // brake
    else car.speed += car.accel * 0.55 * throttle * dt; // reverse
  }
  // Rolling drag and air drag settle the car at its top speed and coast it to a stop.
  car.speed -= car.speed * 0.34 * dt;
  if (throttle === 0) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 66 * dt);
  if (control.handbrake) car.speed -= car.speed * 1.7 * dt;
  const maxReverse = car.maxSpeed * 0.32;
  car.speed = clamp(car.speed, -maxReverse, car.maxSpeed);
  const steerPower = clamp(car.speed / 130, -1, 1) * (control.handbrake ? 1.5 : 1);
  car.angle += clamp(control.steer, -1, 1) * 2.05 * steerPower * dt * (car.speed < 0 ? -1 : 1);
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const fixed = city.collideCircle(nx, ny, car.radius);
  let impact = 0;
  if (Math.abs(fixed.x - nx) > 0.5 || Math.abs(fixed.y - ny) > 0.5) {
    impact = Math.abs(car.speed);
    car.speed = -car.speed * 0.22;
  }
  car.x = fixed.x; car.y = fixed.y;
  return impact;
}

/** The lane centre line a car on this leg should hold: right-hand traffic, always. */
function laneCoord(car) {
  const r = car.route;
  if (r.axis === 'v') return r.c + (r.dir > 0 ? -LANE_OFFSET : LANE_OFFSET);
  return r.c + (r.dir > 0 ? LANE_OFFSET : -LANE_OFFSET);
}

function startLeg(car, axis, c, dir) {
  car.route = { axis, c, dir, decidedAt: -1 };
  car.targetSpeed = car.maxSpeed * 0.52;
}

/** Put a traffic car on a random road leg, facing along it. */
export function placeOnRoad(car, rng) {
  const p = randomRoadPoint(rng);
  const dir = rng.chance(0.5) ? 1 : -1;
  if (p.vertical) {
    startLeg(car, 'v', p.road.c, dir);
    car.x = laneCoord(car); car.y = p.y;
    car.angle = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  } else {
    startLeg(car, 'h', p.road.c, dir);
    car.x = p.x; car.y = laneCoord(car);
    car.angle = dir > 0 ? 0 : Math.PI;
  }
  car.speed = car.targetSpeed * 0.7;
}

/** Spawn the ambient traffic fleet, spread over the city and kept away from a point. */
export function spawnTraffic(city, rng, count, avoid, avoidDist) {
  const cars = [];
  let guard = 0;
  while (cars.length < count && guard < count * 30) {
    guard += 1;
    const car = makeCar(0, 0, 0, rng.pick(CAR_COLORS), rng.pick(TYPE_NAMES), 'traffic');
    placeOnRoad(car, rng);
    if (avoid && distanceSq(car.x, car.y, avoid.x, avoid.y) < avoidDist * avoidDist) continue;
    if (cars.some((o) => distanceSq(o.x, o.y, car.x, car.y) < 130 * 130)) continue;
    cars.push(car);
  }
  return cars;
}

/** Parked cars along the kerbs: unlocked, unalarmed, asking for it. */
export function spawnParked(city, rng, count) {
  const cars = [];
  let guard = 0;
  while (cars.length < count && guard < count * 40) {
    guard += 1;
    const p = randomRoadPoint(rng);
    const side = rng.chance(0.5) ? 1 : -1;
    const car = makeCar(0, 0, 0, rng.pick(CAR_COLORS), rng.pick(TYPE_NAMES), 'parked');
    if (p.vertical) {
      car.x = p.road.c + side * (ROAD_HALF - 17);
      car.y = p.y;
      car.angle = rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2;
    } else {
      car.x = p.x;
      car.y = p.road.c + side * (ROAD_HALF - 17);
      car.angle = rng.chance(0.5) ? 0 : Math.PI;
    }
    if (city.isBlocked(car.x, car.y, car.radius)) continue;
    if (cars.some((o) => distanceSq(o.x, o.y, car.x, car.y) < 120 * 120)) continue;
    cars.push(car);
  }
  return cars;
}

/** At an intersection, choose the next leg: mostly straight on, sometimes a turn. */
function chooseNextLeg(car, rng) {
  const r = car.route;
  const options = [{ axis: r.axis, c: r.c, dir: r.dir }];
  const cross = r.axis === 'v' ? H_ROADS : V_ROADS;
  for (const road of cross) {
    if (r.axis === 'v') {
      if (car.y < road.from || car.y > road.to) { /* not on this crossing */ }
    }
    options.push({ axis: r.axis === 'v' ? 'h' : 'v', c: road.c, dir: 1 });
    options.push({ axis: r.axis === 'v' ? 'h' : 'v', c: road.c, dir: -1 });
  }
  const choice = rng.chance(0.55) ? options[0] : rng.pick(options.slice(1));
  if (choice.axis !== r.axis || choice.c !== r.c) startLeg(car, choice.axis, choice.c, choice.dir);
  else r.decidedAt = choice.c;
}

/**
 * Drive one traffic car for a step: hold the lane, slow for the car ahead, turn at
 * junctions, and never leave the road network. `allCars` includes the player's car.
 */
export function updateTrafficCar(car, dt, city, allCars, rng) {
  const r = car.route;
  if (!r) { placeOnRoad(car, rng); return; }
  // Approaching the next crossing? Decide the next leg once per crossing.
  const cross = r.axis === 'v' ? H_ROADS : V_ROADS;
  const along = r.axis === 'v' ? car.y : car.x;
  for (const road of cross) {
    const d = (road.c - along) * r.dir;
    if (d > 0 && d < 26 && r.decidedAt !== road.c) { r.decidedAt = road.c; if (rng.chance(0.45)) chooseNextLeg(car, rng); }
  }
  // Aim at a look-ahead point on the lane line.
  const lane = laneCoord(car);
  const lookX = r.axis === 'v' ? lane : car.x + Math.cos(car.angle) * 96;
  const lookY = r.axis === 'v' ? car.y + Math.sin(car.angle) * 96 : lane;
  const desired = Math.atan2(lookY - car.y, lookX - car.x);
  car.angle = turnToward(car.angle, desired, 2.4 * dt);
  // Brake for anything ahead in the lane.
  let speed = car.targetSpeed;
  for (const other of allCars) {
    if (other === car || other.dead) continue;
    const dx = other.x - car.x; const dy = other.y - car.y;
    const ahead = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
    const side = Math.abs(-dx * Math.sin(car.angle) + dy * Math.cos(car.angle));
    if (ahead > 0 && ahead < 78 && side < 17) { speed = Math.min(speed, other.speed * 0.9); if (ahead < 44) speed = 0; }
  }
  car.speed += clamp(speed - car.speed, -320 * dt, 130 * dt);
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const fixed = city.collideCircle(nx, ny, car.radius);
  if (Math.abs(fixed.x - nx) > 1 || Math.abs(fixed.y - ny) > 1) {
    // Nudged off the road (a crash pushed it): rejoin the network.
    placeOnRoad(car, rng);
    return;
  }
  car.x = fixed.x; car.y = fixed.y;
  if (!isOnRoad(car.x, car.y)) placeOnRoad(car, rng);
}

/** Angle between a car's nose and a point, for AI steering decisions. */
export function headingTo(car, x, y) {
  return angleDelta(car.angle, Math.atan2(y - car.y, x - car.x));
}
