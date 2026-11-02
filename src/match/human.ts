// Human player control: movement, passing, shooting (charged), tackling, switching.

import { Input } from '../core/input';
import { Player } from '../entities/player';
import { MatchState } from './state';
import { passTo, shootBy, tackle, throwTo, PassKind } from './actions';
import { intercept } from '../ai/predict';
import { KICK, PITCH } from '../data/tuning';
import { angleDiff, V2 } from '../core/vec';

let charging = false;
let chargeT = 0;

/**
 * Screen → world, relative to the camera: with the broadcast view (viewYaw 0) screen right = +x and
 * screen up = -z; other cameras (end to end, pro) rotate that by their yaw.
 */
function toWorld(s: MatchState, m: { x: number; y: number }): V2 {
  const c = Math.cos(s.viewYaw);
  const sn = Math.sin(s.viewYaw);
  const x = m.x;
  const z = -m.y;
  return { x: x * c + z * sn, z: -x * sn + z * c };
}
function worldMove(s: MatchState, input: Input): V2 {
  return toWorld(s, input.move());
}

export function pickReceiver(s: MatchState, p: Player, dir: V2): Player | null {
  const aim = Math.atan2(dir.x, dir.z);
  let best: Player | null = null;
  let bestCost = 1e9;
  for (const m of s.players) {
    if (m.team !== p.team || m === p || m.sentOff) continue;
    const dx = m.pos.x - p.pos.x;
    const dz = m.pos.z - p.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 3 || d > 55) continue;
    const da = Math.abs(angleDiff(aim, Math.atan2(dx, dz)));
    if (da > 0.9) continue;
    // Opponents near the passing line make a teammate a worse choice (the pass would be cut out)
    let block = 0;
    for (const o of s.players) {
      if (o.team === p.team || o.sentOff) continue;
      const ox = o.pos.x - p.pos.x;
      const oz = o.pos.z - p.pos.z;
      const along = (ox * dx + oz * dz) / d;
      if (along < 1 || along > d - 1) continue;
      const off = Math.abs(ox * dz - oz * dx) / d;
      if (off < 2.2) block += (2.2 - off) / 2.2;
    }
    const cost = da * 34 + d * 0.22 + block * 9 + (m.role === 'GK' ? 25 : 0);
    if (cost < bestCost) {
      bestCost = cost;
      best = m;
    }
  }
  return best;
}

export function updateHuman(s: MatchState, input: Input, dt: number): void {
  const p = s.controlled;
  const mv = worldMove(s, input);
  if (input.rightStick) s.switchDir = toWorld(s, input.rightStick);
  const hasMove = Math.hypot(mv.x, mv.z) > 0.1;
  const dir = hasMove ? mv : p.forward;
  const mag = Math.hypot(mv.x, mv.z);
  // Sprint is the default at full tilt (FC Mobile / most players' preference); R2 / Shift also sprints
  p.sprint = input.held('sprint') || (s.assist.autoSprint && mag > 0.75);
  s.humanMove = hasMove ? { x: mv.x / mag, z: mv.z / mag } : null;
  s.diveHint = Math.abs(mv.z) > 0.3 ? Math.sign(mv.z) : 0;

  // Restart taker: aim and play the ball
  if ((s.phase === 'restart' || s.phase === 'kickoff') && s.taker === p) {
    p.desired = { x: 0, z: 0 };
    const setPiece = s.phase === 'restart' && (s.restart?.kind === 'freekick' || s.restart?.kind === 'penalty');
    if (hasMove && s.phase === 'restart' && !setPiece) p.facing = Math.atan2(mv.x, mv.z);
    if (s.phaseT < 0.5) return;
    if (setPiece) {
      // Free kick / penalty: hold K for power, W/S picks the side; O = curled free kick
      if (input.pressed('finesse')) {
        shootBy(s, p, 0.7, Math.abs(mv.z) > 0.3 ? mv.z : null, 'finesse');
        return;
      }
      if (input.pressed('shoot')) {
        charging = true;
        chargeT = 0;
      }
      if (charging) {
        chargeT += dt;
        s.shotCharge = Math.min(1, chargeT / KICK.chargeTime);
        if (input.released('shoot') || chargeT > KICK.chargeTime * 1.3) {
          charging = false;
          s.shotCharge = -1;
          const lateral = Math.abs(mv.z) > 0.3 ? mv.z : s.restart?.kind === 'penalty' ? 0 : null;
          shootBy(s, p, Math.min(1, chargeT / KICK.chargeTime), lateral, s.restart?.kind === 'freekick' ? 'finesse' : 'normal');
        }
        return;
      }
      if (s.restart?.kind === 'penalty') return;
    }
    const kind: PassKind | null = input.pressed('pass') ? 'ground' : input.pressed('through') ? 'through' : input.pressed('lob') ? 'lob' : input.pressed('shoot') ? 'lob' : null;
    if (kind) {
      const r = pickReceiver(s, p, dir);
      if (p.holdingBall) throwTo(s, p, r ? r.pos : { x: p.pos.x + dir.x * 12, z: p.pos.z + dir.z * 12 }, false);
      else passTo(s, p, r, s.restart?.kind === 'corner' && kind === 'ground' ? 'lob' : kind, dir);
    }
    return;
  }
  if (s.phase !== 'play') {
    if (s.phase !== 'restart' && s.phase !== 'kickoff') p.desired = { x: 0, z: 0 };
    else p.desired = { x: mv.x * p.maxSpeed(false), z: mv.z * p.maxSpeed(false) };
    return;
  }

  if (input.pressed('switch')) switchPlayer(s);
  if (s.switchDir && s.owner !== p) {
    switchToward(s, s.switchDir);
    s.switchDir = null;
    return;
  }
  s.switchDir = null;

  const own = s.owner === p;
  if (own && !p.busy) {
    const sp = p.maxSpeed(true);
    p.desired = hasMove ? { x: mv.x * sp, z: mv.z * sp } : { x: 0, z: 0 };
    if (input.pressed('shoot')) {
      charging = true;
      chargeT = 0;
    }
    if (charging) {
      chargeT += dt;
      s.shotCharge = Math.min(1, chargeT / KICK.chargeTime);
      if (input.released('shoot') || chargeT > KICK.chargeTime * 1.3) {
        charging = false;
        s.shotCharge = -1;
        const goalX = s.attackDir[p.team] * PITCH.halfL;
        const toGoal = Math.hypot(goalX - p.pos.x, p.pos.z) < 40;
        if (toGoal) shootBy(s, p, Math.min(1, chargeT / KICK.chargeTime), hasMove && Math.abs(mv.z) > 0.3 ? mv.z : null);
        else passTo(s, p, null, 'lob', dir);
      }
      return;
    }
    const goalX = s.attackDir[p.team] * PITCH.halfL;
    const dGoal = Math.hypot(goalX - p.pos.x, p.pos.z);
    const facingGoal = (goalX - p.pos.x) * (hasMove ? mv.x : p.forward.x) > 0;
    if (s.tapPass && s.tapPass.team === p.team && s.tapPass !== p) {
      const r = s.tapPass;
      s.tapPass = null;
      passTo(s, p, r, 'ground', { x: r.pos.x - p.pos.x, z: r.pos.z - p.pos.z });
      return;
    }
    if (input.pressed('finesse') && dGoal < 34) shootBy(s, p, 0.65, hasMove && Math.abs(mv.z) > 0.3 ? mv.z : null, 'finesse');
    else if (input.pressed('pass')) passTo(s, p, pickReceiver(s, p, dir), 'ground', dir);
    else if (input.pressed('through')) passTo(s, p, pickReceiver(s, p, dir), 'through', dir);
    else if (input.pressed('lob')) {
      // Near goal and facing it, L chips the keeper
      if (dGoal < 26 && facingGoal && Math.abs(p.pos.z) < 14) shootBy(s, p, 0.6, null, 'chip');
      else passTo(s, p, pickReceiver(s, p, dir), 'lob', dir);
    }
    return;
  }
  charging = false;
  s.shotCharge = -1;
  s.tapPass = null;
  if (p.busy) return;

  // Off the ball
  const opp = s.owner && s.owner.team !== p.team ? s.owner : null;
  let sp = p.maxSpeed(false);
  let target: V2 | null = null;
  if (!s.owner && s.intendedReceiver === p && !hasMove) {
    // Assisted receive: run onto the pass
    target = intercept(p, s.ball).pt;
  } else if (!s.owner && s.assist.collect && s.ball.pos.y < 2.5) {
    // FC-style assisted collection: a loose ball within reach pulls the player onto it,
    // unless the stick points clearly away from it
    const ic = intercept(p, s.ball).pt;
    const dx = ic.x - p.pos.x;
    const dz = ic.z - p.pos.z;
    const d = Math.hypot(dx, dz);
    const agree = !hasMove || Math.abs(angleDiff(Math.atan2(mv.x, mv.z), Math.atan2(dx, dz))) < 1.3;
    if (d < 14 && agree) {
      target = ic;
      // Contested ball: sprint for it
      for (const o of s.players) if (o.team !== p.team && Math.hypot(o.pos.x - ic.x, o.pos.z - ic.z) < d + 3) p.sprint = true;
      sp = p.maxSpeed(p.sprint);
    }
  } else if (opp && input.held('pass')) {
    // Contain (hold PASS): close down to a goal-side spot in front of the carrier and jockey
    const ox = -s.attackDir[p.team] * PITCH.halfL;
    const gx = ox - opp.pos.x;
    const gz = -opp.pos.z;
    const gd = Math.hypot(gx, gz) || 1;
    const lead = 0.4;
    target = { x: opp.pos.x + opp.vel.x * lead + (gx / gd) * 1.7, z: opp.pos.z + opp.vel.z * lead + (gz / gd) * 1.7 };
    p.sprint = Math.hypot(target.x - p.pos.x, target.z - p.pos.z) > 4;
    sp = p.maxSpeed(p.sprint);
  }
  if (target) {
    const dx = target.x - p.pos.x;
    const dz = target.z - p.pos.z;
    const d = Math.hypot(dx, dz);
    p.desired = d > 0.3 ? { x: (dx / d) * sp * Math.min(1, d / 0.8), z: (dz / d) * sp * Math.min(1, d / 0.8) } : { x: 0, z: 0 };
    if (opp && d < 3) p.faceTowards(opp.pos.x, opp.pos.z);
  } else if (hasMove) p.desired = { x: mv.x * sp, z: mv.z * sp };
  else p.desired = { x: 0, z: 0 };

  // Tackle: PASS when close (holding it from further away = contain), SHOOT lunges from a bit further
  if (opp) {
    const d = Math.hypot(opp.pos.x - p.pos.x, opp.pos.z - p.pos.z);
    // FC layout: hold Cross = contain, Circle = standing tackle, Square = slide; tapping Cross
    // right next to the carrier also tackles (touch screens have fewer buttons)
    const stand = (input.pressed('lob') && d < 2.6) || (input.pressed('pass') && d < 1.6);
    if (stand || (input.pressed('shoot') && d < 3.2)) {
      p.faceTowards(s.ball.pos.x, s.ball.pos.z);
      tackle(p, !stand);
    }
  }
}

/** Right-stick switch: the teammate furthest along the flicked direction from the controlled player. */
export function switchToward(s: MatchState, dir: V2): void {
  const c = s.controlled;
  const aim = Math.atan2(dir.x, dir.z);
  let best: Player | null = null;
  let bestCost = 1e9;
  for (const m of s.players) {
    if (m.team !== s.humanTeam || m === c || m.role === 'GK' || m.sentOff) continue;
    const dx = m.pos.x - c.pos.x;
    const dz = m.pos.z - c.pos.z;
    const da = Math.abs(angleDiff(aim, Math.atan2(dx, dz)));
    if (da > 0.8) continue;
    const cost = da * 20 + Math.hypot(dx, dz) * 0.3;
    if (cost < bestCost) {
      bestCost = cost;
      best = m;
    }
  }
  if (best) {
    s.controlled = best;
    s.lastSwitchT = s.time;
  }
}

/** The teammate the switch button picks: best placed to win the ball (FC "ball-relative" switching). */
export function nextSwitch(s: MatchState): Player | null {
  let best: Player | null = null;
  let bestCost = 1e9;
  const ownGoal = -s.attackDir[s.humanTeam] * PITCH.halfL;
  for (const m of s.players) {
    if (m.team !== s.humanTeam || m.role === 'GK' || m === s.controlled || m.sentOff) continue;
    const ic = intercept(m, s.ball);
    // Prefer players who are goal-side of the ball
    const goalSide = (m.pos.x - s.ball.pos.x) * Math.sign(ownGoal - s.ball.pos.x) > 0 ? -2 : 2;
    const cost = ic.t * 6 + goalSide;
    if (cost < bestCost) {
      bestCost = cost;
      best = m;
    }
  }
  return best;
}

export function switchPlayer(s: MatchState): void {
  const best = s.nextSwitch ?? nextSwitch(s);
  if (best) {
    s.controlled = best;
    s.lastSwitchT = s.time;
  }
}

/** Auto-switching (Auto / Loose balls / Manual) with hysteresis so control doesn't flick around. */
export function autoSwitch(s: MatchState): void {
  s.nextSwitch = nextSwitch(s);
  const mode = s.assist.autoSwitch;
  if (mode === 'manual') return;
  if (s.owner?.team === s.humanTeam) return;
  if (s.intendedReceiver?.team === s.humanTeam) return;
  if (s.time - s.lastSwitchT < 2.0) return;
  if (mode === 'loose' && s.owner) return;
  if (s.humanMove) return; // never take the player away while the stick is being used
  const c = s.controlled;
  const best = s.nextSwitch;
  if (!best) return;
  const tc = intercept(c, s.ball).t;
  const tb = intercept(best, s.ball).t;
  if (tc > 2.2 && tb < tc * 0.5) {
    s.controlled = best;
    s.lastSwitchT = s.time;
  }
}
