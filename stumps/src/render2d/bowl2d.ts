// 2D bowler: the delivery stride from the 3D bowling keys (bowling.ts) seen side-on, preceded by a
// procedural running cycle. Drawn with the batter's painter, facing the batter (toward -x).
import { bowlerJoints, bowlerZ } from '../render3d/bowling';
import { RELEASE } from '../batting/physics';
import { V } from '../batting/vec';
import { Kit, Painter, tone } from './draw2d';
import { lerp2, P2 } from './keys';

export interface Bowl2D {
  head: P2; neck: P2; shL: P2; shR: P2; elL: P2; elR: P2; haL: P2; haR: P2;
  pel: P2; hipL: P2; hipR: P2; knL: P2; knR: P2; ftL: P2; ftR: P2;
}
const NAMES = ['head', 'neck', 'shL', 'shR', 'elL', 'elR', 'haL', 'haR', 'pel', 'hipL', 'hipR', 'knL', 'knR', 'ftL', 'ftR'] as const;
const P = (p: V): P2 => ({ x: p.z - 1.22, y: p.y }); // field -> side-on picture
const RUN_END = -0.5; // the keyed delivery takes over here

/** Running in: stride cycle (feet, knees, arms pumping) at the run-up speed. */
function running(t: number): Bowl2D {
  const z = bowlerZ(t);
  const ph = (t * Math.PI * 2) / 0.36; // two steps every 0.36 s
  const pel = { x: z - 1.22, y: 0.98 + 0.035 * Math.abs(Math.cos(ph)) };
  const lean = 0.18; // forward lean (toward -x)
  const neck = { x: pel.x - Math.sin(lean) * 0.5, y: pel.y + Math.cos(lean) * 0.5 };
  const leg = (o: number) => {
    const s = Math.sin(ph + o);
    const lift = Math.max(0, Math.cos(ph + o));
    const ft = { x: pel.x - 0.42 * s, y: 0.08 + 0.22 * lift };
    const kn = { x: (pel.x + ft.x) / 2 - 0.12 - 0.1 * lift, y: (pel.y + ft.y) / 2 + 0.02 };
    return { ft, kn };
  };
  const arm = (sh: P2, o: number) => {
    const s = Math.sin(ph + o);
    const el = { x: sh.x + 0.22 * s, y: sh.y - 0.24 };
    return { el, ha: { x: el.x - 0.12 + 0.12 * s, y: el.y + 0.12 + 0.08 * Math.max(0, -s) } };
  };
  const L = leg(0), R = leg(Math.PI);
  const aL = arm(neck, Math.PI), aR = arm(neck, 0);
  return {
    head: { x: neck.x - 0.06, y: neck.y + 0.17 }, neck, shL: neck, shR: neck,
    elL: aL.el, elR: aR.el, haL: aL.ha, haR: aR.ha,
    pel, hipL: pel, hipR: pel, knL: L.kn, knR: R.kn, ftL: L.ft, ftR: R.ft,
  };
}

export function bowler2d(t: number): Bowl2D {
  const keyed = (): Bowl2D => {
    const s = bowlerJoints(t);
    return {
      head: P(s.head), neck: P(s.neck), shL: P(s.shL), shR: P(s.shR), elL: P(s.elL), elR: P(s.elR), haL: P(s.haL), haR: P(s.haR),
      pel: P(s.pelvis), hipL: P(s.hipL), hipR: P(s.hipR), knL: P(s.knL), knR: P(s.knR), ftL: P(s.ftL), ftR: P(s.ftR),
    };
  };
  if (t >= RUN_END) return keyed();
  const run = running(t);
  if (t < RUN_END - 0.1) return run;
  const k = (t - (RUN_END - 0.1)) / 0.1;
  const a = keyed();
  const out = {} as Bowl2D;
  for (const n of NAMES) out[n] = lerp2(run[n], a[n], k * k * (3 - 2 * k));
  return out;
}
/** Where the ball leaves the hand, in the picture. */
export const RELEASE_2D = P(RELEASE);

/** Bowler: no pads or helmet; a cap, the ball in the right hand until release. */
export function drawBowler(pt: Painter, b: Bowl2D, k: Kit, holding: boolean): void {
  const skin = '#c9936b', trou = '#f1f0ea', shoe = '#f4f4f2';
  const leg = (hip: P2, kn: P2, ft: P2, back: boolean) => {
    const dk = back ? -0.12 : 0;
    pt.taper(hip, kn, 0.078, 0.058, tone(trou, dk - 0.05));
    pt.taper(kn, ft, 0.056, 0.045, tone(trou, dk - 0.05));
    pt.taper({ x: ft.x + 0.05, y: Math.max(0.03, ft.y - 0.05) }, { x: ft.x - 0.17, y: Math.max(0.03, ft.y - 0.06) }, 0.042, 0.032, tone(shoe, dk - 0.04));
  };
  const arm = (sh: P2, el: P2, ha: P2, back: boolean) => {
    const dk = back ? -0.12 : 0;
    pt.taper(el, ha, 0.043, 0.034, tone(skin, dk));
    pt.taper(sh, el, 0.058, 0.046, tone(skin, dk));
    pt.taper(sh, lerp2(sh, el, 0.55), 0.072, 0.056, tone(k.shirt, dk));
    pt.ell(ha, 0.036, 0.036, 0, tone(skin, dk));
  };
  // the camera is on the off side, so the bowler's right side (bowling arm) is the far side
  leg(b.hipR, b.knR, b.ftR, true);
  arm(b.shR, b.elR, b.haR, true);
  if (holding) pt.ell(b.haR, 0.04, 0.04, 0, '#a8161d');
  pt.taper(b.pel, b.neck, 0.11, 0.13, k.shirt); // torso
  pt.taper(b.hipL, b.hipR, 0.075, 0.075, trou);
  leg(b.hipL, b.knL, b.ftL, false);
  pt.taper(b.neck, lerp2(b.neck, b.head, 0.5), 0.045, 0.042, skin);
  pt.ell(b.head, 0.1, 0.11, 0, skin);
  pt.ell({ x: b.head.x + 0.01, y: b.head.y + 0.05 }, 0.105, 0.07, 0, k.helm); // cap
  pt.ell({ x: b.head.x - 0.1, y: b.head.y + 0.04 }, 0.07, 0.016, 0.1, tone(k.helm, -0.1)); // peak, toward the batter
  arm(b.shL, b.elL, b.haL, false);
}
