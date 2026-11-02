import fs from 'node:fs';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
globalThis.self = globalThis;
const dir = '/mnt/user-data/uploads/Mocap_Pack_05_Soccer/mocap/UE5/';
for (const f of fs.readdirSync(dir)) {
  const buf = fs.readFileSync(dir + f);
  const obj = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
  const sk = []; obj.traverse(o => { if (o.isSkinnedMesh) sk.push(o); });
  const c = obj.animations[0];
  const pel = c.tracks.find(t => t.name === 'pelvis.position');
  const rt = c.tracks.find(t => t.name === 'root.position');
  const v = pel.values, n = v.length / 3;
  const rv = rt ? rt.values : [];
  console.log(f.padEnd(34), c.duration.toFixed(2), 'keys', pel.times.length, 'pelvis0', [v[0], v[1], v[2]].map(x => x.toFixed(1)).join(','), 'pelvisEnd', [v[3*n-3], v[3*n-2], v[3*n-1]].map(x => x.toFixed(1)).join(','), 'rootEnd', rv.length ? [rv[rv.length-3], rv[rv.length-2], rv[rv.length-1]].map(x=>x.toFixed(1)).join(',') : '-', 'skins', sk.length, 'objrot', obj.rotation.toArray().slice(0,3).map(x=>x.toFixed(2)).join(','));
}
