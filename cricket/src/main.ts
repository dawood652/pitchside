// Stumps: tap-to-hit 3D cricket. Game loop, ball-by-ball state machine, HUD, menus.
import { Delivery, deliveryPos, flightTime, Innings, makeDelivery, newInnings, PlannedShot, planShot, record, rng, ropeField, status } from './engine';
import { Match3D, RUNUP } from './render/match3d';
import { Input } from './input';
import { audioStart, setMusic, sfx, startAmbience } from './audio';
import { loadAds } from './ads';

const TEAMS = [
  { name: 'Indus Tigers', kit: '#0f8a4c' },
  { name: 'Thames Royals', kit: '#1d4ed8' },
  { name: 'Harbour Hawks', kit: '#f59e0b' },
  { name: 'Desert Falcons', kit: '#b91c1c' },
  { name: 'Island Cyclones', kit: '#7c3aed' },
  { name: 'Savanna Storm', kit: '#0e7490' },
];
const SWING_LEAD = 0.17; // seconds from the tap to the bat meeting the ball

const app = document.getElementById('app')!;
const ui = document.getElementById('ui')!;
const hud = document.getElementById('hud')!;
const banner = document.getElementById('banner')!;
const musicBtn = document.getElementById('music') as HTMLButtonElement;
const input = new Input(app);
const mobile = matchMedia('(pointer: coarse)').matches;
const scene3d = new Match3D(app, mobile);
const secondary = (hex: string) => (parseInt(hex.slice(1), 16) > 0x888888 ? '#111111' : '#ffffff');
const field = ropeField();

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
  swingAt: null as number | null,
  target: null as { x: number; z: number } | null,
  shot: null as PlannedShot | null,
  contact: null as { x: number; y: number; z: number } | null,
  msg: '',
  timingMsg: '',
  last: [] as string[],
  music: true,
};

function menu(): void {
  S.phase = 'menu';
  const opts = (k: 'overs' | 'diff', vals: [number, string][]) => vals.map(([v, l]) => `<button data-k="${k}" data-v="${v}" class="${S[k] === v ? 'on' : ''}">${l}</button>`).join('');
  ui.innerHTML = `<div class="card">
    <h1>STUMPS</h1><p class="sub">Tap where you want it. Time it perfectly for SIX.</p>
    <div class="row"><button id="tp">‹</button><b style="color:${TEAMS[S.team].kit}">${TEAMS[S.team].name}</b><button id="tn">›</button></div>
    <div class="row small">vs <b>${TEAMS[S.opp].name}</b></div>
    <div class="row">${opts('overs', [[1, '1 over'], [2, '2 overs'], [5, '5 overs']])}</div>
    <div class="row">${opts('diff', [[0, 'Club'], [1, 'Pro'], [2, 'Legend']])}</div>
    <button id="go" class="go">BAT ›</button>
    <p class="help"><b>Tap / click the field</b> as the ball arrives: the ball goes where you tapped.<br>Perfect = <b>SIX</b> · slightly off = <b>FOUR</b> · more off = 1–2 runs · way off = caught or bowled.<br>Controller: aim with the stick, <b>✕</b> to hit · Keyboard: arrows + <b>Space</b></p></div>`;
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
  startAmbience();
  setMusic(S.music);
  scene3d.setTeams([TEAMS[S.team].kit, secondary(TEAMS[S.team].kit)], [TEAMS[S.opp].kit, secondary(TEAMS[S.opp].kit)]);
  const target = Math.round(S.overs * 6 * (1.6 + S.diff * 0.25 + S.r() * 0.35)) + 1;
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
  S.swingAt = null;
  S.target = null;
  S.shot = null;
  S.contact = null;
  S.timingMsg = '';
  banner.textContent = '';
}

function finishBall(): void {
  const s = S.shot!;
  const inn = S.inn!;
  const labels: Record<string, string> = { six: 'SIX!', four: 'FOUR!', catch: s.wicket === 'caught behind' ? 'CAUGHT BEHIND!' : 'CAUGHT!', drop: 'DROPPED! 1 run', edge: 'Edged, 1 run', runs: `${s.runs} run${s.runs > 1 ? 's' : ''}` };
  let label = labels[s.kind] ?? '';
  if (s.kind === 'miss') label = s.wicket === 'bowled' ? 'BOWLED!' : s.wicket === 'lbw' ? 'LBW!' : S.swingAt === null ? 'Left alone' : 'Beaten';
  record(inn, s.runs, s.out, label);
  S.last = [...S.last, s.out ? 'W' : s.runs ? String(s.runs) : '•'].slice(-6);
  S.msg = label;
  banner.textContent = label;
  banner.className = s.out ? 'out' : s.runs >= 4 ? 'big' : '';
  if (s.kind === 'six' || s.kind === 'four') sfx.crowd(s.kind === 'six');
  if (s.out) sfx.crowd(false);
  S.phase = 'result';
  S.t = 0;
}

function resolve(): void {
  const d = S.d!;
  const T = flightTime(d) - 0.3 / d.speed;
  const timing = S.swingAt !== null ? S.swingAt + SWING_LEAD - T : null;
  S.shot = planShot(d, timing, S.target, S.diff, field, S.r);
  const tb = S.shot.timingBand;
  if (timing !== null) S.timingMsg = tb === 'perfect' ? 'PERFECT' : `${tb === 'good' ? 'Good' : tb === 'ok' ? 'OK' : tb === 'poor' ? 'Poor' : 'Missed'} · ${timing < 0 ? 'early' : 'late'}`;
  const c = deliveryPos(d, Math.min(T + 0.05, Math.max(T - 0.05, S.swingAt !== null ? S.swingAt + SWING_LEAD : T)));
  S.contact = { x: c.x, y: c.y, z: c.z };
  if (S.shot.path.length) {
    sfx.bat(S.shot.kind === 'six' ? 1 : S.shot.kind === 'four' ? 0.75 : 0.4);
    if (S.shot.kind === 'edge' || S.shot.wicket === 'caught behind') sfx.edge();
    S.phase = 'field';
    S.t = 0;
  } else {
    if (S.shot.wicket === 'bowled') sfx.stumps();
    finishBall();
  }
}

function hudText(): void {
  const inn = S.inn;
  if (!inn || S.phase === 'menu') {
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

musicBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  S.music = !S.music;
  musicBtn.textContent = S.music ? '♪ On' : '♪ Off';
  setMusic(S.music);
});
musicBtn.addEventListener('pointerdown', (e) => e.stopPropagation());

let prev = performance.now();
let autoTap: { at: number; sx: number; sy: number } | null = null; // test hook: tap at an exact game time
function frame(now: number): void {
  const dt = Math.min(0.1, (now - prev) / 1000); // keep game time close to real time so timing feels right
  prev = now;
  input.poll();
  S.t += dt;
  if (S.phase === 'menu' || S.phase === 'over') {
    if (input.menuPress) (ui.querySelector('#go, #again') as HTMLButtonElement | null)?.click();
    input.clear();
  }
  let cmd = input.take();
  if (autoTap && S.phase === 'ball' && S.t >= autoTap.at) {
    cmd = { dx: 0, dy: 1, loft: true, block: false, sx: autoTap.sx, sy: autoTap.sy };
    autoTap = null;
  }
  if (S.phase === 'ball' && cmd && S.swingAt === null && S.t > 0.1) {
    S.swingAt = S.t;
    if (cmd.sx !== undefined && cmd.sy !== undefined) S.target = scene3d.pick(cmd.sx, cmd.sy);
    else {
      // stick / arrows: aim at a point 50 m away in that direction (neutral = straight)
      const l = Math.hypot(cmd.dx, cmd.dy);
      const a = l > 0.2 ? Math.atan2(cmd.dx, cmd.dy) : 0;
      S.target = { x: Math.sin(a) * 50, z: Math.cos(a) * 50 };
    }
  }
  if (S.phase === 'runup' && S.t > RUNUP) {
    S.phase = 'ball';
    S.t = 0;
  }
  if (S.phase === 'ball' && S.d) {
    const T = flightTime(S.d) - 0.3 / S.d.speed;
    const contact = S.swingAt !== null ? S.swingAt + SWING_LEAD : Infinity;
    if ((S.swingAt !== null && S.t >= Math.max(contact, T - 0.12) && S.t >= Math.min(contact, T)) || S.t > T + 0.22) resolve();
  }
  if (S.phase === 'field' && S.shot && S.t > Math.min(S.shot.endT, 4.5) + 0.5) finishBall();
  if (S.phase === 'result' && S.t > 1.7) {
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
  scene3d.update(dt, {
    phase: S.phase,
    t: S.t,
    d: S.d,
    swingAt: S.swingAt,
    target: S.target,
    shot: S.shot,
    contact: S.contact,
    swingLead: SWING_LEAD,
    wicket: S.shot?.wicket === 'bowled',
  });
  hudText();
  requestAnimationFrame(frame);
}

// test hook: state + the ideal moment to tap for the current delivery
(window as unknown as { __stumps: unknown }).__stumps = { S, scene3d, tapAt: (off: number, sx: number, sy: number) => { autoTap = { at: (S.d ? flightTime(S.d) - 0.3 / S.d.speed - SWING_LEAD : 0) + off, sx, sy }; }, perfectAt: () => (S.d ? flightTime(S.d) - 0.3 / S.d.speed - SWING_LEAD : 0) };
ui.innerHTML = '<div class="card"><h1>STUMPS</h1><p class="sub">Loading players…</p></div>';
Promise.all([scene3d.load([TEAMS[0].kit, '#ffffff'], [TEAMS[1].kit, '#ffffff']), loadAds()]).then(([, ads]) => {
  scene3d.arena.setAds(ads);
  menu();
  requestAnimationFrame(frame);
});
