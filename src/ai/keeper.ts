// Goalkeeper AI: positioning, shot reaction (dive / catch), claiming loose balls, distribution.

import { Player } from '../entities/player';
import { MatchState } from '../match/state';
import { intercept } from './predict';
import { passTo, throwTo } from '../match/actions';
import { BALL, KEEPER, PITCH } from '../data/tuning';
import { clamp } from '../core/vec';

const reactTimer = new Map<number, number>();
const holdTimer = new Map<number, number>();

export function updateKeeper(s: MatchState, gk: Player, dt: number): void {
  const dir = s.attackDir[gk.team];
  const goalX = -dir * PITCH.halfL;
  const b = s.ball;

  if (s.owner === gk) {
    gk.desired = { x: 0, z: 0 };
    if (s.phase !== 'play' && !(s.phase === 'restart' && s.taker === gk)) return;
    const t = (holdTimer.get(gk.id) ?? 0) + dt;
    holdTimer.set(gk.id, t);
    if (t > (s.phase === 'restart' ? 1.4 : KEEPER.holdTime) && !gk.busy) {
      holdTimer.set(gk.id, 0);
      distribute(s, gk);
    }
    return;
  }
  holdTimer.set(gk.id, 0);
  if (gk.action === 'dive') {
    gk.desired = { x: gk.vel.x, z: gk.vel.z };
    return;
  }
  if (s.phase !== 'play') {
    moveTo(gk, { x: goalX + dir * 1.2, z: 0 }, 1);
    gk.faceTowards(0, 0);
    return;
  }

  // Shot coming toward my goal?
  const incoming = s.shotSide === -dir && b.vel.x * -dir > 4;
  if (incoming) {
    let rt = (reactTimer.get(gk.id) ?? 0) + dt;
    reactTimer.set(gk.id, rt);
    const cpu = s.humanActive && gk.team !== s.humanTeam;
    const reaction = s.penaltyShot ? 0.04 : KEEPER.reaction + (90 - gk.ratings.keeping) * 0.004 - (cpu ? (s.difficulty - 1) * 0.04 : 0);
    if (rt >= reaction && gk.action === 'none') react(s, gk, goalX);
    else if (rt < reaction) gk.desired = { x: 0, z: 0 };
    return;
  }
  reactTimer.set(gk.id, 0);

  // Claim loose balls in the box if I get there first
  const inBox = Math.abs(b.pos.x - goalX) < PITCH.boxDepth && Math.abs(b.pos.z) < PITCH.boxHalfWidth;
  if (!s.owner && inBox) {
    const mine = intercept(gk, b, 2.4);
    let theirs = 99;
    for (const o of s.players) if (o.team !== gk.team) theirs = Math.min(theirs, intercept(o, b).t);
    if (mine.t < theirs - 0.1) {
      moveTo(gk, mine.pt, 0.3);
      gk.sprint = true;
      return;
    }
  }

  // Positioning on the line between ball and goal centre
  const dx = b.pos.x - goalX;
  const dz = b.pos.z;
  const d = Math.hypot(dx, dz) || 1;
  const off = clamp(d * 0.11, 0.8, 5.5);
  const tx = goalX + (dx / d) * off;
  const tz = clamp((dz / d) * off, -PITCH.goalHalfWidth - 0.6, PITCH.goalHalfWidth + 0.6);
  moveTo(gk, { x: tx, z: tz }, 0.5);
  if (gk.speed < 2.5) gk.faceTowards(b.pos.x, b.pos.z);
}

function react(s: MatchState, gk: Player, goalX: number): void {
  const b = s.ball;
  const t = (gk.pos.x - b.pos.x) / b.vel.x;
  if (t <= 0 || t > 2) return;
  const pz = b.pos.z + b.vel.z * t;
  const py = Math.max(BALL.radius, b.pos.y + b.vel.y * t - 0.5 * BALL.gravity * t * t);
  // Is it even on target?
  const onTarget = Math.abs(pz) < PITCH.goalHalfWidth + 0.2 && py < PITCH.goalHeight + 0.2;
  const lateral = pz - gk.pos.z;
  const skill = gk.ratings.keeping / 100;
  const reach = KEEPER.reach + KEEPER.diveRange * skill * clamp(t / 0.5, 0.35, 1);
  const speed = b.speed;
  const reachable = Math.abs(lateral) <= reach;
  const saveP = clamp(0.35 + skill * 0.6 - Math.max(0, speed - 18) * 0.03 - (Math.abs(lateral) / reach) * 0.35, 0.05, 0.95);
  let willSave = onTarget && reachable && Math.random() < saveP;
  if (s.penaltyShot) {
    // Keeper guesses a side; the human chooses when defending
    const humanKeeper = s.humanActive && gk.team === s.humanTeam;
    const r = Math.random();
    const guess = humanKeeper ? Math.sign(Math.round(s.diveHint)) : r < 0.42 ? -1 : r < 0.84 ? 1 : 0;
    const shotSide = Math.abs(pz) < 1 ? 0 : Math.sign(pz);
    willSave = onTarget && guess === shotSide && Math.random() < (shotSide === 0 ? 0.9 : Math.abs(pz) > 2.6 ? 0.35 : 0.72);
    s.keeperWillSave = willSave || !onTarget;
    if (guess === 0) {
      gk.startAction('catch', 0.6);
      gk.vel = { x: 0, z: 0 };
      return;
    }
    const leftZp = -Math.sin(gk.facing);
    gk.diveDir = Math.sign(guess * leftZp) || 1;
    gk.diveHigh = clamp((py - 0.4) / 1.8, 0, 1);
    gk.startAction('dive', 1.5);
    const target = willSave ? lateral : guess * 2.4 - gk.pos.z;
    gk.vel = { x: 0, z: clamp(target / Math.max(0.3, t), -7.5, 7.5) };
    gk.desired = { x: gk.vel.x, z: gk.vel.z };
    return;
  }
  s.keeperWillSave = willSave || !onTarget;
  if (Math.abs(lateral) < 0.7 && py < 1.8) {
    gk.startAction('catch', 0.6);
    gk.vel = { x: 0, z: lateral / Math.max(0.2, t) };
    return;
  }
  // Dive: direction in the keeper's local frame
  // Local left (+x local) in world space is (cos f, -sin f); its z component decides the side.
  const leftZ = -Math.sin(gk.facing);
  gk.diveDir = Math.sign(lateral * leftZ) || 1;
  gk.diveHigh = clamp((py - 0.4) / 1.8, 0, 1);
  const reachLat = willSave ? lateral : lateral * (0.55 + Math.random() * 0.2);
  const tt = Math.max(0.28, t);
  gk.startAction('dive', 1.5);
  gk.vel = { x: 0, z: clamp(reachLat / tt, -7.5, 7.5) };
  gk.desired = { x: gk.vel.x, z: gk.vel.z };
  void goalX;
}

function distribute(s: MatchState, gk: Player): void {
  const dir = s.attackDir[gk.team];
  const mates = s.players.filter((p) => p.team === gk.team && p !== gk && !p.sentOff);
  // Short to an open defender, or long to a midfielder/forward
  let best: Player | null = null;
  let bestScore = -1e9;
  const long = Math.random() < 0.45;
  for (const m of mates) {
    const d = Math.hypot(m.pos.x - gk.pos.x, m.pos.z - gk.pos.z);
    let marker = 99;
    for (const o of s.players) if (o.team !== gk.team) marker = Math.min(marker, Math.hypot(o.pos.x - m.pos.x, o.pos.z - m.pos.z));
    const prog = (m.pos.x - gk.pos.x) * dir;
    const score = long ? prog * 0.5 + marker - (d > 60 ? 50 : 0) : marker * 2 - d * 0.3 - (m.role === 'FWD' ? 20 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  if (!best) return;
  const d = Math.hypot(best.pos.x - gk.pos.x, best.pos.z - gk.pos.z);
  if (gk.holdingBall && d < 28) {
    throwTo(s, gk, { x: best.pos.x + best.vel.x * 0.8, z: best.pos.z + best.vel.z * 0.8 }, true);
    return;
  }
  // Drop the ball and kick it long
  gk.holdingBall = false;
  s.ball.pos.y = BALL.radius;
  passTo(s, gk, best, d > 25 ? 'lob' : 'ground');
}

function moveTo(p: Player, t: { x: number; z: number }, slow: number): void {
  const dx = t.x - p.pos.x;
  const dz = t.z - p.pos.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.15) {
    p.desired = { x: 0, z: 0 };
    return;
  }
  const sp = p.maxSpeed(false) * Math.min(1, d / Math.max(slow, 0.1));
  p.sprint = d > 6;
  p.desired = { x: (dx / d) * sp, z: (dz / d) * sp };
}
