// Broadcast-style HUD: score bug, clock, controlled player, shot power, banners.

import { MatchState } from '../match/state';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export class Hud {
  root: HTMLDivElement;
  private bug: HTMLDivElement;
  private half: HTMLDivElement;
  private who: HTMLDivElement;
  private power: HTMLDivElement;
  private powerFill: HTMLElement;
  private banner: HTMLDivElement;
  private restart: HTMLDivElement;
  private bannerUntil = 0;
  private last = '';

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.innerHTML = `
      <div class="bug" aria-live="polite"></div>
      <div class="half"></div>
      <div class="restart" hidden></div>
      <div class="who"></div>
      <div class="power" hidden><i></i></div>
      <div class="replay" hidden><i></i>Replay<span>Press any key to skip</span></div>
      <div class="banner" hidden><div class="big"></div><div class="small"></div></div>`;
    parent.appendChild(this.root);
    this.bug = this.root.querySelector('.bug')!;
    this.half = this.root.querySelector('.half')!;
    this.who = this.root.querySelector('.who')!;
    this.power = this.root.querySelector('.power')!;
    this.powerFill = this.power.querySelector('i')!;
    this.banner = this.root.querySelector('.banner')!;
    this.restart = this.root.querySelector('.restart')!;
  }

  replay(on: boolean): void {
    (this.root.querySelector('.replay') as HTMLElement).hidden = !on;
  }

  show(on: boolean): void {
    this.root.hidden = !on;
  }

  flash(big: string, small: string, seconds: number, color = '#f3f5f2'): void {
    this.banner.hidden = false;
    (this.banner.querySelector('.big') as HTMLElement).textContent = big;
    (this.banner.querySelector('.big') as HTMLElement).style.color = color;
    const sm = this.banner.querySelector('.small') as HTMLElement;
    sm.textContent = small;
    sm.hidden = !small;
    this.banner.classList.remove('pop');
    void this.banner.offsetWidth;
    this.banner.classList.add('pop');
    this.bannerUntil = performance.now() + seconds * 1000;
  }

  update(s: MatchState, minute: number, playerScreen: { x: number; y: number } | null, humanActive: boolean): void {
    const [h, a] = s.teams;
    const key = `${s.score[0]}-${s.score[1]}-${minute}-${h.id}-${a.id}`;
    if (key !== this.last) {
      this.last = key;
      this.bug.innerHTML = `
        <div class="team"><span class="chip" style="background:${h.primary};box-shadow:inset -3px 0 ${h.secondary}"></span>${h.short}</div>
        <div class="score">${s.score[0]} – ${s.score[1]}</div>
        <div class="team">${a.short}<span class="chip" style="background:${a.primary};box-shadow:inset 3px 0 ${a.secondary}"></span></div>
        <div class="clock">${minute}'</div>`;
    }
    this.half.textContent = s.half === 1 ? '1st half' : '2nd half';
    const c = s.controlled;
    if (humanActive) {
      const tip = s.owner === c ? 'J pass · K shoot · I through · L lob' : s.owner && s.owner.team !== c.team ? 'J tackle · Q switch' : 'Q switch player';
      this.who.innerHTML = `<span class="num">${c.number}</span><span>${esc(c.name.toUpperCase())}</span><span class="hint">${tip}</span>`;
    } else this.who.innerHTML = '';
    // Power bar over the controlled player while charging a shot
    if (s.shotCharge >= 0 && playerScreen) {
      this.power.hidden = false;
      this.power.style.left = `${playerScreen.x}px`;
      this.power.style.top = `${playerScreen.y - 12}px`;
      this.powerFill.style.width = `${Math.round(s.shotCharge * 100)}%`;
    } else this.power.hidden = true;

    const r = s.restart;
    const label = s.phase === 'restart' && r ? ({ throwin: 'Throw-in', corner: 'Corner', goalkick: 'Goal kick', kickoff: 'Kick-off', freekick: 'Free kick', indirect: 'Indirect free kick', penalty: 'Penalty' } as Record<string, string>)[r.kind] : s.phase === 'kickoff' ? 'Kick-off' : '';
    this.restart.hidden = !label;
    if (label) this.restart.textContent = `${label} · ${s.teams[r ? r.team : 0].short}`;

    if (!this.banner.hidden && performance.now() > this.bannerUntil) this.banner.hidden = true;
  }
}
