// Drives the skinned batter from the batting engine's skeleton every frame: pelvis placed, torso
// turned to match the hip and shoulder lines, arms by IK onto the handle (top hand in front of the
// handle, bottom hand behind it, both hands wrapped round it), legs by IK onto the feet, head on
// the ball. Field coords -> world: x is mirrored (see arena.ts).
import * as THREE from 'three';
import { Skeleton } from '../batting/body';
import { BatPose } from '../batting/physics';
import { V } from '../batting/vec';
import { Person } from './people';

const W = (p: V) => new THREE.Vector3(-p.x, p.y, p.z);
const Wd = W; // directions convert the same way

interface Rest {
  q: Map<THREE.Bone, THREE.Quaternion>;
  pos: Map<THREE.Bone, THREE.Vector3>;
  worldQ: Map<string, THREE.Quaternion>;
  y: THREE.Vector3; // pelvis -> chest
  x: THREE.Vector3; // right hip -> left hip
  hand: Map<string, { k: THREE.Vector3; f: THREE.Vector3 }>; // knuckle line, finger direction (world, rest)
}

const _m0 = new THREE.Matrix4();
const _m1 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();

function frame(x: THREE.Vector3, y: THREE.Vector3, out: THREE.Matrix4): THREE.Matrix4 {
  const Y = y.clone().normalize();
  const X = x.clone().sub(Y.clone().multiplyScalar(x.dot(Y))).normalize();
  const Z = new THREE.Vector3().crossVectors(X, Y);
  return out.makeBasis(X, Y, Z);
}

export class BatterRig {
  private rest: Rest;
  constructor(private p: Person) {
    const b = p.m.bones;
    p.m.root.position.set(0, 0, 0);
    p.m.root.rotation.set(0, 0, 0);
    p.mixer.stopAllAction();
    p.m.root.updateMatrixWorld(true);
    const wp = (n: string) => b.get(n)!.getWorldPosition(new THREE.Vector3());
    const q = new Map<THREE.Bone, THREE.Quaternion>();
    const pos = new Map<THREE.Bone, THREE.Vector3>();
    const worldQ = new Map<string, THREE.Quaternion>();
    for (const [n, bone] of b) {
      q.set(bone, bone.quaternion.clone());
      pos.set(bone, bone.position.clone());
      worldQ.set(n, bone.getWorldQuaternion(new THREE.Quaternion()));
    }
    const hand = new Map<string, { k: THREE.Vector3; f: THREE.Vector3 }>();
    for (const s of ['l', 'r']) hand.set(s, { k: wp(`pinky_01_${s}`).sub(wp(`index_01_${s}`)), f: wp(`middle_01_${s}`).sub(wp(`hand_${s}`)) });
    this.rest = { q, pos, worldQ, y: wp('spine_03').sub(wp('pelvis')), x: wp('thigh_l').sub(wp('thigh_r')), hand };
  }

  private setWorldQ(name: string, wq: THREE.Quaternion): void {
    const bone = this.p.m.bones.get(name)!;
    bone.parent!.getWorldQuaternion(_q2).invert();
    bone.quaternion.copy(_q2.multiply(wq));
    bone.updateMatrixWorld(true);
  }

  /** Rotate a bone rigidly so its rest frame (rx, ry) maps onto (tx, ty). */
  private basis(name: string, rx: THREE.Vector3, ry: THREE.Vector3, tx: THREE.Vector3, ty: THREE.Vector3): void {
    frame(rx, ry, _m0);
    frame(tx, ty, _m1);
    _m1.multiply(_m0.transpose());
    _q.setFromRotationMatrix(_m1).multiply(this.rest.worldQ.get(name)!);
    this.setWorldQ(name, _q.clone());
  }

  pose(sk: Skeleton, ball: V | null): void {
    const { p, rest } = this;
    for (const [bone, rq] of rest.q) {
      bone.quaternion.copy(rq);
      bone.position.copy(rest.pos.get(bone)!);
    }
    const root = p.m.root;
    root.updateMatrixWorld(true);
    // pelvis to the engine's pelvis
    const pel = p.m.bones.get('pelvis')!;
    pel.position.copy(pel.parent!.worldToLocal(W(sk.pelvis)));
    pel.updateMatrixWorld(true);
    // torso: hips follow the hip line, the spine twists up to the shoulder line
    const up = W(sk.neck).sub(W(sk.pelvis));
    const hipX = W(sk.hipL).sub(W(sk.hipR));
    const shX = W(sk.shL).sub(W(sk.shR));
    this.basis('pelvis', rest.x, rest.y, hipX, up);
    const spines: [string, number][] = [['spine_01', 0.35], ['spine_02', 0.7], ['spine_03', 1]];
    for (const [n, k] of spines) this.basis(n, rest.x, rest.y, hipX.clone().lerp(shX, k), up);
    // head on the ball
    p.look(ball ? W(ball) : W(sk.look), 1);
    // hands: top (left) hand in front of the handle, bottom (right) hand behind it
    const bat = sk.bat;
    const d = Wd(bat.d).normalize();
    const n = Wd(bat.n).normalize();
    this.hand('l', W(sk.haL), d, n, 1, W(sk.elL).sub(W(sk.shL)));
    this.hand('r', W(sk.haR), d, n, -1, W(sk.elR).sub(W(sk.shR)));
    // legs onto the feet, knees toward the engine's knees, feet pointing at the toes
    for (const [s, hip, knee, ft, toe] of [['l', sk.hipL, sk.knL, sk.ftL, sk.toeL], ['r', sk.hipR, sk.knR, sk.ftR, sk.toeR]] as const) {
      const pole = W(knee).sub(W(hip).add(W(ft)).multiplyScalar(0.5));
      p.step(s, W(ft), pole.lengthSq() > 1e-6 ? pole : new THREE.Vector3(-1, 0, 0));
      p.aim(`foot_${s}`, W(toe).sub(W(ft)));
    }
  }

  /** Wrist placed so the palm wraps the handle at `grip`; fingers curled round it. */
  private hand(s: 'l' | 'r', grip: THREE.Vector3, d: THREE.Vector3, n: THREE.Vector3, side: number, elbowDir: THREE.Vector3): void {
    const p = this.p;
    const fingers = n.clone().multiplyScalar(-side); // top hand: fingers wrap from the front round the back
    const wrist = grip.clone().addScaledVector(fingers, -0.075).addScaledVector(d, -0.02);
    p.reach(s, wrist, elbowDir.lengthSq() > 1e-6 ? elbowDir : new THREE.Vector3(0, -1, 0));
    const r = this.rest.hand.get(s)!;
    const knuckle = d.clone().multiplyScalar(-1); // pinky toward the top of the handle
    this.basis(`hand_${s}`, r.k, r.f, knuckle, fingers);
    // curl each finger toward the handle axis
    const axisPt = grip;
    for (const f of ['index', 'middle', 'ring', 'pinky']) {
      for (const [j, ang] of [[1, 1.0], [2, 1.15], [3, 0.8]] as const) {
        const bone = p.m.bones.get(`${f}_0${j}_${s}`);
        const child = p.m.bones.get(`${f}_0${j + 1}${j === 3 ? '_leaf' : ''}_${s}`);
        if (!bone || !child) continue;
        const a = bone.getWorldPosition(new THREE.Vector3());
        const seg = child.getWorldPosition(new THREE.Vector3()).sub(a);
        const toAxis = axisPt.clone().sub(a);
        toAxis.sub(d.clone().multiplyScalar(toAxis.dot(d)));
        const ax = new THREE.Vector3().crossVectors(seg, toAxis);
        if (ax.lengthSq() < 1e-10) continue;
        p.turn(bone.name, ax.normalize(), Math.min(ang, seg.angleTo(toAxis) + 0.6));
      }
    }
    const th = p.m.bones.get(`thumb_02_${s}`);
    if (th) p.turn(th.name, d, 0.5 * side);
  }
}

/** Bat mesh placed from the engine's bat pose (handle top h, down-the-bat d, face normal n). */
export function placeBat(g: THREE.Object3D, b: BatPose): void {
  const y = Wd(b.d).multiplyScalar(-1).normalize();
  const z = Wd(b.n).multiplyScalar(-1);
  z.sub(y.clone().multiplyScalar(z.dot(y))).normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  g.position.copy(W(b.h));
}
