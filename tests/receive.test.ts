import { Game } from '../src/match/game';
import { TEAMS } from '../src/data/teams';
import { setOwner } from '../src/match/control';
import type { Input, Action } from '../src/core/input';

function run(holdFrames: number) {
  const g = new Game(TEAMS[2], TEAMS[1], 180, true);
  const s = g.s;
  s.phase = 'play';
  s.taker = null;
  s.restart = null;
  // team-mates far back, opponents deep in their own half (nobody offside, nobody in the lane)
  for (const p of s.players) p.pos = { x: p.team === s.humanTeam ? -45 : 45, z: p.id - 11 };
  const me = s.players[6];
  const mate = s.players[9];
  me.pos = { x: -10, z: 0 };
  me.facing = Math.PI / 2;
  mate.pos = { x: 8, z: 4 };
  s.ball.place(me.pos.x + 0.5, 0);
  setOwner(s, me);
  s.controlled = me;
  let frame = 0;
  // Stick keeps pointing right the whole time (the classic "receiver runs away" case)
  const inp = {
    move: () => ({ x: 1, y: 0 }),
    held: (a: Action) => a === 'pass' && frame >= 10 && frame < 10 + holdFrames,
    pressed: (a: Action) => a === 'pass' && frame === 10,
    released: (a: Action) => a === 'pass' && frame === 10 + holdFrames,
    endStep() {},
  } as unknown as Input;
  for (frame = 0; frame < 60 * 4; frame++) {
    g.update(1 / 60, inp);
    if (s.owner === mate) return { got: true, t: frame / 60 };
    if (process.env.DBG && frame % 15 === 0) console.log(frame, s.phase, s.owner?.id, s.pending ? "pend" : "", s.intendedReceiver?.id, s.controlled.id, s.ball.pos.x.toFixed(1), s.ball.pos.z.toFixed(1), mate.pos.x.toFixed(1), mate.pos.z.toFixed(1), me.action);
  }
  return { got: false, t: 4 };
}

describe('passing and receiving', () => {
  it('tapped pass reaches the teammate, who comes to the ball even with the stick held', () => {
    const r = run(1);
    expect(r.got).toBe(true);
    expect(r.t).toBeLessThan(2.5);
  });
  it('a held (powered) pass arrives sooner than a tap', () => {
    const tap = run(1);
    const hard = run(36);
    expect(hard.got).toBe(true);
    // 0.6 s of holding is spent charging, so compare flight time only
    expect(hard.t - 0.6).toBeLessThan(tap.t);
  });
});
