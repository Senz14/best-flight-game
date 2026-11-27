// Skyline Courier: tuning numbers, mission definitions and palettes.
// One file, one job: every number the flight model and the renderer share lives here
// so a mission can be retuned without touching the simulation or the drawing code.

export const VIEW_WIDTH = 1280;
export const VIEW_HEIGHT = 720;
export const HORIZON_Y = 300;
export const STEP = 1 / 60;
export const BEST_KEY = 'skyline-courier-best';

// Flight model limits.
export const MAX_SPEED = 320; // knots at full throttle
export const MIN_SPEED = 60; // knots: below this the courier stalls and sinks
export const MAX_ALT = 3000; // feet
export const CRUISE_ALT = 900; // feet: where the rings hang
export const TURN_RATE = 18; // degrees per second at full bank
export const PITCH_RATE = 14; // degrees per second at full stick
export const FUEL_DRAIN = 0.5; // percent per second at full throttle
export const RING_FUEL_BONUS = 9; // percent of fuel a flown ring gives back
export const RING_POINTS = 100;
export const LANDING_POINTS = 500;
export const NEAR_MISS_POINTS = 25;

// Course geometry. Distances are in feet along the course; lateral offset in feet.
export const COURSE_LENGTH = 42000;
export const RUNWAY_AT = 40000;
export const RUNWAY_WIDTH = 260;
export const RING_RADIUS = 42;

// Missions. Each one is a sortie: a palette, a terrain seed, a ring count and a fuel load.
// The ring altitudes and lateral offsets are derived from the seed, never hard-coded.
export const MISSIONS = [
  {
    id: 'coral-coast',
    name: 'Ring Run — Coral Coast',
    blurb: 'Ten rings over the coast, then put her down on runway 27.',
    seed: 1101,
    rings: 10,
    fuel: 100,
    wind: 0,
    palette: 'day',
  },
  {
    id: 'dusk-ridge',
    name: 'Island Hop — Dusk Ridge',
    blurb: 'Eight rings through the ridge at dusk. Short fuel, tall hills.',
    seed: 2202,
    rings: 8,
    fuel: 82,
    wind: 6,
    palette: 'dusk',
  },
  {
    id: 'night-run',
    name: 'Storm Courier — Night Run',
    blurb: 'Twelve rings in the dark with gusting wind. Fly the instruments.',
    seed: 3303,
    rings: 12,
    fuel: 100,
    wind: 14,
    palette: 'night',
  },
];

// Sky, terrain and light per palette. The night run keeps the instruments lit:
// the HUD and the ring glow are what the pilot flies by after dark.
export const PALETTES = {
  day: {
    skyTop: '#2f7fd0', skyMid: '#7db8e8', skyLow: '#cfe8f7',
    sun: '#fff3b0', sunGlow: 'rgba(255, 243, 176, 0.55)',
    far: '#8fb4d8', near: '#6f9a68',
    fieldA: '#7fae62', fieldB: '#a8c46a', fieldC: '#5d9153',
    road: '#8a7a5c', river: '#4d8fc4', runway: '#3c4148', runwayMark: '#f2f2e6',
    cloud: 'rgba(255, 255, 255, 0.92)', haze: 'rgba(207, 232, 247, 0.5)',
  },
  dusk: {
    skyTop: '#3a2f66', skyMid: '#c65f6e', skyLow: '#f2a35e',
    sun: '#ffb347', sunGlow: 'rgba(255, 179, 71, 0.6)',
    far: '#7a5a7d', near: '#54466b',
    fieldA: '#6d7a4e', fieldB: '#8a7f4e', fieldC: '#4e5e42',
    road: '#6e5c48', river: '#7a5a8a', runway: '#33363d', runwayMark: '#e8e2c8',
    cloud: 'rgba(255, 214, 180, 0.85)', haze: 'rgba(242, 163, 94, 0.4)',
  },
  night: {
    skyTop: '#060a1c', skyMid: '#101a38', skyLow: '#27355c',
    sun: '#e8ecff', sunGlow: 'rgba(232, 236, 255, 0.35)',
    far: '#1c2748', near: '#141d33',
    fieldA: '#1d2b22', fieldB: '#26331f', fieldC: '#16211a',
    road: '#2c2f36', river: '#1d3a5c', runway: '#22252c', runwayMark: '#d8d8b0',
    cloud: 'rgba(120, 140, 190, 0.5)', haze: 'rgba(39, 53, 92, 0.45)',
  },
};
