// Obstacles (the obstacle tool): put, refused, picked, changed in the panel and by their handles,
// dragged, taken off, undone; drawn ones, icons, the colour picker, the classic editor's; reached
// from the other tools.
import { test, expect, type Page } from '@playwright/test';
import { boot, openMap, tool, click, hover, drag, settle, download, pageErrors, shot, r4tool, r4click, r4drag } from './helpers';

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

// Room 4 (mapD's: tiles x 2-5, y 1-3, its box (24, 12) cm, 48 x 36 cm): obstacles anywhere in it,
// two on one tile; moved, sized, undone; picked with the select tool, taken off with the eraser;
// saved; shown in the room 4 creator, and kept in the picture it saves as an image
test('obstacles in room 4: anywhere, as many as fit, and kept in the room 4 picture saved as an image', async ({ page }) => {
    test.setTimeout(120000);
    await boot(page);
    await openMap(page, 'mapD.json');
    const list = () => page.evaluate(() => JSON.parse(JSON.stringify((window as any).__edState.map ? (window as any).__edState.map.room4Obstacles || [] : [])));
    await tool(page, 'obstacle');
    await hover(page, 40, 30);
    expect(await status(page)).toContain('部屋4ではどこにでも');
    // two on tile (3, 1), off its centre (42, 18)
    await click(page, 39, 20);
    await page.locator('.ed-obstacle .ed-selected-head .btn-link').click();
    await page.locator('.ed-obstacle-shapes [data-shape=cylinder]').click();
    await click(page, 46, 20);
    let l = await list();
    expect(l.length).toBe(2);
    expect(l.map((o: any) => o.shape)).toEqual(['box', 'cylinder']);
    expect(l[0].fx * 48 + 24).toBeCloseTo(39, 1);
    expect(await head(page)).toContain('選んだ');
    // one into the other: not put
    await page.locator('.ed-obstacle .ed-selected-head .btn-link').click();
    await click(page, 42, 20);
    expect((await list()).length).toBe(2);
    // the cylinder dragged down: it moves in room 4, across tiles
    await drag(page, [[46, 20], [50, 34]]);
    l = await list();
    expect(l[1].fx * 48 + 24).toBeCloseTo(50, 0);
    expect(l[1].fy * 36 + 12).toBeCloseTo(34, 0);
    // its handle: its diameter (4 cm) 2 cm larger
    await drag(page, [[52, 34], [53, 34]]);
    expect((await list())[1].w).toBeCloseTo(6, 0);
    await page.keyboard.press('Control+z');
    await settle(page, 250);
    expect((await list())[1].w).toBe(4);
    // dragged into room 4's top wall (y = 12): it stops against it
    await drag(page, [[50, 34], [50, 10]]);
    expect((await list())[1].fy * 36 + 12 - 2).toBeGreaterThanOrEqual(12.4);
    await shot(page, 'room4-obstacles');
    // the select tool picks one (the obstacle tool, it picked); the eraser takes one off
    await tool(page, 'select');
    await click(page, 39, 20);
    await expect(page.locator('.ed-rail [data-tool="obstacle"]')).toHaveClass(/active/);
    expect(await head(page)).toContain('選んだ');
    await tool(page, 'eraser');
    await click(page, 39, 20);
    expect((await list()).length).toBe(1);
    // saved with the map
    const saved = JSON.parse((await download(page, () => page.locator('.ed-file button').nth(2).click())).text);
    expect(saved.room4Obstacles.length).toBe(1);
    // the creator shows it and keeps it in the picture it saves; a picture opened brings it back
    await tool(page, 'room');
    await page.locator('.ed-room4-block .btn-outline-primary').click();
    await expect(page.locator('canvas.r4-over')).toBeVisible();
    await settle(page, 800);
    const png = await download(page, () => page.locator('.r4-topbar [title="画像として保存"]').click(), { binary: true });
    await page.locator('.r4-head-ok').click();
    await settle(page, 600);
    await tool(page, 'eraser');
    await click(page, 50, 16);
    expect((await list()).length).toBe(0);
    await tool(page, 'room');
    await page.locator('.ed-room4-block .btn-outline-primary').click();
    await expect(page.locator('canvas.r4-over')).toBeVisible();
    await page.locator('.r4-topbar input[type=file][accept="image/png, image/jpeg"]').setInputFiles({ name: 'room4.png', mimeType: 'image/png', buffer: png.buffer! });
    await settle(page, 800);
    await page.locator('.r4-head-ok').click();
    await settle(page, 600);
    l = await list();
    expect(l.length).toBe(1);
    expect(l[0].shape).toBe('cylinder');
});

// the creator's own obstacle tool: put, refused, picked, dragged (stopping at a wall drawn), sized by
// its handle, changed in the panel, taken off, undone; taken onto the map with OK
test('obstacles in the room 4 creator: its own obstacle tool', async ({ page }) => {
    test.setTimeout(120000);
    await boot(page);
    await openMap(page, 'mapD.json');
    const inCreator = () => page.evaluate(() => JSON.parse(JSON.stringify((window as any).__edState.room4.host.room4Obstacles || [])));
    const onMap = () => page.evaluate(() => JSON.parse(JSON.stringify((window as any).__edState.map.room4Obstacles || [])));
    await tool(page, 'room');
    await page.locator('.ed-room4-block .btn-outline-primary').click();
    await expect(page.locator('canvas.r4-over')).toBeVisible();
    await settle(page, 800);
    await r4tool(page, 'obstacle');
    await expect(page.locator('.r4-panel .ed-obstacle-shapes [data-shape=box]')).toBeVisible();
    await page.locator('.r4-panel .ed-obstacle-shapes [data-shape=cylinder]').click();
    // put at (0.25, 0.5) of the picture: 4 cm across, 24 + 12 = 36 cm, 12 + 18 = 30 cm on the map
    await r4click(page, 0.25, 0.5);
    let l = await inCreator();
    expect(l.length).toBe(1);
    expect(l[0].shape).toBe('cylinder');
    expect(l[0].fx).toBeCloseTo(0.25, 1);
    await expect(page.locator('.r4-panel .ed-selected-head')).toContainText('選んだ');
    // one into it: refused, said so
    await r4click(page, 0.3, 0.5);
    expect((await inCreator()).length).toBe(1);
    await expect(page.locator('.r4-message')).toBeVisible();
    // its handle (its edge, 2 cm right of its centre) dragged 1 cm out: 6 cm across
    const fx = (await inCreator())[0].fx;
    await r4drag(page, [[fx + 2 / 48, 0.5], [fx + 3 / 48 - 0.004, 0.5]]);
    expect((await inCreator())[0].w).toBeGreaterThan(5);
    await page.keyboard.press('Control+z');
    await settle(page, 300);
    expect((await inCreator())[0].w).toBeCloseTo(4, 1);
    // a wall drawn down the middle; the obstacle dragged across it stops on its near side
    await r4tool(page, 'line');
    await r4drag(page, [[0.5, 0.05], [0.5, 0.95]]);
    await r4tool(page, 'obstacle');
    await r4click(page, 0.25, 0.5);
    await r4drag(page, [[0.25, 0.5], [0.8, 0.5]]);
    l = await inCreator();
    expect(l.length).toBe(1);
    expect(l[0].fx).toBeGreaterThan(0.35);
    expect(l[0].fx * 48 + 2).toBeLessThan(24.5);
    // the panel: its height and colour
    await page.locator('.r4-panel [data-num=h]').fill('9');
    await page.locator('.r4-panel [data-num=h]').press('Enter');
    await page.locator('.r4-panel .ed-obstacle-color[data-color="#2563eb"]').click();
    l = await inCreator();
    expect(l[0].h).toBe(9);
    expect(l[0].color).toBe('#2563eb');
    await shot(page, 'r4-obstacle');
    // Delete takes it off, undo brings it back; Esc lets it go (and the creator stays open)
    await page.keyboard.press('Delete');
    await settle(page, 200);
    expect((await inCreator()).length).toBe(0);
    await page.keyboard.press('Control+z');
    await settle(page, 300);
    expect((await inCreator()).length).toBe(1);
    await r4click(page, (await inCreator())[0].fx, 0.5);
    await page.keyboard.press('Escape');
    await settle(page, 200);
    await expect(page.locator('canvas.r4-over')).toBeVisible();
    await expect(page.locator('.r4-panel .ed-selected-head')).toContainText('次に');
    // a second one at the other side; a right click takes it off
    await r4click(page, 0.75, 0.5);
    expect((await inCreator()).length).toBe(2);
    const p = await page.locator('canvas.r4-over').boundingBox();
    await page.mouse.click(p!.x + 0.75 * p!.width, p!.y + 0.5 * p!.height, { button: 'right' });
    await settle(page, 200);
    expect((await inCreator()).length).toBe(1);
    // OK: on the map
    await page.locator('.r4-head-ok').click();
    await settle(page, 600);
    l = await onMap();
    expect(l.length).toBe(1);
    expect(l[0].h).toBe(9);
});
