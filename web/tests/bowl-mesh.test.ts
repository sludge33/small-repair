import { describe, expect, it } from 'vitest';
import { buildPiece, type MeshData } from '../src/core/bowl-mesh';
import { PROFILE_LENGTH_MM, RIM_RADIUS_MM, surfaceDistanceMm, surfaceNormal, surfacePoint } from '../src/core/bowl-surface';
import { bodyHoles, bodyOutline, nearestCrackPoint, SHARDS } from '../src/core/fracture';

const MAX_EDGE = 6;

function triangleNormal(mesh: MeshData, t: number) {
  const [a, b, c] = [mesh.indices[t], mesh.indices[t + 1], mesh.indices[t + 2]];
  const p = (i: number) => [mesh.positions[i * 3], mesh.positions[i * 3 + 1], mesh.positions[i * 3 + 2]];
  const [pa, pb, pc] = [p(a), p(b), p(c)];
  const u = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
  const v = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
  return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
}

/** Every edge shared by exactly two triangles means no holes or T-junctions, which would show as light leaks. */
function openEdgeCount(mesh: MeshData) {
  const key = (i: number) => `${mesh.positions[i * 3].toFixed(3)},${mesh.positions[i * 3 + 1].toFixed(3)},${mesh.positions[i * 3 + 2].toFixed(3)}`;
  const edges = new Map<string, number>();
  for (let t = 0; t < mesh.indices.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = key(mesh.indices[t + e]);
      const b = key(mesh.indices[t + (e + 1) % 3]);
      if (a === b) continue;
      const pair = a < b ? `${a}|${b}` : `${b}|${a}`;
      edges.set(pair, (edges.get(pair) ?? 0) + 1);
    }
  }
  return [...edges.values()].filter((count) => count !== 2).length;
}

function segmentsCross(a: { u: number; v: number }, b: { u: number; v: number }, c: { u: number; v: number }, d: { u: number; v: number }) {
  const side = (p: typeof a, q: typeof a, r: typeof a) => (q.u - p.u) * (r.v - p.v) - (q.v - p.v) * (r.u - p.u);
  return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
}

describe('bowl surface', () => {
  it('runs from the base centre to the rim', () => {
    const base = surfacePoint(0.3, 0, 'outer');
    expect(Math.hypot(base[0], base[2])).toBeCloseTo(0, 6);
    const rim = surfacePoint(0, 1, 'outer');
    expect(rim[0]).toBeCloseTo(RIM_RADIUS_MM, 6);
  });

  it('spaces v evenly by length along the wall', () => {
    const a = surfacePoint(0, 0.2, 'outer');
    const b = surfacePoint(0, 0.21, 'outer');
    const c = surfacePoint(0, 0.8, 'outer');
    const d = surfacePoint(0, 0.81, 'outer');
    const expected = PROFILE_LENGTH_MM * 0.01;
    expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeCloseTo(expected, 1);
    expect(Math.hypot(d[0] - c[0], d[1] - c[1])).toBeCloseTo(expected, 1);
  });

  it('keeps the wall a constant thickness', () => {
    for (const v of [0.1, 0.5, 0.95]) {
      const outer = surfacePoint(0.4, v, 'outer');
      const inner = surfacePoint(0.4, v, 'inner');
      expect(Math.hypot(outer[0] - inner[0], outer[1] - inner[1], outer[2] - inner[2])).toBeCloseTo(3, 6);
    }
  });

  it('does not treat the two sides of the seam as neighbours', () => {
    expect(surfaceDistanceMm({ u: 0.02, v: 0.9 }, { u: 0.98, v: 0.9 })).toBeGreaterThan(200);
  });
});

describe('fracture', () => {
  it('has three pieces whose cracks do not cross themselves', () => {
    expect(SHARDS).toHaveLength(3);
    for (const shard of SHARDS) {
      const line = shard.crack;
      for (let i = 1; i < line.length; i++) {
        for (let j = i + 2; j < line.length; j++) {
          expect(segmentsCross(line[i - 1], line[i], line[j - 1], line[j])).toBe(false);
        }
      }
    }
  });

  it('breaks away from the seam', () => {
    for (const shard of SHARDS) {
      for (const p of shard.polygon) {
        expect(p.u).toBeGreaterThan(0.02);
        expect(p.u).toBeLessThan(0.98);
      }
    }
  });

  it('measures the distance to the nearest crack', () => {
    const onCrack = SHARDS[1].crack[7];
    expect(nearestCrackPoint(onCrack).distanceMm).toBeCloseTo(0, 6);
    expect(nearestCrackPoint({ u: 0.3, v: 0.2 }).distanceMm).toBeGreaterThan(20);
  });
});

describe('buildPiece', () => {
  const body = buildPiece(bodyOutline(), bodyHoles(), MAX_EDGE);
  const pieces = SHARDS.map((s) => buildPiece(s.polygon, [], MAX_EDGE));

  // Slivers along a jagged crack can tilt just past the surface normal on a curved wall, which no one can see.
  // Measured by area, so a real flipped patch fails however few triangles it takes.
  it('winds every face outward', () => {
    for (const mesh of [body, ...pieces]) {
      let flipped = 0;
      let total = 0;
      for (let t = 0; t < mesh.indices.length; t += 3) {
        const n = triangleNormal(mesh, t);
        const a = mesh.indices[t];
        const facing = n[0] * mesh.normals[a * 3] + n[1] * mesh.normals[a * 3 + 1] + n[2] * mesh.normals[a * 3 + 2];
        total += Math.abs(facing);
        if (facing < 0) flipped += -facing;
      }
      expect(flipped / total).toBeLessThan(0.001);
    }
  });

  it('makes each shard a closed solid', () => {
    for (const piece of pieces) expect(openEdgeCount(piece)).toBe(0);
  });

  it('gives the body the outer and inner normals the surface expects', () => {
    const outer = surfaceNormal(0.3, 0.7, 'outer');
    const inner = surfaceNormal(0.3, 0.7, 'inner');
    expect(outer[0] * inner[0] + outer[1] * inner[1] + outer[2] * inner[2]).toBeCloseTo(-1, 6);
  });

  it('stays light enough for a phone', () => {
    const triangles = [body, ...pieces].reduce((sum, m) => sum + m.indices.length / 3, 0);
    expect(triangles).toBeLessThan(40000);
  });
});
