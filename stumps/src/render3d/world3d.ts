// The 3D match view: stadium, a skinned batter posed by the batting engine, bowler, keeper and
// fielders on animation clips, the ball and the bat. Phaser draws the HUD on a transparent canvas
// on top; the 3D camera copies the gameplay camera (Cam) so taps land where they look.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Skeleton } from '../batting/body';
import { V } from '../batting/vec';
import { Cam, VH } from '../render';
import { Ad } from '../ads';
import { Arena, createArena } from './arena';
import { armour, makeBat, Person } from './people';
import { kitMaterial, KitLook, loadPlayerAsset, PlayerAsset } from './playerModel';
import { BatterRig, placeBat } from './poser';

const W = (p: V) => new THREE.Vector3(-p.x, p.y, p.z);
const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
const SKINS = ['#8d5524', '#c68642', '#e0ac69', '#f1c27d', '#6b4423', '#a0673d'];

function kit(primary: number, secondary: string, i: number, keeper = false): KitLook {
  return {
    primary: hex(primary), secondary, shorts: hex(primary), socks: '#ffffff', boots: '#f2f2f2', skin: SKINS[i % SKINS.length], hair: '#1b1410',
    pattern: 'plain', numberColor: '#ffffff', number: [7, 18, 45, 10, 33, 1, 99, 23, 8, 12, 5][i % 11], name: '', keeper, hairStyle: i % 3, trousers: true,
  };
}

export interface FieldView {
  batter: Skeleton;
  ball: V | null;
  ballLook: V | null;
  fielders: V[];
  keeper: V;
  bowler: { z: number; phase: 'idle' | 'run' | 'bowl' | 'follow' };
  bowled: boolean;
}

export class World3D {
  private batter!: Person;
  private rig!: BatterRig;
  private bat = makeBat();
  private bowler!: Person;
  private keeper!: Person;
  private fielders: Person[] = [];
  private prev: THREE.Vector3[] = [];
  private ball: THREE.Mesh;
  private bowledShown = false;
  private composer: EffectComposer;
  private constructor(public arena: Arena, private asset: PlayerAsset) {
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), new THREE.MeshStandardMaterial({ color: 0xc8102e, roughness: 0.35 }));
    this.ball.castShadow = true;
    arena.scene.add(this.ball, this.bat);
    // post: MSAA render, a soft bloom on the bright highlights, then tone mapping + sRGB
    const r = arena.renderer;
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    this.composer = new EffectComposer(r, new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 }));
    this.composer.addPass(new RenderPass(arena.scene, arena.camera));
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.16, 0.45, 0.92));
    this.composer.addPass(new OutputPass());
  }

  static async create(container: HTMLElement, rect: () => DOMRect): Promise<World3D> {
    const mobile = matchMedia('(pointer: coarse)').matches;
    const arena = createArena(container, mobile, rect);
    const asset = await loadPlayerAsset();
    const w = new World3D(arena, asset);
    w.build(0x0f8a4c, 0x1d4ed8);
    return w;
  }

  private build(batKit: number, fieldKit: number): void {
    const s = this.arena.scene;
    this.batter = new Person(this.asset, kit(batKit, '#ffd166', 0), s);
    armour(this.batter, true, 0x10204a);
    this.rig = new BatterRig(this.batter);
    this.bowler = new Person(this.asset, kit(fieldKit, '#ffffff', 1), s);
    this.keeper = new Person(this.asset, kit(fieldKit, '#ffffff', 2, true), s);
    armour(this.keeper, true, 0x222222);
    this.keeper.play('Crouch_Idle_Loop');
    for (let i = 0; i < 9; i++) {
      const p = new Person(this.asset, kit(fieldKit, '#ffffff', i + 3), s);
      p.play('Idle_Loop');
      p.mixer.update(Math.random() * 2);
      this.fielders.push(p);
      this.prev.push(new THREE.Vector3());
    }
  }

  /** Repaint kits for a new match. */
  setTeams(batKit: number, fieldKit: number): void {
    const paint = (p: Person, k: KitLook) =>
      p.m.model.traverse((o) => {
        const m = o as THREE.SkinnedMesh;
        if (m.isSkinnedMesh) m.material = kitMaterial(k, this.asset.mapping.get(m.name)!);
      });
    paint(this.batter, kit(batKit, '#ffd166', 0));
    paint(this.bowler, kit(fieldKit, '#ffffff', 1));
    paint(this.keeper, kit(fieldKit, '#ffffff', 2, true));
    this.fielders.forEach((f, i) => paint(f, kit(fieldKit, '#ffffff', i + 3)));
  }

  setAds(ads: Ad[]): void {
    this.arena.setAds(ads);
  }

  frame(c: Cam, v: FieldView, dt: number): void {
    const { arena } = this;
    // camera = gameplay camera
    const cam = arena.camera;
    cam.fov = (2 * Math.atan(VH / 2 / c.F) * 180) / Math.PI;
    cam.aspect = 16 / 9;
    cam.position.copy(W(c.pos));
    cam.up.set(0, 1, 0);
    cam.lookAt(W(c.look));
    cam.updateProjectionMatrix();
    // batter + bat
    this.rig.pose(v.batter, v.ballLook);
    placeBat(this.bat, v.batter.bat);
    // ball
    this.ball.visible = !!v.ball;
    if (v.ball) this.ball.position.copy(W(v.ball));
    // bowler: run in, bowl, follow through
    const bz = v.bowler.z;
    this.bowler.place(0.45, bz, Math.PI);
    if (v.bowler.phase === 'run') this.bowler.play('Sprint_Loop', 1.1);
    else if (v.bowler.phase === 'bowl') this.bowler.play('OverhandThrow', 1.5, 0.08);
    else if (v.bowler.phase === 'follow') this.bowler.play('Jog_Fwd_Loop', 0.8, 0.3);
    else this.bowler.play('Idle_Loop');
    this.bowler.update(dt);
    // keeper
    this.keeper.place(-v.keeper.x, v.keeper.z, 0);
    this.keeper.update(dt);
    // fielders: run when they move, face the ball
    this.fielders.forEach((f, i) => {
      const p = W(v.fielders[i]);
      const moved = p.distanceTo(this.prev[i]) / Math.max(dt, 1e-3);
      const to = (v.ball ? W(v.ball) : new THREE.Vector3(0, 0, 0)).sub(p);
      const yaw = moved > 0.8 ? Math.atan2(p.x - this.prev[i].x, p.z - this.prev[i].z) : Math.atan2(to.x, to.z);
      f.place(p.x, p.z, yaw);
      f.play(moved > 4 ? 'Sprint_Loop' : moved > 0.8 ? 'Jog_Fwd_Loop' : 'Idle_Loop', 1, 0.15);
      f.update(dt);
      this.prev[i].copy(p);
    });
    // stumps
    if (v.bowled && !this.bowledShown) arena.stumps.near.break(0);
    if (!v.bowled && this.bowledShown) arena.stumps.near.reset();
    this.bowledShown = v.bowled;
    arena.stumps.near.update(dt);
    arena.update(dt);
    this.composer.render(dt);
  }

  resize(): void {
    this.arena.resize();
    const r = this.arena.renderer;
    this.composer.setPixelRatio(r.getPixelRatio());
    const s = r.getSize(new THREE.Vector2());
    this.composer.setSize(s.x, s.y);
  }
}
