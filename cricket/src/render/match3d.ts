// Directs the 3D scene from the game state: bowler run-up and windmill, batter backlift and
// shot (bat solved procedurally, arms by IK), keeper, umpire, fielders chasing, ball, cameras.
import * as THREE from 'three';
import { BallFlight, Delivery, deliveryPos, defaultField, flightTime, PITCH_LEN } from '../engine';
import { createArena, W } from './arena';
import { armour, makeBat, Person } from './people';
import { KitLook, loadPlayerAsset, PlayerAsset } from './playerModel';

const UP = new THREE.Vector3(0, 1, 0);
export const RUNUP = 1.35;

export interface View {
  phase: 'menu' | 'runup' | 'ball' | 'field' | 'result' | 'over';
  t: number;
  d: Delivery | null;
  swing: { at: number; dx: number; dy: number; loft: boolean; block: boolean } | null;
  hit: boolean;
  wicket: boolean;
  flight: BallFlight | null;
  swingLead: number;
}

function kit(primary: string, secondary: string, keeper = false, n = 7, name = ''): KitLook {
  return { primary, secondary, shorts: primary, socks: primary, boots: '#f2f2f2', skin: ['#e0ac69', '#c68642', '#8d5524', '#f1c9a5'][n % 4], hair: '#1b1b1b', pattern: 'plain', numberColor: secondary, number: n, name, keeper, hairStyle: n % 3 };
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class Match3D {
  arena;
  private asset!: PlayerAsset;
  private batter!: Person;
  private bowler!: Person;
  private keeper!: Person;
  private umpire!: Person;
  private nonStriker!: Person;
  private fielders: { p: Person; x: number; z: number; home: THREE.Vector3 }[] = [];
  private bat = makeBat();
  private ball: THREE.Mesh;
  private shadow: THREE.Mesh;
  private camPos = new THREE.Vector3(0.5, 2.7, -7);
  private camLook = new THREE.Vector3(0, 0.9, 11);
  private lastPhase = '';
  private wicketDone = false;
  /** test hook: fixed camera [pos, look] */
  debugCam: [THREE.Vector3, THREE.Vector3] | null = null;

  constructor(container: HTMLElement, mobile: boolean) {
    this.arena = createArena(container, mobile);
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(0.036, 16, 12), new THREE.MeshStandardMaterial({ color: 0xb3121f, roughness: 0.35 }));
    const seam = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.004, 4, 24), new THREE.MeshStandardMaterial({ color: 0xf5efe0 }));
    this.ball.add(seam);
    this.ball.castShadow = true;
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.05, 12), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.arena.scene.add(this.ball, this.shadow, this.bat);
  }

  async load(batKit: [string, string], bowlKit: [string, string]): Promise<void> {
    this.asset = await loadPlayerAsset();
    this.setTeams(batKit, bowlKit);
  }

  setTeams(batKit: [string, string], bowlKit: [string, string]): void {
    const sc = this.arena.scene;
    for (const p of [this.batter, this.bowler, this.keeper, this.umpire, this.nonStriker, ...this.fielders.map((f) => f.p)]) if (p) sc.remove(p.m.root);
    this.batter = new Person(this.asset, kit(batKit[0], batKit[1], false, 18), sc);
    armour(this.batter, true, 0x0b2545);
    this.nonStriker = new Person(this.asset, kit(batKit[0], batKit[1], false, 45), sc);
    armour(this.nonStriker, true, 0x0b2545);
    this.bowler = new Person(this.asset, kit(bowlKit[0], bowlKit[1], false, 11), sc);
    this.keeper = new Person(this.asset, kit(bowlKit[0], bowlKit[1], true, 1), sc);
    armour(this.keeper, true, 0x222222);
    this.umpire = new Person(this.asset, kit('#f4f4ee', '#111111', false, 0), sc);
    this.fielders = defaultField(false).map((f, i) => {
      const p = new Person(this.asset, kit(bowlKit[0], bowlKit[1], false, 2 + i), sc);
      const home = W(f.x, 0, f.z);
      p.place(home.x, home.z, Math.atan2(-home.x, -home.z));
      return { p, x: home.x, z: home.z, home };
    });
    this.keeper.place(0, -1.9, 0);
    this.umpire.place(0.7, PITCH_LEN + 2.2, Math.PI);
    this.umpire.play('Idle_FoldArms_Loop');
    this.nonStriker.place(1.5, PITCH_LEN - 1.4, Math.PI);
  }

  /** Field angle (0 = straight) to a world direction. */
  private dirW(a: number): THREE.Vector3 {
    return new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
  }

  update(dt: number, v: View): void {
    if (v.phase !== this.lastPhase) {
      if (v.phase === 'runup') {
        this.arena.stumps.near.reset();
        this.wicketDone = false;
        for (const f of this.fielders) {
          f.x = f.home.x;
          f.z = f.home.z;
        }
      }
      this.lastPhase = v.phase;
    }
    if (v.wicket && !this.wicketDone && v.phase === 'result') {
      this.wicketDone = true;
      this.arena.stumps.near.break(1);
    }
    this.arena.stumps.near.update(dt);
    this.updateBowler(dt, v);
    this.updateBatter(dt, v);
    this.updateOthers(dt, v);
    this.updateBall(v);
    this.updateCamera(dt, v);
    this.arena.renderer.render(this.arena.scene, this.arena.camera);
  }

  private updateBowler(dt: number, v: View): void {
    const b = this.bowler;
    const x = -0.55;
    let z: number;
    let k = 0; // windmill progress
    if (v.phase === 'runup') {
      const u = v.t / RUNUP;
      z = PITCH_LEN + 9.5 - 10.5 * (1 - (1 - u) * (1 - u) * 0.35) * u;
      b.play(v.t < 1.0 ? 'Sprint_Loop' : 'Jog_Fwd_Loop', v.t < 1.0 ? 1.1 : 0.8);
      k = Math.max(0, (v.t - 1.05) / 0.6);
    } else {
      const tt = v.phase === 'ball' ? v.t : 2;
      z = PITCH_LEN - 1.0 - Math.min(3, tt * 2.2 - tt * tt * 0.5);
      b.play(tt < 1.4 ? 'Jog_Fwd_Loop' : 'Idle_Loop', 0.7, 0.4);
      k = Math.min(1.4, (RUNUP + tt - 1.05) / 0.6);
    }
    b.place(x, z, Math.PI);
    b.update(dt);
    if (k > 0 && k < 1.35) {
      const fwd = new THREE.Vector3(0, 0, -1);
      const psi = 3.74 - 4.64 * Math.min(1, k);
      const w = k < 1 ? 1 : 1 - (k - 1) / 0.35;
      b.aim('upperarm_r', fwd.clone().multiplyScalar(Math.cos(psi)).addScaledVector(UP, Math.sin(psi)), w);
      b.aim('lowerarm_r', fwd.clone().multiplyScalar(Math.cos(psi)).addScaledVector(UP, Math.sin(psi)), w);
      const pl = 1.3 - 2.7 * smooth(0.1, 0.55, k);
      b.aim('upperarm_l', fwd.clone().multiplyScalar(Math.cos(pl)).addScaledVector(UP, Math.sin(pl)).add(new THREE.Vector3(-0.3, 0, 0)), w);
    }
  }

  private updateBatter(dt: number, v: View): void {
    const p = this.batter;
    p.place(0.3, 1.05, -Math.PI / 2);
    p.play('Idle_Loop', 0.6);
    p.update(dt);
    // shot geometry
    const sw = v.swing;
    const a = sw ? Math.atan2(sw.dx, sw.dy || (sw.dx === 0 ? 1 : 0)) : 0;
    const loft = !!sw?.loft;
    const T = v.d ? flightTime(v.d) - 0.3 / v.d.speed : 0.6;
    const ballT = v.phase === 'ball' ? v.t : v.phase === 'runup' ? -RUNUP + v.t : 99;
    let theta: number;
    const back = -0.55 - 1.45 * smooth(-0.25, 0.3, ballT);
    if (sw && !sw.block) {
      const contact = sw.at + v.swingLead;
      const st = v.phase === 'ball' ? v.t : contact + 1;
      if (st < sw.at) theta = back;
      else if (st < contact) theta = back + (0 - back) * smooth(sw.at, contact, st);
      else theta = (loft ? 2.7 : 1.9) * smooth(contact, contact + 0.35, st);
    } else if (sw?.block) theta = v.phase === 'ball' && v.t < sw.at ? back : 0.1;
    else if (v.phase === 'ball' && ballT > T - 0.05) theta = back - 0.5 * smooth(T - 0.05, T + 0.2, ballT); // shoulder arms
    else if (v.phase === 'result' || v.phase === 'field') theta = -2.3;
    else theta = back;
    if (v.phase === 'menu' || v.phase === 'over') theta = -0.55;
    const s = this.dirW(sw ? a : 0);
    const tau = sw && !sw.block ? (Math.abs(a) > 1.0 && !loft ? 1.15 : 0.15 + Math.abs(a) * 0.15) : 0.1;
    const side = new THREE.Vector3().crossVectors(s, UP).normalize();
    const down = UP.clone().multiplyScalar(-Math.cos(tau)).addScaledVector(side, Math.sin(tau) * (a >= 0 ? 1 : -1));
    const pelvis = p.m.bones.get('pelvis')!.getWorldPosition(new THREE.Vector3());
    const C = pelvis.clone().addScaledVector(UP, 0.42).addScaledVector(s, 0.14).add(new THREE.Vector3(0, 0, 0.05));
    const D = s.clone().multiplyScalar(Math.sin(theta)).addScaledVector(down, Math.cos(theta)).normalize();
    const H = C.clone().addScaledVector(D, 0.4);
    // upper body follows the swing a little
    p.turn('spine_02', UP, Math.max(-0.4, Math.min(0.6, -theta * 0.18)) * (sw ? 1 : 0.5));
    const pole = new THREE.Vector3(0, -1, 0).addScaledVector(s, -0.4);
    p.reach('l', H.clone().addScaledVector(D, 0.02), pole);
    p.reach('r', H.clone().addScaledVector(D, 0.13), pole);
    // place the bat on the hands
    const y = D.clone().negate();
    const zAx = s.clone().sub(D.clone().multiplyScalar(s.dot(D))).normalize();
    const xAx = new THREE.Vector3().crossVectors(y, zAx);
    this.bat.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAx, y, zAx));
    this.bat.position.copy(H).addScaledVector(D, -0.04);
    // watch the ball
    p.look(v.phase === 'ball' && v.d ? this.ballWorld(v) : new THREE.Vector3(0, 1.5, PITCH_LEN), 1);
  }

  private ballWorld(v: View): THREE.Vector3 {
    if (v.phase === 'field' && v.flight) {
      const path = v.flight.path;
      const i = Math.min(path.length - 1, Math.floor(v.t * 30));
      const q = path[Math.max(0, i)];
      return W(q.x, q.h, q.z);
    }
    if (v.d && (v.phase === 'ball' || v.phase === 'result')) {
      const tt = v.phase === 'ball' ? v.t : flightTime(v.d) + Math.min(0.35, v.t);
      const q = deliveryPos(v.d, tt);
      return W(q.x, q.y, q.z);
    }
    return this.bowler.handPos('r');
  }

  private updateBall(v: View): void {
    const hide = v.phase === 'menu' || v.phase === 'over' || (v.phase === 'result' && v.hit);
    this.ball.visible = this.shadow.visible = !hide;
    const p = this.ballWorld(v);
    this.ball.position.copy(p);
    this.ball.rotation.x += 0.4;
    this.shadow.position.set(p.x, 0.012, p.z);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = 0.32 / (1 + p.y * 0.4);
  }

  private updateOthers(dt: number, v: View): void {
    // keeper crouches as the bowler runs in, rises with the ball
    this.keeper.play(v.phase === 'runup' || (v.phase === 'ball' && v.t < 0.25) ? 'Crouch_Idle_Loop' : 'Idle_Loop', 1, 0.25);
    this.keeper.update(dt);
    this.keeper.look(this.ballWorld(v));
    this.umpire.update(dt);
    this.nonStriker.play(v.phase === 'runup' ? 'Walk_Loop' : 'Idle_Loop', 0.6);
    this.nonStriker.place(1.5, PITCH_LEN - 1.4 - (v.phase === 'runup' ? v.t * 0.8 : v.phase === 'ball' ? 1.1 : 0), Math.PI);
    this.nonStriker.update(dt);
    // fielders: walk in with the bowler, chase the ball when it's hit
    const bw = this.ballWorld(v);
    let chaser = -1;
    if (v.phase === 'field' && v.flight) {
      chaser = v.flight.result.fielder ?? -1;
      if (chaser < 0) {
        const end = v.flight.path.at(-1)!;
        let best = 1e9;
        this.fielders.forEach((f, i) => {
          const d = Math.hypot(f.x + end.x, f.z - end.z);
          if (d < best) {
            best = d;
            chaser = i;
          }
        });
      }
    }
    this.fielders.forEach((f, i) => {
      let tx = f.x;
      let tz = f.z;
      let speed = 0;
      if (v.phase === 'field' && v.flight && v.t > 0.3) {
        const end = v.flight.path.at(-1)!;
        const goal = i === chaser ? new THREE.Vector3(-end.x, 0, end.z) : bw.clone().setY(0);
        const dx = goal.x - f.x;
        const dz = goal.z - f.z;
        const dist = Math.hypot(dx, dz);
        speed = i === chaser ? 6.8 : dist > 25 ? 0 : 2.2;
        if (dist > 0.4 && speed > 0) {
          tx = f.x + (dx / dist) * Math.min(dist, speed * dt);
          tz = f.z + (dz / dist) * Math.min(dist, speed * dt);
        } else speed = 0;
      }
      const yaw = Math.atan2(bw.x - tx, bw.z - tz);
      f.x = tx;
      f.z = tz;
      f.p.place(tx, tz, yaw);
      f.p.play(speed > 4 ? 'Sprint_Loop' : speed > 0.5 ? 'Jog_Fwd_Loop' : v.phase === 'runup' ? 'Walk_Loop' : 'Idle_Loop', speed > 4 ? 1.1 : 0.7);
      f.p.update(dt);
    });
  }

  private updateCamera(dt: number, v: View): void {
    const cam = this.arena.camera;
    let pos: THREE.Vector3;
    let look: THREE.Vector3;
    if (v.phase === 'field' && v.flight) {
      const b = this.ballWorld(v);
      pos = new THREE.Vector3(b.x * 0.45, 13 + Math.hypot(b.x, b.z) * 0.12, b.z * 0.45 - 20);
      look = b.clone().setY(Math.max(0, b.y * 0.5));
    } else {
      // high behind the batter, over the keeper's head
      pos = new THREE.Vector3(0.6, 2.9, -3.7);
      look = new THREE.Vector3(0, 0.75, 12);
    }
    if (this.debugCam) [pos, look] = this.debugCam;
    const k = 1 - Math.exp(-dt * (v.phase === 'field' ? 4 : 6));
    this.camPos.lerp(pos, k);
    this.camLook.lerp(look, k);
    cam.position.copy(this.camPos);
    cam.lookAt(this.camLook);
  }
}
