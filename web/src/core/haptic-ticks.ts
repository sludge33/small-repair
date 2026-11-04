import { lerp } from './math';
import type { ModulationFrame } from './modulation';

/** Tick lengths at sharpness 1 and 0. The Vibration API has no amplitude or sharpness, so length stands in for both. */
const SHARP_TICK_MS = 10;
const SOFT_TICK_MS = 18;
/** How much pressure scales a tick at pressure 0 and 1. */
const LIGHT_SCALE = 0.8;
const FIRM_SCALE = 1.2;

/** The soft pull felt as a held shard nears its seat: ticks per second at full pull, and their sharpness. */
const FIT_TICK_RATE = 24;
const FIT_SHARPNESS = 0.2;
const FIT_PRESSURE = 0.5;

/** How long one tick buzzes, in whole milliseconds, which is all `navigator.vibrate` takes. */
export function tickMs(sharpness: number, pressure: number) {
  return Math.round(lerp(SOFT_TICK_MS, SHARP_TICK_MS, sharpness) * lerp(LIGHT_SCALE, FIRM_SCALE, pressure));
}

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

/**
 * Plays ticks and designed patterns through one vibrate function, which is all a browser offers. Each call replaces
 * whatever was buzzing, so ticks wait for a pattern to finish rather than cutting it off.
 */
export class HapticPlayer {
  ticksFired = 0;
  /** Calls the device refused, as it does for a page that has not been tapped yet. */
  refused = 0;
  /** How strongly a held shard is being drawn to its seat, 0–1. */
  fitPull = 0;

  private readonly stream = new HapticTickStream();
  private patternLeft = 0;

  constructor(private readonly vibrate: (pattern: number | number[]) => boolean) {}

  /** @param pattern On and off lengths in milliseconds. */
  pulse(pattern: number[]) {
    this.patternLeft = pattern.reduce((sum, ms) => sum + ms, 0) / 1000;
    this.send(pattern);
  }

  step(frame: ModulationFrame, deltaTime: number) {
    this.patternLeft = Math.max(0, this.patternLeft - deltaTime);

    const fitRate = this.fitPull * FIT_TICK_RATE;
    const fitting = fitRate > frame.hapticTickRate;
    if (!this.stream.step(fitting ? fitRate : frame.hapticTickRate, deltaTime) || this.patternLeft > 0) return;

    this.ticksFired++;
    this.send(fitting ? tickMs(FIT_SHARPNESS, FIT_PRESSURE) : tickMs(frame.hapticSharpness, frame.body));
  }

  private send(pattern: number | number[]) {
    if (!this.vibrate(pattern)) this.refused++;
  }
}
