// On-screen joystick and buttons for touch devices.

import { Action, Input } from '../core/input';

export function createTouchControls(parent: HTMLElement, input: Input): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'touch';
  const lab = (att: string, def: string) => `<span class="att">${att}</span><span class="def">${def}</span>`;
  el.innerHTML = `
    <div class="stickzone" aria-label="Move: touch and drag anywhere on the left"></div>
    <div class="stick"><i></i></div>
    <div class="pad">
      <button data-a="shoot" class="main" aria-label="Shoot (hold for power) / slide tackle">${lab('SHOOT', 'SLIDE')}</button>
      <button data-a="pass" class="main" aria-label="Pass / hold to press, tap to tackle">${lab('PASS', 'PRESS')}</button>
      <button data-a="through">${lab('THRU', '—')}</button>
      <button data-a="lob">${lab('LOB', '—')}</button>
      <button data-a="finesse">${lab('CURL', '—')}</button>
      <button data-a="sprint">SPRINT</button>
      <button data-a="switch">SWITCH</button>
    </div>`;
  parent.appendChild(el);
  const zone = el.querySelector('.stickzone') as HTMLDivElement;
  const stick = el.querySelector('.stick') as HTMLDivElement;
  const knob = stick.querySelector('i') as HTMLElement;
  // Floating stick: it appears wherever the left thumb lands
  let id: number | null = null;
  let ox = 0;
  let oy = 0;
  const R = 56;
  const toContent = (e: PointerEvent) => (input.rotated ? { x: e.clientY, y: window.innerWidth - e.clientX } : { x: e.clientX, y: e.clientY });
  const setFrom = (e: PointerEvent) => {
    const c = toContent(e);
    let x = (c.x - ox) / R;
    let y = (c.y - oy) / R;
    const l = Math.hypot(x, y);
    if (l > 1) {
      // Drag past the rim and the base follows the thumb
      ox += (x / l) * (l - 1) * R;
      oy += (y / l) * (l - 1) * R;
      stick.style.left = `${ox}px`;
      stick.style.top = `${oy}px`;
      x /= l;
      y /= l;
    }
    knob.style.transform = `translate(${x * 42}px, ${y * 42}px)`;
    const m = Math.min(1, l);
    // Small dead zone, then full analogue range (walk → jog → auto-sprint at the rim)
    input.virtualMove = m < 0.12 ? { x: 0, y: 0 } : { x, y: -y };
  };
  zone.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    id = e.pointerId;
    zone.setPointerCapture(e.pointerId);
    const c = toContent(e);
    ox = c.x;
    oy = c.y;
    stick.style.left = `${ox}px`;
    stick.style.top = `${oy}px`;
    stick.classList.add('live');
    setFrom(e);
  });
  zone.addEventListener('pointermove', (e) => {
    if (e.pointerId === id) setFrom(e);
  });
  const end = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    id = null;
    knob.style.transform = '';
    stick.classList.remove('live');
    stick.style.left = '';
    stick.style.top = '';
    input.virtualMove = { x: 0, y: 0 };
  };
  zone.addEventListener('pointerup', end);
  zone.addEventListener('pointercancel', end);
  el.querySelectorAll<HTMLButtonElement>('.pad button').forEach((b) => {
    const a = b.dataset.a as Action;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      b.setPointerCapture(e.pointerId);
      b.classList.add('on');
      input.pressVirtual(a);
      navigator.vibrate?.(8);
    });
    const up = () => {
      b.classList.remove('on');
      input.releaseVirtual(a);
    };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
  });
  // Stop iOS from scrolling, zooming or bouncing the page during play
  for (const t of ['touchstart', 'touchmove', 'gesturestart'] as const)
    el.addEventListener(t, (e) => e.preventDefault(), { passive: false });
  return el;
}

export const isTouch = () => window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
