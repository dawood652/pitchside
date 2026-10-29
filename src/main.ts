// Entry point: builds the world, runs the demo match behind the menu, starts real matches.

import * as THREE from 'three';
import { createWorld, followShadow, setTimeOfDay, TimeOfDay } from './render/scene';
import { Quality } from './render/quality';
import { loadSettings, saveSettings, settingsPanel, Settings } from './ui/settings';
import { Post } from './render/post';
import { createPitch } from './render/pitch';
import { createGoals } from './render/goals';
import { createStadium, Stadium } from './render/stadium';
import { BroadcastCamera } from './render/camera';
import { PlayerView, createMarker, kitFor } from './render/playerView';
import { loadPlayerAsset, PlayerAsset } from './render/playerModel';
import { BallView } from './render/ballView';
import { Game } from './match/game';
import { Replay } from './match/replay';
import { MATCH, PITCH } from './data/tuning';
import { Input } from './core/input';
import { startLoop } from './core/loop';
import { Hud } from './ui/hud';
import { Menu, MenuChoice, Overlay } from './ui/menu';
import { createTouchControls, isTouch } from './ui/touch';
import { Sound } from './audio/sound';
import { TEAMS, TeamDef, colourDistance } from './data/teams';

const app = document.getElementById('app')!;
const ui = document.getElementById('ui')!;
const mobile = isTouch();
const world = createWorld(app, mobile);
world.scene.add(createPitch(world.renderer));
world.scene.add(createGoals());
const cam = new BroadcastCamera(world.camera);
const settings: Settings = loadSettings(mobile);
let post: Post | null = null;
function resizeAll(): void {
  world.renderer.setSize(app.clientWidth, app.clientHeight);
  world.camera.aspect = app.clientWidth / app.clientHeight;
  world.camera.updateProjectionMatrix();
  post?.setSize(app.clientWidth, app.clientHeight);
}
const quality = new Quality(world, resizeAll, settings.graphics);
function syncPost(): void {
  if (quality.usePost() && !post) {
    post = new Post(world.renderer, world.scene, world.camera);
    post.setSize(app.clientWidth, app.clientHeight);
    post.setQuality(2);
  } else if (!quality.usePost()) post = null;
}
syncPost();
window.addEventListener('resize', () => post?.setSize(app.clientWidth, app.clientHeight));
const input = new Input();
const sound = new Sound();
const hud = new Hud(ui);
const overlay = new Overlay(ui);

let game: Game;
// eslint-disable-next-line prefer-const
let prev: Snap;
let views: PlayerView[] = [];
let ballView: BallView;
let stadium: Stadium;
let matchGroup = new THREE.Group();
const marker = createMarker();
let lastChoice: MenuChoice = { home: TEAMS[2], away: TEAMS[1], halfSeconds: 180, time: 'evening', difficulty: 1 };
let paused = false;
let frozen = false; // test hook: stops the live loop so scripted frames are deterministic
let elapsed = 0;
let asset: PlayerAsset;
const replay = new Replay();

const tools = document.createElement('div');
tools.className = 'tools';
tools.innerHTML = `<button id="mute" aria-pressed="false">Sound on</button><button id="pause">Pause</button>`;
const gear = document.createElement('button');
gear.className = 'gear';
gear.setAttribute('aria-label', 'Settings');
gear.textContent = '⚙';
ui.appendChild(gear);
const fpsEl = document.createElement('div');
fpsEl.className = 'fps';
ui.appendChild(fpsEl);
const setHost = document.createElement('div');
setHost.className = 'screen center';
setHost.hidden = true;
ui.appendChild(setHost);
let settingsOpen = false;
function applySettings(): void {
  cam.type = settings.camera;
  cam.height = settings.height;
  cam.zoom = settings.zoom;
  if (quality.mode !== settings.graphics) {
    quality.setMode(settings.graphics);
    syncPost();
  }
  fpsEl.hidden = !settings.showFps;
  if (game) game.s.assist = { collect: settings.collectAssist, autoSwitch: settings.autoSwitch, autoSprint: settings.autoSprint };
  saveSettings(settings);
}
function openSettings(): void {
  settingsOpen = true;
  document.body.classList.add('settings-open');
  setHost.hidden = false;
  settingsPanel(setHost, settings, applySettings, () => {
    settingsOpen = false;
    document.body.classList.remove('settings-open');
    setHost.hidden = true;
    setHost.innerHTML = '';
  });
}
gear.addEventListener('click', openSettings);
ui.appendChild(tools);
const muteBtn = tools.querySelector('#mute') as HTMLButtonElement;
muteBtn.addEventListener('click', () => {
  sound.start();
  sound.setMuted(!sound.muted);
  muteBtn.textContent = sound.muted ? 'Sound off' : 'Sound on';
  muteBtn.setAttribute('aria-pressed', String(sound.muted));
});
tools.querySelector('#pause')!.addEventListener('click', () => togglePause());

const loading = document.createElement('div');
loading.className = 'screen center';
loading.innerHTML = '<div class="final"><h2>Loading players…</h2></div>';
ui.appendChild(loading);
try {
  asset = await loadPlayerAsset();
  loading.remove();
} catch (err) {
  loading.innerHTML = `<div class="final"><h2>Could not load the players</h2><p class="note">${String(err).replace(/</g, '&lt;')}</p></div>`;
  throw err;
}

const touch = mobile ? createTouchControls(ui, input) : null;
/** When a phone stays in portrait during a match, rotate the whole game 90° so it plays in landscape. */
function updateForcedLandscape(): void {
  const force = mobile && document.body.classList.contains('in-match') && window.innerHeight > window.innerWidth;
  if (force === document.body.classList.contains('force-landscape')) return;
  document.body.classList.toggle('force-landscape', force);
  input.rotated = force;
  requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
}
window.addEventListener('resize', updateForcedLandscape);
window.addEventListener('orientationchange', () => setTimeout(updateForcedLandscape, 200));
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());

const menu = new Menu(ui, (c) => {
  sound.start();
  lastChoice = c;
  startMatch(c, true);
});

/** Away side switches to its second colours when the shirts clash. */
function kits(home: TeamDef, away: TeamDef): [TeamDef, TeamDef] {
  if (colourDistance(home.primary, away.primary) > 140) return [home, away];
  const alt: TeamDef = { ...away, primary: away.secondary, secondary: away.primary, shorts: away.secondary === away.shorts ? away.primary : away.shorts, numberColor: away.primary };
  if (colourDistance(home.primary, alt.primary) < 140) {
    alt.primary = '#1f2a44';
    alt.secondary = '#e8e8e8';
    alt.shorts = '#1f2a44';
    alt.numberColor = '#ffffff';
  }
  return [home, alt];
}

function startMatch(c: MenuChoice, human: boolean): void {
  world.scene.remove(matchGroup);
  matchGroup = new THREE.Group();
  const [home, away] = kits(c.home, c.away);
  game = new Game(home, away, c.halfSeconds, human, c.difficulty);
  stadium = createStadium(home.primary, away.primary);
  matchGroup.add(stadium.group);
  const time: TimeOfDay = c.time;
  setTimeOfDay(world, time);
  stadium.setNight(time === 'night');
  post?.setNight(time === 'night');
  applySettings();
  views = game.s.players.map((p) => {
    const v = new PlayerView(p, asset, kitFor(p, game.s.teams[p.team]));
    matchGroup.add(v.object);
    return v;
  });
  ballView = new BallView();
  matchGroup.add(ballView.mesh, ballView.shadowBlob);
  matchGroup.add(marker);
  marker.visible = human;
  world.scene.add(matchGroup);
  replay.reset();
  hud.replay(false);
  cam.mode = 'play';
  cam.snap(new THREE.Vector3(0, 0, 0));
  prev = snapshot();
  // Compile every shader now so the first seconds of play don't stutter
  world.renderer.compile(world.scene, world.camera);
  quality.reset();
  paused = false;
  overlay.hide();
  menu.show(!human);
  hud.show(human);
  tools.hidden = !human;
  if (touch) touch.hidden = !human;
  document.body.classList.toggle('in-match', human);
  updateForcedLandscape();
  if (human) hud.flash('Kick-off', `${home.name} v ${away.name}`, 2.2);
}

function toMenu(): void {
  const h = Math.floor(Math.random() * 8);
  const a = (h + 1 + Math.floor(Math.random() * 7)) % 8;
  const times: TimeOfDay[] = ['day', 'evening', 'night'];
  startMatch({ home: TEAMS[h], away: TEAMS[a], halfSeconds: 600, time: times[Math.floor(Math.random() * 3)], difficulty: 1 }, false);
}

function endReplay(): void {
  if (replay.active) replay.finish(game.s);
  hud.replay(false);
  game.s.phaseT = Math.max(game.s.phaseT, MATCH.goalCelebration - 0.6);
}
const skipReplay = (e: Event) => {
  if (e instanceof KeyboardEvent && e.repeat) return;
  if (replay.active) endReplay();
};
window.addEventListener('keydown', skipReplay);
window.addEventListener('pointerdown', skipReplay);

function togglePause(): void {
  if (!game.s.humanActive || game.s.phase === 'fulltime') return;
  paused = !paused;
  if (paused) overlay.paused(() => togglePause(), () => toMenu(), openSettings);
  else overlay.hide();
}

function handleEvents(): void {
  const s = game.s;
  for (const e of s.events) {
    if (!s.humanActive) continue;
    switch (e.type) {
      case 'kick':
        sound.kick(e.power);
        break;
      case 'whistle':
        sound.whistle(e.long);
        break;
      case 'goal': {
        replay.markGoal(Math.sign(s.ball.pos.x) || 1);
        sound.roar();
        const t = s.teams[e.team];
        hud.flash('Goal!', `${e.scorer} · ${t.short} ${s.score[0]}–${s.score[1]}`, 3.6, e.team === 0 ? '#ffe14d' : '#f3f5f2');
        break;
      }
      case 'save':
        sound.ooh();
        hud.flash('Save', '', 1.1);
        break;
      case 'foul':
        sound.whistle();
        hud.flash(e.penalty ? 'Penalty!' : 'Foul', e.penalty ? `${s.teams[1 - e.team].short} to take` : '', e.penalty ? 2.2 : 1.2, e.penalty ? '#ffe14d' : '#f3f5f2');
        break;
      case 'card':
        hud.flash(e.card === 'red' ? 'Red card' : 'Yellow card', `${e.name} · ${s.teams[e.team].short}`, 2.2, e.card === 'red' ? '#ff5a4f' : '#ffe14d');
        break;
      case 'offside':
        sound.whistle();
        hud.flash('Offside', s.teams[e.team].short, 1.4);
        break;
      case 'halftime':
        hud.flash('Half-time', `${s.teams[0].short} ${s.score[0]} – ${s.score[1]} ${s.teams[1].short}`, 3.4);
        break;
      case 'fulltime':
        setTimeout(() => overlay.fullTime(s, () => startMatch(lastChoice, true), () => toMenu()), 1600);
        break;
      default:
        break;
    }
  }
  s.events.length = 0;
}


window.addEventListener('pointerdown', () => sound.start(), { once: true });

// Touch: tap a teammate to pass to him
const tapV = new THREE.Vector3();
app.addEventListener('pointerdown', (e) => {
  if (!mobile || !game?.s.humanActive || paused) return;
  const s = game.s;
  if (s.owner !== s.controlled) return;
  const rect = app.getBoundingClientRect();
  const rot = document.body.classList.contains('force-landscape');
  const cx = rot ? e.clientY : e.clientX - rect.left;
  const cy = rot ? window.innerWidth - e.clientX : e.clientY - rect.top;
  let best = null;
  let bestD = 56;
  for (const m of s.players) {
    if (m.team !== s.humanTeam || m === s.controlled || m.sentOff) continue;
    tapV.set(m.pos.x, 1, m.pos.z).project(world.camera);
    const d = Math.hypot(((tapV.x + 1) / 2) * app.clientWidth - cx, ((1 - tapV.y) / 2) * app.clientHeight - cy);
    if (d < bestD) {
      bestD = d;
      best = m;
    }
  }
  if (best) s.tapPass = best;
});

toMenu();
cam.snap(new THREE.Vector3(0, 0, 0));

const headPos = new THREE.Vector3();
/** Positions at the previous sim step, so rendering can interpolate between steps (smooth at any refresh rate). */
interface Snap {
  px: Float32Array;
  pz: Float32Array;
  pf: Float32Array;
  ball: THREE.Vector3;
}
function snapshot(into?: Snap): Snap {
  const ps = game.s.players;
  const sn = into ?? { px: new Float32Array(ps.length), pz: new Float32Array(ps.length), pf: new Float32Array(ps.length), ball: new THREE.Vector3() };
  ps.forEach((p, i) => {
    sn.px[i] = p.pos.x;
    sn.pz[i] = p.pos.z;
    sn.pf[i] = p.facing;
  });
  sn.ball.set(game.s.ball.pos.x, game.s.ball.pos.y, game.s.ball.pos.z);
  return sn;
}
prev = snapshot();
const ballR = new THREE.Vector3();
const ballV = new THREE.Vector3();
const focus = new THREE.Vector3();
const playerR = new THREE.Vector3();
const lerpAngle = (a: number, b: number, t: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

startLoop(
  (dt) => {
    if (frozen) return;
    input.poll();
    if (input.pressed('pause')) togglePause();
    snapshot(prev);
    if (!paused && !replay.active && !settingsOpen) {
      game.update(dt, input);
      handleEvents();
      const s = game.s;
      if (s.phase === 'play' || s.phase === 'restart' || (s.phase === 'goal' && s.phaseT < 0.8)) replay.record(s);
      if (s.phase === 'goal' && s.phaseT > 2.4 && s.humanActive && replay.canStart()) {
        replay.begin(s);
        hud.replay(true);
      }
    }
    input.endStep();
  },
  (fdt, alpha) => {
    if (frozen) return;
    elapsed += fdt;
    quality.tick(fdt);
    if (settings.showFps) fpsEl.textContent = `${Math.round(quality.fps)} fps · ${quality.dpr.toFixed(2)}x`;
    const s = game.s;
    const dt = paused || settingsOpen ? 0 : fdt;
    // Replays move the state directly; don't interpolate across those jumps
    const a = replay.active ? 1 : alpha;
    views.forEach((v, i) => {
      const p = v.player;
      const o = s.phase === 'fulltime' && s.phaseT > 1.5 ? (s.score[p.team] > s.score[1 - p.team] ? 'win' : s.score[p.team] < s.score[1 - p.team] ? 'lose' : 'draw') : null;
      const at = { x: prev.px[i] + (p.pos.x - prev.px[i]) * a, z: prev.pz[i] + (p.pos.z - prev.pz[i]) * a, facing: lerpAngle(prev.pf[i], p.facing, a) };
      v.update(dt, p.holdingBall && p.role !== 'GK', { ball: s.ball.pos, outcome: o }, at);
    });
    ballR.set(s.ball.pos.x, s.ball.pos.y, s.ball.pos.z).sub(prev.ball).multiplyScalar(a).add(prev.ball);
    ballView.update(dt, ballR, s.ball.vel);
    const c = s.controlled;
    const ci = s.players.indexOf(c);
    playerR.set(prev.px[ci] + (c.pos.x - prev.px[ci]) * a, 0, prev.pz[ci] + (c.pos.z - prev.pz[ci]) * a);
    marker.position.copy(playerR);
    marker.rotation.y = c.facing;
    marker.visible = s.humanActive && s.phase !== 'goal' && s.phase !== 'fulltime';
    if (replay.active) {
      const first = replay.progress < 0.55;
      const still = replay.step(s, fdt);
      if (still) {
        const side = replay.goalSide;
        const b = s.ball.pos;
        if (first) cam.shot(fdt, new THREE.Vector3(side * (PITCH.halfL + 7), 2.2, b.z * 0.35 + 5), new THREE.Vector3(b.x, 0.8, b.z), replay.progress < 0.01);
        else cam.shot(fdt, new THREE.Vector3(b.x - side * 9, 3.4, b.z + 11), new THREE.Vector3(b.x, 0.9, b.z), replay.progress < 0.565 && replay.progress > 0.55);
      } else endReplay();
    } else {
      cam.mode = s.phase === 'goal' && s.phaseT > 0.6 ? 'celebrate' : 'play';
      ballV.set(s.ball.vel.x, 0, s.ball.vel.z);
      const sc = s.scorer ? new THREE.Vector3(s.scorer.pos.x, 0, s.scorer.pos.z) : undefined;
      cam.update(fdt, { ball: ballR, ballVel: ballV, player: playerR, playerFacing: c.facing, attackDir: s.attackDir[s.humanTeam], subject: sc });
    }
    // Shadows follow the action
    focus.copy(ballR);
    followShadow(world, focus.x, focus.z);
    const danger = Math.max(0, Math.abs(s.ball.pos.x) - 30) / 22;
    stadium.update(elapsed, s.excitement, fdt);
    sound.crowd(Math.max(s.excitement, danger * 0.35));
    headPos.set(playerR.x, 2.3, playerR.z).project(world.camera);
    const scr = { x: ((headPos.x + 1) / 2) * app.clientWidth, y: ((1 - headPos.y) / 2) * app.clientHeight };
    hud.update(s, game.minute, scr, s.humanActive);
    if (touch) touch.classList.toggle('defending', !!s.owner && s.owner.team !== s.humanTeam);
    if (post) post.render(world.scene, world.camera, fdt);
    else world.renderer.render(world.scene, world.camera);
  },
);

// Debug / test hook
(window as unknown as { __pitchside: unknown }).__pitchside = {
  get game() {
    return game;
  },
  world,
  freeze: (on: boolean) => {
    frozen = on;
  },
  tick: (dt: number) => {
    const s = game.s;
    for (const v of views) v.update(dt, v.player.holdingBall && v.player.role !== 'GK', { ball: s.ball.pos, outcome: null });
    ballView.update(dt, s.ball.pos, s.ball.vel);
  },
  render: () => (post ? post.render(world.scene, world.camera, 1 / 60) : world.renderer.render(world.scene, world.camera)),
  quality,
  settings,
  applySettings,
  inputMove: () => input.move(),
  topDown: () => {
    world.camera.position.set(30, 70, 0.01);
    world.camera.lookAt(30, 0, 0);
    world.renderer.render(world.scene, world.camera);
  },
  start: (h: number, a: number, time: TimeOfDay = 'evening') => startMatch({ home: TEAMS[h], away: TEAMS[a], halfSeconds: 180, time, difficulty: 1 }, true),
};
