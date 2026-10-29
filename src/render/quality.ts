// Frame-rate guard. Phones render at DPR 2 with MSAA and no post stack; if a device can't hold
// ~55 fps after a warm-up, resolution steps down gently (never below 1.25×) and back up when there's room.

import { World } from './scene';
import { GraphicsMode } from '../ui/settings';

export class Quality {
  dpr: number;
  fps = 60;
  private t = 0;
  private frames = 0;
  private warm = 0;
  private good = 0;

  constructor(private w: World, private resize: () => void, public mode: GraphicsMode) {
    this.dpr = this.ceiling();
  }

  /** Highest resolution this device/mode should use. */
  ceiling(): number {
    if (this.mode === 'performance') return Math.min(this.w.maxDpr, 1.5);
    return this.w.maxDpr;
  }

  /** Post-processing (AO, bloom) only on desktop "auto"/"quality", or a phone set to "quality". */
  usePost(): boolean {
    return this.mode === 'quality' || (this.mode === 'auto' && !this.w.mobile);
  }

  setMode(m: GraphicsMode): void {
    this.mode = m;
    this.apply(this.ceiling());
    this.warm = 0;
  }

  /** Restart the warm-up (new match: shaders compile, textures upload). */
  reset(): void {
    this.warm = 0;
    this.t = 0;
    this.frames = 0;
  }

  private apply(d: number): void {
    this.dpr = d;
    this.w.renderer.setPixelRatio(d);
    this.resize();
  }

  tick(frameDt: number): void {
    this.t += frameDt;
    this.frames++;
    if (this.t < 1) return;
    this.fps = this.frames / this.t;
    this.t = 0;
    this.frames = 0;
    this.warm++;
    if (this.warm < 6 || this.mode !== 'auto') return;
    if (this.fps < 50 && this.dpr > 1.25) {
      this.apply(Math.max(1.25, this.dpr - 0.25));
      this.good = 0;
      this.warm = 3; // let it settle before judging again
    } else if (this.fps > 58.5 && this.dpr < this.ceiling()) {
      if (++this.good >= 8) {
        this.apply(Math.min(this.ceiling(), this.dpr + 0.25));
        this.good = 0;
      }
    } else this.good = 0;
  }
}
