// Draws the 2D batter: tapered, shaded limbs, kit, pads, spiked shoes, helmet with grille, and
// gloves clenched round the bat handle. Light from the upper left; thin dark outlines.
import { add, lerp2, mul, P2, Pose2D, sub } from './keys';

export interface Pen {
  ctx: CanvasRenderingContext2D;
  S: number; // pixels per metre
  ox: number;
  oy: number;
}
export interface Kit {
  shirt: string;
  trou: string;
  helm: string;
  trim: string;
}
const C = { skin: '#dcaa82', pad: '#f7f5ee', padD: '#d6d1c3', grille: '#a9b0b6', glove: '#fbfbf8', gloveD: '#dcdad2', line: '#14201a', shoe: '#f4f4f2', sole: '#2a2d30', bat: '#ecd29a', batD: '#c8a467', grip: '#20232a' };
const OUT = 0.006; // outline width (m)
const nrm = (a: P2): P2 => {
  const l = Math.hypot(a.x, a.y) || 1;
  return { x: a.x / l, y: a.y / l };
};

export function tone(col: string, k: number): string {
  let c0: number[];
  if (col[0] === '#') {
    const n = parseInt(col.slice(1), 16);
    c0 = [n >> 16, (n >> 8) & 255, n & 255];
  } else c0 = (col.match(/\d+/g) ?? ['0', '0', '0']).map(Number);
  const c = c0.map((v) => Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k)));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export class Painter {
  constructor(private p: Pen) {}
  X(q: P2): number {
    return this.p.ox + q.x * this.p.S;
  }
  Y(q: P2): number {
    return this.p.oy - q.y * this.p.S;
  }
  private get c(): CanvasRenderingContext2D {
    return this.p.ctx;
  }
  private get S(): number {
    return this.p.S;
  }
  private across(a: P2, b: P2, w: number, base: string): CanvasGradient {
    const d = nrm(sub(b, a));
    const n = { x: -d.y, y: d.x };
    const m = lerp2(a, b, 0.5);
    const lit = n.x * -0.6 + n.y * 0.8 > 0 ? 1 : -1;
    const p1 = add(m, mul(n, w * lit));
    const p2 = add(m, mul(n, -w * lit));
    const g = this.c.createLinearGradient(this.X(p1), this.Y(p1), this.X(p2), this.Y(p2));
    g.addColorStop(0, tone(base, 0.16));
    g.addColorStop(0.4, base);
    g.addColorStop(1, tone(base, -0.18));
    return g;
  }
  taper(a: P2, b: P2, ra: number, rb: number, base: string): void {
    const c = this.c;
    const ax = this.X(a), ay = this.Y(a), bx = this.X(b), by = this.Y(b);
    const f = Math.atan2(by - ay, bx - ax);
    c.beginPath();
    c.arc(ax, ay, ra * this.S, f + Math.PI / 2, f + Math.PI * 1.5);
    c.arc(bx, by, rb * this.S, f - Math.PI / 2, f + Math.PI / 2);
    c.closePath();
    c.fillStyle = this.across(a, b, Math.max(ra, rb), base);
    c.fill();
    c.lineWidth = OUT * this.S;
    c.strokeStyle = C.line;
    c.lineJoin = 'round';
    c.stroke();
  }
  poly(pts: P2[], fill: string | CanvasGradient, outline = true): void {
    const c = this.c;
    c.beginPath();
    pts.forEach((q, i) => (i ? c.lineTo(this.X(q), this.Y(q)) : c.moveTo(this.X(q), this.Y(q))));
    c.closePath();
    c.fillStyle = fill;
    c.fill();
    if (outline) {
      c.lineJoin = 'round';
      c.lineWidth = OUT * this.S;
      c.strokeStyle = C.line;
      c.stroke();
    }
  }
  line(a: P2, b: P2, w: number, col: string): void {
    const c = this.c;
    c.lineCap = 'round';
    c.lineWidth = w * this.S;
    c.strokeStyle = col;
    c.beginPath();
    c.moveTo(this.X(a), this.Y(a));
    c.lineTo(this.X(b), this.Y(b));
    c.stroke();
  }
  ell(q: P2, rx: number, ry: number, rot: number, fill: string, outline = true): void {
    const c = this.c;
    c.beginPath();
    c.ellipse(this.X(q), this.Y(q), rx * this.S, ry * this.S, -rot, 0, 7);
    c.fillStyle = fill;
    c.fill();
    if (outline) {
      c.lineWidth = OUT * this.S;
      c.strokeStyle = C.line;
      c.stroke();
    }
  }

  private leg(L: { mid: P2; end: P2 }, hip: P2, front: boolean, k: Kit): void {
    const knee = L.mid, ank = L.end, dk = front ? 0 : -0.1;
    this.taper(hip, knee, 0.078, 0.058, tone(k.trou, dk));
    // pad: cane shin guard, ridges, two straps, knee roll
    const top = lerp2(knee, hip, 0.22), bot = add(ank, { x: 0, y: -0.01 });
    this.taper(top, bot, 0.072, 0.062, tone(C.pad, dk));
    const d = nrm(sub(bot, top)), n = { x: -d.y, y: d.x };
    for (const o of [-0.03, 0, 0.03]) this.line(add(lerp2(top, bot, 0.08), mul(n, o)), add(lerp2(top, bot, 0.93), mul(n, o * 0.85)), 0.006, tone(C.padD, dk));
    for (const s of [0.32, 0.72]) {
      const c = lerp2(top, bot, s);
      this.line(add(c, mul(n, -0.07)), add(c, mul(n, 0.07)), 0.014, '#1f2a24');
    }
    this.ell(lerp2(top, knee, 0.45), 0.078, 0.062, Math.atan2(d.y, d.x), tone(C.pad, dk - 0.02));
    // spiked shoe
    const fwd = front ? 1 : 0.6;
    const toe = { x: ank.x + 0.17 * fwd, y: Math.max(0.03, ank.y - 0.06) };
    const heel = { x: ank.x - 0.05, y: Math.max(0.03, ank.y - 0.05) };
    this.taper(heel, toe, 0.042, 0.032, tone(C.shoe, dk - 0.04));
    this.line(add(heel, { x: 0, y: -0.035 }), add(toe, { x: 0.005, y: -0.027 }), 0.016, C.sole);
  }
  private arm(A: { mid: P2; end: P2 }, sh: P2, back: boolean, k: Kit): void {
    const dk = back ? -0.12 : 0, el = A.mid, wr = wrist(A);
    this.taper(el, wr, 0.043, 0.034, tone(C.skin, dk)); // forearm
    this.taper(sh, el, 0.058, 0.046, tone(C.skin, dk)); // upper arm
    this.taper(sh, lerp2(sh, el, 0.55), 0.072, 0.056, tone(k.shirt, dk)); // short sleeve
  }
  /** Glove clenched round the handle: padded back, four finger rolls over the handle, thumb, cuff. */
  private glove(grip: P2, bd: P2, wr: P2, k: Kit): void {
    const u = bd, v = { x: -bd.y, y: bd.x };
    const ws = Math.sign((wr.x - grip.x) * v.x + (wr.y - grip.y) * v.y) || 1;
    const at = (a: number, b: number): P2 => add(grip, add(mul(u, a), mul(v, b * ws)));
    const cuffEnd = at(0, 0.04);
    this.taper(wr, cuffEnd, 0.044, 0.05, C.glove);
    const cc = lerp2(wr, cuffEnd, 0.3), cd = nrm(sub(cuffEnd, wr)), cn = { x: -cd.y, y: cd.x };
    this.line(add(cc, mul(cn, -0.045)), add(cc, mul(cn, 0.045)), 0.018, k.trim);
    this.poly([at(-0.055, 0.055), at(0.055, 0.055), at(0.06, -0.01), at(-0.06, -0.01)], C.glove);
    for (let i = 0; i < 4; i++) {
      const s = -0.039 + i * 0.026;
      this.taper(at(s, 0.012), at(s, -0.05), 0.0135, 0.0128, i % 2 ? C.gloveD : C.glove);
    }
    this.taper(at(-0.05, 0.03), at(-0.012, -0.02), 0.015, 0.013, C.glove);
  }
  private bat(p: Pose2D): void {
    const h = p.H, d = p.bd, n = { x: -d.y, y: d.x };
    const at = (s: number, w: number): P2 => add(h, add(mul(d, s), mul(n, w)));
    this.taper(at(0, 0), at(0.3, 0), 0.019, 0.017, C.grip);
    for (let s = 0.03; s < 0.28; s += 0.035) this.line(at(s, -0.018), at(s, 0.018), 0.004, '#3a3f48');
    const g = this.c.createLinearGradient(this.X(at(0.6, 0.05)), this.Y(at(0.6, 0.05)), this.X(at(0.6, -0.05)), this.Y(at(0.6, -0.05)));
    g.addColorStop(0, tone(C.bat, 0.25));
    g.addColorStop(0.5, C.bat);
    g.addColorStop(1, C.batD);
    this.poly([at(0.29, 0.02), at(0.34, 0.05), at(0.84, 0.054), at(0.866, 0.04), at(0.866, -0.04), at(0.84, -0.05), at(0.34, -0.046), at(0.29, -0.02)], g);
    for (const w of [-0.02, 0.008, 0.03]) this.line(at(0.38, w), at(0.82, w + 0.004), 0.0025, 'rgba(150,110,50,0.35)');
    this.poly([at(0.4, 0.05), at(0.55, 0.052), at(0.55, -0.047), at(0.4, -0.046)], '#0b3d91', false);
    this.poly([at(0.43, 0.05), at(0.47, 0.051), at(0.47, -0.047), at(0.43, -0.046)], '#e8b83a', false);
    this.poly([at(0.29, 0.02), at(0.36, 0.0), at(0.29, -0.02)], tone(C.batD, -0.1), false);
  }
  private torso(p: Pose2D, k: Kit): void {
    const c = this.c;
    const out = nrm(sub(p.shL, p.shR)), mid = lerp2(p.hipL, p.hipR, 0.5);
    const hipA = add(p.hipL, { x: 0.03, y: 0.02 }), hipB = add(p.hipR, { x: -0.03, y: 0.02 });
    const shA = add(p.shL, mul(out, 0.055)), shB = add(p.shR, mul(out, -0.055));
    const wA = add(lerp2(shA, hipA, 0.6), mul(out, 0.03)), wB = add(lerp2(shB, hipB, 0.6), mul(out, -0.03));
    const neckTop = add(p.neck, { x: 0, y: 0.05 });
    c.beginPath();
    c.moveTo(this.X(shA), this.Y(shA));
    c.quadraticCurveTo(this.X(wA), this.Y(wA), this.X(hipA), this.Y(hipA));
    c.lineTo(this.X(hipB), this.Y(hipB));
    c.quadraticCurveTo(this.X(wB), this.Y(wB), this.X(shB), this.Y(shB));
    c.quadraticCurveTo(this.X(p.neck), this.Y(neckTop), this.X(shA), this.Y(shA));
    const g = c.createLinearGradient(this.X(shB), this.Y(shB), this.X(hipA), this.Y(hipA));
    g.addColorStop(0, tone(k.shirt, 0.18));
    g.addColorStop(0.6, k.shirt);
    g.addColorStop(1, tone(k.shirt, -0.25));
    c.fillStyle = g;
    c.fill();
    c.lineWidth = OUT * this.S;
    c.strokeStyle = C.line;
    c.stroke();
    this.poly([add(p.neck, mul(out, -0.05)), add(p.neck, { x: 0, y: -0.07 }), add(p.neck, mul(out, 0.05))], tone(k.shirt, -0.4));
    this.line(add(p.neck, { x: 0, y: -0.07 }), lerp2(p.neck, mid, 0.35), 0.004, tone(k.shirt, -0.3));
    this.taper(add(p.hipR, { x: 0.015, y: 0 }), add(p.hipL, { x: -0.015, y: 0 }), 0.07, 0.07, k.trou);
  }
  private head(p: Pose2D, k: Kit): void {
    const c = this.c;
    this.taper(p.neck, lerp2(p.neck, p.head, 0.55), 0.045, 0.042, C.skin);
    const hd = p.head, r = 0.112 * this.S;
    this.ell(add(hd, { x: 0.035, y: -0.03 }), 0.085, 0.095, 0, C.skin);
    this.ell(add(hd, { x: 0.105, y: -0.035 }), 0.016, 0.022, 0, tone(C.skin, -0.08));
    c.save();
    c.translate(this.X(hd), this.Y(hd));
    const g = c.createRadialGradient(-r * 0.4, -r * 0.5, r * 0.1, 0, 0, r * 1.2);
    g.addColorStop(0, tone(k.helm, 0.35));
    g.addColorStop(0.6, k.helm);
    g.addColorStop(1, tone(k.helm, -0.35));
    c.beginPath();
    c.arc(0, 0, r, Math.PI * 0.92, Math.PI * 2.06);
    c.lineTo(-r * 0.15, r * 0.62);
    c.lineTo(-r * 0.92, r * 0.55);
    c.closePath();
    c.fillStyle = g;
    c.fill();
    c.lineWidth = OUT * this.S;
    c.strokeStyle = C.line;
    c.stroke();
    c.restore();
    this.ell(add(hd, { x: 0.1, y: 0.008 }), 0.058, 0.014, -0.08, tone(k.helm, -0.1));
    c.strokeStyle = C.grille;
    c.lineCap = 'round';
    c.lineWidth = 0.009 * this.S;
    for (const y of [-0.035, -0.07, -0.105]) {
      const a = add(hd, { x: 0.03, y }), q = add(hd, { x: 0.15, y: y + 0.004 }), b = add(hd, { x: 0.13, y: y - 0.02 });
      c.beginPath();
      c.moveTo(this.X(a), this.Y(a));
      c.quadraticCurveTo(this.X(q), this.Y(q), this.X(b), this.Y(b));
      c.stroke();
    }
    this.line(add(hd, { x: 0.125, y: -0.01 }), add(hd, { x: 0.11, y: -0.12 }), 0.009, C.grille);
  }
  batter(p: Pose2D, k: Kit): void {
    const c = this.c;
    c.fillStyle = 'rgba(0,0,0,0.22)';
    c.beginPath();
    const mx = (p.legF.end.x + p.legB.end.x) / 2;
    c.ellipse(this.X({ x: mx, y: 0 }), this.Y({ x: 0, y: 0 }), (Math.abs(p.legF.end.x - p.legB.end.x) / 2 + 0.25) * this.S, 0.05 * this.S, 0, 0, 7);
    c.fill();
    const batBehind = p.bd.y > 0.25; // backlift / finish: blade behind the head
    if (batBehind) this.bat(p);
    this.leg(p.legB, p.hipR, false, k);
    this.torso(p, k);
    this.leg(p.legF, p.hipL, true, k);
    this.arm(p.armB, p.shR, true, k);
    this.head(p, k);
    if (!batBehind) this.bat(p);
    this.glove(p.gB, p.bd, wrist(p.armB), k);
    this.arm(p.armF, p.shL, false, k);
    this.glove(p.gT, p.bd, wrist(p.armF), k);
  }
}
/** where the forearm ends and the glove cuff begins */
function wrist(A: { mid: P2; end: P2 }): P2 {
  return lerp2(A.mid, A.end, 0.74);
}
