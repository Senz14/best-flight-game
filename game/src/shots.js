// The screenshot scenes behind ?shot=cover|title|play|land. Each one plays the real
// rules forward from a fresh world for a fixed number of steps, steered by a simple
// autopilot (bank toward the next ring, pitch toward its altitude, throttle up), so
// every frame is what a short game really looks like and the same seed always gives
// the same frame. The cover flies through a ring with the runway ahead; the land
// scene flies the whole sortie to a touchdown.

import { EVENT_OVER, EVENT_RING } from './world.js';
import { SCREEN_CRASHED, SCREEN_LANDED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { RUNWAY_AT, STEP } from './config.js';
import { clamp, wrapAngle } from './random.js';

const SAMPLE = STEP;

/**
 * Steer toward the next ring: bank until the heading matches the bearing to the
 * ring, pitch toward its altitude. Banking at the lateral offset alone spins the
 * jet in circles; steering at the bearing keeps it on the course.
 */
export function autopilotSteer(state, world) {
  const ring = world.nextRing();
  if (ring === null) return { pitch: 0, bank: 0 };
  const dz = Math.max(1, ring.dist - state.dist);
  const bearing = (Math.atan2(ring.x - state.x, dz) * 180) / Math.PI;
  const headingError = wrapAngle(bearing - state.heading);
  return {
    pitch: clamp((ring.alt - state.alt) / 220, -1, 1),
    bank: clamp(headingError / 25, -1, 1),
  };
}

// Throttle change that holds `target` (0..1): ease toward it, never slam it.
function throttleToward(state, target) {
  return clamp((target - state.throttle) * 2, -0.6, 0.6);
}

function flyFor(world, seconds, targetThrottle) {
  let events = 0;
  for (let index = 0; index < seconds / SAMPLE; index += 1) {
    const stick = autopilotSteer(world.state, world);
    events |= world.step(SAMPLE, stick, throttleToward(world.state, targetThrottle), 0);
    if (events & EVENT_OVER) break;
  }
  return events;
}

// Fly until the next ring is resolved (flown or missed) or the sortie ends;
// returns true when a ring was flown.
function flyToRing(world) {
  const ring = world.nextRing();
  if (ring === null) return false;
  const before = world.state.ringsPassed;
  for (let index = 0; index < 1200; index += 1) {
    const stick = autopilotSteer(world.state, world);
    const events = world.step(SAMPLE, stick, throttleToward(world.state, 0.7), 0);
    if (events & EVENT_OVER) return false;
    if (ring.passed || ring.missed) return world.state.ringsPassed > before;
  }
  return false;
}

/**
 * Set `world` to the named scene and return the screen to draw over it and the best
 * score to show. Any other name stages the title scene.
 */
export function stageShot(name, world) {
  world.reset();
  if (name === 'title') {
    flyFor(world, 6, 0.7);
    return { screen: SCREEN_TITLE, best: 0 };
  }
  if (name === 'play') {
    // Two rings in, banking through a turn over the ridge.
    flyToRing(world);
    flyToRing(world);
    flyFor(world, 4, 0.7);
    return { screen: world.state.status === 'flying' ? SCREEN_PLAY : SCREEN_CRASHED, best: world.state.score };
  }
  if (name === 'land') {
    // Fly the whole sortie: every ring, then a pursuit approach — aim at the runway
    // threshold, ride the glide slope down, and never descend below the ground ahead
    // plus a margin that tapers away as the strip nears.
    for (let index = 0; index < 40; index += 1) {
      if (world.nextRing() === null) break;
      flyToRing(world);
      if (world.state.status !== 'flying') break;
    }
    for (let index = 0; index < 7200; index += 1) {
      const state = world.state;
      if (state.status !== 'flying') break;
      const remaining = RUNWAY_AT - state.dist;
      // The aim point never flips behind the jet: past the threshold, keep aiming
      // at the strip itself instead of climbing away from it.
      const aimDist = Math.max(500, remaining);
      const bearing = (Math.atan2(0 - state.x, aimDist) * 180) / Math.PI;
      const desiredHeading = clamp(bearing, -25, 25);
      const headingError = wrapAngle(desiredHeading - state.heading);
      const glideAlt = clamp(remaining * 0.045, 0, 400);
      const floorAlt = world.groundAt(state.dist + 400, state.x) + 40 * clamp(remaining / 1000, 0, 1);
      const overStrip = remaining < 0 && remaining > -700;
      const onSlope = (Math.abs(state.x) < 260 && Math.abs(headingError) < 20) || overStrip;
      const targetAlt = onSlope ? Math.max(glideAlt, floorAlt) : Math.max(520, floorAlt);
      const stick = {
        pitch: clamp((targetAlt - state.alt) / 90, -1, 1),
        bank: clamp(headingError / 25, -1, 1),
      };
      // Hold about 115 kt on final: gentle, and slow enough to land.
      const throttleDelta = state.speed < 115 ? 0.5 : state.speed > 135 ? -0.5 : 0;
      world.step(STEP, stick, throttleDelta, 0);
    }
    const landed = world.state.status === 'landed';
    return { screen: landed ? SCREEN_LANDED : SCREEN_CRASHED, best: world.state.score };
  }
  // Cover: mid-course, one ring just flown, the next ring ahead, runway in the distance.
  flyToRing(world);
  flyFor(world, 3, 0.7);
  return { screen: SCREEN_PLAY, best: world.state.score };
}
