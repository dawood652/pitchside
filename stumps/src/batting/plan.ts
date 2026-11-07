// Turns a tap into a swing. The bat arrives LEAD seconds after the tap and meets the ball wherever
// it actually is then (within reach), the way a batter adjusts. The timing error doesn't decide
// IF the ball is hit (inside the window it always is) but HOW: direction drift, which part of the
// blade, edges. Line and length still matter: reaching for wide ones risks the edge.
import { aimedSwing, BallSample, Delivery, makeSwing, sampleAt, Swing, timeAtZ } from './physics';
import { chooseShot, Shot } from './shots';
import { BAT } from './tuning';

export type Band = 'PERFECT' | 'Good' | 'Off' | 'Miss';

export interface Plan {
  shot: Shot;
  swing: Swing;
  err: number; // s, + = late
  band: Band;
  lofted: boolean;
}

/** The moment the meter calls perfect (tap time). Same for every shot of a given length. */
export function idealTap(d: Delivery, path: BallSample[]): number {
  return timeAtZ(path, isShort(d) ? BAT.BACK_Z : BAT.FRONT_Z) - BAT.LEAD;
}

export const isShort = (d: Delivery) => d.length === 'short' || d.length === 'bouncer';

export function bandOf(err: number): Band {
  const a = Math.abs(err);
  return a <= BAT.PERFECT ? 'PERFECT' : a <= BAT.GOOD ? 'Good' : a <= BAT.WINDOW ? 'Off' : 'Miss';
}

export function planShot(aim: number, tapDist: number, lofted: boolean, d: Delivery, path: BallSample[], tTap: number, r: () => number): Plan {
  const err = tTap - idealTap(d, path);
  let band = bandOf(err);
  // early: the bat has come round, ball goes squarer to the leg side; late: finer, off side
  const drift = Math.max(-BAT.WINDOW, Math.min(BAT.WINDOW, err)) * BAT.DRIFT;
  const shot = chooseShot(aim + drift, tapDist, lofted, d.length);
  shot.aim = aim + drift; // keep the drifted direction even if the stroke name stays
  const tMeet = tTap + BAT.LEAD;
  if (band === 'Miss') {
    // swung far too early or late: the bat goes through where the ball should have been
    const tC = timeAtZ(path, isShort(d) ? BAT.BACK_Z : BAT.FRONT_Z);
    return { shot, swing: makeSwing(shot, sampleAt(path, tC).p, tTap, BAT.LEAD), err, band, lofted };
  }
  const ball = sampleAt(path, tMeet).p;
  // line: outside the batter's reach
  const offShot = shot.aim > 0.2;
  if (ball.x > BAT.REACH_MAX || (offShot && ball.x < BAT.LEG_MAX)) {
    band = 'Miss';
    const miss = { ...ball, x: ball.x > 0 ? BAT.REACH_MAX - 0.15 : BAT.LEG_MAX + 0.15 };
    return { shot, swing: makeSwing(shot, miss, tTap, BAT.LEAD), err, band, lofted };
  }
  const k = band === 'PERFECT' ? 0 : (Math.abs(err) - BAT.PERFECT) / (BAT.WINDOW - BAT.PERFECT); // 0..1
  let along = band === 'PERFECT' ? 0 : BAT.ALONG_GOOD + (BAT.ALONG_OFF - BAT.ALONG_GOOD) * Math.max(0, (Math.abs(err) - BAT.GOOD) / (BAT.WINDOW - BAT.GOOD));
  if (band !== 'PERFECT') along *= r() < 0.5 ? 1 : -0.8; // toe or splice
  if (d.length === 'yorker') along += BAT.YORKER_DIG;
  // more off = less bat speed and a duller contact: 1-2 runs, not boundaries
  const dull = Math.max(0, (Math.abs(err) - BAT.GOOD) / (BAT.WINDOW - BAT.GOOD));
  if (band === 'Off') {
    shot.speed *= 1 - BAT.OFF_POWER * (0.5 + 0.5 * dull);
    shot.restitution *= 1 - BAT.OFF_POWER * (0.5 + 0.5 * dull);
    shot.loft = Math.min(shot.loft, 0.2); // can't get under it properly
  }
  let edge = band === 'PERFECT' ? 0 : band === 'Good' ? BAT.EDGE_GOOD : BAT.EDGE_GOOD + (BAT.EDGE_OFF - BAT.EDGE_GOOD) * k;
  const reach = Math.max(0, (ball.x - BAT.REACH_OFF) / (BAT.REACH_MAX - BAT.REACH_OFF)); // chasing a wide one
  edge += reach * 0.6;
  if (r() < edge) {
    const across = (r() < 0.7 ? 1 : -1) * (0.05 + r() * 0.025); // mostly the outside edge
    return { shot, swing: makeSwing(shot, ball, tTap, BAT.LEAD, { along, across }), err, band, lofted };
  }
  return { shot, swing: aimedSwing(shot, ball, tTap, BAT.LEAD, path, tMeet, { along }), err, band, lofted };
}
