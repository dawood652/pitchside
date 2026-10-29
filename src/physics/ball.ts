// Ball simulation: gravity, quadratic drag, Magnus curve from spin, bounce, rolling friction,
// and collisions with posts, crossbar and net. Pure logic (no rendering).

import { BALL, PITCH } from '../data/tuning';
import { V3, v3 } from '../core/vec';

export type BoundaryEvent =
  | { kind: 'goal'; side: 1 | -1 } // side = which goal (x sign) the ball went into
  | { kind: 'byline'; side: 1 | -1; z: number }
  | { kind: 'touchline'; side: 1 | -1; x: number };

export class BallSim {
  pos: V3 = v3(0, BALL.radius, 0);
  vel: V3 = v3();
  /** Spin around the vertical axis (sidespin, rad/s-ish units) and topspin scalar. */
  spinY = 0;
  inNet = false;
  /** True for the step in which the ball bounced off the ground. */
  bounced = false;

  get onGround(): boolean {
    return this.pos.y <= BALL.radius + 0.02 && Math.abs(this.vel.y) < 0.6;
  }
  get speed(): number {
    return Math.hypot(this.vel.x, this.vel.y, this.vel.z);
  }
  get groundSpeed(): number {
    return Math.hypot(this.vel.x, this.vel.z);
  }

  place(x: number, z: number, y = BALL.radius): void {
    this.pos = v3(x, y, z);
    this.vel = v3();
    this.spinY = 0;
    this.inNet = false;
  }

  kick(vx: number, vy: number, vz: number, spin = 0): void {
    this.vel = v3(vx, vy, vz);
    this.spinY = spin;
  }

  step(dt: number): void {
    this.bounced = false;
    const p = this.pos;
    const v = this.vel;
    const sp = Math.hypot(v.x, v.y, v.z);
    const airborne = p.y > BALL.radius + 0.005 || Math.abs(v.y) > 0.05;

    // Drag
    v.x -= BALL.drag * sp * v.x * dt;
    v.y -= BALL.drag * sp * v.y * dt;
    v.z -= BALL.drag * sp * v.z * dt;

    // Magnus (sidespin around Y): a = k * (w x v), w = (0, spinY, 0) => (w*vz, 0, -w*vx)
    if (airborne || this.groundSpeed > 3) {
      const k = BALL.magnus * this.spinY;
      v.x += k * v.z * sp * dt * 0.1;
      v.z += -k * v.x * sp * dt * 0.1;
    }
    this.spinY *= Math.exp(-BALL.spinDecay * dt);

    if (airborne) {
      v.y -= BALL.gravity * dt;
    } else {
      // Rolling
      const gs = Math.hypot(v.x, v.z);
      if (gs > 0) {
        const dec = (BALL.rollDecel + BALL.rollDragExtra * gs) * dt;
        const ns = Math.max(0, gs - dec);
        v.x *= ns / gs;
        v.z *= ns / gs;
      }
      v.y = 0;
      p.y = BALL.radius;
    }

    p.x += v.x * dt;
    p.y += v.y * dt;
    p.z += v.z * dt;

    // Ground bounce
    if (p.y < BALL.radius) {
      p.y = BALL.radius;
      if (v.y < -0.8) {
        this.bounced = true;
        v.y = -v.y * BALL.restitution;
        const keep = 1 - BALL.groundFriction * Math.min(1, Math.abs(v.y) / 8);
        v.x *= keep;
        v.z *= keep;
      } else {
        v.y = 0;
      }
    }

    this.collideFrame();
    this.collideNet();
  }

  /** Posts and crossbar treated as cylinders. */
  private collideFrame(): void {
    const r = BALL.radius + PITCH.postRadius;
    for (const s of [-1, 1]) {
      const gx = s * PITCH.halfL;
      if (Math.abs(this.pos.x - gx) > 1.5) continue;
      // Posts (vertical cylinders)
      for (const t of [-1, 1]) {
        const pz = t * PITCH.goalHalfWidth;
        if (this.pos.y > PITCH.goalHeight + r) continue;
        this.bounceOffAxis(this.pos.x - gx, this.pos.z - pz, r, 'xz');
      }
      // Crossbar (horizontal cylinder along z)
      if (Math.abs(this.pos.z) < PITCH.goalHalfWidth + r) {
        this.bounceOffAxis(this.pos.x - gx, this.pos.y - PITCH.goalHeight, r, 'xy');
      }
    }
  }

  private bounceOffAxis(da: number, db: number, r: number, plane: 'xz' | 'xy'): void {
    const d = Math.hypot(da, db);
    if (d >= r || d < 1e-6) return;
    const na = da / d;
    const nb = db / d;
    const v = this.vel;
    const vb = plane === 'xz' ? v.z : v.y;
    const vn = v.x * na + vb * nb;
    if (vn >= 0) return;
    const e = 0.7;
    v.x -= (1 + e) * vn * na;
    if (plane === 'xz') v.z -= (1 + e) * vn * nb;
    else v.y -= (1 + e) * vn * nb;
    this.pos.x += na * (r - d);
    if (plane === 'xz') this.pos.z += nb * (r - d);
    else this.pos.y += nb * (r - d);
  }

  /** Once the ball is inside the goal frame it is trapped by the net. */
  private collideNet(): void {
    const ax = Math.abs(this.pos.x);
    if (ax < PITCH.halfL + BALL.radius && !this.inNet) return;
    const inMouth = Math.abs(this.pos.z) < PITCH.goalHalfWidth && this.pos.y < PITCH.goalHeight;
    if (!inMouth && !this.inNet) return;
    this.inNet = true;
    const s = Math.sign(this.pos.x);
    const front = PITCH.halfL + BALL.radius;
    if (ax < front + 0.05) {
      this.pos.x = s * (front + 0.05);
      if (this.vel.x * s < 0) this.vel.x = 0;
    }
    const back = PITCH.halfL + PITCH.goalDepth - BALL.radius;
    if (ax > back) {
      this.pos.x = s * back;
      this.vel.x *= -0.15;
      this.vel.z *= 0.4;
      this.vel.y *= 0.4;
    }
    const zl = PITCH.goalHalfWidth - BALL.radius;
    if (Math.abs(this.pos.z) > zl) {
      this.pos.z = Math.sign(this.pos.z) * zl;
      this.vel.z *= -0.2;
      this.vel.x *= 0.6;
    }
    if (this.pos.y > PITCH.goalHeight - BALL.radius) {
      this.pos.y = PITCH.goalHeight - BALL.radius;
      this.vel.y = -Math.abs(this.vel.y) * 0.2;
    }
  }
}

/** Decide if the ball has left the field of play. The whole ball must cross the line. */
export function checkBoundary(pos: V3, inNet: boolean): BoundaryEvent | null {
  const r = BALL.radius;
  if (Math.abs(pos.x) > PITCH.halfL + r) {
    const side = (pos.x > 0 ? 1 : -1) as 1 | -1;
    if (inNet || (Math.abs(pos.z) < PITCH.goalHalfWidth && pos.y < PITCH.goalHeight)) return { kind: 'goal', side };
    return { kind: 'byline', side, z: pos.z };
  }
  if (Math.abs(pos.z) > PITCH.halfW + r) {
    return { kind: 'touchline', side: (pos.z > 0 ? 1 : -1) as 1 | -1, x: pos.x };
  }
  return null;
}

/** Predict ball position after t seconds assuming it is rolling on the ground (used by AI). */
export function predictRolling(pos: V3, vel: V3, t: number): { x: number; z: number } {
  const gs = Math.hypot(vel.x, vel.z);
  if (gs < 0.01) return { x: pos.x, z: pos.z };
  const dec = BALL.rollDecel + BALL.rollDragExtra * gs * 0.5;
  const tStop = gs / dec;
  const tt = Math.min(t, tStop);
  const d = gs * tt - 0.5 * dec * tt * tt;
  return { x: pos.x + (vel.x / gs) * d, z: pos.z + (vel.z / gs) * d };
}

/** Rough flight prediction for an airborne ball (ignores drag). Returns landing time. */
export function timeToLand(pos: V3, vel: V3): number {
  const h = pos.y - BALL.radius;
  const g = BALL.gravity;
  return (vel.y + Math.sqrt(Math.max(0, vel.y * vel.y + 2 * g * h))) / g;
}
