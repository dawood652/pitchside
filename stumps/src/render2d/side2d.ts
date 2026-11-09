// The 2D side-on batting view (camera at point): ground, stands, stumps, the ball and the hand-
// animated batter. Its own canvas over the 3D world; shown for the duel between ball and bat.
import { Kit, Painter, Pen, tone } from './draw2d';
import { P2, pose2d } from './keys';

export interface Side2DState {
  a: number; // batter animation time (0 = bat on ball)
  ball: P2 | null; // x toward the bowler from the popping crease, y height (m)
  bowled: number | null; // seconds since the stumps were hit
}
const STUMPS_X = -1.22; // popping crease 1.22 m in front of the stumps

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
    const s = '#' + hex.toString(16).padStart(6, '0');
    this.kit = { shirt: s, trou: tone(s, -0.15), helm: tone(s, -0.45), trim: s };
  }

  setVisible(v: boolean): void {
    if (v === this.visible) return;
    this.visible = v;
    this.canvas.style.display = v ? 'block' : 'none';
  }

  private resize(): void {
    const d = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(window.innerWidth * d), h = Math.round(window.innerHeight * d);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    // frame the batter: ~2.6 m of height, the crease a third of the way across
    this.pen.S = Math.min(h / 2.9, w / 4.4);
    this.pen.ox = w * 0.38 - 0.3 * this.pen.S;
    this.pen.oy = h * 0.8;
  }

  render(st: Side2DState): void {
    if (!this.visible) return;
    this.resize();
    const c = this.ctx, W = this.canvas.width, H = this.canvas.height, P = this.paint, S = this.pen.S, oy = this.pen.oy;
    // sky, stand, advertising board, grass, pitch strip
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
    for (const f of this.crowd) {
      c.fillStyle = f.c;
      c.fillRect(f.x * W, oy * (0.44 + f.y * 0.21), 0.03 * S, 0.04 * S);
    }
    c.globalAlpha = 1;
    c.fillStyle = '#4fb25d';
    c.fillRect(0, oy, W, H - oy);
    c.fillStyle = '#d9c393';
    c.fillRect(0, oy - 0.012 * S, W, 0.08 * S);
    c.fillStyle = '#ffffff';
    c.fillRect(P.X({ x: 0, y: 0 }) - 0.02 * S, oy - 0.012 * S, 0.04 * S, 0.08 * S);
    this.stumps(st.bowled);
    P.batter(pose2d(st.a), this.kit);
    if (st.ball) this.ball(st.ball);
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

  private ball(b: P2): void {
    const c = this.ctx, P = this.paint, S = this.pen.S;
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.beginPath();
    c.ellipse(P.X(b), P.Y({ x: 0, y: 0 }), 0.04 * S, 0.012 * S, 0, 0, 7);
    c.fill();
    const g = c.createRadialGradient(P.X(b) - 0.012 * S, P.Y(b) - 0.012 * S, 0.004 * S, P.X(b), P.Y(b), 0.04 * S);
    g.addColorStop(0, '#e24a4f');
    g.addColorStop(1, '#8e1219');
    c.beginPath();
    c.arc(P.X(b), P.Y(b), 0.038 * S, 0, 7);
    c.fillStyle = g;
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.85)';
    c.lineWidth = 0.005 * S;
    c.beginPath();
    c.arc(P.X(b), P.Y(b), 0.024 * S, 0.3, 2.6);
    c.stroke();
  }
}
