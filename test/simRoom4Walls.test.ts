// The walls of a custom room 4 picture in the world file (src/rules/parts/export/erebus26/room4.ts: wallMesh): a
// shape drawn round floor keeps that floor open - a face up each edge of its outline and of its hole,
// and a top over the wall only
import { test } from 'vitest';
import assert from 'node:assert';
import * as R4W from '../src/rules/parts/export/erebus26/room4';
const wallMesh = R4W.wallMesh;

// the mesh read back: points [x, y, z], faces [indices]
function read(m: { point: string; coordIndex: string }) {
  const points = m.point.split(',').filter((s) => s.trim()).map((s) => s.trim().split(/\s+/).map(Number));
  const faces: number[][] = [];
  let f: number[] = [];
  m.coordIndex.split(',').filter((s) => s.trim()).map(Number).forEach((i) => { if (i < 0) { faces.push(f); f = []; } else f.push(i); });
  return { points, faces };
}
// signed area of a face seen from above (x, z)
const area = (pts: number[][]) => pts.reduce((s, p, j) => { const q = pts[(j + 1) % pts.length]; return s + p[0] * q[2] - q[0] * p[2]; }, 0) / 2;
const square = (a: number, b: number) => [[a, a], [b, a], [b, b], [a, b]];

test('a filled shape: a face up each edge and its top, as before', () => {
  const { points, faces } = read(wallMesh(square(0, 1), [], 0.06));
  assert.strictEqual(points.length, 8);
  const sides = faces.filter((f) => f.length === 4), top = faces.filter((f) => f.length === 3);
  assert.strictEqual(sides.length, 4);
  const topArea = top.reduce((s, f) => s + Math.abs(area(f.map((i) => points[i]))), 0);
  assert.ok(Math.abs(topArea - 1) < 1e-9);
  assert.ok(top.every((f) => f.every((i) => points[i][1] === 0.06)), 'the top is at the wall\'s height');
});

test('a frame: walls round its hole too, and no top over the hole (the floor inside stays open)', () => {
  // OpenCV traces a hole the other way round from its outline
  const hole = square(3, 7).reverse();
  const { points, faces } = read(wallMesh(square(0, 10), [hole], 0.06));
  assert.strictEqual(points.length, 16);
  const sides = faces.filter((f) => f.length === 4), top = faces.filter((f) => f.length === 3);
  assert.strictEqual(sides.length, 8, 'four up the outline, four up the hole');
  const tris = top.map((f) => f.map((i) => points[i]));
  const topArea = tris.reduce((s, t) => s + Math.abs(area(t)), 0);
  assert.ok(Math.abs(topArea - (100 - 16)) < 1e-9, `top ${topArea}`);
  // the middle of the hole is under no triangle
  const inTri = (t: number[][], x: number, z: number) => {
    const s = (a: number[], b: number[]) => (b[0] - a[0]) * (z - a[2]) - (b[2] - a[2]) * (x - a[0]);
    const d = [s(t[0], t[1]), s(t[1], t[2]), s(t[2], t[0])];
    return d.every((v) => v >= 0) || d.every((v) => v <= 0);
  };
  assert.ok(!tris.some((t) => inTri(t, 5, 5)));
  // every triangle turned the same way as the outline (the side that is drawn)
  const turn = Math.sign(area(square(0, 10).map((p) => [p[0], 0, p[1]])));
  assert.ok(tris.every((t) => Math.sign(area(t)) === turn));
});

test('a victim on a speck of wall still gets a turn (it was NaN, and Webots then read no world at all)', () => {
  // the same point either side: it faces from the wall to its stamp's centre ([row, col] pixels)
  const below = R4W.tokenTurn([10, 10], [10, 10], [5, 10], [10, 10]);    // stamp above the wall: on its top face
  const above = R4W.tokenTurn([10, 10], [10, 10], [15, 10], [10, 10]);   // stamp below: on its bottom face
  const left = R4W.tokenTurn([10, 10], [10, 10], [10, 15], [10, 10]);    // stamp to the right: on its right face
  assert.ok([below, above, left].every(Number.isFinite));
  // as rooms 1-3 turn them: a bottom-of-tile victim 0, a top-of-tile one π, a left-of-tile one -π/2
  assert.ok(Math.abs(below) < 1e-9);
  assert.ok(Math.abs(Math.abs(above) - Math.PI) < 1e-9);
  assert.ok(Math.abs(left + Math.PI / 2) < 1e-9);
  // along a wall it turns by the wall as before
  assert.ok(Number.isFinite(R4W.tokenTurn([10, 0], [10, 20], [5, 10], [10, 10])));
});
