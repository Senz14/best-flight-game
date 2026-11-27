// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is
// there. The game moves between five screens: title, play, paused, landed and crashed.
//
// ?seed=N fixes the course. ?shot=cover|title|play|land (with &seed=N) stages that
// scene instead of running the loop, paints it twice and sets window.__shotReady
// for a screenshot. ?mission=0|1|2 picks the sortie (0 is the day run).

import { BEST_KEY, MISSIONS, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_CRASH, EVENT_LAND, EVENT_MISS, EVENT_OVER, EVENT_RING } from './world.js';
import { ACTION_CONFIRM, ACTION_MISSION_1, ACTION_MISSION_2, ACTION_MISSION_3, ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_CRASHED, SCREEN_LANDED, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { autopilotSteer, stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);
const missionParam = Number.parseInt(params.get('mission') ?? '0', 10);
const missionIndex = Number.isInteger(missionParam) && missionParam >= 0 && missionParam < MISSIONS.length ? missionParam : 0;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
world.selectMission(missionIndex);
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(scene.screen, world.state, world, scene.best, world.state.time, audio.isMuted());
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();

  // Screen readers (and anyone watching the page's text) hear the screen changes and each ring.
  function announce(message) {
    status.textContent = message;
  }

  function startSortie(index) {
    world.selectMission(index);
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce(`Flying ${world.mission.name}. Fly the rings, then land on runway 27.`);
  }

  function handleEvents(events) {
    if (events & EVENT_RING) {
      audio.ring();
      announce(`Ring ${world.state.ringsPassed} of ${world.mission.rings}. Score ${world.state.score}.`);
    }
    if (events & EVENT_MISS) audio.nearMiss();
    if (events & EVENT_LAND) {
      audio.land();
      screen = SCREEN_LANDED;
      if (world.state.score > best) {
        best = world.state.score;
        saveBest(best);
      }
      announce(`Touchdown on runway 27. Score ${world.state.score}.`);
    }
    if (events & EVENT_CRASH) {
      audio.crash();
      screen = SCREEN_CRASHED;
      if (world.state.score > best) {
        best = world.state.score;
        saveBest(best);
      }
      announce(`Crashed. ${world.state.reason}. Score ${world.state.score}. Press R to try again.`);
    }
  }

  function frame(now) {
    const elapsed = Math.min(MAX_FRAME, (now - last) / 1000);
    last = now;
    if (input.takeAction(ACTION_MUTE)) audio.toggleMute();
    if (screen === SCREEN_TITLE) {
      if (input.takeAction(ACTION_MISSION_1)) startSortie(0);
      else if (input.takeAction(ACTION_MISSION_2)) startSortie(1);
      else if (input.takeAction(ACTION_MISSION_3)) startSortie(2);
      else if (input.takeAction(ACTION_CONFIRM)) {
        audio.unlock();
        startSortie(missionIndex);
      }
    } else if (screen === SCREEN_PLAY) {
      if (input.takeAction(ACTION_PAUSE)) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else {
        audio.unlock();
        accumulator += elapsed;
        while (accumulator >= STEP) {
          accumulator -= STEP;
          const stick = input.stick();
          handleEvents(world.step(STEP, stick, input.throttleDelta(), 1.7));
          if (screen !== SCREEN_PLAY) {
            accumulator = 0;
            break;
          }
        }
        audio.setEngine(world.state.throttle, world.state.speed);
      }
    } else if (screen === SCREEN_PAUSED) {
      if (input.takeAction(ACTION_PAUSE) || input.takeAction(ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        last = performance.now();
        announce('Flying.');
      } else if (input.takeAction(ACTION_RESTART)) startSortie(missionIndex);
    } else if (input.takeAction(ACTION_RESTART)) {
      startSortie(missionIndex);
    } else if (screen === SCREEN_LANDED || screen === SCREEN_CRASHED) {
      if (input.takeAction(ACTION_MISSION_1)) startSortie(0);
      else if (input.takeAction(ACTION_MISSION_2)) startSortie(1);
      else if (input.takeAction(ACTION_MISSION_3)) startSortie(2);
    }
    if (screen === SCREEN_TITLE) {
      // Attract mode: the jet flies itself behind the title.
      accumulator += elapsed;
      while (accumulator >= STEP) {
        accumulator -= STEP;
        const stick = autopilotSteer(world.state, world);
        const throttleDelta = world.state.throttle < 0.7 ? 0.4 : 0;
        world.step(STEP, stick, throttleDelta, 1.7);
        if (world.state.status !== 'flying') world.reset();
      }
    }
    renderer.draw(screen, world.state, world, best, world.state.time, audio.isMuted());
    requestAnimationFrame(frame);
  }

  announce('Skyline Courier. Choose a sortie, then fly the rings and land on runway 27.');
  requestAnimationFrame(frame);
}

if (shot !== null) runShot(shot);
else runGame();
