// Prints event timing per clip (peak foot/hand speed, pelvis lateral peak) to choose trim windows.
import fs from 'node:fs';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
globalThis.self = globalThis;
const dir = process.argv[2];
for (const f of fs.readdirSync(dir).sort()) {
  if (/Juggling|Card/.test(f)) continue;
  const buf = fs.readFileSync(dir + '/' + f);
  const obj = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
  let sm; obj.traverse(o => { if (o.isSkinnedMesh && !sm) sm = o; });
  const B = new Map(); for (const b of sm.skeleton.bones) if (!B.has(b.name)) B.set(b.name, b);
  const clip = obj.animations[0]; const mx = new THREE.AnimationMixer(obj); mx.clipAction(clip).play();
  const names = ['ball_l', 'ball_r', 'hand_l', 'hand_r', 'pelvis', 'head'];
  let prev = null; const best = {}; const dt = 1 / 30; let minHead = 1e9, minHeadT = 0;
  const rows = [];
  for (let t = 0; t <= clip.duration; t += dt) {
    mx.setTime(t); obj.updateMatrixWorld(true);
    const cur = Object.fromEntries(names.map(n => [n, B.get(n).getWorldPosition(new THREE.Vector3())]));
    if (prev && t > 0.25) for (const n of names) {
      const v = cur[n].distanceTo(prev[n]) / dt / 100;
      if (!best[n] || v > best[n][0]) best[n] = [v, t];
    }
    if (t > 0.25 && cur.head.y < minHead) { minHead = cur.head.y; minHeadT = t; }
    rows.push([t, cur.pelvis.x / 100, cur.pelvis.z / 100, cur.pelvis.y / 100]);
    prev = cur;
  }
  console.log(f.replace('_ue5.fbx', '').padEnd(24), clip.duration.toFixed(1), Object.entries(best).map(([n, [v, t]]) => `${n} ${v.toFixed(1)}@${t.toFixed(2)}`).join('  '), `headMin ${(minHead/100).toFixed(2)}@${minHeadT.toFixed(2)}`);
  if (/Goalkeeper|Defending/.test(f)) console.log('   pelvis x,z,y every 0.5s:', rows.filter((_, i) => i % 15 === 0).map(r => `${r[0].toFixed(1)}:${r[1].toFixed(2)},${r[2].toFixed(2)},${r[3].toFixed(2)}`).join(' '));
}
