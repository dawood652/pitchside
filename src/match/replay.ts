// Records the last seconds of play and replays a goal in slow motion.

import { MatchState } from './state';
import { ActionKind } from '../animation/clips';

interface PSnap {
  x: number;
  z: number;
  vx: number;
  vz: number;
  facing: number;
  action: ActionKind;
  actionT: number;
  actionDur: number;
  actionPower: number;
  diveDir: number;
  diveHigh: number;
  holding: boolean;
}
interface Frame {
  bx: number;
  by: number;
  bz: number;
  bvx: number;
  bvy: number;
  bvz: number;
  players: PSnap[];
}

const CAP = 60 * 8;

export class Replay {
  private frames: Frame[] = [];
  private live: Frame | null = null;
  private start = 0;
  private end = 0;
  private cursor = 0;
  active = false;
  goalSide = 1;
  done = false;
  private goalFrame = -1;

  record(s: MatchState): void {
    this.frames.push(snapshot(s));
    if (this.frames.length > CAP) {
      this.frames.shift();
      if (this.goalFrame >= 0) this.goalFrame--;
    }
  }

  markGoal(side: number): void {
    this.goalFrame = this.frames.length - 1;
    this.goalSide = side;
    this.done = false;
  }

  reset(): void {
    this.frames = [];
    this.active = false;
    this.done = false;
    this.goalFrame = -1;
  }

  canStart(): boolean {
    return this.goalFrame > 30 && !this.done && !this.active;
  }

  begin(s: MatchState): void {
    this.live = snapshot(s);
    this.start = Math.max(0, this.goalFrame - 60 * 4.5);
    this.end = Math.min(this.frames.length - 1, this.goalFrame + 30);
    this.cursor = this.start;
    this.active = true;
  }

  /** Progress 0..1 through the replay. */
  get progress(): number {
    return (this.cursor - this.start) / Math.max(1, this.end - this.start);
  }

  /** Advance by real dt at the given speed. Returns false when finished. */
  step(s: MatchState, dt: number, speed = 0.55): boolean {
    this.cursor += dt * 60 * speed;
    if (this.cursor >= this.end) {
      this.finish(s);
      return false;
    }
    apply(s, this.frames[Math.floor(this.cursor)]);
    return true;
  }

  finish(s: MatchState): void {
    if (this.live) apply(s, this.live);
    this.active = false;
    this.done = true;
    this.goalFrame = -1;
  }
}

function snapshot(s: MatchState): Frame {
  return {
    bx: s.ball.pos.x,
    by: s.ball.pos.y,
    bz: s.ball.pos.z,
    bvx: s.ball.vel.x,
    bvy: s.ball.vel.y,
    bvz: s.ball.vel.z,
    players: s.players.map((p) => ({
      x: p.pos.x,
      z: p.pos.z,
      vx: p.vel.x,
      vz: p.vel.z,
      facing: p.facing,
      action: p.action,
      actionT: p.actionT,
      actionDur: p.actionDur,
      actionPower: p.actionPower,
      diveDir: p.diveDir,
      diveHigh: p.diveHigh,
      holding: p.holdingBall,
    })),
  };
}

function apply(s: MatchState, f: Frame): void {
  s.ball.pos = { x: f.bx, y: f.by, z: f.bz };
  s.ball.vel = { x: f.bvx, y: f.bvy, z: f.bvz };
  f.players.forEach((q, i) => {
    const p = s.players[i];
    p.pos = { x: q.x, z: q.z };
    p.vel = { x: q.vx, z: q.vz };
    p.facing = q.facing;
    p.action = q.action;
    p.actionT = q.actionT;
    p.actionDur = q.actionDur;
    p.actionPower = q.actionPower;
    p.diveDir = q.diveDir;
    p.diveHigh = q.diveHigh;
    p.holdingBall = q.holding;
  });
}
