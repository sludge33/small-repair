import { GestureAnalyzer, defaultGestureParams, type GestureFrame, type GestureParams } from './core/gesture';
import { clamp01, inverseLerp } from './core/math';

// Browsers lay phones out at about 160 CSS pixels per inch, so CSS pixels stand in for the device's real density.
const CSS_PIXELS_PER_INCH = 160;
const MOUSE_SCROLL_PRESSURE_STEP = 0.05;

/**
 * The single gesture source. Tracks the primary finger and publishes one GestureFrame per animation frame.
 * On a desktop the mouse stands in for a finger and the scroll wheel stands in for pressure.
 */
export class GestureInput {
  /** Pressure value before the curve and smoothing, for checking what a device actually reports. */
  rawPressureSignal = 0;
  /** Fingers currently down, including ones the gesture ignores. */
  touchCount = 0;
  onTouchDown: () => void = () => {};
  /** Off while the wheel means something else, such as twisting a held shard. */
  wheelIsPressure = true;

  private readonly analyzer: GestureAnalyzer;
  private readonly toReference: number;

  private pointerId: number | null = null;
  private usingMouse = false;
  private clientX = 0;
  private clientY = 0;
  private touchRadius = 0;
  private touchForce = 0;
  private mousePressure = 0.5;

  constructor(
    surface: HTMLElement,
    private readonly params: GestureParams = defaultGestureParams,
  ) {
    this.analyzer = new GestureAnalyzer(params);
    this.toReference = params.referenceDpi / CSS_PIXELS_PER_INCH;

    surface.addEventListener('pointerdown', (e) => {
      if (this.pointerId !== null || !e.isPrimary) return;
      this.pointerId = e.pointerId;
      this.usingMouse = e.pointerType === 'mouse';
      this.track(e);
      surface.setPointerCapture(e.pointerId);
      this.onTouchDown();
    });
    surface.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.pointerId) this.track(e);
    });
    const release = (e: PointerEvent) => {
      if (e.pointerId === this.pointerId) this.pointerId = null;
    };
    surface.addEventListener('pointerup', release);
    surface.addEventListener('pointercancel', release);

    // Pointer events report contact size unevenly across browsers; Touch reports radius and force on both phone platforms.
    const readTouches = (e: TouchEvent) => {
      this.touchCount = e.touches.length;
      const touch = e.touches[0];
      if (!touch) return;
      this.touchRadius = Math.max(touch.radiusX, touch.radiusY);
      this.touchForce = touch.force;
    };
    for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel'] as const) {
      surface.addEventListener(type, readTouches, { passive: true });
    }

    surface.addEventListener(
      'wheel',
      (e) => {
        // Ctrl+wheel is zoom, and is also how a trackpad pinch arrives.
        if (!this.wheelIsPressure || e.ctrlKey) return;
        this.mousePressure = clamp01(this.mousePressure - Math.sign(e.deltaY) * MOUSE_SCROLL_PRESSURE_STEP);
      },
      { passive: true },
    );
  }

  /** @param time Seconds, monotonic. */
  step(time: number): GestureFrame {
    const touching = this.pointerId !== null;
    const raw = touching ? this.readPressure() : 0;

    const frame = this.analyzer.step(
      time,
      touching,
      this.clientX * this.toReference,
      this.clientY * this.toReference,
      this.params.pressureCurve(raw),
    );

    frame.normalizedX = this.clientX / Math.max(1, window.innerWidth);
    frame.normalizedY = this.clientY / Math.max(1, window.innerHeight);
    return frame;
  }

  get isMouse() {
    return this.usingMouse;
  }

  get clientPosition() {
    return { x: this.clientX, y: this.clientY };
  }

  private track(e: PointerEvent) {
    this.clientX = e.clientX;
    this.clientY = e.clientY;
  }

  private readPressure() {
    if (this.usingMouse) {
      this.rawPressureSignal = this.mousePressure;
      return this.mousePressure;
    }

    if (this.params.pressureSource === 'force') {
      this.rawPressureSignal = this.touchForce;
      return clamp01(this.touchForce);
    }

    const radius = this.touchRadius * this.toReference;
    this.rawPressureSignal = radius;

    // Some devices report no radius at all. Mid pressure keeps those strokes audible instead of silent.
    if (radius <= 0) return 0.5;
    return inverseLerp(this.params.radiusAtLightTouch, this.params.radiusAtFirmTouch, radius);
  }
}
