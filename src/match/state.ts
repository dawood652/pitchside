// Shared match state passed between the game, AI and control modules.

import { Player } from '../entities/player';
import { BallSim } from '../physics/ball';
import { TeamDef } from '../data/teams';
import { Restart, Card } from './rules';
import { V2 } from '../core/vec';

export type Phase = 'kickoff' | 'play' | 'restart' | 'goal' | 'halftime' | 'fulltime';

export type GameEvent =
  | { type: 'kick'; power: number }
  | { type: 'whistle'; long?: boolean }
  | { type: 'goal'; team: 0 | 1; scorer: string }
  | { type: 'save' }
  | { type: 'post' }
  | { type: 'tackle'; won: boolean }
  | { type: 'header' }
  | { type: 'halftime' }
  | { type: 'fulltime' }
  | { type: 'shot' }
  | { type: 'foul'; team: 0 | 1; penalty: boolean }
  | { type: 'card'; card: Card; name: string; team: 0 | 1 }
  | { type: 'offside'; team: 0 | 1 };

export interface PendingKick {
  player: Player;
  delay: number;
  vel: { vx: number; vy: number; vz: number; spin: number };
  receiver: Player | null;
  isShot: boolean;
  power: number;
}

export interface MatchState {
  teams: [TeamDef, TeamDef];
  players: Player[];
  ball: BallSim;
  owner: Player | null;
  lastTouch: 0 | 1;
  lastToucher: Player | null;
  attackDir: [number, number];
  score: [number, number];
  half: 1 | 2;
  clock: number;
  halfLen: number;
  phase: Phase;
  phaseT: number;
  restart: Restart | null;
  taker: Player | null;
  firstKickoff: 0 | 1;
  humanTeam: 0 | 1;
  /** False in the attract/demo match behind the menu: both teams are AI. */
  humanActive: boolean;
  controlled: Player;
  intendedReceiver: Player | null;
  pending: PendingKick | null;
  /** Goal side (x sign) a live shot is heading to, 0 if none. */
  shotSide: number;
  keeperWillSave: boolean;
  scorer: Player | null;
  events: GameEvent[];
  excitement: number;
  shotCharge: number; // 0..1 while charging a human shot, -1 otherwise
  stats: { shots: [number, number]; possession: [number, number] };
  /** 0 Amateur, 1 Pro, 2 World Class (affects the CPU side). */
  difficulty: number;
  /** Receiver who was offside when the ball was played; called if he touches it. */
  offsideCandidate: Player | null;
  pendingFoul: { restart: Restart } | null;
  /** True while the ball in flight is a penalty kick. */
  penaltyShot: boolean;
  /** Defenders standing in a free-kick wall. */
  wall: Player[];
  /** Latest human lateral input (-1..1) — used as the keeper's guess when the human defends a penalty. */
  diveHint: number;
  /** Human stick direction in world space (null when idle) — used for first touches into space. */
  humanMove: { x: number; z: number } | null;
  /** Assist settings for the human side. */
  assist: { collect: boolean; autoSwitch: 'auto' | 'loose' | 'manual'; autoSprint: boolean };
  lastSwitchT: number;
  /** Teammate the switch button would pick next (for the HUD indicator). */
  nextSwitch: Player | null;
  time: number;
  /** Touch: teammate tapped on screen to receive a pass. */
  tapPass: Player | null;
}

/** Helpers to convert between world coordinates and a team's attacking frame (+x attack). */
export const toTeam = (s: MatchState, team: 0 | 1, p: V2): V2 => ({ x: p.x * s.attackDir[team], z: p.z * s.attackDir[team] });
export const fromTeam = (s: MatchState, team: 0 | 1, p: V2): V2 => ({ x: p.x * s.attackDir[team], z: p.z * s.attackDir[team] });

export const teammates = (s: MatchState, team: 0 | 1) => s.players.filter((p) => p.team === team && !p.sentOff);
export const opponents = (s: MatchState, team: 0 | 1) => s.players.filter((p) => p.team !== team && !p.sentOff);
export const keeperOf = (s: MatchState, team: 0 | 1) => s.players.find((p) => p.team === team && p.role === 'GK')!;
