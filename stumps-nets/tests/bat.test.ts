import { bowl, makeDelivery, aimedSwing, findContact, fly, timeAtZ, sampleAt } from '../src/batting/physics';
import { chooseShot } from '../src/batting/shots';

function rng(seed: number) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }
const LEAD = 0.17;
function play(aimDeg: number, lofted: boolean, timingErr: number, seed = 3) {
  const r = rng(seed);
  const d = makeDelivery(r);
  const path = bowl(d);
  const shot = chooseShot((aimDeg * Math.PI) / 180, 50, lofted, d.length);
  const tC = timeAtZ(path, shot.contactZ);
  const contact = sampleAt(path, tC).p;
  const tap = tC - LEAD + timingErr;
  const sw = aimedSwing(shot, contact, tap, LEAD, path, tC);
  const c = findContact(sw, path, tap, tC + 0.3);
  if (!c) return { shot: shot.name, len: d.length, hit: false } as const;
  const f = fly(c.p, c.out);
  const end = f.path.at(-1)!.p;
  return { shot: shot.name, len: d.length, hit: true, q: c.quality, ang: (Math.atan2(end.x, end.z) * 180) / Math.PI, carry: f.carry, total: f.total, runs: f.runs, speed: Math.hypot(c.out.x, c.out.y, c.out.z) } as const;
}

describe('bat physics', () => {
  it('perfect timing middles it and sends it near the aim', () => {
    for (const [aim, seed] of [[0, 3], [35, 5], [-40, 7], [80, 11], [-80, 13]] as const) {
      const r = play(aim, false, 0, seed);
      console.log(aim, JSON.stringify(r));
      expect(r.hit).toBe(true);
      if (r.hit) {
        expect(r.q).toBe('middle');
        expect(Math.abs(r.ang - aim)).toBeLessThan(10);
        expect(r.total).toBeGreaterThan(55);
      }
    }
  });
  it('lofted + perfect clears the rope; early goes leg side, late off side', () => {
    const six = play(0, true, 0, 3);
    console.log('loft', JSON.stringify(six));
    expect(six.hit && six.carry).toBeGreaterThan(60);
    const early = play(0, false, -0.03, 3);
    const late = play(0, false, 0.03, 3);
    console.log('early', JSON.stringify(early), 'late', JSON.stringify(late));
    if (early.hit && late.hit) expect(early.ang).toBeLessThan(late.ang);
  });
  it('way off timing misses', () => {
    expect(play(0, false, 0.2, 3).hit).toBe(false);
  });
});
