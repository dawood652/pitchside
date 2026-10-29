// Procedural animation clips. Each returns a target pose for a normalised time or locomotion phase.

import { BASE_HIP, neutralPose, Pose, track } from './pose';

export type ActionKind =
  | 'none'
  | 'pass'
  | 'shot'
  | 'lob'
  | 'tackle'
  | 'header'
  | 'celebrate'
  | 'dive'
  | 'catch'
  | 'throwin'
  | 'gkthrow'
  | 'stumble';

/** Idle → jog → sprint blend driven by speed (m/s) and stride phase (radians). */
export function locomotion(speed: number, phase: number, keeperReady: boolean, t: number): Pose {
  const p = neutralPose();
  const a = Math.min(1, speed / 8.2); // 0 idle .. 1 full sprint
  const breathe = Math.sin(t * 2.2) * 0.015;
  if (keeperReady && speed < 1.5) {
    p.hipY = BASE_HIP - 0.16;
    p.pitch = 0.32;
    p.kneeL = p.kneeR = 0.65;
    p.thighL = p.thighR = 0.42;
    p.thighOutL = p.thighOutR = 0.16;
    p.armL = p.armR = 0.5;
    p.armOutL = p.armOutR = 0.55;
    p.elbowL = p.elbowR = 0.7;
    p.head = -0.25;
    const sh = Math.sin(phase) * 0.12 * Math.min(1, speed);
    p.thighOutL += sh;
    p.thighOutR -= sh;
    return p;
  }
  if (a < 0.04) {
    p.pitch += breathe;
    p.armOutL += breathe;
    p.armOutR += breathe;
    return p;
  }
  const s = Math.sin(phase);
  const c = Math.cos(phase);
  const swing = 0.35 + 0.65 * a;
  p.thighL = s * 0.85 * swing + 0.12 * a;
  p.thighR = -s * 0.85 * swing + 0.12 * a;
  // Knee bends most while the leg recovers forward
  p.kneeL = 0.2 + swing * (0.55 + 0.75 * Math.max(0, Math.sin(phase - 1.2)));
  p.kneeR = 0.2 + swing * (0.55 + 0.75 * Math.max(0, Math.sin(phase + Math.PI - 1.2)));
  p.footL = -0.2 * c * swing;
  p.footR = 0.2 * c * swing;
  p.armL = -s * 0.75 * swing;
  p.armR = s * 0.75 * swing;
  p.elbowL = p.elbowR = 0.9 + 0.5 * a;
  p.armOutL = p.armOutR = 0.1;
  p.pitch = 0.06 + 0.2 * a;
  p.twist = s * 0.12 * swing;
  p.hipY = BASE_HIP - 0.03 * a + Math.abs(Math.sin(phase)) * 0.05 * swing;
  p.head = -0.1 * a;
  return p;
}

/** Right-footed kick: wind-up, strike (contact at t≈0.42), follow-through. */
export function kick(t: number, power: number, lofted: boolean): Pose {
  const p = neutralPose();
  const back = -0.45 - 0.55 * power;
  const through = 0.9 + 0.7 * power + (lofted ? 0.3 : 0);
  p.thighR = track([[0, 0], [0.3, back], [0.42, 0.2], [0.6, through], [1, 0.1]], t);
  p.kneeR = track([[0, 0.2], [0.3, 1.5], [0.42, 0.5], [0.6, 0.15], [1, 0.15]], t);
  p.footR = track([[0, 0], [0.3, 0.4], [0.5, -0.3], [1, 0]], t);
  p.thighL = track([[0, 0.1], [0.3, 0.25], [0.6, -0.1], [1, 0]], t);
  p.kneeL = track([[0, 0.15], [0.3, 0.45], [0.6, 0.3], [1, 0.1]], t);
  p.armOutL = track([[0, 0.2], [0.3, 1.1], [0.6, 0.9], [1, 0.2]], t);
  p.armOutR = track([[0, 0.2], [0.3, 0.6], [0.6, 0.4], [1, 0.2]], t);
  p.armL = track([[0, 0], [0.3, 0.5], [0.6, -0.3], [1, 0]], t);
  p.armR = track([[0, 0], [0.3, -0.5], [0.6, 0.5], [1, 0]], t);
  p.pitch = track([[0, 0.1], [0.3, lofted ? -0.12 : 0.05], [0.5, lofted ? -0.2 : 0.12], [1, 0.08]], t);
  p.twist = track([[0, 0], [0.3, -0.35], [0.6, 0.3], [1, 0]], t);
  p.roll = track([[0, 0], [0.3, -0.12], [0.6, -0.05], [1, 0]], t);
  p.hipY = BASE_HIP - track([[0, 0], [0.4, 0.07], [1, 0]], t);
  return p;
}

/** Sliding tackle: drop to the ground leading with the right leg. */
export function tackle(t: number): Pose {
  const p = neutralPose();
  p.hipY = track([[0, BASE_HIP], [0.2, 0.42], [0.75, 0.32], [1, BASE_HIP]], t);
  p.pitch = track([[0, 0.1], [0.2, -0.9], [0.75, -1.0], [1, 0.1]], t);
  p.thighR = track([[0, 0], [0.2, 1.45], [0.75, 1.45], [1, 0]], t);
  p.kneeR = track([[0, 0.2], [0.2, 0.15], [0.75, 0.15], [1, 0.2]], t);
  p.thighL = track([[0, 0], [0.2, 0.9], [0.75, 0.9], [1, 0]], t);
  p.kneeL = track([[0, 0.2], [0.2, 1.7], [0.75, 1.7], [1, 0.2]], t);
  p.armOutL = track([[0, 0.1], [0.2, 0.9], [0.75, 0.9], [1, 0.1]], t);
  p.armOutR = track([[0, 0.1], [0.2, 0.7], [0.75, 0.7], [1, 0.1]], t);
  p.armL = p.armR = track([[0, 0], [0.2, -0.6], [0.75, -0.7], [1, 0]], t);
  p.roll = track([[0, 0], [0.2, 0.2], [0.75, 0.25], [1, 0]], t);
  return p;
}

export function header(t: number): Pose {
  const p = neutralPose();
  const jump = Math.sin(Math.PI * Math.min(1, t)) * 0.45;
  p.hipY = BASE_HIP + jump;
  p.kneeL = p.kneeR = 0.3 + jump * 1.6;
  p.thighL = 0.2 + jump * 0.6;
  p.thighR = jump * 0.3;
  p.armOutL = p.armOutR = 0.7;
  p.armL = p.armR = 0.4;
  p.elbowL = p.elbowR = 1.2;
  p.pitch = track([[0, 0], [0.4, -0.35], [0.55, 0.35], [1, 0.05]], t);
  p.head = track([[0, 0], [0.4, -0.5], [0.55, 0.6], [1, 0]], t);
  return p;
}

/** Celebrations: 0 = airplane run, 1 = jump and fist pump, 2 = knee slide with arms up. */
export function celebrate(t: number, variant: number, phase: number): Pose {
  if (variant === 0) {
    const p = locomotionLike(phase, 0.75);
    p.armOutL = p.armOutR = 1.45;
    p.armL = p.armR = 0;
    p.elbowL = p.elbowR = 0.1;
    p.roll = Math.sin(phase * 0.25) * 0.3;
    p.head = -0.25;
    return p;
  }
  if (variant === 1) {
    const p = neutralPose();
    const cyc = (t * 3) % 1;
    const j = Math.sin(Math.PI * cyc) * 0.35;
    p.hipY = BASE_HIP + j;
    p.kneeL = p.kneeR = 0.25 + j * 1.5;
    p.thighL = p.thighR = j * 0.8;
    p.armR = 2.9;
    p.armOutR = 0.25;
    p.elbowR = 0.3 + j;
    p.armOutL = 0.6;
    p.elbowL = 1.4;
    p.head = -0.35;
    return p;
  }
  const p = neutralPose();
  p.hipY = track([[0, BASE_HIP], [0.15, 0.55], [1, 0.55]], t);
  p.thighL = p.thighR = track([[0, 0], [0.15, -0.15], [1, -0.15]], t);
  p.kneeL = p.kneeR = track([[0, 0.2], [0.15, 1.9], [1, 1.9]], t);
  p.pitch = track([[0, 0], [0.15, -0.35], [1, -0.4]], t);
  p.armOutL = p.armOutR = track([[0, 0.2], [0.15, 2.2], [1, 2.4]], t);
  p.elbowL = p.elbowR = 0.2;
  p.head = -0.5;
  return p;
}

function locomotionLike(phase: number, a: number): Pose {
  return locomotion(a * 8.2, phase, false, 0);
}

/** Keeper dive toward side dir (+1 = keeper's left, -1 = right in local space). */
export function dive(t: number, dir: number, high: number): Pose {
  const p = neutralPose();
  p.hipY = track([[0, BASE_HIP - 0.12], [0.25, BASE_HIP + 0.1 + high * 0.35], [0.6, 0.35 + high * 0.2], [1, 0.25]], t);
  p.roll = dir * track([[0, 0], [0.3, 1.0], [0.6, 1.45], [1, 1.5]], t);
  p.armOutL = dir > 0 ? track([[0, 0.5], [0.3, 2.9], [1, 2.8]], t) : track([[0, 0.5], [0.3, 2.2], [1, 2.0]], t);
  p.armOutR = dir < 0 ? track([[0, 0.5], [0.3, 2.9], [1, 2.8]], t) : track([[0, 0.5], [0.3, 2.2], [1, 2.0]], t);
  p.elbowL = p.elbowR = 0.15;
  p.thighOutL = dir > 0 ? 0.1 : 0.4;
  p.thighOutR = dir < 0 ? 0.1 : 0.4;
  p.kneeL = p.kneeR = 0.3;
  p.thighL = 0.3;
  p.head = -0.2;
  return p;
}

export function catchPose(t: number): Pose {
  const p = neutralPose();
  p.armL = p.armR = track([[0, 0.5], [0.3, 1.35], [1, 0.9]], t);
  p.elbowL = p.elbowR = track([[0, 0.5], [0.3, 0.5], [1, 1.6]], t);
  p.armOutL = p.armOutR = track([[0, 0.3], [0.3, 0.1], [1, -0.15]], t);
  p.pitch = 0.25;
  p.kneeL = p.kneeR = 0.4;
  p.thighL = p.thighR = 0.25;
  p.hipY = BASE_HIP - 0.08;
  return p;
}

/** Holding the ball with both hands at the chest (keeper with ball / thrower waiting). */
export function holdBall(overhead: boolean): Pose {
  const p = neutralPose();
  if (overhead) {
    p.armL = p.armR = 2.7;
    p.elbowL = p.elbowR = 1.0;
    p.armOutL = p.armOutR = 0.15;
    p.pitch = -0.1;
    return p;
  }
  p.armL = p.armR = 0.9;
  p.elbowL = p.elbowR = 1.7;
  p.armOutL = p.armOutR = -0.1;
  return p;
}

/** Two-handed overhead throw (throw-ins, keeper throws). */
export function throwBall(t: number): Pose {
  const p = neutralPose();
  p.armL = p.armR = track([[0, 2.7], [0.35, 3.0], [0.6, 1.4], [1, 0.4]], t);
  p.elbowL = p.elbowR = track([[0, 1.0], [0.35, 1.6], [0.6, 0.2], [1, 0.3]], t);
  p.pitch = track([[0, -0.1], [0.35, -0.35], [0.6, 0.35], [1, 0.1]], t);
  p.thighL = 0.35;
  p.kneeL = 0.3;
  return p;
}

export function stumble(t: number): Pose {
  const p = neutralPose();
  p.pitch = track([[0, 0.1], [0.4, 0.55], [1, 0.1]], t);
  p.armL = p.armR = track([[0, 0], [0.4, 0.9], [1, 0]], t);
  p.armOutL = p.armOutR = 0.6;
  p.kneeL = p.kneeR = 0.5;
  p.hipY = BASE_HIP - 0.12;
  return p;
}
