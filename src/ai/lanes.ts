// Passing-lane safety by timing (after GRF's AI_GetPass / AI_GetTimeNeededForDistance): for points
// along the pass, compare when the ball gets there with when the quickest opponent could. The margin
// (seconds, + = the ball wins) replaces a plain distance-to-line check: a defender 3 m from a long,
// slow lane can still cut it out, one 1.5 m from a short zipped pass cannot.

import { Player } from '../entities/player';
import { V2 } from '../core/vec';
import { AI } from '../data/tuning';
import { groundPass } from '../match/kicks';

/** Seconds an opponent needs to reach a point (reaction + run, reach radius subtracted). */
function timeTo(o: Player, x: number, z: number): number {
  const d = Math.max(0, Math.hypot(x - o.pos.x, z - o.pos.z) - AI.interceptReach);
  // already running that way helps
  const vx = o.vel.x;
  const vz = o.vel.z;
  const toward = d > 0.01 ? (vx * (x - o.pos.x) + vz * (z - o.pos.z)) / (d + AI.interceptReach) : 0;
  const head = Math.max(0, toward) * 0.08;
  return AI.reaction + d / AI.runSpeed - head;
}

/** Smallest time margin along a ground pass from `from` to `to` (seconds, + = the ball wins). */
export function laneMargin(from: V2, to: V2, opponents: Player[]): number {
  const T = groundPass(from, to).t; // the same solver the pass itself uses
  let worst = 99;
  for (let k = 1; k <= AI.laneSamples; k++) {
    const f = k / (AI.laneSamples + 1); // the receiver meets the ball before its end point
    const x = from.x + (to.x - from.x) * f;
    const z = from.z + (to.z - from.z) * f;
    // the ball slows over the pass, so later points come disproportionately later
    const tb = AI.kickDelay + T * f ** 1.2;
    for (const o of opponents) worst = Math.min(worst, timeTo(o, x, z) - tb);
  }
  return worst;
}
