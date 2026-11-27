// Keyboard and pointer input. Held keys steer the aircraft and work the throttle;
// one-shot presses (start, restart, pause, mute) are queued as bit flags and taken
// once by the loop, so a press between two frames is never lost or counted twice.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;
export const ACTION_MISSION = 8;

const PITCH_UP = new Set(['ArrowUp', 'KeyW']);
const PITCH_DOWN = new Set(['ArrowDown', 'KeyS']);
const BANK_LEFT = new Set(['ArrowLeft', 'KeyA']);
const BANK_RIGHT = new Set(['ArrowRight', 'KeyD']);
const THROTTLE_UP = new Set(['ShiftLeft', 'ShiftRight', 'Equal']);
const THROTTLE_DOWN = new Set(['ControlLeft', 'ControlRight', 'Minus']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const MUTE = new Set(['KeyM']);
const MISSION = new Set(['Digit1', 'Digit2', 'Digit3']);

export function createInput(target) {
  const held = new Set();
  let actions = 0;
  let missionChoice = 0;

  function onKey(event, down) {
    const code = event.code;
    if (down) held.add(code);
    else held.delete(code);
    if (down && !event.repeat) {
      if (CONFIRM.has(code)) actions |= ACTION_CONFIRM;
      else if (PAUSE.has(code)) actions |= ACTION_PAUSE;
      else if (MUTE.has(code)) actions |= ACTION_MUTE;
      else if (MISSION.has(code)) {
        actions |= ACTION_MISSION;
        missionChoice = Number(code.slice(-1));
      }
    }
    if (PITCH_UP.has(code) || PITCH_DOWN.has(code) || BANK_LEFT.has(code)
      || BANK_RIGHT.has(code) || THROTTLE_UP.has(code) || THROTTLE_DOWN.has(code)
      || CONFIRM.has(code) || PAUSE.has(code)) {
      event.preventDefault();
    }
  }

  window.addEventListener('keydown', (event) => onKey(event, true));
  window.addEventListener('keyup', (event) => onKey(event, false));
  window.addEventListener('blur', () => held.clear());
  target.addEventListener('pointerdown', () => {
    actions |= ACTION_CONFIRM;
  });

  function any(codes) {
    for (const code of codes) if (held.has(code)) return true;
    return false;
  }

  return {
    /** Stick position: pitch and bank in [-1, 1], throttle change in [-1, 1]. */
    controls() {
      const pitch = (any(PITCH_UP) ? 1 : 0) - (any(PITCH_DOWN) ? 1 : 0);
      const bank = (any(BANK_RIGHT) ? 1 : 0) - (any(BANK_LEFT) ? 1 : 0);
      const throttle = (any(THROTTLE_UP) ? 1 : 0) - (any(THROTTLE_DOWN) ? 1 : 0);
      return { pitch, bank, throttle };
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** The mission number (1-3) picked with a number key, 0 when none. */
    takeMissionChoice() {
      const choice = missionChoice;
      missionChoice = 0;
      return choice;
    },
  };
}
