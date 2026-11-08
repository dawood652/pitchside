// A right-arm fast bowler's delivery stride, keyed by time relative to release (s):
// gather + bound (-0.5..-0.18), back-foot contact side-on with the front arm high, front-foot
// contact as the front arm pulls down, release with a straight arm over the top, then the
// follow-through across the body. Produces joint positions (field coords) that the same rig
// that poses the batter turns into a body. The run-up before -0.5 uses the mocap run clip.
import { Skeleton } from '../batting/body';
import { RELEASE } from '../batting/physics';
import { add, mul, norm, v, V } from '../batting/vec';

export const BOWL_FROM = -0.5; // procedural window
export const BOWL_TO = 0.9;
const RUN_SPEED = 6.2;

type Key = [number, number];
/** Catmull-Rom through the keys: continuous velocity, so the body flows through each position
 *  instead of easing in and out of every key (which looks robotic). */
function curve(keys: Key[], t: number): number {
  if (t <= keys[0][0]) return keys[0][1];
  const n = keys.length;
  if (t >= keys[n - 1][0]) return keys[n - 1][1];
  let i = 1;
  while (t > keys[i][0]) i++;
  const [t1, p1] = keys[i - 1];
  const [t2, p2] = keys[i];
  const [t0, p0] = keys[Math.max(0, i - 2)];
  const [t3, p3] = keys[Math.min(n - 1, i + 1)];
  const h = t2 - t1;
  const m1 = i - 2 >= 0 ? ((p2 - p0) / (t2 - t0)) * h : p2 - p1;
  const m2 = i + 1 < n ? ((p3 - p1) / (t3 - t1)) * h : p2 - p1;
  const u = (t - t1) / h;
  const u2 = u * u;
  const u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p1 + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * p2 + (u3 - u2) * m2;
}
/** Wrist: cocked back through the load, snapping forward through release (radians). */
export function wristFlick(t: number): number {
  return curve([[-0.5, 0], [-0.12, -0.7], [-0.02, -0.55], [0.06, 0.65], [0.25, 0.3], [0.6, 0]], t);
}
const D = Math.PI / 180;

const TWIST: Key[] = [[-0.5, 15], [-0.3, 70], [-0.18, 95], [-0.08, 72], [0, 15], [0.15, -30], [0.45, -45], [0.9, -10]];
const LEAN: Key[] = [[-0.5, 12], [-0.3, 2], [-0.18, -14], [-0.08, -2], [0, 20], [0.15, 40], [0.45, 26], [0.9, 8]];
const SIDE: Key[] = [[-0.5, 0], [-0.08, 0], [0, -14], [0.15, -6], [0.5, 0]]; // lateral bend away from the bowling arm
const HIP: Key[] = [[-0.5, 0.97], [-0.3, 1.13], [-0.18, 0.94], [-0.08, 0.86], [0, 0.88], [0.2, 0.84], [0.5, 0.9], [0.9, 0.96]];
// arm angle in the plane along the pitch: 0 down, 90 back, 180 straight up, 270 forward
const ARM_R: Key[] = [[-0.5, 25], [-0.3, 65], [-0.18, 100], [-0.08, 140], [0, 183], [0.12, 250], [0.3, 318], [0.6, 375], [0.9, 380]];
const ARM_L: Key[] = [[-0.5, 330], [-0.3, 200], [-0.18, 195], [-0.08, 240], [0, 340], [0.3, 375], [0.9, 360]];

/** Pelvis distance down the pitch: run-up speed, braking after front-foot contact. */
export function bowlerZ(t: number): number {
  const zRel = RELEASE.z + 0.32;
  const speed = (s: number) => (s < -0.08 ? RUN_SPEED : 0.9 + (RUN_SPEED - 0.9) * Math.exp(-(s + 0.08) * 5));
  // integrate speed from t to 0 (positive = still behind the release point)
  const n = 40;
  const a = Math.min(t, 0);
  const b = Math.max(t, 0);
  let s = 0;
  for (let i = 0; i < n; i++) s += speed(a + ((i + 0.5) / n) * (b - a)) * ((b - a) / n);
  return t < 0 ? zRel + s : zRel - s;
}

export function bowlerJoints(t: number): Skeleton {
  const fwd = v(0, 0, -1);
  const right = v(1, 0, 0); // facing -z, the bowler's right hand side is +x
  const up = v(0, 1, 0);
  const z = bowlerZ(t);
  const px = RELEASE.x - 0.17;
  const pelvis = v(px, curve(HIP, t), z);
  // spine: lean forward/back about the right axis, bend sideways about the forward axis
  const lean = curve(LEAN, t) * D;
  const side = curve(SIDE, t) * D;
  const spine = norm(add(add(mul(up, Math.cos(lean) * Math.cos(side)), mul(fwd, Math.sin(lean))), mul(right, Math.sin(side))));
  const neck = add(pelvis, mul(spine, 0.5));
  const tw = curve(TWIST, t) * D;
  const lineL = norm(add(mul(right, -Math.cos(tw)), mul(fwd, Math.sin(tw)))); // right shoulder -> left shoulder
  const shL = add(neck, mul(lineL, 0.19));
  const shR = add(neck, mul(lineL, -0.19));
  const hipLine = norm(add(mul(right, -Math.cos(tw * 0.6)), mul(fwd, Math.sin(tw * 0.6))));
  const hipL = add(pelvis, mul(hipLine, 0.11));
  const hipR = add(pelvis, mul(hipLine, -0.11));
  const arm = (sh: V, deg: number, bend: number) => {
    const p = deg * D;
    const dir = norm(add(mul(up, -Math.cos(p)), mul(fwd, -Math.sin(p))));
    const el = add(sh, mul(dir, 0.3));
    const out = mul(norm(add(dir, mul(right, bend))), 0.29);
    return { el, ha: add(el, out) };
  };
  const aR = arm(shR, curve(ARM_R, t), 0.02);
  const aL = arm(shL, curve(ARM_L, t), -0.12);
  // feet: back (right) foot lands side-on at -0.18, front (left) foot lands down the pitch at -0.08
  const zBack = bowlerZ(-0.18);
  const zFront = bowlerZ(-0.08) - 0.78;
  let ftR: V;
  let ftL: V;
  if (t < -0.3) {
    const k = (t + 0.5) / 0.2;
    ftR = v(px + 0.12, 0.08 + 0.2 * Math.sin(Math.PI * k), z + 0.25 - 0.4 * k);
    ftL = v(px - 0.12, 0.08 + 0.35 * k, z - 0.15 + 0.35 * k);
  } else if (t < -0.18) {
    const k = (t + 0.3) / 0.12;
    ftR = v(px + 0.12, 0.08 + 0.18 * (1 - k), zBack + 0.1 * (1 - k));
    ftL = v(px - 0.1, 0.35 + 0.1 * Math.sin(Math.PI * k), z + 0.05);
  } else if (t < -0.08) {
    const k = (t + 0.18) / 0.1;
    ftR = v(px + 0.12, 0.08, zBack);
    ftL = v(px - 0.08, 0.08 + 0.3 * (1 - k), zFront + 0.6 * (1 - k));
  } else if (t < 0.35) {
    const k = Math.max(0, (t - 0.05) / 0.3);
    ftL = v(px - 0.08, 0.08, zFront);
    ftR = v(px + 0.12 - 0.15 * k, 0.08 + 0.35 * Math.sin(Math.PI * Math.min(1, k)), zBack - (zBack - zFront + 0.7) * k * k);
  } else {
    const k = Math.min(1, (t - 0.35) / 0.4);
    ftR = v(px - 0.03, 0.08, zFront - 0.7);
    ftL = v(px - 0.08, 0.08 + 0.25 * Math.sin(Math.PI * k), zFront - 1.3 * k);
  }
  const knee = (hip: V, ft: V) => add(mul(add(hip, ft), 0.5), mul(fwd, 0.25));
  const toe = (ft: V) => add(ft, add(mul(fwd, 0.2), v(0, -0.06, 0)));
  const head = add(neck, add(mul(spine, 0.2), mul(fwd, 0.05)));
  const look = v(0, 1, 0);
  return {
    head,
    neck,
    shL,
    shR,
    elL: aL.el,
    elR: aR.el,
    haL: aL.ha,
    haR: aR.ha,
    pelvis,
    hipL,
    hipR,
    knL: knee(hipL, ftL),
    knR: knee(hipR, ftR),
    ftL,
    ftR,
    toeL: toe(ftL),
    toeR: toe(ftR),
    bat: { h: v(0, -5, 0), d: v(0, -1, 0), n: v(0, 0, 1) }, // unused (no bat)
    look,
  };
}
