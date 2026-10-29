// Fixed-timestep loop: simulation at 60 Hz, render every animation frame with interpolation alpha.

export const STEP = 1 / 60;
const MAX_FRAME = 0.25;

export class FixedStepper {
  private acc = 0;
  /** Returns how many fixed updates to run for this frame's elapsed time. */
  advance(elapsed: number): number {
    this.acc += Math.min(Math.max(elapsed, 0), MAX_FRAME);
    let n = 0;
    while (this.acc >= STEP - 1e-9) {
      this.acc -= STEP;
      n++;
    }
    return n;
  }
  /** How far (0..1) the render time is between the last two simulation steps. */
  get alpha(): number {
    return Math.min(1, this.acc / STEP);
  }
}

export function startLoop(update: (dt: number) => void, render: (frameDt: number, alpha: number) => void): void {
  const stepper = new FixedStepper();
  let last = performance.now();
  const frame = (now: number) => {
    const elapsed = (now - last) / 1000;
    last = now;
    const n = stepper.advance(elapsed);
    for (let i = 0; i < n; i++) update(STEP);
    render(Math.min(elapsed, MAX_FRAME), stepper.alpha);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
