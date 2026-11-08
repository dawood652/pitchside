// Match state and stats: chase (target, wickets, overs) or nets (a 24-ball practice session).
export const TEAMS = [
  { name: 'Indus Tigers', code: 'IND', kit: 0x0f8a4c, alt: '#ffd166' },
  { name: 'Thames Royals', code: 'THR', kit: 0x1d4ed8, alt: '#e5e7eb' },
  { name: 'Harbour Hawks', code: 'HHK', kit: 0xf59e0b, alt: '#1f2937' },
  { name: 'Desert Falcons', code: 'DFC', kit: 0xb91c1c, alt: '#fde68a' },
  { name: 'Island Cyclones', code: 'ICY', kit: 0x7c3aed, alt: '#a7f3d0' },
  { name: 'Savanna Storm', code: 'SVS', kit: 0x0e7490, alt: '#fcd34d' },
];
export const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
export const DIFFS = [
  { name: 'Club', note: 'Gentle pace, generous target' },
  { name: 'Pro', note: 'Quicker bowling, tighter chase' },
  { name: 'Legend', note: 'Express pace, steep target' },
];

export type Mode = 'chase' | 'nets';
export interface Ball {
  runs: number;
  out: boolean;
  how: string; // 'SIX', 'FOUR', 'CAUGHT', 'BOWLED', '2 RUNS', ...
  shot: string | null;
  band: string | null; // PERFECT / Good / Off / Miss / null (left)
  errMs: number | null;
  dist: number; // metres the ball travelled (0 if not hit)
  angle: number | null; // field angle of the hit (radians, + = off side)
}

export const NETS_BALLS = 24;

export class Match {
  mode: Mode = 'chase';
  team = 0;
  opp = 1;
  overs = 2;
  diff = 1;
  target = 0;
  maxW = 3;
  log: Ball[] = [];

  start(r: () => number): void {
    this.log = [];
    this.target = this.mode === 'nets' ? 0 : Math.round(this.overs * 6 * (1.55 + this.diff * 0.25 + r() * 0.3)) + 1;
    this.maxW = this.mode === 'nets' ? 99 : this.overs === 5 ? 5 : this.overs === 2 ? 3 : 2;
  }
  get runs(): number {
    return this.log.reduce((a, b) => a + b.runs, 0);
  }
  get wkts(): number {
    return this.log.filter((b) => b.out).length;
  }
  get balls(): number {
    return this.log.length;
  }
  get totalBalls(): number {
    return this.mode === 'nets' ? NETS_BALLS : this.overs * 6;
  }
  get ballsLeft(): number {
    return this.totalBalls - this.balls;
  }
  get need(): number {
    return Math.max(0, this.target - this.runs);
  }
  get oversText(): string {
    return `${Math.floor(this.balls / 6)}.${this.balls % 6}`;
  }
  get rrr(): number {
    return this.ballsLeft > 0 ? (this.need / this.ballsLeft) * 6 : 0;
  }
  /** Balls of the current over (resets every 6). */
  get thisOver(): Ball[] {
    const n = this.balls % 6 === 0 && this.balls > 0 ? 6 : this.balls % 6;
    return this.log.slice(this.balls - n);
  }
  done(): boolean {
    if (this.mode === 'nets') return this.balls >= NETS_BALLS;
    return this.runs >= this.target || this.wkts >= this.maxW || this.balls >= this.totalBalls;
  }
  won(): boolean {
    return this.runs >= this.target;
  }
  stats() {
    const hit = this.log.filter((b) => b.band);
    const perfect = hit.filter((b) => b.band === 'PERFECT').length;
    let streak = 0;
    let best = 0;
    for (const b of this.log) {
      streak = b.band === 'PERFECT' ? streak + 1 : 0;
      best = Math.max(best, streak);
    }
    return {
      runs: this.runs,
      balls: this.balls,
      sr: this.balls ? (this.runs / this.balls) * 100 : 0,
      fours: this.log.filter((b) => b.runs === 4).length,
      sixes: this.log.filter((b) => b.runs === 6).length,
      dots: this.log.filter((b) => b.runs === 0 && !b.out).length,
      perfectPct: hit.length ? Math.round((perfect / hit.length) * 100) : 0,
      perfect,
      bestStreak: best,
      longest: Math.round(Math.max(0, ...this.log.map((b) => b.dist))),
      avgErr: hit.length ? Math.round(hit.reduce((a, b) => a + Math.abs(b.errMs ?? 0), 0) / hit.length) : 0,
    };
  }
}

/** Little best-score store; browser storage can be unavailable, so every access is guarded. */
export const store = {
  get<T>(k: string, d: T): T {
    try {
      const v = localStorage.getItem('stumps.' + k);
      return v === null ? d : (JSON.parse(v) as T);
    } catch {
      return d;
    }
  },
  set(k: string, v: unknown): void {
    try {
      localStorage.setItem('stumps.' + k, JSON.stringify(v));
    } catch {
      /* private mode etc. */
    }
  },
};
