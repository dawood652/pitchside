// Realism pass for the ground: physical sky + matching image-based lighting, mown grass with
// blade detail and broadcast stripes, a worn pitch with cracks and footmarks, a believable crowd,
// floodlight towers. Everything is generated here (no downloaded textures, no licences needed).
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

function canvas(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  return c;
}

function tex(c: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Height field -> tangent-space normal map. */
function normalFrom(c: HTMLCanvasElement, strength: number): THREE.CanvasTexture {
  const { width: w, height: h } = c;
  const src = c.getContext('2d')!.getImageData(0, 0, w, h).data;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const g = out.getContext('2d')!;
  const img = g.createImageData(w, h);
  const H = (x: number, y: number) => src[(((y + h) % h) * w + ((x + w) % w)) * 4 + 1] / 255;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      img.data[i] = 128 + (-dx / l) * 127;
      img.data[i + 1] = 128 + (dy / l) * 127;
      img.data[i + 2] = 128 + (1 / l) * 127;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(out);
  t.anisotropy = 8;
  return t;
}

const rnd = (() => {
  let s = 1234567;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
})();

/** Physical sky; also used to light the scene (reflections + soft ambient that match the sky). */
export function skyAndLight(renderer: THREE.WebGLRenderer, scene: THREE.Scene, sunDir: THREE.Vector3): void {
  const sky = new Sky();
  sky.scale.setScalar(4000);
  const u = sky.material.uniforms;
  u.turbidity.value = 4;
  u.rayleigh.value = 1.2;
  u.mieCoefficient.value = 0.004;
  u.mieDirectionalG.value = 0.85;
  u.sunPosition.value.copy(sunDir);
  scene.add(sky);
  const pm = new THREE.PMREMGenerator(renderer);
  const env = new THREE.Scene();
  env.add(sky.clone());
  // a green floor so the bounce light from below is grass-coloured, not sky blue
  const floor = new THREE.Mesh(new THREE.CircleGeometry(3000, 16), new THREE.MeshBasicMaterial({ color: 0x2c5a24 }));
  floor.rotation.x = -Math.PI / 2;
  env.add(floor);
  scene.environment = pm.fromScene(env, 0.02).texture;
  scene.environmentIntensity = 0.55;
  scene.background = null;
  pm.dispose();
}

/** Mown outfield: fine blade detail (tiled), broadcast stripes and patchiness from world position. */
export function grassMaterial(): THREE.MeshStandardMaterial {
  const N = 512;
  const detail = canvas(N, N, (g) => {
    g.fillStyle = '#4a8638';
    g.fillRect(0, 0, N, N);
    for (let i = 0; i < 26000; i++) {
      const x = rnd() * N;
      const y = rnd() * N;
      const l = 2 + rnd() * 5;
      const a = -Math.PI / 2 + (rnd() - 0.5) * 0.9;
      const k = rnd();
      g.strokeStyle = `rgb(${45 + k * 45},${100 + k * 70},${30 + k * 30})`;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      g.stroke();
    }
  });
  const map = tex(detail);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(70, 70);
  const nmap = normalFrom(detail, 2.5);
  nmap.wrapS = nmap.wrapT = THREE.RepeatWrapping;
  nmap.repeat.set(70, 70);
  const m = new THREE.MeshStandardMaterial({ map, normalMap: nmap, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.92, color: 0xffffff });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWp;
float h2(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
  // stripes along the pitch (mower passes), light/dark by viewing side, plus large soft patches
  float band = step(0.5, fract(vWp.x / 7.0 + 0.5));
  float patchy = vn(vWp.xz * 0.06) * 0.6 + vn(vWp.xz * 0.21) * 0.4;
  diffuseColor.rgb *= mix(0.9, 1.05, band) * mix(0.88, 1.08, patchy);
  // a little wear near the pitch
  float wear = smoothstep(9.0, 2.0, abs(vWp.x)) * smoothstep(30.0, 14.0, abs(vWp.z - 10.06)) * 0.12;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.45, 0.25), wear);`);
  };
  m.customProgramCacheKey = () => 'grass-v1';
  return m;
}

/** The pitch: hard-rolled clay, cracks, scuffed footmarks at both ends, crease markings. */
export function pitchMaterial(len: number): THREE.MeshStandardMaterial {
  const W = 512;
  const H = 2048;
  const zy = (z: number) => H * (1 - (z + 2.5) / (len + 5));
  const xx = (x: number) => W / 2 + (x / 1.6) * (W / 2);
  const height = canvas(W, H, (g) => {
    g.fillStyle = '#808080';
    g.fillRect(0, 0, W, H);
    // cracks: dark random walks
    for (let i = 0; i < 160; i++) {
      let x = rnd() * W;
      let y = rnd() * H;
      let a = rnd() * Math.PI * 2;
      g.strokeStyle = `rgba(20,20,20,${0.35 + rnd() * 0.4})`;
      g.lineWidth = 1 + rnd() * 1.5;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 14; k++) {
        a += (rnd() - 0.5) * 1.2;
        x += Math.cos(a) * 7;
        y += Math.sin(a) * 7;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    // footmarks: rough dents just past each popping crease
    for (const z of [1.6, len - 1.6])
      for (let i = 0; i < 260; i++) {
        g.fillStyle = `rgba(40,40,40,${rnd() * 0.5})`;
        g.beginPath();
        g.ellipse(xx((rnd() - 0.5) * 1.6), zy(z + (rnd() - 0.5) * 1.6), 3 + rnd() * 6, 2 + rnd() * 5, rnd() * 3, 0, Math.PI * 2);
        g.fill();
      }
  });
  const color = canvas(W, H, (g) => {
    const grd = g.createLinearGradient(0, 0, W, 0);
    grd.addColorStop(0, '#9d9a5d');
    grd.addColorStop(0.12, '#c8b07c');
    grd.addColorStop(0.5, '#d4bd8a');
    grd.addColorStop(0.88, '#c8b07c');
    grd.addColorStop(1, '#9d9a5d');
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 30000; i++) {
      const k = rnd();
      g.fillStyle = `rgba(${150 + k * 70},${125 + k * 60},${80 + k * 40},0.22)`;
      g.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 2, 1 + rnd() * 2);
    }
    // scuffed, darker ends
    for (const z of [1.6, len - 1.6]) {
      const r = g.createRadialGradient(W / 2, zy(z), 10, W / 2, zy(z), 260);
      r.addColorStop(0, 'rgba(120,95,55,0.45)');
      r.addColorStop(1, 'rgba(120,95,55,0)');
      g.fillStyle = r;
      g.fillRect(0, zy(z) - 300, W, 600);
    }
    // cracks and footmarks, faint (the height field is mid-grey with dark marks; lighten it first)
    g.globalCompositeOperation = 'multiply';
    g.globalAlpha = 0.3;
    g.filter = 'brightness(1.9)';
    g.drawImage(height, 0, 0);
    g.filter = 'none';
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    // crease markings
    g.strokeStyle = 'rgba(255,255,255,0.95)';
    g.lineWidth = 7;
    const line = (x0: number, z0: number, x1: number, z1: number) => {
      g.beginPath();
      g.moveTo(xx(x0), zy(z0));
      g.lineTo(xx(x1), zy(z1));
      g.stroke();
    };
    for (const z of [1.22, len - 1.22]) line(-1.6, z, 1.6, z);
    for (const z of [0, len]) line(-1.32, z, 1.32, z);
    for (const s of [-1, 1]) {
      line(s * 1.32, -1.2, s * 1.32, 1.22);
      line(s * 1.32, len - 1.22, s * 1.32, len + 1.2);
    }
  });
  const nmap = normalFrom(height, 3);
  return new THREE.MeshStandardMaterial({ map: tex(color), normalMap: nmap, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.82 });
}

/** Crowd: seat rows in tiers, people in muted shirt colours, a few gaps. */
export function crowdTexture(): THREE.CanvasTexture {
  const c = canvas(4096, 512, (g) => {
    g.fillStyle = '#1d232c';
    g.fillRect(0, 0, 4096, 512);
    const shirts = ['#c9473f', '#e8e4da', '#2e4a7a', '#d9a63b', '#3f8f7f', '#6d5a9e', '#c76b3a', '#4f7fc4', '#2f2f35', '#9fb3c8', '#e2d1b8', '#7a1f2b'];
    const skins = ['#8d5524', '#c68642', '#e0ac69', '#f1c27d', '#6b4423'];
    for (let row = 0; row < 40; row++) {
      const y = 10 + row * 12.5;
      g.fillStyle = row % 8 === 7 ? '#3a414c' : '#262d37'; // walkway every 8 rows
      g.fillRect(0, y + 5, 4096, 6);
      if (row % 8 === 7) continue;
      for (let x = (row % 2) * 4; x < 4096; x += 8 + rnd() * 2) {
        if (rnd() < 0.08) continue; // empty seat
        g.fillStyle = shirts[Math.floor(rnd() * shirts.length)];
        g.fillRect(x, y + 1, 6, 6);
        g.fillStyle = skins[Math.floor(rnd() * skins.length)];
        g.fillRect(x + 1.5, y - 3, 3, 4);
        if (rnd() < 0.04) {
          g.fillStyle = shirts[Math.floor(rnd() * shirts.length)];
          g.fillRect(x - 2, y - 9, 10, 5); // flag / banner
        }
      }
    }
  });
  const t = tex(c);
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(4, 1);
  return t;
}

/** Four floodlight towers around the ground. */
export function floodlights(scene: THREE.Scene, r: number): void {
  const steel = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 0.6, roughness: 0.4 });
  const lamp = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6dd, emissiveIntensity: 1.2 });
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.4, 62, 10), steel);
    pole.position.y = 31;
    const head = new THREE.Mesh(new THREE.BoxGeometry(12, 7, 1), steel);
    head.position.y = 64;
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(11, 6), lamp);
    panel.position.set(0, 64, 0.55);
    g.add(pole, head, panel);
    g.position.set(Math.sin(a) * r, 0, 10 + Math.cos(a) * r);
    g.lookAt(0, 30, 10);
    scene.add(g);
  }
}
