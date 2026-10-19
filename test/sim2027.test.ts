// The 2027 (draft) rules: contact tiles - only beside the field's outside (rule 4.3), in any room,
// an error when the outline leaves one inside - and the world file of Erebus 27 (a tile's contact
// field, the smiley fakes' models); 2026 maps are written as before
import { test } from 'vitest';
import assert from 'node:assert';
import type { MapData } from '../src/lib/types';
import * as M from '../src/lib/model';
import * as R from '../src/rules/registry';

const quietly = <T>(fn: () => T): T => {
  const log = console.log;
  console.log = () => {};
  try { return fn(); } finally { console.log = log; }
};
const paint = (map: MapData, room: number, tiles: number[][], borders: Set<string>) => {
  tiles.forEach(([tx, ty]) => M.setRoom(map, 2 * tx + 1, 2 * ty + 1, room));
  return M.syncBorderWalls(map, borders);
};
// the world file's tiles with a contact tile, by kind (worldTile, halfTile)
const contactTiles = (world: string) => (world.match(/DEF \w+ (worldTile|halfTile) \{[^}]*?contact TRUE/g) || [])
  .map((t) => t.match(/(worldTile|halfTile)/)![1]);

test('the 2027 rules: a draft, its rule book, contact tiles, smiley victims, the wall tokens at 3.8', () => {
  const r = R.rulesFor(2027)!;
  assert.ok(r.draft);
  assert.strictEqual(r.book, 'https://junior.robocup.org/wp-content/uploads/2026/09/RCJRescueSimulation2027-draft.pdf');
  assert.ok(!R.rulesFor(2026)!.draft);
  assert.deepStrictEqual(r.floors.filter((k) => k.outerOnly).map((k) => k.id), ['contact']);
  assert.ok(!R.rulesFor(2026)!.floors.some((k) => k.id === 'contact'));
  assert.deepStrictEqual(r.tokens.kinds.filter((k) => k.face).map((k) => [k.id, k.face]),
    [['H', 'face-frown'], ['S', 'face-meh'], ['U', 'face-smile']]);
  assert.deepStrictEqual(r.tokens.stamps.filter((s) => s.face).map((s) => s.idx).sort((a, b) => a - b), [0, 1, 2, 8, 9, 10]);
  assert.strictEqual(r.refs.passageTokens, '3.8.2');
  assert.strictEqual(r.refs.contactTile, '4.3');
  assert.deepStrictEqual(R.upcomingYears(), []);
});

test('a contact tile goes only on a tile beside the outside, in any room', () => {
  const map = M.newMap(3, 3, 2027);
  // the middle tile is inside: refused, by the floor tool and by the room 4 creator's
  assert.ok(!M.touchesOutside(map, 3, 3));
  assert.ok(!M.floorFits(map, 3, 3, 'contact'));
  assert.ok(M.floorFits(map, 3, 3, 'swamp'), 'other floors go anywhere');
  assert.strictEqual(M.setFloor(map, 3, 3, 'contact'), false);
  assert.strictEqual(M.setFloorKind(map, 3, 3, 'contact'), false);
  assert.ok(!(M.tileOf(map, 3, 3) || {}).contact);
  // a tile on the border takes it, and loses the other floors
  M.setFloor(map, 1, 3, 'swamp');
  assert.ok(M.setFloor(map, 1, 3, 'contact'));
  assert.deepStrictEqual([M.tileOf(map, 1, 3)!.contact, M.tileOf(map, 1, 3)!.swamp], [true, false]);
  assert.strictEqual(M.floorKind(map, 1, 3), 'contact');
  // beside a tile taken out of the map: beside the outside too
  M.setRoom(map, 3, 1, 0);
  assert.ok(M.touchesOutside(map, 3, 3));
  assert.ok(M.setFloor(map, 3, 3, 'contact'));
  // rooms 2 and 4 too (room 4: as its creator gives the floors)
  const big = M.newMap(4, 2, 2027);
  let borders = paint(big, 2, [[1, 0]], new Set());
  borders = paint(big, 4, [[3, 0], [3, 1]], borders);
  assert.ok(M.setFloor(big, 3, 1, 'contact'));
  assert.ok(M.setFloorKind(big, 7, 3, 'contact'));
  assert.deepStrictEqual(M.problems(big).filter((p) => p.key === 'contactInside'), []);
});

test('a contact tile the outline leaves inside is an error, and fixing it takes the floor off', () => {
  const map = M.newMap(3, 3, 2027);
  // the top middle tile taken out: the middle tile is beside the outside, and takes a contact tile
  M.setRoom(map, 3, 1, 0);
  assert.ok(M.setFloor(map, 3, 3, 'contact'));
  assert.ok(!M.problems(map).some((p) => p.key === 'contactInside'));
  // the tile back in the map: the contact tile is inside now
  M.setRoom(map, 3, 1, 1);
  const p = M.problems(map).find((q) => q.key === 'contactInside')!;
  assert.ok(p && p.block, 'an error');
  assert.deepStrictEqual(p.params, { count: 1 });
  assert.deepStrictEqual(p.show!.tiles, [[1, 1]]);
  assert.deepStrictEqual(p.at, [18, 18]);
  assert.ok(M.FIXABLE.includes('contactInside'));
  M.fixProblem(map, p, M.borderEdges(map));
  assert.ok(!M.tileOf(map, 3, 3)!.contact);
  assert.ok(!M.problems(map).some((q) => q.key === 'contactInside'));
});

test('Erebus 27: contact tiles in the world file (worldTile and halfTile), fakes as their smiley models', () => {
  const map = M.newMap(3, 1, 2027);
  M.setFloor(map, 1, 1, 'start');
  paint(map, 2, [[2, 0]], new Set());
  assert.ok(M.setFloor(map, 3, 1, 'contact'));
  assert.ok(M.setFloor(map, 5, 1, 'contact'));
  assert.ok(M.setVictim(map, 1, 1, 'top', 'H', true, { rot: 0 }));
  assert.ok(M.setVictim(map, 3, 1, 'top', 'S', true, { rot: 0 }));
  const world = quietly(() => M.world(map));
  assert.deepStrictEqual(contactTiles(world).sort(), ['halfTile', 'worldTile']);
  assert.strictEqual((world.match(/contact FALSE/g) || []).length, 1, 'the other tile says it is not one');
  // their bounds too, as Erebus's own worlds have them (after STARTBOUNDS, before SWAMPBOUNDS)
  const bounds = world.match(/DEF CONTACTBOUNDS Group \{[\s\S]*?\n {8}\}/)![0];
  assert.deepStrictEqual(bounds.match(/DEF contact\d+m(in|ax)/g), ['DEF contact0min', 'DEF contact0max', 'DEF contact1min', 'DEF contact1max']);
  assert.ok(world.indexOf('DEF STARTBOUNDS') < world.indexOf('DEF CONTACTBOUNDS') && world.indexOf('DEF CONTACTBOUNDS') < world.indexOf('DEF SWAMPBOUNDS'));
  const fakes = (world.match(/Fake \{[^}]*?type "(\w+)"/g) || []).map((f) => f.match(/type "(\w+)"/)![1]);
  assert.deepStrictEqual(fakes.sort(), ['phi', 'psi'], 'harmed: psi (H.stl), stable: phi (S.stl)');
  // each fake its own name (Webots warns of a name a sibling has)
  assert.deepStrictEqual((world.match(/name "Fake\d+"/g) || []).sort(), ['name "Fake0"', 'name "Fake1"']);
});

test('Erebus 26: a 2026 map is written as before - no contact field, the 2026 fakes', () => {
  const map = M.newMap(2, 1, 2026);
  M.setFloor(map, 1, 1, 'start');
  assert.ok(M.setVictim(map, 1, 1, 'top', 'H', true, { rot: 0 }));
  const world = quietly(() => M.world(map));
  assert.ok(!/\bcontact\b|CONTACTBOUNDS/.test(world));
  assert.ok(/Fake \{[^}]*?type "phi"/.test(world), 'harmed: phi');
  // a contact flag of a 2027 map switched to 2026 is not a floor there
  map.cells['3,1,0'].tile!.contact = true;
  assert.ok(!/\bcontact\b|CONTACTBOUNDS/.test(quietly(() => M.world(map))));
});
