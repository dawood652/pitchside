// Ball and bat physics. Field coordinates (metres): x = off side (+), y = up, z = toward the bowler,
// batter's stumps at z = 0. The delivery is integrated (gravity, swing, bounce, seam); the bat is a
// blade swung on an arc; contact is found by continuous plane-crossing tests and resolved with an
// impulse (restitution falls off away from the sweet spot; edges deflect the face).
import { add, cross, dirOf, dot, mul, norm, ortho, rotAbout, rotDir, sub, UP, v, V } from './vec';
import { Length, Shot } from './shots';

export const G = 9.81;
export const BALL_R = 0.036;
export const BAT_LEN = 0.86; // handle top to toe
export const BLADE_FROM = 0.3; // handle length
export const BLADE_HALF_W = 0.054;
export const SWEET = 0.66; // distance from the handle top
export const BOUNDARY = 65; // metres from the batter to the rope
export const STUMP_HALF = 0.115;
export const STUMP_H = 0.71;

export interface Delivery {
  speed: number; // m/s at release
  bounceZ: number;
  line: number; // x where it pitches
  swing: number; // lateral acceleration before bouncing (m/s²)
  seam: number; // lateral velocity added at the bounce
  length: Length;
}

export interface BallSample {
  t: number;
  p: V;
  vel: V;
}

export const RELEASE = v(0.3, 2.15, 18.9);

export function makeDelivery(r: () => number, pace = 1): Delivery {
  const roll = r();
  const length: Length = roll < 0.1 ? 'yorker' : roll < 0.35 ? 'full' : roll < 0.68 ? 'good' : roll < 0.88 ? 'short' : 'bouncer';
  const bounceZ = { yorker: 1.3, full: 3.6, good: 6.2, short: 9.2, bouncer: 11.5 }[length] + (r() - 0.5) * 1.0;
  return { speed: (30 + r() * 6) * pace, bounceZ, line: (r() - 0.35) * 0.5, swing: (r() - 0.5) * 1.6, seam: (r() - 0.5) * 0.7, length };
}

/** Integrate the delivery from release until it is past the stumps. */
export function bowl(d: Delivery): BallSample[] {
  const out: BallSample[] = [];
  const dz = RELEASE.z - d.bounceZ;
  const tb = dz / d.speed;
  const vx = (d.line - RELEASE.x - 0.5 * d.swing * tb * tb) / tb;
  const vy = (BALL_R - RELEASE.y + 0.5 * G * tb * tb) / tb;
  let p = { ...RELEASE };
  let vel = v(vx, vy, -d.speed);
  let bounced = false;
  const dt = 1 / 600;
  for (let t = 0; t < 3; t += dt) {
    out.push({ t, p, vel });
    let a = v(0, -G, 0);
    if (!bounced) a = add(a, v(d.swing, 0, 0));
    vel = add(vel, mul(a, dt));
    p = add(p, mul(vel, dt));
    if (p.y < BALL_R && vel.y < 0) {
      p = { ...p, y: BALL_R };
      if (!bounced) {
        bounced = true;
        vel = v(vel.x + d.seam, -vel.y * 0.55, vel.z * 0.9);
      } else vel = v(vel.x * 0.8, -vel.y * 0.4, vel.z * 0.8);
    }
    if (p.z < -2) break;
  }
  return out;
}

export function sampleAt(path: BallSample[], t: number): BallSample {
  const i = Math.max(0, Math.min(path.length - 1, Math.round(t * 600)));
  return path[i];
}

/** Time the delivery reaches a given distance from the stumps. */
export function timeAtZ(path: BallSample[], z: number): number {
  for (const s of path) if (s.p.z <= z) return s.t;
  return path[path.length - 1].t;
}

// ------------------------------------------------------------------------------------------------
// Bat
export interface BatPose {
  h: V; // handle top
  d: V; // handle -> toe (unit)
  n: V; // face normal (unit)
}

export interface Swing {
  shot: Shot;
  contact: V; // where the swing is built to meet the ball
  tTap: number; // ball time of the tap
  lead: number; // tap -> bat at contact point
  pose0: BatPose; // bat pose when the arc passes the contact point
  pivot: V;
  axis: V;
  vAt1: number; // arc speed (rad per unit u) leaving the contact point
}

/** Build the swing: contact pose at the ball, then an arc around a pivot near the top hand. */
export function makeSwing(shot: Shot, contact: V, tTap: number, lead: number): Swing {
  const aim = dirOf(shot.aim);
  const n = norm(add(mul(aim, Math.cos(shot.loft)), mul(UP, Math.sin(shot.loft))));
  let d: V;
  if (shot.plane === 'vertical') d = ortho(add(mul(UP, -1), mul(aim, -0.28)), n);
  else if (shot.plane === 'horizontal') d = ortho(add(v(0, -0.35, 0.9), mul(aim, -0.2)), n);
  else d = ortho(add(v(0, -0.8, 0.5), mul(aim, -0.25)), n);
  const h = sub(sub(contact, mul(d, SWEET)), mul(n, BALL_R + 0.022));
  // the arc swings around the front (top-hand) shoulder: up and back along the handle from the hands
  let pivot = add(add(add(h, mul(d, -0.22)), mul(UP, 0.36)), mul(aim, -0.12));
  // a real shoulder stays between waist-high and head-high, within an arm's length of the hands
  pivot = v(pivot.x, Math.min(1.55, Math.max(1.22, pivot.y)), pivot.z);
  const r = sub(pivot, h);
  const rl = Math.hypot(r.x, r.y, r.z);
  if (rl > 0.55) {
    const hz = Math.hypot(r.x, r.z) || 1;
    const need = Math.sqrt(Math.max(0, 0.55 * 0.55 - r.y * r.y));
    const k = Math.min(1, need / hz);
    pivot = v(h.x + r.x * k, h.y + Math.min(r.y, 0.55), h.z + r.z * k);
  }
  let axis = norm(cross(d, n));
  // the arc must carry the face forward (along n) through the ball
  const toe = add(h, mul(d, SWEET));
  const moved = rotAbout(toe, pivot, axis, 0.01);
  if (dot(sub(moved, toe), n) < 0) axis = mul(axis, -1);
  return { shot, contact, tTap, lead, pose0: { h, d, n }, pivot, axis, vAt1: 1.6 * Math.abs(shot.backlift) * (0.55 + 0.45 * shot.speed) };
}

/** Arc angle at ball time t: accelerating downswing, then a decelerating follow-through. */
export function arcAngle(s: Swing, t: number): number {
  const u = (t - s.tTap) / s.lead;
  const b = s.shot.backlift;
  if (u <= 0) return b;
  if (u <= 1) return b * (1 - Math.pow(u, 1.6));
  const f = s.shot.follow;
  return f * (1 - Math.exp((-s.vAt1 * (u - 1)) / f));
}

/** Bat pose along the swing. Early contact = body already turned: face shut toward leg side. */
export function swingPose(s: Swing, t: number): BatPose {
  const th = arcAngle(s, t);
  const rot = (p: V) => rotAbout(p, s.pivot, s.axis, th);
  let h = rot(s.pose0.h);
  let d = rotDir(s.pose0.d, s.axis, th);
  let n = rotDir(s.pose0.n, s.axis, th);
  // the body keeps turning through the shot: met early, the face has already closed toward the
  // leg side; met late, it is still open toward the off side (rotation about the sweet spot)
  const yaw = -0.35 * Math.max(-0.6, Math.min(0.6, th)) * (s.shot.plane === 'vertical' ? 1 : 0.6);
  const c = add(h, mul(d, SWEET));
  h = rotAbout(h, c, UP, yaw);
  d = rotDir(d, UP, yaw);
  n = rotDir(n, UP, yaw);
  return { h, d, n };
}

export const batPoint = (b: BatPose, along: number, across = 0): V => add(add(b.h, mul(b.d, along)), mul(norm(cross(b.n, b.d)), across));

export interface Contact {
  t: number;
  p: V;
  along: number;
  across: number;
  quality: 'middle' | 'toe' | 'splice' | 'edge';
  out: V; // ball velocity off the bat
}

/** Find the first bat-ball contact (continuous) between t0 and t1 and resolve it. */
export function findContact(s: Swing, path: BallSample[], t0: number, t1: number): Contact | null {
  const dt = 1 / 1200;
  let prevSide = NaN;
  for (let t = t0; t <= t1; t += dt) {
    const b = sampleAt(path, t).p;
    const pose = swingPose(s, t);
    const rel = sub(b, pose.h);
    const side = dot(rel, pose.n);
    const along = dot(rel, pose.d);
    const across = dot(rel, norm(cross(pose.n, pose.d)));
    const crossed = !isNaN(prevSide) && Math.sign(side) !== Math.sign(prevSide);
    if ((crossed || Math.abs(side) < BALL_R + 0.022) && along > BLADE_FROM - 0.02 && along < BAT_LEN + BALL_R && Math.abs(across) < BLADE_HALF_W + BALL_R * 0.8) return resolve(s, path, t, b, along, across);
    prevSide = side;
  }
  return null;
}

function resolve(s: Swing, path: BallSample[], t: number, p: V, along: number, across: number): Contact {
  const e1 = 1 / 600;
  const pa = batPoint(swingPose(s, t - e1), along, across);
  const pb = batPoint(swingPose(s, t + e1), along, across);
  const vBat = mul(sub(pb, pa), 1 / (2 * e1));
  const pose = swingPose(s, t);
  const w = norm(cross(pose.n, pose.d));
  const edgeK = Math.max(0, (Math.abs(across) - BLADE_HALF_W * 0.55) / (BLADE_HALF_W * 0.45 + BALL_R * 0.8));
  // an edge tilts the effective face sharply toward the side the ball hit
  const n = norm(add(pose.n, mul(w, Math.sign(across) * edgeK * 2.2)));
  const offSweet = Math.abs(along - SWEET);
  let e = s.shot.restitution * Math.max(0.35, 1 - offSweet / 0.32) * (1 - edgeK * 0.6);
  const quality: Contact['quality'] = edgeK > 0.35 ? 'edge' : along > SWEET + 0.12 ? 'toe' : along < SWEET - 0.16 ? 'splice' : 'middle';
  if (quality === 'middle') e *= 1.05;
  const vBall = sampleAt(path, t).vel;
  const vRel = sub(vBall, vBat);
  const vn = dot(vRel, n);
  const vt = sub(vRel, mul(n, vn));
  const outRel = add(mul(n, -vn * e), mul(vt, 0.55));
  const out = add(vBat, outRel);
  return { t, p, along, across, quality, out };
}

// ------------------------------------------------------------------------------------------------
// Struck ball
export interface Flight {
  path: { t: number; p: V }[];
  carry: number; // distance to first bounce
  total: number;
  maxH: number;
  runs: number;
  boundary: 4 | 6 | null;
}

export function fly(from: V, vel0: V): Flight {
  const path: Flight['path'] = [];
  let p = { ...from };
  let vel = { ...vel0 };
  let carry = -1;
  let maxH = 0;
  const dt = 1 / 120;
  let t = 0;
  for (; t < 12; t += dt) {
    path.push({ t, p });
    const sp = Math.hypot(vel.x, vel.y, vel.z);
    if (p.y > BALL_R + 0.01) vel = add(vel, mul(vel, -0.0105 * sp * dt)); // air drag
    vel = add(vel, v(0, -G * dt, 0));
    p = add(p, mul(vel, dt));
    maxH = Math.max(maxH, p.y);
    if (p.y < BALL_R) {
      p = { ...p, y: BALL_R };
      if (carry < 0) carry = Math.hypot(p.x, p.z);
      // a skimming ball keeps its pace; a ball dropping steeply loses more
      const hs = Math.hypot(vel.x, vel.z) || 1;
      const keep = Math.abs(vel.y) > 1.2 ? 0.95 - 0.3 * Math.min(1, (Math.abs(vel.y) / hs) * 1.5) : 1;
      vel = v(vel.x * keep, Math.abs(vel.y) > 1.2 ? -vel.y * 0.3 : 0, vel.z * keep);
      if (vel.y === 0) {
        const h = Math.hypot(vel.x, vel.z);
        const k = Math.max(0, h - 3.2 * dt) / (h || 1); // rolling friction on an outfield
        vel = v(vel.x * k, 0, vel.z * k);
      }
    }
    if (Math.hypot(p.x, p.z) > BOUNDARY + 3 || (Math.hypot(vel.x, vel.z) < 0.3 && p.y <= BALL_R)) break;
  }
  const total = Math.hypot(p.x, p.z);
  if (carry < 0) carry = total;
  const six = carry >= BOUNDARY;
  const four = !six && total >= BOUNDARY;
  const runs = six ? 6 : four ? 4 : total > 42 ? 2 : total > 14 ? 1 : 0;
  return { path, carry, total, maxH, runs, boundary: six ? 6 : four ? 4 : null };
}

/** Did the ball (unhit) go on to hit the stumps? */
export function hitsStumps(path: BallSample[], from: number): boolean {
  for (const s of path) {
    if (s.t < from) continue;
    if (s.p.z <= 0) return Math.abs(s.p.x) < STUMP_HALF + BALL_R && s.p.y < STUMP_H + BALL_R;
  }
  return false;
}

/**
 * Build the swing the way a batter places the ball: the face is aimed so that a well-timed,
 * middled contact actually travels toward the chosen direction (corrects for the incoming ball and
 * the bat's own movement). Two quick correction passes.
 */
export function aimedSwing(shot: Shot, contact: V, tTap: number, lead: number, path: BallSample[], tIdeal: number): Swing {
  const want = shot.aim;
  let aim = want;
  let sw = makeSwing({ ...shot, aim }, contact, tTap, lead);
  for (let k = 0; k < 3; k++) {
    const ideal = makeSwing({ ...shot, aim }, contact, tIdeal - lead, lead);
    const c = findContact(ideal, path, tIdeal - lead, tIdeal + 0.25);
    if (!c) break;
    const got = Math.atan2(c.out.x, c.out.z);
    let err = want - got;
    err = Math.atan2(Math.sin(err), Math.cos(err));
    if (Math.abs(err) < 0.02) break;
    aim += err * 0.9;
  }
  sw = makeSwing({ ...shot, aim }, contact, tTap, lead);
  return sw;
}
