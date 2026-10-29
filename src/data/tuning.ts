// All gameplay tuning numbers live here.

export const PITCH = {
  length: 105,
  width: 68,
  halfL: 52.5,
  halfW: 34,
  goalHalfWidth: 3.66,
  goalHeight: 2.44,
  goalDepth: 2.2,
  postRadius: 0.06,
  boxDepth: 16.5,
  boxHalfWidth: 20.16,
  sixDepth: 5.5,
  sixHalfWidth: 9.16,
  penaltySpot: 11,
  centreRadius: 9.15,
};

export const BALL = {
  radius: 0.11,
  gravity: 9.81,
  drag: 0.0125, // a = -drag * |v| * v
  magnus: 0.0009, // curve strength per unit of spin
  spinDecay: 0.6, // per second
  restitution: 0.58,
  groundFriction: 0.32, // horizontal speed kept per bounce impact (tangential loss)
  rollDecel: 1.6, // m/s^2 when rolling
  rollDragExtra: 0.06, // extra proportional decel while rolling
};

export const PLAYER = {
  jogSpeed: 5.6,
  sprintSpeed: 8.2,
  dribbleJog: 5.0,
  dribbleSprint: 7.1,
  accel: 14,
  turnRate: 11, // rad/s
  controlRadius: 0.95,
  controlMaxBallHeight: 0.9,
  headerMinHeight: 1.25,
  headerMaxHeight: 2.6,
  tackleRange: 1.5,
  tackleCooldown: 0.9,
  separation: 1.1,
};

export const KICK = {
  passEndSpeed: 4.0,
  passMax: 30,
  passMin: 9,
  throughLead: 7,
  shotMin: 14,
  shotMax: 32,
  chargeTime: 0.9,
  lobAngle: 0.62,
  touchLockout: 0.28, // seconds after a kick before the kicker can retouch
};

export const KEEPER = {
  reach: 1.05,
  diveRange: 2.9,
  reaction: 0.18,
  holdTime: 1.4,
};

export const MATCH = {
  defaultHalfSeconds: 180,
  goalCelebration: 4.2,
  restartDelay: 1.1,
  restartAutoTake: 4.5,
};
