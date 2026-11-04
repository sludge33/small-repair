import { describe, expect, it } from 'vitest';
import { GestureAnalyzer, type GestureFrame } from '../src/core/gesture';

const FRAME_TIME = 1 / 60;
type Point = [number, number];

// Deterministic noise, so a failure reproduces exactly.
const noise = (frame: number, amplitude: number) => ((Math.sin(frame * 12.9898) * 43758.5453) % 1) * amplitude;

function run(analyzer: GestureAnalyzer, seconds: number, path: (i: number) => Point, pressure = 0.5) {
  let frame!: GestureFrame;
  const frames = Math.round(seconds / FRAME_TIME);
  for (let i = 0; i < frames; i++) {
    const [x, y] = path(i);
    frame = analyzer.step(i * FRAME_TIME, true, x, y, pressure);
  }
  return frame;
}

const line = (frame: number, pixelsPerSecond: number): Point => [frame * FRAME_TIME * pixelsPerSecond, 0];

function circle(frame: number, radius: number, pixelsPerSecond: number): Point {
  const angle = (frame * FRAME_TIME * pixelsPerSecond) / radius;
  return [Math.cos(angle) * radius, Math.sin(angle) * radius];
}

const near = (actual: number, expected: number, tolerance: number) =>
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);

describe('GestureAnalyzer', () => {
  it('reports the speed and full steadiness of a steady line', () => {
    const frame = run(new GestureAnalyzer(), 1, (i) => line(i, 600));
    near(frame.speed, 600, 10);
    near(frame.steadiness, 1, 0.02);
    expect(frame.contact).toBe('held');
  });

  it('does not score a steady circle as jitter', () => {
    const frame = run(new GestureAnalyzer(), 1, (i) => circle(i, 120, 600));
    expect(frame.steadiness).toBeGreaterThan(0.9);
  });

  it('does not score accelerating from rest as jitter', () => {
    const analyzer = new GestureAnalyzer();
    const rampSeconds = 0.25;
    const topSpeed = 900;
    const smoothStep = (t: number) => {
      const c = Math.min(1, Math.max(0, t));
      return c * c * (3 - 2 * c);
    };
    let x = 0;
    let lowest = 1;
    for (let i = 0; i < 60; i++) {
      const time = i * FRAME_TIME;
      x += topSpeed * smoothStep(time / rampSeconds) * FRAME_TIME;
      lowest = Math.min(lowest, analyzer.step(time, true, x, 0, 0.5).steadiness);
    }
    expect(lowest).toBeGreaterThan(0.7);
  });

  it('lowers steadiness for a speed wobble', () => {
    let x = 0;
    const frame = run(new GestureAnalyzer(), 1, (i) => {
      x += (i % 4 < 2 ? 200 : 1200) * FRAME_TIME;
      return [x, 0];
    });
    expect(frame.steadiness).toBeLessThan(0.4);
  });

  it('lowers steadiness for a direction wobble', () => {
    const frame = run(new GestureAnalyzer(), 1, (i) => [line(i, 600)[0], noise(i, 14)]);
    expect(frame.steadiness).toBeLessThan(0.4);
  });

  it('keeps a steady stroke steady through touch noise', () => {
    const frame = run(new GestureAnalyzer(), 1, (i) => [line(i, 400)[0], noise(i, 0.2)]);
    expect(frame.steadiness).toBeGreaterThan(0.75);
  });

  it('copes with a digitizer slower than the frame rate', () => {
    const frame = run(new GestureAnalyzer(), 1, (i) => line(i - (i % 2), 600));
    near(frame.speed, 600, 60);
    expect(frame.steadiness).toBeGreaterThan(0.9);
  });

  it('falls to zero speed for a finger at rest and keeps its steadiness', () => {
    const analyzer = new GestureAnalyzer();
    run(analyzer, 0.5, (i) => line(i, 600));

    const [restX, restY] = line(29, 600);
    let frame!: GestureFrame;
    for (let i = 30; i < 90; i++) frame = analyzer.step(i * FRAME_TIME, true, restX, restY, 0.5);

    near(frame.speed, 0, 1);
    expect(frame.steadiness).toBeGreaterThan(0.9);
  });

  it('runs contact states began, held, ended, none', () => {
    const analyzer = new GestureAnalyzer();
    expect(analyzer.step(0, true, 0, 0, 0.5).contact).toBe('began');
    expect(analyzer.step(FRAME_TIME, true, 1, 0, 0.5).contact).toBe('held');
    expect(analyzer.step(FRAME_TIME * 2, false, 0, 0, 0).contact).toBe('ended');
    expect(analyzer.step(FRAME_TIME * 3, false, 0, 0, 0).contact).toBe('none');
  });

  it('does not let a new stroke inherit the previous one', () => {
    const analyzer = new GestureAnalyzer();
    run(analyzer, 0.5, (i) => line(i, 2000));
    analyzer.step(0.6, false, 0, 0, 0);

    const frame = analyzer.step(0.7, true, 5000, 5000, 0.2);

    expect(frame.contact).toBe('began');
    expect(frame.speed).toBe(0);
    expect(frame.steadiness).toBe(1);
    near(frame.pressure, 0.2, 0.001);
  });

  it('smooths pressure toward the input', () => {
    const analyzer = new GestureAnalyzer();
    analyzer.step(0, true, 0, 0, 0);

    const first = analyzer.step(FRAME_TIME, true, 0, 0, 1);
    const settled = run(analyzer, 0.5, () => [0, 0], 1);

    expect(first.pressure).toBeGreaterThan(0);
    expect(first.pressure).toBeLessThan(1);
    near(settled.pressure, 1, 0.02);
  });
});
