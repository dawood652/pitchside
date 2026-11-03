// Player actions that touch the ball: passes, through balls, lobs, shots, tackles, throws.

import { Player } from '../entities/player';
import { MatchState, keeperOf } from './state';
import { groundPass, lobPass, shot, chooseAim } from './kicks';
import { isOffside } from './rules';
import { KICK, PITCH, BALL } from '../data/tuning';
import { clamp, V2 } from '../core/vec';

export type PassKind = 'ground' | 'through' | 'lob';

const KICK_DUR = { pass: 0.42, shot: 0.58, lob: 0.5 };
const CONTACT = 0.3; // fraction of the kick action at which the foot meets the ball

/** Lead a moving receiver: aim where he will be when the ball arrives. */
function leadTarget(receiver: Player, from: V2, kind: PassKind, dirX: number): V2 {
  let target: V2 = { x: receiver.pos.x, z: receiver.pos.z };
  if (kind === 'through') {
    const ahead = KICK.throughLead;
    target = { x: receiver.pos.x + dirX * ahead, z: receiver.pos.z * 0.92 };
  }
  for (let i = 0; i < 2; i++) {
    const t = kind === 'lob' ? lobPass(from, target).t : groundPass(from, target).t;
    const lead = kind === 'through' ? 0.4 : 0.55;
    target = { x: target.x + receiver.vel.x * t * lead * (i === 0 ? 1 : 0.3), z: target.z + receiver.vel.z * t * lead * (i === 0 ? 1 : 0.3) };
  }
  target.x = clamp(target.x, -PITCH.halfL + 1, PITCH.halfL - 1);
  target.z = clamp(target.z, -PITCH.halfW + 1, PITCH.halfW - 1);
  return target;
}

/** power 0..1 (from the held button): harder, faster passes. Undefined = AI/assisted default. */
export function passTo(s: MatchState, p: Player, receiver: Player | null, kind: PassKind, dirFallback?: V2, power?: number): void {
  if (s.owner !== p || s.pending) return;
  const from = { x: s.ball.pos.x, z: s.ball.pos.z };
  let target: V2;
  if (receiver) target = leadTarget(receiver, from, kind, s.attackDir[p.team]);
  else {
    const d = dirFallback ?? p.forward;
    const pw = power ?? 0.4;
    const dist = kind === 'lob' ? 18 + pw * 30 : kind === 'through' ? 12 + pw * 25 : 8 + pw * 30;
    target = { x: from.x + d.x * dist, z: from.z + d.z * dist };
  }
  // Passing accuracy
  const err = (1 - p.ratings.passing / 100) * (kind === 'ground' ? 0.05 : 0.09);
  const ang = (Math.random() - 0.5) * 2 * err;
  const dx = target.x - from.x;
  const dz = target.z - from.z;
  const c = Math.cos(ang);
  const sn = Math.sin(ang);
  target = { x: from.x + dx * c - dz * sn, z: from.z + dx * sn + dz * c };

  // More power = the ball still travels fast when it arrives (driven pass); tap = softer, weighted pass
  const pw = power ?? 0.45;
  const vEnd = (kind === 'through' ? 5 : KICK.passEndSpeed) + (pw - 0.45) * 12;
  const v = kind === 'lob' ? lobPass(from, target, Math.hypot(dx, dz) > 35 ? 0.66 - (pw - 0.5) * 0.2 : 0.58 - (pw - 0.5) * 0.15) : groundPass(from, target, Math.max(2.5, vEnd));
  // Pass where you aim without spinning round first: up to ~150° off the body, a side-foot,
  // outside-of-the-foot or back-heel style pass is played (the animation is picked from the angle)
  {
    const ang = Math.atan2(target.x - from.x, target.z - from.z);
    let rel = ang - p.facing;
    rel = Math.atan2(Math.sin(rel), Math.cos(rel));
    if (Math.abs(rel) > 2.6) {
      p.faceTowards(target.x, target.z);
      rel = 0;
    } else {
      p.facing += rel * 0.35;
      rel *= 0.65;
    }
    p.kickAngle = rel;
  }
  const dur = kind === 'lob' ? KICK_DUR.lob : KICK_DUR.pass;
  p.startAction(kind === 'lob' ? 'lob' : 'pass', dur, Math.min(1, Math.hypot(v.vx, v.vz) / 28));
  s.pending = { player: p, delay: dur * CONTACT, vel: v, receiver, isShot: false, power: Math.min(1, Math.hypot(v.vx, v.vy, v.vz) / 30), target };
}

export type ShotStyle = 'normal' | 'finesse' | 'chip';

export function shootBy(s: MatchState, p: Player, power: number, lateral: number | null, style: ShotStyle = 'normal'): void {
  if (s.owner !== p || s.pending) return;
  p.kickAngle = 0;
  const dir = s.attackDir[p.team];
  const goalX = dir * PITCH.halfL;
  const from = { x: s.ball.pos.x, z: s.ball.pos.z };
  const edge = PITCH.goalHalfWidth - 0.55;
  const gk = keeperOf(s, (1 - p.team) as 0 | 1);
  let aim = chooseAim(from.z, lateral, power);
  if (lateral === null) {
    // Aim away from the keeper
    aim = { z: gk.pos.z > 0 ? -edge : edge, y: aim.y };
    if (Math.random() < 0.35) aim.y = 0.3;
  } else if (lateral === 0) aim.z = 0;
  const cpu = p.team !== s.humanTeam && s.humanActive;
  const diffErr = cpu ? [1.3, 1, 0.8][s.difficulty] : 1;
  const dist = Math.hypot(goalX - from.x, aim.z - from.z);
  const pressure = nearestOpponentDist(s, p) < 2 ? 0.25 : 0;
  let error = clamp(((1 - p.ratings.shooting / 100) * 1.6 + pressure + Math.max(0, dist - 18) * 0.012 + (power > 0.92 ? 0.25 : 0)) * diffErr, 0, 1);
  let v: { vx: number; vy: number; vz: number; spin: number };
  const isPen = s.phase === 'restart' && s.restart?.kind === 'penalty';
  const isFk = s.phase === 'restart' && s.restart?.kind === 'freekick';
  if (style === 'chip') {
    const target = { x: goalX + dir * 0.4, z: clamp(aim.z * 0.5, -2, 2) };
    const lob = lobPass(from, target, 0.9);
    const e = (Math.random() - 0.5) * error * 0.12;
    v = { vx: lob.vx * Math.cos(e) - lob.vz * Math.sin(e), vy: lob.vy, vz: lob.vz * Math.cos(e) + lob.vx * Math.sin(e), spin: 0 };
  } else if (style === 'finesse') {
    // Curled, placed shot toward the far post; over the wall on free kicks
    const far = Math.abs(from.z) > 1 ? -Math.sign(from.z) * edge : (Math.random() < 0.5 ? -1 : 1) * edge;
    const z = lateral !== null && lateral !== 0 ? Math.sign(lateral) * edge : far;
    const pw = clamp(power, 0.5, 0.78);
    error *= 0.6;
    const y = isFk ? 1.95 : 0.9;
    // Aim outside the post and let the spin bring it back
    const outside = z + Math.sign(z) * 1.25;
    v = shot(from, goalX, outside, y, pw, error);
    // Spin sign: curl back toward the goal centre
    const toward = Math.sign(z) * Math.sign(goalX - from.x);
    v.spin = toward * (isFk ? 85 : 75);
    power = pw;
  } else v = shot(from, goalX, aim.z, isPen ? 0.6 + power * 0.9 : aim.y, power, isPen ? error * 0.5 : error);
  p.faceTowards(goalX, aim.z);
  p.startAction('shot', KICK_DUR.shot, power);
  s.pending = { player: p, delay: KICK_DUR.shot * CONTACT, vel: v, receiver: null, isShot: true, power };
  s.penaltyShot = isPen;
  s.stats.shots[p.team]++;
}

/** Throw-in / keeper throw: a short arcing throw from the hands. */
export function throwTo(s: MatchState, p: Player, target: V2, keeper: boolean): void {
  if (s.owner !== p || s.pending) return;
  const from = { x: s.ball.pos.x, z: s.ball.pos.z };
  const dx = target.x - from.x;
  const dz = target.z - from.z;
  const d = Math.max(1, Math.hypot(dx, dz));
  const h = Math.min(keeper ? 22 : 16, 4 + d * 0.62);
  const vy = keeper ? 2.5 : 3.2;
  p.faceTowards(target.x, target.z);
  p.startAction(keeper ? 'gkthrow' : 'throwin', 0.6);
  s.pending = { player: p, delay: 0.32, vel: { vx: (dx / d) * h, vy, vz: (dz / d) * h, spin: 0 }, receiver: null, isShot: false, power: 0.3 };
}

/** Start a sliding/standing tackle attempt. Resolution happens in control.ts. */
/** Standing tackle (a poke with the foot) or slide tackle (longer reach, longer recovery). */
export function tackle(p: Player, slide = true): void {
  if (p.busy || p.tackleCooldown > 0 || p.stun > 0) return;
  p.slide = slide;
  p.startAction('tackle', slide ? 0.95 : 0.7);
  p.tackleCooldown = slide ? 1.1 : 0.8;
  const f = p.forward;
  const v = slide ? 7.5 : 4.5;
  p.vel = { x: f.x * v, z: f.z * v };
}

export function nearestOpponentDist(s: MatchState, p: Player): number {
  let best = 99;
  for (const o of s.players) if (o.team !== p.team && !o.sentOff) best = Math.min(best, Math.hypot(o.pos.x - p.pos.x, o.pos.z - p.pos.z));
  return best;
}

/** Release the ball when the kicking foot makes contact. */
export function updatePendingKick(s: MatchState, dt: number): void {
  const k = s.pending;
  if (!k) return;
  if (s.owner !== k.player) {
    s.pending = null;
    return;
  }
  k.delay -= dt;
  if (k.delay > 0) return;
  const p = k.player;
  s.owner = null;
  p.holdingBall = false;
  if (s.ball.pos.y < BALL.radius + 0.01) s.ball.pos.y = BALL.radius + 0.01;
  if (k.target) {
    // The ball moved toward the foot during the wind-up: keep the pass aimed at its target
    const h = Math.hypot(k.vel.vx, k.vel.vz);
    const dx = k.target.x - s.ball.pos.x;
    const dz = k.target.z - s.ball.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    k.vel = { ...k.vel, vx: (dx / d) * h, vz: (dz / d) * h };
  }
  s.ball.kick(k.vel.vx, k.vel.vy, k.vel.vz, k.vel.spin);
  p.lockout = KICK.touchLockout;
  s.lastTouch = p.team;
  s.lastToucher = p;
  s.intendedReceiver = k.receiver;
  // Offside is judged when the ball is played
  const exempt = s.phase === 'restart' && (s.restart?.kind === 'throwin' || s.restart?.kind === 'corner' || s.restart?.kind === 'goalkick');
  s.offsideCandidate = null;
  if (k.receiver && !k.isShot && !exempt) {
    const opp = s.players.filter((o) => o.team !== p.team && !o.sentOff).map((o) => o.pos.x);
    if (isOffside(k.receiver.pos.x, s.ball.pos.x, opp, s.attackDir[p.team])) s.offsideCandidate = k.receiver;
  }
  s.shotSide = k.isShot ? Math.sign(k.vel.vx) : 0;
  s.keeperWillSave = false;
  s.pending = null;
  s.events.push({ type: 'kick', power: k.power });
  if (k.isShot) s.events.push({ type: 'shot' });
  if (k.receiver && k.receiver.team === s.humanTeam && k.receiver.role !== 'GK') s.controlled = k.receiver;
}
