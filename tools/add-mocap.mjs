// Retargets football mocap (UE5-mannequin FBX) onto the Pitchside player skeleton and adds the clips
// to src/assets/player.glb as "mc_*" animations (idempotent: old mc_* clips are replaced).
//
// Method: per bone, the source's world rotation change since its rest pose is applied to the target's
// rest pose, after aligning each target bone's direction to the source's (handles A-pose vs T-pose).
// Facing and scale are matched from the hips; horizontal travel is removed so clips play in place.
//
// Usage: node tools/add-mocap.mjs <dir with *_ue5.fbx> [--dump]
import fs from 'node:fs';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { CLIPS } from './mocap-clips.mjs';
import { gfSource, gfCatalogue } from './gf-anim.mjs';

globalThis.self = globalThis;
const GLB = 'src/assets/player.glb';
const FPS = 30;
const dir = process.argv[2];
const dump = process.argv.includes('--dump');
// optional: Google Research Football engine folder (third_party/gfootball_engine)
const gfDir = process.argv.find((a) => a.startsWith('--gf='))?.slice(5);

// target bone -> [source bone, target child used for direction, source child]
const MAP = {
  pelvis: ['pelvis', 'spine_01', 'spine_01'],
  spine_01: ['spine_01', 'spine_02', 'spine_03'],
  spine_02: ['spine_03', 'spine_03', 'spine_05'],
  spine_03: ['spine_05', 'neck_01', 'neck_01'],
  neck_01: ['neck_01', 'Head', 'head'],
  Head: ['head', null, null],
};
for (const s of ['l', 'r']) {
  MAP[`clavicle_${s}`] = [`clavicle_${s}`, `upperarm_${s}`, `upperarm_${s}`];
  MAP[`upperarm_${s}`] = [`upperarm_${s}`, `lowerarm_${s}`, `lowerarm_${s}`];
  MAP[`lowerarm_${s}`] = [`lowerarm_${s}`, `hand_${s}`, `hand_${s}`];
  MAP[`hand_${s}`] = [`hand_${s}`, null, null];
  MAP[`thigh_${s}`] = [`thigh_${s}`, `calf_${s}`, `calf_${s}`];
  MAP[`calf_${s}`] = [`calf_${s}`, `foot_${s}`, `foot_${s}`];
  MAP[`foot_${s}`] = [`foot_${s}`, `ball_${s}`, `ball_${s}`];
  MAP[`ball_${s}`] = [`ball_${s}`, null, null];
}
const swapLR = (n) => n.replace(/_l$/, '_#').replace(/_r$/, '_l').replace(/_#$/, '_r');

const ab = (buf) => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

// ---------- Target skeleton (rest = bind pose)
const gltf = await new GLTFLoader().parseAsync(ab(fs.readFileSync(GLB)), '');
let tMesh;
gltf.scene.traverse((o) => {
  if (o.isSkinnedMesh && !tMesh) tMesh = o;
});
tMesh.skeleton.pose();
gltf.scene.updateMatrixWorld(true);
const tBones = new Map(tMesh.skeleton.bones.map((b) => [b.name, b]));
const tRestQ = new Map();
const tRestP = new Map();
for (const [n, b] of tBones) {
  tRestQ.set(n, b.getWorldQuaternion(new THREE.Quaternion()));
  tRestP.set(n, b.getWorldPosition(new THREE.Vector3()));
}
const tRestLocalQ = new Map([...tBones].map(([n, b]) => [n, b.quaternion.clone()]));
// bones in parent-first order
const order = [];
const visit = (b) => {
  order.push(b);
  for (const c of b.children) if (c.isBone) visit(c);
};
visit(tBones.get('root'));
const tPelvisH = tRestP.get('pelvis').y;

/** UE5-mannequin FBX source (mocap pack). */
function fbxSource(file) {
  const obj = new FBXLoader().parse(ab(fs.readFileSync(file)), '');
  let sMesh;
  obj.traverse((o) => {
    if (o.isSkinnedMesh && !sMesh) sMesh = o;
  });
  const sBones = new Map();
  for (const b of sMesh.skeleton.bones) if (!sBones.has(b.name)) sBones.set(b.name, b);
  // The mixer animates the first node of each name in the hierarchy, which is a different copy
  // from the skin's bones: rest comes from the skin (bind pose), frames from the animated copy.
  const aBones = new Map([...sBones.keys()].map((n) => [n, THREE.PropertyBinding.findNode(obj, n)]));
  return { obj, sBones, aBones, clip: obj.animations[0], setRest: () => sMesh.skeleton.pose(), map: MAP, hips: ['thigh_l', 'thigh_r'], pelvis: 'pelvis', swap: swapLR };
}

export function retarget(source, spec, mirror) {
  const { obj, sBones, aBones, clip, map: SMAP, hips, pelvis: sPelvis, swap } = source;
  let bones = sBones;
  const mixer = new THREE.AnimationMixer(obj);
  const act = mixer.clipAction(clip);
  act.play();

  // rest. The clip animates the FBX "root" bone differently from its bind pose (axis conversion),
  // so every frame is expressed relative to the root bone, then put back on the bind-pose root.
  source.setRest();
  obj.updateMatrixWorld(true);
  const rootRestM = sBones.get('root').matrixWorld.clone();
  const corr = new THREE.Matrix4();
  const corrQ = new THREE.Quaternion();
  const setCorr = () => {
    corr.copy(rootRestM).multiply(bones.get('root').matrixWorld.clone().invert());
    corrQ.setFromRotationMatrix(new THREE.Matrix4().extractRotation(corr));
  };
  setCorr();
  const raw = (n) => ({
    q: corrQ.clone().multiply(bones.get(n).getWorldQuaternion(new THREE.Quaternion())),
    p: bones.get(n).getWorldPosition(new THREE.Vector3()).applyMatrix4(corr),
  });
  const rest0 = new Map([...sBones.keys()].map((n) => [n, raw(n)]));
  // facing: the actor's hip axis (left -> right) at the clip's key moment (contact, release, dive)
  // is turned onto the target's, so at that moment the player faces where the game points him.
  bones = aBones;
  mixer.setTime(spec.key ?? spec.from ?? 0);
  obj.updateMatrixWorld(true);
  setCorr();
  const atKey = (n) => raw(n).p;
  const sv = atKey(hips[1]).sub(atKey(hips[0])).setY(0).normalize();
  bones = sBones;
  source.setRest();
  obj.updateMatrixWorld(true);
  setCorr();
  const tv = tRestP.get('thigh_r').clone().sub(tRestP.get('thigh_l')).setY(0).normalize();
  const yawQ = new THREE.Quaternion().setFromUnitVectors(sv, tv);
  const scale = tPelvisH / rest0.get(sPelvis).p.y;
  // optional per-frame heading lock (for clips whose turning the game does itself)
  let fix = null;
  const conv = (r) => {
    const yq = fix ? yawQ.clone().multiply(fix) : yawQ;
    const q = yq.clone().multiply(r.q);
    const p = r.p.clone().applyQuaternion(yq).multiplyScalar(scale);
    if (mirror) {
      // reflect across the target's sagittal plane (x -> -x)
      q.set(q.x, -q.y, -q.z, q.w);
      p.x = -p.x;
    }
    return { q, p };
  };
  const src = (map, n) => conv(map.get(mirror ? swap(n) : n));
  const sRest = new Map([...sBones.keys()].map((n) => [n, src(rest0, n)]));
  bones = aBones;

  // direction alignment per target bone
  const align = new Map();
  for (const t of order) {
    const m = SMAP[t.name];
    if (!m) continue;
    const [s, tc, sc] = m;
    if (tc && sc) {
      const dt = tRestP.get(tc).clone().sub(tRestP.get(t.name)).normalize();
      const ds = sRest.get(sc).p.clone().sub(sRest.get(s).p).normalize();
      align.set(t.name, new THREE.Quaternion().setFromUnitVectors(dt, ds));
    } else {
      let p = t.parent;
      while (p && !align.has(p.name)) p = p.parent;
      align.set(t.name, p ? align.get(p.name).clone() : new THREE.Quaternion());
    }
  }

  // sample
  const t0 = spec.from ?? 0;
  const t1 = Math.min(clip.duration, spec.to ?? clip.duration);
  const n = Math.max(2, Math.round((t1 - t0) * FPS) + 1);
  const frames = [];
  for (let i = 0; i < n; i++) {
    mixer.setTime(t0 + Math.max(i / FPS, 1e-4)); // setTime(0) can leave the first pose unapplied
    obj.updateMatrixWorld(true);
    setCorr();
    const cur = new Map([...sBones.keys()].map((nm) => [nm, raw(nm)]));
    frames.push(cur);
  }
  // heading lock: undo the actor's (smoothed) change of facing so the game's root rotation drives turns
  const fixes = frames.map(() => null);
  if (spec.headingLock) {
    const head = frames.map((f) => {
      const v = f.get(hips[1]).p.clone().sub(f.get(hips[0]).p);
      return Math.atan2(v.x, v.z);
    });
    const h0 = head[0];
    const un = [h0];
    for (let i = 1; i < head.length; i++) un.push(un[i - 1] + Math.atan2(Math.sin(head[i] - head[i - 1]), Math.cos(head[i] - head[i - 1])));
    const kk = 4;
    for (let i = 0; i < un.length; i++) {
      let a = 0, c = 0;
      for (let j = Math.max(0, i - kk); j <= Math.min(un.length - 1, i + kk); j++) {
        a += un[j];
        c++;
      }
      fixes[i] = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -(a / c - h0));
    }
  }
  const srcF = (i, n) => {
    fix = fixes[i];
    const r = src(frames[i], n);
    fix = null;
    return r;
  };
  // pelvis path (target space) for in-place removal
  const pel = frames.map((f, i) => srcF(i, sPelvis).p);
  const k = Math.max(1, Math.round((spec.smooth ?? 0.5) * FPS));
  const drift = pel.map((_, i) => {
    let x = 0, z = 0, c = 0;
    for (let j = Math.max(0, i - k); j <= Math.min(pel.length - 1, i + k); j++) {
      x += pel[j].x;
      z += pel[j].z;
      c++;
    }
    return { x: x / c, z: z / c };
  });
  const keep = spec.keepTravel ? 1 : 0;

  const tracks = new Map(); // bone -> Float32Array quats
  for (const b of order) if (SMAP[b.name]) tracks.set(b.name, new Float32Array(n * 4));
  const pelvisT = new Float32Array(n * 3);
  const parentWorld = new THREE.Quaternion();
  const rootParent = tBones.get('root').parent;
  rootParent.updateMatrixWorld(true);
  const rootInv = new THREE.Matrix4();
  const worldQ = new Map();
  for (let i = 0; i < n; i++) {
    const f = frames[i];
    worldQ.clear();
    for (const b of order) {
      const name = b.name;
      if (b.parent.isBone) parentWorld.copy(worldQ.get(b.parent.name));
      else b.parent.getWorldQuaternion(parentWorld);
      let w;
      if (SMAP[name]) {
        const s = SMAP[name][0];
        const cur = srcF(i, s);
        const delta = cur.q.clone().multiply(sRest.get(s).q.clone().invert());
        w = delta.multiply(align.get(name)).multiply(tRestQ.get(name));
        const local = parentWorld.clone().invert().multiply(w);
        tracks.get(name).set([local.x, local.y, local.z, local.w], i * 4);
      } else {
        w = parentWorld.clone().multiply(tRestLocalQ.get(name));
      }
      worldQ.set(name, w);
    }
    // pelvis position: world -> root-bone local space (root bone keeps its rest transform)
    const p = pel[i];
    const wp = new THREE.Vector3(p.x - drift[i].x * (1 - keep) + (spec.dx ?? 0), p.y, p.z - drift[i].z * (1 - keep));
    const root = tBones.get('root');
    rootInv.copy(root.matrixWorld).invert();
    wp.applyMatrix4(rootInv);
    pelvisT.set([wp.x, wp.y, wp.z], i * 3);
  }
  return { n, tracks, pelvisT, frames, src, duration: (n - 1) / FPS };
}

// ---------- Write into the GLB
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(GLB);
const root = doc.getRoot();
for (const a of root.listAnimations()) {
  if (!a.getName().startsWith('mc_') && !a.getName().startsWith('gf_')) continue;
  for (const s of a.listSamplers()) {
    s.getInput()?.dispose();
    s.getOutput()?.dispose();
    s.dispose();
  }
  for (const c of a.listChannels()) c.dispose();
  a.dispose();
}
const nodes = new Map(root.listNodes().map((nd) => [nd.getName(), nd]));
const buffer = root.listBuffers()[0];
let total = 0;
const jobs = CLIPS.flatMap((spec) =>
  (spec.mirror ? [false, true] : [false]).map((mirror) => ({ name: `mc_${spec.name}${mirror ? '_M' : ''}`, spec, mirror, source: () => fbxSource(`${dir}/${spec.file}`) })),
);
const catalogue = [];
if (gfDir) {
  const objFile = `${gfDir}/data/media/objects/players/player.object`;
  for (const c of gfCatalogue(`${gfDir}/data/media/animations`)) {
    for (const mirror of [false, true]) {
      const name = `gf_${c.id}${mirror ? '_M' : ''}`;
      jobs.push({ name, spec: { headingLock: true, smooth: 0.3 }, mirror, source: () => gfSource(c.file, objFile) });
      const flip = (a) => (a === null ? null : mirror ? -a : a);
      catalogue.push({ clip: name, cat: c.cat, speed: c.speed, angle: flip(c.angle), ballAngle: flip(c.ballAngle), touch: c.touch, type: c.type, power: c.power, foot: null });
    }
  }
}
for (const { name, spec, mirror, source } of jobs) {
  {
    const r = retarget(source(), spec, mirror);
    const anim = doc.createAnimation(name);
    const times = new Float32Array(r.n).map((_, i) => i / FPS);
    const inp = doc.createAccessor().setType('SCALAR').setArray(times).setBuffer(buffer);
    for (const [bone, arr] of r.tracks) {
      const out = doc.createAccessor().setType('VEC4').setArray(arr).setBuffer(buffer);
      const smp = doc.createAnimationSampler().setInput(inp).setOutput(out).setInterpolation('LINEAR');
      anim.addSampler(smp);
      anim.addChannel(doc.createAnimationChannel().setTargetNode(nodes.get(bone)).setTargetPath('rotation').setSampler(smp));
    }
    const out = doc.createAccessor().setType('VEC3').setArray(r.pelvisT).setBuffer(buffer);
    const smp = doc.createAnimationSampler().setInput(inp).setOutput(out).setInterpolation('LINEAR');
    anim.addSampler(smp);
    anim.addChannel(doc.createAnimationChannel().setTargetNode(nodes.get('pelvis')).setTargetPath('translation').setSampler(smp));
    total += r.n;
    if (!name.startsWith('gf_')) console.log(name.padEnd(28), r.duration.toFixed(2) + 's');
  }
}
if (!dump) {
  await io.write(GLB, doc);
  if (gfDir) fs.writeFileSync('src/assets/gf-anims.json', JSON.stringify(catalogue));
  console.log('gf clips', catalogue.length);
  console.log('frames', total, 'size', (fs.statSync(GLB).size / 1e6).toFixed(2), 'MB');
}
