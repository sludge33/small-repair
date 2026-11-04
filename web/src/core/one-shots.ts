/**
 * Synthesised stand-ins for the single-hit foley, so each moment can be heard before recordings exist.
 * Delete this when decoded recordings take their place.
 */

export type OneShot = 'seat' | 'lid' | 'puff' | 'flap' | 'box' | 'crease' | 'tear' | 'unfold';

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

/** Card landing on card: a dull thud with a papery front. */
function flap(sampleRate: number) {
  const out = new Float32Array(Math.round(sampleRate * 0.16));
  const noise = noiseSource(0x3a91);
  for (let i = 0; i < out.length; i++) {
    const t = i / sampleRate;
    const thud = Math.sin(2 * Math.PI * (120 + 90 * Math.exp(-t * 60)) * t) * Math.exp(-t * 34);
    out[i] = 0.6 * thud + 0.25 * noise() * Math.exp(-t * 220);
  }
  return out;
}

/** The whole box shutting: the flap's thud, lower and longer, with a hollow ring. */
function box(sampleRate: number) {
  const out = new Float32Array(Math.round(sampleRate * 0.3));
  const noise = noiseSource(0x6d13);
  for (let i = 0; i < out.length; i++) {
    const t = i / sampleRate;
    const thud = Math.sin(2 * Math.PI * (82 + 70 * Math.exp(-t * 45)) * t) * Math.exp(-t * 20);
    const hollow = Math.sin(2 * Math.PI * 310 * t) * Math.exp(-t * 42);
    out[i] = 0.7 * thud + 0.14 * hollow + 0.2 * noise() * Math.exp(-t * 200);
  }
  return out;
}

/** A fold pressed flat: one short, soft crackle. */
function crease(sampleRate: number) {
  const out = new Float32Array(Math.round(sampleRate * 0.09));
  const noise = noiseSource(0x19f4);
  const coefficient = 1 - Math.exp((-2 * Math.PI * 3800) / sampleRate);
  let state = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / sampleRate;
    state += (noise() - state) * coefficient;
    out[i] = 0.7 * state * Math.exp(-t * 70);
  }
  return out;
}

/** Paper ripping: bright noise, roughened by a stutter. */
function tear(sampleRate: number) {
  const out = new Float32Array(Math.round(sampleRate * 0.34));
  const noise = noiseSource(0x58c7);
  for (let i = 0; i < out.length; i++) {
    const seconds = i / sampleRate;
    const t = i / out.length;
    const stutter = 0.55 + 0.45 * Math.sin(2 * Math.PI * 60 * seconds);
    out[i] = 0.5 * noise() * stutter * Math.sin(Math.PI * Math.sqrt(t)) ** 2;
  }
  return out;
}

/** A letter opening out: three quiet crackles, each softer than the last. */
function unfold(sampleRate: number) {
  const out = new Float32Array(Math.round(sampleRate * 0.42));
  const noise = noiseSource(0x2fa8);
  const crackles = [
    [0, 0.5],
    [0.11, 0.36],
    [0.25, 0.24],
  ];
  for (let i = 0; i < out.length; i++) {
    const t = i / sampleRate;
    let envelope = 0;
    for (const [at, level] of crackles) if (t >= at) envelope += level * Math.exp(-(t - at) * 48);
    out[i] = noise() * envelope;
  }
  return out;
}

const SYNTHS: Record<OneShot, (sampleRate: number) => Float32Array> = { seat, lid, puff, flap, box, crease, tear, unfold };

export function oneShot(name: OneShot, sampleRate: number) {
  return SYNTHS[name](sampleRate);
}
