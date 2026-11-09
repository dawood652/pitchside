// 2D batter: hand-keyed cover drive poses (side-on view from point; x = metres toward the bowler
// from the popping crease, y = height). Monotone cubic blending (no overshoot) and two-bone IK keep
// the gloves on the handle and the feet planted. Animation time a: 0 = bat on the ball.
export interface P2 { x: number; y: number }
export interface Limb { mid: P2; end: P2; reach: number }
export interface Pose2D {
  pel: P2; neck: P2; head: P2; shL: P2; shR: P2; hipL: P2; hipR: P2;
  legF: Limb; legB: Limb; armF: Limb; armB: Limb;
  H: P2; bd: P2; gT: P2; gB: P2; sweet: P2;
}
const L = { thigh: 0.44, shin: 0.42, upper: 0.29, fore: 0.33, spine: 0.5, ankle: 0.08 };
// t, pelvis x y, lean (deg toward the bowler), shoulder half-width, front foot x lift, back foot x
// lift, top-hand grip x y, bat angle (deg from hanging down, + = toe back), head tilt
const STANCE = [0.08, 0.84, 22, 0.13, 0.3, 0, -0.14, 0, 0.12, 0.9, 16, 0];
const KEYS: number[][] = [
  [-1.1, ...STANCE],
  [-0.75, ...STANCE],
  [-0.55, 0.11, 0.83, 22, 0.13, 0.33, 0, -0.06, 0, 0.1, 0.96, 30, 0], // trigger
  [-0.33, 0.24, 0.84, 17, 0.14, 0.58, 0.12, -0.06, 0, 0.02, 1.12, 125, 0], // backlift, front foot up
  [-0.17, 0.4, 0.79, 22, 0.13, 0.86, 0, -0.05, 0, 0.1, 1.2, 150, 4], // front foot down, bat at the top
  [-0.07, 0.46, 0.76, 27, 0.11, 0.86, 0, -0.04, 0.02, 0.42, 1.0, 70, 8], // downswing
  [0, 0.48, 0.75, 30, 0.1, 0.86, 0, -0.02, 0.05, 0.66, 0.8, 6, 10], // contact
  [0.07, 0.49, 0.76, 28, 0.06, 0.86, 0, -0.01, 0.06, 0.95, 0.88, -70, 8],
  [0.13, 0.49, 0.77, 25, 0.0, 0.86, 0, -0.01, 0.06, 1.1, 1.08, -105, 6], // extension toward the target
  [0.22, 0.48, 0.78, 20, 0.03, 0.86, 0, 0.0, 0.06, 0.95, 1.5, -150, 4],
  [0.42, 0.46, 0.79, 16, 0.04, 0.86, 0, 0.0, 0.06, 0.9, 1.42, -200, 2], // high finish
  [0.95, 0.46, 0.79, 16, 0.04, 0.86, 0, 0.0, 0.06, 0.9, 1.42, -200, 2],
];
export const A_START = KEYS[0][0];
export const A_HOLD = -0.17; // top of the backlift: held here until the tap
export const A_END = KEYS[KEYS.length - 1][0];
const NCH = KEYS[0].length - 1;
const ts = KEYS.map((k) => k[0]);
const tans: number[][] = [];
for (let c = 0; c < NCH; c++) {
  const y = KEYS.map((k) => k[c + 1]);
  const n = y.length;
  const d: number[] = [];
  const m = new Array<number>(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((y[i + 1] - y[i]) / (ts[i + 1] - ts[i]));
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) continue;
    m[i] = (d[i - 1] + d[i]) / 2;
    const a = m[i] / d[i - 1];
    const b = m[i] / d[i];
    if (a * a + b * b > 9) m[i] *= 3 / Math.hypot(a, b);
  }
  for (let i = 0; i < n - 1; i++) if (d[i] === 0) m[i] = m[i + 1] = 0;
  tans.push(m);
}
function chan(t: number): number[] {
  t = Math.min(A_END, Math.max(A_START, t));
  let i = 0;
  while (i < ts.length - 2 && t > ts[i + 1]) i++;
  const h = ts[i + 1] - ts[i];
  const u = (t - ts[i]) / h;
  const u2 = u * u;
  const u3 = u2 * u;
  const out: number[] = [];
  for (let c = 0; c < NCH; c++) {
    const y0 = KEYS[i][c + 1];
    const y1 = KEYS[i + 1][c + 1];
    out.push((2 * u3 - 3 * u2 + 1) * y0 + (u3 - 2 * u2 + u) * h * tans[c][i] + (-2 * u3 + 3 * u2) * y1 + (u3 - u2) * h * tans[c][i + 1]);
  }
  return out;
}
export const add = (a: P2, b: P2): P2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: P2, b: P2): P2 => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a: P2, k: number): P2 => ({ x: a.x * k, y: a.y * k });
export const lerp2 = (a: P2, b: P2, k: number): P2 => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
/** Two-bone IK in the picture plane. depth < 1 flattens the bend (it points toward the camera). */
function ik(a: P2, target: P2, l1: number, l2: number, pole: P2, depth = 1): Limb {
  const raw = Math.hypot(target.x - a.x, target.y - a.y);
  const d = Math.min(l1 + l2 - 1e-4, Math.max(Math.abs(l1 - l2) + 1e-3, raw));
  const dir = mul(sub(target, a), 1 / (raw || 1));
  const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  let p = { x: -dir.y, y: dir.x };
  if (p.x * pole.x + p.y * pole.y < 0) p = mul(p, -1);
  return { mid: add(add(a, mul(dir, along)), mul(p, h * depth)), end: add(a, mul(dir, d)), reach: raw / (l1 + l2) };
}
export function pose2d(a: number): Pose2D {
  const [px, py, lean, sw, fx, fy, bx, by, gx, gy, bat, headT] = chan(a);
  const r = (lean * Math.PI) / 180;
  const up = { x: Math.sin(r), y: Math.cos(r) };
  const across = { x: Math.cos(r), y: -Math.sin(r) };
  const pel = { x: px, y: py };
  const neck = add(pel, mul(up, L.spine));
  const shL = add(neck, mul(across, sw));
  const shR = sub(neck, mul(across, sw));
  const hipL = add(pel, { x: 0.09, y: 0 });
  const hipR = add(pel, { x: -0.09, y: 0 });
  const legF = ik(hipL, { x: fx, y: L.ankle + fy }, L.thigh, L.shin, { x: 1, y: 0.2 });
  const legB = ik(hipR, { x: bx, y: L.ankle + by }, L.thigh, L.shin, { x: 1, y: 0.2 });
  const th = (bat * Math.PI) / 180;
  const bd = { x: -Math.sin(th), y: -Math.cos(th) }; // handle -> toe
  const gT = { x: gx, y: gy };
  const gB = add(gT, mul(bd, 0.11));
  const H = sub(gT, mul(bd, 0.06));
  // seen from point, most of the elbow bend is toward the camera, so it is flattened in the picture
  const armF = ik(shL, gT, L.upper, L.fore, { x: 1, y: 0.3 }, 0.45);
  const armB = ik(shR, gB, L.upper, L.fore, { x: -0.5, y: -1 }, 0.45);
  const hr = ((lean + headT) * Math.PI) / 180;
  const head = add(neck, { x: Math.sin(hr) * 0.15 + 0.02, y: Math.cos(hr) * 0.15 });
  return { pel, neck, head, shL, shR, hipL, hipR, legF, legB, armF, armB, H, bd, gT, gB, sweet: add(H, mul(bd, 0.64)) };
}
export const SWEET_AT_CONTACT = pose2d(0).sweet;
