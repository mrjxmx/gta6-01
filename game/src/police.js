// Solano Heat — the Solano PD: a wanted-heat model (crimes add heat, hiding bleeds it
// away) and the patrol cars that answer it. Officers drive to intercept, ram a fleeing
// car, and box in a driver who stops; on foot they close in so the bust meter can fill.

import { HEAT } from './config.js';
import { clamp, angleDelta, distance, distanceSq } from './rng.js';
import { makeCar, stepCar } from './vehicles.js';
import { randomRoadPoint } from './city.js';

export class Police {
  constructor(city, rng) {
    this.city = city;
    this.rng = rng;
    this.heat = 0;
    this.cars = [];
    this.hiddenFor = 0;
    this.seenNow = false;
    this.spawnTimer = 0;
    /** Seconds the player has spent pinned by police: fills toward a bust. */
    this.pinTime = 0;
  }

  get stars() { return this.heat <= 0.02 ? 0 : Math.min(5, Math.ceil(this.heat)); }

  addHeat(amount) { this.heat = clamp(this.heat + amount, 0, HEAT.max); }
  setHeat(value) { this.heat = clamp(value, 0, HEAT.max); }
  clear() { this.heat = 0; this.pinTime = 0; }

  /** How many patrol cars the current wanted level keeps on the street. */
  wantedCars() { return this.stars; }

  nearestDist(x, y) {
    let best = Infinity;
    for (const car of this.cars) best = Math.min(best, distance(x, y, car.x, car.y));
    return best;
  }

  /** Spawn a patrol car on a road well away from the player, lights already on. */
  spawnOne(player) {
    for (let tries = 0; tries < 12; tries += 1) {
      const p = randomRoadPoint(this.rng);
      const d = distance(p.x, p.y, player.x, player.y);
      if (d < 640 || d > 1250) continue;
      const car = makeCar(p.x, p.y, 0, '#e8e8ea', 'sedan', 'police');
      car.maxSpeed = 452; car.accel = 306;
      car.mode = 'pursue';
      car.angle = Math.atan2(player.y - car.y, player.x - car.x);
      this.cars.push(car);
      return;
    }
  }

  /**
   * One step of the whole system. `player` is {x, y, speed, inCar}; `allCars` is every
   * car on the street (for collision between patrol cars and traffic, handled by main).
   */
  update(dt, player, sfx) {
    const stars = this.stars;
    // Sight: any officer with a clear line to the player inside sight range.
    this.seenNow = false;
    if (stars > 0) {
      for (const car of this.cars) {
        if (distanceSq(car.x, car.y, player.x, player.y) < HEAT.sightRange * HEAT.sightRange
          && this.city.lineOfSight(car.x, car.y, player.x, player.y)) { this.seenNow = true; break; }
      }
    }
    if (this.seenNow) this.hiddenFor = 0; else this.hiddenFor += dt;
    if (stars > 0 && this.hiddenFor > HEAT.decayDelaySec) {
      this.heat = Math.max(0, this.heat - HEAT.decayPerSec * dt);
    }
    // Reinforce or stand down to match the wanted level.
    this.spawnTimer -= dt;
    const pursuing = this.cars.filter((c) => c.mode === 'pursue').length;
    if (pursuing < this.wantedCars() && this.spawnTimer <= 0) {
      this.spawnOne(player);
      this.spawnTimer = 1.4;
    }
    if (stars === 0) for (const car of this.cars) car.mode = 'leave';

    let anyNear = false;
    for (const car of this.cars) {
      if (car.dead) continue; // a wrecked patrol car is scenery now
      car.lightPhase += dt * 7;
      if (car.mode === 'leave') {
        const away = Math.atan2(car.y - player.y, car.x - player.x);
        const steer = clamp(angleDelta(car.angle, away) * 2, -1, 1);
        stepCar(car, { throttle: 0.55, steer, handbrake: false }, dt, this.city);
        continue;
      }
      anyNear = anyNear || distanceSq(car.x, car.y, player.x, player.y) < 720 * 720;
      this.driveAt(car, player, dt);
    }
    // Despawn leavers who got far away, and any car hopelessly lost.
    this.cars = this.cars.filter((car) => {
      const d2 = distanceSq(car.x, car.y, player.x, player.y);
      if (car.mode === 'leave' && d2 > 950 * 950) return false;
      if (d2 > 2400 * 2400) return false;
      return true;
    });
    if (sfx) sfx.setSiren(anyNear && stars > 0, dt);
    // The bust pin: player nearly stopped with an officer right there.
    const pinned = stars > 0 && Math.abs(player.speed) < 26 && this.nearestDist(player.x, player.y) < 58;
    this.pinTime = pinned ? this.pinTime + dt : Math.max(0, this.pinTime - dt * 1.6);
  }

  /** Pursuit driving: aim at the player, lead a moving car, dodge buildings by probing. */
  driveAt(car, player, dt) {
    const lead = player.inCar ? 0.42 : 0.12;
    const tx = player.x + (player.vx || 0) * lead;
    const ty = player.y + (player.vy || 0) * lead;
    let desired = Math.atan2(ty - car.y, tx - car.x);
    // If a building blocks the nose, swing toward whichever side is open.
    const probeX = car.x + Math.cos(car.angle) * 84;
    const probeY = car.y + Math.sin(car.angle) * 84;
    if (this.city.isBlocked(probeX, probeY, 16)) {
      const left = desired - 0.85; const right = desired + 0.85;
      const lx = car.x + Math.cos(left) * 84; const ly = car.y + Math.sin(left) * 84;
      desired = this.city.isBlocked(lx, ly, 16) ? right : left;
    }
    const steer = clamp(angleDelta(car.angle, desired) * 2.4, -1, 1);
    const d = distance(car.x, car.y, player.x, player.y);
    // On foot, officers stop close rather than run Marina down; in a car, they ram.
    let throttle = 1;
    if (!player.inCar) {
      if (d < 52) throttle = 0;
      else if (d < 110) throttle = 0.45;
    } else if (d < 30 && Math.abs(player.speed) < 20) throttle = 0.25;
    const impact = stepCar(car, { throttle, steer, handbrake: false }, dt, this.city);
    if (impact > 240) car.health -= (impact - 240) * 0.05;
    if (car.health <= 0) car.dead = true;
  }
}
