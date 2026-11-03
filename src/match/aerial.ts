// Balls in the air. Like GRF (humanoid.cpp picks an animation ahead of time from the predicted ball),
// a player commits to a header a fraction of a second early, steers to the spot and jumps so the head
// meets the ball on the clip's contact frame. Balls between knee and chest height can be killed with
// a chest / thigh trap instead of bouncing off.

import { Player } from '../entities/player';
import { MatchState } from './state';
import { AERIAL, PITCH, PLAYER } from '../data/tuning';
import { predictBall } from '../ai/predict';
import { touch } from './control';

function inOwnBox(s: MatchState, p: Player): boolean {
  const ownGoalX = -s.attackDir[p.team] * PITCH.halfL;
  return Math.abs(p.pos.x - ownGoalX) < PITCH.boxDepth && Math.abs(p.pos.z) < PITCH.boxHalfWidth;
}

const relAngleDeg = (p: Player, x: number, z: number) => {
  let a = Math.atan2(x, z) - p.facing;
  a = Math.atan2(Math.sin(a), Math.cos(a));
  return (a * 180) / Math.PI;
};

/** Where a header from p goes: at goal when in range, otherwise forward and away from the middle. */
function headerAim(s: MatchState, p: Player): { x: number; z: number; atGoal: boolean } {
  const dir = s.attackDir[p.team];
  const atGoal = p.pos.x * dir > 34 && Math.abs(p.pos.z) < 18;
  if (atGoal) return { x: dir * PITCH.halfL - p.pos.x, z: -p.pos.z, atGoal };
  return { x: dir, z: (Math.sign(p.pos.z) || 1) * 0.3, atGoal };
}

/** Commit players to headers ahead of the ball (one per team: whoever is best placed). */
export function anticipateHeaders(s: MatchState): void {
  const b = s.ball;
  if (s.owner || s.phase !== 'play' || b.onGround) return;
  const lead = AERIAL.headerLead;
  const q = predictBall(b, lead);
  if (q.y < PLAYER.headerMinHeight + 0.1 || q.y > PLAYER.headerMaxHeight) return;
  for (const team of [0, 1] as const) {
    let best: Player | null = null;
    let bestD = AERIAL.headerReach;
    for (const p of s.players) {
      if (p.team !== team || p.busy || p.lockout > 0 || p.stun > 0 || p.sentOff) continue;
      if (p.role === 'GK' && inOwnBox(s, p)) continue;
      const d = Math.hypot(q.x - (p.pos.x + p.vel.x * lead * 0.6), q.z - (p.pos.z + p.vel.z * lead * 0.6));
      if (d < bestD) {
        best = p;
        bestD = d;
      }
    }
    if (!best) continue;
    const aim = headerAim(s, best);
    best.startAction('header', lead + 0.5);
    best.cue = { cat: 'header', angle: relAngleDeg(best, aim.x, aim.z), h: q.y, contact: lead };
    best.aerialTarget = { x: q.x, z: q.z };
  }
}

/** Players committed to a header steer to the contact point. */
export function steerAerials(s: MatchState): void {
  for (const p of s.players) {
    if (p.action !== 'header' || !p.aerialTarget || !p.cue?.contact) continue;
    const left = p.cue.contact - p.actionT;
    if (left <= 0) {
      p.aerialTarget = null;
      continue;
    }
    const dx = p.aerialTarget.x - p.pos.x;
    const dz = p.aerialTarget.z - p.pos.z;
    const k = Math.min(7, Math.hypot(dx, dz) / left) / (Math.hypot(dx, dz) || 1);
    p.desired = { x: dx * k, z: dz * k };
  }
}

/** Can p head the ball now (in looseBall's sweep)? */
export function canHead(p: Player, s: MatchState, d: number): boolean {
  const b = s.ball;
  if (b.pos.y < PLAYER.headerMinHeight || b.pos.y > PLAYER.headerMaxHeight || b.vel.y > 1.5) return false;
  if (p.action === 'header') return !!p.cue && p.actionT >= (p.cue.contact ?? 0) - 0.12 && d < 1.0;
  return !p.busy && d < 0.8;
}

/** A ball between knee and chest height that p can kill (a planned pass, or not too fast). */
export function canChest(p: Player, s: MatchState, d: number): boolean {
  const b = s.ball;
  if (p.busy || d > PLAYER.controlRadius || b.pos.y < PLAYER.controlMaxBallHeight || b.pos.y > AERIAL.chestMax) return false;
  if (b.speed > AERIAL.chestMaxSpeed) return false;
  // attackers near goal would rather head it
  return s.intendedReceiver === p || b.pos.y < PLAYER.headerMinHeight || s.lastTouch === p.team;
}

export function header(s: MatchState, p: Player): void {
  if (touch(s, p)) return;
  const b = s.ball;
  const dir = s.attackDir[p.team];
  const aim = headerAim(s, p);
  const h = b.pos.y;
  p.lockout = 0.4;
  if (aim.atGoal) {
    const goalX = dir * PITCH.halfL;
    const aimZ = (Math.random() - 0.5) * 2 * (PITCH.goalHalfWidth - 0.4);
    const dx = goalX - b.pos.x;
    const dz = aimZ - b.pos.z;
    const d = Math.hypot(dx, dz);
    const sp = 12 + Math.random() * 4;
    const err = (Math.random() - 0.5) * 0.25;
    b.vel = { x: (dx / d) * sp * Math.cos(err) - (dz / d) * sp * Math.sin(err), y: -1.5 + Math.random() * 2.5, z: (dz / d) * sp * Math.cos(err) + (dx / d) * sp * Math.sin(err) };
    s.shotSide = Math.sign(dx);
    s.keeperWillSave = false;
    s.stats.shots[p.team]++;
    s.events.push({ type: 'shot' });
  } else {
    const away = Math.sign(p.pos.z) || 1;
    b.vel = { x: dir * (10 + Math.random() * 6), y: 4 + Math.random() * 3, z: away * Math.random() * 5 };
    s.shotSide = 0;
  }
  if (p.action !== 'header') {
    // not anticipated: react on the spot (the clip starts at its contact frame)
    p.startAction('header', 0.55);
    p.cue = { cat: 'header', angle: relAngleDeg(p, b.vel.x, b.vel.z), h, contact: 0 };
  }
  p.aerialTarget = null;
  b.spinY = 0;
  s.lastTouch = p.team;
  s.lastToucher = p;
  s.intendedReceiver = null;
  s.events.push({ type: 'header' });
}
