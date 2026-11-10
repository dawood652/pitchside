// The 2D side-on batting view (camera at point): ground, stands, stumps, the ball and the hand-
// animated batter. Its own canvas over the 3D world; shown for the duel between ball and bat.
import { Kit, Painter, Pen, tone } from './draw2d';
import { P2, pose2d } from './keys';
import { bowler2d, drawBowler } from './bowl2d';

export interface Side2DState {
  a: number; // batter animation time (0 = bat on ball)
  ball: P2 | null; // x toward the bowler from the popping crease, y height (m)
  trail: P2[]; // where the ball just was (motion streak)
  bowled: number | null; // seconds since the stumps were hit
  bowlerT: number | null; // bowler's clock (s from release), null = not shown
  focus: number; // furthest point the camera must show (bowler, then the incoming ball)
  bounce: { x: number; age: number } | null; // where the ball pitched, and how long ago
  fieldKit: Kit | null;
}
const FAR_END = 20.12 - 1.22; // bowler's stumps in picture x
const STUMPS_X = -1.22;
export function kitOf(hex: number): Kit {
  const s = '#' + hex.toString(16).padStart(6, '0');
  return { shirt: s, trou: tone(s, -0.15), helm: tone(s, -0.45), trim: s };
} // popping crease 1.22 m in front of the stumps

export class Side2D {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private pen: Pen;
  private paint: Painter;
  private kit: Kit = { shirt: '#1f9a55', trou: '#1b8048', helm: '#0e5c34', trim: '#1f9a55' };
  private crowd: { x: number; y: number; c: string }[] = [];
  visible = false;

  constructor(before: Element) {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'side2d';
    before.after(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    this.pen = { ctx: this.ctx, S: 100, ox: 0, oy: 0 };
    this.paint = new Painter(this.pen);
    const cols = ['#e9e4d8', '#c9473f', '#2e4a7a', '#d9a63b', '#1fb6e8', '#f2c94c', '#6d5a9e', '#eae6dc'];
    for (let i = 0; i < 520; i++) this.crowd.push({ x: (i * 0.7548776662) % 1, y: (i * 0.5698402909) % 1, c: cols[i % cols.length] });
    this.setVisible(false);
  }

  setKit(hex: number): void {
    this.kit = kitOf(hex);
  }

  setVisible(v: boolean): void {
    if (v === this.visible) return;
    this.visible = v;
    this.canvas.style.display = v ? 'block' : 'none';
  }

  private resize(focus: number): void {
    const d = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(window.innerWidth * d), h = Math.round(window.innerHeight * d);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    // the camera always holds the batter's end and pulls back far enough to show the bowler / the
    // ball in flight: the whole pitch at the start of the run-up, tight on the batter at the shot
    const x0 = -2.3, x1 = Math.min(24, Math.max(8.5, focus));
    this.pen.S = Math.min(w / (x1 - x0), h / 2.9);
    this.pen.ox = (w - (x1 - x0) * this.pen.S) / 2 - x0 * this.pen.S;
    this.pen.oy = h * 0.66; // ground line clear of the timing bar and buttons
  }

  render(st: Side2DState): void {
    if (!this.visible) return;
    this.resize(st.focus);
    const c = this.ctx, W = this.canvas.width, H = this.canvas.height, P = this.paint, S = this.pen.S, oy = this.pen.oy;
    const g = c.createLinearGradient(0, 0, 0, oy);
    g.addColorStop(0, '#6fa9de');
    g.addColorStop(0.42, '#cfe5f2');
    g.addColorStop(0.43, '#2b3646');
    g.addColorStop(0.66, '#3a4859');
    g.addColorStop(0.661, '#14532d');
    g.addColorStop(0.7, '#14532d');
    g.addColorStop(0.701, '#3f9d4f');
    g.addColorStop(1, '#4fb25d');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    c.globalAlpha = 0.6;
    const fs = Math.max(3, 0.03 * S);
    for (const f of this.crowd) {
      c.fillStyle = f.c;
      c.fillRect(f.x * W, oy * (0.44 + f.y * 0.21), fs, fs * 1.3);
    }
    c.globalAlpha = 1;
    // outfield, then the 22-yard strip with both sets of creases
    c.fillStyle = '#4fb25d';
    c.fillRect(0, oy, W, H - oy);
    const band = Math.max(6, 0.1 * S);
    c.fillStyle = '#d9c393';
    c.fillRect(P.X({ x: STUMPS_X - 1.5, y: 0 }), oy - band * 0.2, (FAR_END - STUMPS_X + 3) * S, band);
    c.fillStyle = '#ffffff';
    for (const x of [0, STUMPS_X, FAR_END, FAR_END - 1.22]) c.fillRect(P.X({ x, y: 0 }) - Math.max(1.5, 0.02 * S), oy - band * 0.2, Math.max(3, 0.04 * S), band);
    if (st.bounce) this.puff(st.bounce.x, st.bounce.age);
    this.stumps(st.bowled);
    this.farStumps();
    if (st.bowlerT !== null && st.fieldKit) drawBowler(P, bowler2d(st.bowlerT), st.fieldKit, st.bowlerT < 0);
    P.batter(pose2d(st.a), this.kit);
    if (st.ball && !(st.bowlerT !== null && st.bowlerT < 0)) this.ball(st.ball, st.trail);
  }

  /** Dust and a mark where the ball pitched. */
  private puff(x: number, age: number): void {
    const c = this.ctx, P = this.paint, S = this.pen.S;
    c.fillStyle = 'rgba(120,90,50,0.45)';
    c.beginPath();
    c.ellipse(P.X({ x, y: 0 }), P.Y({ x: 0, y: 0 }), 0.06 * S, 0.015 * S, 0, 0, 7);
    c.fill();
    if (age > 0.4) return;
    const k = age / 0.4;
    c.fillStyle = `rgba(214,190,140,${0.6 * (1 - k)})`;
    for (const [dx, r] of [[-0.12, 0.08], [0, 0.11], [0.1, 0.07]]) {
      c.beginPath();
      c.arc(P.X({ x: x + dx * (0.5 + k), y: 0 }), P.Y({ x: 0, y: 0.04 + 0.12 * k }), (r * (0.6 + k)) * S, 0, 7);
      c.fill();
    }
  }

  private farStumps(): void {
    const P = this.paint;
    for (const dx of [-0.03, 0, 0.03]) P.taper({ x: FAR_END + dx, y: 0 }, { x: FAR_END + dx, y: 0.71 }, 0.017, 0.017, '#f4efe2');
    P.taper({ x: FAR_END - 0.05, y: 0.725 }, { x: FAR_END + 0.05, y: 0.725 }, 0.009, 0.009, '#e6d2a6');
  }

  private stumps(bt: number | null): void {
    const P = this.paint;
    const k = bt === null ? 0 : Math.min(1, bt / 0.25);
    for (const [i, dx] of [-0.03, 0, 0.03].entries()) {
      const lean = k * [0.25, 0.45, 0.15][i]; // knocked back toward the keeper
      const base = { x: STUMPS_X + dx, y: 0 };
      P.taper(base, { x: base.x - Math.sin(lean) * 0.71, y: Math.cos(lean) * 0.71 }, 0.017, 0.017, '#f4efe2');
    }
    if (bt === null) P.taper({ x: STUMPS_X - 0.05, y: 0.725 }, { x: STUMPS_X + 0.05, y: 0.725 }, 0.009, 0.009, '#e6d2a6');
    else
      for (const [vx, vy] of [[-2.2, 3.4], [-1.4, 4.1]]) {
        const t = Math.min(bt, 0.9);
        const p = { x: STUMPS_X + vx * t, y: Math.max(0.02, 0.725 + vy * t - 4.9 * t * t) };
        P.taper({ x: p.x - 0.03, y: p.y }, { x: p.x + 0.03, y: p.y + 0.01 }, 0.009, 0.009, '#e6d2a6');
      }
  }

  private ball(b: P2, trail: P2[]): void {
    const c = this.ctx, P = this.paint, S = this.pen.S;
    const px = Math.min(2, window.devicePixelRatio || 1);
    const R = Math.max(0.038 * S, 4 * px); // never smaller than a few pixels, even in the wide shot
    // streak behind the ball so its line and pace read at a glance
    if (trail.length) {
      c.lineCap = 'round';
      c.strokeStyle = 'rgba(255,255,255,0.55)';
      c.lineWidth = R * 1.2;
      c.beginPath();
      c.moveTo(P.X(b), P.Y(b));
      for (const q of trail) c.lineTo(P.X(q), P.Y(q));
      c.stroke();
    }
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.beginPath();
    c.ellipse(P.X(b), P.Y({ x: 0, y: 0 }), R, R * 0.3, 0, 0, 7);
    c.fill();
    const g = c.createRadialGradient(P.X(b) - R * 0.3, P.Y(b) - R * 0.3, R * 0.1, P.X(b), P.Y(b), R);
    g.addColorStop(0, '#e24a4f');
    g.addColorStop(1, '#8e1219');
    c.beginPath();
    c.arc(P.X(b), P.Y(b), R, 0, 7);
    c.fillStyle = g;
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.85)';
    c.lineWidth = R * 0.13;
    c.beginPath();
    c.arc(P.X(b), P.Y(b), R * 0.63, 0.3, 2.6);
    c.stroke();
  }
}
