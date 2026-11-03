// Reads Gameplay Football / Google Research Football animations (.anim, Apache-2.0) as a three.js
// source skeleton + clip for tools/add-mocap.mjs, and builds a catalogue of their football metadata.
// Format: one line per node ("player" = root position, others = local rotations x,y,z,w), keyed by
// frame at 100 frames per second; then "extension,football,<frame>,x,y,z" (ball contact) and XML tags.
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';

const ANIM_FPS = 100;

/** Rest skeleton from player.object (Z-up, metres, rotation = angle in degrees + axis). */
function buildSkeleton(objectFile) {
  const xml = fs.readFileSync(objectFile, 'utf8');
  const nodes = new Map();
  const root = new THREE.Object3D();
  root.name = 'root';
  const player = new THREE.Object3D();
  player.name = 'player';
  root.add(player);
  const restQ = new Map();
  // walk <node> blocks with a stack to keep the hierarchy
  const stack = [player];
  const re = /<node>|<\/node>|<name>([^<]+)<\/name>|<position>([^<]+)<\/position>|<rotation>([^<]+)<\/rotation>|<geometry>[\s\S]*?<\/geometry>/g;
  let m;
  let cur = null;
  while ((m = re.exec(xml))) {
    if (m[0] === '<node>') {
      cur = new THREE.Object3D();
      stack.at(-1).add(cur);
      stack.push(cur);
    } else if (m[0] === '</node>') {
      stack.pop();
      cur = stack.at(-1);
    } else if (m[1] && cur && !m[0].startsWith('<geometry')) {
      cur.name = m[1].trim();
      nodes.set(cur.name, cur);
    } else if (m[2] && cur) {
      const [x, y, z] = m[2].split(',').map(Number);
      cur.position.set(x, y, z);
    } else if (m[3] && cur) {
      const [a, ax, ay, az] = m[3].split(',').map(Number);
      const axis = new THREE.Vector3(ax, ay, az);
      if (axis.lengthSq() > 0 && a !== 0) cur.quaternion.setFromAxisAngle(axis.normalize(), THREE.MathUtils.degToRad(a));
    }
  }
  // virtual end points so lower arms, feet and the head have a direction to align
  const virt = (parent, name, x, y, z) => {
    const o = new THREE.Object3D();
    o.name = name;
    o.position.set(x, y, z);
    nodes.get(parent).add(o);
    nodes.set(name, o);
  };
  virt('left_elbow', 'left_hand_v', 0, 0, -0.3);
  virt('right_elbow', 'right_hand_v', 0, 0, -0.3);
  virt('left_ankle', 'left_toe_v', 0, -0.14, -0.06);
  virt('right_ankle', 'right_toe_v', 0, -0.14, -0.06);
  virt('neck', 'head_v', 0, 0, 0.22);
  for (const [n, o] of nodes) restQ.set(n, o.quaternion.clone());
  nodes.set('player', player);
  nodes.set('root', root);
  // Z-up (forward = -Y) to three's Y-up (forward = +Z)
  const world = new THREE.Object3D();
  world.rotation.x = -Math.PI / 2;
  world.add(root);
  return { world, nodes, restQ };
}

const GF_MAP = {
  pelvis: ['body', 'spine_01', 'middle'],
  spine_01: ['middle', 'neck_01', 'neck'],
  neck_01: ['neck', 'Head', 'head_v'],
};
for (const [s, S] of [['l', 'left'], ['r', 'right']]) {
  GF_MAP[`upperarm_${s}`] = [`${S}_shoulder`, `lowerarm_${s}`, `${S}_elbow`];
  GF_MAP[`lowerarm_${s}`] = [`${S}_elbow`, `hand_${s}`, `${S}_hand_v`];
  GF_MAP[`thigh_${s}`] = [`${S}_thigh`, `calf_${s}`, `${S}_knee`];
  GF_MAP[`calf_${s}`] = [`${S}_knee`, `foot_${s}`, `${S}_ankle`];
  GF_MAP[`foot_${s}`] = [`${S}_ankle`, `ball_${s}`, `${S}_toe_v`];
}
const swapGF = (n) => (n.startsWith('left_') ? 'right_' + n.slice(5) : n.startsWith('right_') ? 'left_' + n.slice(6) : n);

export function parseAnim(file) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const tracks = [];
  let touch = null;
  let i = 0;
  for (; i < lines.length; i++) {
    const t = lines[i].split(',');
    if (!t[0]) continue;
    if (t[0] === 'extension' || t[0].startsWith('<')) break;
    tracks.push(t);
  }
  for (; i < lines.length; i++) {
    const t = lines[i].split(',');
    if (t[0] !== 'extension') break;
    if (t[1] === 'football') touch = { frame: Number(t[2]), pos: [Number(t[3]), Number(t[4]), Number(t[5])] };
  }
  const xml = lines.slice(i).join('\n');
  const tag = (k) => {
    const m = xml.match(new RegExp(`<${k}>\\s*([^<]*?)\\s*</${k}>`));
    return m ? m[1].trim() : null;
  };
  return { tracks, touch, tag };
}

export function gfSource(file, objectFile) {
  const { world, nodes, restQ } = buildSkeleton(objectFile);
  const { tracks } = parseAnim(file);
  const kf = [];
  let last = 0;
  for (const t of tracks) {
    const name = t[0];
    if (!nodes.has(name)) continue;
    const times = [];
    const vals = [];
    if (name === 'player') {
      for (let k = 1; k + 3 < t.length; k += 4) {
        times.push(Number(t[k]) / ANIM_FPS);
        vals.push(Number(t[k + 1]), Number(t[k + 2]), Number(t[k + 3]));
      }
      kf.push(new THREE.VectorKeyframeTrack('player.position', times, vals));
    } else {
      for (let k = 1; k < t.length; k += 5) {
        times.push(Number(t[k]) / ANIM_FPS);
        vals.push(Number(t[k + 1]), Number(t[k + 2]), Number(t[k + 3]), Number(t[k + 4]));
      }
      kf.push(new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, times, vals));
    }
    last = Math.max(last, times.at(-1) ?? 0);
  }
  const clip = new THREE.AnimationClip('gf', last, kf);
  const bones = new Map([...nodes].filter(([n]) => n !== 'root'));
  bones.set('root', nodes.get('root'));
  return {
    obj: world,
    sBones: bones,
    aBones: bones,
    clip,
    setRest: () => {
      for (const [n, q] of restQ) nodes.get(n).quaternion.copy(q);
      nodes.get('player').position.set(0, 0, 0);
    },
    map: GF_MAP,
    hips: ['left_thigh', 'right_thigh'],
    pelvis: 'body',
    swap: swapGF,
  };
}

/** Which animations to bring in, with their football metadata (angles: + = to the player's left). */
export function gfCatalogue(animDir) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f);
      else if (e.name.endsWith('.anim')) out.push(f);
    }
  };
  walk(animDir);
  const pick = [];
  for (const f of out) {
    const rel = path.relative(animDir, f).replace(/\\/g, '/');
    const parts = rel.split('/');
    const cat = parts[0];
    if (!['pass', 'shot', 'ballcontrol', 'trap', 'sliding'].includes(cat)) continue;
    if (/header|bicycle|headerdive|throw|highballs|nonbase|chest/.test(rel)) continue;
    const speed = parts[1];
    if (!['idle', 'dribble', 'walk', 'sprint'].includes(speed)) continue;
    const a = parseAnim(f);
    if (!a.touch && cat !== 'sliding') continue;
    const base = parts.at(-1).replace('.anim', '');
    const num = base.match(/^D?(\d{3})/);
    let angle = num ? Number(num[1]) : 0;
    const bd = a.tag('balldirection');
    let ballAngle = null;
    if (bd) {
      const [x, y] = bd.split(',').map(Number);
      // GF: +x = player's left, -y = forward
      ballAngle = Math.round(THREE.MathUtils.radToDeg(Math.atan2(x, -y)));
    }
    if (/_left|left_/.test(base)) angle = -angle;
    pick.push({
      file: f,
      id: rel.replace('.anim', '').replace(/[^a-zA-Z0-9]+/g, '_'),
      cat,
      speed,
      angle, // turn / exit angle in degrees (+ left)
      ballAngle, // ball direction from metadata, degrees (+ left)
      touch: a.touch ? a.touch.frame / ANIM_FPS : null,
      type: a.tag('type'),
      power: a.tag('touch_maxpowerfactor') ? Number(a.tag('touch_maxpowerfactor')) : null,
    });
  }
  return pick;
}
