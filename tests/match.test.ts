import { Game } from '../src/match/game';
import { TEAMS } from '../src/data/teams';
import type { Input } from '../src/core/input';

const fakeInput = {
  move: () => ({ x: 0, y: 0 }),
  held: () => false,
  pressed: () => false,
  released: () => false,
  endStep: () => {},
} as unknown as Input;

function simulate(halfSeconds: number, seed: number) {
  const g = new Game(TEAMS[seed % 8], TEAMS[(seed + 3) % 8], halfSeconds, false);
  const s = g.s;
  const phases = new Map<string, number>();
  let longestStall = 0;
  let stall = 0;
  let lastBall = { x: 0, z: 0 };
  let goals = 0;
  let restarts = 0;
  let prevPhase = s.phase;
  for (let i = 0; i < 60 * (halfSeconds * 2 + 60); i++) {
    g.update(1 / 60, fakeInput);
    for (const e of s.events) if (e.type === 'goal') goals++;
    s.events.length = 0;
    if (s.phase !== prevPhase && s.phase === 'restart') restarts++;
    prevPhase = s.phase;
    phases.set(s.phase, (phases.get(s.phase) ?? 0) + 1);
    const moved = Math.hypot(s.ball.pos.x - lastBall.x, s.ball.pos.z - lastBall.z);
    lastBall = { x: s.ball.pos.x, z: s.ball.pos.z };
    if (moved < 0.002 && s.phase === 'play') stall++;
    else stall = 0;
    longestStall = Math.max(longestStall, stall);
    for (const p of s.players) {
      if (!Number.isFinite(p.pos.x) || !Number.isFinite(p.pos.z)) throw new Error('NaN player');
    }
    if (!Number.isFinite(s.ball.pos.x)) throw new Error('NaN ball');
    if (s.phase === 'fulltime') break;
  }
  return { s, goals, restarts, longestStall, phases };
}

describe('full CPU vs CPU match', () => {
  it('plays to full-time without stalling', () => {
    let totalShots = 0;
    for (let seed = 0; seed < 3; seed++) {
      const r = simulate(120, seed);
      console.log(`seed ${seed}: ${r.s.teams[0].short} ${r.s.score[0]}-${r.s.score[1]} ${r.s.teams[1].short} | shots ${r.s.stats.shots} | restarts ${r.restarts} | longest stall ${(r.longestStall / 60).toFixed(1)}s`);
      expect(r.s.phase).toBe('fulltime');
      totalShots += r.s.stats.shots[0] + r.s.stats.shots[1];
      expect(r.longestStall / 60).toBeLessThan(8);
    }
    expect(totalShots).toBeGreaterThan(6);
  }, 60000);
});
