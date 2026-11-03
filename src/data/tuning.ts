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
  controlRadius: 1.15,
  controlMaxBallHeight: 0.9,
  headerMinHeight: 1.25,
  headerMaxHeight: 2.6,
  tackleRange: 1.5,
  tackleCooldown: 0.9,
  separation: 1.1,
};

/** Movement model after GRF humanoidbase.cpp: speed-dependent acceleration, quick braking, max cornering. */
export const MOVE = {
  accel: 17, // m/s² from standstill; falls off toward top speed ("air resistance")
  accelFalloffExp: 1.8,
  accelFloor: 0.14, // share of accel left right at top speed
  decel: 21, // braking m/s²
  cornerMinSpeed: 1.8, // below this a player can turn on the spot
  cornerRate: Math.PI * 1.2, // rad/s at full sprint (GRF: π with the ball, 1.5π without; a bit quicker for pad play)
  cornerNoBall: 1.5,
  cornerBrake: 3, // over-angle (share of π) times this = share of speed lost
  refSprint: 8,
};

/** Balls in the air: anticipated headers, chest/thigh traps. */
export const AERIAL = {
  headerLead: 0.36, // seconds ahead a player commits to a header (clip contact ~0.2-0.5 s)
  headerReach: 1.05, // m from the predicted body position
  chestMax: 1.6, // highest ball a player can kill on the chest
  chestMaxSpeed: 17,
};

/** Shot blocks and shoulder-to-shoulder challenges (GRF interfere / trip animations). */
export const CONTEST = {
  blockReach: 1.35, // m from a defender to the shot's line
  blockWindow: [0.06, 0.32] as const, // s before the ball passes
  blockChance: 0.8,
  shoulderRange: 0.95,
  shoulderRate: 0.55, // attempts per second while side by side
  shoulderMinSpeed: 2.6,
};

/** Outfield AI (GRF-style passing lanes and pressing). */
export const AI = {
  reaction: 0.3, // s before a defender reacts to a pass
  runSpeed: 6, // m/s a defender closes at (from a standing start)
  interceptReach: 0.8, // m a defender can stretch
  laneSamples: 6,
  kickDelay: 0.25, // s of wind-up before the ball leaves the foot
  tackleWhenLoose: 2, // pressing tackle rate multiplier while the ball is away from the carrier's feet
  tackleWhenTight: 0.6,
  coverDepth: 6, // m the second defender sits behind the presser
};

export const KICK = {
  passEndSpeed: 8, // ground passes still arrive firmly
  passChargeTime: 0.6, // seconds of holding for a full-power pass
  passMax: 30,
  passMin: 13,
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
