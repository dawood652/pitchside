// Picks football animations (Google Research Football set, retargeted by tools/add-mocap.mjs) for a
// touch, trap, pass, shot, header, block, keeper save, trip or turn from the player's speed, the
// angle the ball or body must go, and (where it matters) where the ball meets the body.
import catalogue from '../assets/gf-anims.json';
import type { AnimCat } from '../entities/player';

export type GfCat = AnimCat;
export interface GfEntry {
  clip: string;
  cat: GfCat;
  speed: string;
  angle: number;
  ballAngle: number | null;
  touch: number | null;
  h?: number;
  side?: number;
  fwd?: number;
  bump?: number;
  trip?: number;
  lay?: string;
}
const ENTRIES = catalogue as GfEntry[];
const SPEEDS = ['idle', 'dribble', 'walk', 'sprint'];
/** Nominal speed of each GRF speed class (m/s), for speed-matched playback. */
export const CLASS_SPEED = [0, 3.5, 5, 7.5];

export function speedClass(v: number): number {
  return v < 0.8 ? 0 : v < 3.2 ? 1 : v < 5.6 ? 2 : 3;
}

export interface GfWant {
  h?: number; // contact height (m)
  side?: number; // contact to the side (m, + = left)
  severity?: number; // trips: 1 stumble, 2 fall, 3 heavy fall
  lay?: string; // stand-ups: which way the player is lying
}

export interface GfPick {
  clip: string;
  touch: number;
  entry: GfEntry;
}

const angDist = (a: number, b: number) => {
  let d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

/** Cost of an entry for a wish; lower is better. Exported for tests. */
export function gfCost(e: GfEntry, cat: GfCat, sc: number, angleDeg: number, want: GfWant, salt: number): number {
  const a = cat === 'pass' || cat === 'shot' || cat === 'header' ? (e.ballAngle ?? e.angle) : cat === 'trip' ? (e.bump ?? 0) : e.angle;
  // a little variety between near-equal clips
  const jitter = ((e.clip.length * 31 + salt * 17) % 7) * 0.02;
  let cost = jitter + Math.abs(SPEEDS.indexOf(e.speed) - sc) * 0.9;
  if (cat === 'deflect' || cat === 'interfere') {
    // where the hands / foot meet the ball matters more than the turn
    cost += Math.abs((e.side ?? 0) - (want.side ?? 0)) * 1.4 + Math.abs((e.h ?? 0) - (want.h ?? 0)) * 1.2;
    return cost;
  }
  cost += angDist(a, angleDeg) / 40;
  if (want.h !== undefined && e.h !== undefined) cost += Math.abs(e.h - want.h) * (cat === 'chest' ? 2.5 : 1.5);
  if (cat === 'trip') {
    const sev = want.severity ?? 1;
    cost += Math.abs((e.trip ?? 1) - sev) * 1.2 + (sev >= 2 ? (e.lay ? 0 : 2.5) : e.lay ? 3 : 0);
  }
  if (cat === 'standup') cost += /front/.test(e.clip) === (want.lay === 'lay_front') ? 0 : 3;
  // last-ditch stretches and diving headers only when nothing else fits
  if (/lastditch|reach/.test(e.clip)) cost += 1.5;
  if (/headerdive/.test(e.clip)) cost += want.h !== undefined && want.h < 1.2 ? 0 : 2.5;
  return cost;
}

/**
 * Best clip for an event. angleDeg: + = to the player's left. Returns the clip and the time of the
 * ball contact inside it, or null when the set has nothing for that category.
 */
export function pickGf(cat: GfCat, speed: number, angleDeg: number, salt = 0, want: GfWant = {}): GfPick | null {
  const sc = speedClass(speed);
  let best: GfEntry | null = null;
  let bestCost = 1e9;
  for (const e of ENTRIES) {
    if (e.cat !== cat) continue;
    const cost = gfCost(e, cat, sc, angleDeg, want, salt);
    if (cost < bestCost) {
      bestCost = cost;
      best = e;
    }
  }
  return best ? { clip: best.clip, touch: best.touch ?? 0.15, entry: best } : null;
}

export function gfEntry(clip: string): GfEntry | undefined {
  return ENTRIES.find((e) => e.clip === clip);
}
