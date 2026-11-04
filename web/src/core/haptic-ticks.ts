/** Turns a tick rate into individual ticks, keeping the phase so rate changes stay smooth. */
export class HapticTickStream {
  private phase = 0;

  /** True when a tick is due this frame. A slow frame fires one tick and drops the rest, so ticks never burst. */
  step(ticksPerSecond: number, deltaTime: number) {
    if (ticksPerSecond <= 0) {
      this.phase = 0;
      return false;
    }

    this.phase += ticksPerSecond * deltaTime;
    if (this.phase < 1) return false;

    this.phase %= 1;
    return true;
  }
}
