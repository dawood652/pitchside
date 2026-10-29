import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export interface World {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  sun: THREE.DirectionalLight;
  sunDir: THREE.Vector3;
  hemi: THREE.HemisphereLight;
  fills: THREE.DirectionalLight[];
  sky: Sky;
  mobile: boolean;
  /** Target device pixel ratio for this device (adaptive quality may lower it temporarily). */
  maxDpr: number;
}

export type TimeOfDay = 'day' | 'evening' | 'night';

const SHADOW_BOX = 34; // half-size of the shadow area that follows the ball (metres)

export function createWorld(container: HTMLElement, mobile: boolean): World {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', stencil: false });
  const maxDpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(maxDpr);
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x9fb3c8, 220, 600);

  const camera = new THREE.PerspectiveCamera(30, container.clientWidth / container.clientHeight, 0.5, 2000);
  camera.position.set(0, 30, 70);
  camera.lookAt(0, 0, 0);

  // Image-based lighting gives kits and skin soft reflections
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.3;

  const sky = new Sky();
  sky.scale.setScalar(1500);
  (sky.material as THREE.ShaderMaterial).fog = false;
  scene.add(sky);

  const hemi = new THREE.HemisphereLight(0xdfe9ff, 0x3b5a2a, 0.7);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
  sun.castShadow = true;
  const size = mobile ? 2048 : 4096;
  sun.shadow.mapSize.set(size, size);
  const s = sun.shadow.camera;
  s.left = -SHADOW_BOX;
  s.right = SHADOW_BOX;
  s.top = SHADOW_BOX;
  s.bottom = -SHADOW_BOX;
  s.near = 20;
  s.far = 260;
  sun.shadow.bias = -0.0002;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 2;
  scene.add(sun);
  scene.add(sun.target);

  // Extra non-shadow lights used as floodlight fills at night
  const fills: THREE.DirectionalLight[] = [];
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const f = new THREE.DirectionalLight(0xe8f0ff, 0);
    f.position.set(x * 80, 60, z * 60);
    scene.add(f);
    fills.push(f);
  }

  window.addEventListener('resize', () => {
    renderer.setSize(container.clientWidth, container.clientHeight);
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
  });

  const world: World = { renderer, scene, camera, sun, sunDir: new THREE.Vector3(0.3, 1, 0.3).normalize(), hemi, fills, sky, mobile, maxDpr };
  setTimeOfDay(world, 'evening');
  return world;
}

/** Keep the shadow box centred on the action, snapped to shadow texels so edges don't shimmer. */
export function followShadow(w: World, x: number, z: number): void {
  const texel = (SHADOW_BOX * 2) / w.sun.shadow.mapSize.x;
  const sx = Math.round(x / texel) * texel;
  const sz = Math.round(z / texel) * texel;
  w.sun.target.position.set(sx, 0, sz);
  w.sun.position.set(sx + w.sunDir.x * 130, w.sunDir.y * 130, sz + w.sunDir.z * 130);
  w.sun.target.updateMatrixWorld();
}

export function setTimeOfDay(w: World, t: TimeOfDay): void {
  const u = (w.sky.material as THREE.ShaderMaterial).uniforms;
  const fog = w.scene.fog as THREE.Fog;
  if (t === 'night') {
    w.sky.visible = false;
    w.scene.background = new THREE.Color(0x04060b);
    fog.color.set(0x070a12);
    w.hemi.intensity = 0.12;
    w.hemi.color.set(0x8fa6d9);
    w.hemi.groundColor.set(0x0d140c);
    w.sun.color.set(0xf2f5ff);
    w.sun.intensity = 1.9;
    w.sunDir.set(-0.15, 1, 0.35).normalize();
    w.fills.forEach((f) => (f.intensity = 0.32));
    w.scene.environmentIntensity = 0.12;
    w.renderer.toneMappingExposure = 0.95;
    return;
  }
  w.sky.visible = true;
  w.scene.background = null;
  w.fills.forEach((f) => (f.intensity = 0));
  const elevation = t === 'day' ? 55 : 18;
  const azimuth = t === 'day' ? 150 : 225;
  u.turbidity.value = t === 'day' ? 5 : 8;
  u.rayleigh.value = t === 'day' ? 1.2 : 2.4;
  u.mieCoefficient.value = 0.005;
  u.mieDirectionalG.value = 0.8;
  const phi = THREE.MathUtils.degToRad(90 - elevation);
  const theta = THREE.MathUtils.degToRad(azimuth);
  w.sunDir.setFromSphericalCoords(1, phi, theta);
  u.sunPosition.value.copy(w.sunDir);
  w.sun.color.set(t === 'day' ? 0xfff6e8 : 0xffd2a0);
  w.sun.intensity = t === 'day' ? 2.9 : 2.4;
  w.hemi.intensity = t === 'day' ? 0.8 : 0.6;
  w.hemi.color.set(t === 'day' ? 0xdfe9ff : 0xbfd0f0);
  w.hemi.groundColor.set(0x3b5a2a);
  fog.color.set(t === 'day' ? 0xb8cbe0 : 0xc9a98f);
  w.scene.environmentIntensity = 0.3;
  w.renderer.toneMappingExposure = t === 'day' ? 0.95 : 1.0;
}
