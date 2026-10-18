// The most a map can score (src/rules/parts/scoring/v1.ts), by rule 5.6 of the 2026 rules
import { test } from 'vitest';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import * as M from '../src/lib/model';
import * as Score from '../src/rules/parts/scoring/v1';
import type { MapData } from '../src/lib/types';

const load = (name: string): MapData => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'sim2026', `${name}.json`), 'utf8'));

test('mapA: each area times its multiplier, the bonuses on top', () => {
  const s = Score.maxScore(load('mapA'), null);
  // room 1: a victim on a linear tile (5 + 10), a target on a linear tile (10 + 20), a checkpoint (10)
  // room 2: a victim on a 6 cm wall of a linear tile (5 + 10), a target on a floating tile (30 + 20)
  // room 3: a victim on a 6 cm wall of a floating tile (15 + 10); fakes score nothing
  assert.deepStrictEqual(s.areas.map((a) => a.points), [55, 65 * 1.25, 25 * 1.5, 0]);
  assert.deepStrictEqual(s.areas.map((a) => [a.victims, a.targets, a.checkpoints]), [[1, 1, 1], [1, 1, 0], [1, 0, 0], [0, 0, 0]]);
  assert.strictEqual(s.field, 173.75);
  assert.ok(Math.abs(s.withExit - 173.75 * 1.1) < 1e-9);
  assert.ok(Math.abs(s.withMap - 173.75 * 1.1 * 2.2) < 1e-9);
});

test('nothing to work out without a start tile', () => {
  const map = load('mapA');
  map.startTile = { x: 0, y: 0, z: 0 };
  assert.strictEqual(Score.maxScore(map, null), null);
});

// A 3 x 1 map: the start in room 1, a passage tile, room 4 on the right (one tile, its picture
// 120 px = 12 cm across)
function room4Map() {
  const map = M.newMap(3, 1);
  let borders = M.borderEdges(map);
  M.setRoom(map, 5, 1, 4);
  borders = M.syncBorderWalls(map, borders);
  M.togglePassage(map, 4, 1, [3, 1]);
  borders = M.syncBorderWalls(map, borders);
  M.setFloor(map, 1, 1, 'start');
  map.room4CanvasSave = 'picture';
  return { map, borders };
}
// a room 4 picture of the walls wall(x, y) (px) and the stamps given
function picture(wall: (x: number, y: number) => boolean, tokens: { fx: number; fy: number; type: number }[]) {
  const w = 120, h = 120, px = new Uint8ClampedArray(w * h * 4).fill(255);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (wall(x, y)) px.fill(0, (y * w + x) * 4, (y * w + x) * 4 + 3);
  const p = M.readRoom4Picture(px, w, h);
  p.tokens = tokens;
  return p;
}
// stamps against room 4's right wall (at 35 cm), along its middle (the robot does not get into corners)
const along = (types: number[]) => types.map((type, i) => ({ fx: 0.92, fy: 0.3 + 0.13 * i, type }));

test('room 4: the stamps of its picture by their types, fakes left out', () => {
  const { map } = room4Map();
  // a victim (0), a target (3), a fake target (7), a fake victim (9)
  const s = Score.maxScore(map, picture(() => false, along([0, 3, 7, 9])));
  const room4 = s.areas[3];
  assert.deepStrictEqual([room4.victims, room4.targets], [1, 1]);
  // the checkpoint set by itself behind the passage, and the stamps, times 2
  assert.strictEqual(room4.checkpoints, 1);
  assert.strictEqual(room4.points, 2 * (10 + (15 + 10) + (30 + 20)));
  assert.deepStrictEqual(M.problems(map, picture(() => false, along([0, 3, 7, 9]))).map((p) => p.key), []);
});

test('room 4: a stamp with no type, or one the robot cannot get near, is a problem and is left out', () => {
  const { map, borders } = room4Map();
  const untyped = picture(() => false, along([0, -1]));
  assert.strictEqual(Score.maxScore(map, untyped).untypedTokens, 1);
  assert.deepStrictEqual(M.problems(map, untyped).map((p) => [p.key, p.block]), [['room4Untyped', true]]);
  // a stamp shut in the top right corner by two walls (a 2 x 2.5 cm nook; the robot, 7.4 cm across,
  // still passes below it to the target on the right wall)
  const nook = (x: number, y: number) => (x >= 95 && x < 100 && y < 30) || (x >= 95 && y >= 25 && y < 30);
  const shut = picture(nook, [{ fx: 110 / 120, fy: 12 / 120, type: 0 }, { fx: 0.92, fy: 0.75, type: 3 }]);
  const s = Score.maxScore(map, shut);
  assert.strictEqual(s.unreachableTokens, 1);
  assert.deepStrictEqual([s.areas[3].victims, s.areas[3].targets], [0, 1]);
  const p = M.problems(map, shut).find((q) => q.key === 'room4Unreachable');
  assert.ok(p && p.block && p.params.count === 1);
  // a room 4 not joined: none of it counts
  M.togglePassage(map, 4, 1, [3, 1]);
  M.syncBorderWalls(map, borders);
  const cut = Score.maxScore(map, picture(() => false, along([0])));
  assert.strictEqual(cut.areas[3].points, 0);
  assert.strictEqual(cut.unreachableTokens, 1);
});

test('victims where the robot cannot get stop the export, and are taken off by the fix', () => {
  const map = load('mapA');
  // a victim in a 6 cm box of room 2 (walls all round its NW quarter tile): the robot does not fit in
  M.setWalls(map, ['h,10,2', 'v,10,2', 'h,10,3', 'v,11,2'], true);
  assert.ok(M.setSlotVictim(map, 11, 3, 0, 'H', false, { rot: 0 }));
  const p = M.problems(map).find((q) => q.key === 'victimUnreachable');
  assert.ok(p && p.block, 'blocks the export');
  M.fixProblem(map, p, M.borderEdges(map));
  assert.ok(!M.problems(map).some((q) => q.key === 'victimUnreachable'));
});

test('a room 4 preset is not counted', () => {
  const s = Score.maxScore(load('mapB'), null);
  if (s) { assert.ok(s.room4Preset); assert.strictEqual(s.areas[3].victims + s.areas[3].targets, 0); }
});
