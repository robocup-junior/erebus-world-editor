// Map editing (src/lib/model.ts)
import { test } from 'vitest';
import assert from 'node:assert';
import type { MapData } from '../src/lib/types';
import * as M from '../src/lib/model';
import * as L from '../src/lib/lattice';
import * as W from '../src/lib/field';
import fs from 'node:fs';
import path from 'node:path';

const wall = (map: MapData, x: number, y: number) => !!(map.cells[`${x},${y},0`] && map.cells[`${x},${y},0`].isWall);
const quietly = <T>(fn: () => T): T => {
  const log = console.log;
  console.log = () => {};
  try { return fn(); } finally { console.log = log; }
};

// Paints tiles (tile indices) into a room and keeps the border walls in step, as the editor does
function paint(map: MapData, room: number, tiles: number[][], borders: Set<string>) {
  tiles.forEach(([tx, ty]) => M.setRoom(map, 2 * tx + 1, 2 * ty + 1, room));
  return M.syncBorderWalls(map, borders);
}

test('a new map has its tiles and outer walls, and no start yet', () => {
  const map = M.newMap(3, 2, 2026);
  assert.ok(wall(map, 1, 0) && wall(map, 5, 4) && wall(map, 0, 3) && wall(map, 6, 1));
  assert.ok(!wall(map, 2, 1));
  assert.ok(map.cells['5,3,0'].tile);
  assert.deepStrictEqual(M.problems(map).map((p) => p.key), ['noStart']);
});

test('the start goes in room 1 only, and a start the room was painted over is a problem it fixes', () => {
  const map = M.newMap(4, 2, 2026);
  let borders = paint(map, 2, [[2, 0], [3, 0], [2, 1], [3, 1]], new Set());
  assert.strictEqual(M.setFloor(map, 5, 1, 'start'), false, 'not on a room 2 tile');
  assert.deepStrictEqual(map.startTile, { x: 0, y: 0, z: 0 });
  assert.strictEqual(M.setFloor(map, 3, 1, 'start'), true);
  assert.ok(!M.problems(map).some((p) => p.key === 'startNotRoom1'));
  borders = paint(map, 2, [[1, 0]], borders);
  const p = M.problems(map).find((q) => q.key === 'startNotRoom1');
  assert.ok(p && p.block, 'blocks the export');
  assert.deepStrictEqual(p!.show!.tiles, [[1, 0]]);
  M.fixProblem(map, p!, borders);
  assert.strictEqual(M.roomOf(map, map.startTile.x, map.startTile.y), 1, 'moved back into room 1');
  assert.ok(!M.problems(map).some((q) => q.key === 'startNotRoom1'));
});

test('a tile is one of a swamp, a hole, a checkpoint, the start and a passage, no more', () => {
  const map = M.newMap(4, 3, 2026);
  let borders = paint(map, 2, [[2, 0], [3, 0], [2, 1], [3, 1], [2, 2], [3, 2]], new Set());
  M.setFloor(map, 1, 1, 'checkpoint');
  assert.strictEqual(M.setFloor(map, 1, 1, 'start'), false, 'no start on a checkpoint');
  assert.ok(M.setFloor(map, 1, 3, 'start'));
  assert.strictEqual(M.setFloor(map, 1, 3, 'swamp'), false, 'no swamp on the start');
  assert.strictEqual(M.togglePassage(map, 4, 1, [3, 1]), 'open');
  borders = M.syncBorderWalls(map, borders);
  assert.strictEqual(M.setFloor(map, 3, 1, 'black'), false, 'no hole on a passage');
  assert.strictEqual(M.togglePassage(map, 4, 3, [3, 3]), 'open', 'a passage further down');
  borders = M.syncBorderWalls(map, borders);
  M.setFloor(map, 3, 5, 'swamp');
  assert.strictEqual(M.togglePassage(map, 4, 5, [3, 5]), 'taken', 'no passage on a swamp');
  assert.ok(!M.problems(map).some((p) => p.key === 'tileTwoKinds'));
  // two at once, as a map from elsewhere may have them: a problem that blocks, fixed
  map.cells['1,3,0'].tile!.checkpoint = true;
  const p = M.problems(map).find((q) => q.key === 'tileTwoKinds');
  assert.ok(p && p.block);
  assert.deepStrictEqual(p!.show!.tiles, [[0, 1]]);
  M.fixProblem(map, p!, borders);
  assert.ok(!map.cells['1,3,0'].tile!.checkpoint && map.startTile.x === 1 && map.startTile.y === 3, 'the floor goes, the start stays');
});

test('contact tiles (2027) are not in that list: the start can be one', () => {
  const map = M.newMap(3, 3, 2027);
  M.setFloor(map, 1, 1, 'contact');
  assert.ok(M.setFloor(map, 1, 1, 'start'));
  assert.ok(!M.problems(map).some((p) => p.key === 'tileTwoKinds'));
});

test('a passage gets walls on two sides, one way in and one way out, and they go with it', () => {
  const map = M.newMap(4, 3, 2026);
  M.setFloor(map, 1, 5, 'start');
  let borders = paint(map, 2, [[2, 0], [3, 0], [2, 1], [3, 1], [2, 2], [3, 2]], new Set());
  const preview = M.passageWallsPreview(map, borders, 4, 3, [3, 3]);
  assert.strictEqual(M.togglePassage(map, 4, 3, [3, 3]), 'open');
  borders = M.syncBorderWalls(map, borders);
  // the way out is the border (right), the way in across from it (left): top and bottom are walled
  assert.ok(wall(map, 3, 2) && wall(map, 3, 4), 'top and bottom');
  assert.ok(!wall(map, 4, 3) && !wall(map, 2, 3), 'right and left open');
  assert.deepStrictEqual([...preview].sort(), [...map.cells['3,3,0'].tile!.passageWalls].sort(), 'the preview shows them');
  assert.ok(!M.problems(map).some((p) => p.key === 'passageOpenSides'));
  // a wall taken off: open on three sides, a problem that blocks, fixed
  M.setWalls(map, ['h,2,4', 'h,3,4'], false);
  const p = M.problems(map).find((q) => q.key === 'passageOpenSides');
  assert.ok(p && p.block);
  M.fixProblem(map, p!, borders);
  assert.ok(wall(map, 3, 4) && !M.problems(map).some((q) => q.key === 'passageOpenSides'));
  // the passage closed: its walls go
  assert.strictEqual(M.togglePassage(map, 4, 3, [3, 3]), 'closed');
  borders = M.syncBorderWalls(map, borders);
  assert.ok(!wall(map, 3, 2) && !wall(map, 3, 4) && wall(map, 4, 3), 'its walls gone, the border walled again');
  assert.ok(!map.cells['3,3,0'].tile!.passageWalls);
});

test('a passage against a wall across from its way out is walled where it is still open', () => {
  const map = M.newMap(4, 3, 2026);
  M.setFloor(map, 1, 5, 'start');
  let borders = paint(map, 2, [[2, 0], [3, 0], [2, 1], [3, 1], [2, 2], [3, 2]], new Set());
  M.setWalls(map, ['v,2,2', 'v,2,3'], true);    // the left side of tile (1, 1)
  M.togglePassage(map, 4, 3, [3, 3]);
  borders = M.syncBorderWalls(map, borders);
  const open = ['3,2', '3,4'].filter((k) => !wall(map, Number(k.split(',')[0]), Number(k.split(',')[1])));
  assert.strictEqual(open.length, 1, 'one of top and bottom is its way in');
  assert.ok(!M.problems(map).some((p) => p.key === 'passageOpenSides' || p.key.startsWith('conn.')));
});

test('fix all walls the passages of the sample maps, also where a side is open only near its ends', () => {
  for (const name of ['mapA', 'mapB', 'mapC', 'mapD']) {
    const map = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'maps2026', name + '.json'), 'utf8'));
    let borders = M.syncBorderWalls(map, new Set());
    borders = M.fixAll(map, borders);
    const left = M.problems(map).filter((p) => p.block && p.key !== 'customRoom4NoPicture').map((p) => p.key);
    assert.deepStrictEqual(left, [], name);
  }
});

test('an obstacle: any shape on a tile of rooms 1-3, its centre on the tile, one to a tile, a tile that is nothing else', () => {
  const map = M.newMap(4, 3, 2026);
  let borders = paint(map, 4, [[3, 0], [3, 1], [3, 2]], new Set());
  M.setFloor(map, 1, 5, 'start');
  assert.ok(M.setFloor(map, 5, 3, 'obstacle'));
  assert.deepStrictEqual(map.cells['5,3,0'].tile!.obstacleShape, M.OBSTACLE_DEFAULT);
  // kept to what it can be: its centre half a wall in from the tile's edges, a round one one across
  const sh = M.clampObstacle({ shape: 'cylinder', w: 30, d: 2, h: 0, dx: 9, dy: -9, rot: -Math.PI / 2 });
  assert.deepStrictEqual([sh.shape, sh.w, sh.d, sh.h, sh.dx, sh.dy], ['cylinder', 12, 12, 1, 5.5, -5.5]);
  assert.ok(Math.abs(sh.rot - 1.5 * Math.PI) < 1e-3);
  M.changeObstacle(map, 5, 3, { shape: 'cylinder' });
  assert.strictEqual(map.cells['5,3,0'].tile!.obstacleShape.shape, 'cylinder');
  M.changeObstacle(map, 5, 3, { shape: 'sphere', w: 5 });
  assert.strictEqual(map.cells['5,3,0'].tile!.obstacleShape.h, 5, 'a sphere as high as it is across');
  assert.strictEqual(M.setFloor(map, 5, 3, 'swamp'), false, 'no swamp on it');
  assert.strictEqual(M.setFloor(map, 1, 5, 'obstacle'), false, 'not on the start');
  assert.strictEqual(M.setFloor(map, 7, 3, 'obstacle'), false, 'not in room 4');
  assert.strictEqual(M.togglePassage(map, 6, 3, [5, 3]), 'taken', 'not a passage');
  for (let i = 0; i < 20; i++) {
    const r = M.randomObstacle();
    assert.ok(W.OBSTACLE_KINDS.includes(r.shape) && r.w >= 2 && r.w <= 8 && Math.abs(r.dx) <= 5.5);
  }
  M.setObstacle(map, 5, 3, null);
  assert.ok(!map.cells['5,3,0'].tile!.obstacle);
  // painted into room 4: it goes
  M.setFloor(map, 5, 3, 'obstacle');
  borders = paint(map, 4, [[2, 1]], borders);
  assert.ok(!map.cells['5,3,0'].tile!.obstacle);
  assert.deepStrictEqual(M.problems(map).filter((p) => p.key === 'obstacleRoom' || p.key === 'tileTwoKinds'), []);
});

test('an obstacle may stand against a wall, not go through it, nor into another obstacle', () => {
  const map = M.newMap(3, 1, 2026);
  M.setFloor(map, 1, 1, 'start');
  M.setObstacle(map, 3, 1, { shape: 'box', w: 4, d: 4, h: 6 });
  M.setObstacle(map, 5, 1, { shape: 'star' as any, w: 8, h: 6 });   // a star of the past: the outline it was
  assert.ok(!M.problems(map).some((p) => p.key === 'obstacleOverlap'));
  // dragged up to the outer wall (its face 0.5 cm in from y = 0): it stops against it
  assert.ok(M.changeObstacle(map, 3, 1, { dy: -5.5 }));
  const sh = map.cells['3,1,0'].tile!.obstacleShape;
  assert.ok(Math.abs(sh.dy - -3.5) <= 0.1, 'its top side against the wall: ' + sh.dy);
  assert.ok(!M.problems(map).some((p) => p.key === 'obstacleOverlap'), 'against a wall is all right');
  // made larger towards the star on the next tile: it stops at it (the star's point at 26.2 cm)
  M.changeObstacle(map, 3, 1, { dy: 0, dx: 5.5 });
  M.changeObstacle(map, 3, 1, { w: 10 });
  const wide = map.cells['3,1,0'].tile!.obstacleShape;
  assert.ok(wide.w < 10 && !M.problems(map).some((p) => p.key === 'obstacleOverlap'), 'stopped at ' + wide.w);
  // not put where it would go into something: a room 2 tile with a wall through its middle
  const m2 = M.newMap(2, 1, 2026);
  M.setRoom(m2, 1, 1, 2);
  M.setWalls(m2, ['v,1,0', 'v,1,1'], true);
  assert.ok(!M.obstacleFits(m2, 1, 1, M.OBSTACLE_DEFAULT));
  assert.ok(M.obstacleFits(m2, 3, 1, M.OBSTACLE_DEFAULT));
});

test('one that goes through a wall (a file, a wall drawn over it) stops the export, and is fixed', () => {
  const map = M.newMap(3, 1, 2026);
  M.setFloor(map, 1, 1, 'start');
  map.cells['3,1,0'].tile!.obstacle = true;
  map.cells['3,1,0'].tile!.obstacleShape = { shape: 'box', w: 6, d: 6, h: 6, dx: 0, dy: -5, rot: 0 };
  M.setObstacle(map, 5, 1, { shape: 'cylinder', w: 4, h: 6 });
  M.setWalls(map, ['v,5,0', 'v,5,1'], true);               // a wall through the middle of tile (2, 0)
  const p = M.problems(map).find((q) => q.key === 'obstacleOverlap')!;
  assert.ok(p.block, 'stops the export');
  assert.deepStrictEqual(p.show!.tiles, [[1, 0], [2, 0]]);
  M.fixProblem(map, p, new Set());
  assert.ok(!M.problems(map).some((q) => q.key === 'obstacleOverlap'));
  const a = map.cells['3,1,0'].tile!.obstacleShape;
  assert.deepStrictEqual([a.dx, a.dy, a.w], [0, 0, 6], 'back to the middle of its tile');
  assert.ok(!map.cells['5,1,0'].tile!.obstacle, 'nothing fits with the wall through its tile: taken off');
});

test('an obstacle is in the way of the robot: a one-tile corridor with one is closed to it', () => {
  // 3 x 1: the start, an obstacle, a victim at the far end
  const map = M.newMap(3, 1, 2026);
  M.setFloor(map, 1, 1, 'start');
  M.setVictim(map, 5, 1, 'right', 'H', false, { rot: 0 });
  assert.ok(!M.problems(map).some((p) => p.key === 'victimUnreachable'));
  M.setObstacle(map, 3, 1, { shape: 'cylinder', w: 6, h: 6 });
  assert.ok(M.problems(map).some((p) => p.key === 'victimUnreachable'), 'the victim behind it is out of reach');
  // a small one at the side leaves room
  M.changeObstacle(map, 3, 1, { w: 2, dy: -3 });
  assert.ok(!M.problems(map).some((p) => p.key === 'victimUnreachable'));
});

test('the world file has the obstacles put in the editor, each of its shape', () => {
  const map = M.newMap(3, 2, 2026);
  M.setFloor(map, 1, 1, 'start');
  M.setObstacle(map, 3, 1, { shape: 'box', w: 4, d: 3, h: 5, dx: 1, dy: -0.5, rot: 0.25 });
  M.setObstacle(map, 5, 1, { shape: 'sphere', w: 4 });
  M.setObstacle(map, 3, 3, { shape: 'star' as any, w: 6, h: 8 });   // a star of the past: the outline it was
  M.setObstacle(map, 5, 3, { shape: 'pyramid', w: 6, d: 4, h: 8 });
  const world = quietly(() => M.world(map));
  const m = world.match(/DEF OBSTACLE0 Solid \{\s*translation (\S+) (\S+) (\S+)\s*rotation 0 1 0 (\S+)[\s\S]*?Box \{\s*size (\S+) (\S+) (\S+)/);
  assert.ok(m, 'the box');
  assert.deepStrictEqual(m!.slice(4).map(Number), [0.25, 0.04, 0.05, 0.03]);
  // the tiles of the world as its other parts have them (a tile at its index x 12 cm, from minus half
  // the map's width and length): tile (1, 0) at -6 cm, -12 cm; the box 1 cm right, 0.5 cm up, on the
  // floor (its top at -3 cm) and 5 cm high
  assert.ok(Math.abs(Number(m![1]) - -0.05) < 1e-6 && Math.abs(Number(m![2]) - -0.005) < 1e-6 && Math.abs(Number(m![3]) - -0.125) < 1e-6, m!.slice(1, 4).join(' '));
  assert.match(world, /translation \S+ -0\.01 \S+\s*rotation[^\n]*\n(?:(?!Solid)[\s\S])*?Sphere \{\s*radius 0\.02/);
  // the star and the pyramid as meshes from the floor up: 10 points round a prism, 4 to an apex
  const meshes = world.match(/point \[ [^\]]* \] \}\s*coordIndex \[ [^\]]* \]/g)!;
  assert.strictEqual(meshes.length, 2);
  const star = meshes.find((g) => g.split('point [')[1].split(']')[0].split(',').length === 20)!.match(/coordIndex \[ ([^\]]*) \]/)!;
  assert.strictEqual(star[1].split('-1').length - 1, 10 + 8 + 8, 'a side for each of its 10 corners, and its top and base in 8 triangles each');
  const pyr = meshes.find((g) => g.split('point [')[1].split(']')[0].split(',').length === 5)!.match(/point \[ ([^\]]*) \]/)!;
  assert.strictEqual(pyr[1].split(',').length, 5, 'four corners and the apex');
  assert.ok(pyr[1].trim().endsWith('0 0.08 0'), 'the apex 8 cm up');
});

test('regular prisms and pyramids, a drawn outline and the outlines of an icon are obstacles too', () => {
  const map = M.newMap(3, 1, 2026);
  M.setFloor(map, 1, 1, 'start');
  M.setObstacle(map, 3, 1, { shape: 'prism', w: 6, h: 5, n: 5 });
  assert.strictEqual(W.obstacleRings(map.cells['3,1,0'].tile!.obstacleShape, 3, 1)[0].length, 5);
  assert.strictEqual(M.clampObstacle({ shape: 'npyramid', n: 20 }).n, 8, 'sides 3-8');
  // an L drawn, in its unit box, made 6 x 4 cm
  const L4 = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0], [0, 0], [0, 0.5], [-0.5, 0.5]];
  M.setObstacle(map, 5, 1, { shape: 'polygon', outline: [L4], w: 6, d: 4, h: 6 });
  const ring = W.obstacleRings(map.cells['5,1,0'].tile!.obstacleShape, 5, 1)[0];
  assert.deepStrictEqual(ring[2].map((v) => Math.round(v * 100) / 100), [33, 6]);
  // without an outline, a drawn one is a box
  assert.strictEqual(M.clampObstacle({ shape: 'polygon' }).shape, 'box');
  const world = quietly(() => M.world(map));
  assert.ok(world.includes('OBSTACLE1'), 'both in the world');
  // an icon of two pieces: both outlines in the robot's way
  M.setObstacle(map, 5, 1, { shape: 'icon', icon: 'x', outline: [[[-0.5, -0.5], [-0.1, -0.5], [-0.1, 0.5], [-0.5, 0.5]], [[0.1, -0.5], [0.5, -0.5], [0.5, 0.5], [0.1, 0.5]]], w: 6, d: 6, h: 6 });
  assert.strictEqual(W.obstacleRings(map.cells['5,1,0'].tile!.obstacleShape, 5, 1).length, 2);
  assert.strictEqual(quietly(() => M.world(map)).match(/IndexedFaceSet/g)!.length, 2);
});

test('a star of the past is the outline it was (a drawn one); a drawn one and an icon keep their proportions', () => {
  const star = M.clampObstacle({ shape: 'star' as any, w: 8, h: 6 });
  assert.strictEqual(star.shape, 'polygon');
  assert.strictEqual(star.outline![0].length, 10, 'its ten points');
  assert.ok(Math.abs(star.w - 8 * Math.cos(Math.PI / 10)) < 0.1, 'as wide as its points: ' + star.w);
  assert.ok(star.aspect! > 1, 'wider than high');
  assert.ok(!W.OBSTACLE_KINDS.includes('star' as any), 'no star of its own: an icon has one');
  // made larger by its longer side, the other in proportion (what the panel's size does)
  const L4 = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0], [0, 0], [0, 0.5], [-0.5, 0.5]];
  const drawn = M.clampObstacle({ shape: 'polygon', outline: [L4], w: 6, d: 3, h: 6 });
  assert.strictEqual(drawn.aspect, 2);
  const bigger = M.clampObstacle(Object.assign({}, drawn, { w: 10, d: 10 / drawn.aspect! }));
  assert.deepStrictEqual([bigger.w, bigger.d, bigger.aspect], [10, 5, 2]);
});

test('the meshes of obstacles face out: Webots draws a face from its front only', () => {
  // each face's corners anticlockwise seen from outside: with the right hand, their normal points out,
  // so the volume summed over the faces is the shape's own (none counted inwards), the top faces up
  // and the base down; and no VRML `solid` field, which Webots's IndexedFaceSet has not
  const L4 = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0], [0, 0], [0, 0.5], [-0.5, 0.5]];
  const shapes: [object, number][] = [
    [{ shape: 'cylinder', w: 6, h: 5 }, 0.5 * 24 * 9 * Math.sin(2 * Math.PI / 24) * 5],     // a 24-sided prism
    [{ shape: 'prism', w: 6, h: 4, n: 5 }, 0],
    [{ shape: 'cone', w: 6, h: 6 }, 0],
    [{ shape: 'pyramid', w: 6, d: 4, h: 6 }, 6 * 4 * 6 / 3],
    [{ shape: 'npyramid', w: 6, h: 6, n: 3 }, 0],
    [{ shape: 'polygon', outline: [L4], w: 8, d: 8, h: 5 }, (64 - 16) * 5],
    [{ shape: 'polygon', outline: [L4.slice().reverse()], w: 8, d: 8, h: 5 }, (64 - 16) * 5],
    [{ shape: 'icon', icon: 'x', outline: [[[-0.5, -0.5], [-0.1, -0.5], [-0.1, 0.5], [-0.5, 0.5]], [[0.1, 0.5], [0.5, 0.5], [0.5, -0.5], [0.1, -0.5]]], w: 10, d: 10, h: 3 }, 2 * 4 * 10 * 3]
  ];
  for (const [sh, volume] of shapes) {
    const map = M.newMap(1, 1, 2026);
    M.setFloor(map, 1, 1, 'start');
    M.setObstacle(map, 1, 1, sh as any);
    const world = quietly(() => M.world(map));
    assert.ok(!/\bsolid\b/.test(world.slice(world.indexOf('OBSTACLE0'))), 'no solid field');
    const g = world.match(/point \[ ([^\]]*) \] \}\s*coordIndex \[ ([^\]]*) \]/)!;
    const pts = g[1].split(',').map((q) => q.trim().split(' ').map(Number));
    const faces = g[2].split('-1').map((f) => f.split(',').map((i) => i.trim()).filter((i) => i).map(Number)).filter((f) => f.length);
    let vol = 0;
    const h = Math.max(...pts.map((p) => p[1]));
    for (const f of faces) {
      // the face in triangles from its first corner; its normal (right hand) and its share of the volume
      let n = [0, 0, 0];
      for (let k = 1; k < f.length - 1; k++) {
        const [a, b, c] = [pts[f[0]], pts[f[k]], pts[f[k + 1]]];
        const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const x = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        n = [n[0] + x[0], n[1] + x[1], n[2] + x[2]];
        vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
      }
      const ys = f.map((i) => pts[i][1]);
      if (ys.every((y) => y === 0)) assert.ok(n[1] < 0, 'a base faces down');
      else if (ys.every((y) => y === h) && f.length === 3 && !(sh as any).shape.match(/cone|pyramid/)) assert.ok(n[1] > 0, 'a top faces up');
    }
    assert.ok(vol > 0, (sh as any).shape + ': outward, its volume ' + vol);
    if (volume) assert.ok(Math.abs(vol * 1e6 - volume) / volume < 0.01, (sh as any).shape + ': ' + vol * 1e6 + ' cm3, not ' + volume);
  }
});

for (const year of [2026, 2027]) test(`${year}: what is new in the editor is saved as JSON and opened again the same: obstacles, passage walls, victims changed`, () => {
  // a map with all of it: room 2 on the right, a passage, obstacles of every kind, victims changed
  const map = M.newMap(5, 3, year);
  let borders = paint(map, 2, [[3, 0], [4, 0], [3, 1], [4, 1], [3, 2], [4, 2]], new Set());
  M.setFloor(map, 1, 5, 'start');
  assert.strictEqual(M.togglePassage(map, 6, 3, [5, 3]), 'open');
  borders = M.syncBorderWalls(map, borders);
  const L4 = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0], [0, 0], [0, 0.5], [-0.5, 0.5]];
  const kinds: object[] = [
    { shape: 'box', w: 3, d: 2, h: 4, rot: 0.3, color: '#dc2626' }, { shape: 'cylinder', w: 3, h: 5 }, { shape: 'cone', w: 3, h: 5 },
    { shape: 'sphere', w: 3 }, { shape: 'pyramid', w: 3, d: 2, h: 4 }, { shape: 'prism', w: 3, h: 4, n: 5 },
    { shape: 'npyramid', w: 3, h: 4, n: 3, dx: 1, dy: -1 }, { shape: 'polygon', outline: [L4], w: 4, d: 2, h: 3, aspect: 2 },
    { shape: 'icon', icon: 'car', outline: [L4], w: 4, d: 4, h: 3, aspect: 1 }
  ];
  const tiles = [[1, 1], [3, 1], [1, 3], [3, 3], [7, 1], [9, 1], [7, 3], [9, 3], [7, 5]];
  kinds.forEach((sh, i) => M.setObstacle(map, tiles[i][0], tiles[i][1], sh));
  M.setVictim(map, 1, 5, 'left', 'H', false, { rot: 30 });
  M.changeVictim(map, { kind: 'edge', x: 1, y: 5, dir: 'left' }, { type: 'S', fake: true, rot: 120 });
  const slot = [...Array(16).keys()].find((i) => M.slotHasWall(map, 9, 5, i))!;
  M.setSlotVictim(map, 9, 5, slot, 'H', false, { rot: 0 });
  M.changeVictim(map, { kind: 'slot', x: 9, y: 5, i: slot }, { type: 'CT', code: 'BBRRY' });
  if (year === 2027) M.setFloor(map, 3, 5, 'contact');
  // saved as the editor saves it, and opened again as it opens a file
  const text = JSON.stringify(M.saved(map));
  const back = M.normalize(JSON.parse(text));
  assert.strictEqual(JSON.stringify(M.saved(back)), text, 'the same file again');
  tiles.forEach(([x, y], i) => assert.deepStrictEqual(back.cells[`${x},${y},0`].tile!.obstacleShape, map.cells[`${x},${y},0`].tile!.obstacleShape, JSON.stringify(kinds[i])));
  assert.deepStrictEqual(back.cells['5,3,0'].tile!.passageWalls, map.cells['5,3,0'].tile!.passageWalls);
  assert.ok(back.cells['5,3,0'].tile!.passageWalls.length, 'the passage has its walls');
  assert.deepStrictEqual(M.victimAt(back, { kind: 'edge', x: 1, y: 5, dir: 'left' }), M.victimAt(map, { kind: 'edge', x: 1, y: 5, dir: 'left' }));
  assert.strictEqual(M.victimAt(back, { kind: 'slot', x: 9, y: 5, i: slot })!.code, 'BBRRY');
  assert.deepStrictEqual(M.problems(back).map((p) => p.key), M.problems(map).map((p) => p.key));
  // the same world from it
  const seeded = () => { let a = 3; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
  const random = Math.random;
  try {
    seeded(); const one = quietly(() => M.world(map));
    seeded(); const two = quietly(() => M.world(back));
    assert.strictEqual(two, one);
    assert.strictEqual(one.match(/DEF OBSTACLE\d+ Solid/g)!.length, kinds.length, 'every obstacle in the world');
  } finally { Math.random = random; }
  // what the file keeps still works: the passage closed, its walls go with it
  M.togglePassage(back, 6, 3, [5, 3]);
  M.syncBorderWalls(back, M.borderEdges(back));
  assert.ok(!back.cells['5,3,0'].tile!.passageWalls);
  assert.ok(!wall(back, 5, 2) && !wall(back, 5, 4), 'its walls gone');
});

test('a file with a star obstacle of before opens as the outline it was', () => {
  const map = M.newMap(2, 1, 2026);
  M.setFloor(map, 1, 1, 'start');
  const file = JSON.parse(JSON.stringify(M.saved(map)));
  file.cells['3,1,0'].tile.obstacle = true;
  file.cells['3,1,0'].tile.obstacleShape = { shape: 'star', w: 6, d: 6, h: 5, dx: 0, dy: 0, rot: 0 };
  const back = M.normalize(file);
  const sh = back.cells['3,1,0'].tile!.obstacleShape;
  assert.deepStrictEqual([sh.shape, sh.outline[0].length], ['polygon', 10]);
  assert.ok(quietly(() => M.world(back)).includes('OBSTACLE0'));
});

test('an obstacle of any colour: as it is seen, in the world as Webots takes it (linear); none: the grey of before', () => {
  assert.strictEqual(M.clampObstacle({ shape: 'box', color: '#FF8800' }).color, '#ff8800');
  assert.strictEqual(M.clampObstacle({ shape: 'box', color: 'red' }).color, undefined, 'only #rrggbb');
  assert.deepStrictEqual(W.linearColor('#ffffff'), [1, 1, 1]);
  assert.deepStrictEqual(W.linearColor('#808080'), [0.216, 0.216, 0.216]);
  assert.deepStrictEqual(W.linearColor(W.OBSTACLE_GREY), [0.451, 0.451, 0.451], 'the grey of before, as it is seen');
  const map = M.newMap(2, 1, 2026);
  M.setFloor(map, 1, 1, 'start');
  M.setObstacle(map, 3, 1, { shape: 'cylinder', w: 4, h: 5, color: '#ff0000' });
  let world = quietly(() => M.world(map));
  const part = world.slice(world.indexOf('DEF OBSTACLE0'));
  assert.match(part, /diffuseColor 1 0 0/);
  assert.match(part, /recognitionColors \[\s*1 0 0\s*\]/);
  M.setObstacle(map, 3, 1, { shape: 'cylinder', w: 4, h: 5 });
  world = quietly(() => M.world(map));
  assert.match(world.slice(world.indexOf('DEF OBSTACLE0')), /diffuseColor 0\.45 0\.45 0\.45/);
});

test('resizing keeps what fits and moves the outer walls', () => {
  const map = M.newMap(3, 3, 2026);
  M.setFloor(map, 5, 5, 'start');
  M.setWalls(map, ['v,2,1', 'v,2,0'], true);
  M.resize(map, 2, 3);
  assert.deepStrictEqual(map.startTile, { x: 0, y: 0, z: 0 });   // the start tile was cut off
  assert.ok(wall(map, 2, 1), 'inner wall kept');
  assert.ok(wall(map, 4, 1), 'new outer wall');
  assert.ok(!map.cells['5,1,0'], 'cells outside are gone');
  M.resize(map, 4, 3);
  assert.ok(!wall(map, 4, 1), 'the old outer wall goes when the map grows');
  assert.ok(wall(map, 8, 1));
});

test('rooms get walls on their borders, and lose them when the border goes', () => {
  const map = M.newMap(4, 2, 2026);
  let borders = new Set<string>();
  borders = paint(map, 2, [[2, 0], [3, 0], [2, 1], [3, 1]], borders);
  assert.ok(wall(map, 4, 1) && wall(map, 4, 3), 'room 1 | room 2 border walled');
  assert.ok(map.cells['5,1,0'].tile.halfTile === 1);
  borders = paint(map, 1, [[2, 1]], borders);
  assert.ok(!wall(map, 4, 3), 'no border there any more');
  assert.ok(wall(map, 5, 2) && wall(map, 6, 3), 'new borders of the room 1 tile');
});

test('a passage opens the border wall and the rooms connect', () => {
  const map = M.newMap(4, 2, 2026);
  M.setFloor(map, 1, 1, 'start');
  let borders = paint(map, 2, [[2, 0], [3, 0], [2, 1], [3, 1]], new Set());
  assert.ok(M.problems(map).some((p) => p.key === 'conn.notConnected'));
  assert.ok(M.togglePassage(map, 4, 1));
  borders = M.syncBorderWalls(map, borders);
  assert.strictEqual(map.cells['3,1,0'].tile.color, '#1a1ae6', 'room 1 side takes the blue');
  assert.ok(!wall(map, 4, 1));
  assert.deepStrictEqual(M.problems(map), []);
  assert.ok(W.connectionStatus(map).ok);
  M.togglePassage(map, 4, 1);
  M.syncBorderWalls(map, borders);
  assert.ok(wall(map, 4, 1), 'closed again');
  assert.ok(!M.togglePassage(map, 2, 1), 'no border between two room 1 tiles');
});

test('room 1 takes whole tile edges, rooms 2 and 3 the 6 cm grid, room 4 nothing inside', () => {
  const map = M.newMap(4, 1, 2026);
  paint(map, 2, [[1, 0]], new Set());
  paint(map, 4, [[2, 0], [3, 0]], new Set());
  // room 1 tile 0: an inner segment is refused; its edge to room 2 goes in whole
  assert.deepStrictEqual(M.wallPlan(map, ['v,1,0']), { ok: [], bad: ['v,1,0'] });
  assert.deepStrictEqual(M.wallPlan(map, ['v,2,0']).ok.sort(), ['v,2,0', 'v,2,1']);
  assert.deepStrictEqual(M.wallPlan(map, ['v,3,0']).ok, ['v,3,0']);       // inside room 2
  assert.deepStrictEqual(M.wallPlan(map, ['v,7,0']).bad, ['v,7,0']);      // inside room 4
});

test('walls go in and out, but the outer walls stay', () => {
  const map = M.newMap(2, 2, 2026);
  assert.strictEqual(M.setWalls(map, ['v,2,0', 'v,2,1'], true), 2);
  assert.ok(wall(map, 2, 1));
  assert.strictEqual(M.segNear(map, 12.5, 4, 1.5), 'v,2,0');
  assert.strictEqual(M.setWalls(map, ['v,0,0'], false), 0);
  assert.ok(wall(map, 0, 1));
  M.setWalls(map, ['v,2,0'], false);
  assert.strictEqual(map.cells['2,1,0'].halfWall, 1);
});

test('a tile leaving rooms 2 / 3 loses inner walls, half walls and curves', () => {
  const map = M.newMap(2, 1, 2026);
  paint(map, 3, [[0, 0], [1, 0]], new Set());
  M.setWalls(map, ['h,1,1', 'v,2,1'], true);
  L.setArc(map, 1, 1, 0, 1);
  paint(map, 1, [[0, 0]], new Set());
  const t = map.cells['1,1,0'].tile;
  assert.deepStrictEqual(t.halfWallIn, [0, 0, 0, 0]);
  assert.deepStrictEqual(t.curve, [0, 0, 0, 0]);
  assert.strictEqual(map.cells['2,1,0'].halfWall, 0);
});

test('floors and the start tile', () => {
  const map = M.newMap(2, 1, 2026);
  M.setFloor(map, 1, 1, 'swamp');
  M.setFloor(map, 1, 1, 'black');
  assert.deepStrictEqual([map.cells['1,1,0'].tile.swamp, map.cells['1,1,0'].tile.black], [false, true]);
  M.setFloor(map, 1, 1, 'black');
  assert.strictEqual(map.cells['1,1,0'].tile.black, false);
  M.setFloor(map, 3, 1, 'start');
  assert.deepStrictEqual(map.startTile, { x: 3, y: 1, z: 0 });
});

test('victims go on walls, one per tile; a victim whose wall goes is reported', () => {
  const map = M.newMap(2, 2, 2026);
  M.setFloor(map, 1, 1, 'start');
  assert.deepStrictEqual(M.victimRule(map, 1, 1, 'right'), { ok: false, reason: 'noWall' });
  assert.ok(M.setVictim(map, 1, 1, 'top', 'H', false));
  assert.ok(M.setVictim(map, 1, 1, 'left', 'S', true));
  assert.deepStrictEqual(M.edgeVictim(map, 1, 1), { dir: 'left', type: 'S', code: '', fake: true });
  M.setWalls(map, ['v,2,2', 'v,2,3'], true);
  assert.ok(M.setVictim(map, 1, 3, 'right', 'U', false));
  M.setWalls(map, ['v,2,2'], false);
  assert.deepStrictEqual(M.problems(map).map((p) => p.key), ['victimNoWall', 'wallRule']);
  assert.ok(M.clearVictim(map, 1, 3));
  paint(map, 2, [[1, 1]], new Set());
  assert.strictEqual(M.victimRule(map, 3, 3, 'bottom').reason, 'quarterTile');
});

test('a room 4 preset (from a classic map) borders get no walls, and the editor asks to switch it', () => {
  const map = M.newMap(9, 7, 2026);
  M.setFloor(map, 1, 13, 'start');
  map.area4Room = W.area4Presets()[2];
  const tiles = [];
  for (let x = 1; x <= 7; x++) for (let y = 1; y <= 5; y++) tiles.push([x, y]);
  paint(map, 4, tiles, new Set());
  assert.ok(!wall(map, 2, 3), 'no wall on the room 4 border');
  assert.ok(M.problems(map).some((p) => p.key === 'presetNotSupported' && p.block));
});

test('room 4 is custom as soon as it has tiles, and none without', () => {
  const map = M.newMap(3, 1, 2026);
  let borders = paint(map, 4, [[1, 0]], new Set());
  assert.strictEqual(map.area4Room.type, 1);
  assert.ok(M.problems(map).some((p) => p.key === 'customRoom4NoPicture'));
  borders = paint(map, 1, [[1, 0]], borders);
  assert.strictEqual(map.area4Room.type, 0);
  assert.ok(!M.problems(map).some((p) => p.key === 'customRoom4NoPicture'));
});

test('the saved map and the world export work as in the classic editor', () => {
  const map = M.newMap(3, 2, 2026);
  M.setFloor(map, 1, 1, 'start');
  M.setWalls(map, ['v,2,0', 'v,2,1'], true);
  M.setVictim(map, 1, 1, 'right', 'H', false);
  M.setFloor(map, 5, 3, 'checkpoint');
  const saved = M.saved(map);
  assert.deepStrictEqual(Object.keys(saved), ['name', 'length', 'height', 'width', 'finished', 'startTile', 'cells', 'roomTiles', 'time', 'area4Room', 'room4CanvasSave', 'room4VicTypes', 'room4Tokens', 'connCheckOff', 'rules']);
  // the year of its rules (the classic editor leaves a field it does not know alone)
  assert.strictEqual(saved.rules, 2026);
  const world = quietly(() => M.world(map));
  assert.ok(world.startsWith('#VRML_SIM'));
  assert.ok(/Victim|victim/.test(world));
  assert.ok(!map.cells['1,1,0'].reachable, 'the map itself is left as it was');
});

test('curves go into room 3 quarters only, nearest to the pointer, and the eraser finds them', () => {
  const map = M.newMap(2, 1, 2026);
  paint(map, 3, [[0, 0]], new Set());
  paint(map, 2, [[1, 0]], new Set());
  // a point near the NE-bulging arc of the NW quarter of tile 0 (centre at its SW corner (0, 6))
  const c = M.arcChoice(map, 4.5, 1.5);
  assert.deepStrictEqual([c.x, c.y, c.q, c.v, c.rule.ok], [1, 1, 0, 1, true]);
  assert.ok(M.setCurve(map, 1, 1, 0, 1));
  assert.deepStrictEqual(map.cells['1,1,0'].tile.curve, [1, 0, 0, 0]);
  assert.deepStrictEqual(M.arcNear(map, 4.5, 1.6, 1), { x: 1, y: 1, q: 0, v: 1 });
  assert.strictEqual(M.arcChoice(map, 16, 2).rule.reason, 'curveRoom3');
  assert.ok(!M.setCurve(map, 3, 1, 0, 1), 'room 2 takes no curve');
  assert.ok(M.setCurve(map, 1, 1, 0, 0));
  assert.strictEqual(M.arcNear(map, 4.5, 1.6, 1), null);
});

test('rooms 2 and 3 take victims on their 6 cm walls (16 places per tile)', () => {
  const map = M.newMap(2, 1, 2026);
  M.setFloor(map, 1, 1, 'start');
  paint(map, 2, [[1, 0]], new Set());
  // tile (3, 1): its NE quarter's top is on the outer wall, its NW quarter's right side on nothing yet
  assert.deepStrictEqual(M.slotAt(map, 21, 1), { x: 3, y: 1, i: 4 });
  assert.ok(M.slotHasWall(map, 3, 1, 4));
  assert.deepStrictEqual(M.slotRule(map, 3, 1, 1), { ok: false, reason: 'noWall' });
  M.setWalls(map, ['v,3,0'], true);                  // inner wall up from the centre
  assert.ok(M.slotHasWall(map, 3, 1, 1) && M.slotHasWall(map, 3, 1, 7));
  assert.ok(M.setSlotVictim(map, 3, 1, 4, 'S', true));
  assert.ok(M.setSlotVictim(map, 3, 1, 1, 'H', false));
  assert.deepStrictEqual(M.slotVictim(map, 3, 1, 4), { type: 'S', value: '3', code: '', fake: true });
  assert.deepStrictEqual(M.slotRule(map, 1, 1, 0), { ok: false, reason: 'notQuarterTile' });
  M.setWalls(map, ['v,3,0'], false);
  assert.ok(M.problems(map).some((p) => p.key === 'victimNoWall'));
  assert.ok(M.clearSlotVictim(map, 3, 1, 1));
  assert.ok(!M.problems(map).some((p) => p.key === 'victimNoWall'));
  // the export takes them
  const world = quietly(() => M.world(map));
  assert.ok(world.length > 0);
  // and they go when the tile leaves room 2
  paint(map, 1, [[1, 0]], new Set());
  assert.strictEqual(M.slotVictim(map, 3, 1, 4), null);
});

test('a custom room 4 needs its picture, and a checkpoint behind each passage', () => {
  const map = M.newMap(4, 3, 2026);
  M.setFloor(map, 1, 5, 'start');
  let borders = paint(map, 4, [[2, 0], [3, 0], [2, 1], [3, 1]], new Set());
  map.area4Room = W.area4Presets()[1];
  M.togglePassage(map, 4, 3);                       // room 1 tile (1, 1) | room 4 tile (2, 1)
  borders = M.syncBorderWalls(map, borders);
  const keys = () => M.problems(map).map((p) => p.key);
  // rule 3.5.3: the room 4 tile behind the passage became a checkpoint by itself
  assert.ok(map.cells['5,3,0'].tile.checkpoint && map.cells['5,3,0'].tile.cpAuto);
  assert.deepStrictEqual(keys(), ['customRoom4NoPicture']);
  // taken off by hand: an error that stops the export
  M.setFloor(map, 5, 3, 'checkpoint');
  const cp = M.problems(map).find((p) => p.key === 'room4Checkpoint');
  assert.ok(cp && cp.block);
  assert.deepStrictEqual(cp.at, [30, 18]);
  map.room4CanvasSave = 'data:image/png;base64,';
  // the passage closed: a checkpoint the editor set goes, one set by hand stays
  borders = M.syncBorderWalls(map, borders);                 // put back by itself
  assert.ok(map.cells['5,3,0'].tile.checkpoint);
  assert.deepStrictEqual(keys(), []);
  M.togglePassage(map, 4, 3);
  borders = M.syncBorderWalls(map, borders);
  assert.ok(!map.cells['5,3,0'].tile.checkpoint, 'no passage, no checkpoint');
  M.setFloor(map, 5, 1, 'checkpoint');
  M.togglePassage(map, 4, 1);
  borders = M.syncBorderWalls(map, borders);
  M.togglePassage(map, 4, 1);
  borders = M.syncBorderWalls(map, borders);
  assert.ok(map.cells['5,1,0'].tile.checkpoint, 'set by hand: stays');
});

for (const name of ['mapA', 'mapB', 'mapC']) {
  test(`${name}: a classic map opened and saved in the editor exports the same world`, () => {
    const orig = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'maps2026', `${name}.json`), 'utf8'));
    const random = Math.random;
    const seeded = () => {
      let a = 7;
      Math.random = function () {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      };
    };
    (globalThis as any).DISABLE_RANDOMNESS = true;
    try {
      seeded();
      const before = quietly(() => M.world(JSON.parse(JSON.stringify(orig))));
      const saved = JSON.parse(JSON.stringify(M.saved(M.normalize(JSON.parse(JSON.stringify(orig))))));
      seeded();
      assert.strictEqual(quietly(() => M.world(saved)), before);
    } finally {
      Math.random = random;
      delete (globalThis as any).DISABLE_RANDOMNESS;
    }
  });
}

test('cognitive targets keep their ring code (and the letter of a valid one), with their turn', () => {
  const map = M.newMap(2, 1, 2026);
  M.setFloor(map, 1, 1, 'start');
  assert.ok(M.setVictim(map, 1, 1, 'top', 'CT', false, { code: 'GYYKG', rot: 90 }));   // 1 + 0 + 0 - 2 + 1 = 0: F
  const t = map.cells['1,1,0'].tile;
  assert.deepStrictEqual([t.cognitives, t.victims], [{ top_code: 'GYYKG' }, { top: 'F' }]);
  assert.strictEqual(t.single_victim_rotation, 90);
  assert.deepStrictEqual(M.edgeVictim(map, 1, 1), { dir: 'top', type: 'CT', code: 'GYYKG', fake: false });
  paint(map, 2, [[1, 0]], new Set());
  assert.ok(M.setSlotVictim(map, 3, 1, 4, 'CT', false, { code: 'BBBBB', rot: 30 }));    // sum 10: fake
  const u = map.cells['3,1,0'].tile;
  assert.deepStrictEqual([u.halfWallCognitives[4], u.halfWallVic[4], u.halfWallVicRots[4]], ['BBBBB', null, 30]);
  assert.ok(M.setSlotVictim(map, 3, 1, 4, 'CT', false, { code: 'GGYYY' }));             // sum 2: C
  assert.strictEqual(u.halfWallVic[4], 7);
  const world = quietly(() => M.world(map));
  assert.ok(world.includes('GYYKG') && world.includes('GGYYY'));
});

test('a placed victim can be looked at, changed and removed', () => {
  const map = M.newMap(2, 1, 2026);
  M.setVictim(map, 1, 1, 'top', 'H', false, { rot: 45 });
  const where: M.Where = { kind: 'edge', x: 1, y: 1, dir: 'top' };
  assert.deepStrictEqual(M.victimAt(map, where), { dir: 'top', type: 'H', code: '', fake: false, rot: 45 });
  assert.strictEqual(M.victimAt(map, { kind: 'edge', x: 1, y: 1, dir: 'left' } as M.Where), null);
  M.changeVictim(map, where, { type: 'U', fake: true, rot: -90 });
  assert.deepStrictEqual(M.victimAt(map, where), { dir: 'top', type: 'U', code: '', fake: true, rot: 270 });
  paint(map, 3, [[1, 0]], new Set());
  M.setSlotVictim(map, 3, 1, 4, 'CT', false, { code: 'GYYKG', rot: 10 });
  const slot: M.Where = { kind: 'slot', x: 3, y: 1, i: 4 };
  M.changeVictim(map, slot, { rot: 20 });                        // a cognitive target keeps its code
  assert.deepStrictEqual(M.victimAt(map, slot), { type: 'CT', value: 5, code: 'GYYKG', fake: false, rot: 20 });
  // a target made a letter victim and back, where it is (its place along the wall kept)
  M.changeVictim(map, slot, { type: 'H', fake: true });
  assert.deepStrictEqual([M.victimAt(map, slot)!.type, M.victimAt(map, slot)!.fake], ['H', true]);
  assert.ok(M.moveVictim(map, slot, 1.5));
  M.changeVictim(map, slot, { fake: false, rot: 90 });
  assert.strictEqual(M.victimOffset(map, slot), 1.5);
  M.changeVictim(map, slot, { type: 'CT', code: 'BBRRY' });
  assert.deepStrictEqual([M.victimAt(map, slot)!.type, M.victimAt(map, slot)!.code, M.victimAt(map, slot)!.fake], ['CT', 'BBRRY', false]);
  assert.ok(M.removeVictim(map, slot));
  assert.strictEqual(M.victimAt(map, slot), null);
});

test('tiles outside the map shape get outer walls round them and take nothing', () => {
  const map = M.newMap(3, 2, 2026);
  let borders = M.borderEdges(map);
  borders = paint(map, 0, [[2, 0]], borders);                 // top right corner out
  assert.ok(M.isOutside(map, 5, 1));
  assert.ok(!wall(map, 5, 0) && !wall(map, 6, 1), 'no walls round the outside tile on the rectangle');
  assert.ok(wall(map, 4, 1) && wall(map, 5, 2), 'walls between it and the map');
  assert.ok(M.isOuterEdge(map, 4, 1) && !M.isOuterEdge(map, 6, 1));
  assert.strictEqual(M.setWalls(map, ['v,4,0'], false), 0, 'outer walls stay');
  assert.ok(!M.setFloor(map, 5, 1, 'checkpoint'));
  assert.strictEqual(M.roomOf(map, 5, 1), 0);
  assert.deepStrictEqual(M.wallPlan(map, ['v,5,0']).bad, ['v,5,0']);
  // back into the map: the rectangle closes again
  borders = paint(map, 1, [[2, 0]], borders);
  assert.ok(wall(map, 5, 0) && wall(map, 6, 1) && !wall(map, 4, 1));
  // resizing keeps the outside tile out and walls the new border
  paint(map, 0, [[0, 1]], borders);
  M.resize(map, 4, 2);
  assert.ok(M.isOutside(map, 1, 3) && wall(map, 8, 1) && !wall(map, 6, 1));
  // the world has no floor there
  M.setFloor(map, 3, 1, 'start');
  const world = quietly(() => M.world(map));
  assert.ok(world.length > 0);
});

test('a passage goes on the side asked for, moves, closes, and goes by itself when it no longer fits', () => {
  const map = M.newMap(3, 1, 2026);
  let borders = paint(map, 2, [[1, 0], [2, 0]], new Set());
  assert.strictEqual(M.togglePassage(map, 2, 1, [3, 1]), 'open');      // on the room 2 side
  borders = M.syncBorderWalls(map, borders);
  assert.strictEqual(map.cells['3,1,0'].tile.color, '#1a1ae6');
  assert.ok(!wall(map, 2, 1));
  assert.strictEqual(M.togglePassage(map, 2, 1, [1, 1]), 'moved');     // to the room 1 side
  assert.deepStrictEqual([map.cells['1,1,0'].tile.color, map.cells['3,1,0'].tile.color], ['#1a1ae6', '']);
  assert.strictEqual(M.togglePassage(map, 2, 1, [1, 1]), 'closed');
  M.togglePassage(map, 2, 1);
  borders = M.syncBorderWalls(map, borders);
  assert.ok(M.clearPassage(map, 1, 1));
  borders = M.syncBorderWalls(map, borders);
  assert.ok(wall(map, 2, 1), 'closed again');
  // a passage left behind when its rooms change loses its colour
  M.togglePassage(map, 2, 1, [3, 1]);
  borders = M.syncBorderWalls(map, borders);
  borders = paint(map, 3, [[1, 0]], borders);                        // tile (3, 1) is room 3 now
  assert.strictEqual(map.cells['3,1,0'].tile.color, '', 'no longer between rooms 1 and 2');
  assert.ok(wall(map, 2, 1), 'the room 1 | room 3 border is walled');
});

test('a passage into room 4 (preset or picture) stays on the other side', () => {
  const map = M.newMap(3, 1, 2026);
  map.area4Room = W.area4Presets()[2];
  paint(map, 4, [[1, 0], [2, 0]], new Set());
  M.togglePassage(map, 2, 1, [3, 1]);
  assert.deepStrictEqual([map.cells['1,1,0'].tile.color, map.cells['3,1,0'].tile.color || ''], ['#08D508', '']);
  map.area4Room = W.area4Presets()[1];
  M.togglePassage(map, 2, 1, [3, 1]);
  assert.strictEqual(map.cells['1,1,0'].tile.color, '', 'closed: it was on that side already');
  M.togglePassage(map, 2, 1, [3, 1]);
  assert.strictEqual(map.cells['1,1,0'].tile.color, '#08D508');
});

test('a region is copied with its tiles, rooms, victims and walls, and pasted elsewhere', () => {
  const map = M.newMap(5, 3, 2026);
  let borders = M.borderEdges(map);
  borders = paint(map, 2, [[0, 0], [1, 0]], borders);
  M.setWalls(map, ['h,1,1'], true);                               // inner wall in tile (1, 1)
  M.setSlotVictim(map, 1, 1, 0, 'H', false, { rot: 30 });         // on the outer wall
  M.setFloor(map, 3, 3, 'checkpoint');
  const clip = M.copyRegion(map, { x0: 0, y0: 0, x1: 1, y1: 1 });
  assert.deepStrictEqual([clip.w, clip.h, clip.rooms['1,1'], clip.rooms['3,3']], [2, 2, 2, 1]);
  M.pasteRegion(map, clip, 3, 1);
  borders = M.resyncBorderWalls(map, borders);
  assert.strictEqual(M.roomOf(map, 7, 3), 2);
  assert.deepStrictEqual(map.cells['7,3,0'].tile.halfWallIn, [0, 1, 0, 0]);
  assert.strictEqual(map.cells['7,3,0'].tile.halfWallVic[0], '1');
  assert.ok(map.cells['9,5,0'].tile.checkpoint);
  assert.ok(wall(map, 10, 3) && wall(map, 10, 5), 'the outer wall is back on the right');
  // moving = clearing the source, then pasting
  M.clearRegion(map, { x0: 0, y0: 0, x1: 1, y1: 1 });
  borders = M.resyncBorderWalls(map, borders);
  assert.strictEqual(M.roomOf(map, 1, 1), 1);
  assert.ok(wall(map, 0, 1) && wall(map, 1, 0), 'outer walls stay');
  assert.ok(!map.cells['3,3,0'].tile.checkpoint);
});

test('rows and columns go in and out between the others, with everything after them moving along', () => {
  const map = M.newMap(3, 2, 2026);
  let borders = M.borderEdges(map);
  borders = paint(map, 2, [[1, 0], [2, 0]], borders);
  M.setFloor(map, 5, 3, 'start');
  M.setFloor(map, 5, 1, 'checkpoint');
  // a column after the first one (edge line x = 2)
  assert.ok(M.insertLine(map, 'x', 2));
  borders = M.resyncBorderWalls(map, borders);
  assert.strictEqual(map.width, 4);
  assert.deepStrictEqual(map.startTile, { x: 7, y: 3, z: 0 });
  assert.ok(map.cells['7,1,0'].tile.checkpoint);
  assert.strictEqual(M.roomOf(map, 3, 1), 1, 'between room 1 and room 2 the new tile stays room 1');
  assert.ok(wall(map, 4, 1), 'room 1 | room 2 border moved along');
  assert.ok(wall(map, 8, 1) && wall(map, 3, 0) && wall(map, 3, 4), 'outer walls round the new column');
  // a column inside room 2 joins it
  M.insertLine(map, 'x', 6);
  assert.strictEqual(M.roomOf(map, 7, 1), 2);
  // and out again
  assert.ok(M.removeLine(map, 'x', 7));
  assert.ok(M.removeLine(map, 'x', 3));
  borders = M.resyncBorderWalls(map, borders);
  assert.strictEqual(map.width, 3);
  assert.deepStrictEqual(map.startTile, { x: 5, y: 3, z: 0 });
  assert.ok(map.cells['5,1,0'].tile.checkpoint);
  assert.ok(wall(map, 6, 1) && wall(map, 2, 1));
  // a row before the first one
  M.insertLine(map, 'y', 0);
  assert.strictEqual(map.length, 3);
  assert.deepStrictEqual(map.startTile, { x: 5, y: 5, z: 0 });
});

test('each problem says everything it is about, to point out on the map', () => {
  const map = M.newMap(4, 2, 2026);
  M.setFloor(map, 1, 3, 'start');
  paint(map, 2, [[2, 0], [3, 0]], new Set());                  // room 2, not reached
  M.setWalls(map, ['v,2,2', 'v,2,3'], true);
  M.setVictim(map, 1, 3, 'right', 'H', false);
  M.setWalls(map, ['v,2,3'], false);                           // half of it gone: a half wall in room 1, a floating victim
  const by = (k: string) => M.problems(map).find((p) => p.key === k);
  assert.deepStrictEqual(by('conn.notConnected').show.tiles.sort(), [[2, 0], [3, 0]]);
  assert.deepStrictEqual(by('victimNoWall').show.points, [[10, 18]]);
  assert.deepStrictEqual(by('wallRule').show.segs, ['v,2,2']);
});

test('the problems that can be fixed are fixed: start, passages, gaps, victims, walls, room 4 checkpoints', () => {
  const map = M.newMap(6, 3, 2026);
  let borders = M.borderEdges(map);
  borders = paint(map, 2, [[2, 0], [3, 0], [2, 1], [3, 1]], borders);        // room 2, closed off
  borders = paint(map, 3, [[4, 0], [5, 0], [4, 1], [5, 1]], borders);        // room 3, behind room 2
  M.setWalls(map, ['v,2,4', 'v,2,5'], true);
  M.setVictim(map, 1, 5, 'right', 'H', false);
  M.setWalls(map, ['v,2,5'], false);                                         // a half wall in room 1, a victim without wall
  const keys = () => M.problems(map).map((p) => p.key).sort();
  assert.deepStrictEqual(keys(), ['conn.notConnected', 'conn.notConnected', 'noStart', 'victimNoWall', 'wallRule'].sort());
  borders = M.fixAll(map, borders);
  assert.deepStrictEqual(keys(), []);
  assert.ok(W.connectionStatus(map).ok);
  assert.ok(map.startTile.x > 0);
  assert.ok(wall(map, 2, 5), 'the half wall became a whole one');
  assert.ok(M.edgeVictim(map, 1, 5), 'its victim has its wall again, so it stays');
});

test('a gap between rooms gets its border wall back, and a custom room 4 picture cannot be made', () => {
  const map = M.newMap(4, 1, 2026);
  M.setFloor(map, 1, 1, 'start');
  let borders = paint(map, 2, [[2, 0], [3, 0]], new Set());
  M.togglePassage(map, 4, 1);
  borders = M.syncBorderWalls(map, borders);
  L.setSeg(map, 'v,6,0', false); L.setSeg(map, 'v,6,1', false);           // no border inside room 2: fine
  map.cells['4,1,0'].isWall = false;
  M.togglePassage(map, 4, 1);                                              // passage gone, the wall not back
  map.cells['4,1,0'].isWall = false;
  const gap = M.problems(map).find((p) => p.key === 'conn.unmarkedGap');
  assert.ok(gap);
  borders = M.fixProblem(map, gap, borders);
  assert.ok(wall(map, 4, 1));
  paint(map, 4, [[3, 0]], borders);
  const pic = M.problems(map).find((p) => p.key === 'customRoom4NoPicture');
  assert.strictEqual(M.fixProblem(map, pic, borders), null);
});

test('no victims in a passage between areas (rule 3.7.2): refused there, pointed out when a passage comes', () => {
  const map = M.newMap(4, 2, 2026);
  M.setFloor(map, 1, 1, 'start');
  let borders = paint(map, 2, [[2, 0], [3, 0], [2, 1], [3, 1]], new Set());
  assert.ok(M.setVictim(map, 3, 1, 'top', 'H', false), 'not a passage yet');
  assert.ok(M.togglePassage(map, 4, 1));
  borders = M.syncBorderWalls(map, borders);
  assert.deepStrictEqual(M.victimRule(map, 3, 1, 'top'), { ok: false, reason: 'passage' });
  const p = M.problems(map).find((q) => q.key === 'victimInPassage')!;
  assert.ok(p && p.block);
  assert.ok(M.FIXABLE.indexOf('victimInPassage') > -1);
  M.fixProblem(map, p, borders);
  assert.ok(!M.edgeVictim(map, 3, 1), 'taken out by the fix');
  assert.ok(!M.setVictim(map, 3, 1, 'top', 'H', false));
});

test('a world with a value that is not a number is not given out (Webots would open it empty)', () => {
  const map = M.newMap(2, 1, 2026);
  map.startTile = { x: 1, y: 1, z: 0 };
  assert.ok(M.setVictim(map, 3, 1, 'top', 'H', false));
  (map.cells['3,1,0'].tile as any).single_victim_rotation = 'x';    // a turn that is not a number
  (globalThis as any).DISABLE_RANDOMNESS = true;
  const log = console.log;
  console.log = () => {};
  try {
    assert.throws(() => M.world(map), (e: any) => e instanceof M.BrokenWorld && /NaN/.test(e.line));
    (map.cells['3,1,0'].tile as any).single_victim_rotation = 90;
    assert.ok(!/NaN|undefined|Infinity/.test(M.world(map)));
  } finally { console.log = log; delete (globalThis as any).DISABLE_RANDOMNESS; }
});
