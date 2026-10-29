// Match orchestrator: phases (kick-off, play, restarts, goals, half-time), clock, score, fouls and set pieces.

import { Player } from '../entities/player';
import { BallSim, checkBoundary } from '../physics/ball';
import { FORMATION_433, kickoffPosition } from '../data/formations';
import { squadNames } from '../data/names';
import { TeamDef } from '../data/teams';
import { MATCH, PITCH } from '../data/tuning';
import { MatchState, keeperOf } from './state';
import { decideRestart, Restart } from './rules';
import { carryBall, looseBall, resolveTackles, separate, setOwner, stealLooseTouch } from './control';
import { updatePendingKick, passTo, throwTo, shootBy } from './actions';
import { updateHuman, autoSwitch, pickReceiver } from './human';
import { updateTeamAI } from '../ai/teamAI';
import { updateKeeper } from '../ai/keeper';
import { Input } from '../core/input';

const DIFF_RATING = [-8, 0, 6];

export class Game {
  s: MatchState;

  constructor(home: TeamDef, away: TeamDef, halfSeconds: number, humanActive = true, difficulty = 1) {
    const players: Player[] = [];
    let id = 0;
    ([home, away] as TeamDef[]).forEach((t, ti) => {
      const names = squadNames(t.id);
      const rating = t.rating + (humanActive && ti === 1 ? DIFF_RATING[difficulty] : 0);
      FORMATION_433.forEach((slot, i) => players.push(new Player(id++, ti as 0 | 1, slot, names[i], rating, id * 7 + ti * 131)));
    });
    this.s = {
      teams: [home, away],
      players,
      ball: new BallSim(),
      owner: null,
      lastTouch: 0,
      lastToucher: null,
      attackDir: [1, -1],
      score: [0, 0],
      half: 1,
      clock: 0,
      halfLen: halfSeconds,
      phase: 'kickoff',
      phaseT: 0,
      restart: null,
      taker: null,
      firstKickoff: 0,
      humanTeam: 0,
      humanActive,
      controlled: players[9],
      intendedReceiver: null,
      pending: null,
      shotSide: 0,
      keeperWillSave: false,
      scorer: null,
      events: [],
      excitement: 0,
      shotCharge: -1,
      stats: { shots: [0, 0], possession: [0, 0] },
      difficulty,
      offsideCandidate: null,
      pendingFoul: null,
      penaltyShot: false,
      wall: [],
      diveHint: 0,
      humanMove: null,
      assist: { collect: true, autoSwitch: 'auto', autoSprint: false },
      lastSwitchT: 0,
      nextSwitch: null,
      time: 0,
      tapPass: null,
    };
    this.setupKickoff(0);
  }

  /** Match minute shown on the scoreboard. */
  get minute(): number {
    const m = Math.floor((this.s.clock / this.s.halfLen) * 45) + (this.s.half === 2 ? 45 : 0);
    return Math.min(m, this.s.half === 1 ? 45 : 90);
  }

  private clearPlayState(): void {
    const s = this.s;
    s.owner = null;
    s.pending = null;
    s.shotSide = 0;
    s.intendedReceiver = null;
    s.offsideCandidate = null;
    s.penaltyShot = false;
    s.wall = [];
  }

  setupKickoff(team: 0 | 1): void {
    const s = this.s;
    s.phase = 'kickoff';
    s.phaseT = 0;
    this.clearPlayState();
    s.restart = { kind: 'kickoff', team, x: 0, z: 0 };
    for (const p of s.players) {
      if (p.sentOff) continue;
      const kp = kickoffPosition(p.slot, p.team === team);
      const dir = s.attackDir[p.team];
      p.pos = { x: kp.x * dir, z: kp.z * dir };
      p.vel = { x: 0, z: 0 };
      p.desired = { x: 0, z: 0 };
      p.action = 'none';
      p.holdingBall = false;
      p.stun = 0;
      p.lockout = 0;
      p.facing = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    s.ball.place(0, 0);
    const taker = s.players.find((p) => p.team === team && p.number === 9 && !p.sentOff) ?? s.players.find((p) => p.team === team && p.role !== 'GK' && !p.sentOff)!;
    taker.pos = { x: -0.6 * s.attackDir[team], z: 0.2 };
    s.taker = taker;
    setOwner(s, taker);
    if (team === s.humanTeam) s.controlled = taker;
    else s.controlled = s.players.find((p) => p.team === s.humanTeam && p.role !== 'GK' && !p.sentOff && p.number === 9) ?? s.players.find((p) => p.team === s.humanTeam && p.role !== 'GK' && !p.sentOff)!;
    s.events.push({ type: 'whistle' });
  }

  private nearestOf(team: 0 | 1, x: number, z: number, filter: (p: Player) => boolean = () => true): Player {
    let best: Player | null = null;
    let bd = 1e9;
    for (const p of this.s.players) {
      if (p.team !== team || p.role === 'GK' || p.sentOff || !filter(p)) continue;
      const d = Math.hypot(p.pos.x - x, p.pos.z - z);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best!;
  }

  private setupRestart(r: Restart): void {
    const s = this.s;
    s.phase = 'restart';
    s.phaseT = 0;
    this.clearPlayState();
    s.restart = r;
    s.ball.place(r.x, r.z);
    for (const p of s.players) {
      if (p.action !== 'stumble') p.action = 'none';
      p.holdingBall = false;
    }
    const dir = s.attackDir[r.team];
    const goal = { x: dir * PITCH.halfL, z: 0 };
    let taker: Player;
    if (r.kind === 'goalkick') taker = keeperOf(s, r.team);
    else if (r.kind === 'penalty') {
      const shooters = s.players.filter((p) => p.team === r.team && p.role !== 'GK' && !p.sentOff);
      taker = shooters.reduce((a, b) => (b.ratings.shooting > a.ratings.shooting ? b : a));
    } else taker = this.nearestOf(r.team, r.x, r.z, (p) => p.action !== 'stumble');

    // Taker stands behind the ball facing where the play goes
    let inward: { x: number; z: number };
    if (r.kind === 'throwin') inward = { x: 0, z: -Math.sign(r.z) };
    else if (r.kind === 'freekick' || r.kind === 'indirect' || r.kind === 'penalty') inward = { x: goal.x - r.x, z: goal.z - r.z };
    else inward = { x: -Math.sign(r.x), z: -Math.sign(r.z) * 0.4 };
    const il = Math.hypot(inward.x, inward.z) || 1;
    const back = r.kind === 'penalty' ? 1.6 : 0.5;
    taker.pos = { x: r.x - (inward.x / il) * back, z: r.z - (inward.z / il) * back };
    taker.vel = { x: 0, z: 0 };
    taker.facing = Math.atan2(inward.x, inward.z);
    taker.action = 'none';
    s.taker = taker;
    setOwner(s, taker);
    taker.holdingBall = r.kind === 'throwin';
    if (r.team === s.humanTeam) s.controlled = taker.role === 'GK' ? s.controlled : taker;
    else if (s.controlled.sentOff) s.controlled = this.nearestOf(s.humanTeam, r.x, r.z);

    if (r.kind === 'freekick') this.buildWall(r, goal);
    if (r.kind === 'penalty') this.clearBox(r, taker);
    s.events.push({ type: 'whistle' });
  }

  /** Defenders form a wall 9.15 m from the ball on the line to goal. */
  private buildWall(r: Restart, goal: { x: number; z: number }): void {
    const s = this.s;
    const dx = goal.x - r.x;
    const dz = goal.z - r.z;
    const d = Math.hypot(dx, dz);
    if (d > 34) return;
    const def = (1 - r.team) as 0 | 1;
    const n = d < 22 ? 4 : 3;
    const nx = dx / d;
    const nz = dz / d;
    const cx = r.x + nx * 9.15;
    const cz = r.z + nz * 9.15;
    const used = new Set<Player>();
    for (let i = 0; i < n; i++) {
      const p = this.nearestOf(def, cx, cz, (q) => !used.has(q));
      if (!p) break;
      used.add(p);
      const off = (i - (n - 1) / 2) * 0.7;
      p.pos = { x: cx - nz * off, z: cz + nx * off };
      p.vel = { x: 0, z: 0 };
      p.faceTowards(r.x, r.z);
      s.wall.push(p);
    }
    // Keeper covers the far side
    const gk = keeperOf(s, def);
    gk.pos = { x: goal.x - Math.sign(goal.x) * 0.8, z: Math.sign(-r.z || 1) * 1.2 };
  }

  /** Penalty: everyone except taker and keeper leaves the box and the arc. */
  private clearBox(r: Restart, taker: Player): void {
    const s = this.s;
    const side = Math.sign(r.x);
    const edge = side * (PITCH.halfL - PITCH.boxDepth - 2);
    let i = 0;
    for (const p of s.players) {
      if (p === taker || p.sentOff) continue;
      if (p.role === 'GK') {
        if (p.team !== r.team) {
          p.pos = { x: side * (PITCH.halfL - 0.3), z: 0 };
          p.faceTowards(r.x, 0);
        }
        continue;
      }
      if (Math.abs(p.pos.x) > PITCH.halfL - PITCH.boxDepth - 2 && Math.sign(p.pos.x) === side) {
        p.pos = { x: edge - side * ((i % 3) * 1.6), z: -15 + (i % 8) * 4.2 };
        i++;
      }
      p.vel = { x: 0, z: 0 };
    }
  }

  update(dt: number, input: Input): void {
    const s = this.s;
    s.phaseT += dt;
    s.time += dt;
    s.excitement = Math.max(0, s.excitement - dt * 0.25);

    if (s.phase === 'halftime') {
      if (s.phaseT > 3.5) {
        s.half = 2;
        s.clock = 0;
        s.attackDir = [-s.attackDir[0], -s.attackDir[1]];
        this.setupKickoff((1 - s.firstKickoff) as 0 | 1);
      }
      return;
    }
    if (s.phase === 'fulltime') {
      for (const p of s.players) {
        p.desired = { x: 0, z: 0 };
        p.integrate(dt, false);
      }
      return;
    }

    if (s.phase === 'play' || s.phase === 'restart') {
      s.clock += dt;
      if (s.owner) s.stats.possession[s.owner.team] += dt;
      if (s.clock >= s.halfLen && s.phase === 'play') {
        this.endHalf();
        return;
      }
    }

    // Controls and AI
    if (s.phase === 'goal') this.celebrate(dt);
    else {
      if (s.humanActive) updateHuman(s, input, dt);
      for (const t of [0, 1] as const) {
        updateTeamAI(s, t, dt);
        updateKeeper(s, keeperOf(s, t), dt);
      }
      this.restartAI();
    }

    // Movement
    for (const p of s.players) {
      if (p.sentOff) {
        p.desired = { x: 0, z: 0 };
        p.vel = { x: 0, z: 0 };
        continue;
      }
      if (s.phase === 'kickoff' && p !== s.taker) p.desired = { x: 0, z: 0 };
      if (s.phase === 'restart' && (s.wall.includes(p) || (s.restart?.kind === 'penalty' && p.role === 'GK'))) p.desired = { x: 0, z: 0 };
      p.integrate(dt, p === s.owner);
    }

    updatePendingKick(s, dt);
    if ((s.phase === 'kickoff' || s.phase === 'restart') && !s.owner && !s.pending) {
      s.phase = 'play';
      s.phaseT = 0;
      s.restart = null;
      s.taker = null;
      s.wall = [];
    }

    if (s.owner) carryBall(s, dt);
    else {
      s.ball.step(dt);
      if (s.phase === 'play') {
        resolveTackles(s);
        looseBall(s);
      }
    }
    if (s.phase === 'play' && s.owner) {
      resolveTackles(s);
      stealLooseTouch(s);
    }
    separate(s);
    if (s.phase === 'play' && s.owner?.team !== s.humanTeam) autoSwitch(s);

    if (s.pendingFoul && s.phase === 'play') {
      const r = s.pendingFoul.restart;
      s.pendingFoul = null;
      this.setupRestart(r);
      return;
    }
    if (s.phase === 'play' && !s.owner) this.checkOut();
    if (s.phase === 'goal' && s.phaseT > MATCH.goalCelebration) {
      const conceding = s.restart!.team;
      this.setupKickoff(conceding);
    }
  }

  private checkOut(): void {
    const s = this.s;
    const ev = checkBoundary(s.ball.pos, s.ball.inNet);
    if (!ev) return;
    const { restart, scorer } = decideRestart(ev, s.lastTouch, s.attackDir);
    if (ev.kind === 'goal' && scorer !== undefined) {
      s.score[scorer]++;
      s.phase = 'goal';
      s.phaseT = 0;
      s.restart = restart;
      s.excitement = 1;
      s.penaltyShot = false;
      const toucher = s.lastToucher && s.lastToucher.team === scorer ? s.lastToucher : null;
      s.scorer = toucher ?? s.players.filter((p) => p.team === scorer && p.role !== 'GK' && !p.sentOff)[8] ?? s.players.find((p) => p.team === scorer && !p.sentOff)!;
      s.scorer.celebrateVariant = (s.scorer.number + s.score[0] + s.score[1]) % 4;
      s.scorer.startAction('celebrate', 99);
      s.events.push({ type: 'goal', team: scorer, scorer: s.scorer.name + (toucher ? '' : ' (o.g.)') });
      return;
    }
    if (s.phaseT < 0.05) return;
    this.setupRestart(restart);
  }

  private endHalf(): void {
    const s = this.s;
    s.events.push({ type: 'whistle', long: true });
    if (s.half === 1) {
      s.phase = 'halftime';
      s.events.push({ type: 'halftime' });
    } else {
      s.phase = 'fulltime';
      s.events.push({ type: 'fulltime' });
      s.owner = null;
    }
    s.phaseT = 0;
  }

  /** Scorer runs to the corner flag, teammates run to join him. */
  private celebrate(dt: number): void {
    const s = this.s;
    const sc = s.scorer!;
    const flag = { x: Math.sign(sc.pos.x || 1) * (PITCH.halfL - 2), z: Math.sign(sc.pos.z || 1) * (PITCH.halfW - 2) };
    for (const p of s.players) {
      p.sprint = false;
      if (p.sentOff) continue;
      if (p === sc) {
        const dx = flag.x - p.pos.x;
        const dz = flag.z - p.pos.z;
        const d = Math.hypot(dx, dz);
        const sp = (sc.celebrateVariant === 0 && d > 3) || (sc.celebrateVariant === 2 && s.phaseT < 1.6) ? 6.5 : 0;
        p.desired = d > 1 ? { x: (dx / d) * sp, z: (dz / d) * sp } : { x: 0, z: 0 };
        if (sp === 0 && d > 1) p.faceTowards(0, 0);
      } else if (p.team === sc.team && p.role !== 'GK' && s.phaseT > 0.8) {
        const dx = sc.pos.x - p.pos.x;
        const dz = sc.pos.z - p.pos.z;
        const d = Math.hypot(dx, dz);
        p.desired = d > 2.5 ? { x: (dx / d) * 5.5, z: (dz / d) * 5.5 } : { x: 0, z: 0 };
      } else p.desired = { x: p.vel.x * 0.9, z: p.vel.z * 0.9 };
    }
    void dt;
  }

  /** AI takers for restarts and kick-offs. */
  private restartAI(): void {
    const s = this.s;
    const t = s.taker;
    if (!t || !(s.phase === 'restart' || s.phase === 'kickoff') || s.pending) return;
    const humanTaker = t === s.controlled && s.humanActive && t.team === s.humanTeam;
    const r = s.restart!;
    const setPiece = r.kind === 'freekick' || r.kind === 'penalty';
    const wait = s.phase === 'kickoff' ? 1.1 : MATCH.restartDelay + (setPiece ? 1.4 : 0.5);
    if (humanTaker && s.phaseT < MATCH.restartAutoTake + (s.phase === 'kickoff' ? 3 : setPiece ? 6 : 0)) return;
    if (!humanTaker && s.phaseT < wait) return;
    if (t.role === 'GK' && s.phase === 'restart') {
      if (s.phaseT > 1.6) {
        t.holdingBall = false;
        const mates = s.players.filter((p) => p.team === t.team && !p.sentOff && (p.role === 'MID' || p.role === 'DEF'));
        const target = mates[Math.floor(Math.random() * mates.length)];
        passTo(s, t, target, Math.abs(target.pos.x - t.pos.x) > 25 ? 'lob' : 'ground');
      }
      return;
    }
    const dir = s.attackDir[t.team];
    if (s.phase === 'kickoff') {
      const mate = s.players.find((p) => p.team === t.team && p.number === 6 && !p.sentOff) ?? pickReceiver(s, t, { x: -dir, z: 0 });
      passTo(s, t, mate, 'ground');
      return;
    }
    const goalX = dir * PITCH.halfL;
    const dGoal = Math.hypot(goalX - s.ball.pos.x, s.ball.pos.z);
    if (r.kind === 'penalty') {
      shootBy(s, t, 0.62 + Math.random() * 0.22, (Math.random() < 0.5 ? -1 : 1) * (Math.random() < 0.15 ? 0 : 1), 'normal');
      return;
    }
    if (r.kind === 'freekick' && dGoal < 30 && Math.abs(s.ball.pos.z) < 22) {
      shootBy(s, t, 0.7, null, 'finesse');
      return;
    }
    if (r.kind === 'freekick' || r.kind === 'indirect') {
      const rec = pickReceiver(s, t, { x: dir, z: 0 }) ?? pickReceiver(s, t, { x: 0, z: -Math.sign(s.ball.pos.z) || 1 });
      passTo(s, t, rec, rec && Math.hypot(rec.pos.x - t.pos.x, rec.pos.z - t.pos.z) > 25 ? 'lob' : 'ground');
      return;
    }
    if (r.kind === 'corner') {
      const inBox = s.players.filter((p) => p.team === t.team && !p.sentOff && p.pos.x * dir > PITCH.halfL - PITCH.boxDepth && Math.abs(p.pos.z) < PITCH.boxHalfWidth);
      const target = inBox.length ? inBox[Math.floor(Math.random() * inBox.length)] : null;
      passTo(s, t, target, 'lob', { x: dir * 0.3, z: -Math.sign(r.z) });
      return;
    }
    if (r.kind === 'throwin') {
      const forward = { x: dir * 0.6, z: -Math.sign(r.z) * 0.8 };
      const rec = pickReceiver(s, t, forward) ?? pickReceiver(s, t, { x: -forward.x, z: forward.z });
      throwTo(s, t, rec ? rec.pos : { x: t.pos.x + dir * 8, z: t.pos.z - Math.sign(r.z) * 8 }, false);
    }
  }
}
