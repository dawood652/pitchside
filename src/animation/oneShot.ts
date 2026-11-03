// Chooses the full-body clip ("one-shot") a player should be playing: football mocap (mc_*), Google
// Research Football clips (gf_*) and Quaternius clips. GRF clips are timed so their ball-contact frame
// lands on the simulation's contact moment: the clip is started late and/or played faster when the
// sim gives less time than the clip's wind-up (contact scheduling).

import { Player } from '../entities/player';
import { CLASS_SPEED, pickGf, speedClass, GfCat } from './gfSelect';
import type { AnimContext } from './animator';

/** name, start time (s), time scale, loop, fade-in (s). */
export interface ClipReq {
  name: string;
  start: number;
  scale: number;
  loop: boolean;
  fade: number;
}

const deg = (r: number) => (r * 180) / Math.PI;
const CONTACT_SHARE = 0.3; // kick contact at this share of the action (actions.ts CONTACT)
const MAX_SPEEDUP = 1.6;

/** Start/scale so the clip's touch frame (touch) lands `contactIn` seconds from now. */
export function alignContact(touch: number, contactIn: number): { start: number; scale: number } {
  if (contactIn <= 0.02) return { start: Math.max(0, touch - 0.08), scale: 1 };
  if (touch <= contactIn) {
    // more time than the wind-up: play a little slower, then start late if still too much
    const scale = Math.max(0.8, touch / contactIn);
    return { start: Math.max(0, touch - contactIn * scale), scale };
  }
  // not enough time for the whole wind-up: skip some and speed up the rest
  const scale = Math.min(MAX_SPEEDUP, Math.max(1, touch / contactIn));
  return { start: Math.max(0, touch - contactIn * scale), scale };
}

export class OneShotChooser {
  // clip picked for the current action (kick / header / save / trip / block)
  private pick: { key: string; name: string; start: number; scale: number; fade: number; lay: string | null } | null = null;
  // touch animation (dribble cut / first touch / turn) playing outside of a game action
  private touchClip: { name: string; start: number; scale: number; left: number } | null = null;

  constructor(private dur: (name: string) => number) {}

  /** A dribble touch, trap or turn from the simulation. */
  touch(p: Player): void {
    const ev = p.touchEvent;
    p.touchEvent = null;
    if (!ev || p.action !== 'none') return;
    const g = pickGf(ev.kind, p.speed, deg(ev.angle), p.id, { h: ev.h });
    const d = g ? this.dur(g.clip) : 0;
    if (!g || d <= 0) return;
    const start = ev.kind === 'move' ? 0 : Math.max(0, g.touch - 0.06);
    // speed-matched playback: a clip recorded at another pace is played proportionally faster/slower
    const sc = speedClass(p.speed);
    const scale = sc > 0 ? Math.min(1.25, Math.max(0.85, p.speed / CLASS_SPEED[sc])) : 1;
    this.touchClip = { name: g.clip, start, scale, left: Math.min(d - start, 0.75) / scale };
  }

  tick(dt: number, p: Player): void {
    if (this.touchClip) {
      this.touchClip.left -= dt;
      if (this.touchClip.left <= 0 || p.action !== 'none') this.touchClip = null;
    }
    if (p.action === 'none' || p.action === 'celebrate') this.pick = null;
  }

  /** GRF clip for a cue-carrying action, picked once per action. */
  private cued(p: Player, cat: GfCat, contactIn: number, angle: number): ClipReq | null {
    const key = `${p.action}:${cat}`;
    if (!this.pick || this.pick.key !== key || p.actionT < 0.02) {
      const cue = p.cue;
      const g = pickGf(cat, p.speed, angle, p.id, { h: cue?.h, side: cue?.side, severity: cue?.severity });
      if (!g) return null;
      const a = cat === 'trip' ? { start: 0, scale: 1 } : alignContact(g.touch, contactIn);
      this.pick = { key, name: g.clip, start: a.start, scale: a.scale, fade: cat === 'pass' || cat === 'shot' ? 0.08 : 0.12, lay: g.entry.lay ?? null };
    }
    return { name: this.pick.name, start: this.pick.start, scale: this.pick.scale, loop: false, fade: this.pick.fade };
  }

  /** Stand up at the end of a long fall (or dive) that ends lying down. */
  private standUp(p: Player): ClipReq | null {
    if (!this.pick) return null;
    const lay = this.pick.lay ?? (p.action === 'stumble' ? 'lay_front' : null);
    if (!lay) return null;
    const g = pickGf('standup', 0, 0, p.id, { lay });
    if (!g) return null;
    const d = this.dur(g.clip);
    if (p.actionDur - p.actionT > d * 0.95) return null;
    return { name: g.clip, start: 0, scale: 1, loop: false, fade: 0.2 };
  }

  want(p: Player, ctx: AnimContext): ClipReq | null {
    const cue = p.cue;
    switch (p.action) {
      case 'pass':
      case 'lob':
      case 'shot':
        // foot contact lands on the simulation's contact moment (CONTACT share of the action)
        return this.cued(p, p.action === 'shot' ? 'shot' : 'pass', Math.max(0, p.actionDur * CONTACT_SHARE - p.actionT), deg(p.kickAngle));
      case 'header':
        if (cue) return this.cued(p, 'header', Math.max(0, (cue.contact ?? 0) - p.actionT), cue.angle);
        return { name: 'Jump_Start', start: 0.38 * this.dur('Jump_Start'), scale: 1.25, loop: false, fade: 0.1 };
      case 'block':
      case 'challenge':
        return cue ? this.cued(p, 'interfere', Math.max(0, (cue.contact ?? 0) - p.actionT), 0) : null;
      case 'dive':
        if (!cue) return null; // procedural fallback
        return (p.actionDur > 1 && this.standUp(p)) || this.cued(p, 'deflect', Math.max(0, (cue.contact ?? 0) - p.actionT), 0);
      case 'stumble':
        if (cue) return (p.actionDur > 1 && this.standUp(p)) || this.cued(p, 'trip', 0, cue.angle);
        if (p.actionDur > 1) return p.actionT < 0.8 ? clip('Hit_Knockback', 0, 1) : clip('KipUp', 0, 1.05);
        return clip('Hit_Chest', 0, 0.9);
      case 'throwin':
        return clip('mc_throwin', 0.36 * this.dur('mc_throwin'), 1.2);
      case 'tackle':
        if (!p.slide) return clip(p.id % 2 ? 'mc_tackle' : 'mc_tackle_M', 0.1 * this.dur('mc_tackle'), 1.15);
        return p.actionT < 0.66 ? clip('Slide_Start', 0, 1.15) : clip('Slide_Exit', 0, 1.1);
      case 'catch':
        // high ball: jump-and-catch; low ball: crouch and gather
        return ctx.ball.y > 1.3 ? clip('mc_save1', 0.1 * this.dur('mc_save1'), 1.25) : clip('mc_save3', 0.3 * this.dur('mc_save3'), 1.3);
      case 'gkthrow':
        return clip('OverhandThrow', 0.2 * this.dur('OverhandThrow'), 1.4);
      case 'celebrate': {
        const v = p.celebrateVariant;
        if (v === 0) return p.speed < 1.2 ? clip('mc_cele1', 0, 1) : null;
        if (v === 1) return p.actionT < 1.2 ? clip('JogToFlip', 0, 1) : clip('mc_cele3', 0, 1);
        if (v === 2) return p.speed < 1.2 ? clip('mc_cele2', 0, 1) : null;
        return p.actionT < 1.9 ? clip('BackFlip', 0, 1) : { ...clip('Dance_Loop', 0, 1), loop: true };
      }
      default:
        break;
    }
    if (this.touchClip) return { name: this.touchClip.name, start: this.touchClip.start, scale: this.touchClip.scale, loop: false, fade: 0.1 };
    if (ctx.outcome && p.speed < 0.5) {
      if (ctx.outcome === 'win') return { ...clip('Celebration', 0, 1), loop: true };
      if (ctx.outcome === 'lose') return { ...clip(p.id % 2 ? 'Idle_Tired_Loop' : 'Idle_No_Loop', 0, 1), loop: true };
    }
    return null;
  }
}

function clip(name: string, start: number, scale: number): ClipReq {
  return { name, start, scale, loop: false, fade: 0.14 };
}
