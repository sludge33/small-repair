/**
 * Synthesised stand-ins for the single-hit foley, so each moment can be heard before recordings exist.
 * Delete this when decoded recordings take their place.
 */

export type OneShot = 'seat' | 'lid' | 'puff';

function noiseSource(seed: number) {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x / 2147483648 - 1;
  };
}

/** Ceramic on ceramic: a short bright tick over a fast-dying ring. */
function seat(sampleRate: number) {
  const out = new Float32Array(Math.round(sampleRate * 0.12));
  const noise = noiseSource(0x2b1d);
  for (let i = 0; i < out.length; i++) {
    const t = i / sampleRate;
    const tick = noise() * Math.exp(-t * 900);
    const ring = Math.sin(2 * Math.PI * 2300 * t) * Math.exp(-t * 70) + Math.sin(2 * Math.PI * 3700 * t) * Math.exp(-t * 110) * 0.5;
    out[i] = 0.55 * tick + 0.35 * ring;
  }
  return out;
}

/** Wood settling on wood: a low knock with a little noise on the front. */
function lid(sampleRate: number) {
  const out = new Float32Array(Math.round(sampleRate * 0.35));
  const noise = noiseSource(0x71c9);
  for (let i = 0; i < out.length; i++) {
    const t = i / sampleRate;
    const knock = Math.sin(2 * Math.PI * (70 + 60 * Math.exp(-t * 40)) * t) * Math.exp(-t * 16);
    out[i] = 0.75 * knock + 0.2 * noise() * Math.exp(-t * 180);
  }
  return out;
}

/** A soft breath of powder: low-passed noise that swells and fades. */
function puff(sampleRate: number) {
  const out = new Float32Array(Math.round(sampleRate * 0.22));
  const noise = noiseSource(0x4e07);
  const coefficient = 1 - Math.exp((-2 * Math.PI * 2200) / sampleRate);
  let state = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / out.length;
    state += (noise() - state) * coefficient;
    out[i] = state * Math.sin(Math.PI * Math.sqrt(t)) ** 2;
  }
  return out;
}

export function oneShot(name: OneShot, sampleRate: number) {
  if (name === 'seat') return seat(sampleRate);
  if (name === 'lid') return lid(sampleRate);
  return puff(sampleRate);
}
