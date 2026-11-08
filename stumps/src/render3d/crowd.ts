// 3D crowd: thousands of instanced fans seated on the stand slope, each with its own shirt and skin
// colour and idle sway, who leap up with their arms in the air when something big happens.
// One draw call; the animation runs in the vertex shader.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const SHIRTS = [0xc9473f, 0xeae6dc, 0x2e4a7a, 0xd9a63b, 0x3f8f7f, 0x6d5a9e, 0xc76b3a, 0x4f7fc4, 0x2f2f35, 0x9fb3c8, 0x7a1f2b, 0x1d8a4c, 0xf2c94c, 0x1fb6e8];

/** One fan (indexed, ~300 vertices): rounded torso, neck, head with hair, arms, seated legs.
 *  Attribute `part`: 0 shirt, 1 skin, 2 left arm, 3 right arm, 4 trousers, 5 hair / cap. */
function fanGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const put = (g: THREE.BufferGeometry, part: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => {
    g.scale(sx, sy, sz);
    g.translate(x, y, z);
    const n = g.attributes.position.count;
    g.setAttribute('part', new THREE.Float32BufferAttribute(new Array(n).fill(part), 1));
    g.deleteAttribute('uv');
    parts.push(g);
  };
  put(new THREE.CapsuleGeometry(0.17, 0.26, 2, 7), 0, 0, 0.76, 0, 1.15, 1, 0.72); // torso
  put(new THREE.CylinderGeometry(0.045, 0.05, 0.08, 6), 1, 0, 1.02, 0.01); // neck
  put(new THREE.SphereGeometry(0.105, 8, 6), 1, 0, 1.15, 0.015, 0.92, 1.05, 1); // head
  put(new THREE.SphereGeometry(0.11, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.5), 5, 0, 1.17, 0.0, 0.95, 0.9, 1.02); // hair / cap
  put(new THREE.CapsuleGeometry(0.048, 0.36, 2, 5), 2, -0.25, 0.75, 0); // arms hang from the shoulders (pivot y = 0.98)
  put(new THREE.CapsuleGeometry(0.048, 0.36, 2, 5), 3, 0.25, 0.75, 0);
  const thigh = (x: number) => { const g = new THREE.CapsuleGeometry(0.075, 0.3, 2, 5); g.rotateX(Math.PI / 2); put(g, 4, x, 0.44, 0.17); };
  thigh(-0.1);
  thigh(0.1); // seated: thighs forward
  return mergeGeometries(parts)!;
}

export class Crowd {
  mesh: THREE.InstancedMesh;
  private uniforms = { uTime: { value: 0 }, uCheer: { value: 0 } };
  private cheer = 0;

  /** Seats on a cone: radius r0 at height 0 rising to r1 at height h, centred on (0, 0, cz). */
  constructor(scene: THREE.Scene, r0: number, r1: number, h: number, count: number) {
    const geo = fanGeometry();
    const rows = 18;
    const perRow = Math.ceil(count / rows);
    const n = rows * perRow;
    const phase = new Float32Array(n);
    const skin = new Float32Array(n);
    const hair = new Float32Array(n);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const u = this.uniforms;
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = sh.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
attribute float part; attribute float aPhase; attribute float aSkin; attribute float aHair;
uniform float uTime; uniform float uCheer;
varying vec3 vTint; varying float vShirt;`,
        )
        .replace(
          '#include <begin_vertex>',
          `vec3 transformed = vec3(position);
  float ph = aPhase * 6.2831;
  float on = clamp(uCheer * (0.6 + 0.8 * fract(aPhase * 7.13)), 0.0, 1.0); // not everyone reacts the same
  // arms: swing up round the shoulder, waving
  if (part > 1.5 && part < 3.5) {
    float side = part < 2.5 ? -1.0 : 1.0;
    float a = on * (2.7 + 0.35 * sin(uTime * 9.0 + ph)) + 0.08 * sin(uTime * 1.3 + ph);
    vec3 piv = vec3(0.26 * side, 0.98, 0.0);
    vec3 q = transformed - piv;
    float th = a * side; // raise sideways about the forward axis
    float c = cos(th), s = sin(th);
    q = vec3(q.x * c - q.y * s, q.x * s + q.y * c, q.z);
    transformed = piv + q;
  }
  // stand up and bounce
  if (part < 3.5 || part > 4.5) transformed.y += on * (0.35 + 0.12 * abs(sin(uTime * 7.0 + ph)));
  transformed.y += 0.015 * sin(uTime * 2.0 + ph);
  vec3 skinC = mix(vec3(0.42, 0.25, 0.14), vec3(0.95, 0.76, 0.6), aSkin);
  vec3 hairC = aHair < 0.55 ? mix(vec3(0.05, 0.04, 0.03), vec3(0.35, 0.22, 0.12), aHair / 0.55) : aHair < 0.8 ? vec3(0.85, 0.85, 0.82) : vec3(1.0); // dark/brown hair, white cap, or a cap in the shirt colour
  vTint = part > 0.5 && part < 1.5 ? skinC : part > 4.5 ? hairC : vec3(0.13, 0.14, 0.18);
  vShirt = part < 0.5 || (part > 1.5 && part < 3.5) || (part > 4.5 && aHair > 0.8) ? 1.0 : 0.0; // shirt, sleeves, team caps take the shirt colour`,
        );
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vTint; varying float vShirt;')
        .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb = mix(vTint, diffuseColor.rgb, vShirt);');
    };
    mat.customProgramCacheKey = () => 'crowd-3';
    this.mesh = new THREE.InstancedMesh(geo, mat, n);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3(1, 1, 1);
    const col = new THREE.Color();
    let k = 0;
    for (let row = 0; row < rows; row++) {
      const y = 0.6 + (row / rows) * (h - 2.5);
      const r = r0 + (r1 - r0) * (y / h) - 0.55;
      for (let i = 0; i < perRow; i++) {
        const a = ((i + (row % 2) * 0.5) / perRow) * Math.PI * 2 + (Math.random() - 0.5) * 0.002;
        const p = new THREE.Vector3(Math.sin(a) * r, y, Math.cos(a) * r);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a + Math.PI); // face the middle
        s.setScalar(0.92 + Math.random() * 0.16);
        m.compose(p, q, s);
        this.mesh.setMatrixAt(k, m);
        this.mesh.setColorAt(k, col.set(SHIRTS[(Math.random() * SHIRTS.length) | 0]));
        phase[k] = Math.random();
        skin[k] = Math.random();
        hair[k] = Math.random();
        k++;
      }
    }
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
    geo.setAttribute('aSkin', new THREE.InstancedBufferAttribute(skin, 1));
    geo.setAttribute('aHair', new THREE.InstancedBufferAttribute(hair, 1));
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = false;
    scene.add(this.mesh);
  }

  /** 0..1: how loud the moment is (six = 1, four = 0.7, wicket = 0.8). */
  celebrate(level: number): void {
    this.cheer = Math.max(this.cheer, level);
  }

  update(dt: number): void {
    this.uniforms.uTime.value += dt;
    this.cheer = Math.max(0, this.cheer - dt * 0.28);
    this.uniforms.uCheer.value = Math.min(1, this.cheer * 1.4);
  }
}
