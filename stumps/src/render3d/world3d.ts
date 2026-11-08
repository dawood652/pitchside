// The 3D match view: stadium, a skinned batter posed by the batting engine, bowler, keeper and
// fielders on animation clips, the ball and the bat. Phaser draws the HUD on a transparent canvas
// on top; the 3D camera copies the gameplay camera (Cam) so taps land where they look.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Skeleton } from '../batting/body';
import { v, V } from '../batting/vec';
import { Cam } from '../render';
import { Ad } from '../ads';
import { Arena, createArena } from './arena';
import { armour, makeBat, Person } from './people';
import { kitMaterial, KitLook, loadPlayerAsset, PlayerAsset } from './playerModel';
import { BatterRig, placeBat } from './poser';
import { AVATARS, loadRocketbox, RbAsset, RbPerson, Retarget } from './rocketbox';
import { Gear } from './gear';
import { BOWL_FROM, BOWL_TO, bowlerJoints, bowlerZ, wristFlick } from './bowling';

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
  bowler: { z: number; phase: 'idle' | 'run' | 'bowl' | 'follow'; t: number | null }; // t: time relative to release
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
  private bloom: UnrealBloomPass;
  private aim: THREE.Mesh;
  private aimT = 0;
  // realistic bodies (Rocketbox); the mannequins above become invisible drivers when these load
  private rb: RbAsset | null = null;
  private rBatter: RbPerson | null = null;
  private rBowler: RbPerson | null = null;
  private rKeeper: RbPerson | null = null;
  private rFielders: RbPerson[] = [];
  private batRT: Retarget | null = null;
  private bowlRT: Retarget | null = null;
  private bowlRig: BatterRig | null = null;
  private gear: Gear;
  private constructor(public arena: Arena, private asset: PlayerAsset) {
    this.gear = new Gear(arena.scene);
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), new THREE.MeshStandardMaterial({ color: 0xc8102e, roughness: 0.35 }));
    this.ball.castShadow = true;
    arena.scene.add(this.ball, this.bat);
    // post: MSAA render, a soft bloom on the bright highlights, then tone mapping + sRGB
    const r = arena.renderer;
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    this.composer = new EffectComposer(r, new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 }));
    this.composer.addPass(new RenderPass(arena.scene, arena.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.16, 0.45, 0.92);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    // aim marker: a glowing ring on the grass where you're pointing
    this.aim = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.6, 48), new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.85, depthWrite: false }));
    this.aim.rotation.x = -Math.PI / 2;
    this.aim.renderOrder = 2;
    this.aim.visible = false;
    arena.scene.add(this.aim);
    // ball trail: a fading streak behind the ball in flight
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(40 * 3), 3));
    const cols = new Float32Array(40 * 3);
    for (let i = 0; i < 40; i++) cols.set([1, 0.85 - i * 0.01, 0.4 - i * 0.008].map((c) => c * (1 - i / 40)), i * 3);
    tg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    this.trail = new THREE.Line(tg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.trail.frustumCulled = false;
    arena.scene.add(this.trail);
  }

  /** Where the player is aiming (field coords), or null to hide. Lofted aims are orange and bigger. */
  setAim(p: V | null, lofted: boolean, locked: boolean): void {
    this.aim.visible = !!p;
    if (!p) return;
    const r = Math.hypot(p.x, p.z);
    const k = r > 62 ? 62 / r : 1; // keep it inside the rope
    this.aim.position.set(-p.x * k, 0.03, p.z * k);
    const m = this.aim.material as THREE.MeshBasicMaterial;
    m.color.set(locked ? 0xffffff : lofted ? 0xff8a3d : 0xffd166);
    const s = (lofted ? 2.2 : 1.4) * (1 + 0.08 * Math.sin(this.aimT * 8)) * Math.max(1, r / 30);
    this.aim.scale.setScalar(s);
  }

  /** 'low' for older phones: pixel ratio 1 and no bloom (shadows untouched: changing them recompiles every shader). */
  setQuality(q: 'high' | 'low'): void {
    const r = this.arena.renderer;
    r.setPixelRatio(q === 'low' ? 1 : Math.min(devicePixelRatio || 1, 2));
    this.bloom.enabled = q === 'high';
    this.resize();
  }

  static async create(container: HTMLElement, rect: () => DOMRect): Promise<World3D> {
    const mobile = matchMedia('(pointer: coarse)').matches;
    const arena = createArena(container, mobile, rect);
    const [asset, rb] = await Promise.all([loadPlayerAsset(), loadRocketbox().catch((e) => (console.warn('realistic players failed to load', e), null))]);
    const w = new World3D(arena, asset);
    w.build(0x0f8a4c, 0x1d4ed8);
    if (rb) w.buildReal(rb);
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

  /** Swap every visible player for a realistic body. The batter and bowler copy their (hidden) drivers. */
  private buildReal(rb: RbAsset): void {
    const s = this.arena.scene;
    this.rb = rb;
    const hide = (p: Person) => p.m.model.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.visible = false) : null));
    hide(this.batter);
    hide(this.bowler);
    this.keeper.m.root.visible = false;
    this.fielders.forEach((f) => (f.m.root.visible = false));
    // drop the mannequin's simple gear
    for (const p of [this.batter, this.keeper]) p.m.model.traverse((o) => (o as THREE.Mesh).isMesh && !(o as THREE.SkinnedMesh).isSkinnedMesh && (o.visible = false));
    this.rBatter = new RbPerson(rb, 'rb11', s);
    this.gear.dress(this.rBatter, { helmet: 0x0f8a4c, pads: true, gloves: 0x0f8a4c });
    this.batRT = new Retarget({ root: this.batter.m.root, bones: this.batter.m.bones }, this.rBatter);
    this.rBowler = new RbPerson(rb, 'rb09', s);
    this.bowlRig = new BatterRig(this.bowler);
    this.bowlRT = new Retarget({ root: this.bowler.m.root, bones: this.bowler.m.bones }, this.rBowler);
    this.rKeeper = new RbPerson(rb, 'rb16', s);
    this.gear.dress(this.rKeeper, { pads: true, gloves: 0x222222, keeper: true });
    this.rKeeper.play('crouch_idle');
    for (let i = 0; i < 9; i++) {
      const p = new RbPerson(rb, AVATARS[(i + 1) % AVATARS.length], s);
      p.play('idle_neutral_01');
      p.mixer.update(Math.random() * 5);
      this.rFielders.push(p);
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
    const dark = (c: number) => new THREE.Color(c).multiplyScalar(0.55).getHex();
    this.rBatter?.setKit(batKit, dark(batKit));
    this.gear.recolor(batKit);
    for (const p of [this.rBowler, this.rKeeper, ...this.rFielders]) p?.setKit(fieldKit, dark(fieldKit));
  }

  /** The crowd (and fielders, for a wicket) react to the ball's outcome. */
  celebrate(kind: 'six' | 'four' | 'out' | 'runs' | 'dot'): void {
    const lvl = { six: 1, four: 0.75, out: 0.85, runs: 0, dot: 0 }[kind];
    if (lvl) this.arena.fans.celebrate(lvl);
    if (kind === 'out') this.cheerUntil = this.time + 2.6;
  }
  private time = 0;
  private trail!: THREE.Line;
  private trailPts: THREE.Vector3[] = [];
  private cheerUntil = 0;

  setAds(ads: Ad[]): void {
    this.arena.setAds(ads);
  }

  frame(c: Cam, v: FieldView, dt: number): void {
    const { arena } = this;
    // camera = gameplay camera
    const cam = arena.camera;
    cam.fov = (2 * Math.atan(c.h / 2 / c.F) * 180) / Math.PI;
    cam.aspect = c.w / c.h;
    cam.position.copy(W(c.pos));
    cam.up.set(0, 1, 0);
    cam.lookAt(W(c.look));
    cam.updateProjectionMatrix();
    // batter + bat
    const usedBat = this.rig.pose(v.batter, v.ballLook);
    this.batRT?.apply(true);
    placeBat(this.bat, usedBat);
    // ball
    this.ball.visible = !!v.ball;
    if (v.ball) this.ball.position.copy(W(v.ball));
    // trail: only while the ball is travelling (not in a hand, not jumping between balls)
    const last = this.trailPts[0];
    if (!v.ball || (last && last.distanceTo(this.ball.position) > 8)) this.trailPts = [];
    else if (!last || last.distanceTo(this.ball.position) > 0.05) this.trailPts.unshift(this.ball.position.clone());
    else if (last.distanceTo(this.ball.position) < 0.01) this.trailPts.pop();
    this.trailPts.length = Math.min(this.trailPts.length, 14); // a short streak, not a line across the ground
    const tp = this.trail.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < 40; i++) {
      const q = this.trailPts[Math.min(Math.floor(i * 14 / 40), this.trailPts.length - 1)] ?? this.ball.position;
      tp.setXYZ(i, q.x, q.y, q.z);
    }
    tp.needsUpdate = true;
    this.trail.visible = this.trailPts.length > 2;
    // bowler: run in, bowl, follow through
    const bz = v.bowler.z;
    this.bowler.place(0.45, bz, Math.PI);
    if (v.bowler.phase === 'run') this.bowler.play('Sprint_Loop', 1.1);
    else if (v.bowler.phase === 'bowl') this.bowler.play('OverhandThrow', 1.5, 0.08);
    else if (v.bowler.phase === 'follow') this.bowler.play('Jog_Fwd_Loop', 0.8, 0.3);
    else this.bowler.play('Idle_Loop');
    this.bowler.update(dt);
    if (this.bowlRT && this.rBowler && this.bowlRig) {
      const bt = v.bowler.t;
      const mocap = (t: number | null) => {
        // recorded run-up, or standing at the end of the follow-through
        const run = t !== null && t < BOWL_FROM + 0.12;
        const z = t === null ? 26 : bowlerZ(Math.min(t, BOWL_TO));
        this.rBowler!.place(-0.13, z, Math.PI);
        this.rBowler!.play(run ? 'run_fast_01' : 'idle_neutral_01', run ? 1.05 : 1, 0.15);
        this.rBowler!.update(dt);
      };
      if (bt !== null && bt >= BOWL_FROM && bt <= BOWL_TO) {
        // blend in from the run (first 0.12 s) and out to standing (last 0.2 s) so there's no jump
        const kIn = 1 - Math.min(1, (bt - BOWL_FROM) / 0.12);
        const kOut = Math.max(0, (bt - (BOWL_TO - 0.2)) / 0.2);
        let snap = null;
        if (kIn > 0 || kOut > 0) {
          mocap(kIn > 0 ? bt : BOWL_TO + 1);
          snap = this.bowlRT.snapshot();
        }
        // the delivery stride: procedural joints -> driver rig (+ wrist snap) -> realistic body
        this.bowlRig.pose(bowlerJoints(bt), { x: 0, y: 1, z: 0 }, true);
        this.bowler.turn('hand_r', new THREE.Vector3(-1, 0, 0), wristFlick(bt));
        this.bowlRT.apply(true);
        if (snap) this.bowlRT.blend(snap, Math.max(kIn, kOut) ** 0.8);
      } else mocap(bt);
      // the ball sits in the bowling hand until it's let go
      if (!v.ball && bt !== null && bt < 0) {
        this.ball.visible = true;
        const h = this.rBowler.bone('R Hand');
        const f = this.rBowler.bone('R Finger2');
        h.getWorldPosition(this.ball.position).lerp(f.getWorldPosition(new THREE.Vector3()), 0.8);
      }
    }    // keeper
    this.keeper.place(-v.keeper.x, v.keeper.z, 0);
    this.keeper.update(dt);
    if (this.rKeeper) {
      this.rKeeper.place(-v.keeper.x, v.keeper.z, 0);
      this.rKeeper.update(dt);
    }
    // fielders: run when they move, face the ball
    this.fielders.forEach((f, i) => {
      const p = W(v.fielders[i]);
      const moved = p.distanceTo(this.prev[i]) / Math.max(dt, 1e-3);
      const to = (v.ball ? W(v.ball) : new THREE.Vector3(0, 0, 0)).sub(p);
      const yaw = moved > 0.8 ? Math.atan2(p.x - this.prev[i].x, p.z - this.prev[i].z) : Math.atan2(to.x, to.z);
      f.place(p.x, p.z, yaw);
      f.play(moved > 4 ? 'Sprint_Loop' : moved > 0.8 ? 'Jog_Fwd_Loop' : 'Idle_Loop', 1, 0.15);
      f.update(dt);
      const r = this.rFielders[i];
      if (r) {
        r.place(p.x, p.z, yaw);
        const cheering = this.time < this.cheerUntil && moved < 0.8;
        r.play(cheering ? 'cheer_01' : moved > 4 ? 'run_fast_01' : moved > 0.8 ? 'run_slow_01' : 'idle_neutral_01', moved > 4 ? moved / 6.5 : cheering ? 1.4 : 1, 0.2);
        r.update(dt);
      }
      this.prev[i].copy(p);
    });
    // stumps
    if (v.bowled && !this.bowledShown) arena.stumps.near.break(0);
    if (!v.bowled && this.bowledShown) arena.stumps.near.reset();
    this.bowledShown = v.bowled;
    arena.stumps.near.update(dt);
    arena.update(dt);
    this.gear.update();
    this.time += dt;
    this.aimT += dt;
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
