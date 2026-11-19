// Solano Heat — the game itself: Marina Vega in Port Solano. This module owns the world
// state and the loop: the player on foot and behind the wheel, traffic and pedestrians,
// police pressure, gunfire, crashes, cash, saving — and it is the `host` the mission
// runner talks to (dialog, banners, payouts, mission cars).

import { VIEW, WORLD, PLAYER, HEAT, STEP } from './config.js';
import { Rng, clamp, distance, distanceSq } from './rng.js';
import { buildCity, PLAYER_START, DARIO_SPOT, GARAGE_ZONE, SPECIALS, PD_DOOR, CLINIC_DOOR } from './city.js';
import { Input } from './input.js';
import { SoundFX } from './audio.js';
import { Renderer } from './render.js';
import { makeCar, stepCar, spawnTraffic, spawnParked, updateTrafficCar, CAR_TYPES } from './vehicles.js';
import { spawnPeds, updatePed, scarePeds, witnessedBy, makePed } from './people.js';
import { Police } from './police.js';
import { Missions } from './missions.js';
import { stageShot } from './shots.js';

const SAVE_KEY = 'solano-heat-save-v1';

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.city = buildCity();
    this.rng = new Rng(977351);
    this.input = new Input(canvas);
    this.sfx = new SoundFX();
    this.renderer = new Renderer(canvas, this.city);
    this.police = new Police(this.city, this.rng);
    this.missions = new Missions(this);
    this.screen = 'title';
    this.time = 0;
    this.resetWorld();
    // Menus.
    this.menuIndex = 0;
    this.pauseIndex = 0;
    this.pauseItems = [
      { label: 'Resume', act: () => { this.screen = 'play'; } },
      { label: 'Save game', act: () => { this.save(); this.showBanner('SAVED', 'Port Solano remembers.'); } },
      { label: 'Restart current job', act: () => { this.restartMission(); this.screen = 'play'; } },
      { label: 'Quit to title', act: () => { this.screen = 'title'; } },
    ];
    this.refreshMenu();
    // Screenshot staging (?shot=chase etc.) for the maker's own captures.
    const shot = new URLSearchParams(location.search).get('shot');
    this.shotMode = !!shot;
    if (shot) stageShot(this, shot);
    const unlock = () => this.sfx.unlock();
    window.addEventListener('keydown', unlock);
    window.addEventListener('mousedown', unlock);
  }

  /** A fresh Port Solano: full traffic, a crowd, Marina on the boardwalk, empty pockets. */
  resetWorld() {
    this.cars = [
      ...spawnTraffic(this.city, this.rng, 15, PLAYER_START, 420),
      ...spawnParked(this.city, this.rng, 26),
    ];
    this.peds = spawnPeds(this.city, this.rng, 42);
    this.police.cars = [];
    this.police.clear();
    this.player = {
      x: PLAYER_START.x, y: PLAYER_START.y, angle: -Math.PI / 2, speed: 0, phase: 0,
      health: PLAYER.health, inCar: false, car: null, carName: '',
      aiming: false, aimAngle: 0, muzzle: 0, fireCd: 0, hurtCd: 0, vx: 0, vy: 0,
    };
    this.dario = { x: DARIO_SPOT.x, y: DARIO_SPOT.y };
    this.money = 20;
    this.camera = { x: clamp(this.player.x - VIEW.width / 2, 0, WORLD.width - VIEW.width), y: clamp(this.player.y - VIEW.height / 2, 0, WORLD.height - VIEW.height) };
    this.particles = [];
    this.tracers = [];
    this.skids = [];
    this.dialogState = null;
    this.dialogQueue = [];
    this.dialogDone = null;
    this.bannerState = null;
    this.splash = null;
    this.prompt = '';
    this.hurtFlash = 0;
    this.crimeCd = 0;
    this.retryArmed = false;
    this.lastFailed = null;
    this.saveTimer = 0;
    this.missions.index = 0;
    this.missions.storyDone = false;
    this.missions.active = false;
    this.missions.sideJob = null;
    this.missions.stageCar = null;
    this.missions.betweenTimer = 0;
  }

  refreshMenu() {
    const hasSave = !!this.loadData();
    this.menuItems = [{ label: 'New game', act: () => this.newGame() }];
    if (hasSave) this.menuItems.push({ label: 'Continue', act: () => this.continueGame() });
    this.menuItems.push({ label: 'How to play', act: () => { this.screen = 'howto'; } });
    if (this.menuIndex >= this.menuItems.length) this.menuIndex = 0;
  }

  newGame() {
    this.resetWorld();
    this.screen = 'play';
    this.missions.begin();
    this.sfx.click();
  }

  continueGame() {
    const data = this.loadData();
    this.resetWorld();
    if (data) {
      this.money = data.money || 0;
      this.missions.loadState(data.missions || {});
      if (data.player) {
        const spot = this.city.collideCircle(data.player.x, data.player.y, PLAYER.radius);
        this.player.x = spot.x; this.player.y = spot.y;
      }
    }
    this.screen = 'play';
    if (!this.missions.storyDone) this.missions.begin();
    else this.missions.betweenTimer = 3;
    this.sfx.click();
  }

  restartMission() {
    if (this.missions.stageCar) { this.removeCar(this.missions.stageCar); this.missions.stageCar = null; }
    this.police.clear();
    this.missions.active = false;
    this.missions.begin();
  }

  // — The mission runner's host services —
  playerPos() { return this.player; }
  playerInCar(car) { return this.player.inCar && this.player.car === car; }
  pay(amount) { this.money += amount; }
  banner(title, sub) { this.showBanner(title, sub); }
  dialog(lines, onDone) {
    for (const line of lines) this.dialogQueue.push(line);
    if (!this.dialogState) this.nextDialog();
    if (onDone) this.dialogDone = onDone;
  }
  nextDialog() {
    this.dialogState = this.dialogQueue.shift() || null;
    if (!this.dialogState && this.dialogDone) { const cb = this.dialogDone; this.dialogDone = null; cb(); }
  }
  spawnMissionCar(x, y, angle, type, color) {
    const car = makeCar(x, y, angle, color, type, 'mission');
    this.cars.push(car);
    return car;
  }
  removeCar(car) {
    car.dead = true;
    this.cars = this.cars.filter((c) => c !== car);
    if (this.player.car === car) { this.player.inCar = false; this.player.car = null; }
  }
  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        money: this.money,
        missions: this.missions.saveState(),
        player: { x: Math.round(this.player.x), y: Math.round(this.player.y) },
      }));
    } catch { /* private mode: play on without saving */ }
  }
  loadData() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  showBanner(title, sub, dur = 2.8) { this.bannerState = { title, sub: sub || '', t: 0, dur }; }
  showSplash(text, sub, color) { this.splash = { text, sub, color, t: 0, dur: 2.4 }; }

  /** Entry point: fixed-step simulation, one render per animation frame. */
  run() {
    let last = performance.now();
    let acc = 0;
    const frame = (now) => {
      let dt = (now - last) / 1000;
      last = now;
      dt = Math.min(dt, 0.1);
      if (this.frozen) {
        // A staged screenshot scene: the frame is held exactly as it was composed.
      } else if (this.screen === 'play' && !this.dialogState && !this.splash) {
        acc += dt;
        while (acc >= STEP) { this.stepWorld(STEP); acc -= STEP; }
      } else if (this.screen === 'title' || this.screen === 'howto') {
        this.time += dt;
        this.ambientStep(dt);
      }
      if (this.bannerState) { this.bannerState.t += dt; if (this.bannerState.t > this.bannerState.dur) this.bannerState = null; }
      if (this.splash) {
        this.splash.t += dt;
        if (this.splash.t > this.splash.dur) { this.splash = null; this.afterSplash(); }
      }
      this.handleMenus();
      this.renderer.draw(this);
      this.input.endFrame();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  /** The title backdrop stays alive: traffic rolls, people stroll, nobody commits crimes. */
  ambientStep(dt) {
    for (const car of this.cars) {
      if (car.kind === 'traffic' && car.driver === 'ai') updateTrafficCar(car, dt, this.city, this.cars, this.rng);
    }
    for (const ped of this.peds) updatePed(ped, dt, this.city, this.rng, { x: -9999, y: -9999 }, []);
    const t = this.time * 0.05;
    this.camera.x = clamp(60 + Math.sin(t) * 30, 0, WORLD.width - VIEW.width);
    this.camera.y = clamp(500 + (Math.sin(t * 0.7) * 0.5 + 0.5) * 1500, 0, WORLD.height - VIEW.height);
  }

  handleMenus() {
    const input = this.input;
    if (input.justPressed('m')) { this.sfx.setMuted(!this.sfx.muted); }
    if (this.screen === 'title') {
      const up = input.justPressed('w', 'arrowup');
      const down = input.justPressed('s', 'arrowdown');
      if (up || down) {
        this.menuIndex = (this.menuIndex + (down ? 1 : -1) + this.menuItems.length) % this.menuItems.length;
        this.sfx.click();
      }
      if (input.justPressed('enter', 'e', ' ')) this.menuItems[this.menuIndex].act();
    } else if (this.screen === 'howto') {
      if (input.justPressed('escape', 'enter', 'e')) { this.screen = 'title'; this.sfx.click(); }
    } else if (this.screen === 'pause') {
      const up = input.justPressed('w', 'arrowup');
      const down = input.justPressed('s', 'arrowdown');
      if (up || down) {
        this.pauseIndex = (this.pauseIndex + (down ? 1 : -1) + this.pauseItems.length) % this.pauseItems.length;
        this.sfx.click();
      }
      if (input.justPressed('enter', 'e')) this.pauseItems[this.pauseIndex].act();
      if (input.justPressed('escape', 'p')) this.screen = 'play';
    } else if (this.screen === 'play') {
      if (this.dialogState && input.justPressed('e', 'enter', ' ')) { this.nextDialog(); this.sfx.click(); }
      else if (!this.dialogState && input.justPressed('escape', 'p')) { this.screen = 'pause'; this.pauseIndex = 0; }
    }
  }

  /** One fixed simulation step of the whole world. */
  stepWorld(dt) {
    this.time += dt;
    const p = this.player;
    this.crimeCd = Math.max(0, this.crimeCd - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 1.8);
    this.missions.update(dt);
    if (this.retryArmed && this.input.justPressed('r')) this.missions.retry();
    if (p.inCar) this.stepDriving(dt); else this.stepOnFoot(dt);
    // Traffic only simmers near Marina; the far side of the city holds its breath.
    const allCars = [...this.cars, ...this.police.cars];
    for (const car of this.cars) {
      if (car.kind === 'traffic' && car.driver === 'ai' && !car.dead
        && distanceSq(car.x, car.y, p.x, p.y) < 1650 * 1650) {
        updateTrafficCar(car, dt, this.city, allCars, this.rng);
      }
    }
    const danger = { x: p.x, y: p.y };
    for (const ped of this.peds) {
      if (distanceSq(ped.x, ped.y, p.x, p.y) > 1300 * 1300) continue;
      const hit = updatePed(ped, dt, this.city, this.rng, danger, allCars);
      if (hit === 'hit' && !ped.dead) this.pedRunDown(ped, allCars);
    }
    this.police.update(dt, { x: p.x, y: p.y, vx: p.vx, vy: p.vy, speed: p.inCar ? p.car.speed : p.speed, inCar: p.inCar }, this.sfx);
    this.carCarCollisions(allCars);
    this.playerCarBumps(allCars);
    if (this.police.pinTime > 2.4 && this.screen === 'play') this.busted();
    // Particles, tracers, skid marks.
    for (const fx of this.particles) {
      fx.life -= dt;
      fx.x += fx.vx * dt; fx.y += fx.vy * dt;
      fx.vx *= 0.92; fx.vy *= 0.92;
    }
    this.particles = this.particles.filter((fx) => fx.life > 0);
    for (const t of this.tracers) t.life -= dt;
    this.tracers = this.tracers.filter((t) => t.life > 0);
    for (const s of this.skids) s.alpha -= dt * 0.02;
    this.skids = this.skids.filter((s) => s.alpha > 0.05);
    // Camera: follow with a little look-ahead at speed.
    const look = p.inCar ? 0.34 : 0.12;
    const tx = clamp(p.x + p.vx * look - VIEW.width / 2, 0, WORLD.width - VIEW.width);
    const ty = clamp(p.y + p.vy * look - VIEW.height / 2, 0, WORLD.height - VIEW.height);
    this.camera.x += (tx - this.camera.x) * Math.min(1, dt * 5.2);
    this.camera.y += (ty - this.camera.y) * Math.min(1, dt * 5.2);
    this.computePrompt();
    this.saveTimer += dt;
    if (this.saveTimer > 20) { this.saveTimer = 0; this.save(); }
  }

  stepOnFoot(dt) {
    const p = this.player;
    const input = this.input;
    let mx = 0; let my = 0;
    if (input.held('w', 'arrowup')) my -= 1;
    if (input.held('s', 'arrowdown')) my += 1;
    if (input.held('a', 'arrowleft')) mx -= 1;
    if (input.held('d', 'arrowright')) mx += 1;
    const moving = mx !== 0 || my !== 0;
    const run = input.held('shift');
    const speed = run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    if (moving) {
      const len = Math.hypot(mx, my);
      mx /= len; my /= len;
      p.angle = Math.atan2(my, mx);
    }
    p.vx = mx * (moving ? speed : 0);
    p.vy = my * (moving ? speed : 0);
    p.speed = moving ? speed : 0;
    p.phase += dt * (moving ? speed * 0.075 : 0);
    const fixed = this.city.collideCircle(p.x + p.vx * dt, p.y + p.vy * dt, PLAYER.radius);
    p.x = fixed.x; p.y = fixed.y;
    // Cars are solid to lean on.
    for (const car of [...this.cars, ...this.police.cars]) {
      if (car.dead) continue;
      const d2 = distanceSq(p.x, p.y, car.x, car.y);
      const rr = car.radius + PLAYER.radius - 4;
      if (d2 < rr * rr && d2 > 0.01) {
        const d = Math.sqrt(d2);
        p.x = car.x + ((p.x - car.x) / d) * rr;
        p.y = car.y + ((p.y - car.y) / d) * rr;
      }
    }
    // Aim and fire.
    const wx = this.camera.x + input.mouse.x;
    const wy = this.camera.y + input.mouse.y;
    p.aiming = input.mouse.down;
    if (p.aiming) p.aimAngle = Math.atan2(wy - p.y, wx - p.x);
    if (p.aiming) p.angle = p.aimAngle;
    p.fireCd = Math.max(0, p.fireCd - dt);
    p.muzzle = Math.max(0, p.muzzle - dt);
    if (input.mouse.down && p.fireCd <= 0) { this.shoot(); p.fireCd = 0.21; }
    p.hurtCd = Math.max(0, p.hurtCd - dt);
    // Doors and offers.
    if (input.justPressed('e')) {
      const car = this.nearestEnterableCar();
      if (car) return this.enterCar(car);
      if (distance(p.x, p.y, CLINIC_DOOR.x, CLINIC_DOOR.y) < 52 && p.health < 100) return this.useClinic();
      if (this.inGarageZone(p.x, p.y)) return this.showBanner('THE GARAGE', 'Bring a car in — resprays and repairs happen here.');
    }
  }

  stepDriving(dt) {
    const p = this.player;
    const car = p.car;
    const input = this.input;
    const control = {
      throttle: (input.held('w', 'arrowup') ? 1 : 0) + (input.held('s', 'arrowdown') ? -1 : 0),
      steer: (input.held('a', 'arrowleft') ? -1 : 0) + (input.held('d', 'arrowright') ? 1 : 0),
      handbrake: input.held(' '),
    };
    const impact = stepCar(car, control, dt, this.city);
    p.x = car.x; p.y = car.y;
    p.vx = Math.cos(car.angle) * car.speed;
    p.vy = Math.sin(car.angle) * car.speed;
    p.angle = car.angle;
    this.sfx.setEngine(true, Math.abs(car.speed) / car.maxSpeed);
    if (impact > 175) {
      car.health -= (impact - 175) * 0.11;
      this.hurt((impact - 175) * 0.028);
      this.sfx.crash(impact > 290);
      this.burst(car.x, car.y, 8, '#c9c2b4', 130);
      scarePeds(this.peds, car.x, car.y, 210);
    }
    // Skid marks and the odd scream of rubber.
    const rearX = car.x - Math.cos(car.angle) * car.w * 0.32;
    const rearY = car.y - Math.sin(car.angle) * car.w * 0.32;
    if ((control.handbrake && Math.abs(car.speed) > 130) || (Math.abs(control.steer) > 0 && Math.abs(car.speed) > 330)) {
      this.skids.push({ x1: rearX - Math.sin(car.angle) * 8, y1: rearY + Math.cos(car.angle) * 8, x2: rearX + Math.sin(car.angle) * 8, y2: rearY - Math.cos(car.angle) * 8, alpha: 0.5 });
      if (this.skids.length > 420) this.skids.shift();
      if (Math.random() < 0.3) this.sfx.skid();
    }
    if (car.health <= 0 && !car.dead) {
      car.dead = true;
      this.exitCar(true);
      this.showBanner('WRECKED', 'The car gives up. Marina walks away.');
      this.burst(car.x, car.y, 22, '#3a3a3a', 90);
    }
    if (input.justPressed('e')) {
      if (this.inGarageZone(car.x, car.y)) return this.useGarage();
      if (Math.abs(car.speed) < 55) return this.exitCar(false);
    }
  }

  nearestEnterableCar() {
    const p = this.player;
    let best = null; let bestD = 58;
    for (const car of this.cars) {
      if (car.dead) continue;
      const d = distance(p.x, p.y, car.x, car.y) - car.radius;
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  enterCar(car) {
    const p = this.player;
    const wasOwned = car.driver === 'player';
    if (car.driver === 'ai') {
      // The owner bails out and runs: a witness with a story.
      const ped = makePed(car.x + 22, car.y + 12, this.rng);
      ped.panic = 3;
      this.peds.push(ped);
      if (this.peds.length > 90) this.peds.splice(0, this.peds.length - 90);
    }
    const isTheft = !wasOwned && car.kind !== 'mission';
    const missionTheft = !wasOwned && car.kind === 'mission';
    p.inCar = true;
    p.car = car;
    p.carName = CAR_TYPES[car.type].name;
    car.driver = 'player';
    if (car.kind === 'traffic') car.kind = 'player';
    this.sfx.door();
    if ((isTheft || missionTheft) && this.crimeCd <= 0) {
      if (witnessedBy(this.peds, car.x, car.y, 320) || this.police.nearestDist(car.x, car.y) < 560) {
        this.police.addHeat(HEAT.stealCar);
        this.crimeCd = 2;
        this.showBanner('STOLEN', 'Someone saw that.');
      }
    }
    // The mission runner notices mission cars itself (its steal stage watches for it).
    this.missions.update(0);
  }

  exitCar(ejected) {
    const p = this.player;
    const car = p.car;
    if (!car) return;
    this.sfx.setEngine(false, 0);
    if (!ejected) this.sfx.door();
    const side = { x: car.x + Math.cos(car.angle - Math.PI / 2) * (car.radius + 16), y: car.y + Math.sin(car.angle - Math.PI / 2) * (car.radius + 16) };
    const spot = this.city.collideCircle(side.x, side.y, PLAYER.radius);
    p.x = spot.x; p.y = spot.y;
    p.inCar = false;
    p.car = null;
    p.vx = 0; p.vy = 0;
    if (car.kind === 'player') car.kind = 'parked';
    car.driver = null;
    car.speed *= 0.25; // left cars settle instead of ghost-rolling
  }

  inGarageZone(x, y) {
    return x >= GARAGE_ZONE.x && x <= GARAGE_ZONE.x + GARAGE_ZONE.w && y >= GARAGE_ZONE.y && y <= GARAGE_ZONE.y + GARAGE_ZONE.h;
  }

  useGarage() {
    const car = this.player.car;
    const cost = 150;
    if (this.police.heat <= 0.02 && car.health > 92) {
      this.showBanner('THE GARAGE', 'Nothing to fix. Dario nods approvingly.');
      return;
    }
    if (this.money < cost) { this.showBanner('THE GARAGE', 'Respray and repair: $150. You are short.'); return; }
    this.money -= cost;
    this.police.clear();
    for (const cop of this.police.cars) cop.mode = 'leave';
    car.health = 100;
    car.color = ['#d64541', '#3f7fbf', '#e0a51f', '#59a96a'][Math.floor(Math.random() * 4)];
    this.sfx.cash();
    this.showBanner('RESPRAYED', 'New paint, no heat, no dents. $150 well spent.');
    this.save();
  }

  useClinic() {
    if (this.money >= 50) this.money -= 50;
    this.player.health = PLAYER.health;
    this.sfx.pickup();
    this.showBanner('CLÍNICA SOLANO', 'Patched up. Try to keep the blood inside this time.');
  }

  shoot() {
    const p = this.player;
    p.muzzle = 0.07;
    this.sfx.gunshot();
    scarePeds(this.peds, p.x, p.y, 330);
    const range = 470;
    let endX = p.x + Math.cos(p.aimAngle) * range;
    let endY = p.y + Math.sin(p.aimAngle) * range;
    let bestT = range;
    // Walls stop the bullet.
    for (let t = 12; t < range; t += 9) {
      const x = p.x + Math.cos(p.aimAngle) * t;
      const y = p.y + Math.sin(p.aimAngle) * t;
      if (this.city.isBlocked(x, y, 3)) { bestT = t; break; }
    }
    endX = p.x + Math.cos(p.aimAngle) * bestT;
    endY = p.y + Math.sin(p.aimAngle) * bestT;
    // Then people and cars along the line, nearest first.
    let hitPed = null; let hitCar = null; let hitT = bestT;
    const test = (x, y, r) => {
      const dx = x - p.x; const dy = y - p.y;
      const along = dx * Math.cos(p.aimAngle) + dy * Math.sin(p.aimAngle);
      if (along < 8 || along > hitT) return -1;
      const side = Math.abs(-dx * Math.sin(p.aimAngle) + dy * Math.cos(p.aimAngle));
      return side < r ? along : -1;
    };
    for (const ped of this.peds) {
      if (ped.dead) continue;
      const t = test(ped.x, ped.y, 11);
      if (t > 0) { hitT = t; hitPed = ped; hitCar = null; }
    }
    for (const car of [...this.cars, ...this.police.cars]) {
      if (car.dead) continue;
      const t = test(car.x, car.y, car.radius);
      if (t > 0) { hitT = t; hitCar = car; hitPed = null; }
    }
    endX = p.x + Math.cos(p.aimAngle) * hitT;
    endY = p.y + Math.sin(p.aimAngle) * hitT;
    this.tracers.push({ x1: p.x + Math.cos(p.aimAngle) * 18, y1: p.y + Math.sin(p.aimAngle) * 18, x2: endX, y2: endY, life: 0.09 });
    const seen = witnessedBy(this.peds, p.x, p.y, 330) || this.police.nearestDist(p.x, p.y) < HEAT.sightRange;
    if (hitPed) {
      hitPed.dead = true;
      hitPed.downTime = 0;
      this.burst(hitPed.x, hitPed.y, 10, '#a33327', 110);
      if (seen) { this.police.addHeat(HEAT.killPedestrian); this.crimeCd = 2; }
    } else if (hitCar) {
      hitCar.health -= 9;
      this.burst(endX, endY, 5, '#ffd98a', 120);
      if (seen && this.crimeCd <= 0) { this.police.addHeat(HEAT.gunshotSeen); this.crimeCd = 1.4; }
    } else if (seen && this.crimeCd <= 0) {
      this.police.addHeat(HEAT.gunshotSeen);
      this.crimeCd = 1.4;
    }
  }

  pedRunDown(ped, allCars) {
    let hitter = null; let best = Infinity;
    for (const car of allCars) {
      const d = distanceSq(ped.x, ped.y, car.x, car.y);
      if (d < best) { best = d; hitter = car; }
    }
    ped.dead = true;
    ped.downTime = 0;
    this.burst(ped.x, ped.y, 12, '#a33327', 140);
    this.sfx.crash(false);
    scarePeds(this.peds, ped.x, ped.y, 260);
    if (hitter && hitter === this.player.car && this.player.inCar) {
      if (witnessedBy(this.peds, ped.x, ped.y, 340) || this.police.nearestDist(ped.x, ped.y) < HEAT.sightRange) {
        this.police.addHeat(HEAT.killPedestrian);
      } else this.police.addHeat(HEAT.hitPedestrian * 0.5);
    }
  }

  carCarCollisions(allCars) {
    for (let i = 0; i < allCars.length; i += 1) {
      const a = allCars[i];
      if (a.dead) continue;
      for (let j = i + 1; j < allCars.length; j += 1) {
        const b = allCars[j];
        if (b.dead) continue;
        const dx = b.x - a.x; const dy = b.y - a.y;
        const rr = a.radius + b.radius - 6;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr || d2 < 0.01) continue;
        const d = Math.sqrt(d2);
        const push = (rr - d) / 2;
        const nx = dx / d; const ny = dy / d;
        const aMovable = a.driver !== null || a.kind === 'traffic';
        const bMovable = b.driver !== null || b.kind === 'traffic';
        if (aMovable || a === this.player.car) { a.x -= nx * push; a.y -= ny * push; }
        if (bMovable || b === this.player.car) { b.x += nx * push; b.y += ny * push; }
        const relSpeed = Math.abs(a.speed - b.speed);
        if (relSpeed > 130) {
          const dmg = (relSpeed - 130) * 0.05;
          a.health -= dmg; b.health -= dmg;
          this.sfx.crash(relSpeed > 260);
          this.burst((a.x + b.x) / 2, (a.y + b.y) / 2, 7, '#c9c2b4', 120);
          if ((a === this.player.car || b === this.player.car) && this.player.inCar) {
            this.hurt((relSpeed - 130) * 0.02);
            const other = a === this.player.car ? b : a;
            if (relSpeed > 210 && this.crimeCd <= 0 && other.kind !== 'police'
              && (witnessedBy(this.peds, a.x, a.y, 320) || this.police.nearestDist(a.x, a.y) < HEAT.sightRange)) {
              this.police.addHeat(HEAT.hitCarHard);
              this.crimeCd = 2;
            }
          }
          const swap = (a.speed + b.speed) / 2;
          a.speed = swap * 0.7; b.speed = swap * 0.7;
        }
      }
    }
  }

  /** Moving cars shove Marina aside and hurt her when she is on foot. */
  playerCarBumps(allCars) {
    const p = this.player;
    if (p.inCar || p.hurtCd > 0) return;
    for (const car of allCars) {
      if (car.dead || Math.abs(car.speed) < 90) continue;
      if (distanceSq(p.x, p.y, car.x, car.y) < (car.radius + 10) * (car.radius + 10)) {
        const d = Math.max(12, distance(p.x, p.y, car.x, car.y));
        p.x += ((p.x - car.x) / d) * 26;
        p.y += ((p.y - car.y) / d) * 26;
        this.hurt(16);
        p.hurtCd = 0.9;
        this.sfx.crash(false);
        break;
      }
    }
  }

  hurt(amount) {
    const p = this.player;
    p.health -= amount;
    this.hurtFlash = Math.min(1, this.hurtFlash + amount * 0.05 + 0.25);
    if (p.health <= 0 && !this.splash) {
      p.health = 0;
      this.showSplash('WASTED', 'The clinic bill comes out of your pocket.', '#d64541');
      this.sfx.wasted();
      this.sfx.setEngine(false, 0);
    }
  }

  busted() {
    const fine = Math.min(this.money, 200);
    this.money -= fine;
    this.showSplash('BUSTED', fine > 0 ? 'The Solano PD fine you $' + fine + ' and take your morning.' : 'The Solano PD take your morning. You had no cash to fine.');
    this.sfx.busted();
    this.sfx.setEngine(false, 0);
  }

  afterSplash() {
    const p = this.player;
    const wasted = p.health <= 0;
    if (p.inCar) { p.inCar = false; p.car.driver = null; if (p.car.kind === 'player') p.car.kind = 'parked'; p.car = null; }
    this.police.clear();
    this.police.cars = [];
    if (!wasted) {
      p.x = PD_DOOR.x; p.y = PD_DOOR.y;
    } else {
      p.x = CLINIC_DOOR.x; p.y = CLINIC_DOOR.y;
      p.health = PLAYER.health;
      this.money = Math.max(0, this.money - 150);
    }
    p.vx = 0; p.vy = 0;
    this.camera.x = clamp(p.x - VIEW.width / 2, 0, WORLD.width - VIEW.width);
    this.camera.y = clamp(p.y - VIEW.height / 2, 0, WORLD.height - VIEW.height);
    this.save();
  }

  burst(x, y, count, color, speed) {
    for (let i = 0; i < count; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const s = Math.random() * speed;
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4 + Math.random() * 0.4, maxLife: 0.8, color, size: 2 + Math.random() * 3 });
    }
  }

  computePrompt() {
    const p = this.player;
    if (this.screen !== 'play' || this.dialogState) { this.prompt = ''; return; }
    if (p.inCar) {
      this.prompt = this.inGarageZone(p.car.x, p.car.y) ? 'E — Garage: respray + repair ($150)' : '';
      return;
    }
    const car = this.nearestEnterableCar();
    if (car) { this.prompt = 'E — Take the ' + CAR_TYPES[car.type].name; return; }
    if (distance(p.x, p.y, CLINIC_DOOR.x, CLINIC_DOOR.y) < 52 && p.health < 100) { this.prompt = 'E — Clínica Solano: heal ($50)'; return; }
    if (this.inGarageZone(p.x, p.y)) { this.prompt = 'Dario\u2019s Garage — bring a car onto the apron'; return; }
    if (this.retryArmed) { this.prompt = 'R — Retry the job'; return; }
    this.prompt = '';
  }
}

// Boot: size the canvas, build the game, start the loop.
const canvas = document.getElementById('game');
canvas.width = VIEW.width;
canvas.height = VIEW.height;
const game = new Game(canvas);
window.__GAME = game;
game.run();
