// Where the robot can go (src/lib/model.ts)
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

test('a room the robot does not get into at all is out of reach too: one with no passage yet, or one past a passage it cannot get through', () => {
  const map = room2();
  // room 1 on the left column; rooms 1 and 2 then have a wall between them and no passage
  for (let y = 1; y <= 5; y += 2) M.setRoom(map, 1, y, 1);
  let borders = M.syncBorderWalls(map, new Set());
  let r = M.robotReach(map);
  assert.strictEqual(r.pocketCount, 1, 'room 2, all of it');
  assert.ok(r.pocketAt(24, 18) && !r.pocketAt(6, 18));
  // a passage into it, then an obstacle in front of the passage: out of reach again, its victims as well
  assert.strictEqual(M.togglePassage(map, 2, 3, [1, 3]), 'open');
  borders = M.syncBorderWalls(map, borders);
  // a victim on a 6 cm face of room 2's outer wall (room 2 takes them there)
  const slot = [...Array(16).keys()].find((i) => M.slotHasWall(map, 5, 3, i))!;
  assert.ok(M.setSlotVictim(map, 5, 3, slot, 'H', false, { rot: 0 }));
  assert.ok(!M.robotReach(map).pocketAt(24, 18), 'room 2 got into through the passage');
  M.setObstacle(map, 3, 3, { shape: 'box', w: 10, d: 10, h: 6 });     // on the room 2 tile past the passage
  r = M.robotReach(map);
  assert.ok(r.pocketAt(24, 18), 'room 2 past the blocked passage');
  assert.strictEqual(r.victims.length, 1, 'its victim cannot be got to');
});

test('the passage tool gets its way in on the side the robot comes from, not one that shuts it off from the start', () => {
  // room 1 on the left column, the start at its bottom; a passage on its middle tile into room 2:
  // across from the way out is the outer wall, so the way in is above or below - below, from the start
  const map = room2();
  for (let y = 1; y <= 5; y += 2) M.setRoom(map, 1, y, 1);
  let borders = M.syncBorderWalls(map, new Set());
  M.togglePassage(map, 2, 3, [1, 3]);
  borders = M.syncBorderWalls(map, borders);
  assert.deepStrictEqual(map.cells['1,3,0'].tile!.passageWalls, ['h,0,2', 'h,1,2'], 'its top walled, not its bottom');
  assert.ok(!M.robotReach(map).pocketAt(24, 18));
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

test('a black tile stops the robot in a 12 cm corridor; the black tile itself is not pointed out', () => {
  // a row of three room 2 tiles, the middle one black
  const map = M.newMap(3, 1, 2026);
  for (let x = 1; x <= 5; x += 2) M.setRoom(map, x, 1, 2);
  map.startTile = { x: 1, y: 1, z: 0 };
  M.setFloor(map, 3, 1, 'black');
  const r = M.robotReach(map);
  assert.strictEqual(r.pocketCount, 1);
  assert.ok(r.pocketAt(30, 6), 'the tile past the hole is out of reach');
  assert.ok(!r.pocketAt(13, 6) && !r.pocketAt(18, 6) && !r.pocketAt(23, 6), 'the black tile, rim and all, is not');
});

test('a black tile with walls round it closes off the tile only reached across it', () => {
  // the top right tile of 3 x 3 is walled off from below; its way in is the black top middle tile
  const map = room2();
  for (let i = 4; i < 6; i++) L.setSeg(map, `h,${i},2`, true);
  M.setFloor(map, 3, 1, 'black');
  const r = M.robotReach(map);
  assert.strictEqual(r.pocketCount, 1);
  assert.ok(r.pocketAt(30, 6), 'the top right tile is out of reach');
  assert.ok(!r.pocketAt(6, 6) && !r.pocketAt(30, 18), 'the rest is not');
});

test('a black tile in the open leaves no place out of reach: the robot goes round it', () => {
  const map = room2();
  M.setFloor(map, 3, 3, 'black');
  assert.strictEqual(M.robotReach(map).pocketCount, 0);
});
