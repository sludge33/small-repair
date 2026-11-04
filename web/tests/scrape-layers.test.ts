import { describe, expect, it } from 'vitest';
import { BODY_LEVEL, OUTPUT_LEVEL, scrapeLayers } from '../src/core/scrape-layers';

const SAMPLE_RATE = 48000;
const layers = scrapeLayers(SAMPLE_RATE);

function rms(samples: Float32Array) {
  let sum = 0;
  for (const v of samples) sum += v * v;
  return Math.sqrt(sum / samples.length);
}

/** Largest jump between neighbouring samples anywhere inside the loop. */
function largestStep(samples: Float32Array) {
  let largest = 0;
  for (let i = 1; i < samples.length; i++) largest = Math.max(largest, Math.abs(samples[i] - samples[i - 1]));
  return largest;
}

/** RMS of the sample-to-sample difference, relative to level, so a louder sound does not count as a brighter one. */
function brightness(samples: Float32Array) {
  let sum = 0;
  for (let i = 1; i < samples.length; i++) sum += (samples[i] - samples[i - 1]) ** 2;
  return Math.sqrt(sum / samples.length) / rms(samples);
}

describe('scrapeLayers', () => {
  it('makes the same layers every time, so a sound bug reproduces', () => {
    expect(scrapeLayers(SAMPLE_RATE).medium).toEqual(layers.medium);
  });

  it('keeps the speed layers equally loud', () => {
    const levels = [rms(layers.slow), rms(layers.medium), rms(layers.fast)];
    expect(Math.max(...levels) / Math.min(...levels)).toBeLessThan(1.1);
  });

  it('makes the fast layer brighter than the slow layer', () => {
    expect(brightness(layers.fast)).toBeGreaterThan(brightness(layers.slow) * 1.2);
  });

  it('makes the body layer far darker than any texture', () => {
    expect(brightness(layers.body)).toBeLessThan(brightness(layers.slow) / 3);
  });

  it('loops without a click', () => {
    for (const samples of [layers.slow, layers.medium, layers.fast, layers.body]) {
      const seam = Math.abs(samples[0] - samples[samples.length - 1]);
      expect(seam).toBeLessThanOrEqual(largestStep(samples));
    }
  });

  it('does not clip with a full layer and full body at full gain', () => {
    let peak = 0;
    for (let i = 0; i < layers.medium.length; i++) {
      peak = Math.max(peak, Math.abs((layers.medium[i] + layers.body[i] * BODY_LEVEL) * OUTPUT_LEVEL));
    }
    expect(peak).toBeLessThan(1);
  });
});
