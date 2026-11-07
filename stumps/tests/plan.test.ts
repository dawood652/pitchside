import { bowl, makeDelivery, findContact, fly } from '../src/batting/physics';
import { planShot, idealTap } from '../src/batting/plan';
import { BAT } from '../src/batting/tuning';

function rng(seed: number) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }
function run(te: number, aimDeg: number, lofted: boolean, seeds = 60) {
  let hit = 0, near = 0, runs = 0, angs: number[] = [];
  for (let seed = 1; seed <= seeds; seed++) {
    const r = rng(seed * 7919); const d = makeDelivery(r); const path = bowl(d); const ti = idealTap(d, path);
    const p = planShot((aimDeg * Math.PI) / 180, lofted ? 90 : 50, lofted, d, path, ti + te, r);
    const c = findContact(p.swing, path, ti + te, ti + te + 0.45);
    if (!c) continue;
    hit++;
    const f = fly(c.p, c.out); const e = f.path.at(-1)!.p;
    const a = (Math.atan2(e.x, e.z) * 180) / Math.PI; angs.push(a);
    if (Math.abs(a - aimDeg) < 12) near++;
    runs += f.runs;
  }
  return { hit: hit / seeds, near: near / Math.max(1, hit), runs: runs / seeds, ang: angs.reduce((x, y) => x + y, 0) / Math.max(1, angs.length) };
}

describe('timing window (human-playable)', () => {
  it('green timing connects and goes where you tapped', () => {
    for (const aim of [0, 40, -40, 90, -90]) {
      const r = run(0, aim, false);
      expect(r.hit).toBeGreaterThan(0.9);
      expect(r.near).toBeGreaterThan(0.75);
    }
  });
  it('yellow timing (up to 60 ms off) still connects almost always', () => {
    for (const te of [-0.05, 0.05]) expect(run(te, 30, false).hit).toBeGreaterThan(0.85);
  });
  it('early drifts to the leg side, late to the off side', () => {
    expect(run(-0.05, 0, false).ang).toBeLessThan(run(0.05, 0, false).ang - 15);
  });
  it('red timing scores less than green', () => {
    expect(run(0.085, 20, false).runs).toBeLessThan(run(0, 20, false).runs - 0.8);
  });
  it('outside the window misses', () => {
    expect(run(BAT.WINDOW + 0.04, 0, false).hit).toBeLessThan(0.1);
    expect(run(-BAT.WINDOW - 0.04, 0, false).hit).toBeLessThan(0.1);
  });
});
