// Full-screen menus (DOM): title, match setup, how to play, settings, pause, intro card, results.
// Every actionable control has data-nav so the keyboard / PS5 pad can move focus and press it.
import { DIFFS, hex, Match, NETS_BALLS, store, TEAMS } from './match';

export interface Settings {
  music: boolean;
  sfx: boolean;
  quality: 'high' | 'low';
  camera: 'broadcast' | 'close';
}

export interface ScreenActions {
  play(mode: 'chase' | 'nets'): void;
  resume(): void;
  restart(): void;
  quit(): void;
  settingsChanged(s: Settings): void;
}

const crest = (i: number, size = 54) => {
  const t = TEAMS[i];
  return `<span class="crest" style="--k:${hex(t.kit)};--a:${t.alt};width:${size}px;height:${size}px;font-size:${size * 0.34}px">${t.code}</span>`;
};

const ICON = {
  tap: `<svg viewBox="0 0 120 80"><rect x="2" y="2" width="116" height="76" rx="10" fill="#1d5a2c"/><path d="M60 78 L46 20 L74 20 Z" fill="#d4bd8a"/><circle cx="92" cy="30" r="9" fill="none" stroke="#ffd166" stroke-width="3"/><path d="M60 70 L92 30" stroke="#fff" stroke-width="2" stroke-dasharray="4 4"/><circle cx="92" cy="30" r="3" fill="#ffd166"/></svg>`,
  meter: `<svg viewBox="0 0 120 80"><rect x="2" y="2" width="116" height="76" rx="10" fill="#14202e"/><rect x="10" y="34" width="100" height="12" rx="6" fill="#3a4250"/><rect x="26" y="34" width="68" height="12" fill="#ff6b6b"/><rect x="40" y="34" width="40" height="12" fill="#ffd166"/><rect x="53" y="34" width="14" height="12" fill="#7cfc8a"/><rect x="58" y="26" width="4" height="28" rx="2" fill="#fff"/><text x="60" y="68" fill="#cfe" font-size="10" text-anchor="middle" font-family="sans-serif">tap in the green</text></svg>`,
  loft: `<svg viewBox="0 0 120 80"><rect x="2" y="2" width="116" height="76" rx="10" fill="#1d3a5a"/><path d="M14 70 Q60 -10 106 40" stroke="#ffd166" stroke-width="3" fill="none" stroke-dasharray="5 4"/><circle cx="106" cy="40" r="5" fill="#fff"/><rect x="8" y="66" width="104" height="8" rx="3" fill="#2f7a2c"/></svg>`,
};

export class Screens {
  settings: Settings = store.get<Settings>('settings', { music: true, sfx: true, quality: 'high', camera: 'broadcast' });
  private back: (() => void) | null = null;
  constructor(
    private el: HTMLElement,
    private m: Match,
    private act: ScreenActions,
  ) {}

  hide(): void {
    this.el.hidden = true;
    this.el.innerHTML = '';
  }

  private show(html: string, cls = ''): void {
    this.el.innerHTML = `<div class="screen ${cls}">${html}</div>`;
    this.el.hidden = false;
    const first = this.el.querySelector<HTMLElement>('[data-primary]') ?? this.el.querySelector<HTMLElement>('[data-nav]');
    first?.focus({ preventScroll: true });
  }

  private on(sel: string, fn: (e: HTMLElement) => void): void {
    this.el.querySelectorAll<HTMLElement>(sel).forEach((b) => b.addEventListener('click', () => fn(b)));
  }

  title(): void {
    const best = store.get('bestChase', 0);
    const bestNets = store.get('bestNets', 0);
    this.show(
      `<div class="title-wrap">
        <div class="logo"><span class="logo-s">STUMPS</span><span class="logo-tag">TAP · TIME · SMASH</span></div>
        <div class="menu-col">
          <button class="btn primary" data-nav data-primary id="m-chase"><b>PLAY MATCH</b><small>Chase a target before the overs run out</small></button>
          <button class="btn" data-nav id="m-nets"><b>NETS PRACTICE</b><small>${NETS_BALLS} balls · perfect your timing</small></button>
          <div class="row2">
            <button class="btn ghost" data-nav id="m-how">How to play</button>
            <button class="btn ghost" data-nav id="m-set">Settings</button>
          </div>
          <div class="bests">${best ? `Best chase: <b>${best}</b> runs` : 'No matches yet'}${bestNets ? ` · Best nets: <b>${bestNets}</b>` : ''}</div>
        </div>
      </div>`,
      'title',
    );
    this.on('#m-chase', () => this.setup());
    this.on('#m-nets', () => {
      this.m.mode = 'nets';
      this.act.play('nets');
    });
    this.on('#m-how', () => this.how(() => this.title()));
    this.on('#m-set', () => this.settingsScreen(() => this.title()));
    if (!store.get('seenHow', false)) this.how(() => this.title());
  }

  setup(): void {
    const m = this.m;
    m.mode = 'chase';
    const teams = TEAMS.map(
      (t, i) => `<button class="team ${i === m.team ? 'sel' : ''} ${i === m.opp ? 'opp' : ''}" data-nav data-team="${i}">${crest(i, 46)}<span>${t.name}</span>${i === m.team ? '<em>YOU</em>' : i === m.opp ? '<em class="o">VS</em>' : ''}</button>`,
    ).join('');
    const seg = (k: 'overs' | 'diff', vals: [number, string, string?][]) =>
      `<div class="seg">${vals.map(([v, l, n]) => `<button data-nav data-k="${k}" data-v="${v}" class="${m[k] === v ? 'on' : ''}"><b>${l}</b>${n ? `<small>${n}</small>` : ''}</button>`).join('')}</div>`;
    this.show(
      `<header class="bar"><button class="btn ghost sm" data-nav id="s-back">‹ Back</button><h2>Match setup</h2><span></span></header>
       <div class="setup">
         <section><h3>Your team</h3><div class="teams">${teams}</div></section>
         <section class="split">
           <div><h3>Overs</h3>${seg('overs', [[1, '1'], [2, '2'], [5, '5']])}</div>
           <div><h3>Difficulty</h3>${seg('diff', DIFFS.map((d, i) => [i, d.name, d.note] as [number, string, string]))}</div>
         </section>
         <div class="vs">${crest(m.team, 64)}<b>VS</b><button class="btn ghost sm" data-nav data-opp="-1" aria-label="Previous opponent">‹</button>${crest(m.opp, 64)}<button class="btn ghost sm" data-nav data-opp="1" aria-label="Next opponent">›</button><span class="oppname">${TEAMS[m.opp].name}</span></div>
         <button class="btn primary big" data-nav data-primary id="s-go"><b>START CHASE ›</b></button>
       </div>`,
      'setup-screen',
    );
    this.on('#s-back', () => this.title());
    this.on('[data-team]', (b) => {
      m.team = Number(b.dataset.team);
      if (m.opp === m.team) m.opp = (m.team + 1) % TEAMS.length;
      this.setup();
    });
    this.on('[data-opp]', (b) => {
      do m.opp = (m.opp + Number(b.dataset.opp) + TEAMS.length) % TEAMS.length;
      while (m.opp === m.team);
      this.setup();
    });
    this.on('[data-k]', (b) => {
      (m as unknown as Record<string, number>)[b.dataset.k!] = Number(b.dataset.v);
      this.setup();
    });
    this.on('#s-go', () => this.act.play('chase'));
  }

  how(done: () => void): void {
    store.set('seenHow', true);
    const card = (svg: string, h: string, p: string) => `<div class="howcard">${svg}<h4>${h}</h4><p>${p}</p></div>`;
    this.show(
      `<header class="bar"><span></span><h2>How to play</h2><span></span></header>
       <div class="how">
         ${card(ICON.tap, '1 · Tap where you want it', 'Tap the field where you want to hit the ball, just as it reaches you. The batter picks the right shot for that spot.')}
         ${card(ICON.meter, '2 · Time it', 'Watch the meter. <b class="g">Green</b> = six in the air or a four along the ground. <b class="y">Yellow</b> = four. <b class="r">Red</b> = mistimed, 1–2 runs or a catch.')}
         ${card(ICON.loft, '3 · Go big', 'Turn on <b>LOFT</b> (or tap the crowd) to hit it in the air. Big reward, but fielders on the rope can catch it.')}
       </div>
       <p class="controls">PS5: left stick aim · ✕ ground · □ lofted · Options pause &nbsp;|&nbsp; Keyboard: arrows aim · Space hit · Shift loft · Esc pause</p>
       <button class="btn primary big" data-nav data-primary id="h-ok"><b>GOT IT</b></button>`,
      'how-screen',
    );
    this.on('#h-ok', done);
  }

  settingsScreen(done: () => void): void {
    const s = this.settings;
    const tog = (k: keyof Settings, a: [string, string], b: [string, string]) =>
      `<div class="seg">${[a, b].map(([v, l]) => `<button data-nav data-set="${k}" data-v="${v}" class="${String(s[k]) === v ? 'on' : ''}"><b>${l}</b></button>`).join('')}</div>`;
    this.show(
      `<header class="bar"><button class="btn ghost sm" data-nav id="t-back">‹ Back</button><h2>Settings</h2><span></span></header>
       <div class="settings">
         <label>Music</label>${tog('music', ['true', 'On'], ['false', 'Off'])}
         <label>Sound effects</label>${tog('sfx', ['true', 'On'], ['false', 'Off'])}
         <label>Graphics</label>${tog('quality', ['high', 'High'], ['low', 'Battery saver'])}
         <label>Camera</label>${tog('camera', ['broadcast', 'Broadcast'], ['close', 'Close-up'])}
       </div>`,
      'settings-screen',
    );
    this.on('#t-back', done);
    this.on('[data-set]', (b) => {
      const k = b.dataset.set as keyof Settings;
      const v = b.dataset.v!;
      (s as unknown as Record<string, unknown>)[k] = v === 'true' ? true : v === 'false' ? false : v;
      store.set('settings', s);
      this.act.settingsChanged(s);
      this.settingsScreen(done);
    });
  }

  pause(): void {
    this.show(
      `<div class="pause"><h2>Paused</h2>
        <button class="btn primary" data-nav data-primary id="p-res"><b>RESUME</b></button>
        <button class="btn" data-nav id="p-rst"><b>RESTART</b></button>
        <button class="btn" data-nav id="p-set"><b>SETTINGS</b></button>
        <button class="btn ghost" data-nav id="p-quit">Quit to menu</button></div>`,
      'dim',
    );
    this.on('#p-res', () => this.act.resume());
    this.on('#p-rst', () => this.act.restart());
    this.on('#p-set', () => this.settingsScreen(() => this.pause()));
    this.on('#p-quit', () => this.act.quit());
  }

  /** Card shown before the first ball. */
  intro(onGo: () => void): void {
    const m = this.m;
    const body =
      m.mode === 'nets'
        ? `<h2>Nets</h2><p class="lead">${NETS_BALLS} balls. Score as many as you can and chase green on the meter.</p>`
        : `<div class="vs">${crest(m.team, 72)}<b>VS</b>${crest(m.opp, 72)}</div><h2>Chase ${m.target}</h2><p class="lead">off ${m.totalBalls} balls · ${m.maxW} wickets · ${DIFFS[m.diff].name}</p>`;
    this.show(`<div class="intro">${body}<button class="btn primary big" data-nav data-primary id="i-go"><b>BAT ›</b></button></div>`, 'dim');
    this.on('#i-go', onGo);
  }

  result(onAgain: () => void): void {
    const m = this.m;
    const st = m.stats();
    let head: string;
    let sub: string;
    let newBest = false;
    if (m.mode === 'nets') {
      head = 'SESSION DONE';
      sub = `${st.runs} runs off ${st.balls} balls`;
      if (st.runs > store.get('bestNets', 0)) {
        store.set('bestNets', st.runs);
        newBest = true;
      }
    } else {
      const won = m.won();
      head = won ? 'YOU WIN!' : m.runs === m.target - 1 ? 'TIED' : 'YOU LOSE';
      sub = won
        ? `${TEAMS[m.team].name} won with ${m.ballsLeft} ball${m.ballsLeft === 1 ? '' : 's'} to spare`
        : m.runs === m.target - 1
          ? 'Scores level'
          : `${TEAMS[m.opp].name} won by ${m.target - 1 - m.runs} run${m.target - 1 - m.runs === 1 ? '' : 's'}`;
      if (won && st.runs > store.get('bestChase', 0)) {
        store.set('bestChase', st.runs);
        newBest = true;
      }
    }
    const tile = (v: string | number, l: string) => `<div class="tile"><b>${v}</b><span>${l}</span></div>`;
    this.show(
      `<div class="result ${m.mode === 'chase' && !m.won() ? 'lost' : 'won'}">
        <div class="res-left">
          <h1>${head}</h1>${newBest ? '<span class="badge">NEW BEST</span>' : ''}
          <p class="lead">${sub}</p>
          <div class="final">${m.mode === 'nets' ? st.runs : `${m.runs}/${m.wkts}`}<small>${m.mode === 'nets' ? `${st.balls} balls` : `${m.oversText} ov · target ${m.target}`}</small></div>
          <div class="tiles">${tile(st.sr.toFixed(0), 'Strike rate')}${tile(st.fours, 'Fours')}${tile(st.sixes, 'Sixes')}${tile(st.perfectPct + '%', 'Perfect timing')}${tile(st.longest + ' m', 'Longest hit')}${tile(st.avgErr + ' ms', 'Avg timing error')}</div>
          <div class="btns">
            <button class="btn primary" data-nav data-primary id="r-again"><b>PLAY AGAIN</b></button>
            ${m.mode === 'chase' ? '<button class="btn" data-nav id="r-setup"><b>CHANGE SETUP</b></button>' : ''}
            <button class="btn ghost" data-nav id="r-menu">Menu</button>
          </div>
        </div>
        <div class="res-right"><h3>Wagon wheel</h3><canvas id="wagon" width="320" height="320"></canvas>
          <div class="legend"><i class="s"></i>6 <i class="f"></i>4 <i class="r"></i>runs</div></div>
      </div>`,
      'dim',
    );
    this.wagon(this.el.querySelector('#wagon') as HTMLCanvasElement);
    this.on('#r-again', onAgain);
    this.on('#r-setup', () => this.setup());
    this.on('#r-menu', () => this.title());
  }

  private wagon(cv: HTMLCanvasElement): void {
    const c = cv.getContext('2d')!;
    const W = cv.width;
    const R = W / 2 - 10;
    const cx = W / 2;
    const cy = W / 2;
    c.fillStyle = '#1f6a2a';
    c.beginPath();
    c.arc(cx, cy, R, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#fff';
    c.lineWidth = 2;
    c.stroke();
    c.fillStyle = '#d4bd8a';
    c.fillRect(cx - 4, cy - (20 / 66) * R, 8, (20 / 66) * R);
    for (const b of this.m.log) {
      if (b.angle === null || !b.runs) continue;
      const d = (Math.min(b.dist, 66) / 66) * R;
      c.strokeStyle = b.runs === 6 ? '#ff5d8f' : b.runs === 4 ? '#4cc9f0' : '#f1f5f9';
      c.lineWidth = b.runs >= 4 ? 3 : 2;
      c.beginPath();
      c.moveTo(cx, cy);
      c.lineTo(cx + Math.sin(b.angle) * d, cy - Math.cos(b.angle) * d);
      c.stroke();
    }
  }

  /** Arrow keys / d-pad move focus between controls; returns true if it handled the key. */
  nav(dir: 'up' | 'down' | 'left' | 'right' | 'press'): boolean {
    if (this.el.hidden) return false;
    const items = Array.from(this.el.querySelectorAll<HTMLElement>('[data-nav]'));
    if (!items.length) return false;
    const cur = document.activeElement as HTMLElement;
    let i = items.indexOf(cur);
    if (dir === 'press') {
      (i >= 0 ? items[i] : items[0]).click();
      return true;
    }
    if (i < 0) i = 0;
    else {
      // nearest item in that direction
      const a = cur.getBoundingClientRect();
      let best = -1;
      let bd = Infinity;
      items.forEach((it, k) => {
        if (k === i) return;
        const b = it.getBoundingClientRect();
        const dx = b.left + b.width / 2 - (a.left + a.width / 2);
        const dy = b.top + b.height / 2 - (a.top + a.height / 2);
        const ok = dir === 'up' ? dy < -4 : dir === 'down' ? dy > 4 : dir === 'left' ? dx < -4 : dx > 4;
        if (!ok) return;
        const d = dir === 'up' || dir === 'down' ? Math.abs(dy) + Math.abs(dx) * 2 : Math.abs(dx) + Math.abs(dy) * 2;
        if (d < bd) {
          bd = d;
          best = k;
        }
      });
      if (best >= 0) i = best;
    }
    items[i].focus();
    return true;
  }
}
