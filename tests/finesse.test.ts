import { Game } from '../src/match/game';
import { TEAMS } from '../src/data/teams';
import { setOwner } from '../src/match/control';
import { shootBy } from '../src/match/actions';
import { checkBoundary } from '../src/physics/ball';
import type { Input } from '../src/core/input';
import { PITCH } from '../src/data/tuning';

const fi = { move: () => ({ x: 0, y: 0 }), held: () => false, pressed: () => false, released: () => false, endStep: () => {} } as unknown as Input;

function trial(style: 'finesse' | 'chip', z: number, keeperOut = false): string {
  const g = new Game(TEAMS[0], TEAMS[1], 180, false);
  const s = g.s;
  s.phase = 'play';
  s.taker = null;
  s.restart = null;
  for (const p of s.players) if (p.role !== 'GK') p.pos = { x: -45, z: p.id - 11 };
  const gk = s.players.find((p) => p.team === 1 && p.role === 'GK')!;
  gk.pos = keeperOut ? { x: PITCH.halfL - 7, z: 0 } : { x: 80, z: 30 }; // keeper off his line, or absent
  const sh = s.players[9];
  sh.pos = { x: PITCH.halfL - 19, z };
  s.ball.place(sh.pos.x + 0.5, z);
  setOwner(s, sh);
  shootBy(s, sh, 0.65, null, style);
  let maxAbsZ = 0;
  for (let t = 0; t < 240; t++) {
    g.update(1 / 60, fi);
    maxAbsZ = Math.max(maxAbsZ, Math.abs(s.ball.pos.z));
    for (const e of s.events) if (e.type === 'goal') return 'goal';
    s.events.length = 0;
    if ((s.phase as string) === 'restart') return 'out';
  }
  return 'none';
}

describe('finesse and chip shots', () => {
  it('finesse shots curl in from wide angles', () => {
    let goals = 0;
    for (let i = 0; i < 10; i++) if (trial('finesse', i % 2 ? 8 : -8) === 'goal') goals++;
    expect(goals).toBeGreaterThanOrEqual(6);
  });
  it('chip beats a keeper standing off his line', () => {
    let goals = 0;
    for (let i = 0; i < 10; i++) if (trial('chip', 0, true) === 'goal') goals++;
    expect(goals).toBeGreaterThanOrEqual(5);
  });
});
