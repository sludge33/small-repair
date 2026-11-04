import { clamp01 } from './core/math';
import type { GestureFrame } from './core/gesture';
import { defaultModulationParams, type ModulationFrame } from './core/modulation';

const GRAPH_WIDTH = 240;
const GRAPH_HEIGHT = 48;

export interface OverlayStatus {
  sampleRateHz: number;
  rawPressure: number;
  audioState: string;
  outputPeak: number;
  hapticBackend: string;
  ticksFired: number;
  ticksRefused: number;
  materialName: string;
  /** Script time this frame, before the GPU's share. */
  frameMs: number;
  drawsPerSecond: number;
  pixelRatio: number;
}

const signed = (v: number, digits: number) => (v > 0 ? '+' : '') + v.toFixed(digits);

/** A scrolling line graph of 0–1 values. */
class Graph {
  readonly canvas = document.createElement('canvas');
  readonly label = document.createElement('div');

  private readonly c: CanvasRenderingContext2D;
  private readonly values = new Float32Array(GRAPH_WIDTH);
  private head = 0;

  constructor(private readonly color: string) {
    this.canvas.width = GRAPH_WIDTH;
    this.canvas.height = GRAPH_HEIGHT;
    this.c = this.canvas.getContext('2d')!;
  }

  push(value: number) {
    this.values[this.head] = clamp01(value);
    this.head = (this.head + 1) % GRAPH_WIDTH;
  }

  draw() {
    const c = this.c;
    c.clearRect(0, 0, GRAPH_WIDTH, GRAPH_HEIGHT);
    c.strokeStyle = this.color;
    c.beginPath();
    for (let x = 0; x < GRAPH_WIDTH; x++) {
      const value = this.values[(this.head + x) % GRAPH_WIDTH];
      c.lineTo(x, (1 - value) * (GRAPH_HEIGHT - 1) + 0.5);
    }
    c.stroke();
  }
}

/**
 * Live graphs of speed, steadiness and pressure, plus the current audio and haptic parameters.
 * Toggle with a three-finger tap, or F1 on a keyboard.
 */
export class DebugOverlay {
  private readonly speed = new Graph('#5ac8fa');
  private readonly steadiness = new Graph('#82dc82');
  private readonly pressure = new Graph('#fabe5a');
  private readonly lines = document.createElement('pre');
  private shown = false;
  private threeFingersDown = false;

  constructor(private readonly root: HTMLElement) {
    for (const graph of [this.speed, this.steadiness, this.pressure]) root.append(graph.label, graph.canvas);
    root.append(this.lines);

    window.addEventListener('keydown', (e) => {
      if (e.key === 'F1') {
        e.preventDefault();
        this.toggle();
      }
    });
  }

  update(gesture: GestureFrame, modulation: ModulationFrame, status: OverlayStatus, touchCount: number) {
    const threeFingers = touchCount >= 3;
    if (threeFingers && !this.threeFingersDown) this.toggle();
    this.threeFingersDown = threeFingers;

    const maxSpeed = defaultModulationParams.speedLayerThresholds[2];
    this.speed.push(gesture.speed / Math.max(maxSpeed, 1));
    this.steadiness.push(gesture.steadiness);
    this.pressure.push(gesture.pressure);
    if (!this.shown) return;

    this.speed.label.textContent = `speed  ${gesture.speed.toFixed(0)} px/s`;
    this.steadiness.label.textContent = `steadiness  ${gesture.steadiness.toFixed(2)}`;
    this.pressure.label.textContent = `pressure  ${gesture.pressure.toFixed(2)}  (raw ${status.rawPressure.toFixed(1)})`;
    this.speed.draw();
    this.steadiness.draw();
    this.pressure.draw();

    const m = modulation;
    this.lines.textContent = [
      `${gesture.contact}  ${status.sampleRateHz.toFixed(0)} Hz`,
      `frame  ${status.frameMs.toFixed(1)} ms  draws ${status.drawsPerSecond.toFixed(0)}/s  dpr ${status.pixelRatio}`,
      `pos  ${gesture.normalizedX.toFixed(2)}, ${gesture.normalizedY.toFixed(2)}`,
      '— driving placeholder audio and haptics —',
      `layers  S ${m.slowLayer.toFixed(2)}  M ${m.mediumLayer.toFixed(2)}  F ${m.fastLayer.toFixed(2)}`,
      `pitch  ${signed(m.pitchSemitones, 1)} st`,
      `lowpass  ${m.lowpassHz.toFixed(0)} Hz`,
      `gain  ${m.gain.toFixed(2)}`,
      `body  ${m.body.toFixed(2)}`,
      `pan  ${signed(m.pan, 2)}`,
      `audio  ${status.audioState}  peak ${status.outputPeak.toFixed(3)}`,
      `ticks  ${m.hapticTickRate.toFixed(0)}/s  fired ${status.ticksFired}  refused ${status.ticksRefused}  (${status.hapticBackend})`,
      `sharpness  ${m.hapticSharpness.toFixed(2)}  (${status.materialName})`,
    ].join('\n');
  }

  get visible() {
    return this.shown;
  }

  private toggle() {
    this.shown = !this.shown;
    this.root.hidden = !this.shown;
  }
}
