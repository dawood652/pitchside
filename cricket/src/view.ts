// Behind-the-batter broadcast view drawn on a 2D canvas: stadium, pitch in perspective,
// stick-figure bowler and batter, the ball with its shadow.
import { PITCH_LEN } from './engine';

export interface Cam {
  W: number;
  H: number;
  F: number;
  horizon: number;
}
const CAM_Z = -5.6;
const CAM_H = 2.0;

export function camFor(W: number, H: number): Cam {
  const F = Math.min(H * 1.15, W * 0.75);
  return { W, H, F, horizon: H * 0.4 };
}

export function proj(c: Cam, x: number, y: number, z: number): { x: number; y: number; s: number } {
  const zc = Math.max(0.3, z - CAM_Z);
  const s = c.F / zc;
  return { x: c.W / 2 + x * s, y: c.horizon + (CAM_H - y) * s, s };
}

let crowd: HTMLCanvasElement | null = null;
function crowdTexture(w: number, h: number): HTMLCanvasElement {
  if (crowd && crowd.width === w) return crowd;
  crowd = document.createElement('canvas');
  crowd.width = w;
  crowd.height = h;
  const g = crowd.getContext('2d')!;
  const cols = ['#e63946', '#f1faee', '#1d3557', '#ffb703', '#2a9d8f', '#8338ec', '#fb5607', '#3a86ff', '#06d6a0'];
  g.fillStyle = '#24303f';
  g.fillRect(0, 0, w, h);
  for (let y = 4; y < h; y += 6) for (let x = (y / 6) % 2 ? 3 : 0; x < w; x += 6) {
    g.fillStyle = cols[(x * 7 + y * 13) % cols.length];
    g.globalAlpha = 0.55 + ((x * y) % 7) / 20;
    g.beginPath();
    g.arc(x, y, 2, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  return crowd;
}

export function drawGround(g: CanvasRenderingContext2D, c: Cam, t: number, cheer: number): void {
  const { W, H } = c;
  const sky = g.createLinearGradient(0, 0, 0, c.horizon);
  sky.addColorStop(0, '#5aa0e6');
  sky.addColorStop(1, '#cfe6fb');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, c.horizon);
  // stands
  const standTop = c.horizon - H * 0.17;
  const tex = crowdTexture(Math.ceil(W), Math.ceil(H * 0.17));
  g.drawImage(tex, 0, standTop + Math.sin(t * 18) * cheer * 2);
  g.fillStyle = '#152029';
  g.fillRect(0, standTop - 6, W, 6);
  // ad boards
  const ads = ['STUMPS', 'BOUNDARY FM', 'GOLDEN WILLOW', 'SPIN COLA', 'NORTH STAR AIR'];
  const bh = H * 0.03;
  for (let i = 0; i < 8; i++) {
    g.fillStyle = ['#0b3d91', '#c1121f', '#2b9348', '#f77f00'][i % 4];
    const x0 = (i * W) / 8;
    g.fillRect(x0, c.horizon - bh, W / 8 - 2, bh);
    g.fillStyle = '#fff';
    g.font = `700 ${Math.round(bh * 0.6)}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.fillText(ads[i % ads.length], x0 + W / 16, c.horizon - bh * 0.28);
  }
  // outfield with mowing stripes
  const grass = g.createLinearGradient(0, c.horizon, 0, H);
  grass.addColorStop(0, '#3f8f3a');
  grass.addColorStop(1, '#2f7a2c');
  g.fillStyle = grass;
  g.fillRect(0, c.horizon, W, H - c.horizon);
  for (let i = -12; i < 12; i += 2) {
    const a = proj(c, i * 3, 0, 80);
    const b = proj(c, (i + 1) * 3, 0, 80);
    const a2 = proj(c, i * 3 * 6, 0, -4);
    const b2 = proj(c, (i + 1) * 3 * 6, 0, -4);
    g.fillStyle = 'rgba(255,255,255,0.045)';
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.lineTo(b2.x, b2.y);
    g.lineTo(a2.x, a2.y);
    g.fill();
  }
  // pitch strip
  const quad = (x0: number, x1: number, z0: number, z1: number, fill: string) => {
    const p = [proj(c, x0, 0, z0), proj(c, x1, 0, z0), proj(c, x1, 0, z1), proj(c, x0, 0, z1)];
    g.fillStyle = fill;
    g.beginPath();
    g.moveTo(p[0].x, p[0].y);
    for (const q of p.slice(1)) g.lineTo(q.x, q.y);
    g.fill();
  };
  quad(-1.6, 1.6, -3, PITCH_LEN + 3, '#c8b27a');
  quad(-1.6, 1.6, 4, PITCH_LEN - 4, 'rgba(160,130,70,0.25)');
  // creases
  const line = (x0: number, z0: number, x1: number, z1: number) => {
    const a = proj(c, x0, 0, z0);
    const b = proj(c, x1, 0, z1);
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = Math.max(1, a.s * 0.05);
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.stroke();
  };
  for (const z of [1.22, PITCH_LEN - 1.22]) line(-1.6, z, 1.6, z);
  for (const z of [0, PITCH_LEN]) line(-1.32, z, 1.32, z);
  for (const s of [-1, 1]) {
    line(s * 1.32, -1, s * 1.32, 1.22);
    line(s * 1.32, PITCH_LEN - 1.22, s * 1.32, PITCH_LEN + 1);
  }
}

export function drawStumps(g: CanvasRenderingContext2D, c: Cam, z: number, broken = 0): void {
  for (const x of [-0.11, 0, 0.11]) {
    const tilt = broken * (x === 0 ? 0.3 : x > 0 ? 0.6 : -0.5);
    const a = proj(c, x, 0, z);
    const b = proj(c, x + tilt * 0.4, 0.71 - Math.abs(tilt) * 0.2, z - broken * 0.3);
    g.strokeStyle = '#f4ead2';
    g.lineWidth = Math.max(1.5, a.s * 0.035);
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.stroke();
  }
  if (!broken) {
    const l = proj(c, -0.11, 0.72, z);
    const r = proj(c, 0.11, 0.72, z);
    g.strokeStyle = '#d9a441';
    g.lineWidth = Math.max(1, l.s * 0.02);
    g.beginPath();
    g.moveTo(l.x, l.y);
    g.lineTo(r.x, r.y);
    g.stroke();
  }
}

type P = { x: number; y: number };
function limb(g: CanvasRenderingContext2D, pts: P[], w: number, col: string): void {
  g.strokeStyle = col;
  g.lineWidth = w;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(pts[0].x, pts[0].y);
  for (const p of pts.slice(1)) g.lineTo(p.x, p.y);
  g.stroke();
}

/** Bowler running in; phase 0..1 = run-up, then delivery stride. */
export function drawBowler(g: CanvasRenderingContext2D, c: Cam, z: number, runPhase: number, armT: number, kit: string): void {
  const base = proj(c, 0.45, 0, z);
  const s = base.s;
  const bob = Math.abs(Math.sin(runPhase * Math.PI * 2)) * 0.06;
  const hip = proj(c, 0.45, 0.95 + bob, z);
  const neck = proj(c, 0.45, 1.5 + bob, z);
  const head = proj(c, 0.45, 1.68 + bob, z);
  const w = Math.max(2, s * 0.09);
  const leg = Math.sin(runPhase * Math.PI * 2) * 0.35;
  limb(g, [hip, proj(c, 0.35 + leg * 0.3, 0.45, z - leg * 0.3), proj(c, 0.35 + leg * 0.2, 0, z - leg * 0.5)], w, '#f1f1f1');
  limb(g, [hip, proj(c, 0.55 - leg * 0.3, 0.45, z + leg * 0.3), proj(c, 0.55 - leg * 0.2, 0, z + leg * 0.5)], w, '#f1f1f1');
  limb(g, [hip, neck], w * 1.25, kit);
  // bowling arm windmills over during the delivery stride
  const a = armT * Math.PI * 2;
  const hand = proj(c, 0.45 + Math.sin(a) * 0.25, 1.48 + Math.cos(a) * 0.72 + bob, z);
  limb(g, [neck, hand], w * 0.9, kit);
  limb(g, [neck, proj(c, 0.2, 1.1 + bob, z + 0.2)], w * 0.9, kit);
  g.fillStyle = '#f2c9a0';
  g.beginPath();
  g.arc(head.x, head.y, Math.max(2, s * 0.11), 0, Math.PI * 2);
  g.fill();
}

/**
 * Batter from behind (right-hander, guarding the stumps). swing: 0 = stance, 0..1 = swing through.
 * shotDir: -1 (leg) .. 1 (off); loft raises the follow-through.
 */
export function drawBatter(g: CanvasRenderingContext2D, c: Cam, swing: number, shotDir: number, loft: boolean, block: boolean, kit: string, fall = 0): void {
  const bx = -0.35;
  const bz = -0.25;
  const P = (x: number, y: number) => proj(c, bx + x, y, bz);
  const s = P(0, 0).s;
  const w = Math.max(3, s * 0.1);
  const crouch = 0.08 * (1 - swing) + fall * 0.6;
  const hip = P(0, 0.95 - crouch);
  const neck = P(0.03 * shotDir * swing, 1.5 - crouch);
  const head = P(0.03 * shotDir * swing, 1.7 - crouch);
  const step = swing * 0.25;
  // pads
  limb(g, [hip, P(-0.14 - step * 0.2, 0.48), P(-0.16, 0)], w * 1.25, '#fafafa');
  limb(g, [hip, P(0.14 + step * 0.5 * shotDir, 0.5), P(0.16 + step * shotDir, 0)], w * 1.25, '#fafafa');
  limb(g, [hip, neck], w * 1.35, kit);
  // bat: backlift, then swing through toward the shot direction
  const back = swing < 0.3 ? swing / 0.3 : 1;
  const through = swing < 0.3 ? 0 : (swing - 0.3) / 0.7;
  let ang: number; // bat angle on screen, 0 = pointing down
  if (block) ang = 0.15;
  else if (through === 0) ang = -0.3 - back * 2.2;
  else ang = -2.5 + through * (loft ? 5.6 : 4.4) * (0.75 + 0.25 * shotDir);
  const hands = P(0.18 + 0.12 * shotDir * through, 1.1 - crouch + through * (loft ? 0.4 : 0.1));
  const blen = s * 0.95;
  const tip = { x: hands.x + Math.sin(ang) * blen * (0.6 + 0.4 * Math.abs(Math.cos(ang))), y: hands.y + Math.cos(ang) * blen };
  limb(g, [neck, hands], w * 0.85, kit);
  limb(g, [P(-0.12, 1.42 - crouch), hands], w * 0.85, kit);
  limb(g, [hands, tip], Math.max(4, s * 0.13), '#e3c27a');
  limb(g, [hands, { x: hands.x + (tip.x - hands.x) * 0.25, y: hands.y + (tip.y - hands.y) * 0.25 }], Math.max(4, s * 0.12), '#222');
  // helmet
  g.fillStyle = '#1d3557';
  g.beginPath();
  g.arc(head.x, head.y, Math.max(3, s * 0.13), 0, Math.PI * 2);
  g.fill();
}

export function drawBall(g: CanvasRenderingContext2D, c: Cam, x: number, y: number, z: number): void {
  const sh = proj(c, x, 0, z);
  const b = proj(c, x, y, z);
  const r = Math.max(3, b.s * 0.055); // drawn a bit larger than life so it reads on a phone
  g.fillStyle = 'rgba(0,0,0,0.28)';
  g.beginPath();
  g.ellipse(sh.x, sh.y, r * 1.1, r * 0.45, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#c1121f';
  g.beginPath();
  g.arc(b.x, b.y, r, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.7)';
  g.lineWidth = Math.max(0.5, r * 0.18);
  g.beginPath();
  g.arc(b.x, b.y, r * 0.75, -0.6, 0.6);
  g.stroke();
}
