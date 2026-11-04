const RATIOS = [2, 1.5, 1.25, 1];
const MAX_RATIO = RATIOS[0];
/** Long enough that one hitch never costs any sharpness. */
const WINDOW_DRAWS = 90;
/** Just under the 30 frames per second a phone's low-power mode caps a page at, which no lower resolution would lift. */
const SLOW_SECONDS = 1 / 28;

/**
 * Lowers the bowl's resolution on a phone too slow to draw it smoothly, since a stroke that stutters costs more than
 * a softer picture. It only ever steps down: stepping back up would flicker on a phone at the edge.
 */
export class ResolutionGovernor {
  ratio: number;

  private seconds = 0;
  private draws = 0;

  constructor(deviceRatio: number) {
    this.ratio = Math.min(deviceRatio, MAX_RATIO);
  }

  /** Counts one drawn frame. Returns true when the ratio has just changed. */
  drew(deltaTime: number) {
    this.seconds += deltaTime;
    if (++this.draws < WINDOW_DRAWS) return false;

    const slow = this.seconds / this.draws > SLOW_SECONDS;
    this.seconds = 0;
    this.draws = 0;

    const next = RATIOS.find((ratio) => ratio < this.ratio);
    if (!slow || next === undefined) return false;
    this.ratio = next;
    return true;
  }
}
