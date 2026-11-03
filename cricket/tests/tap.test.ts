import { planShot, ropeField, makeDelivery, rng } from '../src/engine';
describe('tap-to-hit', () => {
  const field = ropeField();
  const r = rng(9);
  const d = makeDelivery(r, 1, 0);
  const tgt = { x: 20, z: 40 };
  it('perfect timing is a six, slightly off a four, more off runs', () => {
    expect(planShot(d, 0.01, tgt, 1, field, r).kind).toBe('six');
    expect(planShot(d, 0.07, tgt, 1, field, r).kind).toBe('four');
    expect(planShot(d, -0.12, tgt, 1, field, r).kind).toBe('runs');
  });
  it('a six lands beyond the rope near the tapped direction', () => {
    const s = planShot(d, 0, tgt, 1, field, r);
    const end = s.path.at(-1)!;
    expect(Math.hypot(end.x, end.z)).toBeGreaterThan(62);
    expect(Math.abs(Math.atan2(end.x, end.z) - Math.atan2(20, 40))).toBeLessThan(0.1);
  });
  it('poor timing gives catches some of the time; no swing on the stumps can be bowled', () => {
    let out = 0;
    for (let i = 0; i < 100; i++) if (planShot(d, 0.17, tgt, 1, field, r).out) out++;
    expect(out).toBeGreaterThan(30);
    expect(out).toBeLessThan(95);
  });
});
