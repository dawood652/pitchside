// A pose is a set of joint angles (radians) plus root offsets. Animations produce target poses;
// the rig blends toward them every frame so transitions never snap.

export interface Pose {
  hipY: number; // hip height above ground
  pitch: number; // body lean forward (+) / back (-)
  roll: number; // body lean right (+) / left (-)
  twist: number; // upper body yaw
  thighL: number; // forward swing (+)
  thighR: number;
  thighOutL: number; // sideways (abduction, +out)
  thighOutR: number;
  kneeL: number; // bend (+)
  kneeR: number;
  footL: number;
  footR: number;
  armL: number; // forward swing (+)
  armR: number;
  armOutL: number; // raise sideways (+out)
  armOutR: number;
  elbowL: number; // bend (+)
  elbowR: number;
  head: number; // nod forward (+)
}

export const BASE_HIP = 0.98;

export function neutralPose(): Pose {
  return {
    hipY: BASE_HIP,
    pitch: 0.04,
    roll: 0,
    twist: 0,
    thighL: 0,
    thighR: 0,
    thighOutL: 0.03,
    thighOutR: 0.03,
    kneeL: 0.08,
    kneeR: 0.08,
    footL: 0,
    footR: 0,
    armL: 0,
    armR: 0,
    armOutL: 0.12,
    armOutR: 0.12,
    elbowL: 0.25,
    elbowR: 0.25,
    head: 0,
  };
}

export const POSE_KEYS = Object.keys(neutralPose()) as (keyof Pose)[];

export function blendInto(cur: Pose, target: Pose, t: number): void {
  for (const k of POSE_KEYS) cur[k] += (target[k] - cur[k]) * t;
}

export function mix(a: Pose, b: Pose, t: number): Pose {
  const out = { ...a };
  for (const k of POSE_KEYS) out[k] = a[k] + (b[k] - a[k]) * t;
  return out;
}

/** Piecewise-linear keyframe track sampler: keys = [[time, value], ...] (time 0..1). */
export function track(keys: [number, number][], t: number): number {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const [t0, v0] = keys[i - 1];
      const [t1, v1] = keys[i];
      const u = (t - t0) / (t1 - t0);
      const s = u * u * (3 - 2 * u); // smoothstep
      return v0 + (v1 - v0) * s;
    }
  }
  return keys[keys.length - 1][1];
}
