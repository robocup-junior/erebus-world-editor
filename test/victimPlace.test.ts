// Victims moved along their wall in rooms 1-3 (src/lib/model.ts: victimPlace, victimRange,
// moveVictim, ...): where they may go, what keeps them there, and what the world file gets
import { test } from 'vitest';
import assert from 'node:assert';
import type { MapData } from '../src/lib/types';
import * as M from '../src/lib/model';
import * as L from '../src/lib/lattice';
import * as Score from '../src/rules/parts/scoring/v1';

type Where = M.Where;
const edge = (x: number, y: number, dir: string): Where => ({ kind: 'edge', x, y, dir });
const slot = (x: number, y: number, i: number): Where => ({ kind: 'slot', x, y, i });

// a room 1 map (only its outer walls), start at the bottom left
function room1(w = 5, l = 3): MapData {
  const map = M.newMap(w, l, 2026);
  map.startTile = { x: 1, y: 2 * l - 1, z: 0 };
  return map;
}
// a wall along the top of tiles x0..x1 (tile columns) of tile row ty: its 6 cm pieces
function topWall(map: MapData, x0: number, x1: number, ty: number) {
  for (let i = 2 * x0; i <= 2 * x1 + 1; i++) L.setSeg(map, `h,${i},${2 * ty}`, true);
}
// a wall down the left of tile (tx, ty)
function leftWall(map: MapData, tx: number, ty: number) {
  L.setSeg(map, `v,${2 * tx},${2 * ty}`, true);
  L.setSeg(map, `v,${2 * tx},${2 * ty + 1}`, true);
}
// a map all room 2, start at the bottom left
function room2(w = 3, l = 3): MapData {
  const map = M.newMap(w, l, 2026);
  let borders = M.borderEdges(map);
  for (let x = 1; x < 2 * w; x += 2) for (let y = 1; y < 2 * l; y += 2) M.setRoom(map, x, y, 2);
  borders = M.syncBorderWalls(map, borders);
  map.startTile = { x: 1, y: 2 * l - 1, z: 0 };
  return map;
}
// the victims and cognitive targets of a world file: name and x, z (m)
function tokensOf(world: string) {
  const out: { name: string; x: number; z: number }[] = [];
  const re = /(Victim|Fake|CognitiveTarget) \{\s*translation (\S+) 0 (\S+)\s*rotation [^\n]*\s*name "([^"]+)"/g;
  let m;
  while ((m = re.exec(world))) out.push({ name: m[4], x: Number(m[2]), z: Number(m[3]) });
  return out;
}
function worldOf(map: MapData) {
  (globalThis as any).DISABLE_RANDOMNESS = true;
  const log = console.log;
  console.log = () => {};
  try { return M.world(map); } finally { console.log = log; delete (globalThis as any).DISABLE_RANDOMNESS; }
}

test('a victim is in the middle of its face until it is moved', () => {
  const map = room1();
  topWall(map, 1, 1, 1);
  assert.ok(M.setVictim(map, 3, 3, 'top', 'H', false));
  const p = M.victimPlace(map, edge(3, 3, 'top'));
  assert.deepStrictEqual([p.at, p.wall, p.along, p.offset, p.half], [[18, 14], [18, 12], [1, 0], 0, 6]);
  assert.strictEqual(M.victimOffset(map, edge(3, 3, 'top')), 0);
  // left and right faces run down
  assert.deepStrictEqual(M.victimPlace(map, edge(3, 3, 'left'), 2).along, [0, 1]);
  assert.deepStrictEqual(M.victimPlace(map, edge(3, 3, 'left'), 2).at, [14, 20]);
});

test('room 1: along a free wall it goes to 1 cm from the tile\'s corner (it is 2 cm across)', () => {
  const map = room1();
  topWall(map, 0, 4, 1);
  M.setVictim(map, 3, 3, 'top', 'H', false);
  assert.deepStrictEqual(M.victimRange(map, edge(3, 3, 'top')), { min: -5, max: 5 });
  assert.ok(M.victimFits(map, edge(3, 3, 'top'), 5));
  assert.ok(!M.victimFits(map, edge(3, 3, 'top'), 5.1), 'not past its tile');
});

test('room 1: a wall at the end of the face stops it half the wall\'s thickness short', () => {
  const map = room1();
  topWall(map, 0, 4, 1);
  leftWall(map, 1, 1);
  M.setVictim(map, 3, 3, 'top', 'H', false);
  assert.deepStrictEqual(M.victimRange(map, edge(3, 3, 'top')), { min: -4.5, max: 5 });
  // a wall on the other side of the face does not stop it
  const other = room1();
  topWall(other, 0, 4, 1);
  leftWall(other, 1, 0);
  M.setVictim(other, 3, 3, 'top', 'H', false);
  assert.deepStrictEqual(M.victimRange(other, edge(3, 3, 'top')), { min: -5, max: 5 });
  // in a corner of the map: the outer walls
  const corner = room1();
  M.setVictim(corner, 1, 1, 'top', 'H', false);
  assert.deepStrictEqual(M.victimRange(corner, edge(1, 1, 'top')), { min: -4.5, max: 5 });
});

test('the wall must be under it: a half wall ends where it ends', () => {
  const map = room1();
  // only the left half of the top of tile (3, 3)
  L.setSeg(map, 'h,2,2', true);
  const t = M.tileOf(map, 3, 3)!;
  t.victims = { top: 'H' };
  assert.ok(M.victimFits(map, edge(3, 3, 'top'), -2));
  assert.ok(!M.victimFits(map, edge(3, 3, 'top'), 0), 'its right half has no wall');
  // from where it does not fit, the range is the nearest stretch where it does
  const r = M.victimRange(map, edge(3, 3, 'top'));
  assert.deepStrictEqual(r, { min: -5, max: -1 });
  assert.strictEqual(M.offsetToward(map, edge(3, 3, 'top'), 20, 14), -1, 'a click past the wall\'s end stops at it');
});

test('victims keep apart: half a cm between them, side by side and round a corner', () => {
  const map = room1();
  topWall(map, 0, 4, 1);
  M.setVictim(map, 3, 3, 'top', 'H', false);
  M.setVictim(map, 5, 3, 'top', 'S', false);
  assert.ok(M.moveVictim(map, edge(3, 3, 'top'), 5));
  // the one on the right: from 0.5 cm past the other one's end
  assert.deepStrictEqual(M.victimRange(map, edge(5, 3, 'top')), { min: -4.5, max: 5 });
  assert.ok(!M.victimFits(map, edge(5, 3, 'top'), -4.6));
  // round a corner (rooms 2, 3: two faces of one quarter): the map's top left corner, quarter NW of
  // tile (1, 1); one on its top face as far left as it goes, then the one on its left face stops
  // half a cm below it
  const c = room2();
  M.setSlotVictim(c, 1, 1, 0, 'H', false);
  M.setSlotVictim(c, 1, 1, 3, 'S', false);
  assert.ok(M.moveVictim(c, slot(1, 1, 0), -2));
  assert.strictEqual(M.victimOffset(c, slot(1, 1, 0)), -1.5, 'the outer wall at its end');
  assert.deepStrictEqual(M.victimRange(c, slot(1, 1, 3)), { min: -1, max: 2 });
  // the other side of a wall is free: a victim on the far face of the same wall
  const o = room1();
  topWall(o, 0, 4, 1);
  M.setVictim(o, 3, 3, 'top', 'H', false, { offset: 2 });
  M.setVictim(o, 3, 1, 'bottom', 'S', false);
  assert.ok(M.victimFits(o, edge(3, 1, 'bottom'), 2), 'a wall between them');
});

test('moveVictim: as far as it fits, in 0.1 cm steps; offsetToward follows a point along the face', () => {
  const map = room1();
  topWall(map, 0, 4, 1);
  leftWall(map, 1, 1);
  M.setVictim(map, 3, 3, 'top', 'H', false);
  const w = edge(3, 3, 'top');
  assert.ok(M.moveVictim(map, w, -9));
  assert.strictEqual(M.victimOffset(map, w), -4.5);
  assert.ok(M.moveVictim(map, w, 1.234));
  assert.strictEqual(M.victimOffset(map, w), 1.2);
  assert.ok(!M.moveVictim(map, w, 1.2), 'no change, no move');
  assert.strictEqual(M.offsetToward(map, w, 21.04, 20), 3);
  assert.strictEqual(M.offsetToward(map, w, 100, 20), 5);
  // stored as a number with one decimal, and taken out at the middle
  assert.strictEqual(M.tileOf(map, 3, 3)!.victim_offset, 1.2);
  M.moveVictim(map, w, 0);
  assert.ok(!('victim_offset' in M.tileOf(map, 3, 3)!));
});

test('a cognitive target is 5 cm across (rule 3.7.7): it goes less far and keeps further off', () => {
  // room 1, a free wall: to 2.5 cm from the tile's corner
  const map = room1();
  topWall(map, 0, 4, 1);
  M.setVictim(map, 3, 3, 'top', 'CT', false, { code: 'YYYYY' });
  assert.deepStrictEqual(M.victimRange(map, edge(3, 3, 'top')), { min: -3.5, max: 3.5 });
  // a letter victim beside it, on the next tile: half a cm from its edge (the tile's corner, x = 24)
  M.setVictim(map, 5, 3, 'top', 'H', false);
  assert.ok(M.moveVictim(map, edge(3, 3, 'top'), 3.5));
  assert.deepStrictEqual(M.victimRange(map, edge(5, 3, 'top')), { min: -4.5, max: 5 });
  assert.ok(M.moveVictim(map, edge(5, 3, 'top'), -4.5));
  assert.deepStrictEqual(M.victimRange(map, edge(3, 3, 'top')), { min: -3.5, max: 3.5 });
  assert.ok(!M.victimFits(map, edge(3, 3, 'top'), 3.6) && M.victimFits(map, edge(3, 3, 'top'), 3.5));
  // a 6 cm wall with walls at both ends: just in its middle
  const q = room2();
  const t = M.tileOf(q, 3, 3)!;
  t.halfWallIn = [1, 1, 0, 0];
  assert.ok(M.setSlotVictim(q, 3, 3, 7, 'CT', false, { code: 'YYYYY' }));
  assert.deepStrictEqual(M.victimRange(q, slot(3, 3, 7)), { min: -0.5, max: 0 });
  // one about to go there (the victim tool's preview): its own width, not the one there
  M.clearSlotVictim(q, 3, 3, 7);
  assert.strictEqual(M.offsetToward(q, slot(3, 3, 7), 18, 13, 0, 'H'), -2);
  assert.strictEqual(M.offsetToward(q, slot(3, 3, 7), 18, 13, 0, 'CT'), -0.5);
  // a wall coming up to its face in the middle stops it too (not only at its ends)
  const m = room1();
  topWall(m, 0, 4, 1);
  L.setSeg(m, 'v,5,2', true);      // down from the top wall to the middle of tile (5, 3), at x = 30
  M.setVictim(m, 5, 3, 'top', 'CT', false, { code: 'YYYYY' });
  assert.ok(!M.victimFits(m, edge(5, 3, 'top'), -1.5), 'the wall 1.5 cm from its middle');
  assert.ok(M.victimFits(m, edge(5, 3, 'top'), -3));
});

test('rooms 2 and 3: on a 6 cm wall it goes 2 cm each way, less at a wall\'s end', () => {
  const map = room2();
  // tile (3, 3), quarter NW (0), its top face: the inner half wall across the top of the quarter
  // is not there; use the left face of quarter NE (1), side left = the inner wall down the middle
  const t = M.tileOf(map, 3, 3)!;
  t.halfWallIn = [1, 0, 0, 0];      // the inner wall from the centre up
  assert.ok(M.setSlotVictim(map, 3, 3, 1 * 4 + 3, 'H', false));
  const w = slot(3, 3, 7);
  const p = M.victimPlace(map, w);
  assert.deepStrictEqual([p.along, p.half], [[0, 1], 3]);
  // the inner wall runs from the top edge to the centre: free at its top, at the centre it ends
  const r = M.victimRange(map, w);
  assert.deepStrictEqual(r, { min: -2, max: 2 });
  // an inner wall across the quarter's bottom (from the centre right) stops it at the bottom
  t.halfWallIn = [1, 1, 0, 0];
  assert.deepStrictEqual(M.victimRange(map, w), { min: -2, max: 1.5 });
});

test('a victim on a curve goes round its arc, clear of the walls at its ends', () => {
  const map = room2();
  M.setRoom(map, 3, 3, 3);
  // NW quarter of tile (3, 3), centre at the tile's left edge (12, 18): from the tile's top-left corner
  // (12, 12) round to its centre (18, 18)
  assert.ok(M.setCurve(map, 3, 3, 0, 1));
  const i = 0 * 4 + L.curveSide(1, false);
  assert.ok(M.setSlotVictim(map, 3, 3, i, 'H', false));
  const w = slot(3, 3, i);
  const p0 = M.victimPlace(map, w);
  assert.deepStrictEqual(p0.centre, [12, 18]);
  assert.ok(Math.abs(p0.half - 1.5 * Math.PI) < 1e-9);
  // the tile's top wall (the room's outer wall) meets the arc's end at the corner: the outer face stops
  // short of it; at the centre end it is free up to the end of its arc
  const r = M.victimRange(map, w);
  assert.ok(r.min < -1.5 && r.min > -3.8, `min ${r.min}`);
  assert.strictEqual(r.max, Number((1.5 * Math.PI - 1).toFixed(1)));
  assert.ok(M.moveVictim(map, w, 2));
  const p = M.victimPlace(map, w);
  // still 6 cm + 2.4 cm off the centre, turned 2 cm of arc (1/3 rad) clockwise
  assert.ok(Math.abs(Math.hypot(p.at[0] - 12, p.at[1] - 18) - 8.4) < 1e-9);
  assert.ok(Math.abs(Math.atan2(p.at[1] - 18, p.at[0] - 12) - (-Math.PI / 4 + 1 / 3)) < 1e-9);
  // dragged: to the angle of the pointer
  assert.strictEqual(M.offsetToward(map, w, 12 + 9 * Math.cos(-Math.PI / 4 - 0.25), 18 + 9 * Math.sin(-Math.PI / 4 - 0.25)), -1.5);
  // the inner face of the same arc, from the other side
  const j = 0 * 4 + L.curveSide(1, true);
  assert.ok(M.setSlotVictim(map, 3, 3, j, 'S', false));
  assert.ok(M.victimFits(map, slot(3, 3, j), -2) && M.victimFits(map, slot(3, 3, j), 2));
});

test('the world file has a victim on a curve where the editor shows it, facing off the arc', () => {
  const map = room2();
  M.setRoom(map, 3, 3, 3);
  M.setCurve(map, 3, 3, 0, 1);
  const i = 0 * 4 + L.curveSide(1, false);
  M.setSlotVictim(map, 3, 3, i, 'H', false);
  const before = tokensOf(worldOf(map))[0], from = M.victimPlace(map, slot(3, 3, i)).at;
  M.moveVictim(map, slot(3, 3, i), 2);
  const after = tokensOf(worldOf(map))[0], to = M.victimPlace(map, slot(3, 3, i)).at;
  // it moved as the editor shows it (x is x, z is the editor's y; 1 cm is 0.01 m): the chord of 1/3 rad
  // round an arc about 6.5 cm from the centre, the same way
  const d = [after.x - before.x, after.z - before.z], e = [to[0] - from[0], to[1] - from[1]];
  const r = Math.hypot(d[0], d[1]) / (2 * Math.sin(1 / 6));
  assert.ok(r > 0.06 && r < 0.07, `radius ${r}`);
  assert.ok((d[0] * e[0] + d[1] * e[1]) / Math.hypot(d[0], d[1]) / Math.hypot(e[0], e[1]) > 0.999, 'the same way');
});

test('the offset goes with the victim: kept when changed, gone when it is taken away', () => {
  const map = room2();
  M.setSlotVictim(map, 1, 1, 0, 'H', false);
  M.moveVictim(map, slot(1, 1, 0), 2);
  assert.strictEqual(M.victimOffset(map, slot(1, 1, 0)), 2);
  M.changeVictim(map, slot(1, 1, 0), { type: 'S', rot: 90 });
  assert.strictEqual(M.victimOffset(map, slot(1, 1, 0)), 2, 'a change of kind or turn keeps it');
  assert.ok(M.clearSlotVictim(map, 1, 1, 0));
  assert.strictEqual(M.victimOffset(map, slot(1, 1, 0)), 0);
  assert.ok(!('halfWallVicOffsets' in M.tileOf(map, 1, 1)!), 'an empty list is not kept');
  // room 1
  const r1 = room1();
  M.setVictim(r1, 1, 1, 'top', 'H', false, { offset: 3 });
  assert.strictEqual(M.victimOffset(r1, edge(1, 1, 'top')), 3);
  M.changeVictim(r1, edge(1, 1, 'top'), { fake: true });
  assert.strictEqual(M.victimOffset(r1, edge(1, 1, 'top')), 3);
  M.clearVictim(r1, 1, 1);
  assert.ok(!('victim_offset' in M.tileOf(r1, 1, 1)!));
});

test('saved, copied, pasted and with a column put in: the offset stays', () => {
  const map = room1();
  M.setVictim(map, 1, 1, 'top', 'H', false, { offset: -3.5 });
  const back = M.normalize(JSON.parse(JSON.stringify(M.saved(map))));
  assert.strictEqual(M.victimOffset(back, edge(1, 1, 'top')), -3.5);
  const clip = M.copyRegion(map, { x0: 0, y0: 0, x1: 0, y1: 0 });
  M.pasteRegion(map, clip, 2, 1);
  assert.strictEqual(M.victimOffset(map, edge(5, 3, 'top')), -3.5);
  assert.ok(M.insertLine(map, 'x', 0));
  assert.strictEqual(M.victimOffset(map, edge(3, 1, 'top')), -3.5);
});

test('the world file: moved along the wall by the offset (1 cm = 0.01 m), the rest as before', () => {
  const map = room1();
  topWall(map, 1, 1, 1);
  L.setSeg(map, 'v,6,2', true);
  L.setSeg(map, 'v,6,3', true);
  assert.ok(M.setVictim(map, 3, 3, 'top', 'H', false));
  assert.ok(M.setVictim(map, 5, 3, 'right', 'S', false));
  const before = tokensOf(worldOf(map));
  M.moveVictim(map, edge(3, 3, 'top'), 3);
  M.moveVictim(map, edge(5, 3, 'right'), -2.5);
  const after = tokensOf(worldOf(map));
  assert.strictEqual(after.length, 2);
  // the top one moves right (x), the right-side one up (z)
  const byName = (l: typeof before, name: string) => l.find((v) => v.name === name)!;
  const a0 = byName(before, 'Victim0'), a1 = byName(after, 'Victim0'), b0 = byName(before, 'Victim1'), b1 = byName(after, 'Victim1');
  const moved = [[a1.x - a0.x, a1.z - a0.z], [b1.x - b0.x, b1.z - b0.z]].map((d) => d.map((v) => Math.round(v * 1e6) / 1e6));
  // which of the two is the top one depends on the export's order: check both ways
  const want = [[0.03, 0], [0, -0.025]];
  assert.ok(JSON.stringify(moved) === JSON.stringify(want) || JSON.stringify(moved) === JSON.stringify([want[1], want[0]]), JSON.stringify(moved));
});

test('the world file: a victim on a 6 cm wall moves along it; a cognitive target too', () => {
  const map = room2();
  M.setSlotVictim(map, 1, 1, 0, 'H', false);                          // top face of NW: along x
  M.setSlotVictim(map, 1, 1, 3, 'CT', false, { code: 'YYYYY' });     // left face of NW: along z
  const before = tokensOf(worldOf(map));
  M.moveVictim(map, slot(1, 1, 0), 1.5);
  M.moveVictim(map, slot(1, 1, 3), 1);     // 5 cm across: 0.5 cm is as far as it goes
  const after = tokensOf(worldOf(map));
  const d = (name: string) => {
    const a = before.find((v) => v.name === name)!, b = after.find((v) => v.name === name)!;
    return [Math.round((b.x - a.x) * 1e6) / 1e6, Math.round((b.z - a.z) * 1e6) / 1e6];
  };
  assert.deepStrictEqual(d('Victim0'), [0.015, 0]);
  assert.deepStrictEqual(d('Hazard0'), [0, 0.005]);
});

test('a victim that no longer fits (a wall came at its end) is a problem, put back by the fix', () => {
  const map = room1();
  topWall(map, 0, 4, 1);
  M.setVictim(map, 3, 3, 'top', 'H', false);
  M.moveVictim(map, edge(3, 3, 'top'), 5);
  assert.ok(!M.problems(map).some((p) => p.key === 'victimMisplaced'));
  // a wall down the right of the tile
  leftWall(map, 2, 1);
  const p = M.problems(map).find((q) => q.key === 'victimMisplaced')!;
  assert.ok(p && p.block && p.params.count === 1);
  assert.ok(M.FIXABLE.indexOf('victimMisplaced') > -1);
  M.fixProblem(map, p, M.borderEdges(map));
  assert.strictEqual(M.victimOffset(map, edge(3, 3, 'top')), 4.5, 'the nearest place toward the middle that fits');
  assert.ok(!M.problems(map).some((q) => q.key === 'victimMisplaced'));
  // fix all does it too
  M.moveVictim(map, edge(3, 3, 'top'), -5);
  leftWall(map, 1, 1);
  M.fixAll(map, M.borderEdges(map));
  assert.strictEqual(M.victimOffset(map, edge(3, 3, 'top')), -4.5);
});

test('victims in the middle are never pointed out, even where an old map has them close', () => {
  const map = M.normalize(JSON.parse(JSON.stringify(room2())));
  for (let i = 0; i < 16; i++) M.setSlotVictim(map, 1, 1, i, 'H', false);
  assert.ok(!M.problems(map).some((p) => p.key === 'victimMisplaced'));
});

test('where the robot gets to and the score take the moved place', () => {
  const map = room2(3, 3);
  // a 6 cm box the robot cannot get into: walls all round quarter NE of tile (3, 1)
  L.setSeg(map, 'h,3,0', true); L.setSeg(map, 'h,3,1', true); L.setSeg(map, 'v,3,0', true); L.setSeg(map, 'v,4,0', true);
  // a victim inside it, on the box's bottom wall
  M.setSlotVictim(map, 3, 1, 1 * 4 + 2, 'H', false);
  const inside = M.robotReach(map)!.victims;
  assert.strictEqual(inside.length, 1);
  assert.deepStrictEqual(inside[0], M.victimPlace(map, slot(3, 1, 6)).at);
  M.moveVictim(map, slot(3, 1, 6), 1.5);
  const moved = M.robotReach(map)!.victims;
  assert.deepStrictEqual(moved[0], M.victimPlace(map, slot(3, 1, 6)).at, 'the place with its offset');
  const s = Score.maxScore(map, null)!;
  assert.strictEqual(s.unreachableTokens, 1);
});
