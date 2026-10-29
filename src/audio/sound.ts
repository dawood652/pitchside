// Synthesised match audio (no files needed): crowd bed, kicks, whistles, goal roar.

export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private crowdGain!: GainNode;
  private noise!: AudioBuffer;
  muted = false;

  /** Must be called from a user gesture. */
  start(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.7;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) {
      b = 0.97 * b + 0.03 * (Math.random() * 2 - 1); // brownish noise
      d[i] = b * 6;
    }
    // Crowd bed: two band-passed noise layers
    this.crowdGain = this.ctx.createGain();
    this.crowdGain.gain.value = 0.18;
    this.crowdGain.connect(this.master);
    for (const f of [420, 900]) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      src.playbackRate.value = f === 420 ? 1 : 1.3;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = 0.7;
      src.connect(bp).connect(this.crowdGain);
      src.start();
    }
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.7, this.ctx.currentTime, 0.05);
  }

  /** 0 = calm, 1 = goal. Danger raises the murmur. */
  crowd(level: number): void {
    if (!this.ctx) return;
    this.crowdGain.gain.setTargetAtTime(0.16 + level * 0.55, this.ctx.currentTime, 0.4);
  }

  kick(power: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.frequency.setValueAtTime(170 + power * 60, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.35 + power * 0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.18);
    this.burst(0.05, 0.12 + power * 0.2, 2500);
  }

  whistle(long = false): void {
    if (!this.ctx) return;
    const blasts = long ? [0, 0.45, 0.9] : [0];
    for (const off of blasts) {
      const t = this.ctx.currentTime + off;
      const dur = long && off === 0.9 ? 0.9 : 0.32;
      const o = this.ctx.createOscillator();
      const lfo = this.ctx.createOscillator();
      const lg = this.ctx.createGain();
      const g = this.ctx.createGain();
      o.type = 'sine';
      o.frequency.value = 2900;
      lfo.frequency.value = 38;
      lg.gain.value = 120;
      lfo.connect(lg).connect(o.frequency);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.16, t + 0.02);
      g.gain.setValueAtTime(0.16, t + dur - 0.05);
      g.gain.linearRampToValueAtTime(0, t + dur);
      o.connect(g).connect(this.master);
      o.start(t);
      lfo.start(t);
      o.stop(t + dur);
      lfo.stop(t + dur);
    }
  }

  roar(): void {
    this.burst(4, 0.9, 800, 0.5);
  }

  ooh(): void {
    this.burst(1.4, 0.35, 600, 0.3);
  }

  private burst(dur: number, vol: number, freq: number, attack = 0.005): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = 0.6;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }
}
