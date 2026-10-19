// The texts of every language (src/lang): each has the keys English has, with the same {{parameters}},
// and is listed in src/i18n.ts's LANGUAGES - so a language added (or a text added to English) is not
// left with holes
import { test } from 'vitest';
import assert from 'node:assert';
import fs from 'node:fs';

const dir = new URL('../src/lang/', import.meta.url);
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
const read = (f: string) => JSON.parse(fs.readFileSync(new URL(f, dir), 'utf8'));

// every text: dotted key -> text
function flat(o: any, at = '', out: Record<string, unknown> = {}) {
  Object.keys(o).forEach((k) => {
    const key = at ? at + '.' + k : k;
    if (o[k] && typeof o[k] === 'object' && !Array.isArray(o[k])) flat(o[k], key, out);
    else out[key] = o[k];
  });
  return out;
}
const params = (s: unknown) => (typeof s === 'string' ? (s.match(/\{\{\s*\w+\s*\}\}/g) || []).map((p) => p.replace(/\s/g, '')).sort() : []);

const en = flat(read('en.json'));

test('English is there, and every language is in LANGUAGES', () => {
  assert.ok(files.includes('en.json'));
  const i18n = fs.readFileSync(new URL('../src/i18n.ts', import.meta.url), 'utf8');
  files.forEach((f) => {
    const code = f.replace(/\.json$/, '');
    assert.ok(new RegExp(`code: '${code}'`).test(i18n), `${code} is not in LANGUAGES (src/i18n.ts)`);
  });
});

files.filter((f) => f !== 'en.json').forEach((f) => {
  test(`${f}: the same keys as English, with the same parameters, none empty`, () => {
    const texts = flat(read(f));
    const missing = Object.keys(en).filter((k) => !(k in texts));
    const extra = Object.keys(texts).filter((k) => !(k in en));
    assert.deepStrictEqual(missing, [], `not in ${f}`);
    assert.deepStrictEqual(extra, [], `in ${f} but not in English`);
    const badParams = Object.keys(en).filter((k) => JSON.stringify(params(en[k])) !== JSON.stringify(params(texts[k])));
    assert.deepStrictEqual(badParams, [], `parameters differ from English in ${f}`);
    const empty = Object.keys(texts).filter((k) => texts[k] === '' && en[k] !== '');
    assert.deepStrictEqual(empty, [], `empty in ${f}`);
  });
});
