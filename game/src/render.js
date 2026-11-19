// Solano Heat — everything the player sees: the city from above in late-afternoon light,
// the cars and people, the HUD with its minimap, and the screens (title, pause, dialogs,
// banners). One canvas, no images: every shape below is drawn from the game's own data.

import { VIEW, WORLD, COLORS } from './config.js';
import { clamp, lerp } from './rng.js';
import { V_ROADS, H_ROADS, ROAD_HALF, WATER_RECTS, SAND_RECT, BOARDWALK_RECT, GARAGE_ZONE, districtAt } from './city.js';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(Math.round(((n >> 16) & 255) * f), 0, 255);
  const g = clamp(Math.round(((n >> 8) & 255) * f), 0, 255);
  const b = clamp(Math.round((n & 255) * f), 0, 255);
  return `rgb(${r},${g},${b})`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawStar(ctx, x, y, r, filled) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const px = x + Math.cos(a) * rad; const py = y + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  if (filled) { ctx.fillStyle = '#ffb52e'; ctx.fill(); }
  ctx.strokeStyle = 'rgba(20,10,10,0.65)'; ctx.lineWidth = 1.4; ctx.stroke();
}

export class Renderer {
  constructor(canvas, city) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.city = city;
    this.minimap = this.buildMinimap(city);
  }

  /** The static city (water, sand, roads, blocks) baked once for the minimap. */
  buildMinimap(city) {
    const c = document.createElement('canvas');
    c.width = 220; c.height = 160;
    const g = c.getContext('2d');
    const sx = c.width / WORLD.width; const sy = c.height / WORLD.height;
    g.fillStyle = COLORS.grass; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = COLORS.water;
    for (const w of WATER_RECTS) g.fillRect(w.x * sx, w.y * sy, w.w * sx, w.h * sy);
    g.fillStyle = COLORS.sand; g.fillRect(SAND_RECT.x * sx, 0, SAND_RECT.w * sx, c.height);
    g.fillStyle = '#5a5450';
    for (const r of V_ROADS) g.fillRect((r.c - ROAD_HALF) * sx, r.from * sy, ROAD_HALF * 2 * sx, (r.to - r.from) * sy);
    for (const r of H_ROADS) g.fillRect(r.from * sx, (r.c - ROAD_HALF) * sy, (r.to - r.from) * sx, ROAD_HALF * 2 * sy);
    g.fillStyle = 'rgba(90,70,60,0.5)';
    for (const b of city.buildings) g.fillRect(b.x * sx, b.y * sy, Math.max(1.4, b.w * sx), Math.max(1.4, b.h * sy));
    return c;
  }

  /** The whole frame: world (or title backdrop), then the HUD and any overlay. */
  draw(game) {
    const ctx = this.ctx;
    ctx.fillStyle = '#20303a';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    if (game.screen === 'title' || game.screen === 'howto') {
      this.drawWorld(game, true);
      this.drawTitle(game);
      if (game.screen === 'howto') this.drawHowTo(game);
      return;
    }
    this.drawWorld(game, false);
    this.drawHUD(game);
    if (game.dialogState) this.drawDialog(game);
    if (game.bannerState) this.drawBanner(game);
    if (game.splash) this.drawSplash(game);
    if (game.screen === 'pause') this.drawPause(game);
  }

  /** Everything in the world, camera-relative. `scenic` slows the water and hides the HUD actors' markers. */
  drawWorld(game, scenic) {
    const ctx = this.ctx;
    const cam = game.camera;
    const view = { x: cam.x - 90, y: cam.y - 90, w: VIEW.width + 180, h: VIEW.height + 180 };
    ctx.save();
    ctx.translate(-cam.x, -cam.y);
    this.drawGround(ctx, game, view);
    this.drawRoads(ctx, game, view);
    for (const s of game.skids) {
      ctx.strokeStyle = `rgba(30,26,24,${s.alpha})`;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
    }
    this.drawMarkers(ctx, game);
    for (const b of this.city.buildings) if (overlap(b, view)) this.drawBuilding(ctx, b, false);
    for (const s of Object.values(this.city.specials)) this.drawBuilding(ctx, { ...s, color: '#d9c9a8', height: 26, props: [] }, true);
    for (const c of this.city.containers) if (overlap(c, view)) this.drawContainer(ctx, c);
    for (const p of this.city.palms) if (pointIn(p, view)) this.drawPalm(ctx, p);
    for (const car of game.cars) if (pointIn(car, view)) this.drawCar(ctx, car, game.time, car === game.player.car);
    for (const car of game.police.cars) if (pointIn(car, view)) this.drawCar(ctx, car, game.time, false);
    for (const ped of game.peds) if (pointIn(ped, view)) this.drawPed(ctx, ped);
    if (game.dario) this.drawDario(ctx, game);
    this.drawPlayer(ctx, game);
    this.drawParticles(ctx, game);
    ctx.restore();
    // Warm late light over everything, and a soft vignette to sit the eye down.
    ctx.fillStyle = COLORS.sunTint;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    const grad = ctx.createRadialGradient(640, 400, 420, 640, 400, 900);
    grad.addColorStop(0, 'rgba(30,10,20,0)');
    grad.addColorStop(1, 'rgba(30,10,20,0.30)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  }

  drawGround(ctx, game, view) {
    ctx.fillStyle = COLORS.grass;
    ctx.fillRect(view.x, view.y, view.w, view.h);
    // Land base under the city blocks: warm pavement.
    ctx.fillStyle = COLORS.sidewalk;
    ctx.fillRect(402, 0, WORLD.width - 402, WORLD.height);
    ctx.fillStyle = COLORS.sand;
    ctx.fillRect(SAND_RECT.x, SAND_RECT.y, SAND_RECT.w, SAND_RECT.h);
    // The boardwalk: planks across, with seams.
    ctx.fillStyle = COLORS.boardwalk;
    ctx.fillRect(BOARDWALK_RECT.x, BOARDWALK_RECT.y, BOARDWALK_RECT.w, BOARDWALK_RECT.h);
    ctx.strokeStyle = 'rgba(90,55,30,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let y = 0; y < WORLD.height; y += 26) { ctx.moveTo(BOARDWALK_RECT.x, y); ctx.lineTo(BOARDWALK_RECT.x + BOARDWALK_RECT.w, y); }
    ctx.stroke();
    // The sea and the marina basin, with slow light on the water.
    for (const w of WATER_RECTS) {
      ctx.fillStyle = COLORS.waterDeep;
      ctx.fillRect(w.x, w.y, w.w, w.h);
      ctx.fillStyle = COLORS.water;
      ctx.fillRect(w.x + 6, w.y, w.w - 6, w.h);
      ctx.strokeStyle = 'rgba(255,255,255,0.20)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      const off = (game.time * 14) % 64;
      for (let y = w.y - 64 + off; y < w.y + w.h; y += 64) {
        for (let x = w.x + 14; x < w.x + w.w - 30; x += 88) {
          ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 12, y - 5, x + 24, y);
        }
      }
      ctx.stroke();
    }
    // Marina docks reaching into the basin.
    ctx.fillStyle = COLORS.boardwalk;
    for (let x = 3620; x < 4340; x += 150) ctx.fillRect(x, 210, 16, 90);
    ctx.fillRect(3560, 282, 840, 18);
    // Suburban lawns soften their blocks.
    ctx.fillStyle = 'rgba(140,185,106,0.55)';
    for (const b of this.city.buildings) {
      if (b.district !== 'suburbs') continue;
      ctx.fillRect(b.x - 12, b.y - 12, b.w + 24, b.h + 24);
    }
  }

  drawRoads(ctx, game, view) {
    ctx.fillStyle = COLORS.road;
    for (const r of V_ROADS) ctx.fillRect(r.c - ROAD_HALF, r.from, ROAD_HALF * 2, r.to - r.from);
    for (const r of H_ROADS) ctx.fillRect(r.from, r.c - ROAD_HALF, r.to - r.from, ROAD_HALF * 2);
    // Kerbs.
    ctx.strokeStyle = '#8f867a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (const r of V_ROADS) {
      ctx.moveTo(r.c - ROAD_HALF, r.from); ctx.lineTo(r.c - ROAD_HALF, r.to);
      ctx.moveTo(r.c + ROAD_HALF, r.from); ctx.lineTo(r.c + ROAD_HALF, r.to);
    }
    for (const r of H_ROADS) {
      ctx.moveTo(r.from, r.c - ROAD_HALF); ctx.lineTo(r.to, r.c - ROAD_HALF);
      ctx.moveTo(r.from, r.c + ROAD_HALF); ctx.lineTo(r.to, r.c + ROAD_HALF);
    }
    ctx.stroke();
    // Lane dashes.
    ctx.strokeStyle = COLORS.roadLine;
    ctx.lineWidth = 3;
    ctx.setLineDash([26, 30]);
    ctx.beginPath();
    for (const r of V_ROADS) { ctx.moveTo(r.c, r.from); ctx.lineTo(r.c, r.to); }
    for (const r of H_ROADS) { ctx.moveTo(r.from, r.c); ctx.lineTo(r.to, r.c); }
    ctx.stroke();
    ctx.setLineDash([]);
    // Crosswalks at every junction.
    ctx.fillStyle = COLORS.crosswalk;
    for (const v of V_ROADS) for (const h of H_ROADS) {
      if (h.c < v.from || h.c > v.to || v.c < h.from) continue;
      for (let i = -2; i <= 2; i += 1) {
        ctx.fillRect(v.c - ROAD_HALF - 12, h.c + i * 20 - 5, 10, 12);
        ctx.fillRect(v.c + ROAD_HALF + 2, h.c + i * 20 - 5, 10, 12);
        ctx.fillRect(v.c + i * 20 - 5, h.c - ROAD_HALF - 12, 12, 10);
        ctx.fillRect(v.c + i * 20 - 5, h.c + ROAD_HALF + 2, 12, 10);
      }
    }
    // Street names painted on the asphalt, the way the city signs itself.
    ctx.fillStyle = 'rgba(240,230,205,0.5)';
    ctx.font = `600 17px ${FONT}`;
    ctx.textAlign = 'center';
    for (const r of V_ROADS) {
      ctx.save();
      ctx.translate(r.c - 16, 700); ctx.rotate(-Math.PI / 2);
      ctx.fillText(r.name.toUpperCase(), 0, 0);
      ctx.restore();
      ctx.save();
      ctx.translate(r.c + 16, 2300); ctx.rotate(-Math.PI / 2);
      ctx.fillText(r.name.toUpperCase(), 0, 0);
      ctx.restore();
    }
    for (const r of H_ROADS) ctx.fillText(r.name.toUpperCase(), 850, r.c - 14);
  }

  drawBuilding(ctx, b, isSpecial) {
    // The lot the building sits in: pavement in the city, concrete at the port.
    if (b.district !== 'suburbs') {
      ctx.fillStyle = b.district === 'port' ? '#b3ac9e' : '#ddd0b2';
      ctx.fillRect(b.x - 13, b.y - 13, b.w + 26, b.h + 26);
    }
    const lift = b.height * 0.30;
    ctx.fillStyle = COLORS.shadow;
    ctx.fillRect(b.x + lift * 0.55, b.y + lift, b.w, b.h);
    // The sunlit south wall, then the roof.
    ctx.fillStyle = shade(b.color, 0.62);
    ctx.fillRect(b.x, b.y + b.h - 2, b.w, lift * 0.5 + 2);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = shade(b.color, 1.14);
    ctx.fillRect(b.x + 5, b.y + 5, b.w - 10, b.h - 10);
    // Roof dressing by district: panel seams downtown, skylight strips at the port,
    // a stair bulkhead on anything tall, a terrace garden on the beachfront.
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    if (b.district === 'downtown' || b.district === 'midtown') {
      for (let x = b.x + 22; x < b.x + b.w - 14; x += 30) ctx.fillRect(x, b.y + 8, 7, b.h - 16);
    } else if (b.district === 'port') {
      ctx.fillStyle = 'rgba(220,235,240,0.20)';
      for (let y = b.y + 16; y < b.y + b.h - 12; y += 30) ctx.fillRect(b.x + 10, y, b.w - 20, 8);
    } else if (b.district === 'beachfront' || b.district === 'marina') {
      ctx.fillStyle = 'rgba(90,140,80,0.30)';
      ctx.fillRect(b.x + b.w * 0.55, b.y + 10, b.w * 0.34, b.h * 0.4);
    }
    if (b.height > 62) {
      ctx.fillStyle = shade(b.color, 0.8);
      ctx.fillRect(b.x + b.w * 0.38, b.y + b.h * 0.34, b.w * 0.22, b.h * 0.26);
    }
    ctx.fillStyle = 'rgba(70,50,45,0.35)';
    for (const p of b.props || []) ctx.fillRect(b.x + p.dx, b.y + p.dy, p.w, p.h);
    if (isSpecial) {
      ctx.fillStyle = '#274b63';
      ctx.fillRect(b.x, b.y, b.w, 24);
      ctx.fillStyle = '#ffe9b0';
      ctx.font = `700 15px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(b.name.toUpperCase(), b.x + b.w / 2, b.y + 17);
    }
  }

  drawContainer(ctx, c) {
    ctx.fillStyle = COLORS.shadow;
    ctx.fillRect(c.x + 5, c.y + 7, c.w, c.h);
    ctx.fillStyle = c.color;
    ctx.fillRect(c.x, c.y, c.w, c.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth = 2;
    for (let x = c.x + 9; x < c.x + c.w - 4; x += 11) { ctx.beginPath(); ctx.moveTo(x, c.y + 3); ctx.lineTo(x, c.y + c.h - 3); ctx.stroke(); }
  }

  drawPalm(ctx, p) {
    ctx.strokeStyle = '#7a5a38';
    ctx.lineWidth = 4 * p.s;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + 5 * p.s, p.y - 4 * p.s); ctx.stroke();
    ctx.strokeStyle = '#4e8f4a';
    ctx.lineWidth = 3 * p.s;
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2 + p.x;
      ctx.beginPath();
      ctx.moveTo(p.x + 5 * p.s, p.y - 4 * p.s);
      ctx.quadraticCurveTo(p.x + 5 * p.s + Math.cos(a) * 13 * p.s, p.y - 4 * p.s + Math.sin(a) * 9 * p.s - 4,
        p.x + 5 * p.s + Math.cos(a) * 21 * p.s, p.y - 4 * p.s + Math.sin(a) * 13 * p.s + 3);
      ctx.stroke();
    }
  }

  /** The garage apron, mission markers and checkpoint pillars. */
  drawMarkers(ctx, game) {
    // The garage apron glows faintly: work gets done there.
    ctx.fillStyle = 'rgba(88, 200, 130, 0.13)';
    ctx.fillRect(GARAGE_ZONE.x, GARAGE_ZONE.y, GARAGE_ZONE.w, GARAGE_ZONE.h);
    ctx.strokeStyle = 'rgba(88, 200, 130, 0.55)';
    ctx.lineWidth = 2;
    ctx.strokeRect(GARAGE_ZONE.x, GARAGE_ZONE.y, GARAGE_ZONE.w, GARAGE_ZONE.h);
    const objective = game.missions.objective();
    if (objective && game.screen === 'play') {
      const stage = game.missions.stage;
      const isCheckpoint = stage && stage.type === 'checkpoints';
      const pulse = 1 + Math.sin(game.time * 5) * 0.12;
      const color = isCheckpoint ? '64, 200, 235' : '255, 181, 46';
      const grad = ctx.createLinearGradient(0, objective.y - 190, 0, objective.y);
      grad.addColorStop(0, `rgba(${color},0)`);
      grad.addColorStop(1, `rgba(${color},0.30)`);
      ctx.fillStyle = grad;
      ctx.fillRect(objective.x - 15, objective.y - 190, 30, 190);
      ctx.strokeStyle = `rgba(${color},0.85)`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(objective.x, objective.y, 30 * pulse, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = `rgba(${color},0.9)`;
      ctx.save();
      ctx.translate(objective.x, objective.y - 196 + Math.sin(game.time * 3) * 6);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-10, -10, 20, 20);
      ctx.restore();
    }
  }

  drawCar(ctx, car, time, highlight = false) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    ctx.fillStyle = 'rgba(30,18,20,0.30)';
    roundRect(ctx, -car.w / 2 + 3, -car.h / 2 + 5, car.w, car.h, 7);
    ctx.fill();
    const isPolice = car.kind === 'police';
    ctx.fillStyle = car.dead ? '#33302e' : isPolice ? '#eceef0' : car.color;
    roundRect(ctx, -car.w / 2, -car.h / 2, car.w, car.h, 7);
    ctx.fill();
    if (isPolice) {
      ctx.fillStyle = '#20242c';
      ctx.fillRect(-car.w * 0.08, -car.h / 2, car.w * 0.2, car.h);
    }
    // Cabin glass and windscreen.
    ctx.fillStyle = '#1d2a33';
    roundRect(ctx, -car.w * 0.16, -car.h * 0.36, car.w * 0.34, car.h * 0.72, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(190,225,240,0.5)';
    ctx.fillRect(car.w * 0.16, -car.h * 0.32, 4, car.h * 0.64);
    // Headlights and tail lights.
    ctx.fillStyle = '#ffeeb0';
    ctx.fillRect(car.w / 2 - 3, -car.h * 0.32, 3, 5);
    ctx.fillRect(car.w / 2 - 3, car.h * 0.32 - 5, 3, 5);
    ctx.fillStyle = '#c22f2f';
    ctx.fillRect(-car.w / 2, -car.h * 0.32, 3, 5);
    ctx.fillRect(-car.w / 2, car.h * 0.32 - 5, 3, 5);
    if (isPolice) {
      const phase = Math.sin(car.lightPhase * 3.4) > 0;
      ctx.fillStyle = phase ? '#ff4040' : '#4060ff';
      roundRect(ctx, -8, -car.h * 0.30, 16, 6, 3); ctx.fill();
      ctx.fillStyle = phase ? '#4060ff' : '#ff4040';
      roundRect(ctx, -8, car.h * 0.30 - 6, 16, 6, 3); ctx.fill();
      if (car.mode === 'pursue') {
        ctx.fillStyle = phase ? 'rgba(255,64,64,0.16)' : 'rgba(64,96,255,0.16)';
        ctx.beginPath(); ctx.arc(0, 0, 44, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (highlight) {
      ctx.strokeStyle = 'rgba(255,233,176,0.85)';
      ctx.lineWidth = 2;
      roundRect(ctx, -car.w / 2 - 3, -car.h / 2 - 3, car.w + 6, car.h + 6, 9);
      ctx.stroke();
    }
    ctx.restore();
    if (car.health < 45) {
      ctx.fillStyle = 'rgba(40,40,40,0.35)';
      ctx.beginPath(); ctx.arc(car.x + Math.cos(car.angle) * car.w * 0.4, car.y + Math.sin(car.angle) * car.w * 0.4, 7 + (45 - car.health) * 0.16, 0, Math.PI * 2); ctx.fill();
    }
  }

  drawPed(ctx, ped) {
    ctx.fillStyle = 'rgba(30,18,20,0.25)';
    ctx.beginPath(); ctx.arc(ped.x + 2, ped.y + 3, 8, 0, Math.PI * 2); ctx.fill();
    if (ped.dead) {
      ctx.fillStyle = ped.shirt;
      ctx.save();
      ctx.translate(ped.x, ped.y); ctx.rotate(ped.angle);
      roundRect(ctx, -11, -6, 22, 12, 6); ctx.fill();
      ctx.restore();
      return;
    }
    const bob = ped.speed > 4 ? Math.sin(ped.phase) * 2.2 : 0;
    ctx.strokeStyle = ped.pants;
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(ped.x, ped.y);
    ctx.lineTo(ped.x + Math.cos(ped.angle + 0.6) * (5 + bob), ped.y + Math.sin(ped.angle + 0.6) * (5 + bob));
    ctx.moveTo(ped.x, ped.y);
    ctx.lineTo(ped.x + Math.cos(ped.angle - 0.6) * (5 - bob), ped.y + Math.sin(ped.angle - 0.6) * (5 - bob));
    ctx.stroke();
    ctx.fillStyle = ped.shirt;
    ctx.beginPath(); ctx.arc(ped.x, ped.y, 7.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = ped.skin;
    ctx.beginPath(); ctx.arc(ped.x + Math.cos(ped.angle) * 2.5, ped.y + Math.sin(ped.angle) * 2.5, 4.4, 0, Math.PI * 2); ctx.fill();
    if (ped.panic > 0) {
      ctx.fillStyle = '#fff';
      ctx.font = `700 13px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('!', ped.x, ped.y - 14);
    }
  }

  drawDario(ctx, game) {
    const d = game.dario;
    ctx.fillStyle = 'rgba(30,18,20,0.25)';
    ctx.beginPath(); ctx.arc(d.x + 2, d.y + 3, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f2ead8';
    ctx.beginPath(); ctx.arc(d.x, d.y, 7.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8a5a3b';
    ctx.beginPath(); ctx.arc(d.x, d.y - 1, 4.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffe9b0';
    ctx.font = `700 12px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('DARIO', d.x, d.y - 16);
  }

  drawPlayer(ctx, game) {
    const p = game.player;
    if (p.inCar) return; // the car itself is drawn in the car pass
    ctx.fillStyle = 'rgba(30,18,20,0.3)';
    ctx.beginPath(); ctx.arc(p.x + 2, p.y + 3, 9, 0, Math.PI * 2); ctx.fill();
    const bob = p.speed > 4 ? Math.sin(p.phase) * 2.4 : 0;
    ctx.strokeStyle = '#26324a';
    ctx.lineWidth = 3.6;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + Math.cos(p.angle + 0.6) * (5 + bob), p.y + Math.sin(p.angle + 0.6) * (5 + bob));
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + Math.cos(p.angle - 0.6) * (5 - bob), p.y + Math.sin(p.angle - 0.6) * (5 - bob));
    ctx.stroke();
    // Marina: teal jacket, dark cap, unmistakable in a crowd.
    ctx.fillStyle = '#12808a';
    ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c68863';
    ctx.beginPath(); ctx.arc(p.x + Math.cos(p.angle) * 2.5, p.y + Math.sin(p.angle) * 2.5, 4.6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#12333a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(p.x + Math.cos(p.angle) * 2.5, p.y + Math.sin(p.angle) * 2.5, 4.6, p.angle - 2.2, p.angle + 2.2);
    ctx.stroke();
    if (p.aiming) {
      ctx.strokeStyle = '#2b2b30';
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + Math.cos(p.aimAngle) * 15, p.y + Math.sin(p.aimAngle) * 15);
      ctx.stroke();
    }
    if (p.muzzle > 0) {
      ctx.fillStyle = 'rgba(255,190,60,0.9)';
      ctx.beginPath();
      ctx.arc(p.x + Math.cos(p.aimAngle) * 19, p.y + Math.sin(p.aimAngle) * 19, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawParticles(ctx, game) {
    for (const fx of game.particles) {
      ctx.globalAlpha = clamp(fx.life / fx.maxLife, 0, 1);
      ctx.fillStyle = fx.color;
      ctx.fillRect(fx.x - fx.size / 2, fx.y - fx.size / 2, fx.size, fx.size);
    }
    ctx.globalAlpha = 1;
    for (const t of game.tracers) {
      ctx.globalAlpha = clamp(t.life / 0.09, 0, 1) * 0.8;
      ctx.strokeStyle = '#ffd98a';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(t.x1, t.y1); ctx.lineTo(t.x2, t.y2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  drawHUD(game) {
    const ctx = this.ctx;
    const p = game.player;
    // Top-left: health and money in one quiet panel.
    ctx.fillStyle = 'rgba(12,14,20,0.55)';
    roundRect(ctx, 16, 14, 252, 66, 10); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = `600 11px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText('MARINA VEGA', 28, 33);
    ctx.fillStyle = '#3a3f46';
    roundRect(ctx, 28, 40, 168, 11, 5); ctx.fill();
    ctx.fillStyle = p.health > 30 ? '#69c24a' : '#d64541';
    roundRect(ctx, 28, 40, 168 * clamp(p.health, 0, 100) / 100, 11, 5); ctx.fill();
    ctx.fillStyle = '#7be495';
    ctx.font = `700 19px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText('$' + game.money.toLocaleString('en-US'), 256, 52);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = `600 11px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(districtAt(p.x, p.y).toUpperCase() + ' · PORT SOLANO', 28, 72);
    if (p.inCar) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = `700 22px ${FONT}`;
      ctx.textAlign = 'right';
      ctx.fillText(Math.round(Math.abs(p.car.speed) * 0.36) + ' km/h', VIEW.width - 24, VIEW.height - 52);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = `600 12px ${FONT}`;
      ctx.fillText(p.carName, VIEW.width - 24, VIEW.height - 32);
    }
    // Top-right: the wanted stars, flashing while the police have lost the scent.
    const stars = game.police.stars;
    const flashing = stars > 0 && !game.police.seenNow && Math.sin(game.time * 6) > 0;
    for (let i = 0; i < 5; i += 1) {
      ctx.save();
      if (flashing && i < stars) ctx.globalAlpha = 0.35;
      drawStar(ctx, VIEW.width - 36 - i * 34, 38, 15, i < stars);
      ctx.restore();
    }
    // Top-centre: the current objective.
    const objective = game.missions.objective();
    if (objective) {
      ctx.fillStyle = 'rgba(12,14,20,0.55)';
      roundRect(ctx, VIEW.width / 2 - 265, 14, 530, 58, 10); ctx.fill();
      ctx.fillStyle = '#ffb52e';
      ctx.font = `700 11px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText((game.missions.mission ? game.missions.mission.title : '').toUpperCase(), VIEW.width / 2, 33);
      ctx.fillStyle = '#fff';
      ctx.font = `600 16px ${FONT}`;
      ctx.fillText(objective.text, VIEW.width / 2, 56);
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = `600 13px ${FONT}`;
      ctx.textAlign = 'right';
      ctx.fillText(Math.round(objective.dist / 4) + ' m', VIEW.width / 2 + 250, 56);
      if (objective.timeLeft !== null && objective.timeLeft !== undefined) {
        const t = Math.max(0, objective.timeLeft);
        ctx.fillStyle = t < 20 ? '#ff6b5e' : '#ffd24a';
        ctx.font = `700 15px ${FONT}`;
        ctx.textAlign = 'left';
        ctx.fillText(Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0'), VIEW.width / 2 - 250, 56);
      }
    }
    this.drawMinimap(game);
    // The bust meter, when the police have Marina pinned.
    if (game.police.pinTime > 0.15) {
      const ratio = clamp(game.police.pinTime / 2.4, 0, 1);
      ctx.fillStyle = 'rgba(12,14,20,0.6)';
      roundRect(ctx, VIEW.width / 2 - 110, 96, 220, 26, 8); ctx.fill();
      ctx.fillStyle = '#d64541';
      roundRect(ctx, VIEW.width / 2 - 104, 102, 208 * ratio, 14, 6); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `700 13px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('BUSTED?', VIEW.width / 2, 113);
    }
    if (game.prompt) {
      ctx.fillStyle = 'rgba(12,14,20,0.62)';
      const w = ctx.measureText(game.prompt).width + 90;
      roundRect(ctx, VIEW.width / 2 - w / 2, VIEW.height - 118, w, 34, 9); ctx.fill();
      ctx.fillStyle = '#ffe9b0';
      ctx.font = `600 15px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(game.prompt, VIEW.width / 2, VIEW.height - 96);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = `500 12px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText(p.inCar ? 'WASD drive · SPACE handbrake · E exit · M mute' : 'WASD move · SHIFT run · E enter car · CLICK shoot · M mute', VIEW.width - 18, VIEW.height - 12);
    if (game.hurtFlash > 0) {
      ctx.fillStyle = `rgba(200,30,30,${game.hurtFlash * 0.28})`;
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    }
  }

  drawMinimap(game) {
    const ctx = this.ctx;
    const x = 16; const y = VIEW.height - 176;
    const w = 220; const h = 160;
    ctx.fillStyle = 'rgba(12,14,20,0.55)';
    roundRect(ctx, x - 4, y - 4, w + 8, h + 8, 10); ctx.fill();
    ctx.drawImage(this.minimap, x, y);
    const sx = w / WORLD.width; const sy = h / WORLD.height;
    const dot = (wx, wy, color, r = 3) => {
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(x + wx * sx, y + wy * sy, r, 0, Math.PI * 2); ctx.fill();
    };
    dot(this.city.specials.garage.x + 125, this.city.specials.garage.y + 85, '#ffd24a');
    dot(this.city.specials.clinic.x + 105, this.city.specials.clinic.y + 70, '#ff7b72');
    dot(this.city.specials.pd.x + 130, this.city.specials.pd.y + 85, '#7fb2ff');
    for (const car of game.police.cars) if (car.mode === 'pursue') dot(car.x, car.y, Math.sin(game.time * 7) > 0 ? '#ff5e5e' : '#5e8cff', 2.6);
    const objective = game.missions.objective();
    if (objective) {
      ctx.strokeStyle = '#ffb52e';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x + objective.x * sx, y + objective.y * sy, 5 + Math.sin(game.time * 5) * 1.4, 0, Math.PI * 2); ctx.stroke();
    }
    // The player: a white arrow turned to her heading.
    const p = game.player;
    ctx.save();
    ctx.translate(x + p.x * sx, y + p.y * sy);
    ctx.rotate(p.inCar ? p.car.angle : p.angle);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, -4); ctx.lineTo(-4, 4); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  drawDialog(game) {
    const ctx = this.ctx;
    const d = game.dialogState;
    const boxY = VIEW.height - 168;
    ctx.fillStyle = 'rgba(10,12,18,0.82)';
    roundRect(ctx, VIEW.width / 2 - 390, boxY, 780, 92, 12); ctx.fill();
    ctx.fillStyle = '#ffb52e';
    ctx.font = `700 13px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(d.who.toUpperCase(), VIEW.width / 2 - 362, boxY + 26);
    ctx.fillStyle = '#f5efe2';
    ctx.font = `500 16.5px ${FONT}`;
    const lines = wrapText(ctx, d.text, 724);
    lines.slice(0, 2).forEach((line, i) => ctx.fillText(line, VIEW.width / 2 - 362, boxY + 52 + i * 22));
    if (Math.sin(game.time * 4) > -0.2) {
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.font = `600 12px ${FONT}`;
      ctx.textAlign = 'right';
      ctx.fillText('E ▸', VIEW.width / 2 + 362, boxY + 78);
    }
  }

  drawBanner(game) {
    const ctx = this.ctx;
    const b = game.bannerState;
    const alpha = clamp(Math.min(b.t / 0.3, (b.dur - b.t) / 0.6, 1), 0, 1);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffb52e';
    ctx.font = `800 34px ${FONT}`;
    ctx.fillText(b.title, VIEW.width / 2, 138);
    if (b.sub) {
      ctx.fillStyle = '#fff';
      ctx.font = `600 17px ${FONT}`;
      ctx.fillText(b.sub, VIEW.width / 2, 166);
    }
    ctx.restore();
  }

  drawSplash(game) {
    const ctx = this.ctx;
    const s = game.splash;
    ctx.fillStyle = `rgba(16,4,8,${clamp(s.t / 0.4, 0, 0.72)})`;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = s.color;
    ctx.font = `900 84px ${FONT}`;
    ctx.fillText(s.text, VIEW.width / 2, VIEW.height / 2 - 10);
    ctx.fillStyle = '#f5efe2';
    ctx.font = `600 19px ${FONT}`;
    ctx.fillText(s.sub, VIEW.width / 2, VIEW.height / 2 + 38);
  }

  drawTitle(game) {
    const ctx = this.ctx;
    const grad = ctx.createLinearGradient(0, 0, VIEW.width * 0.72, 0);
    grad.addColorStop(0, 'rgba(20,8,16,0.88)');
    grad.addColorStop(1, 'rgba(20,8,16,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.textAlign = 'left';
    const titleGrad = ctx.createLinearGradient(0, 150, 0, 260);
    titleGrad.addColorStop(0, '#ffd98a');
    titleGrad.addColorStop(0.55, '#ff9d4d');
    titleGrad.addColorStop(1, '#e2543e');
    ctx.fillStyle = titleGrad;
    ctx.font = `900 96px ${FONT}`;
    ctx.fillText('SOLANO', 64, 218);
    ctx.fillText('HEAT', 64, 316);
    ctx.fillStyle = '#ffe9b0';
    ctx.font = `700 21px ${FONT}`;
    ctx.fillText('P O R T   S O L A N O', 68, 356);
    ctx.fillStyle = 'rgba(245,239,226,0.92)';
    ctx.font = `500 16.5px ${FONT}`;
    const blurb = [
      'Marina Vega was the best getaway driver in Las Brisas — until the',
      'night the boat burned. Now she owes the fixer Dario Klem a fortune,',
      'and Port Solano is where she pays it back: one job, one car,',
      'one police chase at a time.',
    ];
    blurb.forEach((line, i) => ctx.fillText(line, 68, 402 + i * 24));
    game.menuItems.forEach((item, i) => {
      const y = 540 + i * 44;
      const selected = i === game.menuIndex;
      if (selected) {
        ctx.fillStyle = '#ffb52e';
        ctx.font = `800 23px ${FONT}`;
        ctx.fillText('▸', 68, y);
      }
      ctx.fillStyle = selected ? '#ffffff' : 'rgba(245,239,226,0.55)';
      ctx.font = `${selected ? 800 : 600} 23px ${FONT}`;
      ctx.fillText(item.label, 100, y);
    });
    ctx.fillStyle = 'rgba(245,239,226,0.5)';
    ctx.font = `500 13px ${FONT}`;
    ctx.fillText('WASD / arrows + Enter to choose · sound on for the full siren experience · M mutes', 68, VIEW.height - 26);
  }

  drawHowTo(game) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(10,10,16,0.88)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffb52e';
    ctx.font = `800 30px ${FONT}`;
    ctx.fillText('HOW TO PLAY', 90, 92);
    ctx.fillStyle = '#f5efe2';
    ctx.font = `500 16.5px ${FONT}`;
    const lines = [
      'ON FOOT — WASD or arrows to walk, SHIFT to run. Walk up to any car and press E to take it.',
      'DRIVING — WASD to drive, SPACE for the handbrake, E to get out. Drive into the glowing',
      'apron at Dario\u2019s Garage to deliver job cars, respray ($150, clears your wanted level)',
      'or repair a wreck. The Clínica Solano heals you for $50 at its door.',
      '',
      'WANTED — Stars at the top right. Theft, crashes and gunfire raise them; more stars mean',
      'more patrol cars. Break their line of sight and stay hidden to let the heat die down.',
      'If the police pin you while you are stopped, the BUSTED meter fills. Lose all your health',
      'and you wake up at the clinic, lighter in the wallet.',
      '',
      'COMBAT — Aim with the mouse, click to shoot (on foot). It works, and everyone notices.',
      'MISSIONS — Follow the gold marker; the minimap shows police, the garage, the clinic',
      'and your objective. Progress saves automatically — Continue picks up where you left off.',
      '',
      'P or ESC pauses. M mutes. F11 is your friend: Port Solano likes a big screen.',
    ];
    lines.forEach((line, i) => ctx.fillText(line, 90, 140 + i * 27));
    ctx.fillStyle = 'rgba(245,239,226,0.6)';
    ctx.font = `600 14px ${FONT}`;
    ctx.fillText('ESC — back to the title', 90, VIEW.height - 34);
  }

  drawPause(game) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(10,10,16,0.72)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = `900 54px ${FONT}`;
    ctx.fillText('PAUSED', VIEW.width / 2, 250);
    game.pauseItems.forEach((item, i) => {
      const y = 330 + i * 46;
      const selected = i === game.pauseIndex;
      ctx.fillStyle = selected ? '#ffb52e' : 'rgba(245,239,226,0.6)';
      ctx.font = `${selected ? 800 : 600} 22px ${FONT}`;
      ctx.fillText((selected ? '▸ ' : '') + item.label, VIEW.width / 2, y);
    });
  }
}

function overlap(rect, view) {
  return rect.x + rect.w > view.x && rect.x < view.x + view.w && rect.y + rect.h > view.y && rect.y < view.y + view.h;
}
function pointIn(p, view) {
  return p.x > view.x - 70 && p.x < view.x + view.w + 70 && p.y > view.y - 70 && p.y < view.y + view.h + 70;
}
/** Greedy word wrap for the dialog box. */
function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const trial = line ? line + ' ' + word : word;
    if (ctx.measureText(trial).width > maxWidth && line) { lines.push(line); line = word; }
    else line = trial;
  }
  if (line) lines.push(line);
  return lines;
}
