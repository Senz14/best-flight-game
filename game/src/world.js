// The flight model: one fixed-step simulation of a courier jet on a ring course.
// Position is (dist along the course, lateral offset, altitude); the stick banks and
// pitches the jet, the throttle sets the speed, fuel drains, rings score, the ground
// and the runway decide how a sortie ends. Nothing here draws anything.

import {
  COURSE_LENGTH, CRUISE_ALT, FUEL_DRAIN, LANDING_POINTS, MAX_ALT, MAX_SPEED,
  MIN_SPEED, MISSIONS, NEAR_MISS_POINTS, PITCH_RATE, RING_FUEL_BONUS,
  RING_POINTS, RING_RADIUS, RUNWAY_AT, RUNWAY_WIDTH, TURN_RATE,
} from './config.js';
import { clamp, createRandom, makeRidge, range, wrapAngle } from './random.js';

export const EVENT_RING = 1;
export const EVENT_MISS = 2;
export const EVENT_LAND = 4;
export const EVENT_CRASH = 8;
export const EVENT_OVER = 16;

const KNOT_TO_FPS = 1.6878;

function terrainAmplitude(palette) {
  if (palette === 'dusk') return 520;
  if (palette === 'night') return 380;
  return 260;
}

export function createWorld(random) {
  let mission = MISSIONS[0];
  let terrain = null;
  let clouds = [];
  let rings = [];
  let farRidge = [];
  let nearRidge = [];
  let state = null;

  function buildCourse() {
    const ridge = makeRidge(random, 24, 0, terrainAmplitude(mission.palette));
    const lateral = makeRidge(random, 12, -120, 320);
    terrain = (dist, x) => {
      const t = clamp(dist / COURSE_LENGTH, 0, 1);
      let height = ridge(t) + lateral(clamp((x + 1800) / 3600, 0, 1)) + 40;
      const nearRunway =
        clamp(1 - Math.abs(dist - RUNWAY_AT) / 1800, 0, 1) *
        clamp(1 - Math.abs(x) / 500, 0, 1);
      height *= 1 - nearRunway * 0.96;
      // A valley along the final approach: the runway sits in flat ground, so a
      // descending jet is never asked to fly through the hills beside the strip.
      // The corridor opens 6,000 ft out and stays flat past the runway.
      const approach =
        clamp((dist - (RUNWAY_AT - 6000)) / 3500, 0, 1) *
        clamp(1 - Math.abs(x) / 700, 0, 1);
      height *= 1 - approach * 0.97;
      // The departure end is flat too: a sortie never starts inside a hill.
      const nearStart = clamp(1 - dist / 2500, 0, 1);
      height *= 1 - nearStart * 0.92;
      return Math.max(0, height);
    };
    clouds = [];
    for (let index = 0; index < 14; index += 1) {
      clouds.push({
        x: random(), y: range(random, 0.2, 0.38), scale: range(random, 0.5, 1.6),
        speed: range(random, 0.002, 0.008),
      });
    }
    // Distant ridge silhouettes for the renderer: smooth random profiles, 0..1.
    const ridgeProfile = (points, low, high) => {
      const profile = makeRidge(random, points, low, high);
      const values = [];
      for (let index = 0; index < points; index += 1) values.push(profile(index / (points - 1)));
      return values;
    };
    farRidge = ridgeProfile(28, 0.25, 1);
    nearRidge = ridgeProfile(20, 0.3, 1);
    rings = [];
    const first = 3500;
    const last = RUNWAY_AT - 4500;
    for (let index = 0; index < mission.rings; index += 1) {
      const t = mission.rings === 1 ? 0.5 : index / (mission.rings - 1);
      rings.push({
        dist: first + (last - first) * t + range(random, -500, 500),
        alt: clamp(CRUISE_ALT + range(random, -320, 420), 260, 1500),
        x: range(random, -750, 750),
        passed: false,
        missed: false,
      });
    }
    rings.sort((a, b) => a.dist - b.dist);
    // No ring hides inside a hill: each one hangs clear of the ground below it.
    for (let index = 0; index < rings.length; index += 1) {
      const ring = rings[index];
      ring.alt = clamp(Math.max(ring.alt, terrain(ring.dist, ring.x) + 170), 260, 1500);
    }
  }

  function freshState() {
    return {
      dist: 0, x: 0, alt: 420, speed: 120, heading: 0, pitch: 0, roll: 0,
      throttle: 0.55, fuel: mission.fuel, score: 0, ringsPassed: 0, combo: 0,
      status: 'flying', reason: '', time: 0, vspeed: 0, warnings: [],
    };
  }

  function selectMission(index) {
    mission = MISSIONS[Math.max(0, Math.min(MISSIONS.length - 1, index))];
    buildCourse();
    state = freshState();
  }

  selectMission(0);

  function groundAt(dist, x) {
    return terrain(dist, x);
  }

  function nextRing() {
    for (let index = 0; index < rings.length; index += 1) {
      if (!rings[index].passed && !rings[index].missed) return rings[index];
    }
    return null;
  }

  function step(dt, stick, throttleDelta, gustPhase) {
    if (state.status !== 'flying') return 0;
    let events = 0;
    const previousDist = state.dist;
    state.time += dt;

    // Throttle: the engine answers at once; with no fuel it answers not at all.
    state.throttle = clamp(state.throttle + throttleDelta * dt * 0.6, 0, 1);
    if (state.fuel <= 0) state.throttle = 0;
    const targetSpeed = state.throttle * MAX_SPEED;
    state.speed += clamp(targetSpeed - state.speed, -30 * dt, 22 * dt);

    // Bank turns the jet; pitch climbs and dives it; wind pushes it sideways.
    const bankTarget = stick.bank * 55;
    state.roll += clamp(bankTarget - state.roll, -140 * dt, 140 * dt);
    state.heading = wrapAngle(state.heading + state.roll * (TURN_RATE / 55) * dt);
    const pitchTarget = stick.pitch * PITCH_RATE;
    state.pitch += clamp(pitchTarget - state.pitch, -40 * dt, 40 * dt);
    const gust = mission.wind * Math.sin(state.time * 0.7 + gustPhase);
    state.x += (Math.sin((state.heading * Math.PI) / 180) * state.speed * KNOT_TO_FPS + gust) * dt;
    state.x = clamp(state.x, -1800, 1800);
    state.dist += Math.cos((state.heading * Math.PI) / 180) * state.speed * KNOT_TO_FPS * dt;

    state.vspeed = Math.sin((state.pitch * Math.PI) / 180) * state.speed * KNOT_TO_FPS;
    state.alt += state.vspeed * dt;
    if (state.speed < MIN_SPEED) state.alt -= (MIN_SPEED - state.speed) * 1.4 * dt;
    state.alt = clamp(state.alt, 0, MAX_ALT);

    state.fuel = Math.max(0, state.fuel - FUEL_DRAIN * state.throttle * dt * (1 + state.speed / MAX_SPEED));

    // Warnings the HUD flashes: terrain, fuel, stall.
    state.warnings = [];
    const ground = groundAt(state.dist, state.x);
    if (state.alt - ground < 180) state.warnings.push('PULL UP');
    if (state.fuel < 20) state.warnings.push('LOW FUEL');
    if (state.speed < MIN_SPEED + 12) state.warnings.push('STALL');

    // Rings: crossing one's line decides pass, near miss or miss.
    for (let index = 0; index < rings.length; index += 1) {
      const ring = rings[index];
      if (ring.passed || ring.missed || previousDist >= ring.dist || state.dist < ring.dist) continue;
      const altGap = Math.abs(state.alt - ring.alt);
      const latGap = Math.abs(state.x - ring.x);
      if (altGap < RING_RADIUS + 18 && latGap < RING_RADIUS + 18) {
        ring.passed = true;
        state.ringsPassed += 1;
        state.combo += 1;
        state.score += RING_POINTS + (state.combo - 1) * 10;
        state.fuel = Math.min(100, state.fuel + RING_FUEL_BONUS);
        events |= EVENT_RING;
      } else if (altGap < RING_RADIUS * 2.4 && latGap < RING_RADIUS * 2.4) {
        ring.missed = true;
        state.combo = 0;
        state.score += NEAR_MISS_POINTS;
        events |= EVENT_MISS;
      } else {
        ring.missed = true;
        state.combo = 0;
        events |= EVENT_MISS;
      }
    }

    // The ground decides the ending: a gentle touchdown on the strip, else a crash.
    const overRunway =
      Math.abs(state.dist - RUNWAY_AT) < 700 && Math.abs(state.x) < RUNWAY_WIDTH / 2;
    if (state.alt <= ground + 4) {
      state.alt = ground;
      if (overRunway && Math.abs(state.vspeed) < 14 && state.speed < 175) {
        state.status = 'landed';
        state.score += LANDING_POINTS + Math.round(state.fuel) * 2;
        events |= EVENT_LAND | EVENT_OVER;
      } else {
        state.status = 'crashed';
        state.reason = overRunway ? 'Too fast on the runway' : 'Terrain impact';
        events |= EVENT_CRASH | EVENT_OVER;
      }
    } else if (state.dist > COURSE_LENGTH + 1500) {
      state.status = 'crashed';
      state.reason = 'You flew past the runway';
      events |= EVENT_CRASH | EVENT_OVER;
    }
    return events;
  }

  function reset() {
    buildCourse();
    state = freshState();
  }

  return {
    get state() {
      return state;
    },
    get mission() {
      return mission;
    },
    get rings() {
      return rings;
    },
    get clouds() {
      return clouds;
    },
    get farRidge() {
      return farRidge;
    },
    get nearRidge() {
      return nearRidge;
    },
    selectMission,
    reset,
    step,
    groundAt,
    nextRing,
  };
}
