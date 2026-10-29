// Outfield AI: team shape, pressing, chasing loose balls, supporting runs and carrier decisions.

import { Player } from '../entities/player';
import { MatchState } from '../match/state';
import { intercept } from './predict';
import { passTo, shootBy, tackle, nearestOpponentDist, PassKind } from '../match/actions';
import { PITCH } from '../data/tuning';
import { clamp, distToSegment, V2 } from '../core/vec';

const decisionTimer = new Map<number, number>();
const dribbleDir = new Map<number, V2>();

export function shapeTarget(s: MatchState, p: Player): V2 {
  const dir = s.attackDir[p.team];
  const inPoss = s.owner?.team === p.team || (s.phase === 'restart' && s.restart?.team === p.team);
  const bx = s.ball.pos.x * dir;
  const bz = s.ball.pos.z * dir;
  const slot = p.slot;
  let x = slot.x * 0.72 + bx * 0.5 + (inPoss ? 15 : 3);
  if (p.role === 'FWD') x += inPoss ? 15 : 2; // forwards play on the last defender's shoulder
  if (p.role === 'DEF') x = Math.min(x, inPoss ? bx + 2 : bx - 4);
  if (p.role === 'MID' && !inPoss) x = Math.min(x, bx - 1);
  // Forwards stay level with the last defender (no offside rule, but it keeps the game honest)
  if (p.role === 'FWD') {
    let deepest = -99;
    for (const o of s.players) if (o.team !== p.team && o.role !== 'GK' && !o.sentOff) deepest = Math.max(deepest, o.pos.x * dir);
    // Occasionally mistime the run and drift offside
    const mistimed = Math.sin(performance.now() / 2300 + p.id * 1.9) > 0.86 ? 2.2 : 0;
    x = Math.min(x, Math.max(deepest + 0.5 + mistimed, bx));
  }
  x = clamp(x, -PITCH.halfL + 4, PITCH.halfL - 6);
  const width = inPoss ? 1.05 : 0.72;
  let z = slot.z * width + bz * (inPoss ? 0.22 : 0.38);
  z = clamp(z, -PITCH.halfW + 2, PITCH.halfW - 2);
  // Small personal drift so lines don't look robotic
  const t = performance.now() / 1000;
  x += Math.sin(t * 0.3 + p.id) * 1.2;
  z += Math.cos(t * 0.27 + p.id * 1.7) * 1.2;
  return { x: x * dir, z: z * dir };
}

function moveTo(p: Player, t: V2, sprintDist = 9, slowRadius = 1.5): void {
  const dx = t.x - p.pos.x;
  const dz = t.z - p.pos.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.25) {
    p.desired = { x: 0, z: 0 };
    p.sprint = false;
    return;
  }
  p.sprint = d > sprintDist;
  const sp = p.maxSpeed(false) * Math.min(1, d / slowRadius);
  p.desired = { x: (dx / d) * sp, z: (dz / d) * sp };
}

export function updateTeamAI(s: MatchState, team: 0 | 1, dt: number): void {
  const mates = s.players.filter((p) => p.team === team && p.role !== 'GK' && !p.sentOff);
  const loose = !s.owner;
  const oppHas = !!s.owner && s.owner.team !== team;
  const human = team === s.humanTeam && s.humanActive ? s.controlled : null;

  // Pick one chaser / presser (the human counts as the presser when he is close enough)
  let chaser: Player | null = null;
  if ((loose || oppHas) && s.phase === 'play') {
    let bestT = 99;
    for (const p of mates) {
      if (p.stun > 0) continue;
      const t = loose ? intercept(p, s.ball).t : Math.hypot(p.pos.x - s.ball.pos.x, p.pos.z - s.ball.pos.z) / 8;
      if (t < bestT) {
        bestT = t;
        chaser = p;
      }
    }
    if (loose && s.intendedReceiver?.team === team) chaser = s.intendedReceiver;
    if (human && chaser === human) chaser = null;
    else if (human && chaser) {
      const hd = Math.hypot(human.pos.x - s.ball.pos.x, human.pos.z - s.ball.pos.z);
      const cd = Math.hypot(chaser.pos.x - s.ball.pos.x, chaser.pos.z - s.ball.pos.z);
      if (oppHas && hd < cd + 6) chaser = null; // let the human press
    }
  }

  for (const p of mates) {
    if (p === human) continue;
    if (p.action === 'tackle' || p.action === 'celebrate') continue;
    if (s.phase === 'restart' || s.phase === 'kickoff') {
      if (p === s.taker || s.wall.includes(p)) {
        p.desired = { x: 0, z: 0 };
        continue;
      }
      moveTo(p, keepDistance(s, p, shapeTarget(s, p)), 14);
      continue;
    }
    if (p === s.owner) {
      carrier(s, p, dt);
      continue;
    }
    if (p === chaser) {
      if (loose) {
        const ic = intercept(p, s.ball);
        moveTo(p, ic.pt, 3, 0.4);
        p.sprint = true;
      } else if (s.owner) press(s, p, human !== null);
      continue;
    }
    moveTo(p, supportRun(s, p, shapeTarget(s, p)));
  }
}

function keepDistance(s: MatchState, p: Player, t: V2): V2 {
  if (!s.restart || s.restart.team === p.team) return t;
  const dx = t.x - s.ball.pos.x;
  const dz = t.z - s.ball.pos.z;
  const d = Math.hypot(dx, dz);
  const min = s.restart.kind === 'throwin' ? 3 : 9.2;
  if (d >= min || d < 0.01) return t;
  return { x: s.ball.pos.x + (dx / d) * min, z: s.ball.pos.z + (dz / d) * min };
}

/** Attackers drift into space ahead of the ball when their team has it. */
function supportRun(s: MatchState, p: Player, base: V2): V2 {
  if (!s.owner || s.owner.team !== p.team || p.role === 'DEF') return base;
  const dir = s.attackDir[p.team];
  const relBall = s.ball.pos.x * dir;
  if (p.role === 'FWD' && relBall > 5) {
    const phase = Math.sin(performance.now() / 1700 + p.id);
    return { x: base.x + dir * (4 + phase * 4), z: base.z * 0.85 };
  }
  return base;
}

function press(s: MatchState, p: Player, humanTeam: boolean): void {
  const o = s.owner!;
  const ownGoal = { x: -s.attackDir[p.team] * PITCH.halfL, z: 0 };
  const dx = ownGoal.x - o.pos.x;
  const dz = ownGoal.z - o.pos.z;
  const d = Math.hypot(dx, dz) || 1;
  const stand = 1.1;
  const target = { x: o.pos.x + (dx / d) * stand + o.vel.x * 0.25, z: o.pos.z + (dz / d) * stand + o.vel.z * 0.25 };
  moveTo(p, target, 4, 0.6);
  p.sprint = Math.hypot(target.x - p.pos.x, target.z - p.pos.z) > 3;
  const dist = Math.hypot(o.pos.x - p.pos.x, o.pos.z - p.pos.z);
  const diff = s.humanActive && !humanTeam ? [0.7, 1, 1.35][s.difficulty] : 1;
  const rate = humanTeam ? 0.4 : (0.45 + (p.ratings.defending - 60) / 90) * diff;
  if (dist < 1.7 && Math.random() < rate * (1 / 60)) {
    p.faceTowards(s.ball.pos.x, s.ball.pos.z);
    tackle(p);
  }
}

function carrier(s: MatchState, p: Player, dt: number): void {
  const dir = s.attackDir[p.team];
  const goal = { x: dir * PITCH.halfL, z: 0 };
  let timer = (decisionTimer.get(p.id) ?? 0) - dt;
  const pressure = nearestOpponentDist(s, p);
  if (timer <= 0 && !s.pending && !p.busy) {
    timer = 0.22 + Math.random() * 0.25;
    const relX = p.pos.x * dir;
    const dGoal = Math.hypot(goal.x - p.pos.x, goal.z - p.pos.z);
    const angleOk = Math.abs(p.pos.z) < 16 || dGoal < 16;
    // Shoot?
    if (angleOk && (dGoal < 12 || (dGoal < 26 && (pressure > 2.5 || Math.random() < 0.35) && Math.random() < 0.6))) {
      const power = clamp(0.45 + dGoal / 40 + Math.random() * 0.15, 0.5, 0.9);
      shootBy(s, p, power, null);
      decisionTimer.set(p.id, timer);
      return;
    }
    // Cross from wide areas
    if (relX > 30 && Math.abs(p.pos.z) > 18) {
      const target = bestOption(s, p, true);
      if (target && Math.random() < 0.6) {
        passTo(s, p, target.p, 'lob');
        decisionTimer.set(p.id, timer);
        return;
      }
    }
    const opt = bestOption(s, p, false);
    const passUrge = pressure < 2.2 ? 0.6 : pressure < 4 ? 0.25 : 0.06;
    if (opt && (opt.score > 9 || Math.random() < passUrge) && opt.score > -6) {
      passTo(s, p, opt.p, opt.kind);
      decisionTimer.set(p.id, timer);
      return;
    }
    dribbleDir.set(p.id, chooseDribble(s, p));
  }
  decisionTimer.set(p.id, timer);
  const d = dribbleDir.get(p.id) ?? { x: dir, z: 0 };
  p.sprint = pressure > 4 && Math.abs(p.pos.x * dir) < 40;
  const sp = p.maxSpeed(true);
  p.desired = { x: d.x * sp, z: d.z * sp };
}

function chooseDribble(s: MatchState, p: Player): V2 {
  const dir = s.attackDir[p.team];
  const goal = { x: dir * PITCH.halfL, z: 0 };
  const base = Math.atan2(goal.x - p.pos.x, goal.z - p.pos.z);
  let best = { x: dir, z: 0 };
  let bestScore = -1e9;
  for (let a = -1.3; a <= 1.3; a += 0.26) {
    const ang = base + a;
    const v = { x: Math.sin(ang), z: Math.cos(ang) };
    const ahead = { x: p.pos.x + v.x * 5, z: p.pos.z + v.z * 5 };
    let danger = 0;
    for (const o of s.players) {
      if (o.team === p.team) continue;
      const d = Math.hypot(o.pos.x - ahead.x, o.pos.z - ahead.z);
      danger += Math.max(0, 6 - d) * 2;
    }
    const edge = Math.abs(ahead.z) > PITCH.halfW - 2 ? 20 : 0;
    const score = v.x * dir * 4 - danger - edge - Math.abs(a) * 1.2;
    if (score > bestScore) {
      bestScore = score;
      best = v;
    }
  }
  return best;
}

function bestOption(s: MatchState, p: Player, crossing: boolean): { p: Player; score: number; kind: PassKind } | null {
  const dir = s.attackDir[p.team];
  let best: { p: Player; score: number; kind: PassKind } | null = null;
  for (const m of s.players) {
    if (m.team !== p.team || m === p || m.sentOff) continue;
    const d = Math.hypot(m.pos.x - p.pos.x, m.pos.z - p.pos.z);
    if (d < 5 || d > 42) continue;
    let open = 99;
    for (const o of s.players) {
      if (o.team === p.team) continue;
      open = Math.min(open, distToSegment(o.pos, p.pos, m.pos));
    }
    const markerD = Math.min(...s.players.filter((o) => o.team !== p.team).map((o) => Math.hypot(o.pos.x - m.pos.x, o.pos.z - m.pos.z)));
    const progress = (m.pos.x - p.pos.x) * dir;
    const inBox = m.pos.x * dir > PITCH.halfL - PITCH.boxDepth && Math.abs(m.pos.z) < PITCH.boxHalfWidth;
    let kind: PassKind = 'ground';
    let score = progress * 0.5 + Math.min(open, 6) * 2.0 + Math.min(markerD, 6) * 0.8 - d * 0.12 + (inBox ? 5 : 0);
    if (m.role === 'GK') score -= 14;
    if (crossing) {
      if (!inBox) continue;
      kind = 'lob';
      score = 10 + markerD;
    } else if (open < 2.3) {
      if (d > 22 && progress > 10) {
        kind = 'lob';
        score -= 3;
      } else continue;
    } else if (m.role === 'FWD' && progress > 6 && markerD > 3 && Math.random() < 0.35) {
      kind = 'through';
      score += 3;
    }
    if (!best || score > best.score) best = { p: m, score, kind };
  }
  return best;
}
