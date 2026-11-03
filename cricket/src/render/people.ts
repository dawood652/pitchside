// Cricketers: skinned players driven by base clips (idle, jog, sprint, crouch) plus procedural
// layers solved in world space after the mixer: two-bone arm IK onto the bat handle, a bowling
// arm that windmills through the delivery, head looking at the ball.
import * as THREE from 'three';
import { createPlayerModel, KitLook, PlayerAsset, PlayerModel } from './playerModel';

const UP = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

export class Person {
  m: PlayerModel;
  mixer: THREE.AnimationMixer;
  private acts = new Map<string, THREE.AnimationAction>();
  private cur = '';
  private childDir = new Map<string, THREE.Vector3>();
  private headFwd = new THREE.Vector3();

  constructor(asset: PlayerAsset, kit: KitLook, scene: THREE.Scene) {
    this.m = createPlayerModel(asset, kit);
    scene.add(this.m.root);
    this.mixer = new THREE.AnimationMixer(this.m.model);
    for (const [n, c] of asset.clips) this.acts.set(n, this.mixer.clipAction(c));
    // bone-local direction toward each bone's child (for aiming limbs)
    for (const [n, child] of [['upperarm_l', 'lowerarm_l'], ['lowerarm_l', 'hand_l'], ['upperarm_r', 'lowerarm_r'], ['lowerarm_r', 'hand_r'], ['thigh_l', 'calf_l'], ['calf_l', 'foot_l'], ['thigh_r', 'calf_r'], ['calf_r', 'foot_r']] as const)
      this.childDir.set(n, this.m.bones.get(child)!.position.clone().normalize());
    this.m.root.updateMatrixWorld(true);
    const head = this.m.bones.get('Head')!;
    head.getWorldQuaternion(_q).invert();
    this.headFwd.set(0, 0, 1).applyQuaternion(_q);
    this.play('Idle_Loop');
  }

  place(x: number, z: number, yaw: number): void {
    this.m.root.position.set(x, 0, z);
    this.m.root.rotation.y = yaw;
  }

  play(name: string, scale = 1, fade = 0.2): void {
    const a = this.acts.get(name);
    if (!a) return;
    a.timeScale = scale;
    if (name === this.cur) return;
    const prev = this.acts.get(this.cur);
    a.reset().play();
    if (prev) a.crossFadeFrom(prev, fade, false);
    this.cur = name;
  }

  update(dt: number): void {
    this.mixer.update(dt);
    this.m.root.updateMatrixWorld(true);
  }

  /** Rotate a bone so its child-direction points along `dir` (world), blended by w. */
  aim(bone: string, dir: THREE.Vector3, w = 1): void {
    const b = this.m.bones.get(bone)!;
    const cd = this.childDir.get(bone)!;
    b.getWorldQuaternion(_q);
    _v.copy(cd).applyQuaternion(_q).normalize();
    _q2.setFromUnitVectors(_v, _v2.copy(dir).normalize());
    if (w < 1) _q2.slerp(new THREE.Quaternion(), 1 - w);
    _q.premultiply(_q2);
    b.parent!.getWorldQuaternion(_q2).invert();
    b.quaternion.copy(_q2.multiply(_q));
    b.updateMatrixWorld(true);
  }

  /** Two-bone IK: put the hand at `target`, elbow bending toward `pole` (world direction). */
  reach(side: 'l' | 'r', target: THREE.Vector3, pole: THREE.Vector3): void {
    const ua = this.m.bones.get(`upperarm_${side}`)!;
    const la = this.m.bones.get(`lowerarm_${side}`)!;
    const ha = this.m.bones.get(`hand_${side}`)!;
    const s = ua.getWorldPosition(new THREE.Vector3());
    const e = la.getWorldPosition(new THREE.Vector3());
    const h = ha.getWorldPosition(new THREE.Vector3());
    const a = s.distanceTo(e);
    const b = e.distanceTo(h);
    const toT = target.clone().sub(s);
    const d = Math.min(a + b - 0.002, Math.max(0.05, toT.length()));
    const dir = toT.normalize();
    const x = (a * a - b * b + d * d) / (2 * d);
    const hgt = Math.sqrt(Math.max(0, a * a - x * x));
    const perp = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
    const elbow = s.clone().addScaledVector(dir, x).addScaledVector(perp, hgt);
    this.aim(`upperarm_${side}`, elbow.clone().sub(s));
    const e2 = la.getWorldPosition(new THREE.Vector3());
    this.aim(`lowerarm_${side}`, s.clone().addScaledVector(dir, d).sub(e2));
  }

  /** Two-bone leg IK: ankle to `target`, knee bending toward `pole` (world direction). */
  step(side: 'l' | 'r', target: THREE.Vector3, pole: THREE.Vector3): void {
    const th = this.m.bones.get(`thigh_${side}`)!;
    const ca = this.m.bones.get(`calf_${side}`)!;
    const ft = this.m.bones.get(`foot_${side}`)!;
    const hip = th.getWorldPosition(new THREE.Vector3());
    const knee = ca.getWorldPosition(new THREE.Vector3());
    const ankle = ft.getWorldPosition(new THREE.Vector3());
    const a = hip.distanceTo(knee);
    const b = knee.distanceTo(ankle);
    const toT = target.clone().sub(hip);
    const d = Math.min(a + b - 0.003, Math.max(0.1, toT.length()));
    const dir = toT.normalize();
    const x = (a * a - b * b + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, a * a - x * x));
    const perp = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
    const k = hip.clone().addScaledVector(dir, x).addScaledVector(perp, h);
    this.aim(`thigh_${side}`, k.clone().sub(hip));
    const k2 = ca.getWorldPosition(new THREE.Vector3());
    this.aim(`calf_${side}`, hip.clone().addScaledVector(dir, d).sub(k2));
  }

  footPos(side: 'l' | 'r'): THREE.Vector3 {
    return this.m.bones.get(`foot_${side}`)!.getWorldPosition(new THREE.Vector3());
  }

  /** Turn the head toward a world point (limited). */
  look(p: THREE.Vector3, w = 1): void {
    const head = this.m.bones.get('Head')!;
    const hp = head.getWorldPosition(new THREE.Vector3());
    head.getWorldQuaternion(_q);
    const fwd = this.headFwd.clone().applyQuaternion(_q);
    const want = p.clone().sub(hp).normalize();
    _q2.setFromUnitVectors(fwd, want);
    _q2.slerp(new THREE.Quaternion(), 1 - 0.85 * w);
    _q.premultiply(_q2);
    head.parent!.getWorldQuaternion(_q2).invert();
    head.quaternion.copy(_q2.multiply(_q));
    head.updateMatrixWorld(true);
  }

  /** Twist / bend the upper body around a world axis after the clip. */
  turn(bone: string, axis: THREE.Vector3, angle: number): void {
    const b = this.m.bones.get(bone)!;
    b.getWorldQuaternion(_q);
    _q.premultiply(_q2.setFromAxisAngle(axis, angle));
    b.parent!.getWorldQuaternion(_q2).invert();
    b.quaternion.copy(_q2.multiply(_q));
    b.updateMatrixWorld(true);
  }

  handPos(side: 'l' | 'r'): THREE.Vector3 {
    return this.m.bones.get(`hand_${side}`)!.getWorldPosition(new THREE.Vector3());
  }
}

/** The bat: grip + blade, positioned from the handle top along a direction. */
export function makeBat(): THREE.Group {
  const g = new THREE.Group();
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.3, 10), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 }));
  grip.position.y = -0.15;
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.108, 0.56, 0.045), new THREE.MeshStandardMaterial({ color: 0xe8cf94, roughness: 0.55 }));
  blade.position.y = -0.3 - 0.28;
  const sticker = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.2), new THREE.MeshStandardMaterial({ color: 0x0b3d91 }));
  sticker.position.set(0, -0.42, -0.0235);
  sticker.rotation.y = Math.PI;
  for (const m of [grip, blade]) m.castShadow = true;
  g.add(grip, blade, sticker);
  return g;
}

/** Simple helmet and pads for the batter, gloves for batter and keeper. */
export function armour(p: Person, pads: boolean, helmetColor: number): void {
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.135, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), new THREE.MeshStandardMaterial({ color: helmetColor, roughness: 0.35, metalness: 0.2 }));
  helmet.position.set(0, 0.11, 0.0);
  const grille = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.008, 6, 16, Math.PI), new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.8, roughness: 0.3 }));
  grille.position.set(0, 0.05, 0.08);
  grille.rotation.set(0, 0, Math.PI);
  const head = p.m.bones.get('Head')!;
  head.add(helmet, grille);
  if (pads)
    for (const s of ['l', 'r']) {
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.62, 0.12), new THREE.MeshStandardMaterial({ color: 0xf7f7f2, roughness: 0.7 }));
      pad.position.set(0, 0.24, 0.05);
      pad.castShadow = true;
      p.m.bones.get(`calf_${s}`)!.add(pad);
    }
  for (const s of ['l', 'r']) {
    const glove = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.13, 0.09), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.7 }));
    glove.position.set(0, 0.06, 0);
    p.m.bones.get(`hand_${s}`)!.add(glove);
  }
  void UP;
}
