// Stumps: a Stick Cricket-style chase. Game loop, ball-by-ball state machine and HUD.
import { BallFlight, defaultField, Delivery, deliveryPos, flightTime, flyBall, Innings, makeDelivery, newInnings, Outcome, PITCH_LEN, record, resolveShot, rng, status } from './engine';
import { Match3D } from './render/match3d';
import { Input, SwingCmd } from './input';
import { audioStart, sfx } from './audio';

const TEAMS = [
  { name: 'Indus Tigers', kit: '#0f8a4c' },
  { name: 'Thames Royals', kit: '#1d4ed8' },
  { name: 'Harbour Hawks', kit: '#f59e0b' },
  { name: 'Desert Falcons', kit: '#b91c1c' },
  { name: 'Island Cyclones', kit: '#7c3aed' },
  { name: 'Savanna Storm', kit: '#0e7490' },
];
const SWING_LEAD = 0.17; // seconds from pressing to bat meeting ball

const app = document.getElementById('app')!;
const ui = document.getElementById('ui')!;
const hud = document.getElementById('hud')!;
const banner = document.getElementById('banner')!;
const input = new Input(app);
const mobile = matchMedia('(pointer: coarse)').matches;
const scene3d = new Match3D(app, mobile);
const secondary = (hex: string) => (parseInt(hex.slice(1), 16) > 0x888888 ? '#111111' : '#ffffff');
type Phase = 'menu' | 'runup' | 'ball' | 'field' | 'result' | 'over';
const S = {
  phase: 'menu' as Phase,
  t: 0,
  r: rng(Date.now() % 100000),
  team: 0,
  opp: 1,
  overs: 2,
  diff: 1,
  inn: null as Innings | null,
  d: null as Delivery | null,
  swing: null as (SwingCmd & { at: number }) | null,
  outcome: null as Outcome | null,
  flight: null as BallFlight | null,
  broken: 0,
  cheer: 0,
  msg: '',
  timingMsg: '',
  last: [] as string[],
};
const field = defaultField(false);

function menu(): void {
  S.phase = 'menu';
  const opts = (k: 'overs' | 'diff', vals: [number, string][]) =>
    vals.map(([v, l]) => `<button data-k="${k}" data-v="${v}" class="${S[k] === v ? 'on' : ''}">${l}</button>`).join('');
  ui.innerHTML = `<div class="card">
    <h1>STUMPS</h1><p class="sub">Chase the target. Time it, place it, clear the ropes.</p>
    <div class="row"><button id="tp">‹</button><b style="color:${TEAMS[S.team].kit}">${TEAMS[S.team].name}</b><button id="tn">›</button></div>
    <div class="row small">vs <b>${TEAMS[S.opp].name}</b></div>
    <div class="row">${opts('overs', [[1, '1 over'], [2, '2 overs'], [5, '5 overs']])}</div>
    <div class="row">${opts('diff', [[0, 'Club'], [1, 'Pro'], [2, 'Legend']])}</div>
    <button id="go" class="go">BAT ›</button>
    <p class="help">Swing <b>Space</b> / <b>✕</b> / tap · Aim with <b>arrows</b>, <b>left stick</b> or swipe · Loft: <b>Shift</b>, <b>□</b>, <b>R1</b> or a long swipe · Block: <b>○</b> / <b>B</b></p></div>`;
  ui.hidden = false;
  ui.querySelectorAll<HTMLButtonElement>('[data-k]').forEach((b) =>
    b.addEventListener('click', () => {
      (S as unknown as Record<string, number>)[b.dataset.k!] = Number(b.dataset.v);
      menu();
    }),
  );
  ui.querySelector('#tp')!.addEventListener('click', () => pickTeam(-1));
  ui.querySelector('#tn')!.addEventListener('click', () => pickTeam(1));
  ui.querySelector('#go')!.addEventListener('click', start);
}
function pickTeam(d: number): void {
  S.team = (S.team + d + TEAMS.length) % TEAMS.length;
  if (S.opp === S.team) S.opp = (S.team + 1) % TEAMS.length;
  menu();
}

function start(): void {
  audioStart();
  scene3d.setTeams([TEAMS[S.team].kit, secondary(TEAMS[S.team].kit)], [TEAMS[S.opp].kit, secondary(TEAMS[S.opp].kit)]);
  const target = Math.round(S.overs * 6 * (1.35 + S.diff * 0.2 + S.r() * 0.3)) + 1;
  S.inn = newInnings(S.overs, S.overs === 5 ? 5 : S.overs === 2 ? 3 : 2, target);
  S.last = [];
  ui.hidden = true;
  input.clear();
  nextBall();
}

function nextBall(): void {
  S.phase = 'runup';
  S.t = 0;
  S.d = makeDelivery(S.r, S.diff, S.inn!.balls);
  S.swing = null;
  S.outcome = null;
  S.flight = null;
  S.broken = 0;
  S.timingMsg = '';
  banner.textContent = '';
}

function finishBall(runs: number, out: boolean, label: string, chip: string): void {
  const inn = S.inn!;
  record(inn, runs, out, label);
  S.last = [...S.last, chip].slice(-6);
  S.msg = label;
  banner.textContent = label;
  banner.className = out ? 'out' : runs >= 4 ? 'big' : '';
  S.phase = 'result';
  S.t = 0;
}

function resolve(): void {
  const d = S.d!;
  const T = flightTime(d) - 0.3 / d.speed;
  const sw = S.swing;
  const timing = sw ? sw.at + SWING_LEAD - T : 0;
  const shot = sw ? { angle: Math.atan2(sw.dx, sw.dy || (sw.dx === 0 ? 1 : 0)), loft: sw.loft, defend: sw.block } : null;
  if (sw) S.timingMsg = Math.abs(timing) < 0.035 ? 'PERFECT' : timing < 0 ? (timing < -0.09 ? 'Too early' : 'Early') : timing > 0.09 ? 'Too late' : 'Late';
  const o = resolveShot(d, shot, timing, S.r);
  S.outcome = o;
  if (o.kind === 'miss') {
    if (o.wicket) {
      if (o.wicket === 'bowled') {
        S.broken = 1;
        sfx.stumps();
      }
      finishBall(0, true, o.wicket === 'bowled' ? 'BOWLED!' : 'LBW!', 'W');
    } else finishBall(0, false, sw ? 'Beaten' : 'Left alone', '•');
  } else if (o.kind === 'edge') {
    sfx.edge();
    if (o.caught) finishBall(0, true, 'CAUGHT BEHIND!', 'W');
    else {
      const runs = S.r() < 0.5 ? 1 : 2;
      finishBall(runs, false, `Edged for ${runs}`, String(runs));
    }
  } else {
    sfx.bat(Math.min(1, o.speed / 35));
    S.flight = flyBall(o, field, S.r);
    S.phase = 'field';
    S.t = 0;
  }
}

function hudText(): void {
  const inn = S.inn;
  if (!inn) {
    hud.innerHTML = '';
    return;
  }
  const ov = `${Math.floor(inn.balls / 6)}.${inn.balls % 6}`;
  const need = inn.target - inn.runs;
  const left = inn.maxBalls - inn.balls;
  hud.innerHTML = `<div class="score"><span class="tm" style="background:${TEAMS[S.team].kit}">${TEAMS[S.team].name.split(' ')[0].toUpperCase()}</span>
    <b>${inn.runs}/${inn.wickets}</b><span>${ov} ov</span><span class="need">${need > 0 ? `Need ${need} from ${left}` : 'Won'}</span></div>
    <div class="chips">${S.last.map((c) => `<i class="${c === 'W' ? 'w' : c === '4' || c === '6' ? 'b' : ''}">${c}</i>`).join('')}</div>
    <div class="timing">${S.timingMsg}</div>`;
}

let prev = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.1, (now - prev) / 1000); // keep game time close to real time so timing feels right
  prev = now;
  input.poll();
  S.t += dt;
  S.cheer = Math.max(0, S.cheer - dt * 0.4);
  if (S.phase === 'menu' || S.phase === 'over') {
    if (input.menuPress) (ui.querySelector('#go, #again') as HTMLButtonElement | null)?.click();
    input.clear();
  }
  const cmd = input.take();
  if ((S.phase === 'runup' || S.phase === 'ball') && cmd && !S.swing) {
    const ballT = S.phase === 'ball' ? S.t : -1;
    if (ballT > 0.1) S.swing = { ...cmd, at: ballT };
  }
  if (S.phase === 'runup' && S.t > 1.35) {
    S.phase = 'ball';
    S.t = 0;
  }
  if (S.phase === 'ball' && S.d) {
    const T = flightTime(S.d) - 0.3 / S.d.speed;
    const contact = S.swing ? S.swing.at + SWING_LEAD : Infinity;
    if ((S.swing && S.t >= Math.max(contact, T - 0.12) && S.t >= Math.min(contact, T)) || S.t > T + 0.22) resolve();
  }
  if (S.phase === 'field' && S.flight) {
    const end = Math.min(S.flight.result.endT, 5) + 0.7;
    if (S.t > end) {
      const r = S.flight.result;
      if (r.out) finishBall(0, true, 'CAUGHT!', 'W');
      else if (r.boundary) {
        sfx.crowd(r.boundary === 6);
        S.cheer = 1;
        finishBall(r.boundary, false, r.boundary === 6 ? 'SIX!' : 'FOUR!', String(r.boundary));
      } else finishBall(r.runs, false, r.runs === 0 ? 'Fielded' : `${r.runs} run${r.runs > 1 ? 's' : ''}`, r.runs ? String(r.runs) : '•');
    }
  }
  if (S.phase === 'result' && S.t > 1.5) {
    const st = status(S.inn!);
    if (st === 'playing') nextBall();
    else {
      S.phase = 'over';
      const inn = S.inn!;
      const msg = st === 'won' ? `${TEAMS[S.team].name} win with ${inn.maxBalls - inn.balls} balls to spare!` : st === 'tied' ? 'Match tied!' : `${TEAMS[S.opp].name} win by ${inn.target - 1 - inn.runs} runs`;
      ui.innerHTML = `<div class="card"><h1>${st === 'won' ? 'YOU WIN' : st === 'tied' ? 'TIED' : 'YOU LOSE'}</h1><p class="sub">${msg}</p>
        <p class="big">${inn.runs}/${inn.wickets} <small>(${Math.floor(inn.balls / 6)}.${inn.balls % 6} ov)</small> · target ${inn.target}</p>
        <button id="again" class="go">PLAY AGAIN ›</button> <button id="menu">Menu</button></div>`;
      ui.hidden = false;
      ui.querySelector('#again')!.addEventListener('click', start);
      ui.querySelector('#menu')!.addEventListener('click', menu);
      banner.textContent = '';
    }
  }

  // ---- draw
  const o = S.outcome;
  scene3d.update(dt, {
    phase: S.phase,
    t: S.t,
    d: S.d,
    swing: S.swing,
    hit: o?.kind === 'hit',
    wicket: o?.kind === 'miss' && !!o.wicket && o.wicket === 'bowled',
    flight: S.flight,
    swingLead: SWING_LEAD,
  });
  hudText();
  requestAnimationFrame(frame);
}
// test hook: state + the ideal moment to press swing for the current delivery
(window as unknown as { __stumps: unknown }).__stumps = { S, scene3d, THREE_V: (x: number, y: number, z: number) => ({ x, y, z }), perfectAt: () => (S.d ? flightTime(S.d) - 0.3 / S.d.speed - SWING_LEAD : 0) };
ui.innerHTML = '<div class="card"><h1>STUMPS</h1><p class="sub">Loading players…</p></div>';
scene3d.load([TEAMS[0].kit, '#ffffff'], [TEAMS[1].kit, '#ffffff']).then(() => {
  menu();
  requestAnimationFrame(frame);
});
