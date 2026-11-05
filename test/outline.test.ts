// Outlines of drawn and icon obstacles (src/lib/outline.ts)
import { test } from 'vitest';
import assert from 'node:assert';
import * as O from '../src/lib/outline';

const area = (r: number[][], tris: number[][]) => tris.reduce((s, t) => {
  const [a, b, c] = t.map((i) => r[i]);
  return s + Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
}, 0);

test('a ring in triangles, as many as its corners less two, covering it', () => {
  const L = [[0, 0], [4, 0], [4, 2], [2, 2], [2, 4], [0, 4]];
  for (const r of [L, L.slice().reverse()]) {
    const tris = O.triangulate(r);
    assert.strictEqual(tris.length, 4);
    assert.strictEqual(area(r, tris), 12);
  }
  const star = Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? 0.45 : 1; return [q * Math.cos(a), q * Math.sin(a)]; });
  assert.strictEqual(O.triangulate(star).length, 8);
});

test('a ring that crosses itself is told', () => {
  assert.ok(O.selfCrossing([[0, 0], [4, 4], [4, 0], [0, 4]]));
  assert.ok(!O.selfCrossing([[0, 0], [4, 0], [4, 4], [0, 4]]));
});

test('a mask traced: one ring per piece, holes filled, in a unit box', () => {
  // a 12 x 8 frame (a hole in it) and a separate 3 x 3 square
  const w = 24, h = 12, mask = new Uint8Array(w * h);
  for (let y = 1; y < 9; y++) for (let x = 1; x < 13; x++) mask[y * w + x] = (x < 3 || x > 10 || y < 3 || y > 6) ? 1 : 0;
  for (let y = 2; y < 5; y++) for (let x = 17; x < 20; x++) mask[y * w + x] = 1;
  const rings = O.traceMask(mask, w, h, 4, 0.5);
  assert.strictEqual(rings.length, 2, 'two pieces, the frame with no ring for its hole');
  assert.deepStrictEqual(rings.map((r) => r.length).sort(), [4, 4], 'rectangles in four corners');
  const n = O.normalize(rings)!;
  assert.ok(Math.abs(n.aspect - 19 / 8) < 1e-9, 'pixel corners 1-20 across, 1-9 down');
  const all = n.rings.flat();
  assert.deepStrictEqual([Math.min(...all.map((p) => p[0])), Math.max(...all.map((p) => p[0]))], [-0.5, 0.5]);
});
