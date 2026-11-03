// Fielders: five on the rope, four in the ring. After a hit, each fielder runs at the ball; a ball
// still in the air within reach is caught (sometimes dropped), a grounded ball within reach is
// stopped (unless it is travelling too fast to stop), otherwise it runs away for runs or a boundary.
import { BOUNDARY, Flight } from './batting/physics';
import { v, V } from './batting/vec';

export interface Fielder {
  name: string;
  home: V;
}
const at = (name: string, deg: number, d: number): Fielder => ({ name, home: v(Math.sin((deg * Math.PI) / 180) * d, 0, Math.cos((deg * Math.PI) / 180) * d) });
export const FIELD: Fielder[] = [
  at('Long-off', 20, BOUNDARY - 4),
  at('Long-on', -20, BOUNDARY - 4),
  at('Deep cover', 68, BOUNDARY - 4),
  at('Deep midwicket', -68, BOUNDARY - 4),
  at('Fine leg', -150, BOUNDARY - 6),
  at('Point', 100, 24),
  at('Cover', 42, 25),
  at('Midwicket', -42, 25),
  at('Square leg', -100, 23),
];
const RUN = 6.8; // m/s
const REACT = 0.35; // s before a fielder moves
const REACH = 1.8; // m dive / stretch

export interface FieldResult {
  kind: 'caught' | 'dropped' | 'stopped' | 'four' | 'six' | 'runs';
  fielder: number | null;
  t: number; // flight time when it happened
  runs: number;
  at: V; // where (field coords)
}

export function field(f: Flight, r: () => number): FieldResult {
  let firstBounce = -1;
  for (let i = 0; i < f.path.length; i++) {
    const s = f.path[i];
    if (firstBounce < 0 && i > 2 && s.p.y <= 0.05) firstBounce = s.t;
    const d = Math.hypot(s.p.x, s.p.z);
    if (d >= BOUNDARY) break;
    for (let k = 0; k < FIELD.length; k++) {
      const h = FIELD[k].home;
      const gap = Math.hypot(h.x - s.p.x, h.z - s.p.z) - REACH;
      if (gap > RUN * Math.max(0, s.t - REACT)) continue;
      const inAir = firstBounce < 0;
      if (inAir && s.p.y > 0.15 && s.p.y < 2.7) {
        const drop = r() < 0.12 + Math.max(0, gap) * 0.03;
        return { kind: drop ? 'dropped' : 'caught', fielder: k, t: s.t, runs: drop ? 1 : 0, at: s.p };
      }
      if (!inAir && s.p.y < 0.9) {
        // ground ball: too hot to stop if it is still flying along
        const prev = f.path[Math.max(0, i - 1)];
        const spd = Math.hypot(s.p.x - prev.p.x, s.p.z - prev.p.z) * 120;
        if (spd > 26 && gap > 0) continue;
        const back = Math.hypot(s.p.x, s.p.z) / 28 + 0.4; // throw back
        const runs = Math.max(0, Math.min(3, Math.floor((s.t + back + 0.4) / 2.9)));
        return { kind: 'stopped', fielder: k, t: s.t, runs, at: s.p };
      }
    }
  }
  if (f.boundary === 6) return { kind: 'six', fielder: null, t: f.path.at(-1)!.t, runs: 6, at: f.path.at(-1)!.p };
  if (f.boundary === 4) return { kind: 'four', fielder: null, t: f.path.at(-1)!.t, runs: 4, at: f.path.at(-1)!.p };
  return { kind: 'runs', fielder: null, t: f.path.at(-1)!.t, runs: f.runs, at: f.path.at(-1)!.p };
}

/** Where fielder k is at flight time t (running toward where the ball ends up / is taken). */
export function fielderPos(k: number, res: FieldResult | null, t: number, ball: V | null): V {
  const h = FIELD[k].home;
  if (!res || t <= REACT) return h;
  const goal = res.fielder === k ? res.at : ball ?? res.at;
  const dx = goal.x - h.x;
  const dz = goal.z - h.z;
  const d = Math.hypot(dx, dz);
  const chase = res.fielder === k ? 1 : d < 30 ? 0.35 : 0;
  const run = Math.min(Math.max(0, d - (res.fielder === k ? 0.6 : 3)), RUN * (t - REACT) * chase);
  return v(h.x + (dx / (d || 1)) * run, 0, h.z + (dz / (d || 1)) * run);
}
