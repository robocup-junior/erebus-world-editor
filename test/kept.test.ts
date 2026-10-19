// What the editor keeps in this browser: what an earlier version kept under its own keys is moved to
// the editor's, and is not put over what the editor already keeps
import { test } from 'vitest';
import assert from 'node:assert';
import { KEPT, carryOver } from '../src/lib/kept';

function storage(items: Record<string, string>) {
  const m = new Map(Object.entries(items));
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
    all: () => Object.fromEntries(m)
  };
}

test('the work, the guide seen and the language kept by earlier versions are carried over', () => {
  const s = storage({ 'simBeta2026.autosave': '{"map":1}', 'simBeta2026.tourSeen': '1', 'NG_TRANSLATE_LANG_KEY': 'ja', [KEPT.guideAsked]: '1', 'simBeta2026.guideAsked': 'old' });
  (globalThis as any).window = { localStorage: s };
  try {
    carryOver();
    assert.deepStrictEqual(s.all(), { [KEPT.autosave]: '{"map":1}', [KEPT.tourSeen]: '1', [KEPT.lang]: 'ja', [KEPT.guideAsked]: '1' });
    carryOver();
    assert.deepStrictEqual(Object.keys(s.all()).sort(), [KEPT.autosave, KEPT.guideAsked, KEPT.lang, KEPT.tourSeen].sort());
  } finally {
    delete (globalThis as any).window;
  }
});
