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
    await page.locator('.ed-status .ed-lang').click();
    await shot(page, 'lang-menu');
    await page.locator('.ed-lang-item', { hasText: '日本語' }).click();
    await settle(page);
    await shot(page, 'empty-en-to-ja');
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('ja');
});

// every language: its flag and name in the menu, and the page in it (the lang attribute, its texts)
test('the languages: each with its flag, each switching the page', async ({ page }) => {
    await boot(page, { lang: 'en' });
    await page.locator('.ed-status .ed-lang').click();
    const items = page.locator('.ed-lang-item');
    await expect(items).toHaveCount(12);
    await expect(items.locator('img.ed-lang-flag')).toHaveCount(12);
    await page.keyboard.press('Escape');
    const titles: Record<string, string> = { ja: 'マップを始めましょう', en: 'Start a map', es: 'Empieza un mapa', 'pt-BR': 'Comece um mapa',
        de: 'Eine Karte beginnen', 'zh-CN': '开始一张地图', ko: '맵 시작하기', fr: 'Commencer une carte', tr: 'Bir harita başlatın',
        id: 'Mulai sebuah peta', th: 'เริ่มแผนที่', 'zh-Hant': '開始一張地圖' };
    for (const [code, title] of Object.entries(titles)) {
        await page.locator('.ed-status .ed-lang').click();
        await page.locator(`.ed-lang-item[lang="${code}"]`).click();
        await settle(page, 100);
        expect(await page.evaluate(() => document.documentElement.lang)).toBe(code);
        await expect(page.locator('.ed-empty h2')).toHaveText(title);
    }
});

// a phone (or a window made that small): the notice over everything, and the editor behind takes
// nothing, no click and no key; made big enough again, the editor is as it was
test('a screen too small: the notice, nothing taken behind it, and the editor back when big enough', async ({ page }) => {
    await boot(page);
    await openMap(page, 'mapA.json');
    const name = await page.locator('.ed-name-input').inputValue();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('.ed-small')).toBeVisible();
    await expect(page.locator('.ed-small-title')).toHaveText('この画面ではエディタを使えません');
    await expect(page.locator('.ed-small-size span')).toHaveText('このウィンドウ：390 × 844');
    await shot(page, 'small-phone');
    // a click goes to the notice, not to the name behind it; typing changes nothing
    await page.mouse.click(195, 20);
    await page.keyboard.type('xyz');
    await page.keyboard.press('Control+Z');
    // a phone on its side: too low; a tablet held upright: too narrow; on its side, big enough
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.locator('.ed-small')).toBeVisible();
    await page.setViewportSize({ width: 820, height: 1180 });
    await expect(page.locator('.ed-small')).toBeVisible();
    await page.setViewportSize({ width: 1180, height: 820 });
    await expect(page.locator('.ed-small')).toBeHidden();
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.locator('.ed-small')).toBeHidden();
    await expect(page.locator('.ed-name-input')).toHaveValue(name);
    await expect(page.locator('.ed')).not.toHaveAttribute('inert');
    await shot(page, 'mapA-open');
});

test('the start screen asks the year of the rules: 2027 (a draft) chosen, 2026 to choose; a new map is of the year chosen', async ({ page }) => {
    await boot(page);
    const choices = page.locator('.ed-empty-rules-choices button');
    await expect(choices.filter({ hasText: '2027' })).toHaveAttribute('aria-checked', 'true');
    await expect(choices.filter({ hasText: '2027' }).locator('.ed-rules-draft')).toBeVisible();
    await expect(choices.filter({ hasText: '2026' }).locator('.ed-rules-draft')).toHaveCount(0);
    await expect(page.locator('.ed-title')).not.toContainText('2026');
    await choices.filter({ hasText: '2026' }).click();
    await page.locator('.ed-empty-actions .btn-primary').click();
    await settle(page);
    await expect(page.locator('.ed-rules-btn')).toContainText('2026');
});

test('the rules menu: the map\'s year, its rule book, and 2027 (a draft) to switch to, asked first', async ({ page }) => {
    await boot(page);
    await openMap(page, 'mapA.json', { year: null });
    // a map file from before maps kept their year: of 2026, whatever year was chosen (2027)
    await expect(page.locator('.ed-rules-btn')).toContainText('2026');
    await expect(page.locator('.ed-notice')).toContainText('2026');
    await page.locator('.ed-rules-btn').click();
    await shot(page, 'rules-menu');
    await expect(page.locator('.ed-rules-item.active a')).toHaveAttribute('href', /RCJRescueSimulation2026/);
    const y2027 = page.locator('.ed-rules-item', { hasText: '2027' });
    await expect(y2027.locator('a')).toHaveAttribute('href', /RCJRescueSimulation2027-draft/);
    await expect(y2027.locator('.ed-rules-draft')).toBeVisible();
    await y2027.locator('button').click();
    await expect(page.locator('.ed-dialog')).toBeVisible();
    await page.locator('.ed-dialog-btn', { hasText: '切り替える' }).click();
    await settle(page);
    await expect(page.locator('.ed-rules-btn')).toContainText('2027');
    await page.keyboard.press('Control+z');
    await settle(page);
    await expect(page.locator('.ed-rules-btn')).toContainText('2026');
});

test('the work kept opens only in the rules of its year: chosen first, switched after by the rules menu', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
        const map = { name: 'Kept 2026', width: 2, length: 1, height: 1, cells: {}, roomTiles: [[], [], []], startTile: { x: 0, y: 0, z: 0 }, rules: 2026 };
        localStorage.setItem('erebusEditor.autosave', JSON.stringify({ time: Date.now(), map }));
    });
    await page.reload();
    await settle(page, 400);
    const restore = page.locator('.ed-restore');
    await expect(restore).toContainText('2026');
    await expect(restore).toBeDisabled();
    await expect(page.locator('.ed-restore-note')).toBeVisible();
    await shot(page, 'restore-other-year');
    await page.locator('.ed-empty-rules-choices button', { hasText: '2026' }).click();
    await expect(restore).toBeEnabled();
    await expect(page.locator('.ed-restore-note')).toHaveCount(0);
    await restore.click();
    await settle(page);
    await expect(page.locator('.ed-rules-btn')).toContainText('2026');
});

test('2027: contact tiles on any tile, smiley victims', async ({ page }) => {
    await boot(page);
    await page.locator('.ed-empty-actions .btn-primary').click();
    await settle(page, 400);
    await tool(page, 'floor');
    await page.locator('.ed-choice', { hasText: 'コンタクトタイル' }).click();
    // a tile inside and one beside the outer wall: both take it
    await click(page, 30, 30);
    await click(page, 6, 30);
    await tool(page, 'victim');
    await click(page, 18, 1);
    await hover(page, 66, 2);
    await shot(page, 'contact-smiley-2027');
});

test('the β menu: the link to the classic editor of 2026; 2027 has none', async ({ page }) => {
    await boot(page);
    await page.locator('.ed-beta-btn').click();
    await expect(page.locator('.ed-beta-menu')).toBeVisible();
    await expect(page.locator('.ed-beta-menu-item')).toHaveCount(0);
    await shot(page, 'beta-menu-2027');
    await page.locator('.ed-beta-back').click();
    await page.locator('.ed-empty-rules-choices button', { hasText: '2026' }).click();
    await page.locator('.ed-beta-btn').click();
    await shot(page, 'beta-menu');
    const link = page.locator('.ed-beta-menu-item');
    await expect(link).toHaveAttribute('href', 'https://osaka.rcj.cloud/service/editor/simulation/2026/classic');
    await expect(link).toHaveAttribute('target', '_blank');
    await page.locator('.ed-beta-back').click();
    await expect(page.locator('.ed-beta-menu')).toHaveCount(0);
});

test('a new map, and its size', async ({ page }) => {
    await boot(page);
    await page.locator('.ed-empty-actions .btn-primary').click();
    await settle(page, 400);
    await shot(page, 'new-map');
    await page.locator('.ed-size-field').nth(0).locator('button').nth(1).click();
    await settle(page, 200);
    await page.locator('.ed-size-field input').nth(1).fill('5');
    await page.locator('.ed-size-field input').nth(1).press('Enter');
    await settle(page, 300);
    await shot(page, 'new-map-resized');
});

test('a map opened: every tool and its panel', async ({ page }) => {
    await boot(page);
    await openMap(page, 'mapA.json');
    await shot(page, 'mapA-open');
    for (const id of ['select', 'hand', 'shape', 'room', 'passage', 'line', 'curve', 'eraser', 'floor', 'obstacle', 'victim']) {
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
        await expect(page.locator('.ed-rail .ed-tool.active')).toHaveCount(1);
        await expect(page.locator('.ed-tool.active .ed-tool-key')).toHaveText(k);
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
    await page.locator('.ed-history button').nth(0).click();
    await page.locator('.ed-history button').nth(1).click();
    await settle(page);
    await shot(page, 'line-redone');
    const saved = await download(page, () => page.locator('.ed-file button').nth(2).click());
    expect(saved.name).toMatch(/\.json$/);
    keep('walls.json', saved.text);
});

test('rooms, passages, floors, curves and the eraser', async ({ page }) => {
    await boot(page);
    await openMap(page, 'mapA.json');
    await tool(page, 'room');
    await page.locator('.ed-choice').nth(1).click();
    await drag(page, [[54, 6], [66, 6], [66, 18]]);
    await page.locator('.ed-choice').nth(2).click();
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
    for (const [i, x, y] of [[3, 6, 6], [0, 18, 54], [1, 30, 54], [2, 42, 66]] as [number, number, number][]) {
        await page.locator('.ed-choice').nth(i).click();
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
    await click(page, 42, 66);
    await hover(page, 12, 30);
    await shot(page, 'eraser');
    const saved = await download(page, () => page.locator('.ed-file button').nth(2).click());
    keep('rooms.json', saved.text);
});

test('victims: placed, selected, turned, changed; a cognitive target', async ({ page }) => {
    await boot(page);
    await openMap(page, 'mapA.json');
    await tool(page, 'victim');
    await page.locator('.ed-seg button').nth(0).click();
    await settle(page);
    await shot(page, 'victim-fixed-rot');
    await click(page, 6, 2);
    await click(page, 30, 2);
    await click(page, 6, 2);
    await shot(page, 'victim-selected');
    // the selected one changed from the panel below: turned (the dial), made a fake U (the kind's button)
    await page.locator('.ed-dial .rot-presets button').nth(1).click();
    await page.locator('.r4-stamp').nth(5).click();
    await settle(page);
    await expect(page.locator('.r4-stamp').nth(5)).toHaveClass(/active/);
    await shot(page, 'victim-changed');
    const changed = JSON.parse((await download(page, () => page.locator('.ed-file button').nth(2).click())).text);
    const tile = changed.cells['1,1,0'].tile;
    expect([tile.victims.top, tile.victim_is_fake, tile.single_victim_rotation]).toEqual(['U', true, 90]);
    await page.locator('.ed-selected-head .btn-link').click();
    await page.locator('.r4-stamp').nth(4).click();
    await click(page, 2, 30);
    await page.locator('.r4-stamp').nth(6).click();
    await settle(page);
    await shot(page, 'ct-picker');
    await page.locator('.ed-ct-swatch').nth(4).click();
    await page.locator('.ed-ct-swatch').nth(1).click();
    await click(page, 42, 2);
    await shot(page, 'ct-placed');
    const saved = await download(page, () => page.locator('.ed-file button').nth(2).click());
    keep('victims.json', saved.text);
});

test('victims: put where clicked along the wall, dragged along it', async ({ page }) => {
    await boot(page);
    await openMap(page, 'mapA.json');
    await tool(page, 'victim');
    await page.locator('.ed-seg button').nth(0).click();
    // where tile (2, 0)'s victim is along its wall (cm from its middle), as saved
    const offset = async () => JSON.parse((await download(page, () => page.locator('.ed-file button').nth(2).click())).text).cells['5,1,0'].tile.victim_offset;
    const status = page.locator('.ed-status');
    // the top wall of tile (2, 0) (room 1, 24-36 cm): a click 3 cm right of its middle
    await hover(page, 33, 2);
    await shot(page, 'victim-along-hover');
    await click(page, 33, 2);
    expect(await offset()).toBe(3);
    // dragged to the left: it stops short of the wall at the tile's left end (24 cm) - none there,
    // so at the tile's corner less its half width
    await drag(page, [[33, 4], [20, 4]]);
    await expect(status).toContainText('−5.0 cm');
    await shot(page, 'victim-dragged');
    // dragged back to 2 cm right of the middle; undo goes back one step at a time
    await drag(page, [[25, 4], [32, 4]]);
    await expect(status).toContainText('+2.0 cm');
    await settle(page);
    await shot(page, 'victim-slid');
    await page.keyboard.press('Control+z');
    await settle(page);
    expect(await offset()).toBe(-5);
    await page.keyboard.press('Control+Shift+z');
    await settle(page);
    expect(await offset()).toBe(2);
    // a click on the face away from it moves the tile's victim there
    await click(page, 26, 2);
    const saved = await download(page, () => page.locator('.ed-file button').nth(2).click());
    keep('victims-along.json', saved.text);
    expect(JSON.parse(saved.text).cells['5,1,0'].tile.victim_offset).toBe(-4);
    await reseed(page, 5);
    const world = await download(page, () => page.locator('.ed-export').click());
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
    const saved = await download(page, () => page.locator('.ed-file button').nth(2).click());
    keep('region.json', saved.text);
});

test('select: a victim or an obstacle clicked opens its tool with it picked; a wall is picked and taken off', async ({ page }) => {
    await boot(page);
    await openMap(page, 'mapA.json');
    await tool(page, 'victim');
    await page.locator('.ed-seg button').nth(0).click();
    await click(page, 33, 2);
    await tool(page, 'obstacle');
    await click(page, 6, 30);
    const head = page.locator('.ed-tool-panel .ed-selected-head');
    // a victim: the victim tool, it picked, and dragged along its wall in the same press
    await tool(page, 'select');
    await drag(page, [[33, 4], [35, 4]]);
    await expect(page.locator('.ed-rail [data-tool="victim"]')).toHaveClass(/active/);
    await expect(head).toContainText('選択中の被災者');
    await expect(page.locator('.ed-status')).toContainText('+5.0 cm');
    // the drag is one step to undo, as in the victim tool
    await page.keyboard.press('Control+z');
    await settle(page, 300);
    const saved = await download(page, () => page.locator('.ed-file button').nth(2).click());
    expect(JSON.parse(saved.text).cells['5,1,0'].tile.victim_offset).toBe(3);
    // an obstacle: the floor tool's obstacle, it picked
    await tool(page, 'select');
    await click(page, 6, 30);
    await expect(page.locator('.ed-rail [data-tool="obstacle"]')).toHaveClass(/active/);
    await expect(head).toContainText('選んだ障害物');
    // a wall: picked here (no tool picks walls), a straight run of it, taken off with Delete
    await tool(page, 'select');
    await hover(page, 12.3, 20);
    await click(page, 12.3, 20);
    await expect(head).toContainText('選んだ壁');
    await expect(page.locator('.ed-tool-panel .ed-selected .ed-muted').first()).toHaveText('長さ 12 cm');
    await settle(page, 4200);
    await shot(page, 'select-wall');
    await page.keyboard.press('Delete');
    await expect(head).toHaveCount(0);
    // the floor: a region of tiles, as before
    await click(page, 66, 66);
    await expect(page.locator('.ed-region-size')).toContainText('1 × 1');
});

test('JSON: obstacles of each kind saved, the file opened again, and saved the same', async ({ page }) => {
    await boot(page);
    await openMap(page, 'mapA.json');
    await tool(page, 'obstacle');
    // a box turned, a regular prism, an outline drawn, an icon (each put, then let go: the panel
    // changes the one picked)
    const letGo = () => page.locator('.ed-selected-head .btn-link').click();
    await page.locator('.ed-obstacle-field input[data-field=rot]').fill('30');
    await page.locator('.ed-obstacle-color[data-color="#dc2626"]').click();
    await click(page, 6, 30);
    await letGo();
    await page.locator('.ed-obstacle-shapes [data-shape=prism]').click();
    await page.locator('.ed-obstacle-field input[data-field=n]').fill('5');
    // a colour of its own: the editor's colour picker, its code typed
    await page.locator('.ed-obstacle-color.more').click();
    await page.locator('.ed-color-hex').fill('#1e90ff');
    await page.locator('.ed-color-hex').press('Enter');
    await click(page, 18, 54);
    await letGo();
    await page.locator('.ed-obstacle-shapes [data-shape=polygon]').click();
    await expect(page.locator('.ed-obstacle-shapes [data-shape=polygon]')).toHaveClass(/active/);   // drawing one: chosen
    await expect(page.locator('.ed-obstacle-shapes [data-shape=prism]')).not.toHaveClass(/active/);
    for (const [x, y] of [[13.5, 61], [22, 61], [22, 64.5], [17, 64.5], [17, 70], [13.5, 70]]) await click(page, x, y);
    await page.keyboard.press('Enter');
    await letGo();
    await page.locator('.ed-obstacle-shapes [data-shape=icon]').click();
    await expect(page.locator('.ed-obstacle-shapes [data-shape=icon]')).toHaveClass(/active/);      // looking for one: chosen
    await page.locator('.ed-obstacle-icons input[type=search]').fill('car');
    await page.locator('.ed-obstacle-icons .r4-icon-grid button[title="Car"]').click();
    await expect(page.locator('.ed-obstacle-shapes [data-shape=icon]')).toHaveClass(/active/);
    await click(page, 42, 6);
    await settle(page, 300);
    const first = await download(page, () => page.locator('.ed-file button').nth(2).click());
    const tiles = JSON.parse(first.text).cells;
    const shapes = ['1,5,0', '3,9,0', '3,11,0', '7,1,0'].map((k) => tiles[k].tile.obstacleShape && tiles[k].tile.obstacleShape.shape);
    expect(shapes).toEqual(['box', 'prism', 'polygon', 'icon']);
    expect(tiles['1,5,0'].tile.obstacleShape.rot).toBeCloseTo(30 * Math.PI / 180, 2);
    expect([tiles['1,5,0'].tile.obstacleShape.color, tiles['3,9,0'].tile.obstacleShape.color]).toEqual(['#dc2626', '#1e90ff']);
    // opened again (the work kept is let go) and saved: the same file
    await page.locator('#edFile').setInputFiles({ name: 'mapA-obstacles.json', mimeType: 'application/json', buffer: Buffer.from(first.text) });
    await settle(page, 400);
    if (await page.locator('.ed-dialog').count()) { await page.locator('.ed-dialog-btn.danger').click(); await settle(page, 400); }
    await expect(page.locator('.ed-name-input')).toBeVisible();
    await settle(page, 300);
    // nothing of the map before picked: the panel is for the next obstacle to put
    await expect(page.locator('.ed-obstacle .ed-selected-head')).toContainText('次に置く障害物');
    await shot(page, 'json-reopened');
    const second = await download(page, () => page.locator('.ed-file button').nth(2).click());
    expect(second.text).toBe(first.text);
    keep('obstacles.json', second.text);
});

test('shape: rows and columns added and taken out', async ({ page }) => {
    await boot(page);
    await openMap(page, 'mapC.json');
    await tool(page, 'shape');
    await page.locator('.ed-shape-modes .ed-choice').nth(1).click();
    await hover(page, 30, 24);
    await shot(page, 'shape-addrow-hover');
    await click(page, 30, 24);
    await page.locator('.ed-shape-modes .ed-choice').nth(4).click();
    await hover(page, 30, 30);
    await shot(page, 'shape-delcol-hover');
    await click(page, 30, 30);
    await page.locator('.ed-shape-modes .ed-choice').nth(0).click();
    await click(page, 6, 6);
    await shot(page, 'shape-done');
    const saved = await download(page, () => page.locator('.ed-file button').nth(2).click());
    keep('shape.json', saved.text);
});

test('checks: pointed out, fixed one by one and all; linear tiles', async ({ page }) => {
    await boot(page);
    await openMap(page, 'mapB.json');
    await shot(page, 'mapB-open');
    const items = page.locator('.ed-problems li');
    if (await items.count()) {
        await items.nth(0).hover();
        await settle(page);
        await shot(page, 'problem-pointed');
        await items.nth(0).click();
        await settle(page);
    }
    await page.locator('.ed-linear button').click();
    await settle(page);
    await shot(page, 'linear');
    await page.locator('.ed-checks-head').click();
    await settle(page);
    await shot(page, 'checks-folded');
    await page.locator('.ed-checks-head').click();
    if (await page.locator('.ed-fix-all').count()) await page.locator('.ed-fix-all').click();
    await settle(page);
    await shot(page, 'fixed-all');
});

test('export: blocked by problems, then the world file', async ({ page }) => {
    await boot(page);
    await page.locator('.ed-empty-actions .btn-primary').click();
    await settle(page, 400);
    await page.locator('.ed-export').click();
    await settle(page);
    await shot(page, 'export-blocked');
    await page.keyboard.press('Escape');
    await openMapAfterDiscard(page, 'mapA.json');
    await reseed(page, 12);
    const world = await download(page, () => page.locator('.ed-export').click());
    expect(world.name).toMatch(/\.wbt$/);
    keep('mapA.wbt', world.text);
});

async function openMapAfterDiscard(page: Page, name: string): Promise<void> {
    await page.locator('#edFile').setInputFiles(path.join(FIXTURES, name));
    await settle(page, 400);
    if (await page.locator('.ed-dialog').count()) {
        await shot(page, 'discard-dialog');
        await page.locator('.ed-dialog-btn.danger').click();
        await settle(page, 400);
    }
}

test('unsaved changes: asked before a new map; the work kept is offered again', async ({ page }) => {
    await boot(page);
    await openMap(page, 'mapA.json');
    await tool(page, 'line');
    await drag(page, [[12, 36], [60, 36]]);
    await page.locator('.ed-file button').nth(0).click();
    await settle(page);
    await shot(page, 'discard-new');
    await page.locator('.ed-dialog-btn').nth(0).click();
    await settle(page, 1000);
    await page.reload();
    await settle(page, 500);
    // the work kept is of 2026: opened with 2026 chosen
    await page.locator('.ed-empty-rules-choices button', { hasText: '2026' }).click();
    await settle(page);
    await shot(page, 'restore-offered');
    await page.locator('.ed-restore').click();
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
    await page.locator('.ed-view button').nth(2).click();
    await page.locator('.ed-view button').nth(0).click();
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
