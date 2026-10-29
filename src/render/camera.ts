// Camera rig: six FC-style cameras with Height and Zoom, plus celebration and free (replay) shots.

import * as THREE from 'three';
import { PITCH } from '../data/tuning';
import { clamp } from '../core/vec';
import { CamType } from '../ui/settings';

export type CamMode = 'play' | 'celebrate';

export interface CamInput {
  ball: THREE.Vector3;
  ballVel: THREE.Vector3;
  player: THREE.Vector3; // controlled player
  playerFacing: number;
  attackDir: number; // human team's attack direction
  subject?: THREE.Vector3; // scorer when celebrating
}

export class BroadcastCamera {
  mode: CamMode = 'play';
  type: CamType = 'tele';
  height = 10;
  zoom = 4;
  private focus = new THREE.Vector3();
  private pos = new THREE.Vector3(0, 30, 70);
  private look = new THREE.Vector3();
  private proYaw = 0;

  constructor(private cam: THREE.PerspectiveCamera) {}

  snap(target: THREE.Vector3): void {
    this.focus.copy(target);
    this.look.copy(target);
  }

  /** Free camera shot (replays). */
  shot(dt: number, pos: THREE.Vector3, look: THREE.Vector3, cut = false): void {
    const k = cut ? 1 : 1 - Math.exp(-dt * 5);
    this.pos.lerp(pos, k);
    this.look.lerp(look, cut ? 1 : 1 - Math.exp(-dt * 8));
    this.setFov(dt, 34);
    this.cam.position.copy(this.pos);
    this.cam.lookAt(this.look);
  }

  private setFov(dt: number, fov: number): void {
    const f = this.cam.fov + (fov - this.cam.fov) * (1 - Math.exp(-dt * 4));
    if (Math.abs(f - this.cam.fov) > 0.01) {
      this.cam.fov = f;
      this.cam.updateProjectionMatrix();
    }
  }

  update(dt: number, inp: CamInput): void {
    // Focus leads the ball slightly in its direction of travel
    const lead = new THREE.Vector3(inp.ballVel.x, 0, inp.ballVel.z).multiplyScalar(0.25);
    const target = this.mode === 'celebrate' && inp.subject ? inp.subject : inp.ball.clone().add(lead);
    target.y = 0;
    this.focus.lerp(target, 1 - Math.exp(-dt * 3.4));
    const f = this.focus;
    const h = this.height / 20; // 0..1
    const z = this.zoom / 20; // 0..1 (1 = closest)
    const narrow = this.cam.aspect < 1.2 ? 1.35 : 1;
    let want: THREE.Vector3;
    let look: THREE.Vector3;
    let fov = 30;
    const cx = clamp(f.x, -PITCH.halfL, PITCH.halfL);
    const cz = clamp(f.z, -PITCH.halfW, PITCH.halfW);

    if (this.mode === 'celebrate') {
      want = new THREE.Vector3(f.x * 0.98, 5.5, f.z + 13);
      look = new THREE.Vector3(f.x, 1.2, f.z);
      fov = 34;
    } else {
      switch (this.type) {
        case 'coop': {
          const d = (52 - z * 18) * narrow;
          want = new THREE.Vector3(clamp(cx * 0.85, -40, 40), 26 + h * 16, PITCH.halfW + d * 0.6);
          look = new THREE.Vector3(cx * 0.95, 0, cz * 0.45 - 3);
          fov = 32;
          break;
        }
        case 'dynamic': {
          const d = (24 - z * 9) * narrow;
          want = new THREE.Vector3(cx * 0.96, 7 + h * 8, cz + d);
          look = new THREE.Vector3(cx, 0.6, cz - 1.5);
          fov = 40;
          break;
        }
        case 'endtoend': {
          const dir = inp.attackDir;
          const back = (26 - z * 10) * narrow;
          want = new THREE.Vector3(cx - dir * back, 11 + h * 10, cz * 0.8);
          look = new THREE.Vector3(cx + dir * 12, 0, cz * 0.9);
          fov = 50;
          break;
        }
        case 'pro': {
          // Behind the controlled player, smoothing his facing so the view doesn't whip around
          let d = inp.playerFacing - this.proYaw;
          d = Math.atan2(Math.sin(d), Math.cos(d));
          this.proYaw += d * (1 - Math.exp(-dt * 2.5));
          const fx = Math.sin(this.proYaw);
          const fz = Math.cos(this.proYaw);
          const back = 9 - z * 4;
          want = new THREE.Vector3(inp.player.x - fx * back, 3.2 + h * 4, inp.player.z - fz * back);
          look = new THREE.Vector3(inp.player.x + fx * 10, 1, inp.player.z + fz * 10);
          fov = 58;
          break;
        }
        case 'broadcast': {
          want = new THREE.Vector3(0, 24 + h * 14, PITCH.halfW + 52);
          look = new THREE.Vector3(cx, 0, cz * 0.7);
          fov = (24 - z * 10) * narrow;
          break;
        }
        default: {
          // Tele Broadcast: mid-range side view that keeps the far side visible
          const d = (40 - z * 16) * narrow;
          const nearSide = cz > 0 ? cz * 0.12 : cz * 0.22;
          want = new THREE.Vector3(clamp(cx * 0.9, -PITCH.halfL + 6, PITCH.halfL - 6), 12 + h * 14, PITCH.halfW + (d - nearSide) * 0.6);
          look = new THREE.Vector3(cx * 0.97, 0, cz * 0.6 - 1.5);
          fov = 30;
        }
      }
    }
    const k = 1 - Math.exp(-dt * (this.type === 'pro' ? 5 : 3.2));
    this.pos.lerp(want, k);
    this.look.lerp(look, 1 - Math.exp(-dt * 6));
    this.setFov(dt, fov);
    this.cam.position.copy(this.pos);
    this.cam.lookAt(this.look);
  }
}
