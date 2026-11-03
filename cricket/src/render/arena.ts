// 3D ground: renderer, sky and sun, oval outfield with mowing stripes, pitch and creases,
// stumps with bails (can be broken), boundary rope, sight screens, stands with a crowd.
// Field coordinates (engine): x = off side, z = up the ground. World: x is mirrored (wx = -x) so
// the off side shows on the right of the screen behind a right-handed batter.
import * as THREE from 'three';
import { BOUNDARY, PITCH_LEN } from '../engine';

export const W = (x: number, y: number, z: number) => new THREE.Vector3(-x, y, z);

export interface Arena {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  sun: THREE.DirectionalLight;
  stumps: { near: Stumps; far: Stumps };
  crowd: THREE.Mesh;
  resize(): void;
}

export interface Stumps {
  group: THREE.Group;
  break(dir: number): void;
  reset(): void;
  update(dt: number): void;
}

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function makeStumps(z: number): Stumps {
  const group = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0xf1e6c8, roughness: 0.55 });
  const bailMat = new THREE.MeshStandardMaterial({ color: 0xd9a441, roughness: 0.5 });
  const sticks: THREE.Mesh[] = [];
  for (const x of [-0.114, 0, 0.114]) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.71, 10), wood);
    m.position.set(x, 0.355, 0);
    m.castShadow = true;
    group.add(m);
    sticks.push(m);
  }
  const bails: THREE.Mesh[] = [];
  for (const x of [-0.057, 0.057]) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.11, 8), bailMat);
    b.rotation.z = Math.PI / 2;
    b.position.set(x, 0.715, 0);
    b.castShadow = true;
    group.add(b);
    bails.push(b);
  }
  group.position.copy(W(0, 0, z));
  let t = -1;
  let dir = 1;
  const vel = bails.map(() => new THREE.Vector3());
  return {
    group,
    break(d: number) {
      t = 0;
      dir = d;
      bails.forEach((b, i) => vel[i].set((Math.random() - 0.5) * 2.5, 3 + Math.random() * 2, -2.5 - Math.random() * 2));
    },
    reset() {
      t = -1;
      sticks.forEach((s, i) => {
        s.rotation.set(0, 0, 0);
        s.position.set([-0.114, 0, 0.114][i], 0.355, 0);
      });
      bails.forEach((b, i) => {
        b.position.set([-0.057, 0.057][i], 0.715, 0);
        b.rotation.set(0, 0, Math.PI / 2);
      });
    },
    update(dt: number) {
      if (t < 0) return;
      t += dt;
      const k = Math.min(1, t * 5);
      sticks.forEach((s, i) => {
        const lean = [-0.5, 0.25 * dir, 0.6][i] * k;
        s.rotation.x = -0.9 * k * (i === 1 ? 1 : 0.7);
        s.rotation.z = lean;
        s.position.set([-0.114, 0, 0.114][i] + Math.sin(lean) * 0.3, 0.355 * Math.cos(0.9 * k), -0.25 * k);
      });
      bails.forEach((b, i) => {
        if (b.position.y <= 0.01 && vel[i].y < 0) return;
        vel[i].y -= 9.8 * dt;
        b.position.addScaledVector(vel[i], dt);
        b.rotation.x += dt * 12;
        if (b.position.y < 0.01) b.position.y = 0.01;
      });
    },
  };
}

export function createArena(container: HTMLElement, mobile: boolean): Arena {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8ec5f0);
  scene.fog = new THREE.Fog(0xb9d7f0, 140, 320);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 600);

  scene.add(new THREE.HemisphereLight(0xdcecff, 0x3d6b33, 1.0));
  const sun = new THREE.DirectionalLight(0xfff2dc, 2.6);
  sun.position.set(-30, 60, -20);
  sun.castShadow = true;
  const sm = mobile ? 2048 : 4096;
  sun.shadow.mapSize.set(sm, sm);
  const sc = sun.shadow.camera;
  sc.left = -28;
  sc.right = 28;
  sc.top = 34;
  sc.bottom = -14;
  sc.near = 10;
  sc.far = 160;
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.02;
  sun.target.position.set(0, 0, 8);
  scene.add(sun, sun.target);

  // outfield: radial gradient + mowing stripes
  const grassTex = canvasTex(1024, 1024, (g) => {
    g.fillStyle = '#3f8d38';
    g.fillRect(0, 0, 1024, 1024);
    for (let i = 0; i < 32; i++) {
      g.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
      g.fillRect(0, i * 32, 1024, 32);
    }
    for (let i = 0; i < 5000; i++) {
      g.fillStyle = `rgba(${20 + Math.random() * 40},${90 + Math.random() * 60},${20 + Math.random() * 30},0.25)`;
      g.fillRect(Math.random() * 1024, Math.random() * 1024, 2, 2);
    }
  });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(BOUNDARY + 8, 96), new THREE.MeshStandardMaterial({ map: grassTex, roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.z = 0;
  ground.receiveShadow = true;
  scene.add(ground);
  const surround = new THREE.Mesh(new THREE.RingGeometry(BOUNDARY + 8, BOUNDARY + 16, 96), new THREE.MeshStandardMaterial({ color: 0x2f6f2a, roughness: 1 }));
  surround.rotation.x = -Math.PI / 2;
  surround.position.set(0, -0.01, 0);
  scene.add(surround);
  // boundary rope
  const rope = new THREE.Mesh(new THREE.TorusGeometry(BOUNDARY, 0.12, 6, 160), new THREE.MeshStandardMaterial({ color: 0xffffff }));
  rope.rotation.x = Math.PI / 2;
  rope.position.set(0, 0.08, 0);
  scene.add(rope);
  // pitch strip with worn ends
  const pitchTex = canvasTex(256, 1024, (g) => {
    const grd = g.createLinearGradient(0, 0, 0, 1024);
    grd.addColorStop(0, '#b99c5f');
    grd.addColorStop(0.5, '#cdb57c');
    grd.addColorStop(1, '#b99c5f');
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 1024);
    for (let i = 0; i < 4000; i++) {
      g.fillStyle = `rgba(${120 + Math.random() * 60},${100 + Math.random() * 40},60,0.18)`;
      g.fillRect(Math.random() * 256, Math.random() * 1024, 2, 3);
    }
    g.strokeStyle = 'rgba(255,255,255,0.95)';
    g.lineWidth = 4;
    const zy = (z: number) => 1024 * (1 - (z + 2.5) / (PITCH_LEN + 5));
    const xx = (x: number) => 128 + (x / 1.6) * 128;
    for (const z of [1.22, PITCH_LEN - 1.22]) {
      g.beginPath();
      g.moveTo(0, zy(z));
      g.lineTo(256, zy(z));
      g.stroke();
    }
    for (const z of [0, PITCH_LEN]) {
      g.beginPath();
      g.moveTo(xx(-1.32), zy(z));
      g.lineTo(xx(1.32), zy(z));
      g.stroke();
    }
    for (const s of [-1, 1])
      for (const [a, b] of [[-1.2, 1.22], [PITCH_LEN - 1.22, PITCH_LEN + 1.2]]) {
        g.beginPath();
        g.moveTo(xx(s * 1.32), zy(a));
        g.lineTo(xx(s * 1.32), zy(b));
        g.stroke();
      }
  });
  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(3.2, PITCH_LEN + 5), new THREE.MeshStandardMaterial({ map: pitchTex, roughness: 0.9 }));
  pitch.rotation.x = -Math.PI / 2;
  pitch.position.set(0, 0.005, PITCH_LEN / 2);
  pitch.receiveShadow = true;
  scene.add(pitch);
  // 30-yard circle markers
  const dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const d = new THREE.Mesh(new THREE.CircleGeometry(0.25, 10), dotMat);
    d.rotation.x = -Math.PI / 2;
    d.position.set(Math.sin(a) * 27, 0.01, PITCH_LEN / 2 + Math.cos(a) * 27);
    scene.add(d);
  }
  const near = makeStumps(0);
  const far = makeStumps(PITCH_LEN);
  scene.add(near.group, far.group);

  // stands: sloped ring with a crowd texture, roof band, sight screens
  const crowdTex = canvasTex(2048, 256, (g) => {
    g.fillStyle = '#2a3442';
    g.fillRect(0, 0, 2048, 256);
    const cols = ['#e63946', '#f1faee', '#1d3557', '#ffb703', '#2a9d8f', '#8338ec', '#fb5607', '#3a86ff', '#06d6a0', '#ffffff'];
    for (let y = 6; y < 256; y += 9)
      for (let x = (y / 9) % 2 ? 4 : 0; x < 2048; x += 9) {
        g.fillStyle = cols[(x * 7 + y * 13) % cols.length];
        g.beginPath();
        g.arc(x + Math.random() * 2, y, 3, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#e8c39e';
        g.beginPath();
        g.arc(x, y - 4, 2, 0, Math.PI * 2);
        g.fill();
      }
  });
  crowdTex.wrapS = THREE.RepeatWrapping;
  crowdTex.repeat.set(6, 1);
  const standR = BOUNDARY + 18;
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(standR + 26, standR, 22, 96, 1, true), new THREE.MeshStandardMaterial({ map: crowdTex, side: THREE.BackSide, roughness: 1 }));
  stand.position.set(0, 11, 0);
  scene.add(stand);
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(standR + 30, standR + 26, 4, 96, 1, true), new THREE.MeshStandardMaterial({ color: 0xdfe6ee, side: THREE.DoubleSide, roughness: 0.6 }));
  roof.position.set(0, 24, 0);
  scene.add(roof);
  // ad boards inside the rope
  const adTex = canvasTex(2048, 64, (g) => {
    const ads = ['STUMPS', 'GOLDEN WILLOW', 'SPIN COLA', 'NORTH STAR AIR', 'BOUNDARY FM', 'SEAM & SWING'];
    const cols = ['#0b3d91', '#c1121f', '#2b9348', '#f77f00', '#6a00f4', '#111'];
    for (let i = 0; i < 12; i++) {
      g.fillStyle = cols[i % cols.length];
      g.fillRect((i * 2048) / 12, 0, 2048 / 12, 64);
      g.fillStyle = '#fff';
      g.font = 'bold 34px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillText(ads[i % ads.length], (i + 0.5) * (2048 / 12), 44);
    }
  });
  adTex.wrapS = THREE.RepeatWrapping;
  adTex.repeat.set(-4, 1); // seen from inside the ring: flip so the text reads correctly
  const boards = new THREE.Mesh(new THREE.CylinderGeometry(BOUNDARY + 3, BOUNDARY + 3, 0.9, 128, 1, true), new THREE.MeshBasicMaterial({ map: adTex, side: THREE.BackSide }));
  boards.position.set(0, 0.45, 0);
  scene.add(boards);
  for (const z of [BOUNDARY + 8, -BOUNDARY - 8]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(16, 7, 0.4), new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.8 }));
    s.position.set(0, 3.5, z);
    scene.add(s);
  }

  const resize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  addEventListener('resize', resize);
  resize();
  return { renderer, scene, camera, sun, stumps: { near, far }, crowd: stand, resize };
}
