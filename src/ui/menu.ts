// Main menu (team select), pause and full-time screens.

import { TEAMS, TeamDef } from '../data/teams';
import { MatchState } from '../match/state';

export interface MenuChoice {
  home: TeamDef;
  away: TeamDef;
  halfSeconds: number;
  time: 'day' | 'evening' | 'night';
  difficulty: number; // 0 Amateur, 1 Pro, 2 World Class
}

function shirtSvg(t: TeamDef): string {
  const stripes =
    t.pattern === 'stripes'
      ? [14, 24, 34, 44].map((x) => `<rect x="${x}" y="6" width="5" height="40" fill="${t.secondary}" clip-path="url(#c${t.id})"/>`).join('')
      : t.pattern === 'halves'
        ? `<rect x="24" y="6" width="9" height="40" fill="${t.secondary}" clip-path="url(#c${t.id})"/>`
        : `<rect x="0" y="6" width="56" height="4" fill="${t.secondary}" clip-path="url(#c${t.id})"/>`;
  const path = 'M18 4 L8 9 L1 20 L9 25 L12 21 L12 46 L44 46 L44 21 L47 25 L55 20 L48 9 L38 4 Q28 11 18 4 Z';
  return `<svg class="shirt" viewBox="0 0 56 48" aria-hidden="true"><defs><clipPath id="c${t.id}"><path d="${path}"/></clipPath></defs>
    <path d="${path}" fill="${t.primary}" stroke="rgba(0,0,0,.35)" stroke-width="1"/>${stripes}</svg>`;
}

export class Menu {
  el: HTMLDivElement;
  private home = 2;
  private away = 1;
  private half = 180;
  private time: MenuChoice['time'] = 'night';
  private diff = 1;

  constructor(parent: HTMLElement, private onStart: (c: MenuChoice) => void) {
    this.el = document.createElement('div');
    this.el.className = 'screen';
    parent.appendChild(this.el);
    this.render();
  }

  private render(): void {
    const h = TEAMS[this.home];
    const a = TEAMS[this.away];
    const card = (t: TeamDef, side: 'home' | 'away') => `
      <div class="card">
        <div class="side">${side === 'home' ? '<b>You</b>' : 'CPU'}<span>${side === 'home' ? 'Home' : 'Away'}</span></div>
        <div class="row"><button id="${side}-prev" aria-label="Previous ${side} team">‹</button>${shirtSvg(t)}<button id="${side}-next" aria-label="Next ${side} team">›</button></div>
        <div class="name">${t.name}</div>
        <div class="ovr">OVR <strong>${t.rating}</strong></div>
      </div>`;
    this.el.innerHTML = `
      <div class="menu">
        <div class="brand">Pitch<span>side</span></div>
        <div class="tag">11-a-side broadcast football. Pick your club, take on the CPU, play a full match with throw-ins, corners and keepers who dive.</div>
        <div class="matchup">${card(h, 'home')}<div class="vs">VS</div>${card(a, 'away')}</div>
        <div class="opts"><label for="len">Half length</label>
          <div class="seg" id="len" role="group">${[120, 180, 300]
            .map((s) => `<button data-s="${s}" aria-pressed="${s === this.half}">${s / 60} min</button>`)
            .join('')}</div></div>
        <div class="opts"><label for="tod">Kick-off</label>
          <div class="seg" id="tod" role="group">${(['day', 'evening', 'night'] as const)
            .map((t) => `<button data-t="${t}" aria-pressed="${t === this.time}">${t[0].toUpperCase() + t.slice(1)}</button>`)
            .join('')}</div></div>
        <div class="opts"><label for="diff">Difficulty</label>
          <div class="seg" id="diff" role="group">${['Amateur', 'Pro', 'World Class']
            .map((d, i) => `<button data-d="${i}" aria-pressed="${i === this.diff}">${d}</button>`)
            .join('')}</div></div>
        <button class="go" id="go"><span>Kick off</span><span>→</span></button>
        <div class="keys">
          <div><kbd>WASD</kbd> Move</div><div><kbd>Shift</kbd> Sprint</div>
          <div><kbd>J</kbd> Pass / tackle</div><div><kbd>K</kbd> Shoot (hold)</div>
          <div><kbd>O</kbd> Finesse shot</div><div><kbd>L</kbd> Lob / cross / chip</div>
          <div><kbd>I</kbd> Through ball</div><div><kbd>Q</kbd> Switch player</div>
          <div><kbd>Pad</kbd> Gamepad supported</div><div><kbd>Esc</kbd> Pause</div>
        </div>
        <div class="note">All clubs, players and sponsors are fictional. On a phone, on-screen controls appear in the match.</div>
      </div>`;
    const cyc = (which: 'home' | 'away', d: number) => {
      const other = which === 'home' ? this.away : this.home;
      let v = (which === 'home' ? this.home : this.away) + d;
      v = (v + TEAMS.length) % TEAMS.length;
      if (v === other) v = (v + d + TEAMS.length) % TEAMS.length;
      if (which === 'home') this.home = v;
      else this.away = v;
      this.render();
      (this.el.querySelector(`#${which}-${d > 0 ? 'next' : 'prev'}`) as HTMLElement)?.focus();
    };
    this.el.querySelector('#home-prev')!.addEventListener('click', () => cyc('home', -1));
    this.el.querySelector('#home-next')!.addEventListener('click', () => cyc('home', 1));
    this.el.querySelector('#away-prev')!.addEventListener('click', () => cyc('away', -1));
    this.el.querySelector('#away-next')!.addEventListener('click', () => cyc('away', 1));
    this.el.querySelectorAll<HTMLButtonElement>('#len button').forEach((b) =>
      b.addEventListener('click', () => {
        this.half = Number(b.dataset.s);
        this.render();
      }),
    );
    this.el.querySelectorAll<HTMLButtonElement>('#tod button').forEach((b) =>
      b.addEventListener('click', () => {
        this.time = b.dataset.t as MenuChoice['time'];
        this.render();
      }),
    );
    this.el.querySelectorAll<HTMLButtonElement>('#diff button').forEach((b) =>
      b.addEventListener('click', () => {
        this.diff = Number(b.dataset.d);
        this.render();
      }),
    );
    this.el.querySelector('#go')!.addEventListener('click', () =>
      this.onStart({ home: TEAMS[this.home], away: TEAMS[this.away], halfSeconds: this.half, time: this.time, difficulty: this.diff }),
    );
  }

  show(on: boolean): void {
    this.el.hidden = !on;
  }
}

export class Overlay {
  el: HTMLDivElement;
  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'screen center';
    this.el.hidden = true;
    parent.appendChild(this.el);
  }

  fullTime(s: MatchState, onAgain: () => void, onMenu: () => void): void {
    const [h, a] = s.teams;
    const pt = s.stats.possession[0] + s.stats.possession[1] || 1;
    const p0 = Math.round((s.stats.possession[0] / pt) * 100);
    const result = s.score[0] > s.score[1] ? 'You win' : s.score[0] < s.score[1] ? 'CPU wins' : 'Draw';
    this.el.innerHTML = `<div class="final" role="dialog" aria-label="Full-time">
      <h2>Full-time · ${result}</h2>
      <div class="res"><div>${h.short}</div><div class="n">${s.score[0]} – ${s.score[1]}</div><div>${a.short}</div></div>
      <div class="stats">
        <div><span>${s.stats.shots[0]}</span><span>Shots</span><span>${s.stats.shots[1]}</span></div>
        <div><span>${p0}%</span><span>Possession</span><span>${100 - p0}%</span></div>
      </div>
      <div class="btns"><button id="menu">Change teams</button><button class="primary" id="again">Play again</button></div></div>`;
    this.el.hidden = false;
    this.el.querySelector('#again')!.addEventListener('click', onAgain);
    this.el.querySelector('#menu')!.addEventListener('click', onMenu);
    (this.el.querySelector('#again') as HTMLElement).focus();
  }

  paused(onResume: () => void, onMenu: () => void, onSettings?: () => void): void {
    this.el.innerHTML = `<div class="final" role="dialog" aria-label="Paused"><h2>Paused</h2>
      <div class="btns"><button id="menu">Quit to menu</button><button id="settings">Settings</button><button class="primary" id="resume">Resume</button></div></div>`;
    if (onSettings) this.el.querySelector('#settings')!.addEventListener('click', onSettings);
    this.el.hidden = false;
    this.el.querySelector('#resume')!.addEventListener('click', onResume);
    this.el.querySelector('#menu')!.addEventListener('click', onMenu);
    (this.el.querySelector('#resume') as HTMLElement).focus();
  }

  hide(): void {
    this.el.hidden = true;
    this.el.innerHTML = '';
  }
}
