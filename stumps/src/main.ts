// Stumps: chase a target in a short match. Tap where you want the ball to go, as it arrives.
// Batting: shot chosen from the tap + the ball's length, bat swung on an arc through the ball,
// continuous bat-ball collision. Then fielders try to stop it or catch it.
import Phaser from 'phaser';
import { aimedSwing, BallSample, BatPose, bowl, Contact, Delivery, findContact, Flight, fly, hitsStumps, makeDelivery, sampleAt, Swing, timeAtZ } from './batting/physics';
import { chooseShot, Shot } from './batting/shots';
import { batter, Skeleton } from './batting/body';
import { Cam, drawBall, drawBatter, drawBoundary, drawBowler, drawFielder, drawGround, drawStumps, VH, VW } from './render';
import { lerp, v, V } from './batting/vec';
import { field, FIELD, fielderPos, FieldResult } from './fielding';
import { Ad, DEFAULT_ADS, loadAds } from './ads';
import { audioStart, setMusic, sfx, startAmbience } from './audio';

const LEAD = 0.17; // tap -> bat on the ball (the downswing)
const RUNUP = 1.3;
const PERFECT = 0.035;
const GOOD = 0.08;
const TEAMS = [
  { name: 'Indus Tigers', kit: 0x0f8a4c },
  { name: 'Thames Royals', kit: 0x1d4ed8 },
  { name: 'Harbour Hawks', kit: 0xf59e0b },
  { name: 'Desert Falcons', kit: 0xb91c1c },
  { name: 'Island Cyclones', kit: 0x7c3aed },
  { name: 'Savanna Storm', kit: 0x0e7490 },
];
const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

type Phase = 'menu' | 'runup' | 'ball' | 'result' | 'over';
interface Match {
  team: number;
  opp: number;
  overs: number;
  diff: number;
  target: number;
  runs: number;
  wkts: number;
  maxW: number;
  balls: number;
  last: string[];
}

const overlay = document.getElementById('ui')!;
const musicBtn = document.getElementById('music') as HTMLButtonElement;
let musicOn = true;

class Game extends Phaser.Scene {
  private g!: Phaser.GameObjects.Graphics;
  private ui!: Phaser.GameObjects.Graphics;
  private cam = new Cam();
  private phase: Phase = 'menu';
  private t = 0;
  private d!: Delivery;
  private path!: BallSample[];
  private T = 0;
  private tIdeal = 0;
  private swing: Swing | null = null;
  private shot: Shot | null = null;
  private tapT: number | null = null;
  private band: 'PERFECT' | 'Good' | 'Off' = 'Off';
  private lofted = false;
  private prevPose: BatPose | null = null;
  private contact: Contact | null = null;
  private flight: Flight | null = null;
  private fres: FieldResult | null = null;
  private behind: boolean | null = null; // edge to the keeper: caught?
  private target: V | null = null;
  private bowled = false;
  private settled = false;
  private skel!: Skeleton;
  private m: Match = { team: 0, opp: 1, overs: 2, diff: 1, target: 0, runs: 0, wkts: 0, maxW: 3, balls: 0, last: [] };
  private texts: Record<string, Phaser.GameObjects.Text> = {};
  private boards: Phaser.GameObjects.Text[] = [];
  private ads: Ad[] = DEFAULT_ADS;
  private r = Math.random;
  private padPrev: boolean[] = [];
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;

  create(): void {
    this.g = this.add.graphics();
    this.ui = this.add.graphics();
    this.cam.update();
    const style = (size: number, color = '#ffffff') => ({ fontFamily: 'system-ui, -apple-system, sans-serif', fontSize: `${size}px`, color, fontStyle: '800', stroke: '#000000', strokeThickness: 4 });
    // big billboards across the top of the stands (sold via ads.json)
    for (let i = 0; i < 2; i++) this.boards.push(this.add.text(0, 0, '', { fontFamily: 'system-ui, sans-serif', fontSize: '15px', fontStyle: '900', color: '#ffffff', align: 'center', padding: { x: 10, y: 5 } }).setOrigin(0.5));
    this.texts.score = this.add.text(16, 12, '', style(22));
    this.texts.need = this.add.text(16, 42, '', style(16, '#ffd166'));
    this.texts.last = this.add.text(16, 66, '', style(15));
    this.texts.shot = this.add.text(VW / 2, 70, '', style(30, '#ffd166')).setOrigin(0.5);
    this.texts.detail = this.add.text(VW / 2, 108, '', style(17)).setOrigin(0.5);
    this.texts.timing = this.add.text(VW / 2, VH - 64, '', style(18)).setOrigin(0.5);
    this.texts.help = this.add.text(VW / 2, VH - 20, 'Tap where you want it as the ball arrives · tap the crowd to loft it · green on the meter = perfect', style(13, '#e8eef2')).setOrigin(0.5);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.tap(this.cam.ground(p.x, p.y)));
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('LEFT,RIGHT,UP,DOWN,SPACE,SHIFT') as Record<string, Phaser.Input.Keyboard.Key>;
    kb.on('keydown-SPACE', () => this.tap(this.aimFromKeys()));
    kb.on('keydown-ENTER', () => (overlay.querySelector('#go, #again') as HTMLButtonElement | null)?.click());
    (window as unknown as { __scene: unknown }).__scene = this; // test hook
    loadAds().then((a) => (this.ads = a));
    this.d = makeDelivery(this.r);
    this.path = bowl(this.d);
    this.T = timeAtZ(this.path, 1.2);
    this.menu();
  }

  // ---------------------------------------------------------------- menus
  private menu(): void {
    this.phase = 'menu';
    const m = this.m;
    const opt = (k: 'overs' | 'diff', vals: [number, string][]) => vals.map(([val, l]) => `<button data-k="${k}" data-v="${val}" class="${m[k] === val ? 'on' : ''}">${l}</button>`).join('');
    overlay.innerHTML = `<div class="card"><h1>STUMPS</h1><p class="sub">Tap where you want it. Time it in the green for SIX.</p>
      <div class="row"><button id="tp">‹</button><b style="color:${hex(TEAMS[m.team].kit)}">${TEAMS[m.team].name}</b><button id="tn">›</button></div>
      <div class="row small">vs <b>${TEAMS[m.opp].name}</b></div>
      <div class="row">${opt('overs', [[1, '1 over'], [2, '2 overs'], [5, '5 overs']])}</div>
      <div class="row">${opt('diff', [[0, 'Club'], [1, 'Pro'], [2, 'Legend']])}</div>
      <button id="go" class="go">BAT ›</button>
      <p class="help">Tap / click the ground where you want the ball to go, as it arrives. Tap the crowd for a lofted shot.<br>PS5: aim with the stick, ✕ along the ground, □ lofted · Keyboard: arrows + Space, hold Shift to loft</p></div>`;
    overlay.hidden = false;
    overlay.querySelectorAll<HTMLButtonElement>('[data-k]').forEach((b) =>
      b.addEventListener('click', () => {
        (m as unknown as Record<string, number>)[b.dataset.k!] = Number(b.dataset.v);
        this.menu();
      }),
    );
    const pick = (dd: number) => {
      m.team = (m.team + dd + TEAMS.length) % TEAMS.length;
      if (m.opp === m.team) m.opp = (m.team + 1) % TEAMS.length;
      this.menu();
    };
    overlay.querySelector('#tp')!.addEventListener('click', () => pick(-1));
    overlay.querySelector('#tn')!.addEventListener('click', () => pick(1));
    overlay.querySelector('#go')!.addEventListener('click', () => this.start());
  }

  private start(): void {
    audioStart();
    startAmbience();
    setMusic(musicOn);
    const m = this.m;
    m.target = Math.round(m.overs * 6 * (1.55 + m.diff * 0.25 + this.r() * 0.3)) + 1;
    m.runs = m.wkts = m.balls = 0;
    m.maxW = m.overs === 5 ? 5 : m.overs === 2 ? 3 : 2;
    m.last = [];
    overlay.hidden = true;
    this.next();
  }

  private finish(): void {
    const m = this.m;
    const won = m.runs >= m.target;
    const tied = !won && m.runs === m.target - 1;
    this.phase = 'over';
    overlay.innerHTML = `<div class="card"><h1>${won ? 'YOU WIN' : tied ? 'TIED' : 'YOU LOSE'}</h1>
      <p class="sub">${won ? `${TEAMS[m.team].name} win with ${m.overs * 6 - m.balls} balls to spare` : tied ? 'Scores level' : `${TEAMS[m.opp].name} win by ${m.target - 1 - m.runs} runs`}</p>
      <p class="big">${m.runs}/${m.wkts} · target ${m.target}</p><button id="again" class="go">PLAY AGAIN ›</button> <button id="menu">Menu</button></div>`;
    overlay.hidden = false;
    overlay.querySelector('#again')!.addEventListener('click', () => this.start());
    overlay.querySelector('#menu')!.addEventListener('click', () => this.menu());
  }

  // ---------------------------------------------------------------- ball by ball
  private aimFromKeys(): V {
    const k = this.keys;
    const dx = (k.RIGHT.isDown ? 1 : 0) - (k.LEFT.isDown ? 1 : 0);
    const dy = (k.UP.isDown ? 1 : 0) - (k.DOWN.isDown ? 1 : 0);
    const a = dx || dy ? Math.atan2(dx, dy) : 0;
    const dist = k.SHIFT.isDown ? 90 : 50;
    return v(Math.sin(a) * dist, 0, Math.cos(a) * dist);
  }

  private next(): void {
    this.phase = 'runup';
    this.t = 0;
    this.d = makeDelivery(this.r, [0.9, 1, 1.12][this.m.diff]);
    this.path = bowl(this.d);
    this.T = timeAtZ(this.path, 1.2);
    this.tIdeal = timeAtZ(this.path, ['short', 'bouncer'].includes(this.d.length) ? 1.05 : 1.95) - LEAD;
    this.swing = this.shot = this.contact = this.flight = this.fres = null;
    this.behind = null;
    this.tapT = null;
    this.prevPose = null;
    this.target = null;
    this.bowled = this.settled = false;
    this.cam.pos = v(0.5, 2.05, -2.5);
    this.cam.look = v(0, 0.65, 9);
    this.cam.update();
    for (const k of ['shot', 'detail', 'timing']) this.texts[k].setText('');
  }

  private ballTime(): number {
    return this.phase === 'runup' ? this.t - RUNUP : this.phase === 'ball' ? this.t : 99;
  }

  /** The tap: pick the shot for that spot and this ball, and start the downswing now. */
  private tap(target: V): void {
    const bt = this.ballTime();
    if (this.phase !== 'ball' || this.tapT !== null || bt < 0.05 || bt > this.T + 0.05) return;
    const aim = Math.atan2(target.x, target.z);
    const dist = Math.hypot(target.x, target.z);
    const shot = chooseShot(aim, dist, dist > 64, this.d.length);
    const tC = timeAtZ(this.path, shot.contactZ);
    this.swing = aimedSwing(shot, sampleAt(this.path, tC).p, bt, LEAD, this.path, tC);
    this.shot = shot;
    this.tapT = bt;
    this.prevPose = this.skel?.bat ?? null;
    this.target = target;
    const err = bt - (tC - LEAD);
    const ms = Math.round(err * 1000);
    const band: 'PERFECT' | 'Good' | 'Off' = Math.abs(err) <= PERFECT ? 'PERFECT' : Math.abs(err) <= GOOD ? 'Good' : 'Off';
    this.band = band;
    this.lofted = dist > 64;
    this.texts.timing.setText(`${band} · ${ms === 0 ? 'on time' : ms < 0 ? `${-ms} ms early` : `${ms} ms late`}`).setColor(band === 'PERFECT' ? '#7CFC8A' : band === 'Good' ? '#ffd166' : '#ff7b7b');
    this.texts.shot.setText(shot.name.toUpperCase()).setColor('#ffd166');
  }

  /** Timing pays: perfect + lofted = six, perfect along the ground = four, good = four in the air. */
  private reward(c: Contact): Flight {
    let f = fly(c.p, c.out);
    if (this.band === 'Off' || c.quality === 'edge') return f;
    const want = this.band === 'PERFECT' && this.lofted ? 6 : 4;
    let out = { ...c.out };
    if (want === 6 && out.y < 9) out.y = 9; // get it up
    for (let i = 0; i < 12 && (f.boundary ?? 0) < want; i++) {
      out = { x: out.x * 1.08, y: want === 6 ? out.y * 1.05 : Math.min(out.y, 2), z: out.z * 1.08 };
      f = fly(c.p, out);
    }
    if (want === 4 && f.boundary === 6) return fly(c.p, { x: out.x, y: Math.min(out.y, 2), z: out.z });
    return f;
  }

  private boundaryResult(f: Flight): FieldResult {
    const i = Math.max(0, f.path.findIndex((s) => Math.hypot(s.p.x, s.p.z) >= 65));
    const at = f.path[i].p;
    return { kind: f.boundary === 6 ? 'six' : 'four', fielder: null, t: f.path[i].t - f.path[0].t, runs: f.boundary!, at };
  }

  private pollPad(): void {
    const gp = navigator.getGamepads?.().find((x) => x && x.connected);
    if (!gp) return;
    const b = gp.buttons.map((x) => x.pressed);
    const ax = gp.axes[0] ?? 0;
    const ay = gp.axes[1] ?? 0;
    const a = Math.hypot(ax, ay) > 0.3 ? Math.atan2(ax, -ay) : 0;
    const lofted = b[2] || b[5] || b[7];
    if ((b[0] && !this.padPrev[0]) || (b[2] && !this.padPrev[2])) {
      if (this.phase === 'menu' || this.phase === 'over') (overlay.querySelector('#go, #again') as HTMLButtonElement | null)?.click();
      else this.tap(v(Math.sin(a) * (lofted ? 90 : 50), 0, Math.cos(a) * (lofted ? 90 : 50)));
    }
    this.padPrev = b;
  }

  private record(runs: number, out: boolean, label: string, color = '#ffffff'): void {
    const m = this.m;
    m.balls++;
    m.runs += runs;
    if (out) m.wkts++;
    m.last = [...m.last, out ? 'W' : runs ? String(runs) : '•'].slice(-6);
    this.texts.shot.setText(label).setColor(color);
    if (out) sfx.crowd(false);
    if (runs >= 4) sfx.crowd(runs === 6);
    this.phase = 'result';
    this.t = 0;
  }

  update(_: number, deltaMs: number): void {
    const dt = Math.min(0.05, deltaMs / 1000);
    this.t += dt;
    this.pollPad();
    if (this.phase === 'runup' && this.t >= RUNUP) {
      this.phase = 'ball';
      this.t = 0;
    }
    const bt = this.ballTime();
    if (this.phase === 'ball' && this.swing && !this.contact) {
      const c = findContact(this.swing, this.path, Math.max(this.tapT!, bt - dt), bt);
      if (c) {
        this.contact = c;
        this.flight = this.reward(c);
        sfx.bat(c.quality === 'middle' ? 1 : 0.4);
        if (c.quality === 'edge') sfx.edge();
        // thin edge going back toward the keeper and slips
        if (c.quality === 'edge' && c.out.z < 2 && this.flight.maxH < 2.2) this.behind = this.r() < 0.6;
        else this.fres = this.flight.boundary && this.band !== 'Off' ? this.boundaryResult(this.flight) : field(this.flight, this.r);
        const kmh = Math.round(Math.hypot(c.out.x, c.out.y, c.out.z) * 3.6);
        const q = { middle: 'Middled', toe: 'Off the toe', splice: 'Off the splice', edge: 'Edged' }[c.quality];
        this.texts.detail.setText(`${q} · ${kmh} km/h off the bat`);
      }
    }
    if (this.phase === 'ball' && !this.settled) {
      if (bt > this.T + 0.35 && !this.contact) {
        this.settled = true;
        this.bowled = hitsStumps(this.path, this.tapT ?? 0);
        if (this.bowled) sfx.stumps();
        this.record(0, this.bowled, this.bowled ? 'BOWLED!' : this.tapT === null ? 'Left alone' : 'Beaten', this.bowled ? '#ff6b6b' : '#ffffff');
      } else if (this.contact && this.behind !== null && bt > this.contact.t + 0.5) {
        this.settled = true;
        this.record(this.behind ? 0 : 1, this.behind, this.behind ? 'CAUGHT BEHIND!' : 'Edged for 1', this.behind ? '#ff6b6b' : '#ffffff');
      } else if (this.contact && this.fres && bt > this.contact.t + Math.min(this.fres.t, 4) + 0.5) {
        this.settled = true;
        const f = this.fres;
        const label = f.kind === 'six' ? 'SIX!' : f.kind === 'four' ? 'FOUR!' : f.kind === 'caught' ? `CAUGHT! (${FIELD[f.fielder!].name})` : f.kind === 'dropped' ? 'DROPPED! 1 run' : `${f.runs} run${f.runs === 1 ? '' : 's'}`;
        this.record(f.runs, f.kind === 'caught', label, f.kind === 'caught' ? '#ff6b6b' : f.runs >= 4 ? '#ffd166' : '#ffffff');
      }
    }
    if (this.phase === 'result' && this.t > 2.3) {
      const m = this.m;
      if (m.runs >= m.target || m.wkts >= m.maxW || m.balls >= m.overs * 6) this.finish();
      else this.next();
    }
    // camera follows a struck ball, then returns behind the batter
    if (this.contact && this.flight && bt > this.contact.t + 0.35 && this.behind === null) {
      const b = this.ballPos(bt);
      if (b) {
        const want = v(b.x * 0.45, 9 + Math.hypot(b.x, b.z) * 0.14 + b.y * 0.3, b.z * 0.45 - 14);
        this.cam.pos = lerp(this.cam.pos, want, Math.min(1, dt * 3));
        this.cam.look = lerp(this.cam.look, v(b.x, b.y * 0.5, b.z), Math.min(1, dt * 4));
        this.cam.update();
      }
    }
    const tb = this.phase === 'menu' || this.phase === 'over' ? -2 : bt === 99 ? Math.min(this.T + 1.2, (this.contact?.t ?? this.T) + 0.8) : bt;
    this.skel = batter({ delivery: this.phase === 'runup' && this.t < 0.1 ? null : this.d, path: this.path, t: tb, T: this.T, swing: this.swing, prevPose: this.prevPose, tapT: this.tapT });
    this.draw(bt);
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
    if (this.phase === 'ball') return sampleAt(this.path, Math.max(0, bt)).p;
    if (this.phase === 'result' && !this.contact) return sampleAt(this.path, this.T + 0.35 + Math.min(this.t, 0.3)).p;
    return null;
  }

  private draw(bt: number): void {
    const g = this.g;
    const c = this.cam;
    const kitBowl = TEAMS[this.m.opp].kit;
    g.clear();
    drawGround(g, c);
    drawBoundary(g, c, this.ads);
    this.placeBoards();
    drawStumps(g, c, 20.12);
    const bz = this.phase === 'runup' ? 20.12 + 9 * (1 - this.t / RUNUP) + 0.6 : 20.12 + 0.6 - Math.min(2, Math.max(0, bt) * 3);
    const arm = this.phase === 'runup' ? Math.max(0, (this.t - RUNUP + 0.35) / 0.35) : 1 + Math.min(0.4, Math.max(0, bt) * 1.5);
    drawBowler(g, c, bz, this.phase === 'runup' ? this.t * 2.3 : 0.25, arm);
    const ft = this.contact ? (this.phase === 'result' ? Math.min(this.fres?.t ?? 1, 4) + this.t : bt - this.contact.t) : 0;
    const ball = this.phase === 'runup' || this.phase === 'menu' || this.phase === 'over' ? null : this.ballPos(this.phase === 'result' && this.contact ? this.contact.t + ft : bt);
    // fielders, far ones first
    const order = FIELD.map((_, k) => k).sort((a, b) => FIELD[b].home.z - FIELD[a].home.z);
    for (const k of order) {
      const p = fielderPos(k, this.contact ? this.fres : null, ft, ball);
      const catching = this.fres?.fielder === k && this.fres.kind !== 'stopped' && Math.abs(ft - this.fres.t) < 0.5;
      drawFielder(g, c, p, ball ?? v(0, 0, 0), this.contact && this.fres && ft > 0.35 ? ft : 0, kitBowl, catching);
    }
    const ballBehind = ball && ball.z > this.skel.pelvis.z;
    if (ball && ballBehind) drawBall(g, c, ball);
    drawStumps(g, c, 0, this.bowled ? Math.min(1, this.t * 5 + 0.2) : 0);
    drawBatter(g, c, this.skel);
    if (ball && !ballBehind) drawBall(g, c, ball);
    if (this.target && !this.contact) {
      const p = c.p(v(this.target.x, 0, Math.min(this.target.z, 120)));
      g.lineStyle(3, 0xffd166, 0.9);
      g.lineBetween(p.x - 8, p.y - 5, p.x + 8, p.y + 5);
      g.lineBetween(p.x - 8, p.y + 5, p.x + 8, p.y - 5);
    }
    this.drawMeter(bt);
    this.drawMap(ft);
    const m = this.m;
    const show = this.phase !== 'menu';
    this.texts.score.setText(show ? `${TEAMS[m.team].name.split(' ')[0].toUpperCase()}  ${m.runs}/${m.wkts}  (${Math.floor(m.balls / 6)}.${m.balls % 6} ov)` : '');
    this.texts.need.setText(show && m.target ? (m.runs >= m.target ? 'Target reached' : `Need ${m.target - m.runs} from ${m.overs * 6 - m.balls}`) : '');
    this.texts.last.setText(show ? m.last.join('  ') : '');
  }

  /** Billboards on the stand roof, in the batting view (each shows one ad). */
  private placeBoards(): void {
    const batting = this.cam.pos.y < 3;
    const hz = this.cam.p(v(0, 0, 400)).y;
    this.boards.forEach((b, i) => {
      const ad = this.ads[(i * 3 + Math.floor(this.m.balls / 2)) % this.ads.length];
      b.setVisible(batting && this.phase !== 'menu');
      b.setText(`${ad.text}${ad.sub ? `\n${ad.sub}` : ''}`);
      b.setBackgroundColor(ad.bg);
      b.setColor(ad.fg);
      b.setFontSize(14);
      b.setPosition(i ? 705 : 215, hz - 104);
    });
  }

  private drawMeter(bt: number): void {
    const u = this.ui;
    u.clear();
    if (this.phase === 'menu' || this.phase === 'over') return;
    const w = 420;
    const x0 = VW / 2 - w / 2;
    const y = VH - 46;
    const span = 0.7;
    const t0 = this.tIdeal - span / 2;
    const X = (t: number) => x0 + Math.max(0, Math.min(1, (t - t0) / span)) * w;
    u.fillStyle(0x000000, 0.55);
    u.fillRoundedRect(x0 - 6, y - 10, w + 12, 20, 8);
    u.fillStyle(0xff6b6b, 0.85);
    u.fillRect(x0, y - 6, w, 12);
    u.fillStyle(0xffd166, 1);
    u.fillRect(X(this.tIdeal - GOOD), y - 6, X(this.tIdeal + GOOD) - X(this.tIdeal - GOOD), 12);
    u.fillStyle(0x7cfc8a, 1);
    u.fillRect(X(this.tIdeal - PERFECT), y - 6, X(this.tIdeal + PERFECT) - X(this.tIdeal - PERFECT), 12);
    if (this.phase === 'ball' || this.phase === 'runup') {
      u.fillStyle(0xffffff, 1);
      u.fillRect(X(bt) - 2, y - 11, 4, 22);
    }
    if (this.tapT !== null) {
      u.fillStyle(0x111111, 1);
      u.fillTriangle(X(this.tapT) - 7, y - 16, X(this.tapT) + 7, y - 16, X(this.tapT), y - 6);
    }
  }

  private drawMap(ft: number): void {
    const u = this.ui;
    if (this.phase === 'menu' || this.phase === 'over') return;
    const cx = VW - 78;
    const cy = 82;
    const R = 62;
    u.fillStyle(0x2f7a2c, 0.9);
    u.fillCircle(cx, cy, R + 4);
    u.lineStyle(2, 0xffffff, 0.9);
    u.strokeCircle(cx, cy, R);
    u.fillStyle(0xc9b07a, 1);
    u.fillRect(cx - 2, cy - 9, 4, 18);
    const P = (p: V) => ({ x: cx + (p.x / 66) * R, y: cy + 9 - (p.z / 66) * R });
    for (let k = 0; k < FIELD.length; k++) {
      const q = P(fielderPos(k, this.contact ? this.fres : null, ft, null));
      u.fillStyle(TEAMS[this.m.opp].kit, 1);
      u.fillCircle(q.x, q.y, 3);
    }
    if (this.flight && this.contact) {
      const upto = ft * 120;
      u.lineStyle(2, 0xffffff, 0.85);
      u.beginPath();
      this.flight.path.forEach((s, i) => {
        if (i > upto) return;
        const q = P(s.p);
        if (i === 0) u.moveTo(q.x, q.y);
        else u.lineTo(q.x, q.y);
      });
      u.strokePath();
    }
  }
}

musicBtn.addEventListener('click', () => {
  musicOn = !musicOn;
  musicBtn.textContent = musicOn ? '♪ On' : '♪ Off';
  setMusic(musicOn);
});

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  backgroundColor: '#0d1b12',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: VW, height: VH },
  render: { antialias: true },
  scene: Game,
});
