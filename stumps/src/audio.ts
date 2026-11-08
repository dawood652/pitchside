// Tiny Web Audio sound kit: bat crack, stumps, crowd swell.
let ctx: AudioContext | null = null;
let sfxOn = true;
export function setSfx(on: boolean): void {
  sfxOn = on;
}
export function audioStart(): void {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
}
function noise(dur: number, freq: number, q: number, gain: number, attack = 0.002): void {
  if (!ctx || !sfxOn) return;
  const n = ctx.sampleRate * dur;
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  const t = ctx.currentTime;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(ctx.destination);
  src.start();
}
export const sfx = {
  bat: (power: number) => noise(0.12, 1800 + power * 900, 2, 0.5 + power * 0.4),
  edge: () => noise(0.08, 3200, 4, 0.35),
  stumps: () => {
    noise(0.25, 900, 1.5, 0.6);
    noise(0.4, 400, 1, 0.3);
  },
  crowd: (big: boolean) => noise(big ? 2.6 : 1.4, 700, 0.6, big ? 0.35 : 0.18, 0.25),
};

// ---- Music: an original, generated stadium groove (no samples, no licensing): drums, bass, chords.
let musicGain: GainNode | null = null;
let musicTimer = 0;
let ambience: AudioBufferSourceNode | null = null;
const BPM = 112;
const CHORDS = [
  [57, 60, 64], // Am
  [53, 57, 60], // F
  [48, 52, 55], // C
  [55, 59, 62], // G
];
const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

function tone(at: number, freq: number, dur: number, type: OscillatorType, gain: number, out: AudioNode): void {
  const o = ctx!.createOscillator();
  const g = ctx!.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(gain, at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0008, at + dur);
  o.connect(g).connect(out);
  o.start(at);
  o.stop(at + dur + 0.05);
}
function drum(at: number, kind: 'kick' | 'snare' | 'hat', out: AudioNode): void {
  if (kind === 'kick') {
    const o = ctx!.createOscillator();
    const g = ctx!.createGain();
    o.frequency.setValueAtTime(140, at);
    o.frequency.exponentialRampToValueAtTime(45, at + 0.12);
    g.gain.setValueAtTime(0.9, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.25);
    o.connect(g).connect(out);
    o.start(at);
    o.stop(at + 0.3);
    return;
  }
  const len = kind === 'hat' ? 0.04 : 0.16;
  const buf = ctx!.createBuffer(1, ctx!.sampleRate * len, ctx!.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx!.createBufferSource();
  src.buffer = buf;
  const f = ctx!.createBiquadFilter();
  f.type = kind === 'hat' ? 'highpass' : 'bandpass';
  f.frequency.value = kind === 'hat' ? 7000 : 1800;
  const g = ctx!.createGain();
  g.gain.setValueAtTime(kind === 'hat' ? 0.18 : 0.5, at);
  g.gain.exponentialRampToValueAtTime(0.001, at + len);
  src.connect(f).connect(g).connect(out);
  src.start(at);
}

export function setMusic(on: boolean): void {
  audioStart();
  if (!ctx) return;
  if (!on) {
    if (musicGain) musicGain.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
    clearInterval(musicTimer);
    musicTimer = 0;
    return;
  }
  if (musicTimer) return;
  musicGain = ctx.createGain();
  musicGain.gain.value = 0.22;
  musicGain.connect(ctx.destination);
  const out = musicGain;
  const step = 60 / BPM / 2; // eighth notes
  let next = ctx.currentTime + 0.1;
  let n = 0;
  musicTimer = window.setInterval(() => {
    while (next < ctx!.currentTime + 0.4) {
      const bar = Math.floor(n / 8) % 4;
      const beat = n % 8;
      const ch = CHORDS[bar];
      if (beat % 4 === 0) drum(next, 'kick', out);
      if (beat === 2 || beat === 6) drum(next, 'snare', out);
      drum(next, 'hat', out);
      if (beat % 2 === 0) tone(next, hz(ch[0] - 24 + (beat === 6 ? 7 : 0)), step * 1.8, 'triangle', 0.35, out);
      if (beat === 0) for (const m of ch) tone(next, hz(m), step * 7, 'sawtooth', 0.045, out);
      if (beat === 3 || beat === 7) tone(next, hz(ch[(n >> 3) % 3] + 12), step * 0.9, 'square', 0.04, out);
      next += step;
      n++;
    }
  }, 100);
}

/** Constant low crowd murmur under everything. */
export function startAmbience(): void {
  audioStart();
  if (!ctx || ambience) return;
  const len = ctx.sampleRate * 3;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    last = last * 0.97 + (Math.random() * 2 - 1) * 0.03;
    d[i] = last * 6;
  }
  ambience = ctx.createBufferSource();
  ambience.buffer = buf;
  ambience.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 900;
  const g = ctx.createGain();
  g.gain.value = 0.07;
  ambience.connect(f).connect(g).connect(ctx.destination);
  ambience.start();
}
