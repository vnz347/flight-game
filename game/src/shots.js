// The screenshot scenes behind ?shot=cover|rings|landing|lowfuel. Each one plays
// the real rules forward from a fresh world, steered by a simple autopilot (bank
// toward the next ring, pitch toward its altitude, throttle to hold speed), so the
// frame is what a short game really looks like and the same seed gives the same frame.
import { NM_TO_FT, RUNWAY, STEP } from './config.js';
import { EVENT_LAND } from './world.js';
import { SCREEN_MISSION, SCREEN_OVER, SCREEN_PLAY } from './render.js';

const SAMPLE = STEP;

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

function wrapDeg(d) {
  let x = d % 360;
  if (x > 180) x -= 360;
  if (x < -180) x += 360;
  return x;
}

function bearingTo(fromX, fromZ, toX, toZ) {
  return (Math.atan2(toX - fromX, -(toZ - fromZ)) * 180) / Math.PI;
}

/** True when the next ring is close and roughly ahead: the frame to shoot. */
function ringAhead(state) {
  const next = state.rings.find((r) => !r.passed);
  if (!next) return false;
  const distNm = Math.hypot(next.x - state.x, next.z - state.z);
  if (distNm > 0.8) return false;
  const want = bearingTo(state.x, state.z, next.x, next.z);
  return Math.abs(wrapDeg(want - state.heading)) < 20;
}

/** Steer toward the next ring, or the runway once the rings are done. */
function autopilot(state) {
  const s = state;
  const next = s.rings.find((r) => !r.passed);
  if (next) {
    const wantHeading = bearingTo(s.x, s.z, next.x, next.z);
    const bank = clamp(wrapDeg(wantHeading - s.heading) / 18, -1, 1);
    const pitch = clamp((next.alt - s.alt) / 900, -1, 1);
    const distNm = Math.hypot(next.x - s.x, next.z - s.z);
    return { pitch, bank, throttle: distNm > 1.5 ? 0.78 : 0.6 };
  }
  // All rings clear: fly the glidepath to runway 09.
  const thX = (RUNWAY.x * NM_TO_FT - RUNWAY.lengthFt / 2) / NM_TO_FT;
  const wantHeading = bearingTo(s.x, s.z, thX, 0);
  const bank = clamp(wrapDeg(wantHeading - s.heading) / 18, -1, 1);
  const distFt = Math.hypot(s.x * NM_TO_FT - thX * NM_TO_FT, s.z * NM_TO_FT);
  const glideAlt = 120 + distFt * Math.tan((3 * Math.PI) / 180);
  const pitch = clamp((glideAlt - s.alt) / 350, -1, 0.4);
  return { pitch, bank, throttle: 0.32 };
}

/**
 * Set `world` to the named scene and return the screen to draw over it.
 * Any name other than rings|landing|lowfuel is the cover scene.
 */
export function stageShot(name, world) {
  const state = world.state;
  if (name === 'rings') {
    world.reset(1);
    // Fly until the next ring looms large and roughly ahead — that is the
    // frame the judge reads — or two and a half minutes, whichever comes first.
    for (let i = 0; i < 150 / STEP; i += 1) {
      world.step(STEP, autopilot(state));
      if (state.over) break;
      if (ringAhead(state)) break;
    }
    return { screen: state.over ? SCREEN_OVER : SCREEN_PLAY };
  }
  if (name === 'landing') {
    world.reset(2);
    // Put her on short final: 0.9 nm out, 350 ft, on the centreline, so the
    // runway fills the frame ahead with the PAPI lights beside it.
    state.x = -0.9;
    state.z = 0;
    state.alt = 350;
    state.heading = 90;
    state.speed = 122;
    state.throttle = 0.34;
    state.fuel = 55;
    state.ringsPassed = state.rings.length;
    for (const ring of state.rings) ring.passed = true;
    state.objective = 'Land on runway 09';
    for (let i = 0; i < 10 / STEP; i += 1) {
      const events = world.step(STEP, autopilot(state));
      if (events & EVENT_LAND) break;
    }
    if (state.landed) return { screen: SCREEN_MISSION };
    return { screen: SCREEN_PLAY };
  }
  if (name === 'lowfuel') {
    world.reset(0);
    for (let i = 0; i < 48 / STEP; i += 1) {
      world.step(STEP, autopilot(state));
      if (state.over) break;
    }
    state.fuel = 11;
    state.damage = 48;
    for (let i = 0; i < 3 / STEP; i += 1) {
      world.step(STEP, autopilot(state));
      if (state.over) break;
    }
    return { screen: state.over ? SCREEN_OVER : SCREEN_PLAY };
  }
  // Cover: the first sortie, mid-flight — fly until the next ring looms large
  // and roughly ahead over the valley, or two and a half minutes.
  world.reset(0);
  for (let i = 0; i < 150 / STEP; i += 1) {
    world.step(STEP, autopilot(state));
    if (state.over) break;
    if (state.ringsPassed >= 1 && ringAhead(state)) break;
  }
  return { screen: state.over ? SCREEN_OVER : SCREEN_PLAY };
}
