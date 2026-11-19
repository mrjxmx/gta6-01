// Solano Heat — Port Solano itself: the road grid, the districts, every building, palm and
// shipping container, generated from a fixed seed so the city is identical on every load.
// Also owns collision: a coarse spatial hash over every solid rectangle (buildings,
// containers, the sea itself) that the player, cars and pedestrians are pushed out of.

import { WORLD, ROOF_COLORS } from './config.js';
import { Rng, clamp, circleHitsRect, pushCircleOutOfRect } from './rng.js';

/** Half the width of a road: the asphalt runs centre ± ROAD_HALF. */
export const ROAD_HALF = 55;
/** How far a driving lane sits from its road's centre line. */
export const LANE_OFFSET = 27;

/** Vertical roads (avenues), west to east. Craneway starts below the marina basin. */
export const V_ROADS = [
  { c: 500, from: 0, to: WORLD.height, name: 'Palmera Avenue' },
  { c: 1200, from: 0, to: WORLD.height, name: 'Solano Boulevard' },
  { c: 1900, from: 0, to: WORLD.height, name: 'Meridian Street' },
  { c: 2600, from: 0, to: WORLD.height, name: 'Harbor View Drive' },
  { c: 3300, from: 0, to: WORLD.height, name: 'Dockside Avenue' },
  { c: 4050, from: 310, to: WORLD.height, name: 'Craneway' },
];
/** Horizontal roads (calles), north to south. */
export const H_ROADS = [
  { c: 420, from: 330, to: WORLD.width, name: 'Marina Row' },
  { c: 1080, from: 330, to: WORLD.width, name: 'Calle del Sol' },
  { c: 1740, from: 330, to: WORLD.width, name: 'Avenida Central' },
  { c: 2400, from: 330, to: WORLD.width, name: 'Palma Real' },
  { c: 2960, from: 330, to: WORLD.width, name: 'Calle Sur' },
];

/** The sea to the west and the marina basin in the north-east: solid to everything. */
export const WATER_RECTS = [
  { x: 0, y: 0, w: 150, h: WORLD.height },
  { x: 3560, y: 0, w: 840, h: 300 },
];
export const SAND_RECT = { x: 150, y: 0, w: 180, h: WORLD.height };
export const BOARDWALK_RECT = { x: 330, y: 0, w: 72, h: WORLD.height };

/** Which district a point belongs to; drives building style, colour and height. */
export function districtAt(x, y) {
  if (x >= 3400 && y >= 2000) return 'port';
  if (y < 420 && x >= 2600) return 'marina';
  if (x >= 1000 && x <= 3400 && y >= 300 && y <= 2000) return 'downtown';
  if (y >= 2050) return 'suburbs';
  if (x < 1000) return 'beachfront';
  return 'midtown';
}

/** Named places the story uses; each is a real building in the collision world. */
export const SPECIALS = {
  garage: { name: "Dario's Garage", x: 1300, y: 1200, w: 250, h: 170, kind: 'garage' },
  pd: { name: 'Solano PD', x: 2050, y: 560, w: 260, h: 170, kind: 'pd' },
  clinic: { name: 'Clínica Solano', x: 2720, y: 1240, w: 210, h: 140, kind: 'clinic' },
  marinaClub: { name: 'Marina Club', x: 2700, y: 80, w: 240, h: 130, kind: 'club' },
  warehouse: { name: 'Warehouse 9', x: 3440, y: 2540, w: 340, h: 210, kind: 'warehouse' },
  safehouse: { name: 'Calle Sur Safehouse', x: 620, y: 2620, w: 150, h: 110, kind: 'house' },
  cafe: { name: 'Café Brisa', x: 620, y: 620, w: 170, h: 120, kind: 'cafe' },
};
/** The apron in front of the garage: drive in to deliver a car, respray, or repair. */
export const GARAGE_ZONE = { x: 1300, y: 1392, w: 250, h: 96 };
/** Where Marina respawns after a bust, and where the clinic heals her. */
export const PD_DOOR = { x: 2180, y: 790 };
export const CLINIC_DOOR = { x: 2825, y: 1420 };
/** Where the game begins: the boardwalk, looking at the sea. */
export const PLAYER_START = { x: 372, y: 860 };
/** Dario waits outside Café Brisa. */
export const DARIO_SPOT = { x: 706, y: 792 };

function rectsOverlap(a, b, pad) {
  return a.x - pad < b.x + b.w && a.x + a.w + pad > b.x && a.y - pad < b.y + b.h && a.y + a.h + pad > b.y;
}

/**
 * Generate the whole city. Returns buildings (with roof colour, height and rooftop props),
 * containers, palms, street lights, and every solid rectangle in `colliders`, indexed by a
 * spatial hash in `hash` for fast collision queries.
 */
export function buildCity() {
  const rng = new Rng(20261119);
  const buildings = [];
  const containers = [];
  const specials = Object.values(SPECIALS);

  // Block interiors: the land between road edges, plus the strips at the map's edges.
  const xBands = [[402, 445]];
  for (let i = 0; i < V_ROADS.length; i += 1) {
    const left = V_ROADS[i].c + ROAD_HALF;
    const right = (i + 1 < V_ROADS.length ? V_ROADS[i + 1].c : WORLD.width) - (i + 1 < V_ROADS.length ? ROAD_HALF : 0);
    if (right - left > 60) xBands.push([left, right]);
  }
  const yBands = [[0, H_ROADS[0].c - ROAD_HALF]];
  for (let i = 0; i < H_ROADS.length; i += 1) {
    const top = H_ROADS[i].c + ROAD_HALF;
    const bottom = (i + 1 < H_ROADS.length ? H_ROADS[i + 1].c : WORLD.height) - (i + 1 < H_ROADS.length ? ROAD_HALF : 0);
    if (bottom - top > 60) yBands.push([top, bottom]);
  }

  for (const [bx0, bx1] of xBands) {
    for (const [by0, by1] of yBands) {
      const cx = (bx0 + bx1) / 2; const cy = (by0 + by1) / 2;
      const district = districtAt(cx, cy);
      const inner = { x: bx0 + 15, y: by0 + 15, w: bx1 - bx0 - 30, h: by1 - by0 - 30 };
      if (inner.w < 50 || inner.h < 50) continue;
      // Lot grid per district: downtown dense and tall, suburbs loose houses, port huge sheds.
      const cols = district === 'suburbs' ? 3 : district === 'port' ? 1 : 2;
      const rows = district === 'port' ? 1 : 2;
      const lotW = inner.w / cols; const lotH = inner.h / rows;
      for (let i = 0; i < cols; i += 1) {
        for (let j = 0; j < rows; j += 1) {
          const fill = district === 'suburbs' ? 0.52 : district === 'port' ? 0.86 : 0.74;
          const w = lotW * fill * rng.range(0.85, 1);
          const h = lotH * fill * rng.range(0.85, 1);
          const b = {
            x: inner.x + i * lotW + (lotW - w) / 2,
            y: inner.y + j * lotH + (lotH - h) / 2,
            w, h, district,
            color: rng.pick(ROOF_COLORS[district]),
            height: district === 'downtown' ? rng.range(46, 120) : district === 'port' ? rng.range(24, 40)
              : district === 'suburbs' ? rng.range(9, 15) : rng.range(18, 46),
            props: [],
          };
          if (specials.some((s) => rectsOverlap(b, s, 12))) continue;
          const propCount = district === 'downtown' ? rng.int(1, 3) : rng.int(0, 1);
          for (let p = 0; p < propCount; p += 1) {
            b.props.push({ dx: rng.range(0.08, 0.7) * w, dy: rng.range(0.08, 0.7) * h, w: rng.range(8, 20), h: rng.range(8, 16) });
          }
          buildings.push(b);
        }
      }
      // Container stacks dress the port blocks (and collide like buildings).
      if (district === 'port') {
        for (let k = 0; k < 5; k += 1) {
          const c = { x: bx0 + rng.range(20, Math.max(24, bx1 - bx0 - 90)), y: by0 + rng.range(20, Math.max(24, by1 - by0 - 40)), w: rng.range(52, 74), h: 24, color: rng.pick(['#c65b39', '#3f7fbf', '#59a96a', '#c9a227', '#7a4f9e']) };
          if (!specials.some((s) => rectsOverlap(c, s, 8)) && !buildings.some((b) => rectsOverlap(c, b, 4))) containers.push(c);
        }
      }
    }
  }

  // Palms line the boardwalk and dot the beachfront; street lights march along the avenues.
  const palms = [];
  for (let y = 60; y < WORLD.height; y += rng.range(120, 210)) palms.push({ x: 306 + rng.range(-8, 8), y, s: rng.range(0.8, 1.25) });
  for (let i = 0; i < 46; i += 1) palms.push({ x: rng.range(430, 1000), y: rng.range(60, WORLD.height - 60), s: rng.range(0.7, 1.1) });
  const lights = [];
  for (const road of V_ROADS) for (let y = road.from + 90; y < road.to; y += 230) lights.push({ x: road.c - ROAD_HALF - 7, y });
  for (const road of H_ROADS) for (let x = road.from + 90; x < road.to; x += 230) lights.push({ x, y: road.c - ROAD_HALF - 7 });

  const colliders = [...buildings, ...containers, ...specials, ...WATER_RECTS];
  const hash = new Map();
  const CELL = 220;
  const key = (cx, cy) => cx + ':' + cy;
  colliders.forEach((rect, index) => {
    const x0 = Math.floor(rect.x / CELL); const x1 = Math.floor((rect.x + rect.w) / CELL);
    const y0 = Math.floor(rect.y / CELL); const y1 = Math.floor((rect.y + rect.h) / CELL);
    for (let cx = x0; cx <= x1; cx += 1) for (let cy = y0; cy <= y1; cy += 1) {
      const k = key(cx, cy);
      if (!hash.has(k)) hash.set(k, []);
      hash.get(k).push(index);
    }
  });

  return {
    buildings, containers, palms, lights, colliders,
    specials: SPECIALS, garageZone: GARAGE_ZONE,
    /** Solid rectangles near a point, via the spatial hash. */
    nearColliders(x, y) {
      const out = [];
      const seen = new Set();
      const cx = Math.floor(x / CELL); const cy = Math.floor(y / CELL);
      for (let i = -1; i <= 1; i += 1) for (let j = -1; j <= 1; j += 1) {
        const list = hash.get(key(cx + i, cy + j));
        if (!list) continue;
        for (const index of list) if (!seen.has(index)) { seen.add(index); out.push(colliders[index]); }
      }
      return out;
    },
    /** Push a circle out of every solid rectangle near it and clamp it inside the world. */
    collideCircle(x, y, r) {
      let px = clamp(x, r, WORLD.width - r);
      let py = clamp(y, r, WORLD.height - r);
      for (let pass = 0; pass < 2; pass += 1) {
        for (const rect of this.nearColliders(px, py)) {
          if (circleHitsRect(px, py, r, rect)) {
            const fixed = pushCircleOutOfRect(px, py, r, rect);
            px = fixed.x; py = fixed.y;
          }
        }
      }
      return { x: px, y: py };
    },
    /** True when a circle at (x, y) would touch something solid. */
    isBlocked(x, y, r) {
      return this.nearColliders(x, y).some((rect) => circleHitsRect(x, y, r, rect));
    },
    /** True when the straight line between two points crosses no building (for police sight). */
    lineOfSight(x1, y1, x2, y2) {
      const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 26);
      for (let i = 1; i < steps; i += 1) {
        const t = i / steps;
        const x = x1 + (x2 - x1) * t; const y = y1 + (y2 - y1) * t;
        for (const rect of this.nearColliders(x, y)) {
          if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) return false;
        }
      }
      return true;
    },
  };
}

/** True when the point sits on asphalt (used by traffic, spawning and rendering). */
export function isOnRoad(x, y) {
  for (const road of V_ROADS) if (Math.abs(x - road.c) <= ROAD_HALF && y >= road.from && y <= road.to) return true;
  for (const road of H_ROADS) if (Math.abs(y - road.c) <= ROAD_HALF && x >= road.from && x <= road.to) return true;
  return false;
}

/** A random point on a random road, for traffic and police spawns. */
export function randomRoadPoint(rng) {
  if (rng.chance(0.5)) {
    const road = rng.pick(V_ROADS);
    return { x: road.c, y: rng.range(road.from + 40, road.to - 40), road, vertical: true };
  }
  const road = rng.pick(H_ROADS);
  return { x: rng.range(road.from + 40, road.to - 40), y: road.c, road, vertical: false };
}
