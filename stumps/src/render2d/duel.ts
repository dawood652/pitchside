// Glue between the game clock and the 2D batting view: which animation frame to show, where the
// ball is in the side-on picture, and aiming by tapping the field map.
import { BAT } from '../batting/tuning';
import { v, V } from '../batting/vec';
import { A_HOLD, lerp2, P2, SWEET_AT_CONTACT } from './keys';
import { bowler2d } from './bowl2d';
import { BallSample } from '../batting/physics';

/** Animation time for ball time bt. Before the tap the batter steps in and holds the top of the
 *  backlift; the tap sets off the downswing so the bat meets the ball when the engine says it does.
 *  An early or late tap stretches the remaining stride and downswing instead of jumping. */
export function animTime(bt: number, tIdeal: number, tapT: number | null): number {
  const pred = tIdeal + BAT.LEAD;
  if (tapT === null || bt < tapT) return Math.min(bt - pred, A_HOLD);
  const tc = tapT + BAT.LEAD;
  const aTap = Math.min(tapT - pred, A_HOLD);
  if (bt < tc) return aTap + ((bt - tapT) * (0 - aTap)) / (tc - tapT);
  return bt - tc;
}

/** Field point -> side-on picture (x from the popping crease toward the bowler, y up). Around a
 *  real hit the ball is pulled onto the bat's sweet spot so they visibly meet. */
export function ball2d(p: V | null, bt: number, contactT: number | null): P2 | null {
  if (!p) return null;
  const b = { x: p.z - 1.22, y: p.y };
  if (contactT === null) return b;
  const k = 1 - Math.min(1, Math.abs(bt - contactT) / 0.07);
  return k > 0 ? lerp2(b, SWEET_AT_CONTACT, k) : b;
}

/** The field map (off side on the right, bowler up) -> a target on the field. */
export function mapTarget(map: HTMLCanvasElement, e: PointerEvent): V {
  const r = map.getBoundingClientRect();
  const W = map.width;
  const px = ((e.clientX - r.left) / r.width) * W;
  const py = ((e.clientY - r.top) / r.height) * W;
  const R = W / 2 - 14;
  return v(((px - W / 2) / R) * 66, 0, ((W / 2 - py) / R) * 66);
}

/** How far down the pitch the camera must see: the bowler running in, then the ball as it comes. */
export function camFocus(bt: number, ball: P2 | null, contactT: number | null): number {
  if (bt < 0) return bowler2d(bt).pel.x + 2.6; // room past the bowler, clear of the buttons
  if (contactT === null && ball && ball.x > 0) return ball.x + 3;
  return 8.5;
}

/** First bounce of a delivery (time and picture x), if it pitches. */
export function bounceOf(path: BallSample[]): { t: number; x: number } | null {
  for (let i = 1; i < path.length; i++) if (path[i].p.y < 0.06 && path[i].p.z > 0.5) return { t: path[i].t, x: path[i].p.z - 1.22 };
  return null;
}
