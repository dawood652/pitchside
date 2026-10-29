import { decideRestart } from '../src/match/rules';
import { groundPass, groundSpeedFor, rollTo, lobPass, shot } from '../src/match/kicks';
import { BallSim, checkBoundary } from '../src/physics/ball';
import { PITCH } from '../src/data/tuning';

const dirs: [number, number] = [1, -1]; // team 0 attacks +x

describe('restarts', () => {
  it('goal in the +x goal counts for team 0, team 1 kicks off', () => {
    const r = decideRestart({ kind: 'goal', side: 1 }, 0, dirs);
    expect(r.scorer).toBe(0);
    expect(r.restart).toMatchObject({ kind: 'kickoff', team: 1 });
  });
  it('own goal still counts for the attacking side', () => {
    const r = decideRestart({ kind: 'goal', side: 1 }, 1, dirs);
    expect(r.scorer).toBe(0);
  });
  it('defender last touch over own byline = corner to attackers', () => {
    const r = decideRestart({ kind: 'byline', side: 1, z: 10 }, 1, dirs);
    expect(r.restart.kind).toBe('corner');
    expect(r.restart.team).toBe(0);
    expect(r.restart.z).toBeGreaterThan(0);
  });
  it('attacker last touch over byline = goal kick', () => {
    const r = decideRestart({ kind: 'byline', side: 1, z: -10 }, 0, dirs);
    expect(r.restart).toMatchObject({ kind: 'goalkick', team: 1 });
  });
  it('throw-in goes to the team that did not touch it last', () => {
    const r = decideRestart({ kind: 'touchline', side: -1, x: 12 }, 1, dirs);
    expect(r.restart).toMatchObject({ kind: 'throwin', team: 0, x: 12 });
  });
  it('after half-time swap the sides flip', () => {
    const r = decideRestart({ kind: 'goal', side: 1 }, 0, [-1, 1]);
    expect(r.scorer).toBe(1);
  });
});

describe('kick solvers', () => {
  it('ground pass speed reaches the target at roughly the end speed', () => {
    for (const d of [8, 15, 25, 35]) {
      const s = groundSpeedFor(d, 4);
      const r = rollTo(s, 4);
      expect(Math.abs(r.d - d)).toBeLessThan(0.3);
    }
  });
  it('a simulated ground pass arrives near the receiver', () => {
    const k = groundPass({ x: 0, z: 0 }, { x: 20, z: 5 });
    const b = new BallSim();
    b.place(0, 0);
    b.kick(k.vx, k.vy, k.vz);
    let best = 99;
    for (let i = 0; i < 400; i++) {
      b.step(1 / 60);
      best = Math.min(best, Math.hypot(b.pos.x - 20, b.pos.z - 5));
    }
    expect(best).toBeLessThan(0.6);
  });
  it('lob lands near the target', () => {
    const k = lobPass({ x: 0, z: 0 }, { x: 30, z: 0 });
    const b = new BallSim();
    b.place(0, 0, 0.12);
    b.kick(k.vx, k.vy, k.vz);
    let landX = 0;
    for (let i = 0; i < 400; i++) {
      b.step(1 / 60);
      if (b.bounced) {
        landX = b.pos.x;
        break;
      }
    }
    expect(Math.abs(landX - 30)).toBeLessThan(2.5);
  });
  it('an accurate 18 m shot goes in', () => {
    let goals = 0;
    for (let i = 0; i < 20; i++) {
      const k = shot({ x: PITCH.halfL - 18, z: 4 }, PITCH.halfL, -2.5, 0.8, 0.6, 0);
      const b = new BallSim();
      b.place(PITCH.halfL - 18, 4);
      b.kick(k.vx, k.vy, k.vz, k.spin);
      for (let j = 0; j < 180; j++) {
        b.step(1 / 60);
        const ev = checkBoundary(b.pos, b.inNet);
        if (ev) {
          if (ev.kind === 'goal') goals++;
          break;
        }
      }
    }
    expect(goals).toBe(20);
  });
});

import { judgeTackle, foulRestart, isOffside } from '../src/match/rules';

describe('fouls, penalties and offside', () => {
  const seq = (...v: number[]) => {
    let i = 0;
    return () => v[i++ % v.length];
  };
  it('clean tackle from the front is usually fair', () => {
    expect(judgeTackle(false, true, false, seq(0.5)).foul).toBe(false);
  });
  it('tackle from behind through the player is a foul and can be a yellow', () => {
    const r = judgeTackle(true, false, true, seq(0.1, 0.15));
    expect(r).toEqual({ foul: true, card: 'yellow' });
  });
  it('missed tackle with no contact is never a foul', () => {
    expect(judgeTackle(true, false, false, seq(0)).foul).toBe(false);
  });
  it('foul inside the box gives a penalty', () => {
    expect(foulRestart(PITCH.halfL - 8, 3, 0, 1)).toMatchObject({ kind: 'penalty', team: 0, x: PITCH.halfL - 11, z: 0 });
  });
  it('foul outside the box gives a free kick at the spot', () => {
    expect(foulRestart(20, -10, 1, -1)).toMatchObject({ kind: 'freekick', team: 1, x: 20, z: -10 });
  });
  it('offside: beyond second-last defender in opponents half', () => {
    // attacking +x; opponents: keeper at 51, defenders at 30, 28
    expect(isOffside(33, 10, [51, 30, 28], 1)).toBe(true);
  });
  it('onside: level or behind the second-last defender', () => {
    expect(isOffside(30, 10, [51, 30, 28], 1)).toBe(false);
    expect(isOffside(25, 10, [51, 30, 28], 1)).toBe(false);
  });
  it('never offside in your own half or behind the ball', () => {
    expect(isOffside(-5, -20, [51, -30, -40], 1)).toBe(false);
    expect(isOffside(33, 35, [51, 30, 28], 1)).toBe(false);
  });
  it('works for a team attacking -x', () => {
    expect(isOffside(-33, -10, [-51, -30, -28], -1)).toBe(true);
  });
});
