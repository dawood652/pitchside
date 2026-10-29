import { Game } from '../src/match/game';
import { TEAMS } from '../src/data/teams';
import { setOwner } from '../src/match/control';
import type { Input, Action } from '../src/core/input';

class StickInput {
  mv = { x: 0, y: 0 };
  sprint = false;
  move() {
    return this.mv;
  }
  held(a: Action) {
    return a === 'sprint' && this.sprint;
  }
  pressed() {
    return false;
  }
  released() {
    return false;
  }
  endStep() {}
}

function setup() {
  const g = new Game(TEAMS[2], TEAMS[1], 180, true);
  const s = g.s;
  s.phase = 'play';
  s.taker = null;
  s.restart = null;
  for (const p of s.players) p.pos = { x: -45, z: p.id - 11 };
  const me = s.players[9];
  me.pos = { x: -20, z: 0 };
  me.facing = Math.PI / 2;
  s.ball.place(me.pos.x + 0.5, 0);
  setOwner(s, me);
  s.controlled = me;
  return { g, s, me };
}

describe('touch dribbling', () => {
  it('sprint dribble keeps the ball within the leash and moves with real touches', () => {
    const { g, s, me } = setup();
    const inp = new StickInput();
    inp.mv = { x: 1, y: 0 };
    inp.sprint = true;
    let maxGap = 0;
    let minGap = 9;
    for (let i = 0; i < 180; i++) {
      g.update(1 / 60, inp as unknown as Input);
      if (i > 40) {
        const gap = s.ball.pos.x - me.pos.x;
        maxGap = Math.max(maxGap, gap);
        minGap = Math.min(minGap, gap);
      }
    }
    expect(s.owner).toBe(me);
    expect(me.pos.x).toBeGreaterThan(-10);
    // Ball runs ahead between touches, not glued to the feet
    expect(maxGap - minGap).toBeGreaterThan(0.4);
    expect(maxGap).toBeLessThan(2.3);
  });

  it('turning back keeps possession (effort touch)', () => {
    const { g, s, me } = setup();
    const inp = new StickInput();
    inp.mv = { x: 1, y: 0 };
    inp.sprint = true;
    for (let i = 0; i < 90; i++) g.update(1 / 60, inp as unknown as Input);
    inp.mv = { x: -1, y: 0 };
    inp.sprint = false;
    for (let i = 0; i < 120; i++) g.update(1 / 60, inp as unknown as Input);
    expect(s.owner).toBe(me);
    expect(me.vel.x).toBeLessThan(0);
  });
});
