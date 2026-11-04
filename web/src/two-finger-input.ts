import { twoFingerDelta, type Point, type TwoFingerDelta } from './core/two-finger';

const NONE: TwoFingerDelta = { panX: 0, panY: 0, scale: 1, twist: 0 };

/** Adds up what two fingers do between frames, for pinch, orbit and twisting a shard. */
export class TwoFingerInput {
  /** True while two or more fingers are down. */
  active = false;

  private last: [Point, Point] | null = null;
  private pending: TwoFingerDelta = { ...NONE };

  constructor(surface: HTMLElement) {
    const read = (e: TouchEvent) => {
      this.active = e.touches.length >= 2;
      if (!this.active) {
        this.last = null;
        return;
      }

      const now: [Point, Point] = [
        { x: e.touches[0].clientX, y: e.touches[0].clientY },
        { x: e.touches[1].clientX, y: e.touches[1].clientY },
      ];
      if (this.last) {
        const delta = twoFingerDelta(this.last[0], this.last[1], now[0], now[1]);
        this.pending.panX += delta.panX;
        this.pending.panY += delta.panY;
        this.pending.scale *= delta.scale;
        this.pending.twist += delta.twist;
      }
      this.last = now;
    };
    for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel'] as const) {
      surface.addEventListener(type, read, { passive: true });
    }
  }

  /** Everything since the last call. */
  take() {
    const delta = this.pending;
    this.pending = { ...NONE };
    return delta;
  }
}
