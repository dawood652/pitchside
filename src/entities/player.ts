// Player gameplay state. No rendering here.

import { ActionKind } from '../animation/clips';
import { Role, Slot } from '../data/formations';
import { PLAYER } from '../data/tuning';
import { angleDiff, V2 } from '../core/vec';

export interface Ratings {
  pace: number;
  shooting: number;
  passing: number;
  dribbling: number;
  defending: number;
  keeping: number;
}

export class Player {
  id: number;
  team: 0 | 1;
  slot: Slot;
  role: Role;
  number: number;
  name: string;
  ratings: Ratings;

  pos: V2;
  vel: V2 = { x: 0, z: 0 };
  facing = 0; // radians, 0 = +z, PI/2 = +x
  desired: V2 = { x: 0, z: 0 }; // desired velocity this step
  sprint = false;

  action: ActionKind = 'none';
  actionT = 0; // seconds into action
  actionDur = 0;
  actionPower = 0;
  diveDir = 0;
  diveHigh = 0;
  celebrateVariant = 0;
  lockout = 0; // can't touch ball until 0
  tackleCooldown = 0;
  stun = 0;
  holdingBall = false; // keeper / throw-in
  yellows = 0;
  touchTimer = 0; // seconds until the next dribble touch
  sentOff = false;

  constructor(id: number, team: 0 | 1, slot: Slot, name: string, teamRating: number, seed: number) {
    this.id = id;
    this.team = team;
    this.slot = slot;
    this.role = slot.role;
    this.number = slot.number;
    this.name = name;
    this.pos = { x: 0, z: 0 };
    const r = (bias: number) => Math.max(45, Math.min(97, teamRating + bias + (((seed * 9301 + bias * 49297) % 233) / 233 - 0.5) * 12));
    const role = slot.role;
    this.ratings = {
      pace: r(role === 'FWD' ? 4 : role === 'DEF' ? -3 : 0),
      shooting: r(role === 'FWD' ? 5 : role === 'MID' ? 0 : -15),
      passing: r(role === 'MID' ? 5 : 0),
      dribbling: r(role === 'FWD' ? 4 : role === 'DEF' ? -6 : 2),
      defending: r(role === 'DEF' ? 6 : role === 'FWD' ? -20 : -4),
      keeping: role === 'GK' ? r(2) : 30,
    };
  }

  get speed(): number {
    return Math.hypot(this.vel.x, this.vel.z);
  }
  get forward(): V2 {
    return { x: Math.sin(this.facing), z: Math.cos(this.facing) };
  }
  get busy(): boolean {
    return this.action !== 'none' && this.action !== 'celebrate';
  }
  maxSpeed(withBall: boolean): number {
    const k = 0.88 + 0.12 * ((this.ratings.pace - 60) / 35);
    if (withBall) return (this.sprint ? PLAYER.dribbleSprint : PLAYER.dribbleJog) * k;
    return (this.sprint ? PLAYER.sprintSpeed : PLAYER.jogSpeed) * k;
  }

  startAction(kind: ActionKind, dur: number, power = 0): void {
    this.action = kind;
    this.actionT = 0;
    this.actionDur = dur;
    this.actionPower = power;
  }

  /** Integrate movement toward desired velocity with acceleration and turn-rate limits. */
  integrate(dt: number, withBall: boolean): void {
    this.lockout = Math.max(0, this.lockout - dt);
    this.tackleCooldown = Math.max(0, this.tackleCooldown - dt);
    this.stun = Math.max(0, this.stun - dt);
    if (this.action !== 'none') {
      this.actionT += dt;
      if (this.actionT >= this.actionDur && this.action !== 'celebrate') this.action = 'none';
    }
    if (this.action === 'tackle') {
      const k = Math.max(0, 1 - this.actionT / 0.66);
      this.desired = { x: this.forward.x * 7.5 * k, z: this.forward.z * 7.5 * k };
    } else if (this.action === 'stumble' || this.action === 'dive') {
      if (this.action === 'stumble') this.desired = { x: this.vel.x * 0.5, z: this.vel.z * 0.5 };
    }
    let dx = this.desired.x;
    let dz = this.desired.z;
    const max = this.maxSpeed(withBall) * (this.stun > 0 ? 0.35 : 1);
    const dl = Math.hypot(dx, dz);
    if (dl > max) {
      dx = (dx / dl) * max;
      dz = (dz / dl) * max;
    }
    const lockMove = this.action === 'pass' || this.action === 'shot' || this.action === 'lob' || this.action === 'throwin' || this.action === 'gkthrow' || this.action === 'catch';
    if (lockMove) {
      dx *= 0.2;
      dz *= 0.2;
    }
    const ax = dx - this.vel.x;
    const az = dz - this.vel.z;
    const al = Math.hypot(ax, az);
    const maxA = PLAYER.accel * dt;
    if (al > maxA) {
      this.vel.x += (ax / al) * maxA;
      this.vel.z += (az / al) * maxA;
    } else {
      this.vel.x = dx;
      this.vel.z = dz;
    }
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    // Face movement direction (unless in a locked action)
    const sp = this.speed;
    if (sp > 0.3 && !lockMove && this.action !== 'dive' && this.action !== 'tackle' && this.action !== 'stumble') {
      const want = Math.atan2(this.vel.x, this.vel.z);
      const d = angleDiff(this.facing, want);
      const maxTurn = PLAYER.turnRate * dt * (withBall ? 0.8 : 1);
      this.facing += Math.max(-maxTurn, Math.min(maxTurn, d));
    }
  }

  faceTowards(x: number, z: number): void {
    this.facing = Math.atan2(x - this.pos.x, z - this.pos.z);
  }
}
