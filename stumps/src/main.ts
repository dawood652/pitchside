// Stumps: tap where you want the ball to go, as it arrives. The batting engine picks the stroke,
// swings the bat through the ball and the fielders do the rest. This file runs the loop and
// wires the gameplay to the 3D view (render3d), the HUD and the menus (ui).
import Phaser from 'phaser';
import './ui/ui.css';
import { BallSample, BatPose, bowl, Contact, Delivery, findContact, Flight, fly, hitsStumps, makeDelivery, sampleAt, Swing, timeAtZ } from './batting/physics';
import { Shot } from './batting/shots';
import { Band, idealTap, planShot } from './batting/plan';
import { batter, Skeleton } from './batting/body';
import { Cam } from './render';
import { World3D } from './render3d/world3d';
import { lerp, v, V } from './batting/vec';
import { field, FIELD, fielderPos, FieldResult } from './fielding';
import { DEFAULT_ADS, loadAds } from './ads';
import { audioStart, setMusic, setSfx, sfx, startAmbience } from './audio';
import { Match, store, TEAMS } from './ui/match';
import { Hud } from './ui/hud';
import { Screens, Settings } from './ui/screens';
import { readPad } from './input';

const RUNUP = 1.3;
const LOFT_DIST = 64;
const LENGTHS: Record<string, string> = { yorker: 'Yorker', full: 'Full', good: 'Good length', short: 'Short', bouncer: 'Bouncer' };
const CAMS = { broadcast: { pos: v(-0.5, 5.4, -10.5), look: v(0, -0.4, 14), zoom: 1010 / 540 }, close: { pos: v(-0.7, 2.5, -4.4), look: v(0, 0.1, 12), zoom: 700 / 540 } };
type Phase = 'menu' | 'intro' | 'runup' | 'ball' | 'result' | 'replay' | 'over';

class Game extends Phaser.Scene {
  private g!: Phaser.GameObjects.Graphics;
  private cam = new Cam();
  private phase: Phase = 'menu';
  private paused = false;
  private t = 0;
  private clock = 0;
  private d!: Delivery;
  private path!: BallSample[];
  private T = 0;
  private tIdeal = 0;
  private swing: Swing | null = null;
  private shot: Shot | null = null;
  private tapT: number | null = null;
  private band: Band = 'Off';
  private errMs = 0;
  private lofted = false;
  private prevPose: BatPose | null = null;
  private contact: Contact | null = null;
  private flight: Flight | null = null;
  private fres: FieldResult | null = null;
  private behind: boolean | null = null; // edge to the keeper: caught?
  private target: V | null = null;
  private hover: V | null = null;
  private bowled = false;
  private settled = false;
  private skel!: Skeleton;
  private m = new Match();
  private world: World3D | null = null;
  private hud!: Hud;
  private screens!: Screens;
  private r = Math.random;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private padAim: number | null = null;
  private wantReplay = false;
  private endBt = 0;
  private perf = { ms: 0, frames: 0, done: false };
  private rt = 0; // replay ball time
  private replayEnd = 0;

  create(): void {
    this.g = this.add.graphics();
    this.hud = new Hud(document.getElementById('hud')!);
    this.screens = new Screens(document.getElementById('ui')!, this.m, {
      play: () => this.start(),
      resume: () => this.setPaused(false),
      restart: () => {
        this.paused = false;
        this.start();
      },
      quit: () => {
        this.paused = false;
        this.toMenu();
      },
      settingsChanged: (s) => this.applySettings(s),
    });
    this.applySettings(this.screens.settings);
    this.scale.on('resize', () => this.fit());
    this.fit();
    // input: touch / mouse
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if ((p.event as PointerEvent | undefined)?.pointerType === 'mouse' || !p.wasTouch) this.hover = this.cam.ground(p.x, p.y);
    });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.press(this.cam.ground(p.x, p.y)));
    this.hud.pause.addEventListener('click', () => this.setPaused(true));
    // keyboard
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('LEFT,RIGHT,UP,DOWN,SPACE,SHIFT') as Record<string, Phaser.Input.Keyboard.Key>;
    kb.on('keydown', (e: KeyboardEvent) => this.key(e));
    document.addEventListener('visibilitychange', () => document.hidden && this.inPlay() && this.setPaused(true));
    (window as unknown as { __scene: unknown }).__scene = this; // test hook
    const canvas = this.game.canvas;
    World3D.create(document.getElementById('world')!, () => canvas.getBoundingClientRect()).then((w) => {
      this.world = w;
      w.setAds(DEFAULT_ADS);
      loadAds().then((a) => w.setAds(a));
      w.setTeams(TEAMS[this.m.team].kit, TEAMS[this.m.opp].kit);
      w.setQuality(this.screens.settings.quality);
      document.getElementById('boot')?.classList.add('gone');
    });
    this.d = makeDelivery(this.r);
    this.path = bowl(this.d);
    this.T = timeAtZ(this.path, 1.2);
    this.toMenu();
  }

  private fit(): void {
    this.cam.setViewport(this.scale.width, this.scale.height);
    this.world?.resize();
  }

  private applySettings(s: Settings): void {
    setMusic(s.music && this.phase !== 'menu');
    setSfx(s.sfx);
    this.world?.setQuality(s.quality);
    this.cam.zoom = CAMS[s.camera].zoom;
    this.fit();
  }

  private inPlay(): boolean {
    return this.phase === 'runup' || this.phase === 'ball' || this.phase === 'result' || this.phase === 'replay';
  }

  private setPaused(on: boolean): void {
    if (on === this.paused || (on && !this.inPlay())) return;
    this.paused = on;
    if (on) this.screens.pause();
    else this.screens.hide();
    this.hud.show(!on);
  }

  // ---------------------------------------------------------------- flow
  private toMenu(): void {
    this.phase = 'menu';
    this.hud.show(false);
    this.world?.setAim(null, false, false);
    setMusic(false);
    this.screens.title();
  }

  private start(): void {
    this.world?.setTeams(TEAMS[this.m.team].kit, TEAMS[this.m.opp].kit);
    audioStart();
    startAmbience();
    setMusic(this.screens.settings.music);
    this.m.start(this.r);
    this.phase = 'intro';
    this.resetBall();
    this.screens.intro(() => {
      this.screens.hide();
      this.hud.show(true);
      this.hud.score(this.m);
      this.next();
    });
  }

  private finish(): void {
    this.phase = 'over';
    this.hud.show(false);
    this.world?.setAim(null, false, false);
    this.screens.result(() => this.start());
  }

  private resetBall(): void {
    this.swing = this.shot = this.contact = this.flight = this.fres = null;
    this.behind = null;
    this.tapT = null;
    this.prevPose = null;
    this.target = null;
    this.bowled = this.settled = false;
    const c = CAMS[this.screens.settings.camera];
    this.cam.pos = { ...c.pos };
    this.cam.look = { ...c.look };
    this.cam.setViewport(this.cam.w, this.cam.h); // back to the batting lens after the wide shot
    this.cam.update();
  }

  private next(): void {
    this.phase = 'runup';
    this.t = 0;
    this.d = makeDelivery(this.r, [0.9, 1, 1.12][this.m.diff]);
    this.path = bowl(this.d);
    this.T = timeAtZ(this.path, 1.2);
    this.tIdeal = idealTap(this.d, this.path);
    this.resetBall();
    this.hud.clearFeedback();
    const first = !store.get('played', false);
    this.hud.setHint(first && this.m.balls < 3 ? ['Tap the field where you want to hit it, as the ball arrives', 'Tap when the white line is in the green', 'Turn on LOFT to hit it in the air'][this.m.balls] : '');
  }

  private ballTime(): number {
    return this.phase === 'runup' ? this.t - RUNUP : this.phase === 'ball' ? this.t : this.phase === 'replay' ? this.rt : 99;
  }

  private isLofted(p: V): boolean {
    return this.hud.loftOn || this.keys?.SHIFT.isDown || Math.hypot(p.x, p.z) > LOFT_DIST;
  }

  /** A tap/click/button: hit if the ball is coming, skip the replay if it's over. */
  private press(target: V): void {
    if (this.paused) return;
    if ((this.phase === 'result' && this.t > 0.7) || this.phase === 'replay') return this.advance();
    this.hit(target);
  }

  /** The hit: pick the shot for that spot and this ball, start the downswing now. */
  private hit(target: V): void {
    const bt = this.ballTime();
    if (this.phase !== 'ball' || this.tapT !== null || bt < 0.05 || bt > this.T + 0.05) return;
    const lofted = this.isLofted(target);
    const aim = Math.atan2(target.x, target.z);
    const dist = Math.hypot(target.x, target.z);
    const plan = planShot(aim, lofted ? Math.max(dist, 70) : Math.min(dist, LOFT_DIST - 1), lofted, this.d, this.path, bt, this.r);
    this.swing = plan.swing;
    this.shot = plan.shot;
    this.tapT = bt;
    this.prevPose = this.skel?.bat ?? null;
    this.target = target;
    this.band = plan.band;
    this.lofted = plan.lofted;
    this.errMs = Math.round(plan.err * 1000);
    this.hud.timing(plan.band, this.errMs);
    this.hud.setChip(plan.shot.name.toUpperCase());
    this.hud.setHint('');
  }

  private key(e: KeyboardEvent): void {
    const k = e.key;
    if (!this.screensHidden()) {
      const dir = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'press', ' ': 'press' }[k] as 'up' | 'down' | 'left' | 'right' | 'press' | undefined;
      if (k === 'Escape' && this.paused) return this.setPaused(false);
      if (dir && this.screens.nav(dir)) e.preventDefault();
      return;
    }
    if (k === 'Escape' || k === 'p' || k === 'P') return this.setPaused(true);
    if (k === ' ') this.press(this.aimFromKeys());
    if (k === 'l' || k === 'L') this.hud.setLoft(!this.hud.loftOn);
  }

  private screensHidden(): boolean {
    return (document.getElementById('ui') as HTMLElement).hidden;
  }

  private aimFromKeys(): V {
    const k = this.keys;
    const dx = (k.RIGHT.isDown ? 1 : 0) - (k.LEFT.isDown ? 1 : 0);
    const dy = (k.UP.isDown ? 1 : 0) - (k.DOWN.isDown ? 1 : 0);
    const a = dx || dy ? Math.atan2(dx, dy) : 0;
    const dist = this.isLofted(v(0, 0, 0)) ? 80 : 45;
    return v(Math.sin(a) * dist, 0, Math.cos(a) * dist);
  }

  private pollPad(): void {
    const p = readPad();
    if (!p.connected) return;
    this.padAim = p.aim;
    if (!this.screensHidden()) {
      const map: [number, 'up' | 'down' | 'left' | 'right' | 'press'][] = [[12, 'up'], [13, 'down'], [14, 'left'], [15, 'right'], [0, 'press']];
      for (const [b, d] of map) if (p.pressed.has(b)) this.screens.nav(d);
      if ((p.pressed.has(9) || p.pressed.has(1)) && this.paused) this.setPaused(false);
      return;
    }
    if (p.pressed.has(9)) return this.setPaused(true);
    const lofted = p.held.has(2) || p.held.has(5) || p.held.has(7) || this.hud.loftOn;
    if (p.pressed.has(0) || p.pressed.has(2)) {
      const a = p.aim ?? 0;
      const dist = lofted ? 80 : 45;
      this.press(v(Math.sin(a) * dist, 0, Math.cos(a) * dist));
    }
  }

  // ---------------------------------------------------------------- outcomes
  /** Timing pays: perfect + lofted = six, perfect along the ground = four, good = four. */
  private reward(c: Contact): Flight {
    let f = fly(c.p, c.out);
    if (this.band === 'Off' || this.band === 'Miss' || c.quality === 'edge') return f;
    const want = this.band === 'PERFECT' && this.lofted ? 6 : 4;
    let out = { ...c.out };
    if (want === 6 && out.y < 9) out.y = 9;
    for (let i = 0; i < 12 && (f.boundary ?? 0) < want; i++) {
      out = { x: out.x * 1.08, y: want === 6 ? out.y * 1.05 : Math.min(out.y, 2), z: out.z * 1.08 };
      f = fly(c.p, out);
    }
    if (want === 4 && f.boundary === 6) return fly(c.p, { x: out.x, y: Math.min(out.y, 2), z: out.z });
    return f;
  }

  private boundaryResult(f: Flight): FieldResult {
    const i = Math.max(0, f.path.findIndex((s) => Math.hypot(s.p.x, s.p.z) >= 65));
    return { kind: f.boundary === 6 ? 'six' : 'four', fielder: null, t: f.path[i].t - f.path[0].t, runs: f.boundary!, at: f.path[i].p };
  }

  private record(runs: number, out: boolean, how: string): void {
    this.endBt = this.ballTime();
    const f = this.flight;
    const end = this.fres?.at ?? (f ? f.path[f.path.length - 1].p : null);
    this.m.log.push({
      runs,
      out,
      how,
      shot: this.shot?.name ?? null,
      band: this.tapT === null ? null : this.band,
      errMs: this.tapT === null ? null : this.errMs,
      dist: end ? Math.hypot(end.x, end.z) : 0,
      angle: end && this.contact ? Math.atan2(end.x, end.z) : null,
    });
    const kind = out ? 'out' : runs === 6 ? 'six' : runs === 4 ? 'four' : runs ? 'runs' : 'dot';
    const big = out ? how : runs === 6 ? 'SIX!' : runs === 4 ? 'FOUR!' : runs ? `${runs} RUN${runs > 1 ? 'S' : ''}` : how;
    const dist = end && this.contact && runs >= 4 ? ` · ${Math.round(Math.hypot(end.x, end.z))} m` : '';
    const small = out ? (this.shot ? this.shot.name : '') : this.shot ? `${this.shot.name}${dist}` : '';
    this.hud.bannerShow(big, small.toUpperCase(), kind);
    this.world?.celebrate(kind);
    this.wantReplay = kind === 'six' || kind === 'four' || kind === 'out';
    if (out) sfx.crowd(false);
    if (runs >= 4) sfx.crowd(runs === 6);
    this.hud.score(this.m);
    this.phase = 'result';
    this.t = 0;
  }

  private startReplay(): void {
    this.wantReplay = false;
    this.phase = 'replay';
    this.rt = Math.max(-0.45, (this.tapT ?? this.T - 0.5) - 0.55);
    this.replayEnd = this.contact ? this.contact.t + Math.min(this.fres?.t ?? 1.2, 3.2) + 0.5 : this.T + 0.9;
    this.hud.clearFeedback();
    this.hud.setChip('REPLAY');
    this.hud.setHint('Tap to skip');
  }

  private advance(): void {
    this.hud.setHint('');
    store.set('played', true);
    if (this.m.done()) this.finish();
    else this.next();
  }

  /** First few seconds of play: if the device can't hold ~40 fps on High, drop to Battery saver once. */
  private autoQuality(ms: number): void {
    const p = this.perf;
    const st = this.screens.settings;
    if (p.done || this.paused || !this.inPlay() || st.quality !== 'high') return;
    p.ms += ms;
    p.frames++;
    if (p.ms < 4000) return;
    p.done = true;
    if ((p.frames * 1000) / p.ms < 38) {
      st.quality = 'low';
      store.set('settings', st);
      this.applySettings(st);
      this.hud.setHint('Switched to Battery saver graphics for smoother play (Settings to change)');
    }
  }

  // ---------------------------------------------------------------- loop
  update(_: number, deltaMs: number): void {
    const dt = Math.min(0.05, deltaMs / 1000);
    this.clock += dt;
    this.autoQuality(deltaMs);
    this.pollPad();
    if (!this.paused) this.step(dt);
    this.view(dt);
  }

  private step(dt: number): void {
    this.t += dt;
    if (this.phase === 'runup' && this.t >= RUNUP) {
      this.phase = 'ball';
      this.t = 0;
      this.hud.setChip(`${Math.round(this.d.speed * 3.6)} km/h · ${LENGTHS[this.d.length]}`);
    }
    const bt = this.ballTime();
    if (this.phase === 'ball' && this.swing && !this.contact) {
      const c = findContact(this.swing, this.path, Math.max(this.tapT!, bt - dt), bt);
      if (c) {
        this.contact = c;
        this.flight = this.reward(c);
        sfx.bat(c.quality === 'middle' ? 1 : 0.4);
        if (c.quality === 'edge') sfx.edge();
        if (c.quality === 'edge' && c.out.z < 2 && this.flight.maxH < 2.2) this.behind = this.r() < 0.6;
        else this.fres = this.flight.boundary && (this.band === 'PERFECT' || this.band === 'Good') ? this.boundaryResult(this.flight) : field(this.flight, this.r);
        const q = { middle: 'MIDDLED', toe: 'OFF THE TOE', splice: 'OFF THE SPLICE', edge: 'EDGED' }[c.quality];
        this.hud.setChip(`${this.shot!.name.toUpperCase()} · ${q} · ${Math.round(Math.hypot(c.out.x, c.out.y, c.out.z) * 3.6)} km/h`);
      }
    }
    if (this.phase === 'ball' && !this.settled) {
      if (bt > this.T + 0.35 && !this.contact) {
        this.settled = true;
        this.bowled = hitsStumps(this.path, this.tapT ?? 0);
        if (this.bowled) sfx.stumps();
        this.record(0, this.bowled, this.bowled ? 'BOWLED!' : this.tapT === null ? 'LEFT ALONE' : 'BEATEN');
      } else if (this.contact && this.behind !== null && bt > this.contact.t + 0.5) {
        this.settled = true;
        this.record(this.behind ? 0 : 1, this.behind, this.behind ? 'CAUGHT BEHIND!' : 'EDGED');
      } else if (this.contact && this.fres && bt > this.contact.t + Math.min(this.fres.t, 4) + 0.5) {
        this.settled = true;
        const f = this.fres;
        this.record(f.runs, f.kind === 'caught', f.kind === 'caught' ? 'CAUGHT!' : f.kind === 'dropped' ? 'DROPPED!' : `${f.runs}`);
      }
    }
    if (this.phase === 'result' && this.wantReplay && this.t > 1.9) this.startReplay();
    else if (this.phase === 'result' && this.t > 2.4) this.advance();
    if (this.phase === 'replay') {
      // slow motion around the hit (or the stumps), normal speed for the ball's flight
      const key = this.contact ? this.contact.t : this.T;
      this.rt += dt * (Math.abs(this.rt - key) < 0.3 ? 0.22 : 0.75);
      if (this.rt > this.replayEnd) this.advance();
    }
    // after the hit: rise to a high, wide view of the whole ground (lens widens too), drifting a
    // little toward the ball so you see where it goes and who chases it
    if (this.contact && this.flight && bt > this.contact.t + 0.25 && this.behind === null) {
      const b = this.ballPos(bt);
      if (b) {
        const k = Math.min(1, dt * 3.2);
        const g = v(b.x * 0.3, 0, 6 + b.z * 0.3);
        this.cam.pos = lerp(this.cam.pos, v(g.x, 92, g.z - 24), k);
        this.cam.look = lerp(this.cam.look, g, k);
        this.cam.F += (0.95 * this.cam.h - this.cam.F) * k;
        this.cam.update();
      }
    }
  }

  private ballPos(bt: number): V | null {
    if (this.contact && this.flight && bt >= this.contact.t) {
      const ft = bt - this.contact.t;
      if (this.fres && (this.fres.kind === 'caught' || this.fres.kind === 'stopped') && ft >= this.fres.t) {
        const p = fielderPos(this.fres.fielder!, this.fres, ft, null);
        return v(p.x, 1.1, p.z);
      }
      return this.flight.path[Math.min(this.flight.path.length - 1, Math.floor(ft * 120))].p;
    }
    if (this.phase === 'ball' || this.phase === 'replay') return sampleAt(this.path, Math.max(0, bt)).p;
    if (this.phase === 'result' && !this.contact) return sampleAt(this.path, this.T + 0.35 + Math.min(this.t, 0.3)).p;
    return null;
  }

  /** Replay cameras: side-on at the batter, a low stump cam for bowleds, then chase the ball. */
  private replayCam(bt: number, dt: number): void {
    const c = this.cam;
    if (!this.contact) {
      c.pos = this.bowled ? v(0.5, 0.45, -1.6) : v(3.6, 1.2, 0.9);
      c.look = this.bowled ? v(0, 0.5, 6) : v(-0.2, 0.95, 1.4);
    } else if (bt < this.contact.t + 0.25) {
      c.pos = v(3.4, 1.35, 1.6);
      c.look = v(-0.2, 1.0, 1.3);
    } else {
      const b = this.ballPos(bt) ?? v(0, 1, 10);
      const d = Math.hypot(b.x, b.z) || 1;
      const want = v(b.x - (b.x / d) * 9, 2.2 + b.y * 0.5, b.z - (b.z / d) * 9);
      c.pos = lerp(c.pos, want, Math.min(1, dt * 2.5));
      c.look = lerp(c.look, b, Math.min(1, dt * 5));
    }
    c.update();
  }

  private view(dt: number): void {
    const bt = this.ballTime();
    const menuish = this.phase === 'menu' || this.phase === 'over' || this.phase === 'intro';
    if (this.phase === 'replay') this.replayCam(bt, dt);
    if (menuish) {
      // slow orbit round the ground behind the menus
      const a = this.clock * 0.06;
      this.cam.pos = v(Math.sin(a) * 34, 12, 10 + Math.cos(a) * 34);
      this.cam.look = v(0, 0.5, 8);
      this.cam.update();
    }
    const tb = menuish ? -2 : bt === 99 ? this.endBt + this.t : bt; // keep the batter's clock running after the ball (no frozen pose)
    this.skel = batter({ delivery: menuish || (this.phase === 'runup' && this.t < 0.1) ? null : this.d, path: this.path, t: tb, T: this.T, swing: this.swing, prevPose: this.prevPose, tapT: this.tapT });
    const bz = this.phase === 'runup' ? 20.12 + 9 * (1 - this.t / RUNUP) + 0.6 : 20.12 + 0.6 - Math.min(2, Math.max(0, bt) * 3);
    const ft = this.contact ? (this.phase === 'result' ? Math.min(this.fres?.t ?? 1, 4) + this.t : bt - this.contact.t) : 0;
    const ball = menuish || this.phase === 'runup' ? null : this.ballPos(this.phase === 'result' && this.contact ? this.contact.t + ft : bt);
    const fielders = FIELD.map((_, k) => fielderPos(k, this.contact ? this.fres : null, ft, ball));
    if (this.world) {
      const bphase = this.phase === 'runup' ? (this.t < RUNUP - 0.45 ? 'run' : 'bowl') : this.phase === 'ball' && bt < 0.5 ? 'bowl' : menuish ? 'idle' : 'follow';
      const look = this.phase === 'runup' ? v(0.4, 2, bz) : ball;
      // aim ring: the mouse hover / pad stick before the hit, the chosen spot after it
      const padTarget = this.padAim !== null ? v(Math.sin(this.padAim) * 45, 0, Math.cos(this.padAim) * 45) : null;
      const aim = menuish ? null : this.target && !this.contact ? this.target : !this.target && (this.phase === 'runup' || this.phase === 'ball') ? (padTarget ?? this.hover) : null;
      this.world.setAim(aim, aim ? this.isLofted(aim) : false, !!this.target);
      this.world.frame(this.cam, { batter: this.skel, ball, ballLook: look, fielders, keeper: v(1.0, 0, -3.0), bowler: { z: menuish ? 26 : bz, phase: menuish ? 'idle' : bphase, t: menuish ? null : bt }, bowled: this.bowled && (this.phase === 'result' || (this.phase === 'replay' && bt > this.T + 0.02)) }, dt);
    }
    if (!menuish) {
      const live = this.phase === 'runup' || this.phase === 'ball';
      if (this.phase === 'replay') this.hud.meter(null, null, false);
      this.hud.meter(live ? bt - this.tIdeal : null, this.tapT === null ? null : this.tapT - this.tIdeal, live || (this.phase === 'result' && this.t < 0.8));
      const trail = this.flight && this.contact ? this.flight.path.slice(0, Math.max(1, Math.floor(ft * 120))).filter((_, i) => i % 6 === 0).map((s) => s.p) : null;
      this.hud.drawMap(this.m, { fielders, trail }, TEAMS[this.m.opp].kit);
    }
    this.g.clear();
    // wide shot: players and ball are tiny from up there, so mark them (team-coloured dots, a
    // bright ring and shadow for the ball)
    if (!menuish && this.cam.pos.y > 25) {
      const fade = Math.min(1, (this.cam.pos.y - 25) / 25);
      const kit = TEAMS[this.m.opp].kit;
      for (const f of fielders) {
        const q = this.cam.p(f);
        if (q.s <= 0) continue;
        this.g.fillStyle(0x000000, 0.35 * fade).fillCircle(q.x, q.y + 1, 7);
        this.g.fillStyle(kit, fade).fillCircle(q.x, q.y, 5.5);
        this.g.lineStyle(1.5, 0xffffff, fade).strokeCircle(q.x, q.y, 5.5);
      }
      const bp = this.ballPos(bt);
      if (bp) {
        const sh = this.cam.p(v(bp.x, 0, bp.z));
        const q = this.cam.p(bp);
        if (q.s > 0) {
          this.g.fillStyle(0x000000, 0.3 * fade).fillEllipse(sh.x, sh.y, 10, 5);
          this.g.lineStyle(2.5, 0xffe14d, fade).strokeCircle(q.x, q.y, 9);
          this.g.fillStyle(0xffffff, fade).fillCircle(q.x, q.y, 3.5);
        }
      }
    }
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  transparent: true,
  scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
  render: { antialias: true },
  scene: Game,
});
