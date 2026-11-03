// The batter's body, built around the bat (a right-hander, side-on, chest toward the off side).
// Order each frame: feet (footwork) -> pelvis -> bat pose (stance / backlift / swing / leave) ->
// front shoulder follows the swing pivot -> torso, head -> arms by IK onto the handle (top hand =
// left, bottom hand = right, a hand's width apart) -> legs by IK onto the feet.
import { add, dirOf, dist, ik2, lerp, mul, norm, rotAbout, rotDir, smooth, sub, UP, v, V } from './vec';
import { BatPose, BallSample, Delivery, makeSwing, sampleAt, Swing, swingPose } from './physics';
import { chooseShot } from './shots';

export const LIMB = { thigh: 0.45, shin: 0.46, upper: 0.3, fore: 0.29, spine: 0.5, shoulder: 0.19, hip: 0.11 };

export interface Skeleton {
  head: V;
  neck: V;
  shL: V;
  shR: V;
  elL: V;
  elR: V;
  haL: V;
  haR: V;
  pelvis: V;
  hipL: V;
  hipR: V;
  knL: V;
  knR: V;
  ftL: V;
  ftR: V;
  toeL: V;
  toeR: V;
  bat: BatPose;
  look: V;
}

// Stance: feet a little wider than the shoulders either side of the popping crease, toes to the off side.
const STANCE_BACK = v(-0.36, 0, 1.0); // right foot
const STANCE_FRONT = v(-0.36, 0, 1.45); // left foot

export interface BatterState {
  delivery: Delivery | null;
  path: BallSample[] | null;
  t: number; // ball time (0 = release; negative during the run-up)
  T: number; // ball time at the batter
  swing: Swing | null;
  prevPose: BatPose | null; // pose just before the tap (for a seamless start of the downswing)
  tapT: number | null;
}

/** The default swing (straight drive to a canonical point) that gives the stance and backlift. */
function canonical(pelvis: V): Swing {
  const shot = chooseShot(0, 50, false, 'full');
  return makeSwing(shot, add(pelvis, v(0.42, -0.72, 0.42)), 0, 0.17);
}

export function batter(st: BatterState): Skeleton {
  const { t, T, delivery: d, path } = st;
  const s = st.swing;
  // ---- feet
  const contactT = s ? s.tTap + s.lead : T;
  const ballC = path ? sampleAt(path, Math.min(contactT, path[path.length - 1].t)).p : v(0, 0.5, 1.9);
  const frontFootBall = !d || !['short', 'bouncer'].includes(d.length);
  const trig = smooth(0.0, 0.22, t); // trigger: small back-and-across press as the ball is released
  let ftR = add(STANCE_BACK, v(0.12 * trig, 0, -0.04 * trig));
  let ftL = add(STANCE_FRONT, v(0.06 * trig, 0, 0));
  let liftL = 0;
  let liftR = 0;
  const moveStart = 0.18;
  const moveEnd = Math.max(moveStart + 0.12, contactT - 0.04);
  const u = d ? smooth(moveStart, moveEnd, t) : 0;
  if (d) {
    const shot = s?.shot;
    if (frontFootBall) {
      // stride to the pitch of the ball, head over it: front foot lands just inside the line
      const side = shot ? shot.contactSide : 0.3;
      const to = v(Math.min(ballC.x - side - 0.05, ftL.x + 0.55), 0, Math.min(ballC.z - 0.12, ftL.z + 0.75));
      ftL = lerp(ftL, to, u);
      liftL = Math.sin(Math.PI * u) * 0.13;
      if (shot && (shot.name.includes('Flick') || shot.name.includes('glance'))) ftL = add(ftL, v(-0.1 * u, 0, 0));
    } else {
      // back and across, then open up for the pull / hook
      const to = v(Math.min(ballC.x - 0.42, ftR.x + 0.45), 0, Math.max(0.55, Math.min(ftR.z, ballC.z - 0.5)));
      ftR = lerp(ftR, to, u);
      liftR = Math.sin(Math.PI * u) * 0.1;
      const horizontal = shot?.plane === 'horizontal' && shot.aim < 0;
      ftL = lerp(ftL, add(ftR, horizontal ? v(-0.32, 0, 0.3) : v(0.02, 0, 0.42)), u);
    }
  }
  // ---- pelvis between the feet, weight onto the front foot for front-foot shots
  const wF = d ? (frontFootBall ? 0.45 + 0.25 * u : 0.5 - 0.2 * u) : 0.5;
  const mid = lerp(ftR, ftL, wF);
  const stride = dist(ftL, ftR);
  const pelvis = add(mid, v(0.08, 0.93 - Math.max(0, stride - 0.45) * 0.22 - 0.04 * trig, 0)); // first guess, refined below

  // ---- bat
  const can = canonical(add(v(STANCE_BACK.x, 0.93, (STANCE_BACK.z + STANCE_FRONT.z) / 2), v(0.08, 0, 0)));
  const canPose = (th: number): BatPose => {
    const c = can.contact;
    let h = rotAbout(can.pose0.h, can.pivot, can.axis, th);
    let dd = rotDir(can.pose0.d, can.axis, th);
    let n = rotDir(can.pose0.n, can.axis, th);
    // follow the body as it moves
    const shift = sub(pelvis, add(v(STANCE_BACK.x, 0.93, (STANCE_BACK.z + STANCE_FRONT.z) / 2), v(0.08, 0, 0)));
    h = add(h, shift);
    void c;
    return { h, d: dd, n };
  };
  let bat: BatPose;
  let pivot: V;
  const stanceTh = -0.35;
  const backTh = -2.1;
  const lift = d ? smooth(-0.25, 0.3, t) : 0;
  if (s && st.tapT !== null) {
    bat = swingPose(s, t);
    pivot = s.pivot;
    // ease from the pose held at the tap into the shot's own arc
    const k = smooth(st.tapT, st.tapT + 0.06, t);
    if (st.prevPose && k < 1) bat = { h: lerp(st.prevPose.h, bat.h, k), d: norm(lerp(st.prevPose.d, bat.d, k)), n: norm(lerp(st.prevPose.n, bat.n, k)) };
  } else if (d && t > T - 0.06) {
    // leave it: lift the bat high out of the way (shoulder arms)
    const k = smooth(T - 0.06, T + 0.12, t);
    const held = canPose(stanceTh + (backTh - stanceTh) * lift);
    const up = { h: add(pelvis, v(-0.05, 0.85, -0.05)), d: norm(v(0.15, 1, -0.35)), n: v(1, 0, 0) };
    bat = { h: lerp(held.h, up.h, k), d: norm(lerp(held.d, up.d, k)), n: norm(lerp(held.n, up.n, k)) };
    pivot = add(can.pivot, sub(pelvis, add(v(STANCE_BACK.x, 0.93, (STANCE_BACK.z + STANCE_FRONT.z) / 2), v(0.08, 0, 0))));
  } else {
    bat = canPose(stanceTh + (backTh - stanceTh) * lift);
    pivot = add(can.pivot, sub(pelvis, add(v(STANCE_BACK.x, 0.93, (STANCE_BACK.z + STANCE_FRONT.z) / 2), v(0.08, 0, 0))));
  }

  // ---- upper body: the front (top-hand) shoulder is the swing pivot; the back shoulder turns
  // toward the bottom hand, so both hands stay on the handle and the chest opens naturally
  const sL = pivot;
  const gripR0 = add(bat.h, mul(bat.d, 0.16));
  const toR = sub(add(gripR0, mul(UP, 0.42)), sL);
  const sR = add(sL, mul(norm(v(toR.x, toR.y * 0.25, toR.z)), LIMB.shoulder * 2));
  const nk = lerp(sL, sR, 0.5);
  // pelvis hangs a spine-length below the neck, leaning toward where the feet are
  const pF = pelvis;
  const spineDir = norm(add(sub(nk, pF), v(0, 0.35, 0)));
  const pel = sub(nk, mul(spineDir, LIMB.spine));
  // hips stay between the feet and drop as the stride lengthens, so the front knee bends into the shot
  pelvis.x = pel.x * 0.55 + pF.x * 0.45;
  pelvis.z = pel.z * 0.55 + pF.z * 0.45;
  pelvis.y = Math.min(0.95, Math.max(0.7, Math.min(pel.y, pF.y)));
  const look = path ? sampleAt(path, Math.max(0, Math.min(t, T))).p : v(0, 1.2, 20);
  const head = add(nk, add(mul(UP, 0.2), mul(norm(sub(look, nk)), 0.05)));
  // ---- arms onto the handle: top (left) hand at the top, bottom (right) hand a hand-width below
  const gripL = add(bat.h, mul(bat.d, 0.05));
  const gripR = add(bat.h, mul(bat.d, 0.16));
  const elbowPole = add(v(0, -1, 0), mul(dirOf(0), -0.2));
  const armL = ik2(sL, gripL, LIMB.upper, LIMB.fore, add(elbowPole, v(0.3, 0, 0.2)));
  const armR = ik2(sR, gripR, LIMB.upper, LIMB.fore, add(elbowPole, v(-0.2, 0, -0.3)));
  // ---- legs
  // hips turn half as far as the shoulders
  const shLine = norm(v(sL.x - sR.x, 0, sL.z - sR.z));
  const hipDir = norm(lerp(v(0, 0, 1), shLine, 0.5));
  const hipL = add(pelvis, mul(hipDir, LIMB.hip));
  const hipR = sub(pelvis, mul(hipDir, LIMB.hip));
  const aL = add(ftL, v(0, 0.08 + liftL, 0));
  const aR = add(ftR, v(0, 0.08 + liftR, 0));
  const kneePole = v(1, 0.1, 0.25); // knees bend toward the off side (the way he faces)
  const legL = ik2(hipL, aL, LIMB.thigh, LIMB.shin, kneePole);
  const legR = ik2(hipR, aR, LIMB.thigh, LIMB.shin, kneePole);
  const toeOut = v(0.24, 0, 0.04);
  return {
    head,
    neck: nk,
    shL: sL,
    shR: sR,
    elL: armL.mid,
    elR: armR.mid,
    haL: gripL,
    haR: gripR,
    pelvis,
    hipL,
    hipR,
    knL: legL.mid,
    knR: legR.mid,
    ftL: legL.end,
    ftR: legR.end,
    toeL: add(legL.end, add(toeOut, v(0, -0.07, 0))),
    toeR: add(legR.end, add(rotDir(toeOut, UP, -0.3), v(0, -0.07, 0))),
    bat,
    look,
  };
}
