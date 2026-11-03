// Drives one skinned player: mocap clips (Quaternius UAL) blended by speed/direction, clip one-shots,
// and a procedural layer applied on real bones in character space (kicks, dives, catches, head tracking).

import * as THREE from 'three';
import { Player } from '../entities/player';
import { PlayerModel } from '../render/playerModel';
import { neutralPose, Pose, POSE_KEYS, BASE_HIP } from './pose';
import * as clips from './clips';
import { OneShotChooser } from './oneShot';
import { FootPlanter } from './footPlant';

const R = new THREE.Vector3(-1, 0, 0); // character right
const F = new THREE.Vector3(0, 0, 1); // character forward
const U = new THREE.Vector3(0, 1, 0);

const LOCO = ['Idle_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Jog_Left_Loop', 'Jog_Right_Loop', 'Jog_Bwd_Loop'] as const;
const NEUTRAL = neutralPose();

const _q = new THREE.Quaternion();
const _qw = new THREE.Quaternion();
const _qp = new THREE.Quaternion();
const _axis = new THREE.Vector3();
const _v = new THREE.Vector3();

interface Fading {
  action: THREE.AnimationAction;
  w: number;
}

export interface AnimContext {
  ball: { x: number; y: number; z: number };
  outcome: 'win' | 'lose' | 'draw' | null; // set at full-time
}

export class PlayerAnimator {
  private mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private phase = Math.random();
  private oneShot: THREE.AnimationAction | null = null;
  private oneShotName = '';
  private oneShotW = 0;
  private fading: Fading[] = [];
  private proc: Pose = neutralPose();
  private procW = 0;
  private lookYaw = 0;
  private charQuat = new THREE.Quaternion();
  private chooser: OneShotChooser;
  private planter: FootPlanter;
  private lastActionT = 0;
  private fadeIn = 0.12;

  constructor(private m: PlayerModel, clipMap: Map<string, THREE.AnimationClip>) {
    this.mixer = new THREE.AnimationMixer(m.model);
    for (const [name, clip] of clipMap) {
      const a = this.mixer.clipAction(clip);
      a.enabled = true;
      a.setEffectiveWeight(0);
      a.play();
      if (LOCO.includes(name as (typeof LOCO)[number])) a.timeScale = 0;
      else a.stop();
      this.actions.set(name, a);
    }
    this.chooser = new OneShotChooser((n) => this.actions.get(n)?.getClip().duration ?? 0);
    this.planter = new FootPlanter(m.root, m.bones);
  }

  private bone(n: string): THREE.Bone | undefined {
    return this.m.bones.get(n);
  }

  /** Procedural target (absolute pose) or null. */
  private wantedProc(p: Player, holdingOverhead: boolean): Pose | null {
    const u = p.actionDur > 0 ? Math.min(1, p.actionT / p.actionDur) : 0;
    switch (p.action) {
      case 'dive':
        return clips.dive(u, p.diveDir, p.diveHigh);
      case 'celebrate':
        if (p.celebrateVariant === 0 && p.speed >= 1.2) {
          const c = clips.celebrate(0, 0, 0);
          const n = neutralPose();
          n.armOutL = n.armOutR = c.armOutL;
          n.elbowL = n.elbowR = 0.1;
          return n;
        }
        return null;
      default:
        break;
    }
    if (p.holdingBall) return clips.holdBall(holdingOverhead);
    if (p.role === 'GK' && p.speed < 2 && p.action === 'none') return clips.locomotion(0, 0, true, 0);
    return null;
  }

  update(dt: number, p: Player, holdingOverhead: boolean, ctx: AnimContext, at?: { x: number; z: number; facing: number }): void {
    // A dribble cut, first touch or turn from the simulation: play the matching GRF touch animation
    if (p.touchEvent) this.chooser.touch(p);
    this.chooser.tick(dt, p);
    const clipWant = this.chooser.want(p, ctx);
    const procWant = clipWant ? null : this.wantedProc(p, holdingOverhead);
    // a new action restarts its clip even when the same clip is picked again
    const restarted = p.action !== 'none' && p.actionT < this.lastActionT;
    this.lastActionT = p.actionT;

    // --- One-shot clips with smooth (eased) crossfades
    if (clipWant && (clipWant.name !== this.oneShotName || restarted)) {
      const a = this.actions.get(clipWant.name);
      if (a) {
        if (this.oneShot) this.fading.push({ action: this.oneShot, w: this.oneShotW });
        a.reset();
        a.setLoop(clipWant.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
        a.clampWhenFinished = true;
        a.time = Math.max(0, clipWant.start);
        a.timeScale = clipWant.scale;
        a.play();
        // when cutting from another one-shot keep full weight (the old one fades under it)
        this.oneShotW = this.oneShot ? 1 : this.oneShotW;
        this.oneShot = a;
        this.oneShotName = clipWant.name;
        this.fadeIn = clipWant.fade;
      }
    }
    if (!clipWant && this.oneShot) {
      this.fading.push({ action: this.oneShot, w: this.oneShotW });
      this.oneShot = null;
      this.oneShotName = '';
      this.oneShotW = 0;
    }
    if (this.oneShot) this.oneShotW = Math.min(1, this.oneShotW + dt / this.fadeIn);
    for (const f of this.fading) f.w -= dt / 0.22;
    this.fading = this.fading.filter((f) => {
      if (f.w <= 0) {
        f.action.setEffectiveWeight(0);
        f.action.stop();
        return false;
      }
      return true;
    });
    const ease = (x: number) => x * x * (3 - 2 * x);
    const shotW = ease(this.oneShotW);
    const fadeSum = this.fading.reduce((sum, f) => sum + ease(f.w), 0);
    const clipTotal = Math.min(1, shotW + fadeSum);

    // --- Procedural layer weight
    const procTarget = procWant ? 1 : 0;
    this.procW += (procTarget - this.procW) * (1 - Math.exp(-dt * 16));
    if (procWant) for (const k of POSE_KEYS) this.proc[k] += (procWant[k] - this.proc[k]) * (1 - Math.exp(-dt * 24));

    // --- Locomotion blend (speed + direction relative to facing)
    const sp = p.speed * (1 - this.procW * 0.85);
    const fx = Math.sin(p.facing);
    const fz = Math.cos(p.facing);
    const vf = (p.vel.x * fx + p.vel.z * fz) / Math.max(p.speed, 1e-3);
    const vl = (p.vel.x * fz - p.vel.z * fx) / Math.max(p.speed, 1e-3); // + = toward character left
    const w: Record<string, number> = { Idle_Loop: 0, Walk_Loop: 0, Jog_Fwd_Loop: 0, Sprint_Loop: 0, Jog_Left_Loop: 0, Jog_Right_Loop: 0, Jog_Bwd_Loop: 0 };
    const moving = Math.min(1, sp / 0.6);
    w.Idle_Loop = 1 - moving;
    const fwdW = Math.max(0, vf) ** 2;
    const sideW = 1 - fwdW;
    // Forward gait blend
    let wWalk = 0;
    let wJog = 0;
    let wSprint = 0;
    if (sp < 2.4) wWalk = 1;
    else if (sp < 4.6) {
      const t = (sp - 2.4) / 2.2;
      wWalk = 1 - t;
      wJog = t;
    } else {
      const t = Math.min(1, (sp - 4.6) / 2.6);
      wJog = 1 - t;
      wSprint = t;
    }
    w.Walk_Loop = moving * fwdW * wWalk;
    w.Jog_Fwd_Loop = moving * fwdW * wJog;
    w.Sprint_Loop = moving * fwdW * wSprint;
    if (sideW > 0.01) {
      const l = Math.max(0, vl);
      const r = Math.max(0, -vl);
      const b = Math.max(0, -vf);
      const tot = l + r + b || 1;
      w.Jog_Left_Loop = moving * sideW * (l / tot);
      w.Jog_Right_Loop = moving * sideW * (r / tot);
      w.Jog_Bwd_Loop = moving * sideW * (b / tot);
    }
    // Stride: metres per gait cycle grows with speed; keeps feet planted
    const cycleLen = sp < 2.4 ? 1.9 + sp * 0.05 : sp < 4.6 ? 2.0 + (sp - 2.4) * 0.95 : 4.1 + (sp - 4.6) * 0.38;
    this.phase = (this.phase + (Math.max(sp, 0.0) / cycleLen) * dt) % 1;
    const locoScale = 1 - clipTotal;
    for (const n of LOCO) {
      const a = this.actions.get(n)!;
      const d = a.getClip().duration;
      a.time = n === 'Idle_Loop' ? (a.time + dt) % d : this.phase * d;
      a.setEffectiveWeight(w[n] * locoScale);
    }
    const norm = Math.max(1, shotW + fadeSum);
    if (this.oneShot) this.oneShot.setEffectiveWeight(shotW / norm);
    for (const f of this.fading) f.action.setEffectiveWeight(ease(f.w) / norm);

    this.mixer.update(dt);

    // --- Root placement
    const root = this.m.root;
    root.position.set(at ? at.x : p.pos.x, 0, at ? at.z : p.pos.z);
    root.rotation.set(0, at ? at.facing : p.facing, 0);
    this.m.model.position.y = (this.proc.hipY - BASE_HIP) * this.procW;
    root.updateMatrixWorld(true);
    root.getWorldQuaternion(this.charQuat);

    // --- Procedural offsets on bones (parents first)
    if (this.procW > 0.01) this.applyProc(this.procW);

    // --- Head tracks the ball when not in a full-body clip
    const lookW = (1 - clipTotal) * (p.action === 'dive' ? 0 : 1);
    if (lookW > 0.01) {
      const dx = ctx.ball.x - p.pos.x;
      const dz = ctx.ball.z - p.pos.z;
      let yaw = Math.atan2(dx, dz) - p.facing;
      yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
      yaw = Math.max(-1.1, Math.min(1.1, yaw));
      this.lookYaw += (yaw - this.lookYaw) * (1 - Math.exp(-dt * 6));
      const neck = this.bone('neck_01');
      const head = this.bone('Head');
      if (neck) this.rot(neck, U, this.lookYaw * 0.4 * lookW);
      if (head) this.rot(head, U, this.lookYaw * 0.5 * lookW);
    }

    // --- Ground contact: no floating or sinking feet (full fix in locomotion, sinking only in one-shots)
    const airborne = p.action === 'header' || p.action === 'dive' || p.action === 'tackle' || p.action === 'stumble' || p.action === 'celebrate';
    const floatFix = airborne ? 0 : (1 - clipTotal) * (1 - this.procW);
    this.m.model.position.y += this.planter.solve(dt, root, 0, floatFix);
  }

  private applyProc(k: number): void {
    const d = (key: keyof Pose) => (this.proc[key] - NEUTRAL[key]) * k;
    const b = (n: string) => this.bone(n);
    const pelvis = b('pelvis');
    if (pelvis) this.rot(pelvis, F, -d('roll'));
    const s1 = b('spine_01');
    const s2 = b('spine_02');
    if (s1) {
      this.rot(s1, R, -d('pitch') * 0.5);
      this.rot(s1, U, d('twist') * 0.5);
    }
    if (s2) {
      this.rot(s2, R, -d('pitch') * 0.5);
      this.rot(s2, U, d('twist') * 0.5);
    }
    const head = b('Head');
    if (head) this.rot(head, R, -d('head'));
    const ul = b('upperarm_l');
    const ur = b('upperarm_r');
    if (ul) {
      this.rot(ul, F, d('armOutL'));
      this.rot(ul, R, d('armL'));
    }
    if (ur) {
      this.rot(ur, F, -d('armOutR'));
      this.rot(ur, R, d('armR'));
    }
    const ll = b('lowerarm_l');
    const lr = b('lowerarm_r');
    if (ll) this.rot(ll, R, d('elbowL'));
    if (lr) this.rot(lr, R, d('elbowR'));
    const tl = b('thigh_l');
    const tr = b('thigh_r');
    if (tl) {
      this.rot(tl, F, d('thighOutL'));
      this.rot(tl, R, d('thighL'));
    }
    if (tr) {
      this.rot(tr, F, -d('thighOutR'));
      this.rot(tr, R, d('thighR'));
    }
    const cl = b('calf_l');
    const cr = b('calf_r');
    if (cl) this.rot(cl, R, -d('kneeL'));
    if (cr) this.rot(cr, R, -d('kneeR'));
    const fl = b('foot_l');
    const fr = b('foot_r');
    if (fl) this.rot(fl, R, d('footL'));
    if (fr) this.rot(fr, R, d('footR'));
  }

  /** Rotate a bone about an axis given in character space, after the clip pose. */
  private rot(bone: THREE.Bone, axisChar: THREE.Vector3, angle: number): void {
    if (Math.abs(angle) < 1e-4 || !bone.parent) return;
    _axis.copy(axisChar).applyQuaternion(this.charQuat).normalize();
    bone.getWorldQuaternion(_qw);
    _q.setFromAxisAngle(_axis, angle);
    _qw.premultiply(_q);
    bone.parent.getWorldQuaternion(_qp).invert();
    bone.quaternion.copy(_qp.multiply(_qw));
    bone.updateMatrixWorld(true);
    void _v;
  }
}
