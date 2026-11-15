// All sound is synthesised, so there is nothing to download.

export function createAudio() {
  let ctx: AudioContext | null = null;
  let windGain: GainNode;
  let windTone: BiquadFilterNode;

  /** A short pitch sweep. */
  function tone(from: number, to: number, seconds: number, type: OscillatorType = 'sine', volume = 0.18, delay = 0) {
    if (!ctx) return;
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, start);
    osc.frequency.exponentialRampToValueAtTime(to, start + seconds);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + seconds);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + seconds);
  }

  return {
    /** Browsers only allow sound after a key press or click, so call this from one. */
    start() {
      if (ctx) return;
      ctx = new AudioContext();

      // Wind is looped white noise through a low-pass filter that opens up with speed.
      const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const samples = noise.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
      const source = ctx.createBufferSource();
      source.buffer = noise;
      source.loop = true;

      windTone = ctx.createBiquadFilter();
      windTone.type = 'lowpass';
      windGain = ctx.createGain();
      windGain.gain.value = 0;
      source.connect(windTone).connect(windGain).connect(ctx.destination);
      source.start();
    },

    wind(speed: number, boosting: boolean) {
      if (!ctx) return;
      const s = Math.min(1, speed / 75);
      windGain.gain.setTargetAtTime(0.02 + 0.3 * s * s + (boosting ? 0.08 : 0), ctx.currentTime, 0.1);
      windTone.frequency.setTargetAtTime(220 + 2600 * s + (boosting ? 700 : 0), ctx.currentTime, 0.1);
    },

    /** Each link in a chain rings a semitone higher. */
    ring(chain: number) {
      const pitch = 520 * 2 ** ((chain - 1) / 12);
      tone(pitch, pitch * 2, 0.22);
    },

    land(perfect: boolean) {
      tone(523, 523, 0.25);
      tone(659, 659, 0.25, 'sine', 0.18, 0.12);
      if (perfect) tone(784, 784, 0.4, 'sine', 0.18, 0.24);
    },

    crash() {
      tone(180, 40, 0.4, 'sawtooth', 0.22);
    },
  };
}
