// Picks football animations (Google Research Football set, retargeted by tools/add-mocap.mjs) for a
// touch, trap, pass or shot from the player's speed and the angle the ball or body must go.
import catalogue from '../assets/gf-anims.json';

export type GfCat = 'pass' | 'shot' | 'ballcontrol' | 'trap' | 'sliding';
interface Entry {
  clip: string;
  cat: GfCat;
  speed: string;
  angle: number;
  ballAngle: number | null;
  touch: number | null;
}
const ENTRIES = catalogue as Entry[];
const SPEEDS = ['idle', 'dribble', 'walk', 'sprint'];

export function speedClass(v: number): number {
  return v < 0.8 ? 0 : v < 3.2 ? 1 : v < 5.6 ? 2 : 3;
}

/**
 * Best clip for an event. angleDeg: + = to the player's left. Returns the clip and the time of the
 * ball contact inside it, or null when the set has nothing for that category.
 */
export function pickGf(cat: GfCat, speed: number, angleDeg: number, salt = 0): { clip: string; touch: number } | null {
  const sc = speedClass(speed);
  let best: Entry | null = null;
  let bestCost = 1e9;
  for (const e of ENTRIES) {
    if (e.cat !== cat) continue;
    const a = cat === 'pass' || cat === 'shot' ? (e.ballAngle ?? e.angle) : e.angle;
    let d = Math.abs(a - angleDeg) % 360;
    if (d > 180) d = 360 - d;
    // a little variety between near-equal clips
    const jitter = ((e.clip.length * 31 + salt * 17) % 7) * 0.02;
    // last-ditch stretches only when nothing else fits
    const special = /lastditch|reach/.test(e.clip) ? 1.5 : 0;
    const cost = d / 40 + Math.abs(SPEEDS.indexOf(e.speed) - sc) * 0.9 + jitter + special;
    if (cost < bestCost) {
      bestCost = cost;
      best = e;
    }
  }
  return best ? { clip: best.clip, touch: best.touch ?? 0.15 } : null;
}
