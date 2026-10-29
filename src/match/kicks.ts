// Kick velocity solvers for passes, through balls, lobs and shots. Pure functions (testable).

import { BallSim } from '../physics/ball';
import { BALL, KICK, PITCH } from '../data/tuning';
import { clamp, V2 } from '../core/vec';

export interface KickVel {
  vx: number;
  vy: number;
  vz: number;
  spin: number;
}

/** Simulate a 1D rolling ball and return [distance travelled, time] when speed drops to vEnd. */
export function rollTo(v0: number, vEnd: number): { d: number; t: number } {
  let v = v0;
  let d = 0;
  let t = 0;
  const dt = 1 / 60;
  while (v > vEnd && t < 12) {
    v -= (BALL.drag * v * v + BALL.rollDecel + BALL.rollDragExtra * v) * dt;
    d += Math.max(v, 0) * dt;
    t += dt;
  }
  return { d, t };
}

/** Find the launch speed so a rolling ball covers `dist` and arrives at `vEnd`. */
export function groundSpeedFor(dist: number, vEnd: number): number {
  let lo = vEnd;
  let hi = 45;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if (rollTo(mid, vEnd).d < dist) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function groundPass(from: V2, to: V2, vEnd = KICK.passEndSpeed): KickVel & { t: number } {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const d = Math.max(0.5, Math.hypot(dx, dz));
  const s = clamp(groundSpeedFor(d, vEnd), KICK.passMin, KICK.passMax);
  const t = rollTo(s, vEnd).t;
  return { vx: (dx / d) * s, vy: 0, vz: (dz / d) * s, spin: 0, t };
}

/** Lofted ball that first lands at roughly `to`. */
export function lobPass(from: V2, to: V2, angle = KICK.lobAngle): KickVel & { t: number } {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const d = Math.max(1, Math.hypot(dx, dz));
  let lo = 4;
  let hi = 40;
  let tLand = 1;
  const sim = new BallSim();
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    sim.place(0, 0, BALL.radius + 0.01);
    sim.kick(Math.cos(angle) * mid, Math.sin(angle) * mid, 0);
    let t = 0;
    let landed = false;
    while (t < 6) {
      sim.step(1 / 60);
      t += 1 / 60;
      if (sim.bounced || (sim.vel.y <= 0 && sim.pos.y <= BALL.radius + 0.02)) {
        landed = true;
        break;
      }
    }
    if (!landed || sim.pos.x > d) hi = mid;
    else lo = mid;
    tLand = t;
  }
  const s = (lo + hi) / 2;
  const h = Math.cos(angle) * s;
  return { vx: (dx / d) * h, vy: Math.sin(angle) * s, vz: (dz / d) * h, spin: 0, t: tLand };
}

/**
 * Shot toward goal at x = goalX. aimZ / aimY is where it should cross the line.
 * power 0..1. `error` 0..1 adds random inaccuracy.
 */
export function shot(from: V2, goalX: number, aimZ: number, aimY: number, power: number, error: number, rnd = Math.random): KickVel {
  const speed = KICK.shotMin + power * (KICK.shotMax - KICK.shotMin);
  const errA = (rnd() - 0.5) * 2 * error * 0.11;
  const errY = (rnd() - 0.5) * 2 * error * 1.1;
  const dx = goalX - from.x;
  const dz = aimZ - from.z;
  const d = Math.hypot(dx, dz);
  const ang = Math.atan2(dz, dx) + errA;
  // Average horizontal speed is lower than launch speed because of drag
  const hv = speed * 0.97;
  const t = d / (hv * (1 - Math.min(0.35, d * 0.0055)));
  const targetY = clamp(aimY + errY, 0.15, 4);
  const vy = (targetY - BALL.radius + 0.5 * BALL.gravity * t * t) / t;
  const vyC = Math.min(vy, speed * 0.6);
  // Curl toward the middle of the goal slightly for placed shots
  const spin = -Math.sign(aimZ) * (1 - power) * 12 * Math.sign(dx);
  return { vx: Math.cos(ang) * hv, vy: vyC, vz: Math.sin(ang) * hv, spin };
}

/** Where to aim a shot: far post by default, steered by input lateral direction (-1..1). */
export function chooseAim(fromZ: number, lateral: number | null, power: number, rnd = Math.random): { z: number; y: number } {
  const edge = PITCH.goalHalfWidth - 0.55;
  let z: number;
  if (lateral !== null && Math.abs(lateral) > 0.2) z = Math.sign(lateral) * edge;
  else z = fromZ > 0.5 ? -edge : fromZ < -0.5 ? edge : (rnd() < 0.5 ? -1 : 1) * edge;
  const y = 0.35 + power * 1.25 + (power > 0.9 ? (power - 0.9) * 9 : 0);
  return { z, y };
}
