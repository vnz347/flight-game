// Every tuning number, colour and mission in one place. The playfield is a fixed
// 1280x720 logical area; the renderer scales it to the window, so no rule below
// depends on the screen size. Distances are nautical miles, altitudes feet,
// speeds knots — the units a pilot reads on the HUD.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Feet per second in one knot. */
export const KT_TO_FPS = 1.68781;
/** Feet in one nautical mile. */
export const NM_TO_FT = 6076;

export const AIRCRAFT = {
  /** Knots at idle and at full throttle. */
  minSpeed: 80,
  maxSpeed: 240,
  /** Knots per second the speed chases its target. */
  accel: 9,
  /** Degrees of pitch the stick commands, and how fast pitch follows it. */
  maxPitch: 14,
  pitchRate: 22,
  /** Degrees of bank the stick commands, and how fast bank follows it. */
  maxBank: 38,
  bankRate: 70,
  /** Knots below which the wing stops flying and the nose drops. */
  stallSpeed: 72,
  /** Feet the aircraft sits above the ground when a mission starts. */
  startAltitude: 2600,
  /** Fuel in percent per second at full throttle; cruise burns about half that. */
  fuelBurn: 0.22,
  /** Damage in percent from one terrain strike, and from a hard landing. */
  strikeDamage: 34,
  hardLandingDamage: 25,
};

export const RING = {
  /** Feet of radius on a golden ring; a fuel ring is a little smaller. */
  radius: 420,
  fuelRadius: 320,
  /** Points for a ring, a fuel ring, and the bonus for a clean pass dead-centre. */
  points: 100,
  fuelPoints: 50,
  centreBonus: 50,
};

export const RUNWAY = {
  /** The airstrip every mission ends on: heading 090, in the flat valley. */
  x: 0,
  z: 0,
  heading: 90,
  lengthFt: 6000,
  widthFt: 150,
  /** Knots and feet per minute allowed at touchdown, and the heading error allowed. */
  maxTouchSpeed: 145,
  maxSinkFpm: 650,
  maxHeadingError: 15,
};

/** The three sorties, in order. Each has its own light, its own route and its own par. */
export const MISSIONS = [
  {
    id: 'ring-run',
    name: 'Ring Run',
    briefing: 'Thread five gold rings over the valley, then bring her home.',
    sky: { top: '#2f6fb4', mid: '#7fb2dd', low: '#cfe4f2', sun: '#fff3c4' },
    sunX: 0.78,
    sunY: 0.16,
    fuelStart: 100,
    parSeconds: 150,
    rings: [
      { x: -2.2, z: 3.4, alt: 2600 },
      { x: -0.4, z: 6.2, alt: 3000 },
      { x: 1.8, z: 8.0, alt: 2400 },
      { x: 3.4, z: 5.6, alt: 3200 },
      { x: 2.2, z: 2.6, alt: 2600 },
    ],
    fuelRings: [{ x: 0.8, z: 7.2, alt: 2800 }],
  },
  {
    id: 'mountain-pass',
    name: 'Mountain Pass',
    briefing: 'Four rings through the high pass. Mind the peaks — and the fuel.',
    sky: { top: '#3a5a8c', mid: '#8fa8c8', low: '#e8ddc0', sun: '#ffd9a0' },
    sunX: 0.2,
    sunY: 0.22,
    fuelStart: 85,
    parSeconds: 170,
    rings: [
      { x: -3.6, z: -2.0, alt: 5200 },
      { x: -1.2, z: -4.6, alt: 5800 },
      { x: 1.6, z: -3.2, alt: 5400 },
      { x: 3.0, z: -0.6, alt: 4600 },
    ],
    fuelRings: [
      { x: -2.4, z: -3.4, alt: 5500 },
      { x: 2.4, z: -1.8, alt: 5000 },
    ],
  },
  {
    id: 'sunset-landing',
    name: 'Sunset Landing',
    briefing: 'One last ring over the river, then a sunset landing on runway 09.',
    sky: { top: '#4a3a6e', mid: '#c97e5a', low: '#f2b879', sun: '#ffdf9e' },
    sunX: 0.5,
    sunY: 0.3,
    fuelStart: 70,
    parSeconds: 140,
    rings: [{ x: -4.2, z: 1.2, alt: 2200 }],
    fuelRings: [{ x: -2.0, z: 0.6, alt: 2000 }],
  },
];

/** Star thresholds on the mission score: a clean run earns three. */
export const STARS = { one: 500, two: 800, three: 1100 };

export const PALETTE = {
  skyTop: '#2f6fb4',
  text: '#eef3f7',
  muted: '#aeb9c6',
  gold: '#f2c94c',
  goldDim: '#b98f2e',
  green: '#58d68d',
  red: '#e5534b',
  panel: 'rgba(10, 16, 26, 0.72)',
  panelEdge: 'rgba(190, 215, 235, 0.35)',
  hudGreen: '#7dffb0',
  hudAmber: '#ffcf5c',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
export const FONT_MONO = '"SF Mono", "Cascadia Mono", Consolas, monospace';

/** Where the best total is kept between visits (this browser only). */
export const BEST_KEY = 'skyline-courier.best';
