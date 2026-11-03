// GRF-derived handling: movement limits, anticipated headers, chest traps, blocks, clip picking.
import { describe, it, expect } from 'vitest';
import { Game } from '../src/match/game';
import { TEAMS } from '../src/data/teams';
import { Player } from '../src/entities/player';
import { setOwner } from '../src/match/control';
import { pickGf } from '../src/animation/gfSelect';
import { alignContact } from '../src/animation/oneShot';
import { tryBlocks, resolveBlocks } from '../src/match/contest';
import type { Input } from '../src/core/input';
import { laneMargin } from '../src/ai/lanes';

const idle = { move: () => ({ x: 0, y: 0 }), held: () => false, pressed: () => false, released: () => false, endStep() {} } as unknown as Input;

function field() {
  const g = new Game(TEAMS[2], TEAMS[1], 180, false);
  const s = g.s;
  s.phase = 'play';
  s.taker = null;
  s.restart = null;
  s.owner = null;
  s.pending = null;
  // park everyone far away
  for (const p of s.players) {
    p.pos = { x: p.team ? 48 : -48, z: p.id - 11 };
    p.vel = { x: 0, z: 0 };
  }
  return { g, s };
}

function runner(): Player {
  const { s } = field();
  const p = s.players[9];
  p.pos = { x: 0, z: 0 };
  p.facing = Math.PI / 2;
  p.sprint = true;
  return p;
}

describe('GRF movement model', () => {
  it('accelerates quickly at first and slowly near top speed', () => {
    const p = runner();
    p.desired = { x: 20, z: 0 };
    const sp: number[] = [];
    for (let i = 0; i < 120; i++) {
      p.integrate(1 / 60, false);
      sp.push(p.speed);
    }
    const first = sp[14] - sp[0]; // first quarter second
    const late = sp[119] - sp[104];
    expect(first).toBeGreaterThan(late * 2);
    expect(sp[119]).toBeGreaterThan(p.maxSpeed(false) * 0.85);
  });

  it('a sharp turn at sprint costs speed instead of snapping round', () => {
    const p = runner();
    p.vel = { x: 8, z: 0 };
    p.desired = { x: 0, z: 20 }; // 90° turn
    p.integrate(1 / 60, false);
    const heading = Math.atan2(p.vel.x, p.vel.z);
    expect(Math.abs(heading - Math.PI / 2)).toBeLessThan(0.2); // barely turned in one step
    for (let i = 0; i < 10; i++) p.integrate(1 / 60, false);
    expect(p.speed).toBeLessThan(7.5); // braked into the turn
    for (let i = 0; i < 60; i++) p.integrate(1 / 60, false);
    expect(p.vel.z).toBeGreaterThan(4); // and came out of it
  });

  it('turns tighter with the ball limited more than without', () => {
    const a = runner();
    const b = runner();
    for (const [p, ball] of [[a, true], [b, false]] as const) {
      p.vel = { x: 6, z: 0 };
      p.desired = { x: 0, z: 6 };
      for (let i = 0; i < 6; i++) p.integrate(1 / 60, ball);
    }
    expect(Math.atan2(a.vel.z, a.vel.x)).toBeLessThan(Math.atan2(b.vel.z, b.vel.x));
  });
});

describe('aerial play', () => {
  it('a player under a dropping ball commits to a header and meets it', () => {
    const { g, s } = field();
    const p = s.players[8];
    p.pos = { x: 0, z: 0 };
    p.facing = Math.PI / 2;
    // ball dropping onto him from 12 m away
    s.ball.place(-12, 0, 3.0);
    s.ball.vel = { x: 18, y: 2.5, z: 0 };
    let committed = false;
    let headed = false;
    for (let i = 0; i < 90 && !headed; i++) {
      g.update(1 / 60, idle);
      if (p.action === 'header') committed = true;
      if (s.lastToucher === p) headed = true;
    }
    expect(committed).toBe(true);
    expect(headed).toBe(true);
    expect(p.cue?.cat).toBe('header');
  });

  it('the intended receiver kills a chest-high pass instead of letting it bounce off', () => {
    const { g, s } = field();
    const p = s.players[8];
    p.pos = { x: 0, z: 0 };
    p.facing = -Math.PI / 2;
    s.ball.place(-0.6, 0, 1.25);
    s.ball.vel = { x: 7, y: -1, z: 0 };
    s.intendedReceiver = p;
    g.update(1 / 60, idle);
    expect(s.owner).toBe(p);
    expect(p.touchEvent?.kind).toBe('chest');
  });
});

describe('blocks', () => {
  it('a defender on the line of a shot throws himself in front of it', () => {
    const { s } = field();
    const shooter = s.players[9];
    const def = s.players[15];
    def.pos = { x: 30, z: 0.6 };
    def.facing = -Math.PI / 2;
    def.ratings.defending = 95;
    s.ball.place(27, 0, 0.4);
    s.ball.vel = { x: 20, y: 0, z: 0 };
    s.shotSide = 1;
    s.lastTouch = shooter.team;
    tryBlocks(s);
    expect(def.action).toBe('block');
    expect(def.cue?.cat).toBe('interfere');
    // force the outcome and run to the contact moment
    def.blockOk = true;
    for (let i = 0; i < 12; i++) {
      s.ball.step(1 / 60);
      def.integrate(1 / 60, false);
      resolveBlocks(s);
    }
    expect(s.lastToucher).toBe(def);
    expect(s.ball.vel.x).toBeLessThan(10);
  });
});

describe('animation picking', () => {
  it('picks headers by direction and traps by height', () => {
    const left = pickGf('header', 0, 90, 0, { h: 1.7 });
    const right = pickGf('header', 0, -90, 0, { h: 1.7 });
    expect(left!.entry.ballAngle!).toBeGreaterThan(30);
    expect(right!.entry.ballAngle!).toBeLessThan(-30);
    const knee = pickGf('chest', 0, 0, 0, { h: 0.75 });
    const chest = pickGf('chest', 0, 0, 0, { h: 1.25 });
    expect(knee!.entry.h!).toBeLessThan(1);
    expect(chest!.entry.h!).toBeGreaterThan(1);
  });

  it('heavy falls end lying down so the player can stand up; small bumps do not', () => {
    expect(pickGf('trip', 6, 0, 0, { severity: 3 })!.entry.lay).toBeTruthy();
    expect(pickGf('trip', 6, 0, 0, { severity: 1 })!.entry.lay).toBeFalsy();
    expect(pickGf('standup', 0, 0, 0, { lay: 'lay_back' })!.clip).toMatch(/back/);
  });

  it('schedules a clip so its contact frame lands on the sim contact', () => {
    // plenty of time: plays from the start, slowed slightly
    const a = alignContact(0.4, 0.45);
    expect(a.start + 0.45 * a.scale).toBeCloseTo(0.4, 5);
    // too little time: skips part of the wind-up and speeds up
    const b = alignContact(0.5, 0.2);
    expect(b.scale).toBeGreaterThan(1);
    expect(b.start + 0.2 * b.scale).toBeCloseTo(0.5, 5);
  });
});

describe('passing lanes', () => {
  it('a defender near the middle of a long lane cuts it out; one far off it does not', () => {
    const { s } = field();
    const d = s.players[15];
    const from = { x: 0, z: 0 };
    const to = { x: 30, z: 0 };
    d.pos = { x: 15, z: 3 };
    const close = laneMargin(from, to, [d]);
    d.pos = { x: 15, z: 14 };
    const far = laneMargin(from, to, [d]);
    expect(close).toBeLessThan(0);
    expect(far).toBeGreaterThan(0.3);
    // the same 3 m gap right next to the passer is safe: the ball is past before he reacts
    d.pos = { x: 2, z: 3 };
    expect(laneMargin(from, to, [d])).toBeGreaterThan(close);
  });
});

void setOwner;
