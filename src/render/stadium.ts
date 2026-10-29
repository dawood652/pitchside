// Stadium bowl: four stands joined by curved corners, roof canopy, floodlights, dugouts, LED boards,
// and a billboard crowd drawn in one instanced draw call. Static parts are merged per material.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PITCH } from '../data/tuning';

export interface Stadium {
  group: THREE.Group;
  update(t: number, excitement: number, dt: number): void;
  setNight(night: boolean): void;
}

const ROWS = 26;
const ROW_D = 0.8;
const ROW_H = 0.46;
const GAP_X = PITCH.halfL + 8.5; // first row distance from centre along x
const GAP_Z = PITCH.halfW + 8.5;
const DEPTH = ROWS * ROW_D;
const TOP = 1.4 + ROWS * ROW_H;
const ROOF_Y = TOP + 6.5;

function stepProfile(): THREE.Vector2[] {
  // (r, y) pairs: r = distance from the stand front, y = height
  const pts: THREE.Vector2[] = [new THREE.Vector2(0, 0), new THREE.Vector2(0, 1.4)];
  for (let r = 0; r < ROWS; r++) {
    pts.push(new THREE.Vector2(r * ROW_D + 0.001, 1.4 + r * ROW_H));
    pts.push(new THREE.Vector2((r + 1) * ROW_D, 1.4 + r * ROW_H));
  }
  pts.push(new THREE.Vector2(DEPTH, 0));
  return pts;
}

/** Straight stand along local +x, rising toward local +z, front edge at z = 0. */
function straightStand(len: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(stepProfile().map((p) => new THREE.Vector2(p.x, p.y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false });
  g.rotateY(-Math.PI / 2);
  g.translate(len / 2, 0, 0);
  return g.toNonIndexed();
}

export function createStadium(homeColor: string, awayColor: string): Stadium {
  const group = new THREE.Group();
  const concreteGeos: THREE.BufferGeometry[] = [];
  const seatGeos: THREE.BufferGeometry[] = [];
  const steelGeos: THREE.BufferGeometry[] = [];
  const roofGeos: THREE.BufferGeometry[] = [];

  // Sides: [centre x, centre z, rotation, length]
  const sides = [
    { x: 0, z: GAP_Z, ry: 0, len: GAP_X * 2, roof: false }, // near (camera) side: no roof
    { x: 0, z: -GAP_Z, ry: Math.PI, len: GAP_X * 2, roof: true },
    { x: GAP_X, z: 0, ry: Math.PI / 2, len: GAP_Z * 2, roof: true },
    { x: -GAP_X, z: 0, ry: -Math.PI / 2, len: GAP_Z * 2, roof: true },
  ];
  const place = (g: THREE.BufferGeometry, x: number, z: number, ry: number) => {
    g.rotateY(ry);
    g.translate(x, 0, z);
    return g;
  };

  for (const s of sides) {
    seatGeos.push(place(straightStand(s.len), s.x, s.z, s.ry));
    const backH = ROOF_Y + 0.5;
    const wall = new THREE.BoxGeometry(s.len, backH, 0.8).toNonIndexed();
    wall.translate(0, backH / 2, DEPTH + 0.4);
    concreteGeos.push(place(wall, s.x, s.z, s.ry));
    const front = new THREE.BoxGeometry(s.len, 1.45, 0.35).toNonIndexed();
    front.translate(0, 0.72, -0.18);
    concreteGeos.push(place(front, s.x, s.z, s.ry));
    if (s.roof) {
      const canopy = new THREE.BoxGeometry(s.len, 0.35, DEPTH + 9).toNonIndexed();
      canopy.rotateX(-0.07);
      canopy.translate(0, ROOF_Y, DEPTH / 2 - 4);
      roofGeos.push(place(canopy, s.x, s.z, s.ry));
      const edge = new THREE.BoxGeometry(s.len, 1.1, 0.7).toNonIndexed();
      edge.translate(0, ROOF_Y + 0.2, -8.3);
      steelGeos.push(place(edge, s.x, s.z, s.ry));
      const n = Math.floor(s.len / 9);
      for (let i = 0; i <= n; i++) {
        const beam = new THREE.BoxGeometry(0.3, 1.4, DEPTH + 9).toNonIndexed();
        beam.rotateX(-0.07);
        beam.translate(-s.len / 2 + (i * s.len) / n, ROOF_Y + 0.85, DEPTH / 2 - 4);
        steelGeos.push(place(beam, s.x, s.z, s.ry));
      }
    }
  }

  // Curved corners join the stands into a bowl
  const corners = [
    { x: GAP_X, z: GAP_Z, phi: 0 },
    { x: GAP_X, z: -GAP_Z, phi: Math.PI / 2 },
    { x: -GAP_X, z: -GAP_Z, phi: Math.PI },
    { x: -GAP_X, z: GAP_Z, phi: (Math.PI * 3) / 2 },
  ];
  for (const c of corners) {
    const lathe = new THREE.LatheGeometry(stepProfile(), 12, c.phi, Math.PI / 2).toNonIndexed();
    lathe.translate(c.x, 0, c.z);
    seatGeos.push(lathe);
    const wall = new THREE.CylinderGeometry(DEPTH + 0.8, DEPTH + 0.8, ROOF_Y + 0.5, 12, 1, true, c.phi, Math.PI / 2).toNonIndexed();
    wall.translate(c.x, (ROOF_Y + 0.5) / 2, c.z);
    concreteGeos.push(wall);
    const near = c.z > 0; // keep the camera-side corners open
    if (!near) {
      const ring = new THREE.CylinderGeometry(DEPTH + 0.8, 0.5, 0.35, 12, 1, false, c.phi, Math.PI / 2).toNonIndexed();
      ring.translate(c.x, ROOF_Y, c.z);
      roofGeos.push(ring);
    }
  }

  const merged = (geos: THREE.BufferGeometry[], mat: THREE.Material, shadow = false) => {
    const g = mergeGeometries(geos.map((x) => { x.deleteAttribute('uv'); return x; }), false)!;
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = shadow;
    group.add(m);
    return m;
  };
  merged(seatGeos, new THREE.MeshLambertMaterial({ color: 0x2a3446 }));
  merged(concreteGeos, new THREE.MeshLambertMaterial({ color: 0x8a8f96 }));
  merged(steelGeos, new THREE.MeshStandardMaterial({ color: 0xc4cbd3, metalness: 0.6, roughness: 0.4 }));
  merged(roofGeos, new THREE.MeshStandardMaterial({ color: 0xdfe3e8, metalness: 0.2, roughness: 0.6, side: THREE.DoubleSide }));

  // Floodlight banks on the roof corners, with glow sprites for night
  const bankMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4d6, emissiveIntensity: 3 });
  const glowTex = radialTexture();
  const glows: THREE.Sprite[] = [];
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      if (sz > 0) continue; // far-side roof only
      for (let i = 0; i < 3; i++) {
        const bank = new THREE.Mesh(new THREE.BoxGeometry(5, 1.6, 0.4), bankMat);
        const x = sx * (PITCH.halfL - 8 - i * 9);
        bank.position.set(x, ROOF_Y + 0.6, sz * (GAP_Z - 8.6));
        bank.lookAt(x * 0.5, 0, 0);
        group.add(bank);
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xfff1d0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        glow.position.copy(bank.position);
        glow.scale.setScalar(16);
        glow.visible = false;
        group.add(glow);
        glows.push(glow);
      }
    }

  group.add(createDugouts());
  const boards = createAdBoards();
  group.add(boards.group);
  group.add(createCornerFlags());
  const crowd = createCrowd(homeColor, awayColor);
  group.add(crowd.mesh);

  return {
    group,
    update(t, excitement, dt) {
      crowd.uniforms.uTime.value = t;
      crowd.uniforms.uExcite.value = excitement;
      boards.scroll(dt);
    },
    setNight(night) {
      glows.forEach((g) => (g.visible = night));
      bankMat.emissiveIntensity = night ? 8 : 2.5;
      crowd.uniforms.uLight.value = night ? 0.5 : 0.8;
    },
  };
}

function radialTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.15, 'rgba(255,250,230,0.6)');
  grad.addColorStop(1, 'rgba(255,240,200,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// ---------- Crowd: instanced billboards with a drawn fan atlas ----------

const VARIANTS = 8;

function drawFans(mask: boolean): HTMLCanvasElement {
  // 8 fans across, 2 rows: idle (top) and cheering (bottom). Shirts/scarves white (tinted per fan).
  const c = document.createElement('canvas');
  c.width = 64 * VARIANTS;
  c.height = 256;
  const g = c.getContext('2d')!;
  const skins = ['#f1c9a5', '#e0ac69', '#c68642', '#8d5524', '#5c3a21', '#ffdbac', '#d4a07a', '#a86b4c'];
  const hairs = ['#1b1b1b', '#3b2412', '#6b4423', '#c9a45c', '#2b2b2b', '#151515', '#8a5a2b', '#444'];
  for (let v = 0; v < VARIANTS; v++)
    for (let row = 0; row < 2; row++) {
      const ox = v * 64;
      const oy = row * 128;
      const cheer = row === 1;
      const skin = mask ? '#000' : skins[v];
      const shirt = mask ? '#fff' : '#ffffff';
      const dark = mask ? '#000' : '#1c1f26';
      // legs/lower body hidden by the row in front; draw torso, arms, head
      g.fillStyle = dark;
      g.fillRect(ox + 20, oy + 96, 24, 32);
      g.fillStyle = shirt;
      g.beginPath();
      g.roundRect(ox + 16, oy + 54, 32, 46, 8);
      g.fill();
      // arms
      g.strokeStyle = shirt;
      g.lineWidth = 9;
      g.lineCap = 'round';
      g.beginPath();
      if (cheer) {
        g.moveTo(ox + 18, oy + 60);
        g.lineTo(ox + 8, oy + 26);
        g.moveTo(ox + 46, oy + 60);
        g.lineTo(ox + 56, oy + 26);
      } else {
        g.moveTo(ox + 18, oy + 60);
        g.lineTo(ox + 12, oy + 92);
        g.moveTo(ox + 46, oy + 60);
        g.lineTo(ox + 52, oy + 92);
      }
      g.stroke();
      g.fillStyle = skin;
      if (cheer) {
        g.beginPath();
        g.arc(ox + 8, oy + 22, 5, 0, Math.PI * 2);
        g.arc(ox + 56, oy + 22, 5, 0, Math.PI * 2);
        g.fill();
      }
      // head
      g.beginPath();
      g.arc(ox + 32, oy + 40, 12, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = mask ? '#000' : hairs[v];
      g.beginPath();
      g.arc(ox + 32, oy + 36, 12, Math.PI, 0);
      g.fill();
      // scarf on some fans
      if (v % 3 === 0) {
        g.fillStyle = mask ? '#fff' : '#ffffff';
        g.fillRect(ox + 20, oy + 52, 24, 6);
        if (cheer) g.fillRect(ox + 4, oy + 8, 8, 18);
      }
    }
  return c;
}

function createCrowd(homeColor: string, awayColor: string) {
  const seats: { x: number; y: number; z: number; side: number }[] = [];
  const spacing = 0.64;
  const addRowLine = (x0: number, z0: number, x1: number, z1: number, y: number, side: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.floor(len / spacing);
    for (let i = 0; i < n; i++) {
      if (Math.random() < 0.08) continue;
      const t = (i + 0.5) / n;
      seats.push({ x: x0 + (x1 - x0) * t + (Math.random() - 0.5) * 0.12, y, z: z0 + (z1 - z0) * t, side });
    }
  };
  for (let r = 0; r < ROWS; r++) {
    const d = r * ROW_D + ROW_D * 0.5;
    const y = 1.4 + r * ROW_H + 0.55;
    addRowLine(-GAP_X, GAP_Z + d, GAP_X, GAP_Z + d, y, 0);
    addRowLine(-GAP_X, -GAP_Z - d, GAP_X, -GAP_Z - d, y, 1);
    addRowLine(GAP_X + d, -GAP_Z, GAP_X + d, GAP_Z, y, 2);
    addRowLine(-GAP_X - d, -GAP_Z, -GAP_X - d, GAP_Z, y, 3);
    // corners along arcs
    const corners = [
      [GAP_X, GAP_Z, 0],
      [GAP_X, -GAP_Z, Math.PI / 2],
      [-GAP_X, -GAP_Z, Math.PI],
      [-GAP_X, GAP_Z, (Math.PI * 3) / 2],
    ];
    for (const [cx, cz, phi] of corners) {
      const n = Math.floor((d * Math.PI) / 2 / spacing);
      for (let i = 0; i < n; i++) {
        if (Math.random() < 0.1) continue;
        const a = phi + ((i + 0.5) / n) * (Math.PI / 2);
        seats.push({ x: cx + Math.sin(a) * d, y, z: cz + Math.cos(a) * d, side: cx > 0 ? 2 : 3 });
      }
    }
  }

  const geo = new THREE.PlaneGeometry(0.62, 1.24);
  geo.translate(0, 0.1, 0);
  const count = seats.length;
  const mesh = new THREE.InstancedMesh(geo, undefined as unknown as THREE.Material, count);
  const variant = new Float32Array(count);
  const phase = new Float32Array(count);
  const m = new THREE.Matrix4();
  const home = new THREE.Color(homeColor);
  const away = new THREE.Color(awayColor);
  const neutral = [0xecf0f1, 0x2c3e50, 0x34495e, 0xc0392b, 0x2980b9, 0x16a085, 0xf1c40f, 0x7f8c8d, 0x1d1d1d].map((c) => new THREE.Color(c));
  seats.forEach((s, i) => {
    m.makeTranslation(s.x, s.y, s.z);
    mesh.setMatrixAt(i, m);
    const r = Math.random();
    let col: THREE.Color;
    if (s.side === 3) col = r < 0.78 ? home : neutral[Math.floor(Math.random() * neutral.length)];
    else if (s.side === 2) col = r < 0.78 ? away : neutral[Math.floor(Math.random() * neutral.length)];
    else col = r < 0.4 ? home : r < 0.65 ? away : neutral[Math.floor(Math.random() * neutral.length)];
    mesh.setColorAt(i, col.clone().multiplyScalar(0.85 + Math.random() * 0.25));
    variant[i] = Math.floor(Math.random() * VARIANTS);
    phase[i] = Math.random();
  });
  geo.setAttribute('aVariant', new THREE.InstancedBufferAttribute(variant, 1));
  geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));

  const atlas = new THREE.CanvasTexture(drawFans(false));
  atlas.colorSpace = THREE.SRGBColorSpace;
  const maskTex = new THREE.CanvasTexture(drawFans(true));
  const uniforms = {
    uMap: { value: atlas },
    uMask: { value: maskTex },
    uTime: { value: 0 },
    uExcite: { value: 0 },
    uLight: { value: 0.8 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      attribute float aVariant;
      attribute float aPhase;
      uniform float uTime;
      uniform float uExcite;
      varying vec2 vUv;
      varying vec3 vTint;
      varying float vShade;
      void main() {
        vec4 centre = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        right = normalize(vec3(right.x, 0.0, right.z));
        float idleCheer = step(0.985, fract(sin(aPhase * 91.7 + floor(uTime * 0.4)) * 43758.5));
        float cheer = max(step(0.35, uExcite), idleCheer);
        float jump = max(0.0, sin(uTime * 9.0 + aPhase * 6.28)) * 0.4 * uExcite;
        float sway = sin(uTime * 1.4 + aPhase * 25.0) * 0.03;
        vec3 world = centre.xyz + right * (position.x + sway) + vec3(0.0, position.y + jump, 0.0);
        float col = mod(aVariant, 8.0);
        vUv = vec2((col + uv.x) / 8.0, (uv.y + (1.0 - cheer)) * 0.5);
        #ifdef USE_INSTANCING_COLOR
          vTint = instanceColor;
        #else
          vTint = vec3(1.0);
        #endif
        vShade = 0.82 + 0.18 * fract(aPhase * 13.1);
        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform sampler2D uMask;
      uniform float uLight;
      varying vec2 vUv;
      varying vec3 vTint;
      varying float vShade;
      void main() {
        vec4 c = texture2D(uMap, vUv);
        if (c.a < 0.5) discard;
        float m = texture2D(uMask, vUv).r;
        vec3 col = mix(c.rgb, c.rgb * vTint, m) * vShade * uLight;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  mesh.material = mat;
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}

// ---------- Dugouts, ad boards, corner flags ----------

function createDugouts(): THREE.Group {
  const g = new THREE.Group();
  const shell = new THREE.MeshStandardMaterial({ color: 0x1f2633, roughness: 0.6 });
  const glass = new THREE.MeshStandardMaterial({ color: 0xaad4ff, transparent: true, opacity: 0.25, roughness: 0.1, metalness: 0.1 });
  const seat = new THREE.MeshLambertMaterial({ color: 0xc8102e });
  for (const sx of [-1, 1]) {
    const d = new THREE.Group();
    const back = new THREE.Mesh(new THREE.BoxGeometry(9, 2.2, 0.15), shell);
    back.position.set(0, 1.1, 1.1);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(9, 0.08, 2.4), glass);
    roof.position.set(0, 2.2, 0);
    const bench = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.5, 0.6), seat);
    bench.position.set(0, 0.45, 0.6);
    for (const ex of [-4.5, 4.5]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.2, 2.4), glass);
      side.position.set(ex, 1.1, 0);
      d.add(side);
    }
    d.add(back, roof, bench);
    d.position.set(sx * 8, 0, PITCH.halfW + 4.2);
    g.add(d);
  }
  return g;
}

const BRANDS = ['VOLTA ENERGY', 'NORTHWIND AIR', 'KORTEX', 'PIXELPEAK', 'SOLARA', 'BREWHAUS', 'ZENITH BANK', 'ORBIT MOBILE', 'FRESHCO', 'RAPIDO'];
const BRAND_COLORS = ['#0f62fe', '#e63946', '#111111', '#7b2cbf', '#f77f00', '#2a9d8f', '#14213d', '#d00000', '#1b998b', '#ffb703'];

function createAdBoards() {
  const group = new THREE.Group();
  const c = document.createElement('canvas');
  c.width = 4096;
  c.height = 128;
  const g = c.getContext('2d')!;
  const seg = c.width / BRANDS.length;
  BRANDS.forEach((b, i) => {
    g.fillStyle = BRAND_COLORS[i];
    g.fillRect(i * seg, 0, seg, 128);
    g.fillStyle = 'rgba(0,0,0,.35)';
    g.fillRect(i * seg + seg - 4, 0, 4, 128);
    g.fillStyle = i === 9 ? '#111' : '#fff';
    let size = 72;
    g.font = `bold ${size}px Arial, sans-serif`;
    const w = g.measureText(b).width;
    if (w > seg * 0.84) size = Math.floor((size * seg * 0.84) / w);
    g.font = `bold ${size}px Arial, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(b, i * seg + seg / 2, 68);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  const mat = new THREE.MeshBasicMaterial({ map: tex });
  const h = 0.95;
  const off = 4.6;
  const mk = (len: number, x: number, z: number, ry: number, rep: number) => {
    const geo = new THREE.PlaneGeometry(len, h);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * rep);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, h / 2, z);
    m.rotation.y = ry;
    group.add(m);
  };
  mk(PITCH.length + 8, 0, -PITCH.halfW - off, 0, 1.5);
  mk(PITCH.length + 8, 0, PITCH.halfW + off, Math.PI, 1.5);
  mk(PITCH.width - 12, PITCH.halfL + off, 0, -Math.PI / 2, 0.8);
  mk(PITCH.width - 12, -PITCH.halfL - off, 0, Math.PI / 2, 0.8);
  return {
    group,
    scroll(dt: number) {
      tex.offset.x = (tex.offset.x + dt * 0.025) % 1;
    },
  };
}

function createCornerFlags(): THREE.Group {
  const group = new THREE.Group();
  const flagMat = new THREE.MeshLambertMaterial({ color: 0xffd23f, side: THREE.DoubleSide });
  const poleMat = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 });
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.5, 6), poleMat);
      pole.position.set(sx * PITCH.halfL, 0.75, sz * PITCH.halfW);
      pole.castShadow = true;
      group.add(pole);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.3), flagMat);
      flag.position.set(sx * PITCH.halfL - sx * 0.2, 1.33, sz * PITCH.halfW);
      group.add(flag);
    }
  return group;
}
