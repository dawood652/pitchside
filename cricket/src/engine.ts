// Cricket rules and physics, independent of rendering (unit-tested).
// Units: metres, seconds. Batter's crease at z = 0, bowler's end at z = PITCH_LEN.
// x: + = off side for a right-hander (to the batter's right as he faces the bowler... we keep it
// simple: + = right of screen). Field angles: 0 = straight back past the bowler, + = toward +x.

export const PITCH_LEN = 20.12;
export const BOUNDARY = 62;
export const RUN_TIME = 2.9; // seconds per run between the wickets

export type Length = 'yorker' | 'full' | 'good' | 'short' | 'bouncer';
export interface Delivery {
  speed: number; // m/s
  line: number; // x where the ball reaches the batter (stumps span -0.11..0.11)
  bounceZ: number; // distance from the batter where it pitches
  swing: number; // lateral drift (m) added over the flight
  length: Length;
  arriveH: number; // ball height (m) when it reaches the batter
}

export interface Fielder {
  x: number;
  z: number;
  name: string;
}

export interface Shot {
  angle: number; // radians, field direction the batter aims (0 = straight)
  loft: boolean;
  defend: boolean;
}

export type Outcome =
  | { kind: 'miss'; wicket: 'bowled' | 'lbw' | null }
  | { kind: 'edge'; caught: boolean }
  | { kind: 'hit'; exitAngle: number; speed: number; loft: boolean; timing: number };

export interface BallFlight {
  // positions of the hit ball in field coordinates (x across, z up the ground), sampled
  path: { t: number; x: number; z: number; h: number }[];
  result: { runs: number; out: 'caught' | null; boundary: 4 | 6 | null; fielder: number | null; endT: number };
}

export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

/** Bowler chooses a delivery; difficulty 0..2 raises pace and variety. */
export function makeDelivery(r: () => number, difficulty: number, ballNo: number): Delivery {
  const pace = 30 + difficulty * 3.2 + r() * 6 + Math.min(4, ballNo * 0.15); // 108..150 km/h
  const roll = r();
  const length: Length = roll < 0.12 ? 'yorker' : roll < 0.38 ? 'full' : roll < 0.72 ? 'good' : roll < 0.9 ? 'short' : 'bouncer';
  const bounceZ = { yorker: 0.6, full: 3.0, good: 5.5, short: 8.5, bouncer: 10.5 }[length] + (r() - 0.5) * 1.2;
  const arriveH = { yorker: 0.12, full: 0.55, good: 0.8, short: 1.15, bouncer: 1.7 }[length] + (r() - 0.5) * 0.15;
  const line = (r() - 0.45) * 0.7; // mostly on or just outside off
  const swing = (r() - 0.5) * (0.25 + difficulty * 0.15);
  return { speed: pace, line, bounceZ, swing, length, arriveH };
}

/** Time from release to the ball reaching the batter's crease. */
export function flightTime(d: Delivery): number {
  return (PITCH_LEN - 1.2) / d.speed + 0.04 * (d.bounceZ > 2 ? 1 : 0);
}

/** Ball position on its way to the batter, t seconds after release. */
export function deliveryPos(d: Delivery, t: number): { x: number; y: number; z: number } {
  const T = flightTime(d);
  const u = Math.min(1.15, t / T);
  const z = PITCH_LEN - 1.2 - (PITCH_LEN - 1.2) * u;
  const startX = 0.35;
  const x = startX + (d.line - startX) * u + d.swing * u * u;
  const relH = 2.2;
  const zb = d.bounceZ;
  let y: number;
  if (z > zb) {
    const k = (PITCH_LEN - 1.2 - z) / (PITCH_LEN - 1.2 - zb);
    y = relH * (1 - k) + 0.02 * k - k * (1 - k) * 0.6; // dips onto the pitch
  } else {
    const k = zb <= 0.01 ? 1 : (zb - z) / zb;
    y = 0.02 + (d.arriveH - 0.02) * (2 * k - k * k * (zb < 1 ? 0 : 0.6)) / (zb < 1 ? 1 : 1.4);
  }
  return { x, y: Math.max(0.02, y), z };
}

/**
 * Resolve a swing. timing = swing time minus perfect time (s): negative = early.
 * Early shots go to the leg side (-x), late shots squirt to the off side (+x).
 */
export function resolveShot(d: Delivery, shot: Shot | null, timing: number, r: () => number): Outcome {
  const onStumps = Math.abs(d.line) < 0.13 && d.arriveH < 0.75;
  if (!shot) return { kind: 'miss', wicket: onStumps ? (d.length === 'yorker' || d.arriveH < 0.4 ? 'bowled' : r() < 0.55 ? 'lbw' : null) : null };
  const e = Math.abs(timing);
  const window = shot.defend ? 0.16 : 0.12;
  if (e > window * 1.6) return { kind: 'miss', wicket: onStumps ? (r() < 0.75 ? 'bowled' : 'lbw') : null };
  // playing across the line / hitting a bouncer flat raises the edge risk
  const across = Math.abs(Math.sin(shot.angle)) * (Math.abs(d.line) > 0.25 ? 0.25 : 0.08);
  const bounceRisk = d.length === 'bouncer' && !shot.loft ? 0.12 : 0;
  const edgeP = Math.max(0, (e - window * 0.45) / window) * 0.55 + across + bounceRisk;
  if (r() < edgeP) return { kind: 'edge', caught: r() < (shot.defend ? 0.25 : 0.45) };
  const quality = Math.max(0, 1 - e / window); // 1 = perfect
  if (shot.defend) return { kind: 'hit', exitAngle: shot.angle * 0.3 + timing * 4, speed: 6 + quality * 4, loft: false, timing };
  const exitAngle = shot.angle + timing * 5.5 + (r() - 0.5) * 0.18 * (1 - quality);
  // a mistimed loft balloons up for a catch; a middled one flies
  const speed = (shot.loft ? 15 : 19) + quality * (shot.loft ? 21 : 13) + d.speed * 0.12;
  return { kind: 'hit', exitAngle, speed, loft: shot.loft, timing };
}

const FIELDER_RUN = 6.8; // m/s
const REACH = 2.3; // m: how far a fielder can dive or reach for a ball

/** Fly the struck ball into the field and decide runs / catch / boundary. */
export function flyBall(o: Extract<Outcome, { kind: 'hit' }>, fielders: Fielder[], r: () => number): BallFlight {
  const path: BallFlight['path'] = [];
  const dx = Math.sin(o.exitAngle);
  const dz = Math.cos(o.exitAngle);
  // ground shots skid low; lofted shots climb 25-38 degrees
  const elev = o.loft ? 0.42 + r() * 0.2 : 0.08;
  let vh = o.speed * Math.cos(elev);
  let vy = o.speed * Math.sin(elev);
  let x = 0,
    z = 0,
    h = 0.6,
    t = 0,
    dist = 0;
  const dt = 1 / 30;
  let bounced = !o.loft;
  let firstLand: number | null = null;
  let catchBy: number | null = null;
  let stopBy: number | null = null;
  while (t < 9) {
    t += dt;
    if (h > 0) {
      // air drag (quadratic): a lofted hit needs to be middled to carry the rope
      const v = Math.hypot(vh, vy);
      const k = 1 - 0.013 * v * dt;
      vh *= k;
      vy *= k;
    }
    vy -= 9.81 * dt;
    h += vy * dt;
    if (h <= 0) {
      h = 0;
      if (firstLand === null) firstLand = dist;
      if (!bounced) vh *= 0.7; // a lofted ball loses pace when it lands
      vy = bounced ? 0 : -vy * 0.3;
      bounced = true;
    }
    if (h === 0) vh = Math.max(0, vh - 4.2 * dt); // outfield drag
    x += dx * vh * dt;
    z += dz * vh * dt;
    dist = Math.hypot(x, z);
    path.push({ t, x, z, h });
    // fielders: can someone get there in time?
    for (let i = 0; i < fielders.length; i++) {
      const f = fielders[i];
      const d = Math.hypot(f.x - x, f.z - z);
      const canReach = d - REACH <= FIELDER_RUN * Math.max(0, t - 0.35);
      if (!canReach) continue;
      if (h > 0.15 && h < 2.9 && !bounced) {
        catchBy = i;
        break;
      }
      // a ring fielder only stops a well-struck ground ball hit near him; slower balls he can chase down
      if (h < 1.2 && stopBy === null && (vh < 19 || d < 1.3)) stopBy = i;
    }
    if (catchBy !== null) break;
    if (stopBy !== null && vh < 30) break;
    if (dist >= BOUNDARY) break;
    if (vh < 0.5 && h === 0) break;
  }
  if (catchBy !== null) {
    const drop = r() < 0.12;
    if (!drop) return { path, result: { runs: 0, out: 'caught', boundary: null, fielder: catchBy, endT: t } };
  }
  if (dist >= BOUNDARY) {
    const six = firstLand === null;
    return { path, result: { runs: six ? 6 : 4, out: null, boundary: six ? 6 : 4, fielder: null, endT: t } };
  }
  // fielded: runs while the ball is chased and thrown back
  const f = stopBy !== null ? fielders[stopBy] : null;
  const throwBack = Math.hypot(x, z) / 26 + 0.6;
  const total = t + (f ? 0.5 : 1.5) + throwBack;
  const runs = Math.max(0, Math.min(3, Math.floor((total + 0.5) / RUN_TIME)));
  return { path, result: { runs, out: null, boundary: null, fielder: stopBy, endT: t } };
}

export function defaultField(aggressive: boolean): Fielder[] {
  const p = (name: string, deg: number, d: number): Fielder => ({ name, x: Math.sin((deg * Math.PI) / 180) * d, z: Math.cos((deg * Math.PI) / 180) * d });
  const ring = aggressive ? 0.8 : 1;
  return [
    p('Slip', 160, 18),
    p('Point', 95, 24 * ring),
    p('Cover', 60, 26 * ring),
    p('Mid-off', 18, 28 * ring),
    p('Mid-on', -18, 28 * ring),
    p('Midwicket', -60, 27 * ring),
    p('Square leg', -95, 24 * ring),
    p('Deep cover', 50, 55),
    p('Long-on', -25, 57),
    p('Fine leg', -150, 50),
  ];
}

export interface Innings {
  target: number;
  runs: number;
  wickets: number;
  maxWickets: number;
  balls: number;
  maxBalls: number;
  log: string[];
}

export function newInnings(overs: number, wickets: number, target: number): Innings {
  return { target, runs: 0, wickets: 0, maxWickets: wickets, balls: 0, maxBalls: overs * 6, log: [] };
}

export function record(inn: Innings, runs: number, out: boolean, note: string): void {
  inn.balls++;
  inn.runs += runs;
  if (out) inn.wickets++;
  inn.log.push(note);
}

export function status(inn: Innings): 'playing' | 'won' | 'lost' | 'tied' {
  if (inn.runs >= inn.target) return 'won';
  if (inn.wickets >= inn.maxWickets || inn.balls >= inn.maxBalls) return inn.runs === inn.target - 1 ? 'tied' : 'lost';
  return 'playing';
}

// ---------------------------------------------------------------------------------------------
// Tap-to-hit model: the tap picks WHERE (a point on the field), the moment picks HOW WELL.
// perfect -> six toward the point · good -> four along the ground · ok -> 1-2 runs to the point ·
// poor -> a skier toward the nearest fielder (caught or dropped) · way off -> beaten / bowled.

export type ShotKind = 'six' | 'four' | 'runs' | 'catch' | 'drop' | 'edge' | 'miss';
export interface PlannedShot {
  kind: ShotKind;
  runs: number;
  out: boolean;
  wicket: 'bowled' | 'lbw' | 'caught' | 'caught behind' | null;
  path: { t: number; x: number; z: number; h: number }[]; // field coords from the contact point
  fielder: number | null; // fielder who catches / collects
  endT: number;
  timingBand: 'perfect' | 'good' | 'ok' | 'poor' | 'miss';
}

/** Timing bands (seconds) by difficulty 0..2. */
export function bands(difficulty: number): { perfect: number; good: number; ok: number; poor: number } {
  const k = [1.35, 1, 0.75][difficulty] ?? 1;
  return { perfect: 0.045 * k, good: 0.09 * k, ok: 0.14 * k, poor: 0.2 * k };
}

export function bandOf(e: number, difficulty: number): PlannedShot['timingBand'] {
  const b = bands(difficulty);
  const a = Math.abs(e);
  return a <= b.perfect ? 'perfect' : a <= b.good ? 'good' : a <= b.ok ? 'ok' : a <= b.poor ? 'poor' : 'miss';
}

/** Projectile (with mild drag) from h0 to land at distance `dist` along angle `ang`. */
function aerial(ang: number, dist: number, peak: number, h0 = 0.8): PlannedShot['path'] {
  const path: PlannedShot['path'] = [];
  const g = 9.81;
  const vy = Math.sqrt(2 * g * Math.max(1, peak - h0));
  const tUp = vy / g;
  const tDown = Math.sqrt((2 * peak) / g);
  const T = tUp + tDown;
  const dx = Math.sin(ang);
  const dz = Math.cos(ang);
  for (let t = 0; t <= T + 1e-6; t += 1 / 30) {
    const u = t / T;
    const d = dist * (u * (1.15 - 0.15 * u)); // a touch of drag
    const h = Math.max(0, h0 + vy * t - 0.5 * g * t * t);
    path.push({ t, x: dx * d, z: dz * d, h });
  }
  return path;
}

/** Ground shot rolling out to `dist` (decelerating), optionally past the rope. */
function grounder(ang: number, dist: number, v0: number): PlannedShot['path'] {
  const path: PlannedShot['path'] = [];
  const a = (v0 * v0) / (2 * dist); // constant deceleration that stops at dist
  const T = v0 / a;
  const dx = Math.sin(ang);
  const dz = Math.cos(ang);
  for (let t = 0; t <= T + 1e-6; t += 1 / 30) {
    const d = v0 * t - 0.5 * a * t * t;
    const bounce = t < 0.35 ? Math.abs(Math.sin(t * 9)) * 0.5 * (1 - t / 0.35) : 0;
    path.push({ t, x: dx * d, z: dz * d, h: bounce });
  }
  return path;
}

export function planShot(d: Delivery, timing: number | null, target: { x: number; z: number } | null, difficulty: number, fielders: Fielder[], r: () => number): PlannedShot {
  const onStumps = Math.abs(d.line) < 0.13 && d.arriveH < 0.75;
  const none = (kind: ShotKind, wicket: PlannedShot['wicket'], band: PlannedShot['timingBand']): PlannedShot => ({ kind, runs: 0, out: !!wicket, wicket, path: [], fielder: null, endT: 0, timingBand: band });
  if (timing === null || !target) return none('miss', onStumps ? (d.arriveH < 0.4 || r() < 0.5 ? 'bowled' : 'lbw') : null, 'miss');
  const band = bandOf(timing, difficulty);
  if (band === 'miss') return none('miss', onStumps ? 'bowled' : null, 'miss');
  // early pulls the shot to the leg side, late pushes it to the off side (field x: + = off side)
  const want = Math.atan2(target.x, target.z);
  const err = timing * (band === 'perfect' ? 0.8 : 2.2);
  const ang = want + err;
  const dist = Math.hypot(target.x, target.z);
  if (band === 'perfect') {
    const path = aerial(ang, BOUNDARY + 12 + r() * 18, 18 + r() * 10);
    return { kind: 'six', runs: 6, out: false, wicket: null, path, fielder: null, endT: path.at(-1)!.t, timingBand: band };
  }
  if (band === 'good') {
    const path = grounder(ang, BOUNDARY + 6, 30 + r() * 6);
    return { kind: 'four', runs: 4, out: false, wicket: null, path, fielder: null, endT: Math.min(path.at(-1)!.t, 3.2), timingBand: band };
  }
  if (band === 'ok') {
    const to = Math.max(14, Math.min(48, dist));
    const path = grounder(ang, to, 16 + to * 0.25);
    const runs = to > 32 ? 2 : 1;
    let fi = 0;
    let best = 1e9;
    const end = path.at(-1)!;
    fielders.forEach((f, i) => {
      const dd = Math.hypot(f.x - end.x, f.z - end.z);
      if (dd < best) {
        best = dd;
        fi = i;
      }
    });
    return { kind: 'runs', runs, out: false, wicket: null, path, fielder: fi, endT: path.at(-1)!.t + 0.6, timingBand: band };
  }
  // poor: a thick edge behind, or a skier toward the fielder nearest the aimed line
  if (r() < 0.3) {
    const caught = r() < 0.55;
    const path = aerial(Math.PI + (r() - 0.5) * 0.8, caught ? 4 : 28, caught ? 1.6 : 3, 0.7);
    return { kind: caught ? 'catch' : 'edge', runs: caught ? 0 : 1, out: caught, wicket: caught ? 'caught behind' : null, path: caught ? path.slice(0, 8) : path, fielder: null, endT: caught ? 0.3 : path.at(-1)!.t, timingBand: band };
  }
  let fi = 0;
  let best = 1e9;
  fielders.forEach((f, i) => {
    const fa = Math.atan2(f.x, f.z);
    let da = Math.abs(fa - ang) % (Math.PI * 2);
    if (da > Math.PI) da = Math.PI * 2 - da;
    const cost = da * 40 + Math.hypot(f.x, f.z) * 0.1;
    if (cost < best) {
      best = cost;
      fi = i;
    }
  });
  const f = fielders[fi];
  const fd = Math.hypot(f.x, f.z);
  const miss = (r() - 0.3) * 9; // landing a few metres from him
  const land = { x: f.x + Math.sin(ang) * miss, z: f.z + Math.cos(ang) * miss };
  const path = aerial(Math.atan2(land.x, land.z), Math.hypot(land.x, land.z), 14 + fd * 0.25);
  const flight = path.at(-1)!.t;
  const runDist = Math.max(0, Math.abs(miss) - 1.5);
  const canReach = runDist <= 6.5 * (flight - 0.4);
  const caught = canReach && r() < 0.82;
  return {
    kind: caught ? 'catch' : 'drop',
    runs: caught ? 0 : 1,
    out: caught,
    wicket: caught ? 'caught' : null,
    path,
    fielder: fi,
    endT: flight,
    timingBand: band,
  };
}

/** Nine fielders: five on the rope, four in the ring (keeper and bowler are separate). */
export function ropeField(): Fielder[] {
  const p = (name: string, deg: number, d: number): Fielder => ({ name, x: Math.sin((deg * Math.PI) / 180) * d, z: Math.cos((deg * Math.PI) / 180) * d });
  return [
    p('Long-off', 22, BOUNDARY - 3),
    p('Long-on', -22, BOUNDARY - 3),
    p('Deep cover', 70, BOUNDARY - 3),
    p('Deep midwicket', -70, BOUNDARY - 3),
    p('Fine leg', -150, BOUNDARY - 4),
    p('Point', 100, 24),
    p('Cover', 45, 26),
    p('Midwicket', -45, 26),
    p('Square leg', -100, 24),
  ];
}
