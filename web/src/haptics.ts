import { HapticTickStream } from './core/haptic-ticks';
import type { ModulationFrame } from './core/modulation';

const SHARP_TICK_MS = 8;
const SOFT_TICK_MS = 14;
const SHARP_THRESHOLD = 0.5;

/** Discrete moments, as Vibration API on/off patterns in milliseconds. */
const PATTERNS = {
  seat: [12, 30, 22],
  lid: [40],
  puff: [6],
  flap: [18],
  box: [32],
  crease: [8],
  tear: [10],
};

/**
 * Plays the modulation's tick stream on the device. Ticks are still counted where there is no backend,
 * so the overlay can show them. Android Chrome is the only backend for now: the Vibration API has no amplitude
 * or sharpness, so sharpness picks a duration and intensity is lost. iOS browsers have no vibration at all.
 * Native builds would add a Capacitor backend here for Core Haptics and VibrationEffect.Composition.
 */
export class Haptics {
  ticksFired = 0;
  readonly backend = typeof navigator.vibrate === 'function' ? 'web vibrate' : 'none';

  private readonly stream = new HapticTickStream();

  pulse(name: keyof typeof PATTERNS) {
    if (this.backend !== 'none') navigator.vibrate(PATTERNS[name]);
  }

  step(frame: ModulationFrame, deltaTime: number) {
    if (!this.stream.step(frame.hapticTickRate, deltaTime)) return;

    this.ticksFired++;
    if (this.backend !== 'none') {
      navigator.vibrate(frame.hapticSharpness >= SHARP_THRESHOLD ? SHARP_TICK_MS : SOFT_TICK_MS);
    }
  }
}
