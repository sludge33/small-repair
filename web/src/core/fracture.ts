import { PROFILE_LENGTH_MM, radiusAt, type Uv } from './bowl-surface';
import { clamp01 } from './math';

/**
 * Where the bowl broke. The shards and the bowl body are cut along exactly the same crack lines, so they fit.
 * Cracks are drawn by hand as a few control points and roughened from a fixed seed, so the break is the same
 * on every run.
 */

export interface Shard {
  /** The loop around the piece. Pieces that reach the rim close along it. */
  polygon: Uv[];
  /** The broken edge. Excludes the stretch along the rim, which never broke. */
  crack: Uv[];
  /** The middle of the piece, used to pick up, frame and seat it. */
  center: Uv;
}

const ROUGHEN_LEVELS = 3;
/** Sideways offset of each midpoint as a share of its segment; halves at each level. */
const ROUGHNESS = 0.16;
/** Keeps roughened cracks from touching the rim anywhere but at their two ends. */
const MAX_INTERIOR_V = 0.985;

function rng(seed: number) {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x / 4294967296;
  };
}

function roughen(points: Uv[], closed: boolean, seed: number) {
  const random = rng(seed);
  let line = closed ? [...points, points[0]] : points;
  let amount = ROUGHNESS;
  for (let level = 0; level < ROUGHEN_LEVELS; level++) {
    const next: Uv[] = [line[0]];
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1];
      const b = line[i];
      const midV = (a.v + b.v) / 2;
      const perU = Math.PI * 2 * radiusAt(midV);
      const dx = (b.u - a.u) * perU;
      const dy = (b.v - a.v) * PROFILE_LENGTH_MM;
      const offset = (random() * 2 - 1) * amount;
      next.push({
        u: (a.u + b.u) / 2 - (dy * offset) / perU,
        v: Math.min(MAX_INTERIOR_V, midV + (dx * offset) / PROFILE_LENGTH_MM),
      });
      next.push(b);
    }
    line = next;
    amount /= 2;
  }
  return closed ? line.slice(0, -1) : line;
}

function center(polygon: Uv[]): Uv {
  let u = 0;
  let v = 0;
  for (const p of polygon) {
    u += p.u;
    v += p.v;
  }
  return { u: u / polygon.length, v: v / polygon.length };
}

function rimShard(controls: Uv[], seed: number): Shard {
  const crack = roughen(controls, false, seed);
  return { polygon: crack, crack, center: center(crack) };
}

function innerShard(controls: Uv[], seed: number): Shard {
  const polygon = roughen(controls, true, seed);
  return { polygon, crack: [...polygon, polygon[0]], center: center(polygon) };
}

export const SHARDS: Shard[] = [
  rimShard(
    [
      { u: 0.11, v: 1 },
      { u: 0.125, v: 0.84 },
      { u: 0.165, v: 0.75 },
      { u: 0.205, v: 0.81 },
      { u: 0.215, v: 1 },
    ],
    0x51ab,
  ),
  rimShard(
    [
      { u: 0.44, v: 1 },
      { u: 0.425, v: 0.8 },
      { u: 0.47, v: 0.66 },
      { u: 0.53, v: 0.68 },
      { u: 0.565, v: 0.82 },
      { u: 0.555, v: 1 },
    ],
    0x77c2,
  ),
  innerShard(
    [
      { u: 0.78, v: 0.64 },
      { u: 0.825, v: 0.74 },
      { u: 0.885, v: 0.68 },
      { u: 0.88, v: 0.52 },
      { u: 0.81, v: 0.48 },
    ],
    0x1d3f,
  ),
];

/** The body's outline: the whole (u, v) rectangle, stepping around the pieces that reach the rim. */
export function bodyOutline(shards: Shard[] = SHARDS): Uv[] {
  const rimPieces = shards.filter((s) => s.crack.length === s.polygon.length).sort((a, b) => b.crack[0].u - a.crack[0].u);
  const outline: Uv[] = [
    { u: 0, v: 0 },
    { u: 1, v: 0 },
    { u: 1, v: 1 },
  ];
  for (const piece of rimPieces) outline.push(...[...piece.crack].reverse());
  outline.push({ u: 0, v: 1 });
  return outline;
}

/** The pieces that sit inside the wall, which cut holes rather than notches. */
export const bodyHoles = (shards: Shard[] = SHARDS) =>
  shards.filter((s) => s.crack.length !== s.polygon.length).map((s) => s.polygon);

export interface CrackPoint extends Uv {
  distanceMm: number;
}

/** The closest point on any crack, measured in millimetres along the surface. */
export function nearestCrackPoint(p: Uv, shards: Shard[] = SHARDS): CrackPoint {
  const perU = Math.PI * 2 * radiusAt(p.v);
  let best: CrackPoint = { u: p.u, v: p.v, distanceMm: Infinity };

  for (const shard of shards) {
    const line = shard.crack;
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1];
      const b = line[i];
      const ax = (a.u - p.u) * perU;
      const ay = (a.v - p.v) * PROFILE_LENGTH_MM;
      const dx = (b.u - a.u) * perU;
      const dy = (b.v - a.v) * PROFILE_LENGTH_MM;
      const lengthSquared = dx * dx + dy * dy;
      const t = lengthSquared > 0 ? clamp01(-(ax * dx + ay * dy) / lengthSquared) : 0;
      const distanceMm = Math.hypot(ax + dx * t, ay + dy * t);
      if (distanceMm < best.distanceMm) {
        best = { u: a.u + (b.u - a.u) * t, v: a.v + (b.v - a.v) * t, distanceMm };
      }
    }
  }
  return best;
}
