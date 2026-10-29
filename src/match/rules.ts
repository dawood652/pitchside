// Restart decisions. Pure functions.

import { BoundaryEvent } from '../physics/ball';
import { PITCH } from '../data/tuning';

export type RestartKind = 'kickoff' | 'goalkick' | 'corner' | 'throwin' | 'freekick' | 'indirect' | 'penalty';

export interface Restart {
  kind: RestartKind;
  team: 0 | 1;
  x: number;
  z: number;
}

/**
 * attackDir[t] = +1 if team t attacks the +x goal.
 * Returns the restart (and for goals, the scoring team is the team attacking that side).
 */
export function decideRestart(
  ev: BoundaryEvent,
  lastTouch: 0 | 1,
  attackDir: [number, number],
): { restart: Restart; scorer?: 0 | 1 } {
  if (ev.kind === 'goal') {
    const scorer = (attackDir[0] === ev.side ? 0 : 1) as 0 | 1;
    const conceding = (1 - scorer) as 0 | 1;
    return { restart: { kind: 'kickoff', team: conceding, x: 0, z: 0 }, scorer };
  }
  if (ev.kind === 'touchline') {
    const team = (1 - lastTouch) as 0 | 1;
    const x = Math.max(-PITCH.halfL + 1, Math.min(PITCH.halfL - 1, ev.x));
    return { restart: { kind: 'throwin', team, x, z: ev.side * (PITCH.halfW + 0.25) } };
  }
  // Byline: defending team is the one whose own goal is on this side
  const defending = (attackDir[0] === -ev.side ? 0 : 1) as 0 | 1;
  const zs = ev.z >= 0 ? 1 : -1;
  if (lastTouch === defending) {
    const attacking = (1 - defending) as 0 | 1;
    return { restart: { kind: 'corner', team: attacking, x: ev.side * (PITCH.halfL - 0.4), z: zs * (PITCH.halfW - 0.4) } };
  }
  return { restart: { kind: 'goalkick', team: defending, x: ev.side * (PITCH.halfL - PITCH.sixDepth), z: zs * 4 } };
}

export type Card = 'none' | 'yellow' | 'red';

/**
 * Foul decision for a tackle on the ball carrier.
 * fromBehind: tackler came from behind the carrier. won: tackle won the ball. bodyContact: tackler reached the carrier's body.
 */
export function judgeTackle(fromBehind: boolean, won: boolean, bodyContact: boolean, rnd: () => number = Math.random): { foul: boolean; card: Card } {
  let p = 0;
  if (won) p = fromBehind ? 0.08 : 0.005;
  else if (bodyContact) p = fromBehind ? 0.18 : 0.015;
  if (rnd() >= p) return { foul: false, card: 'none' };
  const r = rnd();
  const card: Card = fromBehind ? (r < 0.025 ? 'red' : r < 0.25 ? 'yellow' : 'none') : r < 0.05 ? 'yellow' : 'none';
  return { foul: true, card };
}

/** Free kick or penalty for the fouled team. dirFouled = attack direction of the fouled team. */
export function foulRestart(x: number, z: number, fouledTeam: 0 | 1, dirFouled: number): Restart {
  const inBox = x * dirFouled > PITCH.halfL - PITCH.boxDepth && Math.abs(z) < PITCH.boxHalfWidth;
  if (inBox) return { kind: 'penalty', team: fouledTeam, x: dirFouled * (PITCH.halfL - PITCH.penaltySpot), z: 0 };
  const cx = Math.max(-PITCH.halfL + 1, Math.min(PITCH.halfL - 1, x));
  const cz = Math.max(-PITCH.halfW + 1, Math.min(PITCH.halfW - 1, z));
  return { kind: 'freekick', team: fouledTeam, x: cx, z: cz };
}

/**
 * Offside at the moment of a pass: receiver in the opponents' half, ahead of the ball and of the
 * second-last opponent (keeper counts). Positions are x coordinates; dir = passing team's attack direction.
 */
export function isOffside(receiverX: number, ballX: number, opponentXs: number[], dir: number): boolean {
  const r = receiverX * dir;
  if (r <= 0) return false;
  if (r <= ballX * dir) return false;
  const opp = opponentXs.map((x) => x * dir).sort((a, b) => b - a);
  const secondLast = opp.length > 1 ? opp[1] : -Infinity;
  return r > secondLast + 0.25;
}
