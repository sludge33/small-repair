import { describe, expect, it } from 'vitest';
import { facingAngles, surfaceNormal } from '../src/core/bowl-surface';
import { touchAction } from '../src/core/bowl-touch';
import { oneShot, type OneShot } from '../src/core/one-shots';
import { scrapeLayers } from '../src/core/scrape-layers';
import { twoFingerDelta } from '../src/core/two-finger';

const SAMPLE_RATE = 48000;

function brightness(samples: Float32Array) {
  let change = 0;
  let level = 0;
  for (let i = 1; i < samples.length; i++) {
    change += (samples[i] - samples[i - 1]) ** 2;
    level += samples[i] ** 2;
  }
  return Math.sqrt(change / level);
}

describe('touchAction', () => {
  it('strokes on the bowl and orbits off it during the painting steps', () => {
    for (const step of ['clean', 'lacquer', 'gold', 'polish'] as const) {
      expect(touchAction(step, true, false)).toBe('stroke');
      expect(touchAction(step, false, false)).toBe('orbit');
    }
  });

  it('picks up a shard during alignment and otherwise turns the bowl, even on the bowl itself', () => {
    expect(touchAction('align', true, true)).toBe('hold');
    expect(touchAction('align', true, false)).toBe('orbit');
    expect(touchAction('align', false, false)).toBe('orbit');
  });

  it('closes the lid on any touch during cure and only turns the finished bowl', () => {
    expect(touchAction('cure', false, false)).toBe('lid');
    expect(touchAction('done', true, false)).toBe('orbit');
  });
});

describe('facingAngles', () => {
  it('turns the outer wall to look straight along +Z', () => {
    for (const [u, v] of [
      [0.16, 0.9],
      [0.5, 0.8],
      [0.83, 0.58],
    ]) {
      const { yaw, pitch } = facingAngles(u, v);
      const [nx, ny, nz] = surfaceNormal(u, v, 'outer');
      // The pivot's Euler XYZ: Y first, then X.
      const x = nx * Math.cos(yaw) + nz * Math.sin(yaw);
      const z = -nx * Math.sin(yaw) + nz * Math.cos(yaw);
      const y2 = ny * Math.cos(pitch) - z * Math.sin(pitch);
      const z2 = ny * Math.sin(pitch) + z * Math.cos(pitch);
      expect(x).toBeCloseTo(0, 5);
      expect(y2).toBeCloseTo(0, 5);
      expect(z2).toBeCloseTo(1, 5);
    }
  });
});

describe('twoFingerDelta', () => {
  const a = { x: 0, y: 0 };
  const b = { x: 100, y: 0 };

  it('reads a slide of both fingers as a pan only', () => {
    const delta = twoFingerDelta(a, b, { x: 10, y: 20 }, { x: 110, y: 20 });
    expect(delta).toEqual({ panX: 10, panY: 20, scale: 1, twist: 0 });
  });

  it('reads a spread as a scale', () => {
    expect(twoFingerDelta(a, b, { x: -50, y: 0 }, { x: 150, y: 0 }).scale).toBeCloseTo(2);
  });

  it('reads a clockwise turn on screen as a positive twist', () => {
    expect(twoFingerDelta(a, b, a, { x: 0, y: 100 }).twist).toBeCloseTo(Math.PI / 2);
  });

  it('takes the short way across the angle wrap', () => {
    const twist = twoFingerDelta(a, { x: -100, y: 1 }, a, { x: -100, y: -1 }).twist;
    expect(Math.abs(twist)).toBeLessThan(0.05);
  });

  it('does not divide by zero when the fingers coincide', () => {
    expect(twoFingerDelta(a, a, a, b).scale).toBe(1);
  });
});

describe('one-shots', () => {
  it.each<OneShot>(['seat', 'lid', 'puff'])('%s stays in range, repeats exactly and ends near silence', (name) => {
    const samples = oneShot(name, SAMPLE_RATE);
    expect(oneShot(name, SAMPLE_RATE)).toEqual(samples);
    expect(Math.max(...samples.map(Math.abs))).toBeLessThanOrEqual(1);
    expect(Math.abs(samples[samples.length - 1])).toBeLessThan(0.05);
  });
});

describe('tool voices', () => {
  it('makes the blade brighter than the cloth', () => {
    expect(brightness(scrapeLayers(SAMPLE_RATE, 'blade').medium)).toBeGreaterThan(brightness(scrapeLayers(SAMPLE_RATE, 'cloth').medium) * 2);
  });
});
