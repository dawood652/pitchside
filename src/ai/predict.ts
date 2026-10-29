// Ball prediction and interception helpers for AI.

import { Player } from '../entities/player';
import { BallSim, predictRolling } from '../physics/ball';
import { BALL } from '../data/tuning';
import { V2 } from '../core/vec';

export function predictBall(ball: BallSim, t: number): { x: number; y: number; z: number } {
  if (ball.onGround) {
    const p = predictRolling(ball.pos, ball.vel, t);
    return { x: p.x, y: BALL.radius, z: p.z };
  }
  const y = ball.pos.y + ball.vel.y * t - 0.5 * BALL.gravity * t * t;
  const damp = 1 - Math.min(0.3, t * 0.06);
  if (y < BALL.radius) {
    const tl = (ball.vel.y + Math.sqrt(Math.max(0, ball.vel.y ** 2 + 2 * BALL.gravity * (ball.pos.y - BALL.radius)))) / BALL.gravity;
    const extra = (t - tl) * 0.5; // rolls on a bit after landing
    const hv = Math.hypot(ball.vel.x, ball.vel.z) || 1;
    return {
      x: ball.pos.x + ball.vel.x * tl * damp + (ball.vel.x / hv) * extra * hv * 0.5,
      y: BALL.radius,
      z: ball.pos.z + ball.vel.z * tl * damp + (ball.vel.z / hv) * extra * hv * 0.5,
    };
  }
  return { x: ball.pos.x + ball.vel.x * t * damp, y, z: ball.pos.z + ball.vel.z * t * damp };
}

/** Earliest point where player p can meet the ball (ball reachable height), and when. */
export function intercept(p: Player, ball: BallSim, maxH = 1.0): { pt: V2; t: number } {
  const sp = p.maxSpeed(false) * 0.95 + 0.5;
  let last = { x: ball.pos.x, z: ball.pos.z };
  for (let t = 0; t <= 3.5; t += 0.08) {
    const b = predictBall(ball, t);
    last = { x: b.x, z: b.z };
    if (b.y > maxH && t < 2.5) continue;
    const d = Math.hypot(b.x - p.pos.x, b.z - p.pos.z);
    if (d <= sp * t + 0.7) return { pt: last, t };
  }
  return { pt: last, t: 4 };
}
