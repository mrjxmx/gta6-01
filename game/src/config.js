// Solano Heat — shared constants: the canvas, the world, the palette, the tuning.
// Everything visual is drawn from these values so the whole city shares one late-afternoon look.

/** Internal resolution the game renders at; the canvas is scaled to the window. */
export const VIEW = { width: 1280, height: 800 };

/** The whole map of Port Solano, in world pixels. */
export const WORLD = { width: 4400, height: 3200 };

/** Fixed simulation step (seconds); the loop accumulates real time into steps of this size. */
export const STEP = 1 / 120;

/** Late-afternoon Port Solano palette: warm sand, teal sea, sun-bleached roofs. */
export const COLORS = {
  water: '#2e7f86',
  waterDeep: '#256a75',
  sand: '#ecd29a',
  boardwalk: '#b98a5e',
  grass: '#79a85b',
  lawn: '#8cb96a',
  sidewalk: '#cfc4ae',
  road: '#4a4543',
  roadLine: '#e8dcc0',
  crosswalk: '#ddd6c4',
  plaza: '#d9c9a8',
  shadow: 'rgba(46, 22, 30, 0.28)',
  sunTint: 'rgba(255, 166, 66, 0.07)',
};

/** Building roof colours per district, picked by the seeded generator. */
export const ROOF_COLORS = {
  downtown: ['#c96f4a', '#b8574f', '#d18a52', '#a34d5e', '#c25e3a'],
  midtown: ['#d9a05b', '#c98d5f', '#bf7355', '#dcae72'],
  beachfront: ['#e8b04b', '#df9455', '#eec27a', '#d97f63'],
  marina: ['#e6e0d0', '#d8cdb4', '#cfd8d2'],
  suburbs: ['#caa27e', '#bd8f66', '#d4b28c', '#a87f5f'],
  port: ['#8d99a0', '#7d8a94', '#9aa4a3', '#6f7d88'],
};

/** Car paint jobs seen on Port Solano's streets. */
export const CAR_COLORS = ['#d64541', '#3f7fbf', '#e0a51f', '#59a96a', '#e8e4da', '#7a4f9e', '#2f2f36', '#c0c6cc', '#e2703a', '#4fb3a9'];

/** Pedestrian shirt colours. */
export const SHIRT_COLORS = ['#e2543e', '#f2b035', '#3e7cb1', '#81b29a', '#f2cc8f', '#9d6bc2', '#e8e3d9', '#52796f', '#d1607a'];

/** Player tuning. */
export const PLAYER = {
  radius: 11,
  walkSpeed: 158,
  runSpeed: 252,
  health: 100,
};

/** Wanted/heat tuning: heat is a float, the stars shown are its ceiling. */
export const HEAT = {
  max: 5,
  stealCar: 1,
  hitPedestrian: 1,
  killPedestrian: 1.6,
  hitCarHard: 0.5,
  gunshotSeen: 0.6,
  decayDelaySec: 5,
  decayPerSec: 0.16,
  sightRange: 560,
};
