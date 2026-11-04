import type { StrokeTool } from './bowl-repair';

/**
 * Filtered-noise stand-ins for each tool's foley, so the modulation can be heard before recordings exist.
 * Delete this when decoded recordings fill the same four layers.
 */

const LOOP_SECONDS = 4;

/** Low-pass cutoffs of the slow, medium, fast and body layers, in Hz. Harder contact is brighter. */
const TOOL_CUTOFFS_HZ: Record<StrokeTool, [number, number, number, number]> = {
  blade: [3000, 6000, 12000, 160],
  brush: [700, 1300, 2400, 90],
  duster: [1500, 3000, 6000, 70],
  cloth: [450, 900, 1800, 120],
};

/** Level of the body layer against the texture layers. */
export const BODY_LEVEL = 0.5;
export const OUTPUT_LEVEL = 0.25;

export interface FoleyLayers {
  slow: Float32Array;
  medium: Float32Array;
  fast: Float32Array;
  body: Float32Array;
}

/** All layers filter the same noise, as one take would, so crossfading between them stays coherent. */
function noise(frames: number) {
  const out = new Float32Array(frames);
  let x = 0x9e3779b9;
  for (let i = 0; i < frames; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    out[i] = x / 2147483648 - 1;
  }
  return out;
}

/**
 * One-pole low-pass run twice around the loop, keeping the second pass, so the filter state at the end
 * matches the start and the loop point does not click.
 */
function filteredLoop(source: Float32Array, sampleRate: number, cutoffHz: number) {
  const coefficient = 1 - Math.exp((-2 * Math.PI * Math.min(cutoffHz, sampleRate * 0.45)) / sampleRate);
  // A one-pole filter loses noise power as its cutoff falls; this keeps the layers equally loud.
  const makeup = Math.sqrt((2 - coefficient) / coefficient);
  const out = new Float32Array(source.length);
  let state = 0;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < source.length; i++) {
      state += (source[i] - state) * coefficient;
      out[i] = state * makeup;
    }
  }
  return out;
}

export function scrapeLayers(sampleRate: number, tool: StrokeTool = 'blade'): FoleyLayers {
  const source = noise(Math.round(sampleRate * LOOP_SECONDS));
  const [slow, medium, fast, body] = TOOL_CUTOFFS_HZ[tool];
  return {
    slow: filteredLoop(source, sampleRate, slow),
    medium: filteredLoop(source, sampleRate, medium),
    fast: filteredLoop(source, sampleRate, fast),
    body: filteredLoop(source, sampleRate, body),
  };
}
