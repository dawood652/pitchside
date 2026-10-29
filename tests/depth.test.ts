import { Game } from '../src/match/game';
import { TEAMS } from '../src/data/teams';
import { setOwner } from '../src/match/control';
import { Input, PAD_BUTTONS } from '../src/core/input';
import { PITCH } from '../src/data/tuning';

const fi = { move: () => ({ x: 0, y: 0 }), held: () => false, pressed: () => false, released: () => false, endStep: () => {}, poll: () => {} } as unknown as Input;

describe('match depth', () => {
  it('fouls, cards, offsides and set pieces happen in CPU matches without breaking the game', () => {
    const counts: Record<string, number> = { foul: 0, card: 0, offside: 0, freekick: 0, penalty: 0, goal: 0 };
    for (let seed = 0; seed < 4; seed++) {
      const g = new Game(TEAMS[seed], TEAMS[(seed + 2) % 8], 240, false);
      const s = g.s;
      let prev = '';
      for (let i = 0; i < 60 * 560 && s.phase !== 'fulltime'; i++) {
        g.update(1 / 60, fi);
        for (const e of s.events) if (e.type in counts) counts[e.type]++;
        s.events.length = 0;
        const k = s.phase === 'restart' ? s.restart!.kind : '';
        if (k !== prev && (k === 'freekick' || k === 'penalty')) counts[k]++;
        prev = k;
        for (const p of s.players) if (!Number.isFinite(p.pos.x)) throw new Error('NaN');
      }
      expect(s.phase).toBe('fulltime');
    }
    console.log(counts);
    expect(counts.foul).toBeGreaterThan(0);
  }, 120000);

  it('a penalty is set up with the box cleared and can be scored', () => {
    let goals = 0;
    for (let i = 0; i < 12; i++) {
      const g = new Game(TEAMS[0], TEAMS[1], 240, false);
      const s = g.s;
      s.phase = 'play';
      s.taker = null;
      s.restart = null;
      s.owner = null;
      s.pendingFoul = { restart: { kind: 'penalty', team: 0, x: PITCH.halfL - 11, z: 0 } };
      g.update(1 / 60, fi);
      expect((s.restart as { kind: string } | null)?.kind).toBe("penalty");
      const inBox = s.players.filter((p) => p !== s.taker && p.role !== 'GK' && p.pos.x > PITCH.halfL - PITCH.boxDepth);
      expect(inBox.length).toBe(0);
      for (let t = 0; t < 60 * 8; t++) {
        g.update(1 / 60, fi);
        let saved = false;
        for (const e of s.events) {
          if (e.type === 'goal') goals++;
          if (e.type === 'save') saved = true;
        }
        if (saved) break; // count the penalty itself, not rebounds
        s.events.length = 0;
        const ph = s.phase as string;
        if (ph === "goal" || (ph === "restart" && s.phaseT > 0.1 && (s.restart as { kind: string } | null)?.kind !== "penalty")) break;
      }
    }
    console.log('penalties scored', goals, '/ 12');
    expect(goals).toBeGreaterThanOrEqual(4);
    expect(goals).toBeLessThanOrEqual(11);
  }, 60000);

  it('free kick near goal builds a wall 9.15 m away', () => {
    const g = new Game(TEAMS[0], TEAMS[1], 240, false);
    const s = g.s;
    s.phase = 'play';
    s.taker = null;
    s.owner = null;
    s.pendingFoul = { restart: { kind: 'freekick', team: 0, x: PITCH.halfL - 24, z: 6 } };
    g.update(1 / 60, fi);
    expect(s.wall.length).toBeGreaterThanOrEqual(3);
    for (const w of s.wall) expect(Math.hypot(w.pos.x - s.ball.pos.x, w.pos.z - s.ball.pos.z)).toBeGreaterThan(8.8);
  });

  it('offside pass is called when the receiver touches the ball', () => {
    const g = new Game(TEAMS[0], TEAMS[1], 240, false);
    const s = g.s;
    s.phase = 'play';
    s.taker = null;
    s.restart = null;
    // Team 0 attacks +x. Defenders of team 1 at x=20, forward of team 0 at x=30.
    for (const p of s.players) p.pos = p.team === 0 ? { x: -30, z: p.id - 5 } : { x: 20, z: 8 + (p.id - 11) * 2 };
    const gk = s.players.find((p) => p.team === 1 && p.role === 'GK')!;
    gk.pos = { x: 51, z: 0 };
    const passer = s.players[6];
    passer.pos = { x: 5, z: 0 };
    const fwd = s.players[9];
    fwd.pos = { x: 30, z: 0 };
    s.ball.place(5.5, 0);
    setOwner(s, passer);
    s.pending = { player: passer, delay: 0, vel: { vx: 18, vy: 0, vz: 0, spin: 0 }, receiver: fwd, isShot: false, power: 0.5 };
    let called = false;
    for (let i = 0; i < 180 && !called; i++) {
      g.update(1 / 60, fi);
      for (const e of s.events) if (e.type === 'offside') called = true;
      s.events.length = 0;
    }
    expect(called).toBe(true);
  });

  it('gamepad standard mapping covers the core actions', () => {
    const acts = PAD_BUTTONS.map(([, a]) => a);
    for (const a of ['pass', 'shoot', 'lob', 'through', 'switch', 'sprint', 'finesse', 'pause']) expect(acts).toContain(a);
  });
});
