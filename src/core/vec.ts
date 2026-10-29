// Small 2D/3D helpers used by gameplay logic (kept free of three.js so logic is testable).

export interface V2 {
  x: number;
  z: number;
}
export interface V3 {
  x: number;
  y: number;
  z: number;
}

export const v2 = (x = 0, z = 0): V2 => ({ x, z });
export const v3 = (x = 0, y = 0, z = 0): V3 => ({ x, y, z });
export const len2 = (a: V2) => Math.hypot(a.x, a.z);
export const dist2 = (a: V2, b: V2) => Math.hypot(a.x - b.x, a.z - b.z);
export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function norm2(a: V2): V2 {
  const l = Math.hypot(a.x, a.z);
  return l > 1e-6 ? { x: a.x / l, z: a.z / l } : { x: 0, z: 0 };
}

/** Shortest signed angle difference b - a in (-PI, PI]. */
export function angleDiff(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/** Distance from point p to segment ab (2D). */
export function distToSegment(p: V2, a: V2, b: V2): number {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const l2 = abx * abx + abz * abz;
  let t = l2 > 0 ? ((p.x - a.x) * abx + (p.z - a.z) * abz) / l2 : 0;
  t = clamp(t, 0, 1);
  return Math.hypot(p.x - (a.x + abx * t), p.z - (a.z + abz * t));
}

export function rand(lo: number, hi: number): number {
  return lo + Math.random() * (hi - lo);
}
