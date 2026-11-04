import { ShapeUtils, Vector2 } from 'three';
import { surfaceDistanceMm, surfaceNormal, surfacePoint, type Side, type Uv, type Vec3 } from './bowl-surface';

/** Plain vertex data, so geometry can be tested without a renderer. */
export interface MeshData {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
}

const GLAZE: Vec3 = [0.83, 0.82, 0.72];
const BISCUIT: Vec3 = [0.66, 0.55, 0.43];
/** No triangle edge may span more than 1/32 of the way around the bowl. */
const MAX_EDGE_TURNS_INVERSE = 32;

type Triangle = [number, number, number];

/** Splits every edge over the limit at its midpoint. Neighbouring triangles split a shared edge identically, so no gaps open. */
function subdivide(points: Uv[], triangles: Triangle[], maxEdgeMm: number) {
  const midpoints = new Map<number, number>();
  const SCALE = 1 << 20;

  // Near the base centre a long way around is only a short distance, and a triangle spanning too much of the circle flips over.
  const edge = (a: Uv, b: Uv) => Math.max(surfaceDistanceMm(a, b), Math.abs(a.u - b.u) * MAX_EDGE_TURNS_INVERSE * maxEdgeMm);

  const midpoint = (a: number, b: number) => {
    const key = Math.min(a, b) * SCALE + Math.max(a, b);
    let index = midpoints.get(key);
    if (index === undefined) {
      index = points.length;
      points.push({ u: (points[a].u + points[b].u) / 2, v: (points[a].v + points[b].v) / 2 });
      midpoints.set(key, index);
    }
    return index;
  };

  const done: Triangle[] = [];
  const pending = [...triangles];
  while (pending.length > 0) {
    const [a, b, c] = pending.pop()!;
    const ab = edge(points[a], points[b]);
    const bc = edge(points[b], points[c]);
    const ca = edge(points[c], points[a]);
    const longest = Math.max(ab, bc, ca);
    if (longest <= maxEdgeMm) {
      done.push([a, b, c]);
    } else if (longest === ab) {
      const m = midpoint(a, b);
      pending.push([a, m, c], [m, b, c]);
    } else if (longest === bc) {
      const m = midpoint(b, c);
      pending.push([b, m, a], [m, c, a]);
    } else {
      const m = midpoint(c, a);
      pending.push([c, m, b], [m, a, b]);
    }
  }
  return done;
}

function triangulate(outline: Uv[], holes: Uv[][]): { points: Uv[]; triangles: Triangle[] } {
  const faces = ShapeUtils.triangulateShape(
    outline.map((p) => new Vector2(p.u, p.v)),
    holes.map((hole) => hole.map((p) => new Vector2(p.u, p.v))),
  );
  const points = [...outline, ...holes.flat()];

  // Wound counter-clockwise in (u, v), whatever earcut returned, so the two walls can be wound from one rule.
  const triangles = faces.map(([a, b, c]): Triangle => {
    const area = (points[b].u - points[a].u) * (points[c].v - points[a].v) - (points[c].u - points[a].u) * (points[b].v - points[a].v);
    return area >= 0 ? [a, b, c] : [a, c, b];
  });
  return { points, triangles };
}

/** Edges used by one triangle only: the outline of the piece, kept in winding order. */
function boundaryEdges(triangles: Triangle[]) {
  const edges = new Map<string, [number, number]>();
  for (const [a, b, c] of triangles) {
    for (const [from, to] of [[a, b], [b, c], [c, a]] as const) {
      const reverse = `${to}:${from}`;
      if (edges.has(reverse)) edges.delete(reverse);
      else edges.set(`${from}:${to}`, [from, to]);
    }
  }
  return [...edges.values()];
}

/**
 * A piece of the bowl with real wall thickness: the (u, v) outline laid on both faces, joined along its edge.
 * The body's seam at u = 0 and its base centre at v = 0 are not real edges and get no wall. The rim stays
 * glazed; a broken edge is bare biscuit.
 */
export function buildPiece(outline: Uv[], holes: Uv[][], maxEdgeMm: number): MeshData {
  const { points, triangles: coarse } = triangulate(outline, holes);
  const triangles = subdivide(points, coarse, maxEdgeMm);

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const vertex = (position: Vec3, normal: Vec3, uv: Uv, color: Vec3) => {
    positions.push(...position);
    normals.push(...normal);
    uvs.push(uv.u, uv.v);
    colors.push(...color);
    return positions.length / 3 - 1;
  };

  const face = (side: Side) => {
    const base = positions.length / 3;
    for (const p of points) vertex(surfacePoint(p.u, p.v, side), surfaceNormal(p.u, p.v, side), p, GLAZE);
    // Counter-clockwise in (u, v) faces into the bowl, so the outer wall needs the reverse order.
    for (const [a, b, c] of triangles) {
      if (side === 'outer') indices.push(base + a, base + c, base + b);
      else indices.push(base + a, base + b, base + c);
    }
  };
  face('outer');
  face('inner');

  for (const [from, to] of boundaryEdges(triangles)) {
    const a = points[from];
    const b = points[to];
    if ((a.u === 0 && b.u === 0) || (a.u === 1 && b.u === 1) || (a.v === 0 && b.v === 0)) continue;

    const color = a.v === 1 && b.v === 1 ? GLAZE : BISCUIT;
    const a0 = surfacePoint(a.u, a.v, 'outer');
    const b0 = surfacePoint(b.u, b.v, 'outer');
    const a1 = surfacePoint(a.u, a.v, 'inner');
    const b1 = surfacePoint(b.u, b.v, 'inner');
    const normal = wallNormal(a0, b0, a1);

    const i0 = vertex(a0, normal, a, color);
    const i1 = vertex(b0, normal, b, color);
    const i2 = vertex(b1, normal, b, color);
    const i3 = vertex(a1, normal, a, color);
    indices.push(i0, i1, i2, i0, i2, i3);
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    colors: new Float32Array(colors),
    indices: new Uint32Array(indices),
  };
}

function wallNormal(a: Vec3, b: Vec3, c: Vec3): Vec3 {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];
  const x = uy * vz - uz * vy;
  const y = uz * vx - ux * vz;
  const z = ux * vy - uy * vx;
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}
