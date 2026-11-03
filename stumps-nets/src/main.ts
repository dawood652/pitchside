// Stumps nets: batting practice. Tap where you want the ball to go, as it arrives.
import Phaser from 'phaser';
import { aimedSwing, BallSample, bowl, Contact, Delivery, findContact, Flight, fly, hitsStumps, makeDelivery, sampleAt, Swing, timeAtZ, BatPose } from './batting/physics';
import { chooseShot, Shot } from './batting/shots';
import { batter, Skeleton } from './batting/body';
import { Cam, drawBall, drawBatter, drawBowler, drawGround, drawStumps, VH, VW } from './render';
import { v, V } from './batting/vec';

const LEAD = 0.17; // tap -> bat on the ball (the downswing)
const RUNUP = 1.3;
const PERFECT = 0.035;
const GOOD = 0.08;

type Phase = 'runup' | 'ball' | 'result';

class Nets extends Phaser.Scene {
  private g!: Phaser.GameObjects.Graphics;
  private ui!: Phaser.GameObjects.Graphics;
  private cam = new Cam();
  private phase: Phase = 'runup';
  private t = 0; // phase time
  private d!: Delivery;
  private path!: BallSample[];
  private T = 0; // ball reaches the batter
  private tIdeal = 0;
  private swing: Swing | null = null;
  private shot: Shot | null = null;
  private tapT: number | null = null;
  private prevPose: BatPose | null = null;
  private contact: Contact | null = null;
  private flight: Flight | null = null;
  private target: V | null = null;
  private bowled = false;
  private skel!: Skeleton;
  private runs = 0;
  private balls = 0;
  private texts: Record<string, Phaser.GameObjects.Text> = {};
  private r = Math.random;
  private padPrev: boolean[] = [];
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;

  create(): void {
    this.g = this.add.graphics();
    this.ui = this.add.graphics();
    this.cam.update();
    const style = (size: number, color = '#ffffff') => ({ fontFamily: 'system-ui, -apple-system, sans-serif', fontSize: `${size}px`, color, fontStyle: '800', stroke: '#000000', strokeThickness: 4 });
    this.texts.score = this.add.text(16, 12, '', style(22));
    this.texts.shot = this.add.text(VW / 2, 70, '', style(30, '#ffd166')).setOrigin(0.5);
    this.texts.detail = this.add.text(VW / 2, 108, '', style(17)).setOrigin(0.5);
    this.texts.timing = this.add.text(VW / 2, VH - 64, '', style(18)).setOrigin(0.5);
    this.texts.help = this.add.text(VW / 2, VH - 20, 'Tap the ground where you want it to go, as the ball arrives · tap the crowd to loft it', style(13, '#e8eef2')).setOrigin(0.5);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.tap(this.cam.ground(p.x, p.y)));
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('LEFT,RIGHT,UP,DOWN,SPACE,SHIFT') as Record<string, Phaser.Input.Keyboard.Key>;
    kb.on('keydown-SPACE', () => this.tap(this.aimFromKeys()));
    this.next();
    (window as unknown as { __scene: unknown }).__scene = this; // test hook
  }

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
    this.d = makeDelivery(this.r);
    this.path = bowl(this.d);
    this.T = timeAtZ(this.path, 1.2);
    this.tIdeal = timeAtZ(this.path, ['short', 'bouncer'].includes(this.d.length) ? 1.05 : 1.95) - LEAD;
    this.swing = null;
    this.shot = null;
    this.tapT = null;
    this.prevPose = null;
    this.contact = null;
    this.flight = null;
    this.target = null;
    this.bowled = false;
    this.texts.shot.setText('');
    this.texts.detail.setText('');
    this.texts.timing.setText('');
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
    const lofted = dist > 64;
    const shot = chooseShot(aim, dist, lofted, this.d.length);
    const tC = timeAtZ(this.path, shot.contactZ);
    const contactPt = sampleAt(this.path, tC).p;
    this.swing = aimedSwing(shot, contactPt, bt, LEAD, this.path, tC);
    this.shot = shot;
    this.tapT = bt;
    this.prevPose = this.skel?.bat ?? null;
    this.target = target;
    const err = bt - (tC - LEAD);
    const ms = Math.round(err * 1000);
    const band = Math.abs(err) <= PERFECT ? 'PERFECT' : Math.abs(err) <= GOOD ? 'Good' : 'Off';
    this.texts.timing.setText(`${band} · ${ms === 0 ? 'on time' : ms < 0 ? `${-ms} ms early` : `${ms} ms late`}`).setColor(band === 'PERFECT' ? '#7CFC8A' : band === 'Good' ? '#ffd166' : '#ff7b7b');
    this.texts.shot.setText(shot.name.toUpperCase());
  }

  private pollPad(): void {
    const gp = navigator.getGamepads?.().find((x) => x && x.connected);
    if (!gp) return;
    const b = gp.buttons.map((x) => x.pressed);
    const ax = gp.axes[0] ?? 0;
    const ay = gp.axes[1] ?? 0;
    const m = Math.hypot(ax, ay);
    const a = m > 0.3 ? Math.atan2(ax, -ay) : 0;
    // Cross = shot along the ground, Square = lofted (or hold R1/R2)
    const lofted = b[2] || b[5] || b[7];
    if ((b[0] && !this.padPrev[0]) || (b[2] && !this.padPrev[2])) {
      const dist = lofted ? 90 : m > 0.3 ? 50 : 50;
      this.tap(v(Math.sin(a) * dist, 0, Math.cos(a) * dist));
    }
    this.padPrev = b;
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
    // ---- contact search since the last frame (continuous, so fast bats can't pass through)
    if (this.phase === 'ball' && this.swing && !this.contact) {
      const c = findContact(this.swing, this.path, Math.max(this.tapT!, bt - dt), bt);
      if (c) {
        this.contact = c;
        this.flight = fly(c.p, c.out);
        const kmh = Math.round(Math.hypot(c.out.x, c.out.y, c.out.z) * 3.6);
        const q = { middle: 'Middled', toe: 'Off the toe', splice: 'Off the splice', edge: 'Edged' }[c.quality];
        this.texts.detail.setText(`${q} · ${kmh} km/h off the bat`);
      }
    }
    if (this.phase === 'ball' && bt > this.T + 0.35 && !this.contact) {
      this.bowled = hitsStumps(this.path, this.tapT ?? 0);
      this.texts.shot.setText(this.bowled ? 'BOWLED!' : this.tapT === null ? 'Left alone' : 'Beaten');
      this.texts.shot.setColor(this.bowled ? '#ff6b6b' : '#ffffff');
      this.balls++;
      this.phase = 'result';
      this.t = 0;
    }
    if (this.phase === 'ball' && this.contact && this.flight && bt > this.contact.t + Math.min(this.flight.path.at(-1)!.t, 3.5) + 0.3) {
      const f = this.flight;
      this.runs += f.runs;
      this.balls++;
      this.texts.shot.setText(f.boundary === 6 ? 'SIX!' : f.boundary === 4 ? 'FOUR!' : `${f.runs} run${f.runs === 1 ? '' : 's'}`).setColor(f.boundary ? '#ffd166' : '#ffffff');
      this.texts.detail.setText(`${this.shot?.name} · carried ${Math.round(f.carry)} m · ${Math.round(f.total)} m in total`);
      this.phase = 'result';
      this.t = 0;
    }
    if (this.phase === 'result' && this.t > 2.4) this.next();

    // ---- body
    this.skel = batter({ delivery: this.phase === 'runup' && this.t < 0.1 ? null : this.d, path: this.path, t: bt === 99 ? Math.min(this.T + 1.2, (this.contact?.t ?? this.T) + 0.8) : bt, T: this.T, swing: this.swing, prevPose: this.prevPose, tapT: this.tapT });
    this.draw(bt);
  }

  private ballPos(bt: number): V | null {
    if (this.contact && this.flight && bt >= this.contact.t) {
      const ft = bt - this.contact.t;
      const p = this.flight.path[Math.min(this.flight.path.length - 1, Math.floor(ft * 120))];
      return p.p;
    }
    if (this.phase === 'ball') return sampleAt(this.path, Math.max(0, bt)).p;
    if (this.phase === 'result' && !this.contact) return sampleAt(this.path, this.T + 0.35 + Math.min(this.t, 0.3)).p;
    return null;
  }

  private draw(bt: number): void {
    const g = this.g;
    const c = this.cam;
    g.clear();
    drawGround(g, c);
    drawStumps(g, c, 20.12);
    // bowler: run-up then delivery stride
    const bz = this.phase === 'runup' ? 20.12 + 9 * (1 - this.t / RUNUP) + 0.6 : 20.12 + 0.6 - Math.min(2, bt * 3);
    const arm = this.phase === 'runup' ? Math.max(0, (this.t - RUNUP + 0.35) / 0.35) : 1 + Math.min(0.4, bt * 1.5);
    drawBowler(g, c, bz, this.phase === 'runup' ? this.t * 2.3 : 0.25, arm);
    const ball = this.phase === 'runup' ? null : this.ballPos(this.phase === 'result' ? (this.contact ? this.contact.t + Math.min(this.flight!.path.at(-1)!.t, 3.5) : bt) : bt);
    const ballBehind = ball && ball.z > this.skel.pelvis.z;
    if (ball && ballBehind) drawBall(g, c, ball);
    drawStumps(g, c, 0, this.bowled ? Math.min(1, this.t * 5 + 0.2) : 0);
    drawBatter(g, c, this.skel);
    if (ball && !ballBehind) drawBall(g, c, ball);
    if (this.target) {
      const p = c.p(v(this.target.x, 0, Math.min(this.target.z, 120)));
      g.lineStyle(3, 0xffd166, 0.9);
      g.lineBetween(p.x - 8, p.y - 5, p.x + 8, p.y + 5);
      g.lineBetween(p.x - 8, p.y + 5, p.x + 8, p.y - 5);
    }
    this.drawMeter(bt);
    this.drawMap(bt);
    this.texts.score.setText(`${this.runs} runs · ${this.balls} balls`);
  }

  /** Timing meter: the marker runs as the ball comes; tap when it's in the green. */
  private drawMeter(bt: number): void {
    const u = this.ui;
    u.clear();
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

  /** Mini-map: where the shot went (top-right). */
  private drawMap(bt: number): void {
    const u = this.ui;
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
    if (this.target) {
      const t = P(v(this.target.x * Math.min(1, 75 / Math.hypot(this.target.x, this.target.z)), 0, this.target.z * Math.min(1, 75 / Math.hypot(this.target.x, this.target.z))));
      u.lineStyle(2, 0xffd166, 1);
      u.lineBetween(t.x - 4, t.y - 4, t.x + 4, t.y + 4);
      u.lineBetween(t.x - 4, t.y + 4, t.x + 4, t.y - 4);
    }
    if (this.flight && this.contact) {
      const upto = this.phase === 'result' ? 1e9 : (bt - this.contact.t) * 120;
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

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  backgroundColor: '#0d1b12',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: VW, height: VH },
  render: { antialias: true },
  scene: Nets,
});
