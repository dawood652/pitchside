import * as THREE from 'three';
import { BALL } from '../data/tuning';
import { V3 } from '../core/vec';

/** Classic panelled ball that rolls according to its velocity. */
export class BallView {
  mesh: THREE.Mesh;
  shadowBlob: THREE.Mesh;
  private q = new THREE.Quaternion();

  constructor() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = '#fbfbf7';
    g.fillRect(0, 0, 256, 128);
    g.fillStyle = '#1a1a1a';
    const spots: [number, number][] = [
      [32, 20], [96, 20], [160, 20], [224, 20],
      [0, 64], [64, 64], [128, 64], [192, 64], [256, 64],
      [32, 108], [96, 108], [160, 108], [224, 108],
    ];
    for (const [x, y] of spots) {
      g.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        g.lineTo(x + Math.cos(a) * 13, y + Math.sin(a) * 11);
      }
      g.closePath();
      g.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(BALL.radius, 24, 16),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45 }),
    );
    this.mesh.castShadow = true;
    // Drawn 1.35x bigger than the physics ball so it reads from the broadcast camera
    this.mesh.scale.setScalar(1.35);
    // Soft contact shadow so height is readable from the broadcast camera
    this.shadowBlob = new THREE.Mesh(
      new THREE.CircleGeometry(0.2, 16),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }),
    );
    this.shadowBlob.rotation.x = -Math.PI / 2;
  }

  update(dt: number, pos: V3, vel: V3): void {
    this.mesh.position.set(pos.x, pos.y + BALL.radius * 0.35, pos.z);
    const sp = Math.hypot(vel.x, vel.z);
    if (sp > 0.05) {
      const axis = new THREE.Vector3(vel.z, 0, -vel.x).normalize();
      this.q.setFromAxisAngle(axis, (sp * dt) / BALL.radius);
      this.mesh.quaternion.premultiply(this.q);
    }
    this.shadowBlob.position.set(pos.x, 0.025, pos.z);
    const h = Math.max(0, pos.y - BALL.radius);
    const s = 1 + h * 0.25;
    this.shadowBlob.scale.set(s, s, s);
    (this.shadowBlob.material as THREE.MeshBasicMaterial).opacity = Math.max(0.08, 0.35 - h * 0.05);
  }
}
