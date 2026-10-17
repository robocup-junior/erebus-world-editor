// Erebus World Editor 2026's lesson: the sample map built step by step. Each step is not done before it
// starts, its "do it for me" does it, and the whole lesson ends with a map the world can be exported
// from, with nothing left to look at.
import { test } from 'vitest';
import assert from 'node:assert';
import * as M from '../src/lib/model';
import * as L from '../src/lib/lattice';
import * as W from '../src/lib/world2026';
import * as T from '../src/lib/tour';

// the editor's side, as the page gives it
type TestEnv = T.TourEnv & { refresh(): void };
function makeEnv() {
  const env = { M, W, L, map: null, ui: { showLinear: false }, selected: null, region: null, creator: null, problems: [] } as unknown as TestEnv;
  let borders = new Set<string>();
  const refresh = () => {
    env.problems = env.map ? M.problems(env.map) : [];
    const m = env.map;
    env.room4State = !m ? '' : m.area4Room && m.area4Room.type >= 2 ? 'preset' : !(m.roomTiles[2] || []).length ? 'none' : m.room4CanvasSave ? 'drawn' : 'empty';
  };
  env.sync = () => { borders = M.resyncBorderWalls(env.map, borders); };
  env.act = {
    newMap() { env.map = M.normalize(M.newMap(8, 6)); borders = M.borderEdges(env.map); },
    resize(w, l) { M.resize(env.map, w, l); borders = M.syncBorderWalls(env.map, borders); },
    openRoom4() {
      if (env.map.area4Room.type !== 1) { env.map.area4Room = W.area4Presets()[1]; env.sync(); }
      const r4: Record<string, any> = { tool: 'pen', drawCount: 0, tokenCount: 0, reachBlocked: 0, reachState: 'ok', hasSelection: false, sel: null, mirror: 'none', eraseTarget: 'all' };
      const drew = () => { r4.drawCount++; };
      env.creator = {
        r4,
        r4api: {
          // a closed line (first point = last) makes a place out of reach
          drawPen(pts: number[][]) { drew(); if (pts && String(pts[0]) === String(pts[pts.length - 1])) r4.reachBlocked += 400; },
          drawShape: drew, drawIcon: drew, erasePen: drew,
          selectBox() { r4.hasSelection = true; },
          selection(a: string) { if (a === 'drop' && r4.hasSelection) { r4.hasSelection = false; drew(); } },
          applyTemplate(id: string, clear: boolean) { drew(); if (clear) r4.tokenCount = 0; },
          randomStamps(n: number) { r4.tokenCount += n; drew(); },
          selectToken() { r4.sel = {}; },
          eraseToken() { if (r4.tokenCount) { r4.tokenCount--; drew(); } }
        },
        closeRoom4() { env.map.room4CanvasSave = 'data:image/png;base64,AAAA'; env.creator = null; }
      };
    },
    fixAll() { borders = M.fixAll(env.map, borders); },
    toggleLinear() { env.ui.showLinear = !env.ui.showLinear; },
    select(where) { env.selected = { where }; },
    setRegion(r) { env.region = r; },
    rename(name) { env.map.name = name; }
  };
  env.refresh = refresh;
  return env;
}

test('every lesson step has its texts and a chapter; the room 4 part is in it, in one piece', () => {
  const ids = T.LESSON.map((s) => s.id);
  assert.strictEqual(new Set(ids).size, ids.length, 'ids are unique');
  for (const s of T.LESSON) assert.ok(T.LESSON_CHAPTERS.includes(s.chapter), s.id);
  const i = ids.indexOf(T.ROOM4[0].id);
  assert.deepStrictEqual(ids.slice(i, i + T.ROOM4.length), T.ROOM4.map((s) => s.id));
  assert.strictEqual(T.ROOM4[T.ROOM4.length - 1].id, 'r4ok');
});

test('each step is not done when it starts, and is done by its "do it for me"', () => {
  const env = makeEnv();
  let prev: T.TourStep | null = null;
  for (const s of T.LESSON) {
    env.refresh();
    // as the page does when a step starts: what the last one changed put back, the creator's tool taken
    if (prev && prev.leave) prev.leave(env);
    prev = s;
    if (env.creator && s.r4tool) {
      env.creator.r4.tool = s.r4tool;
      if (s.r4tool === 'erase') env.creator.r4.eraseTarget = s.eraseTokens ? 'tokens' : 'all';
    }
    const st: T.StepState = {};
    if (s.enter) s.enter(env, st);
    if (!s.goal) continue;
    if (!s.maybeDone) assert.ok(!s.goal(env, st), `${s.id}: not done before it starts`);
    s.auto(env, st);
    env.refresh();
    assert.ok(s.goal(env, st), `${s.id}: done by its auto`);
  }
  // the map at the end
  const map = env.map;
  assert.strictEqual(map.width, T.SAMPLE.width);
  assert.strictEqual(map.length, T.SAMPLE.length);
  assert.ok(M.isOutside(map, 1, 1));
  assert.ok(map.name);
  const left = M.problems(map).map((p) => p.key);
  assert.deepStrictEqual(left, [], 'nothing left to fix or look at');
  const reach = M.robotReach(map);
  assert.strictEqual(reach.pocketCount, 0, 'the robot gets everywhere');
  assert.deepStrictEqual(reach.victims, [], 'and to every victim');
  const kinds = T.victims(env);
  assert.ok(kinds.some((v) => v.type === 'CT') && kinds.some((v) => v.fake) && kinds.some((v) => v.type === 'H'));
  // a room 4 entrance checkpoint was set by itself
  assert.ok(Object.values(map.cells).some((cl) => cl.tile && cl.tile.cpAuto && cl.tile.checkpoint));
});

test('the walls along the guides are the 6 cm segments between their points', () => {
  const segs = T.segsAlong(L, [[48, 12], [54, 12], [54, 18]]);
  assert.deepStrictEqual(segs, ['h,8,2', 'v,9,2']);
});

test('what to do follows the map: too much done, something else done, part of it left', () => {
  const env = makeEnv();
  env.act.newMap();
  const step = (id: string) => T.LESSON.find((s) => s.id === id);
  const look = (id: string, st: T.StepState = {}) => { env.refresh(); const s = step(id); return { done: s.goal(env, st), state: s.state ? s.state(env, st) : null }; };
  // size: one + too many, then the length changed
  env.act.resize(10, 6);
  assert.deepStrictEqual(look('size'), { done: false, state: { key: 'more', params: { w: 10 } } });
  env.act.resize(9, 5);
  assert.strictEqual(look('size').state.key, 'length');
  env.act.resize(9, 6);
  assert.deepStrictEqual(look('size'), { done: true, state: null });
  // outline: a second tile taken out as well
  M.setRoom(env.map, 1, 1, 0); M.setRoom(env.map, 3, 1, 0); env.sync();
  assert.deepStrictEqual(look('outline'), { done: false, state: { key: 'extra', params: { n: 1 } } });
  M.setRoom(env.map, 3, 1, 1); env.sync();
  assert.ok(look('outline').done);
  // columns: two in, then too many out
  M.insertLine(env.map, 'x', 18); M.insertLine(env.map, 'x', 20); env.sync();
  assert.deepStrictEqual(look('delCol').state, { key: 'more', params: { n: 2 } });
  for (let i = 0; i < 3; i++) M.removeLine(env.map, 'x', 2 * env.map.width - 1);
  env.sync();
  assert.deepStrictEqual(look('delCol').state, { key: 'less', params: { n: 1 } });
  M.insertLine(env.map, 'x', 2 * env.map.width); env.sync();
  assert.ok(look('delCol').done);
  // room 2: part painted, then one tile too many, then room 3 in its frame
  M.setRoom(env.map, 7, 1, 2); env.sync();
  assert.deepStrictEqual(look('room2').state, { key: 'left', params: { n: 8, room: 2 } });
  step('room2').auto(env, {}); M.setRoom(env.map, 5, 1, 2); env.sync();
  assert.deepStrictEqual(look('room2'), { done: false, state: { key: 'extra', params: { n: 1, room: 2 } } });
  step('room2').auto(env, {});
  assert.ok(look('room2').done, 'do it for me puts it right');
  M.setRoom(env.map, 7, 1, 3); env.sync();
  assert.deepStrictEqual(look('room2').state, { key: 'wrong', params: { n: 1, room: 2 } });
  step('room2').auto(env, {});
  // floors: what is left, by name
  M.setFloor(env.map, 3, 7, 'black');
  assert.deepStrictEqual(look('floors').state, { key: 'left', params: { list: ['checkpoint', 'swamp'], listOf: 'admin.simBeta.floors.' } });
});

test('the eraser step lights up the swamp where it was put, also once it is taken off', () => {
  const env = makeEnv();
  env.act.newMap();
  env.act.resize(T.SAMPLE.width, T.SAMPLE.length);
  const step = T.LESSON.find((s) => s.id === 'erase');
  // a swamp somewhere else than the sample's
  M.setFloor(env.map, 3, 3, 'swamp');
  const st: T.StepState = {};
  step.enter(env, st);
  assert.deepStrictEqual(step.region(env, st), [[1, 1, 1, 1]]);
  M.setFloor(env.map, 3, 3, 'clear');                 // taken off with the eraser
  assert.ok(!step.goal(env, st));
  assert.deepStrictEqual(step.region(env, st), [[1, 1, 1, 1]], 'still shown, to undo');
  M.setFloor(env.map, 3, 3, 'swamp');                 // back with undo
  assert.ok(step.goal(env, st));
  // no swamp at all: the sample's place
  const none = makeEnv();
  none.act.newMap();
  const st2: T.StepState = {};
  step.enter(none, st2);
  assert.deepStrictEqual(step.region(none, st2), [[T.SAMPLE.swamp[0], T.SAMPLE.swamp[1], T.SAMPLE.swamp[0], T.SAMPLE.swamp[1]]]);
});

test('the step to pick a victim lights up the victims where they were put', () => {
  const env = makeEnv();
  env.act.newMap();
  const step = T.LESSON.find((s) => s.id === 'pick');
  // on the outer wall above the top left tile
  assert.ok(M.setVictim(env.map, 1, 1, 'top', 'H', false, { rot: 0 }));
  assert.deepStrictEqual(step.region(env, {}), [[0, 0, 0, 0]]);
});
