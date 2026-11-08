// In-game HUD (DOM): broadcast scorebug, this-over balls, delivery chip, timing meter with zones,
// shot banners, mini-map with wagon wheel, pause + loft buttons. Pointer events pass through
// everything except the buttons, so taps reach the pitch.
import { Ball, hex, Match, TEAMS } from './match';
import { BAT } from '../batting/tuning';
import { V } from '../batting/vec';

const $ = <T extends HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;

export interface MapState {
  fielders: V[];
  trail: V[] | null; // current ball's path
}

export class Hud {
  el: HTMLElement;
  private needle: HTMLElement;
  private tapMark: HTMLElement;
  private zones: HTMLElement;
  private banner: HTMLElement;
  private chip: HTMLElement;
  private feedback: HTMLElement;
  private map: HTMLCanvasElement;
  private hint: HTMLElement;
  loft: HTMLButtonElement;
  pause: HTMLButtonElement;
  loftOn = false;

  constructor(root: HTMLElement) {
    root.innerHTML = `
      <div class="bug" id="bug">
        <div class="bug-main"><span class="code" id="b-code"></span><span class="score" id="b-score"></span><span class="ov" id="b-ov"></span></div>
        <div class="bug-sub" id="b-sub"></div>
        <div class="over" id="b-over"></div>
      </div>
      <div class="chip" id="chip"></div>
      <div class="banner" id="banner"><div class="big"></div><div class="small"></div></div>
      <div class="topright"><canvas id="map" width="240" height="240"></canvas><button class="icon" id="pause" aria-label="Pause">❚❚</button></div>
      <div class="meterwrap" id="meter">
        <div class="feedback" id="feedback"></div>
        <div class="meter"><div class="zones" id="zones"></div><div class="tap" id="tapm"></div><div class="needle" id="needle"></div></div>
        <div class="meter-labels"><span>EARLY</span><span>PERFECT</span><span>LATE</span></div>
      </div>
      <div class="hint" id="hint"></div>
      <button class="loft" id="loft" aria-pressed="false"><b>LOFT</b><small>hit it in the air</small></button>`;
    this.el = root;
    this.needle = $('#needle', root);
    this.tapMark = $('#tapm', root);
    this.zones = $('#zones', root);
    this.banner = $('#banner', root);
    this.chip = $('#chip', root);
    this.feedback = $('#feedback', root);
    this.map = $('#map', root);
    this.hint = $('#hint', root);
    this.loft = $('#loft', root);
    this.pause = $('#pause', root);
    this.loft.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.setLoft(!this.loftOn);
    });
    // zones: grey miss | red | yellow | green | yellow | red | grey, laid out on a 0.45 s span
    const span = 0.45;
    const pct = (t: number) => ((t + span / 2) / span) * 100;
    const z = (a: number, b: number, c: string) => `<i class="${c}" style="left:${pct(a)}%;width:${pct(b) - pct(a)}%"></i>`;
    this.zones.innerHTML =
      z(-BAT.WINDOW, -BAT.GOOD, 'r') + z(-BAT.GOOD, -BAT.PERFECT, 'y') + z(-BAT.PERFECT, BAT.PERFECT, 'g') + z(BAT.PERFECT, BAT.GOOD, 'y') + z(BAT.GOOD, BAT.WINDOW, 'r');
  }

  show(on: boolean): void {
    this.el.classList.toggle('on', on);
  }

  setLoft(on: boolean): void {
    this.loftOn = on;
    this.loft.classList.toggle('active', on);
    this.loft.setAttribute('aria-pressed', String(on));
  }

  score(m: Match): void {
    const t = TEAMS[m.team];
    $('#b-code', this.el).textContent = m.mode === 'nets' ? 'NETS' : t.code;
    ($('#b-code', this.el) as HTMLElement).style.background = hex(t.kit);
    $('#b-score', this.el).textContent = m.mode === 'nets' ? `${m.runs}` : `${m.runs}/${m.wkts}`;
    $('#b-ov', this.el).textContent = m.mode === 'nets' ? `${m.balls}/${m.totalBalls} balls` : `${m.oversText} ov`;
    const st = m.stats();
    $('#b-sub', this.el).innerHTML =
      m.mode === 'nets'
        ? `Perfect <b>${st.perfect}</b> · Best streak <b>${st.bestStreak}</b> · Out <b>${m.wkts}</b>`
        : m.runs >= m.target
          ? '<b>Target reached</b>'
          : `Need <b>${m.need}</b> off <b>${m.ballsLeft}</b> · RRR <b>${m.rrr.toFixed(2)}</b> · ${m.maxW - m.wkts} wkts left`;
    $('#b-over', this.el).innerHTML = Array.from({ length: 6 }, (_, i) => this.ballDot(m.thisOver[i])).join('');
  }

  private ballDot(b: Ball | undefined): string {
    if (!b) return '<span class="dot empty"></span>';
    const cls = b.out ? 'w' : b.runs === 6 ? 's' : b.runs === 4 ? 'f' : b.runs ? 'r' : 'd';
    return `<span class="dot ${cls}">${b.out ? 'W' : b.runs || '•'}</span>`;
  }

  /** Delivery chip at the top: speed and length as the ball is bowled, then the shot name. */
  setChip(text: string): void {
    this.chip.textContent = text;
    this.chip.classList.toggle('on', !!text);
  }

  /** Needle position: time relative to the perfect tap (s). */
  meter(rel: number | null, tapRel: number | null, visible: boolean): void {
    $('#meter', this.el).classList.toggle('on', visible);
    const span = 0.45;
    const pct = (t: number) => Math.max(0, Math.min(100, ((t + span / 2) / span) * 100));
    this.needle.style.left = rel === null ? '-10%' : `${pct(rel)}%`;
    this.tapMark.style.display = tapRel === null ? 'none' : 'block';
    if (tapRel !== null) this.tapMark.style.left = `${pct(tapRel)}%`;
  }

  timing(band: string, ms: number): void {
    const cls = band === 'PERFECT' ? 'g' : band === 'Good' ? 'y' : 'r';
    const label = band === 'PERFECT' ? 'PERFECT' : band === 'Good' ? 'GOOD' : band === 'Off' ? 'MISTIMED' : Math.abs(ms) > BAT.WINDOW * 1000 ? (ms < 0 ? 'WAY TOO EARLY' : 'WAY TOO LATE') : 'OUT OF REACH';
    this.feedback.className = `feedback on ${cls}`;
    this.feedback.innerHTML = `${label}<small>${ms === 0 ? 'spot on' : ms < 0 ? `${-ms} ms early` : `${ms} ms late`}</small>`;
  }

  clearFeedback(): void {
    this.feedback.className = 'feedback';
    this.setChip('');
    this.banner.className = 'banner';
  }

  /** Big result banner: kind decides the colour treatment. */
  bannerShow(big: string, small: string, kind: 'six' | 'four' | 'out' | 'runs' | 'dot'): void {
    this.banner.className = `banner ${kind}`;
    void this.banner.offsetWidth; // restart the animation
    this.banner.className = `banner ${kind} on`;
    $('.big', this.banner).textContent = big;
    $('.small', this.banner).textContent = small;
  }

  setHint(text: string): void {
    this.hint.textContent = text;
    this.hint.classList.toggle('on', !!text);
  }

  /** Top-down mini-map: rope, 30-yard ring, pitch, fielders, every scoring shot (wagon wheel), live ball. */
  drawMap(m: Match, s: MapState, kit: number): void {
    const c = this.map.getContext('2d')!;
    const W = this.map.width;
    const cx = W / 2;
    const cy = W / 2;
    const R = W / 2 - 14;
    const P = (p: V) => [cx + (p.x / 66) * R, cy - (p.z / 66) * R] as const; // off side on the right, as seen from behind the batter
    c.clearRect(0, 0, W, W);
    c.fillStyle = 'rgba(16,40,22,0.88)';
    c.beginPath();
    c.arc(cx, cy, R + 10, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.85)';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(cx, cy, R, 0, Math.PI * 2);
    c.stroke();
    c.setLineDash([4, 5]);
    c.strokeStyle = 'rgba(255,255,255,0.35)';
    c.beginPath();
    c.arc(cx, cy, (27 / 66) * R, 0, Math.PI * 2);
    c.stroke();
    c.setLineDash([]);
    c.fillStyle = '#d4bd8a';
    c.fillRect(cx - 3, cy - (20.12 / 66) * R, 6, (20.12 / 66) * R);
    // wagon wheel
    for (const b of m.log) {
      if (b.angle === null || !b.runs) continue;
      const d = Math.min(b.dist, 66);
      const [x, y] = P({ x: Math.sin(b.angle) * d, y: 0, z: Math.cos(b.angle) * d });
      c.strokeStyle = b.runs === 6 ? '#ff5d8f' : b.runs === 4 ? '#4cc9f0' : 'rgba(255,255,255,0.7)';
      c.lineWidth = b.runs >= 4 ? 2.5 : 1.5;
      c.beginPath();
      c.moveTo(cx, cy);
      c.lineTo(x, y);
      c.stroke();
    }
    for (const f of s.fielders) {
      const [x, y] = P(f);
      c.fillStyle = hex(kit);
      c.strokeStyle = '#fff';
      c.lineWidth = 1.5;
      c.beginPath();
      c.arc(x, y, 5, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    }
    if (s.trail && s.trail.length) {
      c.strokeStyle = '#ffd166';
      c.lineWidth = 3;
      c.beginPath();
      s.trail.forEach((p, i) => {
        const [x, y] = P(p);
        if (i) c.lineTo(x, y);
        else c.moveTo(x, y);
      });
      c.stroke();
      const [x, y] = P(s.trail[s.trail.length - 1]);
      c.fillStyle = '#fff';
      c.beginPath();
      c.arc(x, y, 4, 0, Math.PI * 2);
      c.fill();
    }
  }
}
