// Ball control: dribbling, first touch, headers, tackle resolution, keeper saves, player spacing.

import { Player } from '../entities/player';
import { MatchState } from './state';
import { BALL, PITCH, PLAYER } from '../data/tuning';
import { angleDiff, clamp } from '../core/vec';
import { judgeTackle, foulRestart } from './rules';

/** Any touch: calls offside if the flagged receiver touches it, otherwise clears the flag. */
export function touch(s: MatchState, p: Player): boolean {
  const c = s.offsideCandidate;
  if (!c) return false;
  s.offsideCandidate = null;
  if (p !== c || s.phase !== 'play') return false;
  const def = (1 - p.team) as 0 | 1;
  s.pendingFoul = { restart: { kind: 'indirect', team: def, x: p.pos.x, z: Math.max(-33, Math.min(33, p.pos.z)) } };
  s.events.push({ type: 'offside', team: p.team });
  return true;
}

export function setOwner(s: MatchState, p: Player): void {
  touch(s, p);
  s.owner = p;
  s.lastTouch = p.team;
  s.lastToucher = p;
  s.intendedReceiver = null;
  s.shotSide = 0;
  if (p.team === s.humanTeam && p.role !== 'GK') s.controlled = p;
}

function inOwnBox(s: MatchState, p: Player): boolean {
  const ownGoalX = -s.attackDir[p.team] * PITCH.halfL;
  return Math.abs(p.pos.x - ownGoalX) < PITCH.boxDepth && Math.abs(p.pos.z) < PITCH.boxHalfWidth;
}

/**
 * Dribbling with real touches (after FC's touch-based dribbling and the PhysicsFC findings):
 * the ball is a free object, the carrier re-touches it on a rhythm — short touches at jog,
 * longer knock-ons at sprint, a slower "effort" touch on sharp turns. Lose the ball if it gets away.
 */
export function carryBall(s: MatchState, dt: number): void {
  const o = s.owner!;
  const b = s.ball;
  if (o.holdingBall) {
    const f = o.forward;
    const overhead = o.role !== 'GK';
    b.pos.x = o.pos.x + f.x * (overhead ? 0.05 : 0.32);
    b.pos.z = o.pos.z + f.z * (overhead ? 0.05 : 0.32);
    b.pos.y = overhead ? 2.25 : 1.15;
    b.vel = { x: 0, y: 0, z: 0 };
    return;
  }
  // Winding up a pass/shot: the foot meets the ball, so draw it to the kicking foot
  if (s.pending && s.pending.player === o) {
    const f = o.forward;
    const tx = o.pos.x + f.x * 0.42 - f.z * 0.12;
    const tz = o.pos.z + f.z * 0.42 + f.x * 0.12;
    const k = 1 - Math.exp(-dt * 14);
    b.pos.x += (tx - b.pos.x) * k;
    b.pos.z += (tz - b.pos.z) * k;
    b.pos.y = BALL.radius;
    b.vel = { x: o.vel.x, y: 0, z: o.vel.z };
    return;
  }
  b.step(dt);
  o.touchTimer -= dt;
  const sp = o.speed;
  const dl = Math.hypot(o.desired.x, o.desired.z);
  const dir = dl > 0.5 ? { x: o.desired.x / dl, z: o.desired.z / dl } : o.forward;
  const foot = { x: o.pos.x + o.forward.x * 0.3, z: o.pos.z + o.forward.z * 0.3 };
  const dBall = Math.hypot(b.pos.x - foot.x, b.pos.z - foot.z);
  // Ball got away: it's loose now (anyone can win it, including the dribbler)
  if (dBall > 2.3 || b.pos.y > 1.2) {
    s.owner = null;
    return;
  }
  const skill = (o.ratings.dribbling - 60) / 35; // 0..1
  if (sp < 1.2 && dl < 0.5) {
    // Close control: keep the ball under the body
    const tx = o.pos.x + o.forward.x * 0.42;
    const tz = o.pos.z + o.forward.z * 0.42;
    b.vel.x += ((tx - b.pos.x) * 6 - b.vel.x) * Math.min(1, dt * 8);
    b.vel.z += ((tz - b.pos.z) * 6 - b.vel.z) * Math.min(1, dt * 8);
    return;
  }
  const bsp = Math.hypot(b.vel.x, b.vel.z);
  const ballDir = bsp > 0.5 ? Math.atan2(b.vel.x, b.vel.z) : o.facing;
  const turn = Math.abs(angleDiff(ballDir, Math.atan2(dir.x, dir.z)));
  // A sharp change of direction lets the player reach for the ball early (drag-back / cut)
  const cut = turn > 1.6 && dBall < 1.6 && o.touchTimer < 0.32;
  if (!cut && (o.touchTimer > 0 || dBall > 1.05)) return;
  // Touch: aim the ball where the player will be at the next touch, plus a lead that grows with speed
  const sprinting = sp > PLAYER.jogSpeed + 0.4;
  let interval = (sprinting ? 0.52 : sp > 2.5 ? 0.34 : 0.26) * (1.12 - 0.22 * skill);
  let lead = sprinting ? 0.85 + (sp - 5.6) * 0.1 : 0.5 + sp * 0.05;
  if (turn > 1.6) {
    // Effort touch on a drastic turn: slower, shorter, and you bleed speed
    lead = 0.45;
    interval *= 1.25;
    o.vel = { x: o.vel.x * 0.72, z: o.vel.z * 0.72 };
  }
  const T = interval;
  // Distance the player will cover along the new direction before the next touch
  const along = Math.max(0, o.vel.x * dir.x + o.vel.z * dir.z);
  const travel = turn > 1.6 ? along * T * 0.5 : Math.max(along, Math.min(sp, 2)) * T;
  const px = o.pos.x + dir.x * (travel + lead);
  const pz = o.pos.z + dir.z * (travel + lead);
  let vx = ((px - b.pos.x) / T) * 1.06;
  let vz = ((pz - b.pos.z) / T) * 1.06;
  const v = Math.hypot(vx, vz);
  if (v > 13) {
    vx *= 13 / v;
    vz *= 13 / v;
  }
  b.vel = { x: vx, y: 0, z: vz };
  b.pos.y = BALL.radius;
  b.spinY = 0;
  o.touchTimer = T;
}

/** First touch when a player takes a moving ball (FC 26: speed, height, angle, pressure, ball control). */
export function firstTouch(s: MatchState, p: Player, wantDir: { x: number; z: number } | null): void {
  const b = s.ball;
  const rel = Math.hypot(b.vel.x - p.vel.x, b.vel.z - p.vel.z);
  let pressure = 99;
  for (const o of s.players) if (o.team !== p.team && !o.sentOff) pressure = Math.min(pressure, Math.hypot(o.pos.x - p.pos.x, o.pos.z - p.pos.z));
  const skill = (p.ratings.dribbling - 60) / 35;
  const dir = wantDir ?? p.forward;
  const exitTurn = Math.abs(angleDiff(Math.atan2(b.vel.x, b.vel.z) + Math.PI, Math.atan2(dir.x, dir.z)));
  const difficulty = rel / 24 + Math.max(0, b.pos.y - 0.5) * 0.5 + (pressure < 1.6 ? 0.2 : 0) + (exitTurn < 1 ? 0.12 : 0) - skill * 0.35;
  const heavy = Math.random() < Math.max(0, Math.min(0.6, difficulty - 0.38));
  if (heavy) {
    // Heavy touch: the ball bounces off and runs loose
    const sp = 3.5 + Math.random() * 3.5;
    const a = Math.atan2(dir.x, dir.z) + (Math.random() - 0.5) * 1.4;
    b.vel = { x: Math.sin(a) * sp, y: 0.4, z: Math.cos(a) * sp };
    p.touchTimer = 0.4;
    return;
  }
  // Clean touch into the direction asked for
  const tx = p.pos.x + dir.x * (0.55 + p.speed * 0.15);
  const tz = p.pos.z + dir.z * (0.55 + p.speed * 0.15);
  b.vel = { x: (tx - b.pos.x) / 0.28, y: 0, z: (tz - b.pos.z) / 0.28 };
  const v = Math.hypot(b.vel.x, b.vel.z);
  if (v > 9) {
    b.vel.x *= 9 / v;
    b.vel.z *= 9 / v;
  }
  b.pos.y = BALL.radius;
  p.touchTimer = 0.26;
}

/** An opponent can nick the ball while it's between the dribbler's touches. */
export function stealLooseTouch(s: MatchState): void {
  const o = s.owner;
  if (!o || o.holdingBall || s.pending) return;
  const b = s.ball;
  const own = Math.hypot(b.pos.x - o.pos.x, b.pos.z - o.pos.z);
  if (own < 0.7) return;
  for (const p of s.players) {
    if (p.team === o.team || p.sentOff || p.stun > 0 || p.lockout > 0 || (p.busy && p.action !== 'tackle')) continue;
    const d = Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z);
    if (d < 0.7 && d < own - 0.15) {
      setOwner(s, p);
      firstTouch(s, p, null);
      s.events.push({ type: 'tackle', won: true });
      return;
    }
  }
}

/** Free ball: who controls it, headers, keeper saves. */
export function looseBall(s: MatchState): void {
  const b = s.ball;
  let best: Player | null = null;
  let bestD = 99;
  for (const p of s.players) {
    if (p.lockout > 0 || p.stun > 0 || p.sentOff) continue;
    if (p.busy && p.action !== 'tackle' && p.action !== 'dive' && p.action !== 'catch') continue;
    const d = Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z);
    const isGk = p.role === 'GK' && inOwnBox(s, p);
    const radius = isGk ? 1.15 : PLAYER.controlRadius;
    const maxH = isGk ? 2.5 : PLAYER.controlMaxBallHeight;
    if (d < radius && b.pos.y < maxH && d < bestD) {
      best = p;
      bestD = d;
    }
    // Headers
    if (!isGk && !p.busy && d < 0.8 && b.pos.y > PLAYER.headerMinHeight && b.pos.y < PLAYER.headerMaxHeight && b.vel.y < 1.5) {
      header(s, p);
      return;
    }
  }
  if (!best) return;
  const sp = b.speed;
  const isGk = best.role === 'GK' && inOwnBox(s, best);
  if (isGk) {
    // Saves and catches
    if (s.shotSide !== 0 && !s.keeperWillSave && sp > 12) return; // beaten
    if (sp > 20 || (sp > 14 && b.pos.y > 1.9)) {
      parry(s, best);
      return;
    }
    setOwner(s, best);
    best.holdingBall = true;
    best.touchTimer = 0;
    best.startAction('catch', 0.5);
    if (s.shotSide !== 0) s.events.push({ type: 'save' });
    s.shotSide = 0;
    return;
  }
  // Fast balls are hard to control
  if (sp > 21) {
    b.vel = { x: -b.vel.x * 0.25 + (Math.random() - 0.5) * 4, y: 1 + Math.random() * 2, z: b.vel.z * 0.3 + (Math.random() - 0.5) * 4 };
    best.lockout = 0.3;
    s.lastTouch = best.team;
    s.lastToucher = best;
    s.shotSide = 0;
    return;
  }
  setOwner(s, best);
  const want = best === s.controlled && s.humanActive && s.humanMove ? s.humanMove : null;
  firstTouch(s, best, want);
}

function parry(s: MatchState, gk: Player): void {
  touch(s, gk);
  const b = s.ball;
  const out = s.attackDir[gk.team]; // push away from own goal
  const side = Math.sign(b.pos.z - gk.pos.z) || 1;
  b.vel = { x: out * (3 + Math.random() * 5), y: 2 + Math.random() * 3, z: side * (4 + Math.random() * 5) };
  gk.lockout = 0.6;
  s.lastTouch = gk.team;
  s.lastToucher = gk;
  s.shotSide = 0;
  s.events.push({ type: 'save' });
}

function header(s: MatchState, p: Player): void {
  if (touch(s, p)) return;
  const b = s.ball;
  const dir = s.attackDir[p.team];
  const goalX = dir * PITCH.halfL;
  const relX = p.pos.x * dir;
  p.startAction('header', 0.55);
  p.lockout = 0.4;
  if (relX > 34 && Math.abs(p.pos.z) < 18) {
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
  b.spinY = 0;
  s.lastTouch = p.team;
  s.lastToucher = p;
  s.intendedReceiver = null;
  s.events.push({ type: 'header' });
}

/** Resolve tackles ~0.15 s into the slide. */
export function resolveTackles(s: MatchState): void {
  for (const p of s.players) {
    if (p.action !== 'tackle' || p.actionT < 0.12 || p.actionT > 0.4) continue;
    const o = s.owner;
    const b = s.ball;
    const foot = { x: p.pos.x + p.forward.x * 0.8, z: p.pos.z + p.forward.z * 0.8 };
    const d = Math.hypot(b.pos.x - foot.x, b.pos.z - foot.z);
    if (d > 1.05 || b.pos.y > 0.7) continue;
    if (o && o.team !== p.team) {
      // Came from behind if the tackler is behind the carrier's facing direction
      const tx = o.pos.x - p.pos.x;
      const tz = o.pos.z - p.pos.z;
      const tl = Math.hypot(tx, tz) || 1;
      const fromBehind = (o.forward.x * tx + o.forward.z * tz) / tl > 0.35;
      const contact = tl < 1.25;
      const chance = clamp(0.45 + (p.ratings.defending - o.ratings.dribbling) / 70, 0.2, 0.8);
      const won = Math.random() < chance;
      const verdict = judgeTackle(fromBehind, won, contact);
      if (won || verdict.foul) {
        s.owner = null;
        o.holdingBall = false;
        const fall = verdict.foul || Math.random() < 0.55;
        o.startAction('stumble', fall ? 1.95 : 0.55);
        o.stun = fall ? 1.9 : 0.55;
        o.lockout = fall ? 1.9 : 0.6;
        s.pending = null;
      }
      if (verdict.foul) {
        s.pendingFoul = { restart: foulRestart(o.pos.x, o.pos.z, o.team, s.attackDir[o.team]) };
        s.events.push({ type: 'foul', team: p.team, penalty: s.pendingFoul.restart.kind === 'penalty' });
        let card = verdict.card;
        if (card === 'yellow') {
          p.yellows++;
          if (p.yellows >= 2) card = 'red';
        }
        if (card !== 'none') s.events.push({ type: 'card', card, name: p.name, team: p.team });
        if (card === 'red' && p.role !== 'GK') sendOff(s, p);
        b.vel = { x: 0, y: 0, z: 0 };
      } else if (won) {
        const f = p.forward;
        b.vel = { x: f.x * (4 + Math.random() * 4) + (Math.random() - 0.5) * 3, y: 0.5, z: f.z * (4 + Math.random() * 4) + (Math.random() - 0.5) * 3 };
        s.lastTouch = p.team;
        s.lastToucher = p;
        touch(s, p);
        s.events.push({ type: 'tackle', won: true });
      } else {
        p.stun = 0.5;
        s.events.push({ type: 'tackle', won: false });
      }
      p.actionT = 0.41; // resolve once
    } else if (!o) {
      // Block / poke a loose ball
      const f = p.forward;
      b.vel = { x: f.x * 6, y: 0.4, z: f.z * 6 };
      s.lastTouch = p.team;
      s.lastToucher = p;
      p.actionT = 0.41;
    }
  }
}

/** Keep players from overlapping. */
export function separate(s: MatchState): void {
  const ps = s.players;
  for (let i = 0; i < ps.length; i++)
    for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i];
      const c = ps[j];
      if (a.sentOff || c.sentOff) continue;
      const dx = c.pos.x - a.pos.x;
      const dz = c.pos.z - a.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < PLAYER.separation && d > 1e-4) {
        const push = (PLAYER.separation - d) * 0.5;
        const nx = dx / d;
        const nz = dz / d;
        a.pos.x -= nx * push;
        a.pos.z -= nz * push;
        c.pos.x += nx * push;
        c.pos.z += nz * push;
      }
    }
  for (const p of ps) {
    if (p.sentOff) continue;
    p.pos.x = clamp(p.pos.x, -PITCH.halfL - 3, PITCH.halfL + 3);
    p.pos.z = clamp(p.pos.z, -PITCH.halfW - 3, PITCH.halfW + 3);
  }
}

/** Red card: the player walks off and takes no further part. */
export function sendOff(s: MatchState, p: Player): void {
  p.sentOff = true;
  p.action = 'none';
  p.pos = { x: (p.team === 0 ? -1 : 1) * 4, z: PITCH.halfW + 7 };
  p.vel = { x: 0, z: 0 };
  if (s.controlled === p) {
    const next = s.players.find((q) => q.team === p.team && q.role !== 'GK' && !q.sentOff);
    if (next) s.controlled = next;
  }
}
