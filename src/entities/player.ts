// Player gameplay state. No rendering here.

import { ActionKind } from '../animation/clips';
import { Role, Slot } from '../data/formations';
import { MOVE, PLAYER } from '../data/tuning';
import { angleDiff, V2 } from '../core/vec';

export interface Ratings {
  pace: number;
  shooting: number;
  passing: number;
  dribbling: number;
  defending: number;
  keeping: number;
}

/** Animation families the simulation can ask for (see animation/gfSelect.ts). */
export type AnimCat = 'pass' | 'shot' | 'ballcontrol' | 'trap' | 'sliding' | 'header' | 'chest' | 'deflect' | 'trip' | 'interfere' | 'standup' | 'move';

/** Animation request for an action: family, direction, where the ball meets the body and when. */
export interface AnimCue {
  cat: AnimCat;
  angle: number; // degrees relative to facing, + = left (ball out / bump from)
  h?: number; // contact height (m)
  side?: number; // contact to the side (m, + = left)
  contact?: number; // seconds after the action starts when the ball is touched
  severity?: number; // trips: 1 stumble, 2 fall, 3 heavy fall
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
  /** Slide tackle (true) or standing tackle (false) for the current tackle action. */
  slide = false;
  /** Stronger foot for passes and shots (about one player in five is left-footed). */
  leftFooted = false;
  /** Direction the current kick sends the ball, relative to facing (radians, + = left). */
  kickAngle = 0;
  /** Last ball touch for the animator to show (dribble cut or first touch), consumed by the view. */
  touchEvent: { kind: AnimCat; angle: number; h?: number } | null = null;
  /** What the current action's animation should show (set when the action starts; read by the view). */
  cue: AnimCue | null = null;
  /** Committed to a header: where the ball will be met. */
  aerialTarget: V2 | null = null;
  /** A block in progress will get a touch on the ball. */
  blockOk = false;
  private turnCd = 0;
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
    this.leftFooted = (seed * 7 + id * 13) % 5 === 0;
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
    this.cue = null;
  }

  /** Integrate movement toward desired velocity with acceleration and turn-rate limits. */
  integrate(dt: number, withBall: boolean): void {
    this.lockout = Math.max(0, this.lockout - dt);
    this.tackleCooldown = Math.max(0, this.tackleCooldown - dt);
    this.stun = Math.max(0, this.stun - dt);
    this.turnCd = Math.max(0, this.turnCd - dt);
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
    // Turning from (nearly) standing: show a GRF turn-on-the-spot step (movement clips)
    if (!withBall && this.action === 'none' && this.turnCd <= 0 && this.speed < 2.5 && Math.hypot(dx, dz) > 2 && !this.touchEvent) {
      const turn = angleDiff(this.facing, Math.atan2(dx, dz));
      if (Math.abs(turn) > 1.4) {
        this.touchEvent = { kind: 'move', angle: turn };
        this.turnCd = 0.7;
      }
    }
    const max = this.maxSpeed(withBall) * (this.stun > 0 ? 0.35 : 1);
    const dl = Math.hypot(dx, dz);
    if (dl > max) {
      dx = (dx / dl) * max;
      dz = (dz / dl) * max;
    }
    const lockMove = this.action === 'pass' || this.action === 'shot' || this.action === 'lob' || this.action === 'throwin' || this.action === 'gkthrow' || this.action === 'catch' || this.action === 'block';
    if (lockMove) {
      dx *= 0.2;
      dz *= 0.2;
    }
    if (this.action === 'dive' || this.action === 'tackle' || this.action === 'stumble' || this.action === 'catch') {
      // scripted motion: plain acceleration toward the wanted velocity
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
    } else this.steer(dx, dz, max, withBall, dt);
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

  /**
   * GRF-style movement (humanoidbase.cpp): acceleration falls off toward top speed, braking is
   * quicker than speeding up, and the run direction turns at a limited rate that shrinks with speed
   * (π rad/s at sprint with the ball, 1.5π without); asking for more than that bleeds speed first.
   */
  private steer(dx: number, dz: number, max: number, withBall: boolean, dt: number): void {
    const cur = this.speed;
    const want = Math.min(Math.hypot(dx, dz), max);
    const heading = cur > 0.05 ? Math.atan2(this.vel.x, this.vel.z) : this.facing;
    const target = want > 0.05 ? Math.atan2(dx, dz) : heading;
    let speedT = want;
    let h = target;
    if (cur > MOVE.cornerMinSpeed && want > 0.05) {
      const agility = Math.max(0, Math.min(1, (this.ratings.pace - 60) / 35));
      const ang = angleDiff(heading, target);
      const maxAng = (MOVE.cornerRate * (0.7 + 0.3 * agility) * (withBall ? 1 : MOVE.cornerNoBall) * dt) / (cur / MOVE.refSprint + 0.01);
      if (Math.abs(ang) > maxAng) {
        h = heading + Math.sign(ang) * maxAng;
        const over = Math.abs(ang) - maxAng;
        speedT = Math.min(speedT, cur * (1 - Math.min(1, (over / Math.PI) * MOVE.cornerBrake)));
      }
    }
    let sp = cur;
    if (speedT > cur) {
      const top = Math.max(max, MOVE.cornerMinSpeed + 0.1);
      const x = Math.max(0, Math.min(1, (cur - MOVE.cornerMinSpeed) / (top - MOVE.cornerMinSpeed)));
      const a = MOVE.accel * Math.max(MOVE.accelFloor, 1 - x ** MOVE.accelFalloffExp);
      sp = Math.min(speedT, cur + a * dt);
    } else sp = Math.max(speedT, cur - MOVE.decel * dt);
    this.vel.x = Math.sin(h) * sp;
    this.vel.z = Math.cos(h) * sp;
  }

  faceTowards(x: number, z: number): void {
    this.facing = Math.atan2(x - this.pos.x, z - this.pos.z);
  }
}
