// The flight model and the world it flies in: position, speed, pitch and bank,
// fuel and damage, the seeded terrain, the mission rings and the runway.
// One fixed step advances everything; events come back as bit flags.
import {
  AIRCRAFT, KT_TO_FPS, MISSIONS, NM_TO_FT, RING, RUNWAY, STARS, STEP,
} from './config.js';
import { fbm, valueNoise } from './random.js';
import { burst, createParticles, updateParticles } from './particles.js';

export const EVENT_RING = 1;
export const EVENT_FUEL = 2;
export const EVENT_HIT = 4;
export const EVENT_LAND = 8;
export const EVENT_CRASH = 16;
export const EVENT_MISSION = 32;
export const EVENT_WIN = 64;

const G = 32.2;
const RUNWAY_ELEV = 120;

function wrapDeg(deg) {
  let d = deg % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Feet of ground under world point (x, z) in nautical miles. */
export function terrainHeightAt(random, seed, x, z) {
  let h = 220 + fbm(x, z, 6, seed) * 1500 + valueNoise(x, z, 2.1, seed + 3) * 420;
  // The high ridge to the north, where the Mountain Pass runs.
  const north = smoothstep(-1.5, -6.5, z);
  h += north * (2400 + fbm(x, z, 3.1, seed + 11) * 3600);
  // A lower ridge to the far west.
  const west = smoothstep(-5.5, -9, x);
  h += west * (900 + fbm(x, z, 4, seed + 23) * 1600);
  // The flat valley the runway sits in.
  const dValley = Math.hypot(x, z);
  const flat = 1 - smoothstep(2.0, 3.4, dValley);
  h = h * (1 - flat) + RUNWAY_ELEV * flat;
  return Math.max(90, h);
}

function bearingTo(fromX, fromZ, toX, toZ) {
  return (Math.atan2(toX - fromX, -(toZ - fromZ)) * 180) / Math.PI;
}

export function createWorld(random, seed) {
  const state = {
    seed,
    missionIndex: 0,
    mission: MISSIONS[0],
    x: 0,
    z: 0,
    alt: AIRCRAFT.startAltitude,
    speed: 130,
    heading: 0,
    pitch: 0,
    bank: 0,
    throttle: 0.62,
    fuel: 100,
    damage: 0,
    score: 0,
    missionScore: 0,
    time: 0,
    rings: [],
    fuelRings: [],
    ringsPassed: 0,
    landed: false,
    crashed: false,
    win: false,
    over: false,
    warning: null,
    objective: '',
    vsFps: 0,
    sinkFpm: 0,
    clouds: [],
    ridges: [],
    river: [],
    road: [],
    particles: createParticles(),
    stars: 0,
    landingBonus: 0,
  };

  function terrainHeight(x, z) {
    return terrainHeightAt(random, seed, x, z);
  }

  function makeRings(mission) {
    state.rings = mission.rings.map((r) => ({ ...r, passed: false, passedAt: -1 }));
    state.fuelRings = mission.fuelRings.map((r) => ({ ...r, passed: false, passedAt: -1 }));
  }

  function makeSky() {
    state.clouds = [];
    for (let i = 0; i < 16; i += 1) {
      state.clouds.push({
        x: (random() - 0.5) * 30,
        z: (random() - 0.5) * 30,
        alt: 4200 + random() * 3200,
        scale: 0.7 + random() * 1.6,
        drift: 0.03 + random() * 0.05,
      });
    }
    // Two ridge rings the renderer draws as layered silhouettes.
    state.ridges = [];
    for (const dist of [7, 15]) {
      const ring = [];
      for (let b = 0; b < 360; b += 3) {
        const rad = (b * Math.PI) / 180;
        const x = Math.sin(rad) * dist;
        const z = -Math.cos(rad) * dist;
        ring.push({ bearing: b, height: terrainHeight(x, z), dist });
      }
      state.ridges.push(ring);
    }
    // A winding river across the valley, and the road from town to the runway.
    state.river = [];
    for (let z = -9; z <= 9; z += 1.5) {
      state.river.push({ x: 3.4 + Math.sin(z * 0.45) * 1.6, z });
    }
    state.road = [
      { x: -2.4, z: 2.6 },
      { x: -1.2, z: 1.4 },
      { x: -0.4, z: 0.4 },
      { x: 0.4, z: -0.2 },
    ];
  }

  function reset(missionIndex) {
    state.missionIndex = missionIndex;
    state.mission = MISSIONS[missionIndex];
    makeRings(state.mission);
    makeSky();
    const first = state.mission.rings[0];
    state.x = first.x - 1.5;
    state.z = first.z + 4.5;
    state.heading = bearingTo(state.x, state.z, first.x, first.z);
    state.alt = first.alt;
    state.speed = 130;
    state.pitch = 0;
    state.bank = 0;
    state.throttle = 0.62;
    state.fuel = state.mission.fuelStart;
    state.damage = 0;
    state.missionScore = 0;
    state.time = 0;
    state.ringsPassed = 0;
    state.landed = false;
    state.crashed = false;
    state.win = false;
    state.over = false;
    state.warning = null;
    state.stars = 0;
    state.landingBonus = 0;
    state.particles = createParticles();
    state.objective = `Fly through ring 1 of ${state.rings.length}`;
  }

  function addScore(points) {
    state.score += points;
    state.missionScore += points;
  }

  function advanceMission() {
    const timeBonus = Math.max(0, Math.round((state.mission.parSeconds - state.time) * 5));
    addScore(timeBonus);
    state.landingBonus = timeBonus;
    if (state.missionIndex + 1 >= MISSIONS.length) {
      state.win = true;
      state.over = true;
      state.stars = state.missionScore >= STARS.three ? 3 : state.missionScore >= STARS.two ? 2 : 1;
      return EVENT_WIN;
    }
    // Total score keeps growing across sorties; the mission score restarts.
    reset(state.missionIndex + 1);
    state.objective = `Mission ${state.missionIndex + 1}: ${state.mission.name} — ${state.mission.briefing}`;
    return EVENT_MISSION;
  }

  function step(dt, ctl) {
    if (state.over) {
      updateParticles(state.particles, dt);
      return 0;
    }
    state.time += dt;
    let events = 0;

    // Throttle eases toward the stick; the engine answers at every speed.
    state.throttle = clamp(state.throttle + clamp(ctl.throttle - state.throttle, -0.9 * dt, 0.9 * dt), 0, 1);
    const engineOut = state.fuel <= 0;
    const targetSpeed = engineOut
      ? 0
      : AIRCRAFT.minSpeed + (AIRCRAFT.maxSpeed - AIRCRAFT.minSpeed) * state.throttle;
    state.speed += clamp(targetSpeed - state.speed, -AIRCRAFT.accel * dt, AIRCRAFT.accel * dt);
    if (state.speed < 0) state.speed = 0;

    // Pitch and bank ease toward the stick; a stalled wing drops the nose.
    const stalled = state.speed < AIRCRAFT.stallSpeed;
    const pitchTarget = stalled ? -7 : ctl.pitch * AIRCRAFT.maxPitch;
    state.pitch += clamp(pitchTarget - state.pitch, -AIRCRAFT.pitchRate * dt, AIRCRAFT.pitchRate * dt);
    const bankTarget = stalled ? 0 : ctl.bank * AIRCRAFT.maxBank;
    state.bank += clamp(bankTarget - state.bank, -AIRCRAFT.bankRate * dt, AIRCRAFT.bankRate * dt);

    // A banked turn: heading follows the bank, and a hard bank costs a little speed.
    state.heading = wrapDeg(state.heading + state.bank * 0.32 * dt);
    if (Math.abs(state.bank) > 25) state.speed = Math.max(60, state.speed - 6 * dt);

    const speedFps = state.speed * KT_TO_FPS;
    state.vsFps = speedFps * Math.sin((state.pitch * Math.PI) / 180);
    state.sinkFpm = -state.vsFps * 60;
    state.alt += state.vsFps * dt;
    const headingRad = (state.heading * Math.PI) / 180;
    state.x += (Math.sin(headingRad) * state.speed * dt) / 3600;
    state.z += (-Math.cos(headingRad) * state.speed * dt) / 3600;

    // Fuel: cruise sips it, full throttle drinks it.
    if (!engineOut) {
      state.fuel = Math.max(0, state.fuel - AIRCRAFT.fuelBurn * (0.3 + 0.7 * state.throttle) * dt);
    }

    // Rings: a pass inside the hoop counts, dead-centre pays a bonus.
    const px = state.x * NM_TO_FT;
    const pz = state.z * NM_TO_FT;
    for (const ring of state.rings) {
      if (ring.passed) continue;
      const dx = ring.x * NM_TO_FT - px;
      const dz = ring.z * NM_TO_FT - pz;
      const da = ring.alt - state.alt;
      const dist = Math.hypot(dx, dz, da);
      if (dist < RING.radius) {
        ring.passed = true;
        ring.passedAt = state.time;
        state.ringsPassed += 1;
        const centre = dist < RING.radius * 0.35;
        addScore(RING.points + (centre ? RING.centreBonus : 0));
        burst(state.particles, ring.x, ring.z, ring.alt, 26, '#f2c94c');
        events |= EVENT_RING;
        state.objective = state.ringsPassed >= state.rings.length
          ? 'All rings clear — land on runway 09'
          : `Fly through ring ${state.ringsPassed + 1} of ${state.rings.length}`;
      }
    }
    for (const ring of state.fuelRings) {
      if (ring.passed) continue;
      const dx = ring.x * NM_TO_FT - px;
      const dz = ring.z * NM_TO_FT - pz;
      const da = ring.alt - state.alt;
      if (Math.hypot(dx, dz, da) < RING.fuelRadius) {
        ring.passed = true;
        ring.passedAt = state.time;
        state.fuel = Math.min(100, state.fuel + 25);
        addScore(RING.fuelPoints);
        burst(state.particles, ring.x, ring.z, ring.alt, 18, '#58d68d');
        events |= EVENT_FUEL;
      }
    }

    // Ground: the runway forgives a good landing and nothing else does.
    const ground = terrainHeight(state.x, state.z);
    if (state.alt <= ground + 8) {
      const alongFt = state.x * NM_TO_FT - RUNWAY.x * NM_TO_FT;
      const crossFt = state.z * NM_TO_FT - RUNWAY.z * NM_TO_FT;
      const onRunway = Math.abs(crossFt) <= RUNWAY.widthFt / 2 + 20
        && alongFt >= -400 && alongFt <= RUNWAY.lengthFt;
      const headingErr = Math.abs(wrapDeg(state.heading - RUNWAY.heading));
      const gentle = state.sinkFpm <= RUNWAY.maxSinkFpm;
      const slow = state.speed <= RUNWAY.maxTouchSpeed;
      if (onRunway && state.ringsPassed >= state.rings.length && gentle && slow && headingErr <= RUNWAY.maxHeadingError) {
        state.alt = ground + 2;
        state.landed = true;
        const quality = Math.max(0, Math.round(120 - state.sinkFpm / 6 - headingErr * 2 - Math.max(0, state.speed - 100)));
        addScore(quality);
        events |= EVENT_LAND;
        events |= advanceMission();
      } else if (onRunway && gentle && slow) {
        // Touched down early, before the rings: a hard bounce, not a landing.
        state.damage += AIRCRAFT.hardLandingDamage;
        state.alt = ground + 90;
        state.speed *= 0.65;
        state.pitch = 8;
        events |= EVENT_HIT;
      } else {
        state.damage += AIRCRAFT.strikeDamage;
        state.alt = ground + 70;
        state.speed *= 0.55;
        state.pitch = 10;
        burst(state.particles, state.x, state.z, state.alt - 40, 20, '#8a8f98');
        events |= EVENT_HIT;
      }
      if (state.damage >= 100) {
        state.damage = 100;
        state.crashed = true;
        state.over = true;
        events |= EVENT_CRASH;
      }
    }

    // Warnings, worst first. No PULL UP on a proper final: lined up with the
    // runway, rings done, descending gently for the threshold is the plan.
    const alongFt = state.x * NM_TO_FT - RUNWAY.x * NM_TO_FT;
    const crossFt = state.z * NM_TO_FT - RUNWAY.z * NM_TO_FT;
    const onFinal = state.ringsPassed >= state.rings.length
      && Math.abs(crossFt) < 900 && alongFt >= -9000 && alongFt <= RUNWAY.lengthFt
      && Math.abs(wrapDeg(state.heading - RUNWAY.heading)) < 20;
    state.warning = null;
    if (state.crashed) state.warning = 'CRASHED';
    else if (state.alt - ground < 350 && state.vsFps < 0 && !onFinal) state.warning = 'PULL UP';
    else if (stalled) state.warning = 'STALL';
    else if (state.fuel < 20) state.warning = 'LOW FUEL';
    else if (engineOut) state.warning = 'ENGINE OUT';

    // Smoke when hurt, and the clouds drift on the wind.
    if (state.damage >= 40 && Math.random() < 0.35) {
      burst(state.particles, state.x, state.z, state.alt - 20, 1, '#5a5f68');
    }
    for (const cloud of state.clouds) {
      cloud.x += cloud.drift * dt;
      if (cloud.x > 16) cloud.x = -16;
    }
    updateParticles(state.particles, dt);
    return events;
  }

  reset(0);
  return { state, step, reset, terrainHeight };
}
