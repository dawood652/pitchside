// Directs the 3D scene from the game state.
// Batting is solved from the ball: the batter steps (front or back foot, leg IK) toward where the
// ball will be, and the bat swings on an arc that passes exactly through the ball's position at
// the moment of contact (arms by IK onto the handle). Mistimed swings pass through that point at
// the wrong time, so you see the miss. Fielders chase, catch or collect; cameras follow the ball.
import * as THREE from 'three';
import { Delivery, deliveryPos, flightTime, PITCH_LEN, PlannedShot, ropeField } from '../engine';
import { createArena, W } from './arena';
import { armour, makeBat, Person } from './people';
import { KitLook, loadPlayerAsset, PlayerAsset } from './playerModel';

const UP = new THREE.Vector3(0, 1, 0);
export const RUNUP = 1.35;
const BAT_SWEET = 0.62; // handle top to sweet spot (m)

export interface View {
  phase: 'menu' | 'runup' | 'ball' | 'field' | 'result' | 'over';
  t: number; // time in phase
  d: Delivery | null;
  swingAt: number | null; // ball time of the tap
  target: { x: number; z: number } | null; // field point aimed at
  shot: PlannedShot | null;
  contact: { x: number; y: number; z: number } | null; // field coords of the ball at contact
  swingLead: number;
  wicket: boolean;
}

function kit(primary: string, secondary: string, keeper = false, n = 7): KitLook {
  return { primary, secondary, shorts: primary, socks: primary, boots: '#f2f2f2', skin: ['#e0ac69', '#c68642', '#8d5524', '#f1c9a5'][n % 4], hair: '#1b1b1b', pattern: 'plain', numberColor: secondary, number: n, name: '', keeper, hairStyle: n % 3 };
}
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const fw = (p: { x: number; y?: number; h?: number; z: number }) => W(p.x, p.y ?? p.h ?? 0, p.z);

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
  private camPos = new THREE.Vector3(0.6, 2.9, -3.7);
  private camLook = new THREE.Vector3(0, 0.75, 12);
  private lastPhase = '';
  private wicketDone = false;
  private stance: { l: THREE.Vector3; r: THREE.Vector3 } | null = null;
  debugCam: [THREE.Vector3, THREE.Vector3] | null = null;

  constructor(container: HTMLElement, mobile: boolean) {
    this.arena = createArena(container, mobile);
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(0.036, 16, 12), new THREE.MeshStandardMaterial({ color: 0xb3121f, roughness: 0.35 }));
    this.ball.add(new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.004, 4, 24), new THREE.MeshStandardMaterial({ color: 0xf5efe0 })));
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
    this.fielders = ropeField().map((f, i) => {
      const p = new Person(this.asset, kit(bowlKit[0], bowlKit[1], false, 2 + i), sc);
      const home = W(f.x, 0, f.z);
      return { p, x: home.x, z: home.z, home };
    });
    this.keeper.place(0, -1.9, 0);
    this.umpire.place(0.7, PITCH_LEN + 2.2, Math.PI);
    this.umpire.play('Idle_FoldArms_Loop');
    this.stance = null;
  }

  /** Field point under a screen position (tap-to-hit target). */
  pick(sx: number, sy: number): { x: number; z: number } {
    const cam = this.arena.camera;
    const el = this.arena.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((sx - el.left) / el.width) * 2 - 1, -((sy - el.top) / el.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, cam);
    const o = ray.ray.origin;
    const d = ray.ray.direction;
    const t = Math.min(400, d.y < -0.02 ? -o.y / d.y : 400); // tapping the sky: same direction, far away
    const p = o.clone().addScaledVector(d, t);
    return { x: -p.x, z: p.z };
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
    this.arena.update(dt);
    this.updateBowler(dt, v);
    this.updateBatter(dt, v);
    this.updateOthers(dt, v);
    this.updateBall(v);
    this.updateCamera(dt, v);
    this.arena.renderer.render(this.arena.scene, this.arena.camera);
  }

  private updateBowler(dt: number, v: View): void {
    const b = this.bowler;
    let z: number;
    let k = 0;
    if (v.phase === 'runup') {
      z = PITCH_LEN + 9.5 - 10.5 * (v.t / RUNUP);
      b.play(v.t < 1.0 ? 'Sprint_Loop' : 'Jog_Fwd_Loop', v.t < 1.0 ? 1.1 : 0.8);
      k = Math.max(0, (v.t - 1.05) / 0.6);
    } else {
      const tt = v.phase === 'ball' ? v.t : 2;
      z = PITCH_LEN - 1.0 - Math.min(3, tt * 2.2 - tt * tt * 0.5);
      b.play(tt < 1.4 ? 'Jog_Fwd_Loop' : 'Idle_Loop', 0.7, 0.4);
      k = Math.min(1.4, (RUNUP + tt - 1.05) / 0.6);
    }
    b.place(-0.55, z, Math.PI);
    b.update(dt);
    if (k > 0 && k < 1.35) {
      const fwd = new THREE.Vector3(0, 0, -1);
      const psi = 3.74 - 4.64 * Math.min(1, k);
      const w = k < 1 ? 1 : 1 - (k - 1) / 0.35;
      const arm = fwd.clone().multiplyScalar(Math.cos(psi)).addScaledVector(UP, Math.sin(psi));
      b.aim('upperarm_r', arm, w);
      b.aim('lowerarm_r', arm, w);
      const pl = 1.3 - 2.7 * smooth(0.1, 0.55, k);
      b.aim('upperarm_l', fwd.clone().multiplyScalar(Math.cos(pl)).addScaledVector(UP, Math.sin(pl)).add(new THREE.Vector3(-0.3, 0, 0)), w);
    }
  }

  /** Ball time now (negative during the run-up), or a large number after the ball. */
  private ballTime(v: View): number {
    return v.phase === 'ball' ? v.t : v.phase === 'runup' ? v.t - RUNUP : 99;
  }

  private updateBatter(dt: number, v: View): void {
    const p = this.batter;
    const base = new THREE.Vector3(0.3, 0, 1.05);
    const bt = this.ballTime(v);
    const d = v.d;
    const T = d ? flightTime(d) - 0.3 / d.speed : 0.6;
    const sw = v.swingAt;
    const contactT = sw !== null ? sw + v.swingLead : T;
    // ---- footwork: front foot to full balls, back foot to short ones, toward the line
    const front = !d || !['short', 'bouncer'].includes(d.length);
    const lineW = d ? W(deliveryPos(d, T).x, 0, 0).x : 0;
    const idle = v.phase === 'menu' || v.phase === 'over' || v.phase === 'runup';
    const strideStart = sw !== null ? Math.min(sw - 0.05, contactT - 0.28) : T - 0.25;
    const stride = idle ? 0 : sw !== null || v.phase !== 'ball' ? smooth(strideStart, contactT - 0.03, Math.min(bt, contactT)) : smooth(T - 0.25, T, bt) * 0.4;
    const strideVec = front ? new THREE.Vector3((lineW - 0.1) * 0.5, 0, 0.55) : new THREE.Vector3(lineW * 0.3, 0, -0.32);
    const root = base.clone().addScaledVector(strideVec, stride * (front ? 0.45 : 0.6));
    p.place(root.x, root.z, -Math.PI / 2);
    p.play('Idle_Loop', 0.5);
    p.update(dt);
    if (!this.stance) {
      // where the feet sit in the stance (relative to the root), a little wider and open
      this.stance = { l: p.footPos('l').sub(p.m.root.position), r: p.footPos('r').sub(p.m.root.position) };
      this.stance.l.add(new THREE.Vector3(0, 0, 0.1));
      this.stance.r.add(new THREE.Vector3(0, 0, -0.08));
    }
    // feet: back foot planted (or pushed back), front foot steps out on a small arc
    const backFoot = base.clone().add(this.stance.r).addScaledVector(strideVec, front ? 0 : stride);
    const frontFoot = base.clone().add(this.stance.l).addScaledVector(strideVec, front ? stride : stride * 0.4);
    frontFoot.y += Math.sin(stride * Math.PI) * 0.12;
    const kneePole = new THREE.Vector3(-1, 0.2, 0.4);
    p.m.model.position.y = -0.07 - stride * 0.06; // knees bend into the shot
    p.m.root.updateMatrixWorld(true);
    p.step('r', backFoot, kneePole);
    p.step('l', frontFoot, kneePole);

    // ---- bat arc through the contact point
    const ballAt = (t: number) => (d ? fw(deliveryPos(d, t)) : new THREE.Vector3(0, 0.6, 1.6));
    const B = v.contact ? fw(v.contact) : ballAt(contactT);
    const aimDir = v.target ? new THREE.Vector3(-v.target.x, 0, v.target.z).normalize() : new THREE.Vector3(0, 0, 1);
    const P = p.m.bones.get('spine_03')!.getWorldPosition(new THREE.Vector3()).addScaledVector(UP, -0.05);
    const toB = B.clone().sub(P);
    const reachLen = toB.length();
    const Dc = toB.normalize();
    const Hc = B.clone().addScaledVector(Dc, -Math.min(BAT_SWEET, reachLen - 0.22));
    let n = new THREE.Vector3().crossVectors(Dc, aimDir);
    if (n.lengthSq() < 0.05) n = new THREE.Vector3().crossVectors(Dc, new THREE.Vector3(-1, 0, 0));
    n.normalize();
    const aerial = v.shot ? v.shot.kind === 'six' || v.shot.kind === 'catch' || v.shot.kind === 'drop' : true;
    let theta: number; // angle along the arc; 0 = bat on the ball
    // stance: bat grounded by the toes; backlift starts as the bowler loads up
    const backlift = -0.2 - 1.9 * smooth(-0.3, 0.35, bt);
    if (v.phase === 'menu' || v.phase === 'over') theta = -0.2;
    else if (sw !== null) {
      if (bt < sw) theta = backlift;
      else if (bt < contactT) theta = backlift * (1 - smooth(sw, contactT, bt));
      else theta = (aerial ? 2.6 : 1.9) * smooth(contactT, contactT + 0.32, bt);
    } else if (bt > T - 0.08) theta = backlift - 0.6 * smooth(T - 0.08, T + 0.15, bt); // leave: bat up out of the way
    else theta = backlift;
    const q = new THREE.Quaternion().setFromAxisAngle(n, theta);
    const D = Dc.clone().applyQuaternion(q);
    const H = P.clone().add(Hc.clone().sub(P).applyQuaternion(q));
    p.turn('spine_02', UP, Math.max(-0.5, Math.min(0.7, -theta * 0.22))); // torso turns with the swing
    const pole = new THREE.Vector3(0, -1, 0).addScaledVector(aimDir, -0.5);
    p.reach('l', H.clone().addScaledVector(D, 0.02), pole);
    p.reach('r', H.clone().addScaledVector(D, 0.12), pole);
    const y = D.clone().negate();
    const zAx = aimDir.clone().sub(D.clone().multiplyScalar(aimDir.dot(D))).normalize();
    const xAx = new THREE.Vector3().crossVectors(y, zAx).normalize();
    this.bat.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAx, y, zAx));
    this.bat.position.copy(H);
    p.look(v.phase === 'ball' ? ballAt(Math.min(bt, T)) : v.phase === 'field' ? this.ballWorld(v) : new THREE.Vector3(0, 1.5, PITCH_LEN));
  }

  private ballWorld(v: View): THREE.Vector3 {
    const s = v.shot;
    if ((v.phase === 'field' || v.phase === 'result') && s && s.path.length && v.contact) {
      const tt = v.phase === 'field' ? v.t : s.endT + 1;
      const i = Math.min(s.path.length - 1, Math.max(0, Math.floor(tt * 30)));
      const q = s.path[i];
      if ((s.kind === 'catch' && tt >= s.endT - 0.05) || (s.kind === 'runs' && tt >= s.endT)) {
        const f = s.fielder !== null ? this.fielders[s.fielder] : null;
        if (f) return f.p.handPos('r');
        if (s.kind === 'catch') return this.keeper.handPos('r');
      }
      return W(q.x + v.contact.x, q.h + (i === 0 ? v.contact.y : 0), q.z + v.contact.z);
    }
    if (v.d && (v.phase === 'ball' || v.phase === 'result')) {
      const tt = v.phase === 'ball' ? v.t : flightTime(v.d) + Math.min(0.4, v.t);
      return fw(deliveryPos(v.d, tt));
    }
    return this.bowler.handPos('r');
  }

  private updateBall(v: View): void {
    const hide = v.phase === 'menu' || v.phase === 'over' || (v.phase === 'result' && (v.shot?.kind === 'six' || v.shot?.kind === 'four'));
    this.ball.visible = this.shadow.visible = !hide;
    const p = this.ballWorld(v);
    this.ball.position.copy(p);
    this.ball.rotation.x += 0.4;
    this.shadow.position.set(p.x, 0.012, p.z);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = 0.32 / (1 + p.y * 0.4);
  }

  private updateOthers(dt: number, v: View): void {
    this.keeper.play(v.phase === 'runup' || (v.phase === 'ball' && v.t < 0.25) ? 'Crouch_Idle_Loop' : 'Idle_Loop', 1, 0.25);
    this.keeper.update(dt);
    this.keeper.look(this.ballWorld(v));
    this.umpire.update(dt);
    this.nonStriker.play(v.phase === 'runup' ? 'Walk_Loop' : 'Idle_Loop', 0.6);
    this.nonStriker.place(1.5, PITCH_LEN - 1.4 - (v.phase === 'runup' ? v.t * 0.8 : v.phase === 'ball' ? 1.1 : 0), Math.PI);
    this.nonStriker.update(dt);
    const s = v.shot;
    const bw = this.ballWorld(v);
    let chaser = -1;
    let goal: THREE.Vector3 | null = null;
    if ((v.phase === 'field' || v.phase === 'result') && s && s.path.length && v.contact) {
      const end = s.path.at(-1)!;
      goal = W(end.x + v.contact.x, 0, end.z + v.contact.z);
      chaser = s.fielder ?? -1;
      if (chaser < 0 && s.kind !== 'catch') {
        let best = 1e9;
        this.fielders.forEach((f, i) => {
          const dd = Math.hypot(f.x - goal!.x, f.z - goal!.z);
          if (dd < best) {
            best = dd;
            chaser = i;
          }
        });
      }
    }
    this.fielders.forEach((f, i) => {
      let speed = 0;
      if (goal && v.phase === 'field' && s) {
        const tgt = i === chaser ? goal : bw.clone().setY(0);
        const dx = tgt.x - f.x;
        const dz = tgt.z - f.z;
        const dist = Math.hypot(dx, dz);
        const tLeft = Math.max(0.15, s.endT - v.t);
        speed = i === chaser ? Math.min(7.5, Math.max(3, dist / tLeft)) : dist > 30 ? 0 : 1.8;
        if (dist > 0.35) {
          f.x += (dx / dist) * Math.min(dist, speed * dt);
          f.z += (dz / dist) * Math.min(dist, speed * dt);
        } else speed = 0;
      }
      f.p.place(f.x, f.z, Math.atan2(bw.x - f.x, bw.z - f.z));
      const celebrating = v.phase === 'result' && s?.kind === 'catch' && i === chaser;
      f.p.play(celebrating ? 'Celebration' : speed > 4 ? 'Sprint_Loop' : speed > 0.5 ? 'Jog_Fwd_Loop' : v.phase === 'runup' ? 'Walk_Loop' : 'Idle_Loop', speed > 4 ? 1.15 : 0.8);
      f.p.update(dt);
      // hands up to take the catch as the ball drops in
      if (i === chaser && s && (s.kind === 'catch' || s.kind === 'drop') && v.phase === 'field' && v.t > s.endT - 0.6) {
        f.p.reach('l', bw.clone().add(new THREE.Vector3(0.06, 0, 0)), new THREE.Vector3(0, -1, 0));
        f.p.reach('r', bw.clone().add(new THREE.Vector3(-0.06, 0, 0)), new THREE.Vector3(0, -1, 0));
      }
    });
  }

  private updateCamera(dt: number, v: View): void {
    const cam = this.arena.camera;
    let pos: THREE.Vector3;
    let look: THREE.Vector3;
    // stay on the batter through the follow-through, then follow the ball
    if (((v.phase === 'field' && v.t > 0.4) || (v.phase === 'result' && v.shot?.path.length)) && v.shot) {
      const b = this.ballWorld(v);
      const far = Math.hypot(b.x, b.z);
      pos = new THREE.Vector3(b.x * 0.4, 9 + far * 0.18 + b.y * 0.3, b.z * 0.4 - 16);
      look = b.clone().setY(Math.max(0, b.y * 0.6));
    } else {
      pos = new THREE.Vector3(0.6, 2.9, -3.7);
      look = new THREE.Vector3(0, 0.75, 12);
    }
    if (this.debugCam) [pos, look] = this.debugCam;
    const k = 1 - Math.exp(-dt * (v.phase === 'field' ? 3.5 : 6));
    this.camPos.lerp(pos, k);
    this.camLook.lerp(look, k);
    cam.position.copy(this.camPos);
    cam.lookAt(this.camLook);
  }
}
