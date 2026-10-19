// The custom room 4 creator: its tools, the picture back on the map, and the world exported from it.
import { test, expect, type Page } from '@playwright/test';
import { boot, openMap, tool, download, keep, shot, settle, r4tool, r4drag, r4click, reseed, pageErrors } from './helpers';

test.afterEach(async ({ page }) => {
    expect(pageErrors(page)).toEqual([]);
});

async function openCreator(page: Page): Promise<void> {
    await boot(page);
    await openMap(page, 'mapD.json');
    await page.waitForFunction(() => typeof (window as any).cv !== 'undefined' && (window as any).cv.Mat, null, { timeout: 30000 });
    await tool(page, 'room');
    await page.locator('.ed-room4-block .btn-outline-primary').click();
    await expect(page.locator('canvas.r4-over')).toBeVisible();
    await settle(page, 800);
}

test('the creator: every tool and its panel', async ({ page }) => {
    await openCreator(page);
    await shot(page, 'r4-open');
    for (const id of ['select', 'template', 'pen', 'line', 'curve', 'arc', 'rect', 'circle', 'ellipse', 'polygon', 'erase', 'floor', 'stamp']) {
        await r4tool(page, id);
        await shot(page, 'r4-tool-' + id);
    }
});

test('the creator: the shape tool lists Font Awesome icons', async ({ page }) => {
    await openCreator(page);
    await r4tool(page, 'shape');
    await expect(page.locator('.r4-icon-grid button').first()).toBeVisible({ timeout: 15000 });
    await settle(page, 400);
    await shot(page, 'r4-shape-icons');
    await page.locator('.r4-shape-icons input[type=search]').fill('car');
    await settle(page, 300);
    await shot(page, 'r4-shape-search');
    await page.locator('.r4-icon-grid button').first().click();
    await settle(page, 600);
    await r4drag(page, [[0.55, 0.55], [0.8, 0.8]]);
    await shot(page, 'r4-shape-drawn');
});

test('the creator: walls and stamps drawn, back on the map, saved and exported', async ({ page }) => {
    await openCreator(page);
    await r4tool(page, 'rect');
    await r4drag(page, [[0.2, 0.2], [0.5, 0.45]]);
    await r4tool(page, 'pen');
    await r4drag(page, [[0.6, 0.15], [0.7, 0.3], [0.85, 0.25]]);
    await r4tool(page, 'line');
    await r4drag(page, [[0.1, 0.7], [0.45, 0.7]]);
    await r4tool(page, 'circle');
    await r4drag(page, [[0.7, 0.65], [0.78, 0.72]]);
    await shot(page, 'r4-walls');
    await r4tool(page, 'stamp');
    await page.locator('.r4-stamp').nth(0).click();
    // under the box and on the line: where the robot gets to (a stamp is not put where it does not)
    await r4click(page, 0.3, 0.47);
    await page.locator('.r4-stamp').nth(6).click();
    await r4click(page, 0.35, 0.66);
    await shot(page, 'r4-stamps');
    await r4click(page, 0.3, 0.47);
    await shot(page, 'r4-stamp-selected');
    await page.keyboard.press('Control+z');
    await settle(page, 300);
    await page.keyboard.press('Control+Shift+z');
    await settle(page, 300);
    await page.locator('.r4-more summary').click();
    await reseed(page, 11);
    await page.locator('.r4-more .btn-primary').click();
    await settle(page, 800);
    await shot(page, 'r4-random-stamps');
    await r4tool(page, 'erase');
    await r4drag(page, [[0.1, 0.7], [0.25, 0.7]]);
    await shot(page, 'r4-erased');
    await page.locator('.r4-head-ok').click();
    await settle(page, 800);
    await shot(page, 'r4-on-map');
    const saved = await download(page, () => page.locator('.ed-file button').nth(2).click());
    keep('room4.json', saved.text);
    await page.locator('.ed-fix-all').click();
    await settle(page, 400);
    await shot(page, 'r4-fixed');
    await reseed(page, 12);
    const world = await download(page, () => page.locator('.ed-export').click());
    keep('room4.wbt', world.text);
});

// mapD's room 4: 4 x 3 tiles, cells x 5-11, y 3-7; the centre of its tile (c, r) in the picture
const tileAt = (c: number, r: number): [number, number] => [(c + 0.5) / 4, (r + 0.5) / 3];

test('the creator: holes, swamps and checkpoints on room 4\'s tiles, undone, and on the map', async ({ page }) => {
    await openCreator(page);
    await r4tool(page, 'floor');
    const choice = (i: number) => page.locator('.r4-panel .ed-choice').nth(i).click();
    await choice(1);                                    // hole
    await r4click(page, ...tileAt(1, 1));
    await choice(2);                                    // swamp, dragged along the bottom row
    await r4drag(page, [tileAt(0, 2), tileAt(1, 2), tileAt(2, 2)]);
    await choice(0);                                    // checkpoint
    await r4click(page, ...tileAt(3, 0));
    await r4click(page, ...tileAt(3, 1));
    await r4click(page, ...tileAt(3, 1));               // clicked again: taken off
    await shot(page, 'r4-floors');
    // undo / redo take the floors back and forth too: three steps back, the checkpoint at the top
    // right is gone
    for (let i = 0; i < 3; i++) { await page.keyboard.press('Control+z'); await settle(page, 300); }
    await shot(page, 'r4-floors-undone');
    for (let i = 0; i < 3; i++) { await page.keyboard.press('Control+Shift+z'); await settle(page, 300); }
    await page.locator('.r4-head-ok').click();
    await settle(page, 800);
    await shot(page, 'r4-floors-on-map');
    const saved = JSON.parse((await download(page, () => page.locator('.ed-file button').nth(2).click())).text);
    const floor = (k: string) => { const t = (saved.cells[k] || {}).tile || {}; return ['black', 'swamp', 'checkpoint'].filter((f) => t[f]); };
    expect(floor('7,5,0')).toEqual(['black']);
    expect([floor('5,7,0'), floor('7,7,0'), floor('9,7,0')]).toEqual([['swamp'], ['swamp'], ['swamp']]);
    expect(floor('11,3,0')).toEqual(['checkpoint']);
    expect(floor('11,5,0')).toEqual([]);
});

test('the creator: a template, selection turned, zoom', async ({ page }) => {
    await openCreator(page);
    await r4tool(page, 'template');
    await page.locator('.r4-template').nth(1).click();
    await reseed(page, 13);
    await page.locator('.r4-templates .btn-primary').click();
    await settle(page, 600);
    await shot(page, 'r4-template');
    await r4tool(page, 'select');
    await r4drag(page, [[0.05, 0.05], [0.5, 0.5]]);
    await page.locator('.r4-sel-buttons button').nth(1).click();
    await page.locator('.r4-sel-buttons button').nth(2).click();
    await settle(page, 400);
    await shot(page, 'r4-selection');
    await page.keyboard.press('Enter');
    await page.locator('.r4-zoom button').nth(2).click();
    await page.locator('.r4-zoom button').nth(2).click();
    await settle(page, 400);
    await shot(page, 'r4-zoomed');
    await page.locator('.r4-chip').nth(0).click();
    await page.locator('.r4-chip').nth(1).click();
    await settle(page, 300);
    await shot(page, 'r4-views-off');
    await page.keyboard.press('Escape');
    await settle(page, 800);
    await shot(page, 'r4-closed-esc');
});
