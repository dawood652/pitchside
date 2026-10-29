import * as THREE from 'three';
import { PITCH } from '../data/tuning';

/** Two goals with posts, crossbar, back frame and nets. */
export function createGoals(): THREE.Group {
  const group = new THREE.Group();
  const postMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.1 });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xd9d9d9, roughness: 0.6 });
  const netMat = new THREE.MeshStandardMaterial({
    map: netTexture(),
    transparent: true,
    side: THREE.DoubleSide,
    alphaTest: 0.25,
    roughness: 1,
  });
  const r = PITCH.postRadius;
  const hw = PITCH.goalHalfWidth;
  const h = PITCH.goalHeight;
  const dep = PITCH.goalDepth;

  for (const s of [-1, 1]) {
    const g = new THREE.Group();
    const gx = s * PITCH.halfL;
    const post = new THREE.CylinderGeometry(r, r, h + r, 16);
    for (const t of [-1, 1]) {
      const p = new THREE.Mesh(post, postMat);
      p.position.set(gx, (h + r) / 2, t * hw);
      p.castShadow = true;
      g.add(p);
      // back stanchion
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 8), frameMat);
      b.position.set(gx + s * dep, 0.6, t * hw);
      g.add(b);
      const diag = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, Math.hypot(dep, h - 1.2), 8), frameMat);
      diag.position.set(gx + (s * dep) / 2, (h + 1.2) / 2, t * hw);
      diag.rotation.z = s * Math.atan2(dep, h - 1.2);
      g.add(diag);
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(r, r, hw * 2 + 2 * r, 16), postMat);
    bar.rotation.x = Math.PI / 2;
    bar.position.set(gx, h, 0);
    bar.castShadow = true;
    g.add(bar);

    // Nets: back, roof, two sides
    const back = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, 1.2), netMat);
    back.position.set(gx + s * dep, 0.6, 0);
    back.rotation.y = Math.PI / 2;
    g.add(back);
    const slope = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, Math.hypot(dep, h - 1.2)), netMat);
    slope.position.set(gx + (s * dep) / 2, (h + 1.2) / 2, 0);
    slope.rotation.y = Math.PI / 2;
    slope.rotation.x = 0;
    slope.rotateX(-s * Math.atan2(dep, h - 1.2));
    g.add(slope);
    for (const t of [-1, 1]) {
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.lineTo(s * dep, 0);
      shape.lineTo(s * dep, 1.2);
      shape.lineTo(0, h);
      shape.lineTo(0, 0);
      const side = new THREE.Mesh(new THREE.ShapeGeometry(shape), netMat);
      side.position.set(gx, 0, t * hw);
      g.add(side);
    }
    group.add(g);
  }
  return group;
}

function netTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(255,255,255,0.95)';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(32, 0);
  g.lineTo(64, 32);
  g.lineTo(32, 64);
  g.lineTo(0, 32);
  g.closePath();
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(20, 8);
  return t;
}
