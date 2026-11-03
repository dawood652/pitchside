// Tiny Web Audio sound kit: bat crack, stumps, crowd swell.
let ctx: AudioContext | null = null;
export function audioStart(): void {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
}
function noise(dur: number, freq: number, q: number, gain: number, attack = 0.002): void {
  if (!ctx) return;
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
