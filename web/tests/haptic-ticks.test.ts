import { describe, expect, it } from 'vitest';
import { HapticPlayer, HapticTickStream, tickMs } from '../src/core/haptic-ticks';
import { TOOL_MATERIALS, type ModulationFrame } from '../src/core/modulation';

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

describe('tickMs', () => {
  it('buzzes soft materials longer than sharp ones', () => {
    expect(tickMs(0.1, 0.5)).toBeGreaterThan(tickMs(0.9, 0.5));
  });

  it('buzzes a firm stroke longer than a light one', () => {
    expect(tickMs(0.5, 1)).toBeGreaterThan(tickMs(0.5, 0));
  });

  it('gives whole milliseconds that fit between the ticks of every material', () => {
    for (const material of Object.values(TOOL_MATERIALS)) {
      const longest = tickMs(material.hapticSharpness, 1);
      expect(Number.isInteger(longest)).toBe(true);
      expect(longest).toBeLessThan(1000 / material.hapticTickRate);
    }
  });
});

describe('HapticPlayer', () => {
  const frame = (hapticTickRate: number) => ({ hapticTickRate, hapticSharpness: 0.9, body: 0.5 }) as ModulationFrame;

  function player(allowed = true) {
    const sent: (number | number[])[] = [];
    const haptics = new HapticPlayer((pattern) => {
      sent.push(pattern);
      return allowed;
    });
    return { haptics, sent };
  }

  it('sends a tick when one is due', () => {
    const { haptics, sent } = player();
    haptics.step(frame(100), 0.02);
    expect(sent).toEqual([tickMs(0.9, 0.5)]);
    expect(haptics.ticksFired).toBe(1);
  });

  it('holds ticks back until a pattern has finished', () => {
    const { haptics, sent } = player();
    haptics.pulse([12, 30, 22]);
    haptics.step(frame(100), 0.02);
    haptics.step(frame(100), 0.02);
    expect(sent).toEqual([[12, 30, 22]]);

    haptics.step(frame(100), 0.03);
    expect(sent).toHaveLength(2);
  });

  it('ticks softly as a held shard nears its seat, and not at all away from it', () => {
    const { haptics, sent } = player();
    haptics.step(frame(0), 0.5);
    expect(sent).toHaveLength(0);

    haptics.fitPull = 1;
    haptics.step(frame(0), 0.5);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toBeGreaterThan(tickMs(0.9, 0.5));
  });

  it('counts what the device refuses', () => {
    const { haptics } = player(false);
    haptics.pulse([10]);
    expect(haptics.refused).toBe(1);
  });
});
