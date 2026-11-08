// Realistic players: Microsoft Rocketbox avatars (MIT licence) with their own motion-captured
// clips (run, jog, idle, crouch, cheer, clap). Clothes are recoloured into team kit with a
// per-avatar mask (shirt / trousers / fold shading). A Retarget copies the pose of an invisible
// driver skeleton (the batting engine's rig, or the bowling clip) onto an avatar.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

export const AVATARS = ['rb09', 'rb11', 'rb16', 'rb20'];
const BASE = './players/';

export interface RbAsset {
  scenes: Map<string, THREE.Group>;
  masks: Map<string, THREE.Texture>;
  clips: Map<string, THREE.AnimationClip>;
}

export async function loadRocketbox(): Promise<RbAsset> {
  const loader = new GLTFLoader();
  const tl = new THREE.TextureLoader();
  const [anims, ...avs] = await Promise.all([loader.loadAsync(BASE + 'anims.glb'), ...AVATARS.map((a) => loader.loadAsync(BASE + a + '.glb'))]);
  const masks = await Promise.all(AVATARS.map((a) => tl.loadAsync(BASE + a + '-kit.png')));
  const clips = new Map<string, THREE.AnimationClip>();
  for (const c of anims.animations) {
    // keep rotations only (in-place clips; positions would fight our placement), except the pelvis height
    c.tracks = c.tracks.filter((t) => t.name.endsWith('.quaternion') || (t.name.startsWith('Bip01_Pelvis') && t.name.endsWith('.position')) || t.name.startsWith('Bip01.position'));
    clips.set(c.name.replace(/^m_/, ''), c);
  }
  masks.forEach((m) => {
    m.flipY = false;
    m.colorSpace = THREE.NoColorSpace;
  });
  return { scenes: new Map(AVATARS.map((a, i) => [a, avs[i].scene])), masks: new Map(AVATARS.map((a, i) => [a, masks[i]])), clips };
}

/** Body material with team colours painted over the shirt and trousers (fold shading kept). */
function kitify(mat: THREE.MeshStandardMaterial, mask: THREE.Texture, shirt: THREE.Color, trousers: THREE.Color): THREE.MeshStandardMaterial {
  const m = mat.clone();
  const u = { uMask: { value: mask }, uShirt: { value: shirt }, uTrousers: { value: trousers } };
  m.userData.kit = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uMask; uniform vec3 uShirt; uniform vec3 uTrousers;')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
  vec4 kitM = texture2D(uMask, vMapUv);
  float kitD = 0.5 + kitM.b;
  diffuseColor.rgb = mix(diffuseColor.rgb, uShirt * kitD, kitM.r);
  diffuseColor.rgb = mix(diffuseColor.rgb, uTrousers * kitD, kitM.g);`,
      );
  };
  m.customProgramCacheKey = () => 'rbkit-1';
  m.roughness = 0.78;
  return m;
}

export class RbPerson {
  root = new THREE.Group();
  model: THREE.Object3D;
  bones = new Map<string, THREE.Bone>();
  mixer: THREE.AnimationMixer;
  private acts = new Map<string, THREE.AnimationAction>();
  private cur = '';
  private kitMats: THREE.MeshStandardMaterial[] = [];

  constructor(
    private asset: RbAsset,
    public avatar: string,
    scene: THREE.Scene,
  ) {
    this.model = SkeletonUtils.clone(asset.scenes.get(avatar)!);
    this.model.traverse((o) => {
      if ((o as THREE.Bone).isBone) this.bones.set(o.name, o as THREE.Bone);
      const sm = o as THREE.SkinnedMesh;
      if (sm.isSkinnedMesh) {
        sm.castShadow = true;
        sm.frustumCulled = false;
        const mats = (Array.isArray(sm.material) ? sm.material : [sm.material]) as THREE.MeshStandardMaterial[];
        const out = mats.map((mm) => {
          if (mm.name.includes('body')) {
            const k = kitify(mm, asset.masks.get(avatar)!, new THREE.Color(0xffffff), new THREE.Color(0xffffff));
            this.kitMats.push(k);
            return k;
          }
          if (mm.name.includes('opacity')) {
            const c = mm.clone();
            c.alphaTest = 0.5;
            c.transparent = false;
            return c;
          }
          return mm;
        });
        sm.material = Array.isArray(sm.material) ? out : out[0];
      }
    });
    this.root.add(this.model);
    scene.add(this.root);
    this.resetPose(); // records the rest pose
    this.mixer = new THREE.AnimationMixer(this.model);
    for (const [n, c] of asset.clips) this.acts.set(n, this.mixer.clipAction(c));
  }

  private rest = new Map<THREE.Bone, [THREE.Vector3, THREE.Quaternion, THREE.Vector3]>();

  /** Back to the loaded rest pose (skeleton.pose() breaks on this rig: its root bone sits under a scaled node). */
  resetPose(): void {
    if (!this.rest.size) for (const b of this.bones.values()) this.rest.set(b, [b.position.clone(), b.quaternion.clone(), b.scale.clone()]);
    for (const [b, [p, q, s]] of this.rest) {
      b.position.copy(p);
      b.quaternion.copy(q);
      b.scale.copy(s);
    }
  }

  bone(n: string): THREE.Bone {
    return this.bones.get('Bip01_' + n.replace(/ /g, '_'))!;
  }

  setKit(shirt: number, trousers: number): void {
    for (const m of this.kitMats) {
      m.userData.kit.uShirt.value.set(shirt);
      m.userData.kit.uTrousers.value.set(trousers);
    }
  }

  place(x: number, z: number, yaw: number): void {
    this.root.position.set(x, 0, z);
    this.root.rotation.y = yaw;
  }

  play(name: string, speed = 1, fade = 0.2): void {
    const a = this.acts.get(name);
    if (!a) return;
    a.timeScale = speed;
    if (this.cur === name) return;
    const prev = this.acts.get(this.cur);
    a.reset().play();
    if (prev) a.crossFadeFrom(prev, fade, false);
    this.cur = name;
  }

  update(dt: number): void {
    this.mixer.update(dt);
  }
}

// ------------------------------------------------------------------ retargeting
// source (UE-style mannequin used by the batting rig / bowling clip) -> Rocketbox biped
const FINGERS: [string, string][] = [
  ['thumb', '0'],
  ['index', '1'],
  ['middle', '2'],
  ['ring', '3'],
  ['pinky', '4'],
];
function pairs(): [string, string, string | null, string | null][] {
  // [src, dst, srcChild, dstChild] parent-first
  const p: [string, string, string | null, string | null][] = [
    ['pelvis', 'Pelvis', 'spine_03', 'Spine2'],
    ['spine_01', 'Spine', 'neck_01', 'Neck'],
    ['spine_02', 'Spine1', 'neck_01', 'Neck'],
    ['spine_03', 'Spine2', 'neck_01', 'Neck'],
    ['neck_01', 'Neck', 'Head', 'Head'],
    ['Head', 'Head', null, null],
  ];
  for (const [s, d] of [['l', 'L'], ['r', 'R']]) {
    p.push([`clavicle_${s}`, `${d} Clavicle`, `upperarm_${s}`, `${d} UpperArm`]);
    p.push([`upperarm_${s}`, `${d} UpperArm`, `lowerarm_${s}`, `${d} Forearm`]);
    p.push([`lowerarm_${s}`, `${d} Forearm`, `hand_${s}`, `${d} Hand`]);
    p.push([`hand_${s}`, `${d} Hand`, `middle_01_${s}`, `${d} Finger2`]);
    for (const [f, k] of FINGERS) {
      p.push([`${f}_01_${s}`, `${d} Finger${k}`, `${f}_02_${s}`, `${d} Finger${k}1`]);
      p.push([`${f}_02_${s}`, `${d} Finger${k}1`, `${f}_03_${s}`, `${d} Finger${k}2`]);
      p.push([`${f}_03_${s}`, `${d} Finger${k}2`, null, null]);
    }
  }
  for (const [s, d] of [['l', 'L'], ['r', 'R']]) {
    p.push([`thigh_${s}`, `${d} Thigh`, `calf_${s}`, `${d} Calf`]);
    p.push([`calf_${s}`, `${d} Calf`, `foot_${s}`, `${d} Foot`]);
    p.push([`foot_${s}`, `${d} Foot`, `ball_${s}`, `${d} Toe0`]);
    p.push([`ball_${s}`, `${d} Toe0`, null, null]);
  }
  return p;
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();

function basis(dir: THREE.Vector3, ref: THREE.Vector3, out: THREE.Matrix4): THREE.Matrix4 {
  const y = dir.clone().normalize();
  let x = ref.clone().sub(y.clone().multiplyScalar(ref.dot(y)));
  if (x.lengthSq() < 1e-6) x = new THREE.Vector3(1, 0, 0).sub(y.clone().multiplyScalar(y.x));
  x.normalize();
  return out.makeBasis(x, y, new THREE.Vector3().crossVectors(x, y));
}

interface Link {
  s: THREE.Bone;
  d: THREE.Bone;
  invS: THREE.Quaternion; // inverse of source rest world rotation
  R: THREE.Quaternion; // destination rest rotation, aligned to the source rest
}

export class Retarget {
  private links: Link[] = [];
  private hScale = 1;
  private srcPelvis: THREE.Bone;
  private dstPelvis: THREE.Bone;
  private footLift = 0;

  constructor(
    private src: { root: THREE.Object3D; bones: Map<string, THREE.Bone> },
    private dst: RbPerson,
  ) {
    // measure both skeletons in their bind (rest) pose, at the origin, facing the same way
    // (both are still in their loaded rest pose here: no animation frame has run yet)
    dst.resetPose();
    const sr = src.root;
    const keep = { p: sr.position.clone(), q: sr.quaternion.clone() };
    sr.position.set(0, 0, 0);
    sr.quaternion.identity();
    sr.updateMatrixWorld(true);
    dst.root.position.set(0, 0, 0);
    dst.root.quaternion.identity();
    dst.mixer.stopAllAction();
    dst.root.updateMatrixWorld(true);
    const sb = (n: string) => src.bones.get(n)!;
    const db = (n: string) => dst.bone(n);
    const wp = (b: THREE.Bone) => b.getWorldPosition(new THREE.Vector3());
    const lateralS = wp(sb('thigh_l')).sub(wp(sb('thigh_r')));
    const lateralD = wp(db('L Thigh')).sub(wp(db('R Thigh')));
    const fwd = new THREE.Vector3(0, 0, 1);
    let parentA = new THREE.Quaternion();
    for (const [s, d, sc, dc] of pairs()) {
      const S = sb(s);
      const D = db(d);
      if (!S || !D) continue;
      let A: THREE.Quaternion;
      if (sc && dc && sb(sc) && db(dc)) {
        const ds = wp(sb(sc)).sub(wp(S));
        const dd = wp(db(dc)).sub(wp(D));
        const torso = /pelvis|spine|neck/.test(s);
        const hand = s.startsWith('hand');
        const refS = torso ? lateralS : hand ? wp(sb(s.replace('hand', 'thumb_01'))).sub(wp(S)) : s.startsWith('foot') ? new THREE.Vector3(1, 0, 0) : fwd;
        const refD = torso ? lateralD : hand ? wp(db(d.replace('Hand', 'Finger0'))).sub(wp(D)) : s.startsWith('foot') ? new THREE.Vector3(1, 0, 0) : fwd;
        basis(ds, refS, _m);
        basis(dd, refD, _m2);
        A = new THREE.Quaternion().setFromRotationMatrix(_m.multiply(_m2.transpose()));
        parentA = A;
      } else A = parentA.clone();
      this.links.push({ s: S, d: D, invS: S.getWorldQuaternion(new THREE.Quaternion()).invert(), R: A.multiply(D.getWorldQuaternion(new THREE.Quaternion())) });
    }
    this.srcPelvis = sb('pelvis');
    this.dstPelvis = db('Pelvis');
    this.hScale = wp(this.dstPelvis).y / wp(this.srcPelvis).y;
    this.footLift = wp(db('L Foot')).y - wp(sb('foot_l')).y;
    sr.position.copy(keep.p);
    sr.quaternion.copy(keep.q);
    sr.updateMatrixWorld(true);
  }

  private setWorldQ(b: THREE.Bone, q: THREE.Quaternion): void {
    b.parent!.getWorldQuaternion(_q2).invert();
    b.quaternion.copy(_q2.multiply(q));
    b.updateMatrixWorld(true);
  }

  /** Copy the source pose. With ik, hands and feet are pinned to the source's (the bat stays in the hands). */
  apply(ik: boolean): void {
    const { src, dst } = this;
    dst.root.position.copy(src.root.position);
    dst.root.quaternion.copy(src.root.quaternion);
    dst.root.updateMatrixWorld(true);
    // pelvis: source position relative to its root, scaled to this body's leg length
    const sp = this.srcPelvis.getWorldPosition(_a);
    src.root.worldToLocal(sp);
    sp.y *= this.hScale;
    dst.root.localToWorld(sp);
    this.dstPelvis.parent!.worldToLocal(sp);
    this.dstPelvis.position.copy(sp);
    this.dstPelvis.updateMatrixWorld(true);
    const handQ = new Map<THREE.Bone, THREE.Quaternion>();
    for (const L of this.links) {
      L.s.getWorldQuaternion(_q).multiply(L.invS).multiply(L.R);
      this.setWorldQ(L.d, _q);
      if (L.d.name.endsWith('Hand') || L.d.name.endsWith('Foot')) handQ.set(L.d, _q.clone());
    }
    if (!ik) return;
    for (const [s, d] of [['l', 'L'], ['r', 'R']]) {
      this.ik(dst.bone(`${d} UpperArm`), dst.bone(`${d} Forearm`), dst.bone(`${d} Hand`), src.bones.get(`hand_${s}`)!.getWorldPosition(new THREE.Vector3()), src.bones.get(`lowerarm_${s}`)!.getWorldPosition(new THREE.Vector3()));
      const ft = src.bones.get(`foot_${s}`)!.getWorldPosition(new THREE.Vector3());
      ft.y += this.footLift;
      this.ik(dst.bone(`${d} Thigh`), dst.bone(`${d} Calf`), dst.bone(`${d} Foot`), ft, src.bones.get(`calf_${s}`)!.getWorldPosition(new THREE.Vector3()));
      for (const n of [`${d} Hand`, `${d} Foot`]) this.setWorldQ(dst.bone(n), handQ.get(dst.bone(n))!);
    }
  }

  /** Two-bone IK: end effector to target, bending toward the pole point. */
  private ik(a: THREE.Bone, b: THREE.Bone, c: THREE.Bone, target: THREE.Vector3, pole: THREE.Vector3): void {
    const pa = a.getWorldPosition(new THREE.Vector3());
    const pb = b.getWorldPosition(new THREE.Vector3());
    const pc = c.getWorldPosition(new THREE.Vector3());
    const l1 = pa.distanceTo(pb);
    const l2 = pb.distanceTo(pc);
    const toT = target.clone().sub(pa);
    const d = Math.min(toT.length(), (l1 + l2) * 0.999);
    const dir = toT.normalize();
    const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
    const along = l1 * cosA;
    const h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
    const pv = pole.clone().sub(pa);
    pv.sub(dir.clone().multiplyScalar(pv.dot(dir)));
    if (pv.lengthSq() < 1e-8) pv.set(0, -1, 0);
    pv.normalize();
    const elbow = pa.clone().addScaledVector(dir, along).addScaledVector(pv, h);
    this.swing(a, pb, elbow);
    this.swing(b, c.getWorldPosition(new THREE.Vector3()), pa.clone().addScaledVector(dir, d));
  }

  private swing(bone: THREE.Bone, childNow: THREE.Vector3, want: THREE.Vector3): void {
    const p = bone.getWorldPosition(_b);
    const from = childNow.clone().sub(p).normalize();
    const to = want.clone().sub(p).normalize();
    _q.setFromUnitVectors(from, to).multiply(bone.getWorldQuaternion(_q2));
    this.setWorldQ(bone, _q.clone());
  }
}
