// Cricket gear modelled around a Rocketbox body: helmet (shell, peak, steel grille), batting pads
// (cane ridges, knee roll, straps), padded gloves, keeper gloves. Each piece is built in the
// body's rest pose and then follows its bone: world = bone * inverse(bone at rest) * piece at rest.
import * as THREE from 'three';
import { RbPerson } from './rocketbox';

interface Attached {
  obj: THREE.Object3D;
  bone: THREE.Bone;
  rest: THREE.Matrix4; // inverse(bone rest world) * piece rest world
}

const _m = new THREE.Matrix4();

function lathe(points: [number, number][], segs = 24): THREE.LatheGeometry {
  return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segs);
}

function helmet(color: number): THREE.Group {
  const g = new THREE.Group();
  const shellMat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.28, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.15 });
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.128, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.56), shellMat);
  shell.scale.set(1, 1.02, 1.12);
  const peak = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.012, 32, 1, false, -0.9, 1.8), shellMat);
  peak.position.set(0, 0.0, 0.035);
  peak.scale.set(1, 1, 1.25);
  const steel = new THREE.MeshStandardMaterial({ color: 0x9aa1a8, metalness: 0.9, roughness: 0.3 });
  const grille = new THREE.Group();
  for (const y of [-0.035, -0.075, -0.115]) {
    const bar = new THREE.Mesh(new THREE.TorusGeometry(0.118, 0.0045, 6, 28, Math.PI * 0.9), steel);
    bar.rotation.set(Math.PI / 2, 0, Math.PI * 0.05);
    bar.position.y = y;
    bar.scale.set(1, 1.15, 1);
    grille.add(bar);
  }
  for (const a of [-0.35, 0, 0.35]) {
    const v = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.1, 6), steel);
    v.position.set(Math.sin(a) * 0.118, -0.075, Math.cos(a) * 0.135);
    grille.add(v);
  }
  g.add(shell, peak, grille);
  return g;
}

function pad(): THREE.Group {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xf3f1ea, roughness: 0.7 });
  const shade = new THREE.MeshStandardMaterial({ color: 0xe1ddd1, roughness: 0.75 });
  // shin guard: a half-tube with three cane ridges down the front
  const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.068, 0.46, 20, 1, true, -Math.PI * 0.62, Math.PI * 1.24), white);
  shin.material.side = THREE.DoubleSide;
  for (const a of [-0.45, 0, 0.45]) {
    const r = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.42, 4, 8), shade);
    r.position.set(Math.sin(a) * 0.075, 0, Math.cos(a) * 0.075);
    g.add(r);
  }
  const knee = new THREE.Mesh(lathe([[0.001, 0.09], [0.06, 0.085], [0.085, 0.05], [0.09, 0], [0.07, -0.04], [0.001, -0.045]], 20), white);
  knee.position.y = 0.29;
  knee.scale.set(1, 1, 0.8);
  const strapMat = new THREE.MeshStandardMaterial({ color: 0x1c1f24, roughness: 0.6 });
  for (const y of [-0.12, 0.08]) {
    const s = new THREE.Mesh(new THREE.TorusGeometry(0.072, 0.007, 4, 20), strapMat);
    s.rotation.x = Math.PI / 2;
    s.position.y = y;
    g.add(s);
  }
  g.add(shin, knee);
  return g;
}

function glove(color: number): THREE.Group {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.65 });
  const trim = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.035, 0.11, 2, 1, 2), white);
  back.position.set(0, 0.01, 0.045);
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.013, 0.07, 3, 8), white);
    f.rotation.x = Math.PI / 2;
    f.position.set(-0.036 + i * 0.024, 0.02, 0.13);
    g.add(f);
  }
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.052, 0.06, 16), trim);
  cuff.rotation.x = Math.PI / 2;
  cuff.position.z = -0.02;
  g.add(back, cuff);
  return g;
}

export class Gear {
  private items: Attached[] = [];
  constructor(private scene: THREE.Scene) {}

  /** Put the body in its bind pose, then build and attach pieces to it. */
  dress(p: RbPerson, opts: { helmet?: number; pads?: boolean; gloves?: number; keeper?: boolean }): void {
    p.resetPose();
    const keepP = p.root.position.clone();
    const keepQ = p.root.quaternion.clone();
    p.root.position.set(0, 0, 0);
    p.root.quaternion.identity();
    p.root.updateMatrixWorld(true);
    const wp = (n: string) => p.bone(n).getWorldPosition(new THREE.Vector3());
    const add = (obj: THREE.Object3D, bone: THREE.Bone, at: THREE.Vector3, q = new THREE.Quaternion()) => {
      obj.position.copy(at);
      obj.quaternion.copy(q);
      obj.updateMatrix();
      obj.matrixAutoUpdate = false;
      obj.traverse((o) => ((o as THREE.Mesh).castShadow = true));
      this.scene.add(obj);
      const rest = bone.matrixWorld.clone().invert().multiply(obj.matrix);
      this.items.push({ obj, bone, rest });
    };
    if (opts.helmet !== undefined) {
      const head = wp('Head');
      const top = head.clone().add(new THREE.Vector3(0, 0.105, 0.012));
      const h = helmet(opts.helmet);
      h.scale.setScalar(0.92);
      add(h, p.bone('Head'), top);
      // hair cards would poke through the shell
      p.model.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && ((Array.isArray(m.material) ? m.material[0] : m.material) as THREE.Material).name.includes('opacity')) m.visible = false;
      });
    }
    if (opts.pads)
      for (const s of ['L', 'R']) {
        const knee = wp(`${s} Calf`);
        const ankle = wp(`${s} Foot`);
        const mid = knee.clone().lerp(ankle, 0.42).add(new THREE.Vector3(0, 0, 0.035));
        const dir = knee.clone().sub(ankle).normalize();
        add(pad(), p.bone(`${s} Calf`), mid, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
      }
    if (opts.gloves !== undefined)
      for (const s of ['L', 'R']) {
        const hand = wp(`${s} Hand`);
        const fing = wp(`${s} Finger2`);
        const dir = fing.clone().sub(hand).normalize();
        const g = glove(opts.gloves);
        if (opts.keeper) g.scale.setScalar(1.25);
        add(g, p.bone(`${s} Hand`), hand.clone().lerp(fing, 0.25), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir));
      }
    p.root.position.copy(keepP);
    p.root.quaternion.copy(keepQ);
    p.root.updateMatrixWorld(true);
  }

  update(): void {
    for (const it of this.items) {
      it.bone.updateWorldMatrix(true, false);
      _m.multiplyMatrices(it.bone.matrixWorld, it.rest);
      it.obj.matrix.copy(_m);
      it.obj.matrixWorldNeedsUpdate = true;
    }
  }

  recolor(color: number): void {
    // helmets and glove trims follow the batting side's colour
    for (const it of this.items)
      it.obj.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
        if (m && (m as THREE.MeshPhysicalMaterial).clearcoat !== undefined && (m as THREE.MeshPhysicalMaterial).clearcoat > 0) m.color.set(color);
      });
  }
}
