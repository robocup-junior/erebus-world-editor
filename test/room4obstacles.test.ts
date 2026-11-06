// Room 4's obstacles: put anywhere in a custom room 4 (rule 3.3: room 4 is not on a grid), as many as
// fit; through no wall (the map's or the picture's) or other obstacle; solid in the robot's way; saved,
// exported, and kept in the room 4 picture's PNG.
import { test } from 'vitest';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import type { MapData } from '../src/lib/types';
import * as M from '../src/lib/model';
import * as W from '../src/lib/field';
import * as Png from '../src/lib/png';

const quietly = <T>(fn: () => T): T => {
  const log = console.log;
  console.log = () => {};
  try { return fn(); } finally { console.log = log; }
};
// mapD: 8 x 6 tiles, a custom room 4 on tiles x 2-5, y 1-3 (its box (24, 12) cm, 48 x 36 cm)
function mapD(): MapData {
  return M.normalize(JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'maps2026', 'mapD.json'), 'utf8')));
}
const box = (o: Partial<W.Room4Obstacle>) => Object.assign({ shape: 'box', w: 4, d: 4, h: 6, rot: 0 }, o) as W.Room4Obstacle;
// a picture of room 4 (as the checks read it), white, with a black wall across it at x = px0..px1
function picture(w: number, h: number, px0: number, px1: number) {
  const px = new Uint8ClampedArray(w * h * 4).fill(255);
  for (let y = 0; y < h; y++) for (let x = px0; x <= px1; x++) { const i = (y * w + x) * 4; px[i] = px[i + 1] = px[i + 2] = 0; }
  return M.readRoom4Picture(px, w, h);
}

test('one is put where its centre is in room 4, any number of them, each where it fits', () => {
  const map = mapD();
  assert.deepStrictEqual(W.room4Box(map), { x0: 24, y0: 12, w: 48, h: 36 });
  const a = M.addRoom4Obstacle(map, box({ fx: 0.5, fy: 0.5 }));
  assert.strictEqual(a, 0);
  assert.deepStrictEqual(W.room4ObstacleCentre(map, map.room4Obstacles![0]), [48, 30]);
  // on the same tile as another, off its centre: a second one (no tile grid in room 4)
  assert.strictEqual(M.addRoom4Obstacle(map, box({ fx: 0.5 + 6 / 48, fy: 0.5 })), 1);
  // into the first: not put
  assert.strictEqual(M.addRoom4Obstacle(map, box({ fx: 0.5 + 2 / 48, fy: 0.5 })), -1);
  // through room 4's outer wall (its left edge, x = 24): not put; against it (half a wall in): put
  assert.strictEqual(M.addRoom4Obstacle(map, box({ fx: 1 / 48, fy: 0.3 })), -1);
  assert.ok(M.addRoom4Obstacle(map, box({ fx: 2.5 / 48, fy: 0.3 })) >= 0);
  assert.deepStrictEqual(M.problems(map).filter((p) => p.key === 'room4ObstacleOverlap'), []);
});

test('a wall drawn in the picture is in its way: not put through it, and a check when it is', () => {
  const map = mapD();
  // the picture 480 x 360 px for 48 x 36 cm: a 1 cm wall at x = 24 + 20 = 44 cm (px 200-209)
  const pic = picture(480, 360, 200, 209);
  assert.strictEqual(M.addRoom4Obstacle(map, box({ fx: 20.5 / 48, fy: 0.5 }), pic), -1, 'across the drawn wall');
  assert.ok(M.addRoom4Obstacle(map, box({ fx: 17.5 / 48, fy: 0.5 }), pic) >= 0, 'against it');
  // dragged into it: it stops against it
  assert.strictEqual(M.changeRoom4Obstacle(map, 0, { fx: 30 / 48 }, pic), true);
  const c = W.room4ObstacleCentre(map, map.room4Obstacles![0])!;
  assert.ok(c[0] + 2 <= 44 + 0.6 && c[0] > 17.5 + 24, 'stopped at the wall: ' + c[0]);
  // one there already (a picture drawn over it): a check, and its fix takes it off or makes it smaller
  map.room4Obstacles!.push(M.clampRoom4Obstacle(box({ fx: 20.5 / 48, fy: 0.2, w: 8, d: 8 })));
  const p = M.problems(map, pic).find((q) => q.key === 'room4ObstacleOverlap');
  assert.ok(p && p.block && p.params!.count === 1);
  M.fixProblem(map, p!, new Set(), pic);
  assert.ok(!M.problems(map, pic).some((q) => q.key === 'room4ObstacleOverlap'));
});

test('in the creator, a victim\'s stamp is as solid as a wall: no obstacle goes on one', () => {
  const map = mapD();
  // a stamp (red, 20 px square) at (240, 180) of a 480 x 360 picture: the middle of room 4
  const w = 480, h = 360, px = new Uint8ClampedArray(w * h * 4).fill(255);
  for (let y = 170; y < 190; y++) for (let x = 230; x < 250; x++) { const i = (y * w + x) * 4; px[i] = 255; px[i + 1] = 0; px[i + 2] = 4; }
  const forObstacles = M.readRoom4Picture(px, w, h, true);
  assert.strictEqual(forObstacles.tokens.length, 0);
  assert.strictEqual(M.addRoom4Obstacle(map, box({ fx: 0.5, fy: 0.5 }), forObstacles), -1);
  assert.strictEqual(M.addRoom4Obstacle(map, box({ fx: 0.2, fy: 0.5 }), forObstacles), 0);
  // the map editor's picture lists it as a victim: on it, not put either
  const read = quietly(() => M.readRoom4Picture(px, w, h));
  assert.strictEqual(read.tokens.length, 1);
  assert.strictEqual(M.addRoom4Obstacle(map, box({ fx: 0.5, fy: 0.5 }), read), -1);
  assert.strictEqual(M.addRoom4Obstacle(map, box({ fx: 0.8, fy: 0.5 }), read), 1);
});

test('solid in the robot\'s way: the robot does not get inside one, and it is saved and opened again', () => {
  const map = mapD();
  M.addRoom4Obstacle(map, box({ fx: 0.5, fy: 0.5, w: 10, d: 10, color: '#dc2626' }));
  const fits = W.robotFits(map);
  assert.strictEqual(fits(48, 30), false, 'its middle');
  assert.ok(W.obstacleOutlines(map).length === 1 && W.obstacleOutlines(map, true).length === 0);
  const saved = JSON.parse(JSON.stringify(M.saved(map)));
  assert.strictEqual(saved.room4Obstacles.length, 1);
  const back = M.normalize(saved);
  assert.deepStrictEqual(back.room4Obstacles, map.room4Obstacles);
  // none: saved as the classic editor saves a map
  assert.ok(!('room4Obstacles' in M.saved(mapD())));
  // a room 4 that is not a custom one has none
  const pre = mapD();
  M.addRoom4Obstacle(pre, box({ fx: 0.5, fy: 0.5 }));
  pre.area4Room = W.area4Presets()[2];
  assert.deepStrictEqual(W.room4Obstacles(pre), []);
});

test('exported at its place on the map, of its shape and colour', () => {
  const map = mapD();
  M.addRoom4Obstacle(map, box({ fx: 0.5, fy: 0.5, color: '#dc2626', rot: 0.5 }));
  const hooks = () => ({ createArea4Solid: () => '', createArea4Victims: () => ['', '', ''] });
  const world = quietly(() => M.world(map, hooks as any));
  const m = world.match(/DEF OBSTACLE0 Solid \{\s*translation (\S+) (\S+) (\S+)\s*rotation 0 1 0 (\S+)/);
  assert.ok(m, 'in the world');
  // (48, 30) cm on an 8 x 6 map: x = 0.42 - 0.48, z = 0.24 - 0.36
  assert.ok(Math.abs(Number(m![1]) + 0.06) < 1e-6 && Math.abs(Number(m![3]) + 0.12) < 1e-6, m![0]);
  assert.strictEqual(Number(m![4]), 0.5);
  assert.ok(/diffuseColor 0\.7\d+ 0\.0\d+ 0\.0\d+/.test(world));
});

test('a PNG keeps a text chunk: put in, read back, put in again in place of the old one', () => {
  // a 1 x 1 PNG
  const png = Png.dataUrlBytes('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
  assert.strictEqual(Png.readText(png, 'k'), null);
  const one = Png.withText(png, 'k', '{"a":"é"}');
  assert.strictEqual(JSON.parse(Png.readText(one, 'k')!).a, 'é');
  const two = Png.withText(one, 'k', '{"a":2}');
  assert.strictEqual(Png.readText(two, 'k'), '{"a":2}');
  assert.strictEqual(two.length - png.length, 12 + 'k\0{"a":2}'.length, 'the old one gone');
  // its chunk's CRC as PNG has it
  const at = png.length - 12, n = 'k\0{"a":2}'.length;
  const crc = ((two[at + 8 + n] << 24) | (two[at + 9 + n] << 16) | (two[at + 10 + n] << 8) | two[at + 11 + n]) >>> 0;
  assert.strictEqual(crc, Png.crc32(two.subarray(at + 4, at + 8 + n)));
  // not a PNG: as it is
  assert.deepStrictEqual(Png.withText(new Uint8Array([1, 2, 3]), 'k', 'x'), new Uint8Array([1, 2, 3]));
});
