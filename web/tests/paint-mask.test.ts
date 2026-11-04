import { describe, expect, it } from 'vitest';
import { PROFILE_LENGTH_MM, radiusAt } from '../src/core/bowl-surface';
import { DONE_VALUE, PaintMask, rasterizeBands } from '../src/core/paint-mask';

const W = 1024;
const H = 512;
const CRACK = [
  { u: 0.2, v: 0.6 },
  { u: 0.3, v: 0.6 },
];

const empty = () => rasterizeBands(W, H, [], 1);

describe('rasterizeBands', () => {
  it('marks only texels within the band, per crack', () => {
    const second = [
      { u: 0.6, v: 0.6 },
      { u: 0.7, v: 0.6 },
    ];
    const regions = rasterizeBands(W, H, [CRACK, second], 2);
    const row = Math.floor(0.6 * H);
    expect(regions.data[row * W + Math.floor(0.25 * W)]).toBe(1);
    expect(regions.data[row * W + Math.floor(0.65 * W)]).toBe(2);
    expect(regions.data[row * W + Math.floor(0.45 * W)]).toBe(0);
    expect(regions.data[Math.floor(0.7 * H) * W + Math.floor(0.25 * W)]).toBe(0);
    expect(regions.totals[0]).toBeGreaterThan(0);
  });
});

describe('PaintMask', () => {
  it('fills a stamp to the same size in millimetres at the rim and near the base', () => {
    const widthOfStamp = (v: number) => {
      const mask = new PaintMask(W, H, empty());
      mask.stamp({ u: 0.5, v }, 10, 255);
      const row = Math.floor(v * H) * W;
      let count = 0;
      for (let x = 0; x < W; x++) if (mask.data[row + x] >= DONE_VALUE) count++;
      return (count / W) * Math.PI * 2 * radiusAt(v);
    };
    expect(Math.abs(widthOfStamp(0.95) - widthOfStamp(0.4))).toBeLessThan(1.5);
  });

  it('wraps around the seam', () => {
    const mask = new PaintMask(W, H, empty());
    mask.stamp({ u: 0, v: 0.8 }, 6, 255);
    const row = Math.floor(0.8 * H) * W;
    expect(mask.data[row + 2]).toBeGreaterThan(0);
    expect(mask.data[row + W - 3]).toBeGreaterThan(0);
  });

  it('counts coverage per seam and never counts a texel twice', () => {
    const regions = rasterizeBands(W, H, [CRACK], 2);
    const mask = new PaintMask(W, H, regions);
    expect(mask.coverage()[0]).toBe(0);

    for (let i = 0; i < 3; i++) {
      for (let u = 0.19; u <= 0.31; u += 0.002) mask.stamp({ u, v: 0.6 }, 6, 255);
    }
    expect(mask.coverage()[0]).toBeCloseTo(1, 5);
  });

  it('only sticks where the other layer is painted, or on the seam', () => {
    const regions = rasterizeBands(W, H, [CRACK], 1);
    const under = new PaintMask(W, H, regions);
    const over = new PaintMask(W, H, regions);
    const offSeam = { u: 0.25, v: 0.6 + 8 / PROFILE_LENGTH_MM };
    const index = Math.floor(offSeam.v * H) * W + Math.floor(offSeam.u * W);

    over.stamp(offSeam, 3, 255, under);
    expect(over.data[index]).toBe(0);

    under.stamp(offSeam, 3, 255);
    over.stamp(offSeam, 3, 255, under);
    expect(over.data[index]).toBeGreaterThan(0);
  });

  it('flags itself dirty only when something changed, and resets', () => {
    const regions = rasterizeBands(W, H, [CRACK], 1);
    const mask = new PaintMask(W, H, regions, 255);
    const inBand = Math.floor(0.6 * H) * W + Math.floor(0.25 * W);
    expect(mask.data[inBand]).toBe(0);

    mask.dirty = false;
    mask.stamp({ u: 0.9, v: 0.9 }, 3, 255);
    expect(mask.dirty).toBe(false);

    mask.stamp({ u: 0.25, v: 0.6 }, 3, 255);
    expect(mask.dirty).toBe(true);
    expect(mask.data[inBand]).toBe(255);

    mask.reset();
    expect(mask.data[inBand]).toBe(0);
    expect(mask.coverage()[0]).toBe(0);
  });
});
