// PS5 / Xbox pad: edge-triggered buttons + left-stick aim. Standard mapping:
// 0 ✕, 1 ○, 2 □, 3 △, 5 R1, 7 R2, 9 Options, 12-15 d-pad up/down/left/right.
export interface PadState {
  connected: boolean;
  aim: number | null; // field angle from the stick (+ = off side), null when centred
  pressed: Set<number>; // buttons that went down this frame
  held: Set<number>;
}

let prev: boolean[] = [];

export function readPad(): PadState {
  const gp = navigator.getGamepads?.().find((x) => x && x.connected) ?? null;
  if (!gp) return { connected: false, aim: null, pressed: new Set(), held: new Set() };
  const b = gp.buttons.map((x) => x.pressed);
  const pressed = new Set<number>();
  const held = new Set<number>();
  b.forEach((on, i) => {
    if (on) held.add(i);
    if (on && !prev[i]) pressed.add(i);
  });
  prev = b;
  const ax = gp.axes[0] ?? 0;
  const ay = gp.axes[1] ?? 0;
  return { connected: true, aim: Math.hypot(ax, ay) > 0.3 ? Math.atan2(ax, -ay) : null, pressed, held };
}
