// Keyboard input with edge detection (pressed this frame / released this frame).

export type Action = 'pass' | 'through' | 'shoot' | 'lob' | 'switch' | 'sprint' | 'pause' | 'finesse';

const BINDINGS: Record<string, Action> = {
  KeyJ: 'pass',
  KeyI: 'through',
  KeyK: 'shoot',
  KeyL: 'lob',
  KeyO: 'finesse',
  KeyQ: 'switch',
  ShiftLeft: 'sprint',
  ShiftRight: 'sprint',
  Escape: 'pause',
};

/** Xbox-style standard mapping: A pass, B shoot, X lob, Y through, LB switch, RB finesse, RT sprint, Start pause. */
export const PAD_BUTTONS: [number, Action][] = [
  [0, 'pass'],
  [1, 'shoot'],
  [2, 'lob'],
  [3, 'through'],
  [4, 'switch'],
  [5, 'finesse'],
  [7, 'sprint'],
  [9, 'pause'],
];

export class Input {
  private down = new Set<string>();
  private pressedQ = new Set<Action>();
  private releasedQ = new Set<Action>();
  /** Touch/virtual stick direction, overrides keys when non-zero. */
  virtualMove = { x: 0, y: 0 };
  /** Gamepad state (standard mapping), refreshed by poll(). */
  private padMove = { x: 0, y: 0 };
  private padHeld = new Set<Action>();
  padConnected = false;
  /** True when the game is drawn rotated 90° (portrait phone): touch deltas must be rotated too. */
  rotated = false;
  private virtualHeld = new Set<Action>();

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.down.add(e.code);
      const a = BINDINGS[e.code];
      if (a) this.pressedQ.add(a);
    });
    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
      const a = BINDINGS[e.code];
      if (a) this.releasedQ.add(a);
    });
    window.addEventListener('blur', () => this.down.clear());
  }

  pressVirtual(a: Action): void {
    this.virtualHeld.add(a);
    this.pressedQ.add(a);
  }
  releaseVirtual(a: Action): void {
    this.virtualHeld.delete(a);
    this.releasedQ.add(a);
  }

  /** Read the first connected gamepad. Call once per fixed step before the game reads input. */
  poll(): void {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = Array.from(pads ?? []).find((g) => g && g.connected);
    this.padConnected = !!gp;
    if (!gp) {
      this.padMove = { x: 0, y: 0 };
      for (const a of this.padHeld) this.releasedQ.add(a);
      this.padHeld.clear();
      return;
    }
    const ax = gp.axes[0] ?? 0;
    const ay = gp.axes[1] ?? 0;
    const l = Math.hypot(ax, ay);
    this.padMove = l < 0.22 ? { x: 0, y: 0 } : { x: ax / Math.max(1, l), y: -ay / Math.max(1, l) };
    const now = new Set<Action>();
    for (const [i, a] of PAD_BUTTONS) if (gp.buttons[i]?.pressed) now.add(a);
    for (const a of now) if (!this.padHeld.has(a)) this.pressedQ.add(a);
    for (const a of this.padHeld) if (!now.has(a)) this.releasedQ.add(a);
    this.padHeld = now;
  }

  held(a: Action): boolean {
    if (this.virtualHeld.has(a) || this.padHeld.has(a)) return true;
    for (const [code, act] of Object.entries(BINDINGS)) if (act === a && this.down.has(code)) return true;
    return false;
  }
  pressed(a: Action): boolean {
    return this.pressedQ.has(a);
  }
  released(a: Action): boolean {
    return this.releasedQ.has(a);
  }
  /** Call once per fixed update after the game has read input. */
  endStep(): void {
    this.pressedQ.clear();
    this.releasedQ.clear();
  }

  /** Screen-relative move vector: x = right, y = up (away from camera). */
  move(): { x: number; y: number } {
    if (this.virtualMove.x !== 0 || this.virtualMove.y !== 0) return this.virtualMove;
    if (this.padMove.x !== 0 || this.padMove.y !== 0) return this.padMove;
    let x = 0;
    let y = 0;
    if (this.down.has('KeyA') || this.down.has('ArrowLeft')) x -= 1;
    if (this.down.has('KeyD') || this.down.has('ArrowRight')) x += 1;
    if (this.down.has('KeyW') || this.down.has('ArrowUp')) y += 1;
    if (this.down.has('KeyS') || this.down.has('ArrowDown')) y -= 1;
    const l = Math.hypot(x, y);
    return l > 0 ? { x: x / l, y: y / l } : { x: 0, y: 0 };
  }
}
