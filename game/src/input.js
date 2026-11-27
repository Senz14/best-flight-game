// Keyboard and mouse input, reduced to one small state object per frame.
// Arrows (or WASD) pitch and bank, W/S (or Shift/Ctrl) work the throttle, the mouse
// steers toward where it points, Space confirms, P pauses, M mutes, R restarts.

export const ACTION_CONFIRM = 'confirm';
export const ACTION_PAUSE = 'pause';
export const ACTION_MUTE = 'mute';
export const ACTION_RESTART = 'restart';
export const ACTION_MISSION_1 = 'mission1';
export const ACTION_MISSION_2 = 'mission2';
export const ACTION_MISSION_3 = 'mission3';

const KEY_ACTIONS = {
  Enter: ACTION_CONFIRM,
  ' ': ACTION_CONFIRM,
  p: ACTION_PAUSE,
  P: ACTION_PAUSE,
  Escape: ACTION_PAUSE,
  m: ACTION_MUTE,
  M: ACTION_MUTE,
  r: ACTION_RESTART,
  R: ACTION_RESTART,
  1: ACTION_MISSION_1,
  2: ACTION_MISSION_2,
  3: ACTION_MISSION_3,
};

export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set();
  let mouseX = 0.5;
  let mouseY = 0.5;
  let mouseActive = false;

  function onKeyDown(event) {
    if (event.key === ' ' || event.key.startsWith('Arrow')) event.preventDefault();
    if (!event.repeat) pressed.add(event.key);
    keys.add(event.key);
  }

  function onKeyUp(event) {
    keys.delete(event.key);
  }

  function onMouseMove(event) {
    const rect = canvas.getBoundingClientRect();
    mouseX = (event.clientX - rect.left) / Math.max(1, rect.width);
    mouseY = (event.clientY - rect.top) / Math.max(1, rect.height);
    mouseActive = true;
  }

  function onMouseDown(event) {
    onMouseMove(event);
    pressed.add('mouse');
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);

  function held(...names) {
    return names.some((name) => keys.has(name));
  }

  return {
    // -1..1 stick deflection: pitch from Up/Down (and mouse height), bank from Left/Right.
    stick() {
      let pitch = 0;
      let bank = 0;
      if (held('ArrowUp', 'w', 'W')) pitch += 1;
      if (held('ArrowDown', 's', 'S')) pitch -= 1;
      if (held('ArrowLeft', 'a', 'A')) bank -= 1;
      if (held('ArrowRight', 'd', 'D')) bank += 1;
      if (mouseActive && bank === 0 && pitch === 0) {
        bank = (mouseX - 0.5) * 2;
        pitch = (0.5 - mouseY) * 1.4;
      }
      return { pitch: Math.max(-1, Math.min(1, pitch)), bank: Math.max(-1, Math.min(1, bank)) };
    },
    throttleDelta() {
      let delta = 0;
      if (held('Shift')) delta += 1;
      if (held('Control')) delta -= 1;
      return delta;
    },
    // One-shot actions, consumed when read.
    takeAction(name) {
      const key = Object.keys(KEY_ACTIONS).find((candidate) => KEY_ACTIONS[candidate] === name);
      if (key !== undefined && pressed.has(key)) {
        pressed.delete(key);
        return true;
      }
      if (name === ACTION_CONFIRM && pressed.has('mouse')) {
        pressed.delete('mouse');
        return true;
      }
      return false;
    },
    consumeAll() {
      pressed.clear();
    },
  };
}
