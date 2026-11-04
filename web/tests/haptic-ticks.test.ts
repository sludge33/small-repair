import { describe, expect, it } from 'vitest';
import { HapticTickStream } from '../src/core/haptic-ticks';

const FRAME_TIME = 1 / 120;

function countTicks(stream: HapticTickStream, rate: number, seconds: number) {
  let ticks = 0;
  const frames = Math.floor(seconds / FRAME_TIME);
  for (let i = 0; i < frames; i++) if (stream.step(rate, FRAME_TIME)) ticks++;
  return ticks;
}

describe('HapticTickStream', () => {
  it('fires at the requested rate', () => {
    expect(Math.abs(countTicks(new HapticTickStream(), 45, 1) - 45)).toBeLessThanOrEqual(1);
    expect(Math.abs(countTicks(new HapticTickStream(), 5, 1) - 5)).toBeLessThanOrEqual(1);
  });

  it('fires nothing at a zero rate', () => {
    expect(countTicks(new HapticTickStream(), 0, 1)).toBe(0);
  });

  it('clears the phase on stopping', () => {
    const stream = new HapticTickStream();
    expect(stream.step(45, 0.02)).toBe(false);
    stream.step(0, FRAME_TIME);
    expect(stream.step(45, 0.02)).toBe(false);
  });

  it('fires one tick instead of a burst on a slow frame', () => {
    const stream = new HapticTickStream();
    expect(stream.step(45, 0.5)).toBe(true);
    expect(stream.step(45, 0.001)).toBe(false);
  });
});
