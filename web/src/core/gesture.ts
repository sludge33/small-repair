import { clamp01, deltaAngle, inverseLerp, lerp } from './math';

export type ContactState = 'none' | 'began' | 'held' | 'ended';
export type PressureSource = 'touchRadius' | 'force';

/** One gesture-model output, consumed by audio, haptics and the paint masks. */
export interface GestureFrame {
  contact: ContactState;
  /** Position in reference pixels. */
  x: number;
  y: number;
  /** Position as 0–1 of the screen; x drives stereo pan. */
  normalizedX: number;
  normalizedY: number;
  /** Smoothed stroke speed in reference pixels per second (see referenceDpi). */
  speed: number;
  /** 1 = perfectly steady stroke, 0 = at or past the jitter limits. */
  steadiness: number;
  /** Smoothed 0–1 pressure after the source curve. */
  pressure: number;
}

export const isTouching = (frame: GestureFrame) => frame.contact === 'began' || frame.contact === 'held';

export const defaultGestureParams = {
  /** Speeds are reported as pixels per second at this density, so one physical stroke reads the same on every phone. */
  referenceDpi: 326,
  /** Spec default 300 ms. */
  steadinessWindowMs: 300,
  /** Speed variation (std dev / mean) at which steadiness reaches 0. */
  speedVariationAtWorst: 0.6,
  /** Curvature std dev (radians per reference pixel) below this counts as touch noise. */
  curvatureNoiseFloor: 0.006,
  /** Curvature std dev (radians per reference pixel) at which steadiness reaches 0. */
  curvatureVariationAtWorst: 0.04,
  /** Reference pixels the finger must travel before a new heading is measured; hides pixel-level noise on slow strokes. */
  headingStepPx: 12,
  /** With no movement for this long, the finger counts as stopped. */
  stoppedAfterMs: 60,
  /** Time constant of the speed smoothing. */
  speedSmoothingMs: 40,
  /** Time constant of the pressure smoothing. */
  pressureSmoothingMs: 30,
  pressureSource: 'touchRadius' as PressureSource,
  /** Touch radius in reference pixels that maps to pressure 0. */
  radiusAtLightTouch: 15,
  /** Touch radius in reference pixels that maps to pressure 1. */
  radiusAtFirmTouch: 45,
  /** Shapes raw 0–1 pressure before smoothing. */
  pressureCurve: (raw: number) => raw,
};

export type GestureParams = typeof defaultGestureParams;

interface Sample {
  time: number;
  value: number;
}

const smooth = (current: number, target: number, dt: number, timeConstantMs: number) =>
  timeConstantMs <= 0 ? target : lerp(current, target, 1 - Math.exp((-dt * 1000) / timeConstantMs));

/**
 * Turns raw contact samples into speed and steadiness. Has no input or browser dependencies, so it can be tested directly.
 *
 * Direction variance is measured as the spread of curvature, not of heading. A steady polishing circle turns
 * constantly, so raw heading variance would score it as jitter, while its curvature stays constant.
 */
export class GestureAnalyzer {
  private speeds: Sample[] = [];
  private curvatures: Sample[] = [];

  private contact: ContactState = 'none';
  private lastX = 0;
  private lastY = 0;
  private lastMoveTime = 0;
  private lastTime = 0;
  private smoothedSpeed = 0;
  private smoothedPressure = 0;
  private steadiness = 1;

  private anchorX = 0;
  private anchorY = 0;
  private hasHeading = false;
  private lastHeading = 0;

  constructor(private readonly params: GestureParams = defaultGestureParams) {}

  /**
   * @param time Seconds, monotonic.
   * @param touching Whether the finger is down this frame.
   * @param x Position in reference pixels. Ignored when not touching.
   * @param y Position in reference pixels. Ignored when not touching.
   * @param pressure Shaped 0–1 pressure. Ignored when not touching.
   */
  step(time: number, touching: boolean, x: number, y: number, pressure: number): GestureFrame {
    const dt = Math.max(0, time - this.lastTime);
    this.lastTime = time;

    if (touching) {
      if (this.contact === 'none' || this.contact === 'ended') this.beginContact(time, x, y, pressure);
      else this.continueContact(time, dt, x, y, pressure);
    } else if (this.contact === 'began' || this.contact === 'held') {
      this.contact = 'ended';
      this.smoothedSpeed = 0;
    } else {
      this.contact = 'none';
    }

    return {
      contact: this.contact,
      x: this.lastX,
      y: this.lastY,
      normalizedX: 0,
      normalizedY: 0,
      speed: this.smoothedSpeed,
      steadiness: this.steadiness,
      pressure: this.smoothedPressure,
    };
  }

  private beginContact(time: number, x: number, y: number, pressure: number) {
    this.contact = 'began';
    this.speeds = [];
    this.curvatures = [];
    this.lastX = x;
    this.lastY = y;
    this.lastMoveTime = time;
    this.anchorX = x;
    this.anchorY = y;
    this.hasHeading = false;
    this.smoothedSpeed = 0;
    this.smoothedPressure = pressure;
    this.steadiness = 1;
  }

  private continueContact(time: number, dt: number, x: number, y: number, pressure: number) {
    this.contact = 'held';
    const distance = Math.hypot(x - this.lastX, y - this.lastY);

    // Touch digitizers can report slower than the frame rate, so a frame with no movement is not a stop.
    // Speed is measured between reported moves and only falls to zero after stoppedAfterMs.
    let targetSpeed: number;
    if (distance > 0) {
      targetSpeed = distance / Math.max(time - this.lastMoveTime, 1e-4);
      this.speeds.push({ time, value: targetSpeed });
      this.measureHeading(time, x, y);
      this.lastX = x;
      this.lastY = y;
      this.lastMoveTime = time;
    } else if ((time - this.lastMoveTime) * 1000 >= this.params.stoppedAfterMs) {
      targetSpeed = 0;
    } else {
      targetSpeed = this.smoothedSpeed;
    }

    this.smoothedSpeed = smooth(this.smoothedSpeed, targetSpeed, dt, this.params.speedSmoothingMs);
    this.smoothedPressure = smooth(this.smoothedPressure, pressure, dt, this.params.pressureSmoothingMs);

    this.trimWindow(time);
    this.updateSteadiness();
  }

  private measureHeading(time: number, x: number, y: number) {
    const dx = x - this.anchorX;
    const dy = y - this.anchorY;
    const travelled = Math.hypot(dx, dy);
    if (travelled < this.params.headingStepPx) return;

    const heading = Math.atan2(dy, dx);
    if (this.hasHeading) {
      this.curvatures.push({ time, value: deltaAngle(this.lastHeading, heading) / travelled });
    }

    this.lastHeading = heading;
    this.hasHeading = true;
    this.anchorX = x;
    this.anchorY = y;
  }

  private trimWindow(time: number) {
    const oldest = time - this.params.steadinessWindowMs / 1000;
    while (this.speeds.length > 0 && this.speeds[0].time < oldest) this.speeds.shift();
    while (this.curvatures.length > 0 && this.curvatures[0].time < oldest) this.curvatures.shift();
  }

  private updateSteadiness() {
    // Too few samples to judge, for example a finger at rest: keep the last value rather than guessing.
    if (this.speeds.length < 3) return;

    let jitter = clamp01(this.speedVariation() / this.params.speedVariationAtWorst);
    if (this.curvatures.length >= 3) {
      const curvatureJitter = inverseLerp(
        this.params.curvatureNoiseFloor,
        this.params.curvatureVariationAtWorst,
        this.curvatureSpread(),
      );
      jitter = Math.max(jitter, curvatureJitter);
    }

    this.steadiness = 1 - jitter;
  }

  /**
   * Spread of speed around its linear trend over the window, relative to mean speed. Measuring around the trend
   * rather than the mean means speeding up from rest or slowing to a stop does not count as wobble.
   */
  private speedVariation() {
    const samples = this.speeds;
    const firstTime = samples[0].time;
    let meanTime = 0;
    let meanSpeed = 0;
    for (const s of samples) {
      meanTime += s.time - firstTime;
      meanSpeed += s.value;
    }
    meanTime /= samples.length;
    meanSpeed /= samples.length;
    if (meanSpeed <= 0) return 0;

    let covariance = 0;
    let timeVariance = 0;
    for (const s of samples) {
      const t = s.time - firstTime - meanTime;
      covariance += t * (s.value - meanSpeed);
      timeVariance += t * t;
    }
    const slope = timeVariance > 0 ? covariance / timeVariance : 0;

    let squares = 0;
    for (const s of samples) {
      const t = s.time - firstTime - meanTime;
      const residual = s.value - (meanSpeed + slope * t);
      squares += residual * residual;
    }
    return Math.sqrt(squares / samples.length) / meanSpeed;
  }

  private curvatureSpread() {
    const samples = this.curvatures;
    let sum = 0;
    for (const s of samples) sum += s.value;
    const mean = sum / samples.length;

    let squares = 0;
    for (const s of samples) squares += (s.value - mean) * (s.value - mean);
    return Math.sqrt(squares / samples.length);
  }
}
