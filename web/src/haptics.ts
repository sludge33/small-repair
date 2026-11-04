import { HapticPlayer } from './core/haptic-ticks';
import type { ModulationFrame } from './core/modulation';

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
 * The device end of the haptics. Ticks are still counted where there is no backend, so the overlay can show them.
 * Android Chrome is the only backend for now: the Vibration API has no amplitude or sharpness, so tick length stands
 * in for both. iOS browsers have no vibration at all.
 * Native builds would add a Capacitor backend here for Core Haptics and VibrationEffect.Composition.
 */
export class Haptics {
  readonly backend = typeof navigator.vibrate === 'function' ? 'web vibrate' : 'none';

  private readonly player = new HapticPlayer((pattern) => this.backend === 'none' || navigator.vibrate(pattern));

  get ticksFired() {
    return this.player.ticksFired;
  }

  get refused() {
    return this.player.refused;
  }

  set fitPull(pull: number) {
    this.player.fitPull = pull;
  }

  pulse(name: keyof typeof PATTERNS) {
    this.player.pulse(PATTERNS[name]);
  }

  step(frame: ModulationFrame, deltaTime: number) {
    this.player.step(frame, deltaTime);
  }
}
