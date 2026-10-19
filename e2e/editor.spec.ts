// The editor as it is used: what it shows, and what it saves and exports.
import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import { FIXTURES, reseed, boot, openMap, click, drag, hover, tool, download, keep, shot, settle, at, pageErrors } from './helpers';

test.afterEach(async ({ page }) => {
    expect(pageErrors(page)).toEqual([]);
});

test('empty screen (ja)', async ({ page }) => {
    await boot(page, { lang: 'ja' });
    await shot(page, 'empty-ja');
});

test('empty screen (en), then the language switched', async ({ page }) => {
    await boot(page, { lang: 'en' });
    await shot(page, 'empty-en');
    await page.locator('.sbx-status .sbx-lang').click();
    await shot(page, 'lang-menu');
    await page.locator('.sbx-lang-item', { hasText: '日本語' }).click();
    await settle(page);
    await shot(page, 'empty-en-to-ja');
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('ja');
});

// every language: its flag and name in the menu, and the page in it (the lang attribute, its texts)
test('the languages: each with its flag, each switching the page', async ({ page }) => {
    await boot(page, { lang: 'en' });
    await page.locator('.sbx-status .sbx-lang').click();
    const items = page.locator('.sbx-lang-item');
    await expect(items).toHaveCount(12);
    await expect(items.locator('img.sbx-lang-flag')).toHaveCount(12);
    await page.keyboard.press('Escape');
    const titles: Record<string, string> = { ja: 'マップを始めましょう', en: 'Start a map', es: 'Empieza un mapa', 'pt-BR': 'Comece um mapa',
        de: 'Eine Karte beginnen', 'zh-CN': '开始一张地图', ko: '맵 시작하기', fr: 'Commencer une carte', tr: 'Bir harita başlatın',
        id: 'Mulai sebuah peta', th: 'เริ่มแผนที่', 'zh-Hant': '開始一張地圖' };
    for (const [code, title] of Object.entries(titles)) {
        await page.locator('.sbx-status .sbx-lang').click();
        await page.locator(`.sbx-lang-item[lang="${code}"]`).click();
        await settle(page, 100);
        expect(await page.evaluate(() => document.documentElement.lang)).toBe(code);
        await expect(page.locator('.sbx-empty h2')).toHaveText(title);
    }
});

test('the start screen asks the year of the rules: 2027 (a draft) chosen, 2026 to choose; a new map is of the year chosen', async ({ page }) => {
    await boot(page);
    const choices = page.locator('.sbx-empty-rules-choices button');
    await expect(choices.filter({ hasText: '2027' })).toHaveAttribute('aria-checked', 'true');
    await expect(choices.filter({ hasText: '2027' }).locator('.sbx-rules-draft')).toBeVisible();
    await expect(choices.filter({ hasText: '2026' }).locator('.sbx-rules-draft')).toHaveCount(0);
    await expect(page.locator('.sbx-title')).not.toContainText('2026');
    await choices.filter({ hasText: '2026' }).click();
    await page.locator('.sbx-empty-actions .btn-primary').click();
    await settle(page);
    await expect(page.locator('.sbx-rules-btn')).toContainText('2026');
});

test('the rules menu: the map\'s year, its rule book, and 2027 (a draft) to switch to, asked first', async ({ page }) => {
    await boot(page);
    await openMap(page, 'mapA.json', { year: null });
    // a map file from before maps kept their year: of 2026, whatever year was chosen (2027)
    await expect(page.locator('.sbx-rules-btn')).toContainText('2026');
    await expect(page.locator('.sbx-notice')).toContainText('2026');
    await page.locator('.sbx-rules-btn').click();
    await shot(page, 'rules-menu');
    await expect(page.locator('.sbx-rules-item.active a')).toHaveAttribute('href', /RCJRescueSimulation2026/);
    const y2027 = page.locator('.sbx-rules-item', { hasText: '2027' });
    await expect(y2027.locator('a')).toHaveAttribute('href', /RCJRescueSimulation2027-draft/);
    await expect(y2027.locator('.sbx-rules-draft')).toBeVisible();
    await y2027.locator('button').click();
    await expect(page.locator('.sbx-dialog')).toBeVisible();
    await page.locator('.sbx-dialog-btn', { hasText: '切り替える' }).click();
    await settle(page);
    await expect(page.locator('.sbx-rules-btn')).toContainText('2027');
    await page.keyboard.press('Control+z');
    await settle(page);
    await expect(page.locator('.sbx-rules-btn')).toContainText('2026');
});

test('the work kept opens only in the rules of its year: chosen first, switched after by the rules menu', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
        const map = { name: 'Kept 2026', width: 2, length: 1, height: 1, cells: {}, roomTiles: [[], [], []], startTile: { x: 0, y: 0, z: 0 }, rules: 2026 };
        localStorage.setItem('simBeta2026.autosave', JSON.stringify({ time: Date.now(), map }));
    });
    await page.reload();
    await settle(page, 400);
    const restore = page.locator('.sbx-restore');
    await expect(restore).toContainText('2026');
    await expect(restore).toBeDisabled();
    await expect(page.locator('.sbx-restore-note')).toBeVisible();
    await shot(page, 'restore-other-year');
    await page.locator('.sbx-empty-rules-choices button', { hasText: '2026' }).click();
    await expect(restore).toBeEnabled();
    await expect(page.locator('.sbx-restore-note')).toHaveCount(0);
    await restore.click();
    await settle(page);
    await expect(page.locator('.sbx-rules-btn')).toContainText('2026');
});

test('2027: contact tiles only beside the outer wall, smiley victims', async ({ page }) => {
    await boot(page);
    await page.locator('.sbx-empty-actions .btn-primary').click();
    await settle(page, 400);
    await tool(page, 'floor');
    await page.locator('.sbx-choice', { hasText: 'コンタクトタイル' }).click();
    // a tile inside: refused, and said why
    await click(page, 30, 30);
    await expect(page.locator('.sbx-status')).toContainText('外周の壁に接するタイルにだけ');
    await click(page, 6, 30);
    await tool(page, 'victim');
    await click(page, 18, 1);
    await hover(page, 66, 2);
    await shot(page, 'contact-smiley-2027');
});

test('the β menu: the link to the classic editor of 2026; 2027 has none', async ({ page }) => {
    await boot(page);
    await page.locator('.sbx-beta-btn').click();
    await expect(page.locator('.sbx-beta-menu')).toBeVisible();
    await expect(page.locator('.sbx-beta-menu-item')).toHaveCount(0);
    await shot(page, 'beta-menu-2027');
    await page.locator('.sbx-beta-back').click();
    await page.locator('.sbx-empty-rules-choices button', { hasText: '2026' }).click();
    await page.locator('.sbx-beta-btn').click();
    await shot(page, 'beta-menu');
    const link = page.locator('.sbx-beta-menu-item');
    await expect(link).toHaveAttribute('href', 'https://osaka.rcj.cloud/service/editor/simulation/2026/classic');
    await expect(link).toHaveAttribute('target', '_blank');
    await page.locator('.sbx-beta-back').click();
    await expect(page.locator('.sbx-beta-menu')).toHaveCount(0);
});

test('a new map, and its size', async ({ page }) => {
    await boot(page);
    await page.locator('.sbx-empty-actions .btn-primary').click();
    await settle(page, 400);
    await shot(page, 'new-map');
    await page.locator('.sbx-size-field').nth(0).locator('button').nth(1).click();
    await settle(page, 200);
    await page.locator('.sbx-size-field input').nth(1).fill('5');
    await page.locator('.sbx-size-field input').nth(1).press('Enter');
    await settle(page, 300);
    await shot(page, 'new-map-resized');
});

test('a map opened: every tool and its panel', async ({ page }) => {
    await boot(page);
    await openMap(page, 'mapA.json');
    await shot(page, 'mapA-open');
    for (const id of ['select', 'hand', 'shape', 'room', 'passage', 'line', 'curve', 'eraser', 'floor', 'victim']) {
        await tool(page, id);
        await hover(page, 30, 30);
        await shot(page, 'tool-' + id);
    }
});

test('the tools by their keys', async ({ page }) => {
    await boot(page);
    await openMap(page, 'mapA.json');
    await hover(page, 30, 30);
    for (const k of ['S', 'H', 'X', 'M', 'P', 'L', 'A', 'E', 'F', 'V']) {
        await page.keyboard.press(k.toLowerCase());
        await settle(page, 60);
        await expect(page.locator('.sbx-rail .sbx-tool.active')).toHaveCount(1);
        await expect(page.locator('.sbx-tool.active .sbx-tool-key')).toHaveText(k);
    }
});

test('drawing walls, undo and redo, and what is saved', async ({ page }) => {
    await boot(page);
    await openMap(page, 'mapA.json');
    await tool(page, 'line');
    await drag(page, [[12, 12], [48, 12], [48, 48]]);
    await shot(page, 'line-drawn');
    await drag(page, [[60, 24], [84, 24]], { shift: true });
    await page.keyboard.press('Control+z');
    await settle(page);
    await shot(page, 'line-undone');
    await page.keyboard.press('Control+Shift+z');
    await settle(page);
    await page.locator('.sbx-history button').nth(0).click();
    await page.locator('.sbx-history button').nth(1).click();
    await settle(page);
    await shot(page, 'line-redone');
    const saved = await download(page, () => page.locator('.sbx-file button').nth(2).click());
    expect(saved.name).toMatch(/\.json$/);
    keep('walls.json', saved.text);
});

test('rooms, passages, floors, curves and the eraser', async ({ page }) => {
    await boot(page);
    await openMap(page, 'mapA.json');
    await tool(page, 'room');
    await page.locator('.sbx-choice').nth(1).click();
    await drag(page, [[54, 6], [66, 6], [66, 18]]);
    await page.locator('.sbx-choice').nth(2).click();
    await drag(page, [[78, 42], [90, 54]]);
    await shot(page, 'rooms-painted');
    await tool(page, 'passage');
    await hover(page, 48, 8);
    await shot(page, 'passage-hover');
    await click(page, 48, 8);
    await click(page, 72, 44);
    await shot(page, 'passages');
    // the passage clicks' notices gone (they stay 4 s), so the floors' shot is the same at any pace
    await settle(page, 4200);
    await tool(page, 'floor');
    for (const [i, x, y] of [[3, 6, 6], [0, 18, 54], [1, 30, 54], [2, 42, 54]] as [number, number, number][]) {
        await page.locator('.sbx-choice').nth(i).click();
        await click(page, x, y);
    }
    await shot(page, 'floors');
    // the notices of the clicks gone (they stay 4 s)
    await settle(page, 4200);
    await tool(page, 'curve');
    await hover(page, 57, 9);
    await shot(page, 'curve-hover');
    await click(page, 57, 9);
    await tool(page, 'eraser');
    await click(page, 42, 54);
    await hover(page, 12, 30);
    await shot(page, 'eraser');
    const saved = await download(page, () => page.locator('.sbx-file button').nth(2).click());
    keep('rooms.json', saved.text);
});

test('victims: placed, selected, turned, changed; a cognitive target', async ({ page }) => {
    await boot(page);
    await openMap(page, 'mapA.json');
    await tool(page, 'victim');
    await page.locator('.sbx-seg button').nth(0).click();
    await settle(page);
    await shot(page, 'victim-fixed-rot');
    await click(page, 6, 2);
    await click(page, 30, 2);
    await click(page, 6, 2);
    await shot(page, 'victim-selected');
    await page.locator('.sbx-selected .sim-rot-presets button').nth(1).click();
    await page.locator('.sbx-selected .sbx-choice.letter').nth(2).click();
    await page.locator('.sbx-selected .sbx-check input').click();
    await settle(page);
    await shot(page, 'victim-changed');
    await page.locator('.sbx-selected-head .btn-link').click();
    await page.locator('.sim-r4-stamp').nth(4).click();
    await click(page, 2, 30);
    await page.locator('.sim-r4-stamp').nth(6).click();
    await settle(page);
    await shot(page, 'ct-picker');
    await page.locator('.sbx-ct-swatch').nth(4).click();
    await page.locator('.sbx-ct-swatch').nth(1).click();
    await click(page, 42, 2);
    await shot(page, 'ct-placed');
    const saved = await download(page, () => page.locator('.sbx-file button').nth(2).click());
    keep('victims.json', saved.text);
});

test('victims: put where clicked along the wall, dragged along it, moved in the panel', async ({ page }) => {
    await boot(page);
    await openMap(page, 'mapA.json');
    await tool(page, 'victim');
    await page.locator('.sbx-seg button').nth(0).click();
    // the top wall of tile (5, 1) (room 1, 24-36 cm): a click 3 cm right of its middle
    await hover(page, 33, 2);
    await shot(page, 'victim-along-hover');
    await click(page, 33, 2);
    await click(page, 33, 4);
    await expect(page.locator('.sbx-along-value')).toHaveText('+3.0 cm');
    // dragged to the left: it stops short of the wall at the tile's left end (24 cm) - none there,
    // so at the tile's corner less its half width
    await drag(page, [[33, 4], [20, 4]]);
    await expect(page.locator('.sbx-along-value')).toHaveText('−5.0 cm');
    await shot(page, 'victim-dragged');
    // back to the middle, then 2 cm with the slider; undo goes back one step at a time
    await page.locator('.sbx-along-foot .btn-link').click();
    await expect(page.locator('.sbx-along-value')).toHaveText('0.0 cm');
    await page.locator('.sbx-along-range').fill('2');
    await expect(page.locator('.sbx-along-value')).toHaveText('+2.0 cm');
    await settle(page);
    await shot(page, 'victim-slid');
    await page.keyboard.press('Control+z');
    await settle(page);
    await click(page, 30, 4);
    await expect(page.locator('.sbx-along-value')).toHaveText('0.0 cm');
    await page.keyboard.press('Control+Shift+z');
    await settle(page);
    await click(page, 32, 4);
    await expect(page.locator('.sbx-along-value')).toHaveText('+2.0 cm');
    // a click on the face away from it moves the tile's victim there
    await click(page, 26, 2);
    await click(page, 26, 4);
    await expect(page.locator('.sbx-along-value')).toHaveText('−4.0 cm');
    const saved = await download(page, () => page.locator('.sbx-file button').nth(2).click());
    keep('victims-along.json', saved.text);
    expect(JSON.parse(saved.text).cells['5,1,0'].tile.victim_offset).toBe(-4);
    await reseed(page, 5);
    const world = await download(page, () => page.locator('.sbx-export').click());
    keep('victims-along.wbt', world.text);
});

test('select: a region copied, pasted, moved and cleared', async ({ page }) => {
    await boot(page);
    await openMap(page, 'mapB.json');
    await tool(page, 'select');
    await drag(page, [[4, 4], [28, 28]]);
    await shot(page, 'region');
    await page.keyboard.press('Control+c');
    await hover(page, 66, 54);
    await page.keyboard.press('Control+v');
    await settle(page);
    await page.keyboard.press('ArrowRight');
    await drag(page, [[70, 58], [94, 58]], { alt: true });
    await shot(page, 'region-pasted');
    await page.keyboard.press('Delete');
    // the notices of the paste and the move gone (they stay 4 s), so the shot is the same at any pace
    await settle(page, 4200);
    await shot(page, 'region-cleared');
    const saved = await download(page, () => page.locator('.sbx-file button').nth(2).click());
    keep('region.json', saved.text);
});

test('shape: rows and columns added and taken out', async ({ page }) => {
    await boot(page);
    await openMap(page, 'mapC.json');
    await tool(page, 'shape');
    await page.locator('.sbx-shape-modes .sbx-choice').nth(1).click();
    await hover(page, 30, 24);
    await shot(page, 'shape-addrow-hover');
    await click(page, 30, 24);
    await page.locator('.sbx-shape-modes .sbx-choice').nth(4).click();
    await hover(page, 30, 30);
    await shot(page, 'shape-delcol-hover');
    await click(page, 30, 30);
    await page.locator('.sbx-shape-modes .sbx-choice').nth(0).click();
    await click(page, 6, 6);
    await shot(page, 'shape-done');
    const saved = await download(page, () => page.locator('.sbx-file button').nth(2).click());
    keep('shape.json', saved.text);
});

test('checks: pointed out, fixed one by one and all; linear tiles', async ({ page }) => {
    await boot(page);
    await openMap(page, 'mapB.json');
    await shot(page, 'mapB-open');
    const items = page.locator('.sbx-problems li');
    if (await items.count()) {
        await items.nth(0).hover();
        await settle(page);
        await shot(page, 'problem-pointed');
        await items.nth(0).click();
        await settle(page);
    }
    await page.locator('.sbx-linear button').click();
    await settle(page);
    await shot(page, 'linear');
    await page.locator('.sbx-checks-head').click();
    await settle(page);
    await shot(page, 'checks-folded');
    await page.locator('.sbx-checks-head').click();
    if (await page.locator('.sbx-fix-all').count()) await page.locator('.sbx-fix-all').click();
    await settle(page);
    await shot(page, 'fixed-all');
});

test('export: blocked by problems, then the world file', async ({ page }) => {
    await boot(page);
    await page.locator('.sbx-empty-actions .btn-primary').click();
    await settle(page, 400);
    await page.locator('.sbx-export').click();
    await settle(page);
    await shot(page, 'export-blocked');
    await page.keyboard.press('Escape');
    await openMapAfterDiscard(page, 'mapA.json');
    await reseed(page, 12);
    const world = await download(page, () => page.locator('.sbx-export').click());
    expect(world.name).toMatch(/\.wbt$/);
    keep('mapA.wbt', world.text);
});

async function openMapAfterDiscard(page: Page, name: string): Promise<void> {
    await page.locator('#simBetaFile').setInputFiles(path.join(FIXTURES, name));
    await settle(page, 400);
    if (await page.locator('.sbx-dialog').count()) {
        await shot(page, 'discard-dialog');
        await page.locator('.sbx-dialog-btn.danger').click();
        await settle(page, 400);
    }
}

test('unsaved changes: asked before a new map; the work kept is offered again', async ({ page }) => {
    await boot(page);
    await openMap(page, 'mapA.json');
    await tool(page, 'line');
    await drag(page, [[12, 36], [60, 36]]);
    await page.locator('.sbx-file button').nth(0).click();
    await settle(page);
    await shot(page, 'discard-new');
    await page.locator('.sbx-dialog-btn').nth(0).click();
    await settle(page, 1000);
    await page.reload();
    await settle(page, 500);
    // the work kept is of 2026: opened with 2026 chosen
    await page.locator('.sbx-empty-rules-choices button', { hasText: '2026' }).click();
    await settle(page);
    await shot(page, 'restore-offered');
    await page.locator('.sbx-restore').click();
    await settle(page, 400);
    await shot(page, 'restored');
});

test('wheel zoom, fit, and the hand', async ({ page }) => {
    await boot(page);
    await openMap(page, 'mapA.json');
    const p = await at(page, 48, 36);
    await page.mouse.move(p[0], p[1]);
    await page.mouse.wheel(0, -300);
    await settle(page, 300);
    await shot(page, 'zoomed');
    await tool(page, 'hand');
    await drag(page, [[48, 36], [20, 20]]);
    await shot(page, 'panned');
    await page.locator('.sbx-view button').nth(2).click();
    await page.locator('.sbx-view button').nth(0).click();
    await settle(page, 300);
    await shot(page, 'zoom-out-fit');
});

test('a smaller window', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 680 });
    await boot(page);
    await shot(page, 'small-empty');
    await openMap(page, 'mapB.json');
    await tool(page, 'victim');
    await shot(page, 'small-victim');
});
