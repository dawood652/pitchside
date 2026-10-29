// Loads the skinned footballer (Quaternius UAL mannequin, CC0) and paints kits with a bind-pose shader.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
// Inlined as a data URL and decoded here: the published page blocks fetch() and WebAssembly.
import playerData from '../assets/player.glb?inline';
import { KitPattern } from '../data/teams';

export interface PlayerAsset {
  scene: THREE.Object3D;
  clips: Map<string, THREE.AnimationClip>;
  /** attribute space → bind-pose metres, per mesh name */
  mapping: Map<string, { scale: THREE.Vector3; offset: THREE.Vector3 }>;
}

export interface KitLook {
  primary: string;
  secondary: string;
  shorts: string;
  socks: string;
  boots: string;
  skin: string;
  hair: string;
  pattern: KitPattern;
  numberColor: string;
  number: number;
  name: string;
  keeper: boolean;
  hairStyle: number; // 0 short, 1 shaved, 2 longer
}

let asset: PlayerAsset | null = null;

export async function loadPlayerAsset(): Promise<PlayerAsset> {
  if (asset) return asset;
  const loader = new GLTFLoader();
  const b64 = playerData.slice(playerData.indexOf(',') + 1);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const gltf = await loader.parseAsync(bytes.buffer, '');
  const clips = new Map(gltf.animations.map((a) => [a.name, a]));
  const mapping = new Map<string, { scale: THREE.Vector3; offset: THREE.Vector3 }>();
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isSkinnedMesh) return;
    // Skin every vertex with the loaded rest (T-)pose to get bind-pose metres, then fit an affine map
    m.updateMatrixWorld(true);
    const pa = m.geometry.attributes.position;
    const v = new THREE.Vector3();
    const gb = new THREE.Box3();
    const sb = new THREE.Box3();
    for (let i = 0; i < pa.count; i++) {
      v.fromBufferAttribute(pa, i);
      gb.expandByPoint(v);
      m.applyBoneTransform(i, v);
      sb.expandByPoint(v);
    }
    const gs = new THREE.Vector3().subVectors(gb.max, gb.min);
    const ss = new THREE.Vector3().subVectors(sb.max, sb.min);
    const scale = new THREE.Vector3(ss.x / gs.x, ss.y / gs.y, ss.z / gs.z);
    const offset = new THREE.Vector3(sb.min.x - gb.min.x * scale.x, sb.min.y - gb.min.y * scale.y, sb.min.z - gb.min.z * scale.z);
    mapping.set(m.name, { scale, offset });
  });
  asset = { scene: gltf.scene, clips, mapping };
  return asset;
}

function backTexture(k: KitLook): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 320;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 256, 320);
  g.fillStyle = k.numberColor;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = 'bold 44px Arial, sans-serif';
  g.fillText(k.name.toUpperCase().slice(0, 12), 128, 34, 240);
  g.font = 'bold 200px Arial, sans-serif';
  g.fillText(String(k.number), 128, 196, 230);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = true;
  return t;
}

const PATTERN_ID: Record<KitPattern, number> = { plain: 0, stripes: 1, hoops: 2, sash: 3, halves: 4 };

function kitMaterial(k: KitLook, map: { scale: THREE.Vector3; offset: THREE.Vector3 }): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0 });
  const u = {
    uPrimary: { value: new THREE.Color(k.primary) },
    uSecondary: { value: new THREE.Color(k.secondary) },
    uShorts: { value: new THREE.Color(k.shorts) },
    uSocks: { value: new THREE.Color(k.socks) },
    uBoots: { value: new THREE.Color(k.boots) },
    uSkin: { value: new THREE.Color(k.skin) },
    uHair: { value: new THREE.Color(k.hair) },
    uNumber: { value: new THREE.Color(k.numberColor) },
    uPattern: { value: PATTERN_ID[k.pattern] },
    uKeeper: { value: k.keeper ? 1 : 0 },
    uHairStyle: { value: k.hairStyle },
    uBack: { value: backTexture(k) },
    uScale: { value: map.scale },
    uOffset: { value: map.offset },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uScale; uniform vec3 uOffset; varying vec3 vBind;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBind = position * uScale + uOffset;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vBind;
        uniform vec3 uPrimary, uSecondary, uShorts, uSocks, uBoots, uSkin, uHair, uNumber;
        uniform float uPattern, uKeeper, uHairStyle;
        uniform sampler2D uBack;
        float region; // 0 kit fabric, 1 skin, 2 boot, 3 hair
        vec3 kitColor(vec3 p) {
          float ax = abs(p.x);
          region = 0.0;
          if (p.y < 0.115) { region = 2.0; return uBoots; }
          if (p.y < 0.46) return uSocks;
          if (p.y < 0.63) { region = 1.0; return uSkin; }
          if (p.y < 0.985 && ax < 0.27) {
            float side = step(0.16, ax) * step(ax, 0.185);
            return mix(uShorts, uSecondary, side * 0.85);
          }
          // Arms (T-pose bind: arms along x)
          if (p.y > 1.28 && ax > 0.2) {
            float sleeveEnd = uKeeper > 0.5 ? 0.70 : 0.36;
            if (ax < sleeveEnd) {
              float cuff = step(sleeveEnd - 0.025, ax);
              return mix(uPattern == 1.0 && uKeeper < 0.5 ? mix(uPrimary, uSecondary, 0.0) : uPrimary, uSecondary, cuff);
            }
            region = 1.0;
            if (ax > 0.70 && uKeeper > 0.5) { region = 0.0; return vec3(0.92); }
            return uSkin;
          }
          if (p.y < 1.49) {
            vec3 c = uPrimary;
            if (uPattern == 1.0) c = mix(uPrimary, uSecondary, step(0.5, fract((p.x + 1.0) / 0.105)));
            else if (uPattern == 2.0) c = mix(uPrimary, uSecondary, step(0.5, fract(p.y / 0.12)));
            else if (uPattern == 4.0) c = mix(uPrimary, uSecondary, step(ax, 0.055));
            else c = mix(uPrimary, uSecondary, step(0.205, ax) * step(ax, 0.235));
            // Collar
            if (p.y > 1.43 && ax < 0.1) c = uSecondary;
            // Name and number on the back
            if (p.z < -0.04 && p.y > 1.04 && p.y < 1.42 && ax < 0.17) {
              vec2 uv = vec2(0.5 - p.x / 0.34, (p.y - 1.04) / 0.38);
              float a = texture2D(uBack, uv).a;
              c = mix(c, uNumber, a);
            }
            // Small crest on the chest
            if (p.z > 0.08 && p.y > 1.30 && p.y < 1.36 && p.x > 0.06 && p.x < 0.11) c = mix(c, uSecondary, 0.8);
            return c;
          }
          // Head and neck
          region = 1.0;
          float hairLine = uHairStyle == 1.0 ? 1.79 : uHairStyle == 2.0 ? 1.70 : 1.745;
          float backHair = uHairStyle == 1.0 ? 1.74 : uHairStyle == 2.0 ? 1.56 : 1.62;
          if ((p.y > hairLine && p.z < 0.085) || (p.z < -0.03 && p.y > backHair)) { region = 3.0; return uHair; }
          // Simple face: brows, eyes, mouth
          if (p.z > 0.075) {
            float ex = abs(p.x) - 0.036;
            if (abs(p.y - 1.718) < 0.0065 && abs(ex) < 0.017) return uHair * 0.8;
            if (abs(p.y - 1.697) < 0.007 && abs(ex) < 0.011) return vec3(0.12, 0.1, 0.09);
            if (abs(p.y - 1.632) < 0.004 && abs(p.x) < 0.022) return uSkin * 0.6;
          }
          return uSkin;
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        diffuseColor.rgb = kitColor(vBind);
        if (region == 0.0) {
          // Fabric folds and weave so kits don't look painted on
          float fold = sin(vBind.y * 38.0 + sin(vBind.x * 21.0) * 2.4) * 0.5 + 0.5;
          float weave = sin(vBind.x * 900.0) * sin(vBind.y * 900.0);
          diffuseColor.rgb *= 0.9 + 0.1 * fold + 0.02 * weave;
        }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        // Broadcast-style rim light separates players from the pitch
        float rim = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 3.0);
        totalEmissiveRadiance += diffuseColor.rgb * rim * 0.55 + vec3(rim * 0.06);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor = region == 2.0 ? 0.35 : region == 1.0 ? 0.55 : region == 3.0 ? 0.9 : 0.78;',
      );
  };
  mat.customProgramCacheKey = () => 'kit-v2';
  return mat;
}

export interface PlayerModel {
  root: THREE.Group;
  model: THREE.Object3D;
  bones: Map<string, THREE.Bone>;
}

export function createPlayerModel(a: PlayerAsset, kit: KitLook): PlayerModel {
  const model = SkeletonUtils.clone(a.scene);
  const bones = new Map<string, THREE.Bone>();
  model.traverse((o) => {
    if ((o as THREE.Bone).isBone) bones.set(o.name, o as THREE.Bone);
    const m = o as THREE.SkinnedMesh;
    if (m.isSkinnedMesh) {
      m.material = kitMaterial(kit, a.mapping.get(m.name)!);
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
    }
  });
  const root = new THREE.Group();
  root.add(model);
  return { root, model, bones };
}
