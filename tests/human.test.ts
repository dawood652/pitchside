import { Game } from '../src/match/game';
import { TEAMS } from '../src/data/teams';
import { setOwner } from '../src/match/control';
import type { Input, Action } from '../src/core/input';
import { PITCH } from '../src/data/tuning';

class ScriptInput {
  mv = { x: 0, y: 0 };
  heldSet = new Set<Action>();
  pressedSet = new Set<Action>();
  releasedSet = new Set<Action>();
  move() {
    return this.mv;
  }
  held(a: Action) {
    return this.heldSet.has(a);
  }
  pressed(a: Action) {
    return this.pressedSet.has(a);
  }
  released(a: Action) {
    return this.releasedSet.has(a);
  }
  endStep() {
    this.pressedSet.clear();
    this.releasedSet.clear();
  }
  tap(a: Action) {
    this.pressedSet.add(a);
  }
  down(a: Action) {
    this.pressedSet.add(a);
    this.heldSet.add(a);
  }
  up(a: Action) {
    this.heldSet.delete(a);
    this.releasedSet.add(a);
  }
}

function step(g: Game, inp: ScriptInput, seconds: number, each?: () => void) {
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    each?.();
    g.update(1 / 60, inp as unknown as Input);
    inp.endStep();
  }
}

describe('human controls', () => {
  it('human kicks off with a pass', () => {
    const g = new Game(TEAMS[2], TEAMS[1], 180, true);
    const inp = new ScriptInput();
    expect(g.s.phase).toBe('kickoff');
    expect(g.s.controlled).toBe(g.s.taker);
    step(g, inp, 1);
    inp.tap('pass');
    step(g, inp, 1);
    expect(g.s.phase).toBe('play');
  });

  it('charged shot from the edge of the box scores past an absent keeper', () => {
    let goals = 0;
    for (let trial = 0; trial < 6; trial++) {
      const g = new Game(TEAMS[2], TEAMS[1], 180, true);
      const s = g.s;
      const inp = new ScriptInput();
      s.phase = 'play';
      s.taker = null;
      s.restart = null;
      // Clear the area: everyone else far away
      for (const p of s.players) p.pos = { x: -40, z: p.id - 11 };
      const me = s.players[9];
      me.pos = { x: PITCH.halfL - 15, z: 2 };
      me.facing = Math.PI / 2;
      s.ball.place(me.pos.x + 0.6, me.pos.z);
      setOwner(s, me);
      inp.down('shoot');
      step(g, inp, 0.45);
      inp.up('shoot');
      step(g, inp, 3, () => {
        for (const e of s.events) if (e.type === 'goal') goals++;
        s.events.length = 0;
      });
    }
    expect(goals).toBeGreaterThanOrEqual(5);
  });

  it('pressing J next to the carrier starts a tackle', () => {
    const g = new Game(TEAMS[2], TEAMS[1], 180, true);
    const s = g.s;
    const inp = new ScriptInput();
    s.phase = 'play';
    s.taker = null;
    const opp = s.players[17];
    const me = s.players[5];
    opp.pos = { x: 0, z: 0 };
    me.pos = { x: 1.5, z: 0 };
    s.ball.place(0.4, 0);
    setOwner(s, opp);
    s.controlled = me;
    inp.tap('pass');
    step(g, inp, 1 / 60);
    expect(me.action).toBe('tackle');
  });

  it('passing switches control to the receiver', () => {
    const g = new Game(TEAMS[2], TEAMS[1], 180, true);
    const s = g.s;
    const inp = new ScriptInput();
    s.phase = 'play';
    s.taker = null;
    const me = s.players[6];
    me.pos = { x: -10, z: 0 };
    s.ball.place(-9.5, 0);
    setOwner(s, me);
    const mate = s.players[9];
    mate.pos = { x: 5, z: 0 };
    inp.mv = { x: 1, y: 0 }; // aim right (+x)
    inp.tap('pass');
    step(g, inp, 0.5);
    expect(s.controlled).not.toBe(me);
  });
});
