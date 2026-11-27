// Synthesised sound, no audio files: an engine drone that follows the throttle,
// wind that rises with speed, a chime for a ring, a thud for a landing and a
// warning beep. Created lazily on the first user gesture; M mutes everything.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let windGain = null;
  let muted = false;
  let started = false;

  function ensure() {
    if (started) return;
    started = true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      // Engine: two detuned saws through a low-pass, pitched by the throttle.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 52;
      const engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'sawtooth';
      engineOsc2.frequency.value = 55;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 320;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(filter);
      engineOsc2.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      engineOsc2.start();
      // Wind: looped noise through a band-pass.
      const len = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 600;
      band.Q.value = 0.6;
      windGain = ctx.createGain();
      windGain.gain.value = 0;
      noise.connect(band);
      band.connect(windGain);
      windGain.connect(master);
      noise.start();
    } catch {
      ctx = null;
    }
  }

  function tone(freq, dur, type, vol, when = 0) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  return {
    ensure,
    /** Call every frame while flying: engine pitch follows throttle, wind follows speed. */
    update(throttle, speed, flying) {
      if (!ctx) return;
      const t = ctx.currentTime;
      engineGain.gain.setTargetAtTime(flying ? 0.05 + throttle * 0.075 : 0, t, 0.1);
      engineOsc.frequency.setTargetAtTime(46 + throttle * 64 + speed * 0.08, t, 0.1);
      windGain.gain.setTargetAtTime(flying ? Math.min(0.16, speed * 0.0006) : 0, t, 0.15);
    },
    ring() {
      tone(880, 0.35, 'sine', 0.22);
      tone(1318, 0.5, 'sine', 0.18, 0.08);
    },
    fuel() {
      tone(660, 0.25, 'sine', 0.2);
      tone(990, 0.4, 'sine', 0.16, 0.07);
    },
    hit() {
      tone(90, 0.3, 'square', 0.25);
      tone(60, 0.4, 'sawtooth', 0.2, 0.05);
    },
    land() {
      tone(180, 0.25, 'sine', 0.25);
      tone(120, 0.4, 'sine', 0.2, 0.1);
    },
    warn() {
      tone(1180, 0.12, 'square', 0.1);
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    get muted() {
      return muted;
    },
  };
}
