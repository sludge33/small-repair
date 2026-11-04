import { clamp01, lerp } from './math';

/**
 * The bowl as a surface of revolution, in millimetres. A point on it is (u, v): u is 0–1 around the rim and
 * v is 0–1 along the wall by arc length, from the centre of the base to the rim. Masks and shards all live in
 * this one (u, v) space, so a shard keeps its paint wherever it is held.
 */

export type Side = 'outer' | 'inner';
export type Vec3 = [number, number, number];

export interface Uv {
  u: number;
  v: number;
}

const WALL_MM = 3;
const TABLE_SIZE = 512;

// Outer wall profile as one cubic Bézier, (radius, height), from the base centre to the rim.
const P0 = [0, 7];
const P1 = [34, 7];
const P2 = [54, 24];
const P3 = [57.5, 58];

function bezier(t: number, a: number, b: number, c: number, d: number) {
  const s = 1 - t;
  return s * s * s * a + 3 * s * s * t * b + 3 * s * t * t * c + t * t * t * d;
}

function buildTable() {
  const fine = 4096;
  const lengths = new Float64Array(fine + 1);
  let lastR = P0[0];
  let lastY = P0[1];
  for (let i = 1; i <= fine; i++) {
    const t = i / fine;
    const r = bezier(t, P0[0], P1[0], P2[0], P3[0]);
    const y = bezier(t, P0[1], P1[1], P2[1], P3[1]);
    lengths[i] = lengths[i - 1] + Math.hypot(r - lastR, y - lastY);
    lastR = r;
    lastY = y;
  }

  const total = lengths[fine];
  const radii = new Float64Array(TABLE_SIZE + 1);
  const heights = new Float64Array(TABLE_SIZE + 1);
  let cursor = 0;
  for (let i = 0; i <= TABLE_SIZE; i++) {
    const wanted = (i / TABLE_SIZE) * total;
    while (cursor < fine && lengths[cursor + 1] < wanted) cursor++;
    const span = lengths[cursor + 1] - lengths[cursor] || 1;
    const t = (cursor + clamp01((wanted - lengths[cursor]) / span)) / fine;
    radii[i] = bezier(t, P0[0], P1[0], P2[0], P3[0]);
    heights[i] = bezier(t, P0[1], P1[1], P2[1], P3[1]);
  }
  return { total, radii, heights };
}

const TABLE = buildTable();

/** Length of the wall from the base centre to the rim. */
export const PROFILE_LENGTH_MM = TABLE.total;
export const RIM_RADIUS_MM = P3[0];
export const BASE_HEIGHT_MM = P0[1];

/** Radius, height and outward normal of the outer wall at v. */
function profileAt(v: number) {
  const f = clamp01(v) * TABLE_SIZE;
  const i = Math.min(Math.floor(f), TABLE_SIZE - 1);
  const t = f - i;
  const r = lerp(TABLE.radii[i], TABLE.radii[i + 1], t);
  const y = lerp(TABLE.heights[i], TABLE.heights[i + 1], t);
  const dr = TABLE.radii[i + 1] - TABLE.radii[i];
  const dy = TABLE.heights[i + 1] - TABLE.heights[i];
  const length = Math.hypot(dr, dy) || 1;
  return { r, y, nr: dy / length, ny: -dr / length };
}

/** Outer-wall radius at v, which is what sets how many millimetres one unit of u covers. */
export const radiusAt = (v: number) => profileAt(v).r;

export function surfacePoint(u: number, v: number, side: Side): Vec3 {
  const p = profileAt(v);
  const offset = side === 'outer' ? 0 : WALL_MM;
  const r = p.r - offset * p.nr;
  const y = p.y - offset * p.ny;
  const angle = u * Math.PI * 2;
  return [r * Math.cos(angle), y, r * Math.sin(angle)];
}

/** Points out of the solid on both sides, so the inner surface's normal faces into the bowl's hollow. */
export function surfaceNormal(u: number, v: number, side: Side): Vec3 {
  const p = profileAt(v);
  const sign = side === 'outer' ? 1 : -1;
  const angle = u * Math.PI * 2;
  return [sign * p.nr * Math.cos(angle), sign * p.ny, sign * p.nr * Math.sin(angle)];
}

/** Millimetres along the surface between two nearby (u, v) points. Unlike a straight chord, it does not treat u = 0.02 and u = 0.98 as neighbours. */
export function surfaceDistanceMm(a: Uv, b: Uv) {
  const circumference = Math.PI * 2 * Math.max(radiusAt(a.v), radiusAt(b.v));
  return Math.hypot((a.u - b.u) * circumference, (a.v - b.v) * PROFILE_LENGTH_MM);
}
