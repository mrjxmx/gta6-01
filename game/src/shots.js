// Solano Heat — staged scenes for the maker's own screenshots (?shot=chase|street|mission|
// title). Each one builds a real moment of the real game — a chase mid-flight, a steal
// about to happen, a checkpoint run against the clock — runs the simulation forward a
// beat so wheels turn and lights flash, and leaves the frame exactly as gameplay made it.

import { VIEW, WORLD } from './config.js';
import { clamp } from './rng.js';
import { makeCar } from './vehicles.js';
import { makePed } from './people.js';

function settle(game, steps) {
  for (let i = 0; i < steps; i += 1) game.stepWorld(1 / 60);
}

function frameOn(game, x, y) {
  game.camera.x = clamp(x - VIEW.width / 2, 0, WORLD.width - VIEW.width);
  game.camera.y = clamp(y - VIEW.height / 2, 0, WORLD.height - VIEW.height);
}

function putPlayerInCar(game, car) {
  game.cars.push(car);
  game.player.inCar = true;
  game.player.car = car;
  game.player.carName = 'Cielo Coupe';
  game.player.x = car.x;
  game.player.y = car.y;
  car.driver = 'player';
}

function patrolCar(game, x, y, angle, phase) {
  const car = makeCar(x, y, angle, '#e8e8ea', 'sedan', 'police');
  car.maxSpeed = 452; car.accel = 306;
  car.mode = 'pursue';
  car.lightPhase = phase;
  game.police.cars.push(car);
  return car;
}

/** The cover: four stars over Avenida Central, the garage the only way out. */
function stageChase(game) {
  game.screen = 'play';
  const car = makeCar(1980, 1768, 0, '#d64541', 'coupe', 'player');
  car.speed = 330;
  putPlayerInCar(game, car);
  game.player.health = 82;
  game.money = 1450;
  game.police.setHeat(3.4);
  patrolCar(game, 1700, 1742, 0.1, 0);
  patrolCar(game, 1760, 1798, -0.08, 2.4);
  patrolCar(game, 1560, 1766, 0.03, 4.6);
  const third = patrolCar(game, 1830, 1652, 0.6, 1.2);
  third.speed = 240;
  for (const cop of game.police.cars) if (cop !== third) cop.speed = 300;
  // The story so far: job four went loud, and the garage is the finish line.
  game.missions.index = 3;
  game.missions.active = true;
  game.missions.stageIndex = 2;
  // A trail of rubber through the junction.
  for (let i = 0; i < 7; i += 1) {
    game.skids.push({ x1: 1420 + i * 52, y1: 1752, x2: 1472 + i * 52, y2: 1756, alpha: 0.5 });
    game.skids.push({ x1: 1420 + i * 52, y1: 1788, x2: 1472 + i * 52, y2: 1792, alpha: 0.5 });
  }
  settle(game, 9);
  car.speed = 330;
  game.frozen = true;
  frameOn(game, car.x + 40, car.y);
}

/** On foot on Meridian Street, the coupe idling at the kerb, the city walking past. */
function stageStreet(game) {
  game.screen = 'play';
  game.player.x = 1836;
  game.player.y = 1308;
  game.player.angle = 0.4;
  game.money = 320;
  game.missions.index = 1;
  game.missions.active = true;
  game.missions.stageIndex = 0;
  game.missions.setupStage(); // parks the sky-blue coupe at the kerb, fifty paces north
  const spots = [
    [1828, 1180], [1966, 1245], [1830, 1440], [1970, 1520], [1680, 1090], [2100, 1096], [1834, 1010],
  ];
  for (const [x, y] of spots) {
    const ped = makePed(x, y, game.rng);
    ped.tx = x + 60; ped.ty = y + 120; ped.hasTarget = true;
    game.peds.push(ped);
  }
  settle(game, 30);
  game.frozen = true;
  frameOn(game, game.player.x + 40, game.player.y - 30);
}

/** The Harbor Run, checkpoint three in sight and the clock in the red zone's neighbourhood. */
function stageMission(game) {
  game.screen = 'play';
  const car = makeCar(2330, 2427, 0, '#e0a51f', 'coupe', 'player');
  car.speed = 342;
  putPlayerInCar(game, car);
  game.money = 2100;
  game.missions.index = 4;
  game.missions.active = true;
  game.missions.stageIndex = 0;
  game.missions.checkpointIndex = 2;
  game.missions.timeLeft = 47;
  settle(game, 16);
  car.speed = 342;
  game.frozen = true;
  frameOn(game, car.x + 90, car.y);
}

export function stageShot(game, name) {
  if (name === 'chase') stageChase(game);
  else if (name === 'street') stageStreet(game);
  else if (name === 'mission') stageMission(game);
  else {
    // 'title' and anything else: the title screen over the living boardwalk.
    game.screen = 'title';
  }
  game.bannerState = null;
  game.dialogState = null;
  game.dialogQueue = [];
}
