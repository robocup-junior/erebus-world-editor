// The years of rules (src/rules): each complete and working, and the rest of the editor asking them
// through the registry only - so a year can be added, changed or dropped in src/rules alone
import { test } from 'vitest';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import * as M from '../src/lib/model';
import * as R from '../src/rules/registry';

const SRC = path.join(__dirname, '..', 'src');
const files = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? files(path.join(dir, e.name)) : /\.(ts|vue)$/.test(e.name) ? [path.join(dir, e.name)] : []);
const rel = (f: string) => path.relative(SRC, f).split(path.sep).join('/');
const lang = (code: string) => JSON.parse(fs.readFileSync(path.join(SRC, 'lang', code + '.json'), 'utf8'));
const quietly = <T>(f: () => T): T => {
  (globalThis as any).DISABLE_RANDOMNESS = true;
  const log = console.log;
  console.log = () => {};
  try { return f(); } finally { console.log = log; delete (globalThis as any).DISABLE_RANDOMNESS; }
};

test('the registry: years oldest first, a map without a year is of the first, an unknown year is refused', () => {
  const ys = R.years();
  assert.ok(ys.length >= 1);
  assert.deepStrictEqual(ys, [...ys].sort((a, b) => a - b));
  assert.strictEqual(new Set(ys).size, ys.length);
  assert.strictEqual(R.FIRST_YEAR, 2026);
  assert.strictEqual(R.LATEST_YEAR, ys[ys.length - 1]);
  const old = M.newMap(2, 2);
  delete old.rules;
  assert.strictEqual(R.rulesOf(old).year, R.FIRST_YEAR);
  assert.strictEqual(M.normalize(old).rules, R.FIRST_YEAR, 'an old file gets its year on opening');
  assert.strictEqual(M.newMap(2, 2).rules, R.LATEST_YEAR, 'a new map is of the latest year');
  assert.throws(() => R.rulesOf(Object.assign(M.newMap(2, 2), { rules: 1999 })));
  assert.strictEqual(R.rulesFor(1999), null);
});

// the parameters {{rule_x}} the texts use
const cited = (() => {
  const out = new Set<string>();
  const walk = (o: any) => Object.values(o).forEach((v) => typeof v === 'string'
    ? (v.match(/\{\{\s*rule_(\w+)\s*\}\}/g) || []).forEach((m) => out.add(m.replace(/[{}\s]|rule_/g, '')))
    : walk(v));
  walk(lang('en'));
  return out;
})();

for (const year of R.years()) {
  const rules = R.rulesFor(year)!;

  test(`${year}: complete - rooms 1-4, a sound list of victims, every rule number the texts cite`, () => {
    for (const room of [1, 2, 3, 4]) assert.ok(rules.rooms[room], `room ${room}`);
    const kinds = rules.tokens.kinds;
    assert.ok(kinds.length);
    assert.strictEqual(new Set(kinds.map((k) => k.id)).size, kinds.length, 'kinds have their own ids');
    assert.ok(kinds.filter((k) => k.family === 'target').length <= 1, 'one ring target kind at most');
    const letters = kinds.filter((k) => k.family === 'letter');
    assert.ok(letters.every((k) => k.edge && k.slot), 'a letter kind has its map file codes');
    assert.strictEqual(new Set(letters.map((k) => k.edge)).size, letters.length);
    assert.strictEqual(new Set(letters.map((k) => k.slot)).size, letters.length);
    assert.ok(kinds.every((k) => k.widthCm > 0 && k.symbol && k.nameKey));
    for (const ref of cited) assert.ok(rules.refs[ref], `refs.${ref} (a text cites it)`);
  });

  test(`${year}: floors and passages - each kind of floor its own flag, one checkpoint kind, a passage for each pair of rooms`, () => {
    const floors = rules.floors;
    assert.ok(floors.length);
    assert.strictEqual(new Set(floors.map((k) => k.id)).size, floors.length);
    assert.ok(floors.every((k) => k.id !== 'start' && k.id !== 'clear'), 'the floor tool keeps start and clear for itself');
    assert.ok(floors.filter((k) => k.checkpoint).length <= 1);
    const list = rules.passages.list;
    assert.strictEqual(new Set(list.map((p) => p.color.toLowerCase())).size, list.length, 'a colour names one passage');
    for (let a = 1; a <= 4; a++) for (let b = a + 1; b <= 4; b++) {
      assert.strictEqual(list.filter((p) => (p.from === a && p.to === b) || (p.from === b && p.to === a)).length, 1, `rooms ${a} and ${b}`);
    }
  });

  test(`${year}: its own texts are of keys there are, in every language`, () => {
    for (const code of ['en', 'ja']) {
      const own = (lang(code).years || {})[year];
      if (!own) continue;
      const base = lang(code);
      const walk = (o: any, at: string[]) => Object.keys(o).forEach((k) => {
        if (typeof o[k] === 'object') return walk(o[k], at.concat(k));
        const there = at.concat(k).reduce((n: any, p) => (n ? n[p] : undefined), base);
        assert.strictEqual(typeof there, 'string', `years.${year}.${at.concat(k).join('.')} in ${code}`);
      });
      walk(own, []);
    }
  });

  test(`${year}: works - each kind of victim goes on a wall, the world file is made, the score worked out`, () => {
    const map = M.newMap(3, 1);
    map.rules = year;
    map.startTile = { x: 1, y: 1, z: 0 };
    // a room 1 wall for each kind, along the top of the map
    const room1 = rules.rooms[1];
    assert.strictEqual(room1.tokens, 'edge');
    rules.tokens.kinds.slice(0, 3).forEach((k, n) => {
      const code = k.family === 'target' ? rules.tokens.target.randomCode('F') : undefined;
      assert.ok(M.setVictim(map, 2 * n + 1, 1, 'top', k.id, false, { code }), k.id);
      const v = M.edgeVictim(map, 2 * n + 1, 1)!;
      assert.strictEqual(v.type, k.id, 'read back as its kind');
      assert.ok(M.victimFits(map, { kind: 'edge', x: 2 * n + 1, y: 1, dir: 'top' }, 0));
    });
    const world = quietly(() => M.world(map));
    assert.ok(world.startsWith('#VRML_SIM'));
    assert.ok(!/\b(NaN|undefined)\b/.test(world));
    const score = rules.scoring.maxScore(map, null)!;
    assert.ok(score.field > 0);
  });
}

test('the rest of the editor asks the registry: no year, no part imported, no year compared', () => {
  const bad: string[] = [];
  for (const f of files(SRC)) {
    const name = rel(f);
    if (name.startsWith('rules/')) continue;
    const text = fs.readFileSync(f, 'utf8');
    if (/from\s+['"][^'"]*rules\/(y\d{4}|parts\/)/.test(text)) bad.push(name + ': imports a year or a part');
    if (/\b(year|rules)\s*[!=]==?\s*20\d\d\b|\b20\d\d\s*[!=]==?\s*\w*year\b/i.test(text)) bad.push(name + ': compares a year');
  }
  assert.deepStrictEqual(bad, []);
});
