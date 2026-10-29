import * as THREE from 'three';
import { PITCH } from '../data/tuning';

const MARGIN = 7;

/** Grass with mown stripes and all line markings, drawn to one canvas texture. */
export function createPitch(renderer: THREE.WebGLRenderer): THREE.Object3D {
  const W = PITCH.length + MARGIN * 2;
  const H = PITCH.width + MARGIN * 2;
  const px = 4096;
  const scale = px / W;
  const c = document.createElement('canvas');
  c.width = px;
  c.height = Math.round(H * scale);
  const g = c.getContext('2d')!;

  // Base grass + mown stripes across the length
  g.fillStyle = '#376f30';
  g.fillRect(0, 0, c.width, c.height);
  const stripe = PITCH.length / 18;
  for (let i = -2; i < 22; i++) {
    const x0 = (MARGIN + i * stripe) * scale;
    g.fillStyle = i % 2 === 0 ? '#3f7d36' : '#30662b';
    g.fillRect(x0, 0, stripe * scale + 1, c.height);
  }
  // Faint cross-mowing for a broadcast checker look
  const cross = PITCH.width / 8;
  for (let j = 0; j < 10; j++) {
    if (j % 2) continue;
    g.fillStyle = 'rgba(255,255,255,0.035)';
    g.fillRect(0, (MARGIN + j * cross) * scale, c.width, cross * scale);
  }
  // Wear: goalmouths, penalty spots and the centre circle
  const wear = (x: number, z: number, rx: number, rz: number, a: number) => {
    const cx = (x + W / 2) * scale;
    const cz = (z + H / 2) * scale;
    const grad = g.createRadialGradient(cx, cz, 0, cx, cz, Math.max(rx, rz) * scale);
    grad.addColorStop(0, `rgba(140,120,70,${a})`);
    grad.addColorStop(1, 'rgba(140,120,70,0)');
    g.save();
    g.translate(cx, cz);
    g.scale(1, rz / rx);
    g.translate(-cx, -cz);
    g.fillStyle = grad;
    g.beginPath();
    g.arc(cx, cz, rx * scale, 0, Math.PI * 2);
    g.fill();
    g.restore();
  };
  for (const sgn of [-1, 1]) {
    wear(sgn * (PITCH.halfL - 2.5), 0, 4, 6, 0.45);
    wear(sgn * (PITCH.halfL - 11), 0, 1.6, 1.6, 0.35);
    wear(sgn * (PITCH.halfL - 6), 0, 7, 9, 0.12);
  }
  wear(0, 0, 3.5, 3.5, 0.2);
  // Grass noise
  const img = g.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 14;
    d[i] += n * 0.6;
    d[i + 1] += n;
    d[i + 2] += n * 0.4;
  }
  g.putImageData(img, 0, 0);

  // Line helpers in metres (origin at pitch centre)
  const X = (x: number) => (x + W / 2) * scale;
  const Z = (z: number) => (z + H / 2) * scale;
  g.strokeStyle = 'rgba(250,250,245,0.95)';
  g.fillStyle = 'rgba(250,250,245,0.95)';
  g.lineWidth = 0.12 * scale;
  const L = PITCH.halfL;
  const Wd = PITCH.halfW;
  g.strokeRect(X(-L), Z(-Wd), PITCH.length * scale, PITCH.width * scale);
  line(g, X(0), Z(-Wd), X(0), Z(Wd));
  circle(g, X(0), Z(0), PITCH.centreRadius * scale);
  dot(g, X(0), Z(0), 0.18 * scale);
  for (const s of [-1, 1]) {
    const gx = s * L;
    const bx = gx - s * PITCH.boxDepth;
    const sx = gx - s * PITCH.sixDepth;
    g.strokeRect(Math.min(X(gx), X(bx)), Z(-PITCH.boxHalfWidth), PITCH.boxDepth * scale, PITCH.boxHalfWidth * 2 * scale);
    g.strokeRect(Math.min(X(gx), X(sx)), Z(-PITCH.sixHalfWidth), PITCH.sixDepth * scale, PITCH.sixHalfWidth * 2 * scale);
    const spot = gx - s * PITCH.penaltySpot;
    dot(g, X(spot), Z(0), 0.15 * scale);
    // Penalty arc: part of 9.15 m circle around the spot outside the box
    const a = Math.acos((PITCH.boxDepth - PITCH.penaltySpot) / PITCH.centreRadius);
    g.beginPath();
    if (s > 0) g.arc(X(spot), Z(0), PITCH.centreRadius * scale, Math.PI - a, Math.PI + a);
    else g.arc(X(spot), Z(0), PITCH.centreRadius * scale, -a, a);
    g.stroke();
    // Corner arcs
    for (const t of [-1, 1]) {
      g.beginPath();
      const cx = X(gx);
      const cz = Z(t * Wd);
      const start = s > 0 ? (t > 0 ? Math.PI : Math.PI / 2) : t > 0 ? -Math.PI / 2 : 0;
      g.arc(cx, cz, 1 * scale, start, start + Math.PI / 2);
      g.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  tex.generateMipmaps = true;

  const group = new THREE.Group();
  const normal = grassNormal();
  normal.repeat.set(W / 1.6, H / 1.6);
  const pitch = new THREE.Mesh(
    new THREE.PlaneGeometry(W, H),
    new THREE.MeshStandardMaterial({
      map: tex,
      normalMap: normal,
      normalScale: new THREE.Vector2(0.5, 0.5),
      roughness: 0.9,
      metalness: 0,
    }),
  );
  pitch.rotation.x = -Math.PI / 2;
  pitch.receiveShadow = true;
  group.add(pitch);

  const surround = new THREE.Mesh(
    new THREE.PlaneGeometry(W + 40, H + 40),
    new THREE.MeshLambertMaterial({ color: 0x2c5a29 }),
  );
  surround.rotation.x = -Math.PI / 2;
  surround.position.y = -0.02;
  surround.receiveShadow = true;
  group.add(surround);
  return group;
}

function line(g: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.stroke();
}
function circle(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.stroke();
}
function dot(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

export const PITCH_MARGIN = MARGIN;

/** Tileable grass-blade normal map generated from noise. */
function grassNormal(): THREE.CanvasTexture {
  const n = 256;
  const h = new Float32Array(n * n);
  for (let k = 0; k < 2600; k++) {
    // short blades as streaks of height
    const x0 = Math.random() * n;
    const y0 = Math.random() * n;
    const len = 3 + Math.random() * 6;
    const a = Math.random() * Math.PI;
    for (let t = 0; t < len; t++) {
      const x = Math.floor(x0 + Math.cos(a) * t + n) % n;
      const y = Math.floor(y0 + Math.sin(a) * t + n) % n;
      h[y * n + x] += 1 - t / len;
    }
  }
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d')!;
  const img = g.createImageData(n, n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const hx = h[y * n + ((x + 1) % n)] - h[y * n + ((x - 1 + n) % n)];
      const hy = h[((y + 1) % n) * n + x] - h[((y - 1 + n) % n) * n + x];
      const l = Math.hypot(hx, hy, 2);
      const i = (y * n + x) * 4;
      img.data[i] = ((-hx / l) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((-hy / l) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((2 / l) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
