// Minimal 3D vector maths for the batting model (plain objects, no allocation-heavy classes).
export interface V {
  x: number;
  y: number;
  z: number;
}
export const v = (x = 0, y = 0, z = 0): V => ({ x, y, z });
export const add = (a: V, b: V): V => v(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a: V, b: V): V => v(a.x - b.x, a.y - b.y, a.z - b.z);
export const mul = (a: V, s: number): V => v(a.x * s, a.y * s, a.z * s);
export const dot = (a: V, b: V): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: V, b: V): V => v(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
export const len = (a: V): number => Math.hypot(a.x, a.y, a.z);
export const norm = (a: V): V => {
  const l = len(a) || 1;
  return v(a.x / l, a.y / l, a.z / l);
};
export const lerp = (a: V, b: V, t: number): V => v(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
export const dist = (a: V, b: V): number => len(sub(a, b));
export const UP = v(0, 1, 0);
/** Rotate p about an axis (unit) through `o` by angle a (Rodrigues). */
export function rotAbout(p: V, o: V, axis: V, a: number): V {
  const r = sub(p, o);
  const c = Math.cos(a);
  const s = Math.sin(a);
  const k = axis;
  const out = add(add(mul(r, c), mul(cross(k, r), s)), mul(k, dot(k, r) * (1 - c)));
  return add(out, o);
}
export const rotDir = (d: V, axis: V, a: number): V => rotAbout(d, v(), axis, a);
/** Remove the component of a along unit n, normalised. */
export const ortho = (a: V, n: V): V => norm(sub(a, mul(n, dot(a, n))));
/** Unit direction on the ground for a field angle (0 = straight back past the bowler, + = off side). */
export const dirOf = (ang: number): V => v(Math.sin(ang), 0, Math.cos(ang));
export const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Two-bone IK: joint position for root -> end reaching `target`, bending toward `pole`. */
export function ik2(root: V, target: V, l1: number, l2: number, pole: V): { mid: V; end: V } {
  const toT = sub(target, root);
  const d = Math.min(l1 + l2 - 1e-3, Math.max(0.05, len(toT)));
  const dir = norm(toT);
  const x = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  const perp = ortho(pole, dir);
  const mid = add(add(root, mul(dir, x)), mul(perp, h));
  return { mid, end: add(root, mul(dir, d)) };
}
