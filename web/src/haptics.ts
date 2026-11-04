import { HapticTickStream } from './core/haptic-ticks';
import type { ModulationFrame } from './core/modulation';

const SHARP_TICK_MS = 8;
const SOFT_TICK_MS = 14;
const SHARP_THRESHOLD = 0.5;

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

  step(frame: ModulationFrame, deltaTime: number) {
    if (!this.stream.step(frame.hapticTickRate, deltaTime)) return;

    this.ticksFired++;
    if (this.backend !== 'none') {
      navigator.vibrate(frame.hapticSharpness >= SHARP_THRESHOLD ? SHARP_TICK_MS : SOFT_TICK_MS);
    }
  }
}
