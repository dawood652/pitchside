// Aerial view of the ground while a hit ball is in play: rope, inner circle, fielders chasing,
// the ball with its shadow (height shown by the gap) and a trail.
import { BOUNDARY, BallFlight, Fielder } from './engine';

export function drawField(g: CanvasRenderingContext2D, W: number, H: number, f: BallFlight, fielders: Fielder[], t: number, kit: string): void {
  const n = f.path.length;
  const i = Math.min(n - 1, Math.max(0, Math.floor(t * 30)));
  const b = f.path[i] ?? { x: 0, z: 0, h: 0 };
  // camera: whole ground, nudged toward the ball
  const scale = (Math.min(W, H) * 0.46) / BOUNDARY;
  const cx = W / 2 - b.x * scale * 0.25;
  const cy = H / 2 + b.z * scale * 0.25;
  const P = (x: number, z: number) => ({ x: cx + x * scale, y: cy - z * scale });
  g.fillStyle = '#1b2a1c';
  g.fillRect(0, 0, W, H);
  // stands ring
  g.fillStyle = '#2b3a4a';
  g.beginPath();
  g.arc(cx, cy, (BOUNDARY + 14) * scale, 0, Math.PI * 2);
  g.fill();
  const grass = g.createRadialGradient(cx, cy, 0, cx, cy, BOUNDARY * scale);
  grass.addColorStop(0, '#4c9a43');
  grass.addColorStop(1, '#357a31');
  g.fillStyle = grass;
  g.beginPath();
  g.arc(cx, cy, (BOUNDARY + 3) * scale, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#fff';
  g.lineWidth = 2;
  g.beginPath();
  g.arc(cx, cy, BOUNDARY * scale, 0, Math.PI * 2);
  g.stroke();
  g.setLineDash([6, 6]);
  g.strokeStyle = 'rgba(255,255,255,0.45)';
  g.beginPath();
  g.arc(cx, cy, 27 * scale, 0, Math.PI * 2);
  g.stroke();
  g.setLineDash([]);
  const p0 = P(-1.5, 22);
  g.fillStyle = '#c8b27a';
  g.fillRect(p0.x, p0.y, 3 * scale, 22 * scale);
  // fielders run toward the ball's path
  const target = f.result.fielder !== null ? f.path.at(-1)! : b;
  fielders.forEach((fd, k) => {
    const chase = f.result.fielder === k ? 1 : 0.35;
    const d = Math.hypot(target.x - fd.x, target.z - fd.z) || 1;
    const run = Math.min(d - (chase === 1 ? 0 : 6), 6.8 * Math.max(0, t - 0.35) * chase);
    const x = fd.x + ((target.x - fd.x) / d) * Math.max(0, run);
    const z = fd.z + ((target.z - fd.z) / d) * Math.max(0, run);
    const q = P(x, z);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.beginPath();
    g.ellipse(q.x + 2, q.y + 3, 6, 3, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = kit;
    g.beginPath();
    g.arc(q.x, q.y, 6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#f2c9a0';
    g.beginPath();
    g.arc(q.x, q.y - 1, 3, 0, Math.PI * 2);
    g.fill();
  });
  // trail
  g.strokeStyle = 'rgba(255,255,255,0.35)';
  g.lineWidth = 2;
  g.beginPath();
  for (let k = 0; k <= i; k++) {
    const q = P(f.path[k].x, f.path[k].z);
    if (k === 0) g.moveTo(q.x, q.y);
    else g.lineTo(q.x, q.y);
  }
  g.stroke();
  const sh = P(b.x, b.z);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.beginPath();
  g.ellipse(sh.x, sh.y, 4, 2.5, 0, 0, Math.PI * 2);
  g.fill();
  const bp = { x: sh.x, y: sh.y - b.h * scale * 0.9 };
  g.fillStyle = '#e63946';
  g.beginPath();
  g.arc(bp.x, bp.y, 3.5 + b.h * 0.12, 0, Math.PI * 2);
  g.fill();
}
