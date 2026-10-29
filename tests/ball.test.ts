import { BallSim, checkBoundary } from '../src/physics/ball';
import { FixedStepper } from '../src/core/loop';
import { BALL, PITCH } from '../src/data/tuning';

const DT = 1 / 60;
const run = (b: BallSim, seconds: number) => {
  for (let i = 0; i < seconds * 60; i++) b.step(DT);
};

describe('fixed stepper', () => {
  it('runs 60 updates per second of elapsed time', () => {
    const s = new FixedStepper();
    let n = 0;
    for (let i = 0; i < 100; i++) n += s.advance(0.01);
    expect(n).toBe(60);
  });
  it('caps huge frame gaps', () => {
    const s = new FixedStepper();
    expect(s.advance(5)).toBe(15);
  });
});

describe('ball physics', () => {
  it('bounces lower each time and comes to rest', () => {
    const b = new BallSim();
    b.place(0, 0, 5);
    const peaks: number[] = [];
    let prevVy = 0;
    for (let i = 0; i < 600; i++) {
      b.step(DT);
      if (prevVy > 0 && b.vel.y <= 0) peaks.push(b.pos.y);
      prevVy = b.vel.y;
    }
    expect(peaks.length).toBeGreaterThan(1);
    for (let i = 1; i < peaks.length; i++) expect(peaks[i]).toBeLessThan(peaks[i - 1]);
    expect(b.pos.y).toBeCloseTo(BALL.radius, 2);
  });

  it('a 10 m/s roll stops after a realistic distance (15-35 m)', () => {
    const b = new BallSim();
    b.place(0, 0);
    b.kick(10, 0, 0);
    run(b, 15);
    expect(b.groundSpeed).toBeLessThan(0.01);
    expect(b.pos.x).toBeGreaterThan(15);
    expect(b.pos.x).toBeLessThan(35);
  });

  it('sidespin curves the ball', () => {
    const a = new BallSim();
    const c = new BallSim();
    a.place(0, 0);
    c.place(0, 0);
    a.kick(25, 6, 0, 0);
    c.kick(25, 6, 0, 30);
    run(a, 1);
    run(c, 1);
    expect(Math.abs(c.pos.z - a.pos.z)).toBeGreaterThan(0.5);
  });

  it('rebounds off the post', () => {
    const b = new BallSim();
    b.place(PITCH.halfL - 5, PITCH.goalHalfWidth, 0.5);
    b.kick(20, 0, 0);
    run(b, 0.4);
    expect(b.vel.x).toBeLessThan(0);
  });

  it('a shot into the goal is trapped in the net', () => {
    const b = new BallSim();
    b.place(PITCH.halfL - 10, 0, 0.5);
    b.kick(25, 2, 0);
    run(b, 2);
    expect(b.inNet).toBe(true);
    expect(b.pos.x).toBeGreaterThan(PITCH.halfL);
    expect(b.pos.x).toBeLessThanOrEqual(PITCH.halfL + PITCH.goalDepth);
  });
});

describe('boundary detection', () => {
  it('ball half over the line is still in play', () => {
    expect(checkBoundary({ x: PITCH.halfL + 0.05, y: 0.11, z: 10 }, false)).toBeNull();
    expect(checkBoundary({ x: 10, y: 0.11, z: PITCH.halfW + 0.1 }, false)).toBeNull();
  });
  it('whole ball over the byline between posts is a goal', () => {
    expect(checkBoundary({ x: -PITCH.halfL - 0.2, y: 1, z: 2 }, false)).toEqual({ kind: 'goal', side: -1 });
  });
  it('over the bar is a byline exit', () => {
    expect(checkBoundary({ x: PITCH.halfL + 0.2, y: 3, z: 0 }, false)?.kind).toBe('byline');
  });
  it('touchline exit', () => {
    expect(checkBoundary({ x: 3, y: 0.11, z: -PITCH.halfW - 0.2 }, false)).toEqual({ kind: 'touchline', side: -1, x: 3 });
  });
});
