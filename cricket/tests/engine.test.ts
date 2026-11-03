import { makeDelivery, resolveShot, flyBall, defaultField, rng, newInnings, record, status, deliveryPos, flightTime } from '../src/engine';

describe('cricket engine', () => {
  it('deliveries arrive at the batter at the planned height', () => {
    const r = rng(3);
    for (let i = 0; i < 50; i++) {
      const d = makeDelivery(r, 1, i);
      const p = deliveryPos(d, flightTime(d));
      expect(Math.abs(p.z)).toBeLessThan(0.05);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(2.2);
    }
  });
  it('perfect timing hits hard; very late swing misses', () => {
    const r = rng(7);
    const d = makeDelivery(r, 1, 0);
    const good = resolveShot(d, { angle: 0, loft: false, defend: false }, 0, () => 0.99);
    expect(good.kind).toBe('hit');
    const bad = resolveShot(d, { angle: 0, loft: false, defend: false }, 0.4, r);
    expect(bad.kind).toBe('miss');
  });
  it('a well-timed lofted straight hit clears the ropes sometimes; scoring is plausible', () => {
    const r = rng(11);
    const field = defaultField(false);
    let six = 0, four = 0, caught = 0, runs = 0;
    for (let i = 0; i < 300; i++) {
      const d = makeDelivery(r, 1, i);
      const loft = i % 2 === 0;
      const o = resolveShot(d, { angle: (r() - 0.5) * 2.2, loft, defend: false }, (r() - 0.5) * 0.12, r);
      if (o.kind !== 'hit') continue;
      const f = flyBall(o, field, r);
      if (f.result.boundary === 6) six++;
      if (f.result.boundary === 4) four++;
      if (f.result.out) caught++;
      runs += f.result.runs;
    }
    expect(six).toBeGreaterThan(5);
    expect(four).toBeGreaterThan(10);
    expect(caught).toBeGreaterThan(3);
    expect(runs / 300).toBeGreaterThan(0.8);
    expect(runs / 300).toBeLessThan(4);
  });
  it('innings ends on target or when out of balls', () => {
    const inn = newInnings(1, 2, 10);
    record(inn, 6, false, '6');
    expect(status(inn)).toBe('playing');
    record(inn, 4, false, '4');
    expect(status(inn)).toBe('won');
  });
});
