// Keyboard, PS5/Xbox controller and touch-swipe input for batting.
// A shot = a direction (screen space, up = straight down the ground) + swing moment + loft flag.

export interface SwingCmd {
  dx: number; // -1..1, right = off side
  dy: number; // -1..1, up = straight
  loft: boolean;
  block: boolean;
  /** Screen point that was touched/clicked (tap-to-hit), in CSS pixels. */
  sx?: number;
  sy?: number;
}

export class Input {
  private keys = new Set<string>();
  private padPrev: boolean[] = [];
  private queued: SwingCmd | null = null;
  menuPress = false; // Cross/Enter/Space on menus
  pausePress = false;

  constructor(el: HTMLElement) {
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Space' || e.code === 'KeyJ') this.swing(false);
      if (e.code === 'KeyK') this.swing(true);
      if (e.code === 'Enter') this.menuPress = true;
      if (e.code === 'Escape' || e.code === 'KeyP') this.pausePress = true;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    // Tap / click: the moment is the swing, the point on the field is where the ball goes
    el.addEventListener('pointerdown', (e) => {
      this.queued = { dx: 0, dy: 1, loft: true, block: false, sx: e.clientX, sy: e.clientY };
      this.menuPress = true;
      e.preventDefault();
    });
    for (const t of ['touchstart', 'touchmove', 'touchend'] as const) el.addEventListener(t, (e) => e.preventDefault(), { passive: false });
  }

  private dirFromKeys(): { dx: number; dy: number } {
    const k = (a: string, b: string) => this.keys.has(a) || this.keys.has(b);
    const dx = (k('ArrowRight', 'KeyD') ? 1 : 0) - (k('ArrowLeft', 'KeyA') ? 1 : 0);
    const dy = (k('ArrowUp', 'KeyW') ? 1 : 0) - (k('ArrowDown', 'KeyS') ? 1 : 0);
    return { dx, dy };
  }

  private swing(loftKey: boolean, pad?: { dx: number; dy: number; loft: boolean; block: boolean }): void {
    if (pad) {
      this.queued = pad;
      return;
    }
    const d = this.dirFromKeys();
    const l = Math.hypot(d.dx, d.dy) || 1;
    this.queued = { dx: d.dx / l, dy: d.dy / l, loft: loftKey || this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'), block: this.keys.has('KeyB') };
    this.menuPress = true;
  }

  /** Call once per frame. */
  poll(): void {
    const gp = navigator.getGamepads?.().find((g) => g && g.connected);
    if (!gp) return;
    const b = gp.buttons.map((x) => x.pressed);
    const edge = (i: number) => b[i] && !this.padPrev[i];
    const ax = gp.axes[0] ?? 0;
    const ay = gp.axes[1] ?? 0;
    const m = Math.hypot(ax, ay);
    const dir = m > 0.3 ? { dx: ax / m, dy: -ay / m } : { dx: 0, dy: 0 };
    // Cross = shot, Square = lofted shot, Circle = block; holding R1/R2/L1 also lofts
    const loftHeld = !!(b[5] || b[7] || b[4]);
    if (edge(0)) this.swing(false, { ...dir, loft: loftHeld, block: false });
    if (edge(2)) this.swing(false, { ...dir, loft: true, block: false });
    if (edge(1)) this.swing(false, { ...dir, loft: false, block: true });
    if (edge(0) || edge(9)) this.menuPress = true;
    if (edge(9)) this.pausePress = true;
    this.padPrev = b;
  }

  take(): SwingCmd | null {
    const q = this.queued;
    this.queued = null;
    return q;
  }
  clear(): void {
    this.queued = null;
    this.menuPress = false;
    this.pausePress = false;
  }
}
