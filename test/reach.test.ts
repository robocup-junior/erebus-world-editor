// Where the robot can go in the new Simulation 2026 editor (src/lib/model.js)
import { test } from 'vitest';
import assert from 'node:assert';
import type { MapData } from '../src/lib/types';
import * as M from '../src/lib/model';
import * as L from '../src/lib/lattice';

// a 3 x 3 map, all room 2, start at the bottom left tile
function room2() {
  const map = M.newMap(3, 3, 2026);
  for (let x = 1; x <= 5; x += 2) for (let y = 1; y <= 5; y += 2) M.setRoom(map, x, y, 2);
  map.startTile = { x: 1, y: 5, z: 0 };
  return map;
}
// two walls down from the top, at x cm a and b (to 24 cm down)
function channel(map: MapData, a: number, b: number) {
  for (let j = 0; j < 4; j++) { L.setSeg(map, `v,${a / 6},${j}`, true); L.setSeg(map, `v,${b / 6},${j}`, true); }
  return map;
}

test('without a start tile nothing is worked out', () => {
  const map = M.newMap(2, 2, 2026);
  assert.strictEqual(M.robotReach(map), null);
});

test('an open map has no places the robot cannot get into', () => {
  const r = M.robotReach(room2());
  assert.strictEqual(r.pocketCount, 0);
  assert.deepStrictEqual(r.victims, []);
});

test('a 6 cm wide channel stops the robot, a 12 cm one does not', () => {
  let r = M.robotReach(channel(room2(), 12, 18));
  assert.strictEqual(r.pocketCount, 1);
  assert.ok(r.pocketAt(15, 3) && r.pocketAt(15, 15), 'the 6 cm channel is out of reach');
  assert.ok(!r.pocketAt(6, 6) && !r.pocketAt(28, 6), 'beside it is not');
  r = M.robotReach(channel(room2(), 12, 24));
  assert.strictEqual(r.pocketCount, 0);
});

test('a victim on a wall of a narrow channel is pointed out, and stops the export (rule 3.2.4)', () => {
  const map = channel(room2(), 12, 18);
  // tile x 3 (12-24 cm), NW quarter, its left side: the wall at x 12 seen from inside the channel
  assert.ok(M.setSlotVictim(map, 3, 1, 0 * 4 + 3, 'H', false));
  const p = M.problems(map).find((x) => x.key === 'victimUnreachable');
  assert.ok(p, 'pointed out');
  assert.strictEqual(p.params.count, 1);
  assert.ok(p.block);
  // the same victim in a 12 cm channel is fine
  const wide = channel(room2(), 12, 24);
  assert.ok(M.setSlotVictim(wide, 3, 1, 0 * 4 + 3, 'H', false));
  assert.ok(!M.problems(wide).some((x) => x.key === 'victimUnreachable'));
});

test('a room not got into at all (no passage yet) is left out', () => {
  const map = room2();
  // room 1 on the left column; rooms 1 and 2 then have a wall between them and no passage
  for (let y = 1; y <= 5; y += 2) M.setRoom(map, 1, y, 1);
  M.syncBorderWalls(map, new Set());
  const r = M.robotReach(map);
  assert.strictEqual(r.pocketCount, 0);
});

test('the corner a curve closes off is under 5 cm2: left out as a speck, as in the room 4 creator', () => {
  const one = M.newMap(2, 2, 2026);
  for (let x = 1; x <= 3; x += 2) for (let y = 1; y <= 3; y += 2) M.setRoom(one, x, y, 3);
  one.startTile = { x: 1, y: 3, z: 0 };
  L.setArc(one, 3, 1, 1, 1);   // NE quarter of the top right tile, bulging into the map's NE corner
  assert.strictEqual(M.robotReach(one).pocketCount, 0);
});

test('a free-standing curve leaves no specks behind it', () => {
  const one = M.newMap(3, 3, 2026);
  for (let x = 1; x <= 5; x += 2) for (let y = 1; y <= 5; y += 2) M.setRoom(one, x, y, 3);
  one.startTile = { x: 1, y: 5, z: 0 };
  L.setArc(one, 3, 3, 0, 4);
  assert.strictEqual(M.robotReach(one).pocketCount, 0);
});

test('a victim inside a narrow channel near its mouth is pointed out, one outside it is not', () => {
  // the outer face of the channel wall (x 12 seen from the left, from open floor) is fine
  const open = channel(room2(), 12, 18);
  assert.ok(M.setSlotVictim(open, 1, 1, 1 * 4 + 1, 'H', false));
  assert.deepStrictEqual(M.robotReach(open).victims, []);
  // inside the channel, 6-12 cm from its mouth (y 24): the wall at x 12, NW quarter of tile (3, 3)
  const inside = channel(room2(), 12, 18);
  assert.ok(M.setSlotVictim(inside, 3, 3, 0 * 4 + 3, 'H', false));
  assert.strictEqual(M.robotReach(inside).victims.length, 1);
});

test('gotTo: whether a victim would be got to there, before it is put (the victim tool\'s red cursor)', () => {
  const map = channel(room2(), 12, 18);
  const r = M.robotReach(map)!;
  const at = (x: number, y: number, i: number) => { const p = M.victimPlace(map, { kind: 'slot', x, y, i }); return r.gotTo(x, y, p.at, p.wall); };
  assert.ok(at(1, 1, 1 * 4 + 1), 'the outer face of the channel wall');
  assert.ok(!at(3, 3, 0 * 4 + 3), 'inside the channel');
});

test('a hole is no floor - the whole tile, as in Erebus: the robot\'s centre keeps off it, and the victims behind it are out of reach', () => {
  const map = M.newMap(3, 1, 2026);
  map.startTile = { x: 1, y: 1, z: 0 };
  assert.ok(M.setVictim(map, 5, 1, 'right', 'H', false));
  assert.deepStrictEqual(M.robotReach(map)!.victims, []);
  M.setFloor(map, 3, 1, 'black');
  const r = M.robotReach(map)!;
  assert.strictEqual(r.victims.length, 1, 'the corridor is cut by the hole');
  // the hole itself is not pointed out as floor out of reach
  assert.ok(!r.pocketAt(18, 6));
});
