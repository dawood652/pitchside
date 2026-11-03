// Physical duels, after GRF's interfere / trip animations: defenders throw a leg or body in front of
// shots (blocks), and players running side by side lean into shoulder-to-shoulder challenges.

import { Player } from '../entities/player';
import { MatchState } from './state';
import { CONTEST, PLAYER } from '../data/tuning';
import { angleDiff, clamp } from '../core/vec';
import { touch } from './control';

/** Player's left in world space (x, z). */
const leftOf = (p: Player) => ({ x: Math.cos(p.facing), z: -Math.sin(p.facing) });

/** Trip / stumble animation cue: pushed from (fx, fz); severity 1 stumble, 2 fall, 3 heavy fall. */
export function tripCue(p: Player, fx: number, fz: number, severity: number): void {
  // direction the push goes, relative to the victim's facing (+ = to the left)
  let a = Math.atan2(p.pos.x - fx, p.pos.z - fz) - p.facing;
  a = Math.atan2(Math.sin(a), Math.cos(a));
  p.cue = { cat: 'trip', angle: (a * 180) / Math.PI, severity };
}

/** Defenders near the line of a shot try to block it. */
export function tryBlocks(s: MatchState): void {
  const b = s.ball;
  if (s.owner || s.shotSide === 0 || s.phase !== 'play') return;
  const v2 = b.vel.x * b.vel.x + b.vel.z * b.vel.z;
  if (v2 < 100 || b.pos.y > 1.6) return;
  for (const p of s.players) {
    if (p.team === s.lastTouch || p.role === 'GK' || p.busy || p.lockout > 0 || p.stun > 0 || p.sentOff) continue;
    const rx = p.pos.x - b.pos.x;
    const rz = p.pos.z - b.pos.z;
    const t = (rx * b.vel.x + rz * b.vel.z) / v2;
    if (t < CONTEST.blockWindow[0] || t > CONTEST.blockWindow[1]) continue;
    const cx = b.pos.x + b.vel.x * t - p.pos.x;
    const cz = b.pos.z + b.vel.z * t - p.pos.z;
    const miss = Math.hypot(cx, cz);
    if (miss > CONTEST.blockReach) continue;
    const l = leftOf(p);
    const side = cx * l.x + cz * l.z;
    const h = Math.max(0.1, b.pos.y + b.vel.y * t - 4.9 * t * t);
    const chance = clamp(CONTEST.blockChance - (miss / CONTEST.blockReach) * 0.55 + (p.ratings.defending - 70) / 120, 0.08, 0.9);
    p.startAction('block', t + 0.45);
    p.cue = { cat: 'interfere', angle: 0, side, h, contact: t };
    p.blockOk = Math.random() < chance;
  }
}

/** Blocks reaching their contact moment deflect the ball. */
export function resolveBlocks(s: MatchState): void {
  const b = s.ball;
  for (const p of s.players) {
    if (p.action !== 'block' || !p.blockOk || !p.cue?.contact || p.actionT < p.cue.contact - 0.03) continue;
    p.blockOk = false;
    if (s.owner || Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z) > CONTEST.blockReach + 0.4 || b.pos.y > 1.9) continue;
    if (touch(s, p)) continue;
    const sp = Math.hypot(b.vel.x, b.vel.z);
    const a = Math.atan2(-b.vel.x, -b.vel.z) + (Math.random() - 0.5) * 2.2;
    const out = sp * (0.18 + Math.random() * 0.22);
    b.vel = { x: Math.sin(a) * out, y: 1 + Math.random() * 3, z: Math.cos(a) * out };
    b.spinY = 0;
    s.shotSide = 0;
    s.lastTouch = p.team;
    s.lastToucher = p;
    s.intendedReceiver = null;
    p.lockout = 0.25;
    s.events.push({ type: 'block' });
  }
}

/** Shoulder-to-shoulder: a defender running alongside the carrier leans in. */
export function shoulderChallenges(s: MatchState, dt: number): void {
  const o = s.owner;
  if (!o || o.holdingBall || s.pending || s.phase !== 'play' || o.busy) return;
  for (const p of s.players) {
    if (p.team === o.team || p.busy || p.lockout > 0 || p.stun > 0 || p.sentOff || p.tackleCooldown > 0 || p.role === 'GK') continue;
    const dx = o.pos.x - p.pos.x;
    const dz = o.pos.z - p.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > CONTEST.shoulderRange || p.speed < CONTEST.shoulderMinSpeed || o.speed < CONTEST.shoulderMinSpeed) continue;
    if (Math.abs(angleDiff(p.facing, o.facing)) > 1.0) continue;
    const l = leftOf(p);
    const lateral = dx * l.x + dz * l.z;
    if (Math.abs(lateral) < 0.45) continue; // behind or in front: that's a tackle, not a shoulder
    if (Math.random() > CONTEST.shoulderRate * dt) continue;
    p.tackleCooldown = PLAYER.tackleCooldown;
    const strength = (q: Player) => q.ratings.defending * 0.5 + q.ratings.pace * 0.3 + q.ratings.dribbling * 0.2;
    const win = Math.random() < clamp(0.32 + (strength(p) - strength(o)) / 90 + (p.speed - o.speed) * 0.05, 0.1, 0.6);
    p.startAction('challenge', 0.5);
    p.cue = { cat: 'interfere', angle: 0, side: Math.sign(lateral) * 1.1, h: 0.1, contact: 0.15 };
    if (win) {
      // knocked off the ball: it runs on loose, the carrier stumbles
      s.owner = null;
      s.ball.vel = { x: o.vel.x * 0.9, y: 0, z: o.vel.z * 0.9 };
      o.startAction('stumble', 0.55);
      tripCue(o, p.pos.x, p.pos.z, 1);
      o.stun = 0.45;
      o.lockout = 0.35;
      s.events.push({ type: 'tackle', won: true });
    } else {
      p.startAction('stumble', 0.5);
      tripCue(p, o.pos.x, o.pos.z, 1);
      p.stun = 0.4;
    }
    return;
  }
}
