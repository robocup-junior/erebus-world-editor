// Obstacles (the obstacle tool): put, refused, picked, changed in the panel and by their handles,
// dragged, taken off, undone; drawn ones, icons, the colour picker, the classic editor's; reached
// from the other tools.
import { test, expect, type Page } from '@playwright/test';
import { boot, openMap, tool, click, hover, drag, settle, download, pageErrors } from './helpers';

test.afterEach(async ({ page }) => {
    expect(pageErrors(page)).toEqual([]);
});

// the obstacle of cell k ("x,y,0") as saved: its shape, 'classic' (none), or null (no obstacle)
async function shapeAt(page: Page, k: string) {
    const c = JSON.parse((await download(page, () => page.locator('.ed-file button').nth(2).click())).text).cells;
    return c[k] && c[k].tile && c[k].tile.obstacle ? (c[k].tile.obstacleShape || 'classic') : null;
}
function head(page: Page) { return page.locator('.ed-obstacle .ed-selected-head').innerText().catch(() => ''); }
function status(page: Page) { return page.locator('.ed-status').innerText(); }
async function undo(page: Page) { await page.keyboard.press('Control+z'); await settle(page, 250); }
// where a handle (u, v cm in the obstacle's own frame) is on the map, for the one on tile cell (x, y)
function handle(x: number, y: number, sh: any, u: number, v: number): [number, number] {
    const c = Math.cos(sh.rot), sn = Math.sin(sh.rot), cx = 6 * x + sh.dx, cy = 6 * y + sh.dy;
    return [cx + u * c + v * sn, cy - u * sn + v * c];
}

test('obstacles: the tool, its panel, where they go, the panel on the one picked, its handles, undo, and the other tools', async ({ page }) => {
    test.setTimeout(120000);
    await boot(page);
    await openMap(page, 'mapA.json');
    await tool(page, 'obstacle');
    // the panel: nine shapes; the sliders for what the handles do not change (height, sides)
    await expect(page.locator('.ed-obstacle-shapes button')).toHaveCount(9);
    await expect(page.locator('.ed-obstacle-field input[type=range]')).toHaveCount(1);
    await page.locator('.ed-obstacle-shapes [data-shape=prism]').click();
    await expect(page.locator('.ed-obstacle-field input[type=range]')).toHaveCount(2);
    await page.locator('.ed-obstacle-shapes [data-shape=sphere]').click();
    await expect(page.locator('.ed-obstacle-field input[type=range]')).toHaveCount(0);
    await page.locator('.ed-obstacle-shapes [data-shape=box]').click();
    expect(await head(page)).toContain('次に置く');
    // not on the start, a passage, a hole or a swamp (a tile is one of them only); on a room 2 tile, and picked
    await hover(page, 6, 66);
    expect(await status(page)).toContain('置けません');
    for (const [x, y, k] of [[6, 66, '1,11,0'], [42, 18, '7,3,0'], [30, 30, '5,5,0'], [18, 42, '3,7,0']] as [number, number, string][]) {
        await click(page, x, y);
        expect(await shapeAt(page, k), k).toBeNull();
    }
    await click(page, 54, 6);
    expect(await shapeAt(page, '9,1,0')).not.toBeNull();
    expect(await head(page)).toContain('選んだ');
    await page.locator('.ed-obstacle .ed-selected-head .btn-link').click();
    expect(await head(page)).toContain('次に置く');
    // with none picked, the panel sets the next one
    await page.locator('.ed-obstacle-shapes [data-shape=cylinder]').click();
    await page.locator('.ed-obstacle-color[data-color="#2563eb"]').click();
    await page.locator('.ed-obstacle-field input[data-field=h]').fill('9');
    await click(page, 6, 6);
    let s = await shapeAt(page, '1,1,0');
    expect([s.shape, s.color, s.h]).toEqual(['cylinder', '#2563eb', 9]);
    // with one picked, the panel changes it, each a step to undo
    await page.locator('.ed-obstacle-color[data-color="#dc2626"]').click();
    expect((await shapeAt(page, '1,1,0')).color).toBe('#dc2626');
    await undo(page);
    expect((await shapeAt(page, '1,1,0')).color).toBe('#2563eb');
    await page.locator('.ed-obstacle-field input[data-field=h]').fill('4');
    expect((await shapeAt(page, '1,1,0')).h).toBe(4);
    await page.locator('.ed-obstacle-shapes [data-shape=prism]').click();
    await page.locator('.ed-obstacle-field input[data-field=n]').fill('3');
    s = await shapeAt(page, '1,1,0');
    expect([s.shape, s.n]).toEqual(['prism', 3]);
    await page.locator('.ed-obstacle-actions .btn-outline-primary').click();
    s = await shapeAt(page, '1,1,0');
    expect(['polygon', 'icon']).not.toContain(s.shape);
    // a box's handles: its turn back to 0 (Shift: steps of 15 degrees), its width and depth about its middle
    await page.locator('.ed-obstacle-shapes [data-shape=box]').click();
    s = await shapeAt(page, '1,1,0');
    await drag(page, [handle(1, 1, s, 0, -s.d / 2 - 2.5), [6 + s.dx, 6 + s.dy - 9]], { shift: true });
    s = await shapeAt(page, '1,1,0');
    expect(Math.min(s.rot, 2 * Math.PI - s.rot)).toBeLessThan(0.01);
    await settle(page, 4300);
    await hover(page, ...handle(1, 1, s, s.w / 2, 0));
    expect(await status(page)).toContain('大きさ');
    await hover(page, ...handle(1, 1, s, 0, -s.d / 2 - 2.5));
    expect(await status(page)).toContain('向き');
    await drag(page, [handle(1, 1, s, s.w / 2, 0), handle(1, 1, s, s.w / 2 + 1, 0)]);
    let s2 = await shapeAt(page, '1,1,0');
    expect(s2.w).toBeCloseTo(s.w + 2, 0);
    await undo(page);
    expect((await shapeAt(page, '1,1,0')).w).toBe(s.w);
    await drag(page, [handle(1, 1, s, 0, s.d / 2), handle(1, 1, s, 0, s.d / 2 + 0.5)]);
    s2 = await shapeAt(page, '1,1,0');
    expect(s2.d).toBeCloseTo(s.d + 1, 0);
    // grown into the wall, it stops short of it
    await drag(page, [handle(1, 1, s2, s2.w / 2, 0), handle(1, 1, s2, 9, 0)]);
    const s3 = await shapeAt(page, '1,1,0');
    expect(s3.w).toBeGreaterThan(s2.w);
    expect(s3.w).toBeLessThan(12);
    // a quarter turn with its handle
    await drag(page, [handle(1, 1, s3, 0, -s3.d / 2 - 2.5), [6 + s3.dx + 9, 6 + s3.dy]]);
    expect((await shapeAt(page, '1,1,0')).rot).toBeCloseTo(1.5 * Math.PI, 1);
    // a round one: one handle, its diameter; a sphere as high as it is across
    await page.locator('.ed-obstacle-shapes [data-shape=cylinder]').click();
    s = await shapeAt(page, '1,1,0');
    await drag(page, [handle(1, 1, s, s.w / 2, 0), handle(1, 1, s, s.w / 2 - 0.5, 0)]);
    expect((await shapeAt(page, '1,1,0')).w).toBeCloseTo(s.w - 1, 0);
    await page.locator('.ed-obstacle-shapes [data-shape=sphere]').click();
    s = await shapeAt(page, '1,1,0');
    expect(s.h).toBe(s.w);
    // dragged by its body, it stops at the outer wall
    await drag(page, [[6 + s.dx, 6 + s.dy], [6 + s.dx - 10, 6 + s.dy]]);
    s = await shapeAt(page, '1,1,0');
    expect(6 + s.dx - s.w / 2).toBeGreaterThanOrEqual(0.49);
    // Delete takes it off, undo brings it back; Esc lets it go
    await page.keyboard.press('Delete');
    await settle(page, 200);
    expect(await shapeAt(page, '1,1,0')).toBeNull();
    await undo(page);
    expect(await shapeAt(page, '1,1,0')).not.toBeNull();
    await click(page, 6, 6);
    await page.keyboard.press('Escape');
    await settle(page, 100);
    expect(await head(page)).toContain('次に置く');
    // the select tool opens this tool with it picked; the eraser takes one off
    await tool(page, 'select');
    await click(page, 54, 6);
    await expect(page.locator('.ed-rail [data-tool="obstacle"]')).toHaveClass(/active/);
    expect(await head(page)).toContain('選んだ');
    await settle(page, 4300);
    await tool(page, 'eraser');
    await hover(page, 54, 6);
    expect(await status(page)).toContain('障害物');
    await click(page, 54, 6);
    expect(await shapeAt(page, '9,1,0')).toBeNull();
    // a tile painted into room 4 loses its obstacle; room 4's are drawn in its picture
    await tool(page, 'obstacle');
    await click(page, 18, 6);
    await tool(page, 'room');
    await page.locator('.ed-tool-panel .ed-choice', { hasText: '部屋4' }).click();
    await click(page, 18, 6);
    expect(await shapeAt(page, '3,1,0')).toBeNull();
    await settle(page, 4300);
    await tool(page, 'obstacle');
    await hover(page, 18, 6);
    expect(await status(page)).toContain('部屋4');
});

test('obstacles: drawn ones, icons, the colour picker, the classic editor\'s', async ({ page }) => {
    test.setTimeout(120000);
    await boot(page);
    await openMap(page, 'mapA.json');
    await tool(page, 'obstacle');
    // an L drawn on tile (1, 1), closed on its first corner: put and picked
    await page.locator('.ed-obstacle-shapes [data-shape=polygon]').click();
    await expect(page.locator('.ed-obstacle-shapes [data-shape=polygon]')).toHaveClass(/active/);
    for (const [x, y] of [[13, 13], [23, 13], [23, 17], [17, 17], [17, 23], [13, 23], [13, 13]]) await click(page, x, y);
    let s = await shapeAt(page, '3,3,0');
    expect([s.shape, s.w, s.d]).toEqual(['polygon', 10, 10]);
    expect(await head(page)).toContain('選んだ');
    // its corner handle: smaller, in proportion
    await drag(page, [handle(3, 3, s, s.w / 2, s.d / 2), handle(3, 3, s, s.w / 2 - 1, s.d / 2 - 1)]);
    let s2 = await shapeAt(page, '3,3,0');
    expect(s2.w).toBeLessThan(s.w);
    expect(s2.w / s2.d).toBeCloseTo(s.w / s.d, 1);
    // an outline crossing itself is not put
    await page.locator('.ed-obstacle .ed-selected-head .btn-link').click();
    await page.locator('.ed-obstacle-draw .btn-outline-primary').click();
    for (const [x, y] of [[2, 26], [10, 34], [10, 26], [2, 34]]) await click(page, x, y);
    await page.keyboard.press('Enter');
    await settle(page, 200);
    expect(await shapeAt(page, '1,5,0')).toBeNull();
    expect(await status(page)).toContain('交差');
    await page.keyboard.press('Escape');
    // an icon: a tile clicked before one is chosen is told so; chosen, put, its corner handle in proportion
    await page.locator('.ed-obstacle-shapes [data-shape=icon]').click();
    await click(page, 42, 6);
    await settle(page, 200);
    expect(await shapeAt(page, '7,1,0')).toBeNull();
    expect(await status(page)).toContain('アイコン');
    await page.locator('.ed-obstacle-icons input[type=search]').fill('car');
    await page.locator('.ed-obstacle-icons .r4-icon-grid button[title="Car"]').click();
    await settle(page, 600);
    await click(page, 42, 6);
    s = await shapeAt(page, '7,1,0');
    expect([s.shape, s.icon]).toEqual(['icon', 'car']);
    await drag(page, [handle(7, 1, s, s.w / 2, s.d / 2), handle(7, 1, s, s.w / 2 + 1, s.d / 2 + 1)]);
    s2 = await shapeAt(page, '7,1,0');
    expect(s2.w).toBeGreaterThan(s.w);
    expect(s2.w / s2.d).toBeCloseTo(s.aspect, 1);
    // the editor's colour picker on the one picked, a step to undo
    await page.locator('.ed-obstacle-color.more').click();
    await page.locator('.ed-color-hex').fill('#00ff7f');
    await page.locator('.ed-color-hex').press('Enter');
    expect((await shapeAt(page, '7,1,0')).color).toBe('#00ff7f');
    await undo(page);
    expect((await shapeAt(page, '7,1,0')).color).not.toBe('#00ff7f');
    // the classic editor's one (tile (3, 5), no shape): picked, its handle makes it a box
    await page.keyboard.press('Escape');
    await click(page, 42, 66);
    expect(await head(page)).toContain('選んだ');
    await drag(page, [[46, 66], [45, 66]]);
    s = await shapeAt(page, '7,11,0');
    expect(s.shape).toBe('box');
    expect(s.w).toBeCloseTo(6, 0);
});
