// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer
// paints what is there. The game moves between six screens: title, play, paused,
// mission complete, game over and all-missions won.
//
// ?seed=N fixes the terrain and the rings. ?shot=cover|rings|landing|lowfuel
// (with &seed=N) stages that scene instead of running the loop, paints it twice
// and sets window.__shotReady for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  EVENT_CRASH, EVENT_FUEL, EVENT_HIT, EVENT_LAND, EVENT_MISSION, EVENT_RING, EVENT_WIN, createWorld,
} from './world.js';
import {
  ACTION_CONFIRM, ACTION_MISSION, ACTION_MUTE, ACTION_PAUSE, createInput,
} from './input.js';
import { createAudio } from './audio.js';
import {
  SCREEN_MISSION, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN, createRenderer,
} from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed), seed);
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
    renderer.draw(world.state, scene.screen, 0);
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
  let throttle = 0.62;
  let warnAt = 0;

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function startMission(index) {
    world.reset(index);
    throttle = 0.62;
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.ensure();
    announce(`Mission ${index + 1}: ${world.state.mission.name}. ${world.state.mission.briefing}`);
  }

  function endRun() {
    screen = world.state.win ? SCREEN_WIN : SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(world.state.win
      ? `All sorties flown. Total score ${world.state.score}.`
      : `Sortie over. Score ${world.state.score}. Best ${best}.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    const choice = input.takeMissionChoice();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Sound off.' : 'Sound on.');
    }
    if (choice >= 1 && choice <= 3 && (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WIN)) {
      startMission(choice - 1);
      return;
    }
    if (actions & ACTION_CONFIRM) {
      if (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WIN) startMission(0);
      else if (screen === SCREEN_MISSION) {
        screen = SCREEN_PLAY;
        announce(`Mission ${world.state.missionIndex + 1}: ${world.state.mission.name}.`);
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    } else if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
  }

  function controlsFromInput() {
    const c = input.controls();
    throttle = Math.max(0, Math.min(1, throttle + c.throttle * STEP * 0.9));
    return { pitch: c.pitch, bank: c.bank, throttle };
  }

  function handleEvents(events) {
    const s = world.state;
    if (events & EVENT_RING) {
      audio.ring();
      announce(`Ring ${s.ringsPassed} of ${s.rings.length}. Score ${s.score}.`);
    }
    if (events & EVENT_FUEL) {
      audio.fuel();
      announce('Fuel ring. Tanks topped up.');
    }
    if (events & EVENT_HIT) {
      audio.hit();
      if (s.damage >= 100) return;
      announce(s.damage >= 66 ? 'Heavy damage. Bring her home.' : 'Struck terrain. Damage taken.');
    }
    if (events & EVENT_LAND) {
      audio.land();
      announce('Touchdown. Mission complete.');
    }
    if (events & EVENT_MISSION) {
      screen = SCREEN_MISSION;
    }
    if (events & (EVENT_CRASH | EVENT_WIN)) {
      audio.hit();
      endRun();
    }
    if (s.warning && (s.warning === 'STALL' || s.warning === 'LOW FUEL') && s.time - warnAt > 4) {
      warnAt = s.time;
      audio.warn();
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      // The title flies itself: the autopilot threads the first ring behind the menu.
      const s = world.state;
      const next = s.rings.find((r) => !r.passed);
      let ctl = { pitch: 0, bank: 0, throttle: 0.62 };
      if (next) {
        const want = (Math.atan2(next.x - s.x, -(next.z - s.z)) * 180) / Math.PI;
        let diff = want - s.heading;
        while (diff > 180) diff -= 360;
        while (diff < -180) diff += 360;
        ctl = {
          pitch: Math.max(-1, Math.min(1, (next.alt - s.alt) / 900)),
          bank: Math.max(-1, Math.min(1, diff / 18)),
          throttle: 0.7,
        };
      }
      world.step(STEP, ctl);
      if (world.state.over) world.reset(0);
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const events = world.step(STEP, controlsFromInput());
    audio.update(throttle, world.state.speed, true);
    handleEvents(events);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
      step();
      accumulator -= STEP;
    }
    if (screen !== SCREEN_TITLE && screen !== SCREEN_PLAY) accumulator = 0;
    renderer.draw(world.state, screen, best);
  }

  // Leaving the tab pauses a running game rather than letting it fly unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Skyline Courier. Press Space or click to fly, or 1, 2, 3 to pick a sortie.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();

// The playtest driver reads the live world through this handle.
window.__skyline = {
  world,
  get state() {
    return world.state;
  },
};
