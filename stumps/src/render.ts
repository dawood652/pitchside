// Behind-the-batter broadcast view drawn with Phaser Graphics from a perspective camera.
import Phaser from 'phaser';
import { add, cross, dot, mul, norm, sub, v, V } from './batting/vec';
import { BAT_LEN, BLADE_FROM, BLADE_HALF_W, batPoint } from './batting/physics';
import { Skeleton } from './batting/body';

export const VW = 960;
export const VH = 540;

export class Cam {
  pos = v(0.5, 2.05, -2.5);
  look = v(0, 0.65, 9);
  F = 640;
  private f = v();
  private r = v();
  private u = v();
  update(): void {
    this.f = norm(sub(this.look, this.pos));
    this.r = norm(cross(v(0, 1, 0), this.f));
    this.u = cross(this.f, this.r);
  }
  /** World -> screen; s = pixels per metre at that depth (0 when behind the camera). */
  p(w: V): { x: number; y: number; s: number } {
    const rel = sub(w, this.pos);
    const z = dot(rel, this.f);
    if (z < 0.05) return { x: -9999, y: -9999, s: 0 };
    return { x: VW / 2 + (dot(rel, this.r) / z) * this.F, y: VH / 2 - (dot(rel, this.u) / z) * this.F, s: this.F / z };
  }
  /** Screen -> point on the ground (y = 0); far away when you tap above the horizon. */
  ground(sx: number, sy: number): V {
    const dir = norm(add(add(this.f, mul(this.r, (sx - VW / 2) / this.F)), mul(this.u, -(sy - VH / 2) / this.F)));
    const t = dir.y < -0.004 ? -this.pos.y / dir.y : 400;
    return add(this.pos, mul(dir, Math.min(400, t)));
  }
}

const KIT = 0x0f8a4c;
const SKIN = 0xc68642;

export function drawGround(g: Phaser.GameObjects.Graphics, c: Cam): void {
  const hz = c.p(v(0, 0, 400)).y;
  g.fillGradientStyle(0x6fb3ea, 0x6fb3ea, 0xcfe7fb, 0xcfe7fb, 1);
  g.fillRect(0, 0, VW, hz);
  // stands: two tiers with a speckled crowd
  g.fillStyle(0x2b3442, 1);
  g.fillRect(0, hz - 70, VW, 70);
  const cols = [0xe63946, 0xf1faee, 0xffb703, 0x2a9d8f, 0x3a86ff, 0xfb5607, 0x8338ec, 0x06d6a0];
  for (let y = hz - 66; y < hz - 6; y += 5) for (let x = (y % 2) * 3; x < VW; x += 6) {
    g.fillStyle(cols[(x * 7 + y * 13) % cols.length], 0.85);
    g.fillRect(x, y, 3, 3);
  }
  g.fillStyle(0x1b2430, 1);
  g.fillRect(0, hz - 6, VW, 6);
  // outfield with mowing stripes converging to the horizon
  g.fillGradientStyle(0x3f8f38, 0x3f8f38, 0x2f7a2c, 0x2f7a2c, 1);
  g.fillRect(0, hz, VW, VH - hz);
  for (let i = -20; i < 20; i += 2) {
    const a = c.p(v(i * 4, 0, 120));
    const b = c.p(v((i + 1) * 4, 0, 120));
    const a2 = c.p(v(i * 4, 0, -2));
    const b2 = c.p(v((i + 1) * 4, 0, -2));
    g.fillStyle(0xffffff, 0.045);
    g.fillPoints([a, b, b2, a2] as Phaser.Types.Math.Vector2Like[], true);
  }
  // pitch
  const quad = (x0: number, x1: number, z0: number, z1: number, col: number, al = 1) => {
    g.fillStyle(col, al);
    g.fillPoints([c.p(v(x0, 0, z0)), c.p(v(x1, 0, z0)), c.p(v(x1, 0, z1)), c.p(v(x0, 0, z1))] as Phaser.Types.Math.Vector2Like[], true);
  };
  quad(-1.5, 1.5, -1.2, 21.3, 0xc9b07a);
  quad(-1.5, 1.5, 3, 17, 0xb89c62, 0.35);
  const line = (a: V, b: V) => {
    const p = c.p(a);
    const q = c.p(b);
    g.lineStyle(Math.max(1, p.s * 0.045), 0xffffff, 0.92);
    g.lineBetween(p.x, p.y, q.x, q.y);
  };
  for (const z of [1.22, 20.12 - 1.22]) line(v(-1.5, 0, z), v(1.5, 0, z));
  for (const z of [0, 20.12]) line(v(-1.32, 0, z), v(1.32, 0, z));
  for (const s of [-1, 1]) {
    line(v(s * 1.32, 0, -0.6), v(s * 1.32, 0, 1.22));
    line(v(s * 1.32, 0, 20.12 - 1.22), v(s * 1.32, 0, 20.8));
  }
}

export function drawStumps(g: Phaser.GameObjects.Graphics, c: Cam, z: number, fall = 0): void {
  for (const x of [-0.114, 0, 0.114]) {
    const lean = fall * (x === 0 ? 0.25 : x > 0 ? 0.5 : -0.45);
    const a = c.p(v(x, 0, z));
    const b = c.p(v(x + lean * 0.5, 0.71 * (1 - fall * 0.25), z - fall * 0.3));
    g.lineStyle(Math.max(2, a.s * 0.034), 0xf3e8cc, 1);
    g.lineBetween(a.x, a.y, b.x, b.y);
  }
  if (!fall) {
    const l = c.p(v(-0.114, 0.715, z));
    const r = c.p(v(0.114, 0.715, z));
    g.lineStyle(Math.max(1.5, l.s * 0.02), 0xd9a441, 1);
    g.lineBetween(l.x, l.y, r.x, r.y);
  }
}

function seg(g: Phaser.GameObjects.Graphics, c: Cam, a: V, b: V, w: number, col: number, alpha = 1): void {
  const p = c.p(a);
  const q = c.p(b);
  const lw = Math.max(1.5, ((p.s + q.s) / 2) * w);
  g.lineStyle(lw, col, alpha);
  g.lineBetween(p.x, p.y, q.x, q.y);
  g.fillStyle(col, alpha);
  g.fillCircle(p.x, p.y, lw / 2);
  g.fillCircle(q.x, q.y, lw / 2);
}

/** The batter: pads, gloves, helmet and a proper bat with a blade and a handle. */
export function drawBatter(g: Phaser.GameObjects.Graphics, c: Cam, k: Skeleton): void {
  const back = (p: V) => dot(sub(p, c.pos), norm(sub(c.look, c.pos)));
  // draw the far side first so limbs overlap correctly
  const farLegR = back(k.knR) > back(k.knL);
  const legs: [V, V, V, V][] = [
    [k.hipR, k.knR, k.ftR, k.toeR],
    [k.hipL, k.knL, k.ftL, k.toeL],
  ];
  if (!farLegR) legs.reverse();
  for (const [hip, kn, ft, toe] of legs) {
    seg(g, c, hip, kn, 0.13, 0xf4f4ef); // trousers
    seg(g, c, add(kn, v(0, 0.12, 0)), ft, 0.17, 0xfafafa); // pad
    seg(g, c, add(kn, v(0, 0.14, 0)), add(kn, v(0, 0.02, 0)), 0.2, 0xe9e9e4);
    seg(g, c, ft, toe, 0.1, 0x222222); // boot
  }
  seg(g, c, k.pelvis, k.neck, 0.24, KIT);
  seg(g, c, k.shL, k.shR, 0.16, KIT);
  // bat behind the arms when it is behind the body
  const batFar = back(batPoint(k.bat, 0.6)) > back(k.neck);
  if (batFar) drawBat(g, c, k);
  for (const [sh, el, ha] of [
    [k.shR, k.elR, k.haR],
    [k.shL, k.elL, k.haL],
  ] as [V, V, V][]) {
    seg(g, c, sh, el, 0.1, KIT);
    seg(g, c, el, ha, 0.085, SKIN);
    seg(g, c, ha, ha, 0.13, 0xffffff); // glove
  }
  if (!batFar) drawBat(g, c, k);
  // helmet with a grille toward the ball
  const h = c.p(k.head);
  g.fillStyle(0x0b2545, 1);
  g.fillCircle(h.x, h.y, Math.max(4, h.s * 0.125));
  const peak = c.p(add(k.head, mul(norm(sub(k.look, k.head)), 0.1)));
  g.lineStyle(Math.max(1.5, h.s * 0.03), 0x9aa3ad, 1);
  g.lineBetween(h.x, h.y + h.s * 0.02, peak.x, peak.y + h.s * 0.04);
}

function drawBat(g: Phaser.GameObjects.Graphics, c: Cam, k: Skeleton): void {
  const b = k.bat;
  const corners = [batPoint(b, BLADE_FROM, -BLADE_HALF_W), batPoint(b, BLADE_FROM, BLADE_HALF_W), batPoint(b, BAT_LEN, BLADE_HALF_W), batPoint(b, BAT_LEN, -BLADE_HALF_W)].map((p) => c.p(p));
  g.fillStyle(0xe7cd8f, 1);
  g.fillPoints(corners as Phaser.Types.Math.Vector2Like[], true);
  g.lineStyle(1, 0x9c7a3c, 0.8);
  g.strokePoints(corners as Phaser.Types.Math.Vector2Like[], true);
  // a sticker on the back so you can see which way the face points
  const sticker = [batPoint(b, 0.4, -0.04), batPoint(b, 0.4, 0.04), batPoint(b, 0.62, 0.04), batPoint(b, 0.62, -0.04)].map((p) => c.p(p));
  const faceToCam = dot(b.n, norm(sub(c.pos, batPoint(b, 0.5)))) > 0;
  if (!faceToCam) {
    g.fillStyle(0x1d4ed8, 1);
    g.fillPoints(sticker as Phaser.Types.Math.Vector2Like[], true);
  }
  seg(g, c, b.h, batPoint(b, BLADE_FROM), 0.035, 0x151515); // handle grip
}

export function drawBall(g: Phaser.GameObjects.Graphics, c: Cam, p: V): void {
  const sh = c.p(v(p.x, 0, p.z));
  const b = c.p(p);
  const r = Math.max(2.5, b.s * 0.045);
  g.fillStyle(0x000000, 0.28 / (1 + p.y));
  g.fillEllipse(sh.x, sh.y, r * 2.2, r * 0.9);
  g.fillStyle(0xc1121f, 1);
  g.fillCircle(b.x, b.y, r);
  g.lineStyle(Math.max(0.6, r * 0.2), 0xffffff, 0.75);
  g.beginPath();
  g.arc(b.x, b.y, r * 0.7, -0.7, 0.7);
  g.strokePath();
}

/** Simple bowler: run-up, gather and a windmilling arm; release at phase 1. */
export function drawBowler(g: Phaser.GameObjects.Graphics, c: Cam, z: number, run: number, arm: number): void {
  const x = 0.55;
  const bob = Math.abs(Math.sin(run * Math.PI * 2)) * 0.06;
  const hip = v(x, 0.95 + bob, z);
  const neck = v(x, 1.5 + bob, z);
  const leg = Math.sin(run * Math.PI * 2) * 0.35;
  for (const s of [1, -1]) seg(g, c, hip, v(x + s * 0.1, 0, z - s * leg * 0.5), 0.1, 0xf4f4ef);
  seg(g, c, hip, neck, 0.2, 0xb91c1c);
  const a = arm * Math.PI * 2;
  seg(g, c, neck, v(x - Math.sin(a) * 0.15, 1.48 + Math.cos(a) * 0.7 + bob, z - Math.sin(a) * 0.5), 0.09, 0xb91c1c);
  seg(g, c, neck, v(x + 0.3, 1.2 + bob, z + 0.1), 0.09, 0xb91c1c);
  const h = c.p(v(x, 1.7 + bob, z));
  g.fillStyle(0x8d5524, 1);
  g.fillCircle(h.x, h.y, Math.max(2, h.s * 0.11));
}

/** Boundary rope and LED ad boards around it (colours from the ad list). */
export function drawBoundary(g: Phaser.GameObjects.Graphics, c: Cam, ads: { bg: string }[]): void {
  const R = 65;
  const N = 72;
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI * 2;
    const a1 = ((i + 1) / N) * Math.PI * 2;
    const p0 = v(Math.sin(a0) * R, 0, Math.cos(a0) * R);
    const p1 = v(Math.sin(a1) * R, 0, Math.cos(a1) * R);
    const q0 = c.p(p0);
    const q1 = c.p(p1);
    if (!q0.s || !q1.s) continue;
    g.lineStyle(Math.max(1, q0.s * 0.12), 0xffffff, 0.95);
    g.lineBetween(q0.x, q0.y, q1.x, q1.y);
    const b0 = v(p0.x * 1.05, 0, p0.z * 1.05);
    const b1 = v(p1.x * 1.05, 0, p1.z * 1.05);
    const ad = ads[Math.floor(i / 6) % ads.length];
    const col = parseInt(ad.bg.slice(1), 16);
    const pts = [c.p(b0), c.p(b1), c.p(add(b1, v(0, 1.0, 0))), c.p(add(b0, v(0, 1.0, 0)))];
    if (pts.some((p) => !p.s)) continue;
    g.fillStyle(col, 1);
    g.fillPoints(pts as Phaser.Types.Math.Vector2Like[], true);
  }
}

export function drawFielder(g: Phaser.GameObjects.Graphics, c: Cam, p: V, face: V, run: number, kit: number, armsUp = false): void {
  const s = c.p(p);
  if (!s.s) return;
  const fx = norm(v(face.x - p.x, 0, face.z - p.z));
  const side = v(fx.z, 0, -fx.x);
  const leg = Math.sin(run * 9) * 0.3 * Math.min(1, run);
  const hip = add(p, v(0, 0.95, 0));
  const neck = add(p, v(0, 1.48, 0));
  seg(g, c, hip, add(add(p, mul(side, 0.1)), mul(fx, leg)), 0.1, 0xf4f4ef);
  seg(g, c, hip, add(add(p, mul(side, -0.1)), mul(fx, -leg)), 0.1, 0xf4f4ef);
  seg(g, c, hip, neck, 0.2, kit);
  for (const k of [1, -1]) seg(g, c, add(neck, mul(side, 0.15 * k)), armsUp ? add(neck, add(mul(side, 0.12 * k), v(0, 0.6, 0))) : add(hip, add(mul(side, 0.25 * k), mul(fx, -leg * k))), 0.08, kit);
  const h = c.p(add(p, v(0, 1.68, 0)));
  g.fillStyle(0xc68642, 1);
  g.fillCircle(h.x, h.y, Math.max(1.5, h.s * 0.11));
}
