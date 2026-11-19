// Solano Heat — the story: five jobs Marina Vega runs for the fixer Dario Klem, from a
// first stolen coupe to the armored-van score that sets her free, then open-ended side
// jobs. A mission is a list of stages (meet, steal, deliver, escape, checkpoints); this
// runner walks the stages, spawns what they need, watches their timers, and reports the
// objective the HUD and minimap should point at.

import { GARAGE_ZONE, SPECIALS, DARIO_SPOT } from './city.js';
import { distance } from './rng.js';

const GARAGE = { x: GARAGE_ZONE.x + GARAGE_ZONE.w / 2, y: GARAGE_ZONE.y + GARAGE_ZONE.h / 2 };
const CLUB_DOOR = { x: 2820, y: 252 };
const WAREHOUSE_DOOR = { x: 3610, y: 2792 };
const SAFEHOUSE_DOOR = { x: 695, y: 2792 };

export const STORY = [
  {
    id: 'welcome', title: 'Welcome to Port Solano', reward: 50,
    intro: [
      { who: 'Marina', text: 'Port Solano. New city, old debts. Dario Klem got me out of Las Brisas — now I work it off.' },
      { who: 'Marina', text: 'He said to meet him at Café Brisa, down the boardwalk. Walk over and say hello.' },
    ],
    stages: [
      { type: 'meet', x: DARIO_SPOT.x, y: DARIO_SPOT.y, r: 64, text: 'Meet Dario outside Café Brisa' },
    ],
    outro: [
      { who: 'Dario', text: 'Marina Vega. The best wheel in Las Brisas, washing up on my boardwalk.' },
      { who: 'Dario', text: 'You owe me a boat, so you will drive. Small jobs first. Do not scratch anything I cannot sell.' },
    ],
  },
  {
    id: 'first-wheels', title: 'First Wheels', reward: 250,
    intro: [
      { who: 'Dario (phone)', text: 'A sky-blue Cielo Coupe sits on Meridian Street, keys in, owner at lunch. Borrow it.' },
      { who: 'Dario (phone)', text: 'Bring it to my garage off Solano Boulevard. And Marina — the police frown on borrowing.' },
    ],
    stages: [
      { type: 'steal', x: 1862, y: 1350, angle: -Math.PI / 2, carType: 'coupe', color: '#4fb3a9', text: 'Steal the Cielo Coupe on Meridian Street' },
      { type: 'deliver', x: GARAGE.x, y: GARAGE.y, r: 92, needCar: true, text: 'Deliver the coupe to Dario\u2019s Garage' },
    ],
    outro: [
      { who: 'Dario', text: 'Clean lines, no dents, one careful felon. We will get along, Marina.' },
    ],
  },
  {
    id: 'hot-cargo', title: 'Hot Cargo', reward: 400,
    intro: [
      { who: 'Dario (phone)', text: 'Warehouse 9, down at the port. A crate falls off a truck tonight — catch it.' },
      { who: 'Dario (phone)', text: 'Then straight to the Marina Club. The buyer hates waiting, and so does the clock.' },
    ],
    stages: [
      { type: 'pickup', x: WAREHOUSE_DOOR.x, y: WAREHOUSE_DOOR.y, r: 78, text: 'Pick up the crate at Warehouse 9' },
      { type: 'deliver', x: CLUB_DOOR.x, y: CLUB_DOOR.y, r: 86, time: 170, text: 'Deliver the crate to the Marina Club' },
    ],
    outro: [
      { who: 'Dario', text: 'Whatever was in that crate, the club paid triple not to know. Good driving.' },
    ],
  },
  {
    id: 'shake-the-heat', title: 'Shake the Heat', reward: 450,
    intro: [
      { who: 'Dario (phone)', text: 'A buyer waits downtown, Meridian and Avenida Central. Cash in hand, no trouble. Probably.' },
    ],
    stages: [
      { type: 'goto', x: 2250, y: 1400, r: 80, text: 'Meet the buyer downtown' },
      { type: 'escape', heat: 3, text: 'It was a setup — lose the police!' },
      { type: 'deliver', x: GARAGE.x, y: GARAGE.y, r: 92, text: 'Get back to Dario\u2019s Garage' },
    ],
    midDialog: [
      { who: 'Marina', text: 'Sirens. Of course. Dario, your "buyer" brought the whole Solano PD.' },
      { who: 'Dario (phone)', text: 'Then un-bring them. Break their line of sight, stay hidden, let the heat die.' },
    ],
    outro: [
      { who: 'Dario', text: 'You came back with the cash and no escort. The debt is nearly paid, Marina.' },
    ],
  },
  {
    id: 'harbor-run', title: 'Harbor Run', reward: 650,
    intro: [
      { who: 'Dario (phone)', text: 'A shipping magnate bets his friends no driver can cross Solano in two minutes.' },
      { who: 'Dario (phone)', text: 'Six checkpoints, one clock. Prove him rich and wrong, in that order.' },
    ],
    stages: [
      {
        type: 'checkpoints', time: 150, text: 'Hit every checkpoint before the clock runs out',
        points: [
          { x: 372, y: 2500 }, { x: 1200, y: 2960 }, { x: 2600, y: 2400 },
          { x: 4050, y: 1740 }, { x: 3300, y: 420 }, { x: CLUB_DOOR.x, y: CLUB_DOOR.y },
        ],
      },
    ],
    outro: [
      { who: 'Dario', text: 'He paid up laughing. One more job, Marina — the big one — and the boat is forgotten.' },
    ],
  },
  {
    id: 'long-score', title: 'The Long Score', reward: 1200,
    intro: [
      { who: 'Dario (phone)', text: 'An armored Cargo Van idles at the port, full of casino chips bound for the mainland.' },
      { who: 'Dario (phone)', text: 'Take it to the Calle Sur safehouse. Every badge in Solano will object. Drive like you mean it.' },
    ],
    stages: [
      { type: 'steal', x: 3752, y: 2832, angle: Math.PI, carType: 'van', color: '#8a8f96', heat: 3, text: 'Steal the armored van at the port' },
      { type: 'deliver', x: SAFEHOUSE_DOOR.x, y: SAFEHOUSE_DOOR.y, r: 92, needCar: true, text: 'Deliver the van to the Calle Sur safehouse' },
    ],
    outro: [
      { who: 'Dario', text: 'The boat is paid, Marina. Port Solano is yours now — the jobs keep coming, if you want them.' },
      { who: 'Marina', text: 'Free. Finally. ...Keep the phone on, Dario. A girl gets bored.' },
    ],
  },
];

/** Find open ground near a point (mission cars must not spawn inside a warehouse). */
function freeSpot(city, x, y, r) {
  if (!city.isBlocked(x, y, r)) return { x, y };
  for (let ring = 26; ring < 320; ring += 26) {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
      const nx = x + Math.cos(a) * ring; const ny = y + Math.sin(a) * ring;
      if (!city.isBlocked(nx, ny, r)) return { x: nx, y: ny };
    }
  }
  return { x, y };
}

export class Missions {
  /** host: the game's services (player, police, dialog, pay, spawnCar, banner, sfx...). */
  constructor(host) {
    this.host = host;
    this.index = 0;
    this.stageIndex = 0;
    this.active = false;
    this.storyDone = false;
    this.stageCar = null;
    this.timeLeft = null;
    this.checkpointIndex = 0;
    this.sideJob = null;
    this.betweenTimer = 0;
  }

  get mission() { return this.sideJob || STORY[this.index] || null; }
  get stage() {
    const m = this.mission;
    return m ? m.stages[this.stageIndex] : null;
  }

  /** Begin the current story mission (or the next side job) with its intro dialog. */
  begin() {
    const m = this.mission;
    if (!m) { this.active = false; return; }
    this.stageIndex = 0;
    this.active = true;
    this.stageCar = null;
    this.setupStage();
    if (m.intro) this.host.dialog(m.intro, null);
    this.host.banner(m.title, m.stages[0].text);
  }

  /** Set up whatever the current stage needs: a car to steal, a timer, the heat. */
  setupStage() {
    const stage = this.stage;
    this.timeLeft = stage && stage.time ? stage.time : null;
    this.checkpointIndex = 0;
    if (!stage) return;
    if (stage.type === 'steal') {
      // A fresh target car replaces the old reference; a deliver stage that follows a
      // steal keeps it, because that car is the thing being delivered.
      const spot = freeSpot(this.host.city, stage.x, stage.y, 26);
      this.stageCar = this.host.spawnMissionCar(spot.x, spot.y, stage.angle, stage.carType, stage.color);
    }
    if (stage.type === 'escape') {
      this.host.police.setHeat(stage.heat || 3);
      const m = this.mission;
      if (m.midDialog) this.host.dialog(m.midDialog, null);
    }
  }

  /** The HUD/minimap objective: where to go, what to do, how far, how long is left. */
  objective() {
    if (!this.active || !this.stage) return null;
    const stage = this.stage;
    const player = this.host.playerPos();
    let target = stage;
    if (stage.type === 'checkpoints') target = stage.points[this.checkpointIndex];
    if (stage.type === 'steal' && this.stageCar) target = this.stageCar;
    if (stage.type === 'deliver' && stage.needCar && this.stageCar && !this.host.playerInCar(this.stageCar)) {
      return { x: this.stageCar.x, y: this.stageCar.y, text: 'Get back in the ' + (this.stageCar.kind === 'van' ? 'van' : 'car'), dist: distance(player.x, player.y, this.stageCar.x, this.stageCar.y), timeLeft: this.timeLeft };
    }
    return { x: target.x, y: target.y, text: stage.text, dist: distance(player.x, player.y, target.x, target.y), timeLeft: this.timeLeft };
  }

  /** Advance the story by one step; call every simulation step. */
  update(dt) {
    if (!this.active || !this.stage) {
      // Between side jobs, count down and offer the next one.
      if (this.storyDone && !this.sideJob) {
        this.betweenTimer -= dt;
        if (this.betweenTimer <= 0) { this.makeSideJob(); this.begin(); }
      }
      return;
    }
    const stage = this.stage;
    const player = this.host.playerPos();
    if (this.timeLeft !== null && stage.type !== 'checkpoints') {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) return this.fail('Out of time.');
    }
    if (this.stageCar && this.stageCar.dead && (stage.type === 'steal' || stage.type === 'deliver')) {
      return this.fail('The car was wrecked.');
    }
    switch (stage.type) {
      case 'meet':
      case 'goto':
      case 'pickup':
        if (distance(player.x, player.y, stage.x, stage.y) < stage.r) {
          if (stage.type === 'pickup') this.host.sfx.pickup();
          this.nextStage();
        }
        break;
      case 'steal':
        if (this.stageCar && this.host.playerInCar(this.stageCar)) {
          // A scripted ambush sets its heat outright; an ordinary theft is priced by
          // the game's own witness rules when the door closes.
          if (stage.heat) this.host.police.setHeat(stage.heat);
          this.host.banner('Stolen!', 'Now move — before they organise.');
          this.nextStage();
        }
        break;
      case 'deliver': {
        const inRightCar = !stage.needCar || (this.stageCar && this.host.playerInCar(this.stageCar));
        if (inRightCar && distance(player.x, player.y, stage.x, stage.y) < stage.r) this.nextStage();
        break;
      }
      case 'escape':
        if (this.host.police.heat <= 0.02) this.nextStage();
        break;
      case 'checkpoints': {
        this.timeLeft -= dt;
        if (this.timeLeft <= 0) return this.fail('Out of time.');
        const point = stage.points[this.checkpointIndex];
        if (distance(player.x, player.y, point.x, point.y) < 96) {
          this.host.sfx.checkpoint();
          this.checkpointIndex += 1;
          this.host.banner('Checkpoint ' + this.checkpointIndex + ' of ' + stage.points.length, '');
          if (this.checkpointIndex >= stage.points.length) this.nextStage();
        }
        break;
      }
      default: break;
    }
  }

  nextStage() {
    this.stageIndex += 1;
    if (this.stageIndex >= this.mission.stages.length) return this.complete();
    this.setupStage();
    this.host.banner(this.mission.title, this.stage.text);
  }

  complete() {
    const m = this.mission;
    this.active = false;
    this.host.pay(m.reward);
    this.host.sfx.missionDone();
    this.host.banner('JOB DONE', m.title + ' — +$' + m.reward);
    if (m.outro) this.host.dialog(m.outro, null);
    if (this.sideJob) { this.sideJob = null; this.betweenTimer = 9; }
    else {
      this.index += 1;
      if (this.index >= STORY.length) { this.storyDone = true; this.betweenTimer = 9; }
    }
    this.host.save();
    if (!this.storyDone && !this.sideJob) {
      // A breath, then the next job's intro arrives by phone.
      this.betweenTimer = 2.5;
      const wait = () => { if (!this.active) this.begin(); };
      setTimeout(wait, 2500);
    }
  }

  fail(reason) {
    const m = this.mission;
    this.active = false;
    this.host.sfx.missionFail();
    this.host.police.clear();
    if (this.stageCar) { this.host.removeCar(this.stageCar); this.stageCar = null; }
    this.host.banner('JOB FAILED', reason + ' Press R to retry it.');
    this.host.retryArmed = true;
    if (m) this.host.lastFailed = m;
  }

  /** Retry after a failure: restart the same mission or side job. */
  retry() {
    this.host.retryArmed = false;
    this.begin();
  }

  /** Endless work once the story is done: pickups and drops all over Port Solano. */
  makeSideJob() {
    const spots = [
      { name: 'the Marina Club', x: CLUB_DOOR.x, y: CLUB_DOOR.y },
      { name: 'Warehouse 9', x: WAREHOUSE_DOOR.x, y: WAREHOUSE_DOOR.y },
      { name: "Dario's Garage", x: GARAGE.x, y: GARAGE.y },
      { name: 'the Calle Sur safehouse', x: SAFEHOUSE_DOOR.x, y: SAFEHOUSE_DOOR.y },
      { name: 'Café Brisa', x: 706, y: 800 },
      { name: 'Clínica Solano', x: 2825, y: 1430 },
    ];
    const rng = this.host.rng;
    const from = rng.pick(spots);
    let to = rng.pick(spots);
    if (to === from) to = spots[(spots.indexOf(from) + 2) % spots.length];
    const dist = distance(from.x, from.y, to.x, to.y);
    const reward = Math.round((90 + dist * 0.09) / 5) * 5;
    this.sideJob = {
      id: 'side', title: 'Side Job', reward,
      intro: [{ who: 'Dario (phone)', text: 'A package waits at ' + from.name + '. Take it to ' + to.name + '. $' + reward + ' if it arrives warm.' }],
      stages: [
        { type: 'pickup', x: from.x, y: from.y, r: 80, text: 'Pick up the package at ' + from.name },
        { type: 'deliver', x: to.x, y: to.y, r: 90, time: Math.round(dist / 8.5) + 40, text: 'Deliver to ' + to.name },
      ],
      outro: [{ who: 'Dario (phone)', text: 'Warm and on time. The phone stays on, Marina.' }],
    };
  }

  /** A one-line state summary for the save file. */
  saveState() { return { index: this.index, storyDone: this.storyDone }; }
  loadState(state) {
    this.index = state.index || 0;
    this.storyDone = !!state.storyDone;
  }
}
