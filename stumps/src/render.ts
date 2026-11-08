// The gameplay camera: a pinhole projection shared by input (tap -> ground point), the 2D
// overlay and the 3D renderer, so what you tap is exactly what you see.
import { add, cross, dot, mul, norm, sub, v, V } from './batting/vec';

export class Cam {
  pos = v(-0.9, 3.9, -7.4);
  look = v(0, -0.6, 14);
  /** Viewport in CSS pixels; F (focal length in px) scales with the height so the framing is the same on every screen. */
  w = 960;
  h = 540;
  F = 760;
  zoom = 760 / 540;
  setViewport(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.F = this.zoom * h;
  }
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
    return { x: this.w / 2 + (dot(rel, this.r) / z) * this.F, y: this.h / 2 - (dot(rel, this.u) / z) * this.F, s: this.F / z };
  }
  /** Screen -> point on the ground (y = 0); far away when you tap above the horizon. */
  ground(sx: number, sy: number): V {
    const dir = norm(add(add(this.f, mul(this.r, (sx - this.w / 2) / this.F)), mul(this.u, -(sy - this.h / 2) / this.F)));
    const t = dir.y < -0.004 ? -this.pos.y / dir.y : 400;
    return add(this.pos, mul(dir, Math.min(400, t)));
  }
}
