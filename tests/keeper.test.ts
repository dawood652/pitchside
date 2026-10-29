import { Game } from '../src/match/game';
import { TEAMS } from '../src/data/teams';
import { setOwner } from '../src/match/control';
import { shootBy } from '../src/match/actions';
import type { Input } from '../src/core/input';
import { PITCH } from '../src/data/tuning';

const fi = { move: () => ({ x: 0, y: 0 }), held: () => false, pressed: () => false, released: () => false, endStep: () => {} } as unknown as Input;

describe('goalkeeper', () => {
  it('saves some shots, concedes others, and dives', () => {
    let goals = 0;
    let saves = 0;
    let dives = 0;
    let wide = 0;
    for (let i = 0; i < 40; i++) {
      const g = new Game(TEAMS[0], TEAMS[1], 180, false);
      const s = g.s;
      s.phase = 'play';
      s.taker = null;
      s.restart = null;
      for (const p of s.players) if (p.role !== 'GK') p.pos = { x: -45, z: p.id - 11 };
      const gk = s.players.find((p) => p.team === 1 && p.role === 'GK')!;
      gk.pos = { x: PITCH.halfL - 1.5, z: 0 };
      gk.facing = -Math.PI / 2;
      const shooter = s.players[9];
      shooter.pos = { x: PITCH.halfL - 17, z: (i % 5) * 3 - 6 };
      s.ball.place(shooter.pos.x + 0.5, shooter.pos.z);
      setOwner(s, shooter);
      shootBy(s, shooter, 0.55 + (i % 4) * 0.1, null);
      let dived = false;
      let result = '';
      for (let t = 0; t < 180 && !result; t++) {
        g.update(1 / 60, fi);
        if (gk.action === 'dive') dived = true;
        for (const e of s.events) {
          if (e.type === 'goal') result = 'goal';
          if (e.type === 'save') result = 'save';
        }
        s.events.length = 0;
        if ((s.phase as string) === 'restart' && !result) result = 'wide';
      }
      if (result === 'goal') goals++;
      else if (result === 'save') saves++;
      else wide++;
      if (dived) dives++;
    }
    console.log({ goals, saves, wide, dives });
    expect(saves).toBeGreaterThan(5);
    expect(goals).toBeGreaterThan(5);
    expect(dives).toBeGreaterThan(5);
  });
});
