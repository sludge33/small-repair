import { PROFILE_LENGTH_MM, radiusAt, type Uv } from './bowl-surface';
import { clamp01 } from './math';

/** A texel at or past this counts as done, and as visibly painted. */
export const DONE_VALUE = 128;

/** Which seam each texel belongs to: 0 is none, 1 onwards is a seam. Coverage is counted per seam. */
export interface Regions {
  data: Uint8Array;
  totals: number[];
}

/** Marks every texel within a distance of a crack as belonging to that crack's seam. */
export function rasterizeBands(width: number, height: number, cracks: Uv[][], halfWidthMm: number): Regions {
  const data = new Uint8Array(width * height);
  const totals = cracks.map(() => 0);
  const texelV = PROFILE_LENGTH_MM / height;

  cracks.forEach((line, c) => {
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1];
      const b = line[i];
      const rowFrom = Math.max(0, Math.floor((Math.min(a.v, b.v) * PROFILE_LENGTH_MM - halfWidthMm) / texelV));
      const rowTo = Math.min(height - 1, Math.ceil((Math.max(a.v, b.v) * PROFILE_LENGTH_MM + halfWidthMm) / texelV));

      for (let y = rowFrom; y <= rowTo; y++) {
        const v = (y + 0.5) / height;
        const perU = Math.PI * 2 * Math.max(radiusAt(v), 1);
        const reach = halfWidthMm / perU;
        const colFrom = Math.floor((Math.min(a.u, b.u) - reach) * width);
        const colTo = Math.ceil((Math.max(a.u, b.u) + reach) * width);

        for (let x = colFrom; x <= colTo; x++) {
          const u = (x + 0.5) / width;
          const ax = (a.u - u) * perU;
          const ay = (a.v - v) * PROFILE_LENGTH_MM;
          const dx = (b.u - a.u) * perU;
          const dy = (b.v - a.v) * PROFILE_LENGTH_MM;
          const lengthSquared = dx * dx + dy * dy;
          const t = lengthSquared > 0 ? clamp01(-(ax * dx + ay * dy) / lengthSquared) : 0;
          if (Math.hypot(ax + dx * t, ay + dy * t) > halfWidthMm) continue;

          const index = y * width + (((x % width) + width) % width);
          if (data[index] === 0) {
            data[index] = c + 1;
            totals[c]++;
          }
        }
      }
    }
  });
  return { data, totals };
}

/**
 * One paint layer over the bowl's (u, v) space. Values only rise. Stamps are measured in millimetres, so a brush
 * keeps its size however much the texture stretches between the rim and the base.
 *
 * This is on the CPU rather than the render-texture plan: reading coverage back from the GPU stalls a phone,
 * while a stamp here touches a few hundred bytes and keeps an exact running count.
 */
export class PaintMask {
  readonly data: Uint8Array;
  /** Set by every change; whoever uploads the texture clears it. */
  dirty = true;

  private readonly done: number[];

  /** @param initial Value outside the regions. Inside them, every texel starts at 0. */
  constructor(
    readonly width: number,
    readonly height: number,
    private readonly regions: Regions,
    private readonly initial = 0,
  ) {
    this.data = new Uint8Array(width * height);
    this.done = regions.totals.map(() => 0);
    this.reset();
  }

  reset() {
    this.data.fill(this.initial);
    for (let i = 0; i < this.data.length; i++) {
      if (this.regions.data[i] !== 0) this.data[i] = 0;
    }
    this.done.fill(0);
    this.dirty = true;
  }

  /**
   * Adds paint, full strength in the middle and fading to nothing at the radius.
   * @param amount Value added at full strength.
   * @param where When given, paint only sticks to texels already painted there, and to the seams themselves.
   */
  stamp(center: Uv, radiusMm: number, amount: number, where?: PaintMask) {
    const { width, height, data } = this;
    const regions = this.regions.data;
    const texelV = PROFILE_LENGTH_MM / height;
    const reachV = Math.ceil(radiusMm / texelV);
    const centerRow = center.v * height - 0.5;

    const rowFrom = Math.max(0, Math.floor(centerRow - reachV));
    const rowTo = Math.min(height - 1, Math.ceil(centerRow + reachV));

    for (let y = rowFrom; y <= rowTo; y++) {
      const v = (y + 0.5) / height;
      const dy = (v - center.v) * PROFILE_LENGTH_MM;
      const perU = Math.PI * 2 * Math.max(radiusAt(v), 1);
      const texelU = perU / width;
      const reachU = Math.min(width / 2, Math.ceil(radiusMm / texelU));
      const centerCol = center.u * width - 0.5;

      for (let x = Math.floor(centerCol - reachU); x <= Math.ceil(centerCol + reachU); x++) {
        const distance = Math.hypot((x - centerCol) * texelU, dy) / radiusMm;
        if (distance >= 1) continue;

        const index = y * width + (((x % width) + width) % width);
        const region = regions[index];
        if (where && region === 0 && where.data[index] < DONE_VALUE) continue;

        const fade = distance < 0.6 ? 1 : 1 - ((distance - 0.6) / 0.4) ** 2;
        const before = data[index];
        const after = Math.min(255, before + Math.round(amount * fade));
        if (after === before) continue;

        data[index] = after;
        if (region !== 0 && before < DONE_VALUE && after >= DONE_VALUE) this.done[region - 1]++;
        this.dirty = true;
      }
    }
  }

  /** Share of each seam that is done, 0–1. */
  coverage() {
    return this.done.map((count, i) => (this.regions.totals[i] > 0 ? count / this.regions.totals[i] : 1));
  }
}
