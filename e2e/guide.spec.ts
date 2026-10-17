// The guide: asked on a first visit, the tour of the screen, the lesson, the room 4 part.
import { test, expect } from '@playwright/test';
import { boot, openMap, shot, settle, tool, pageErrors } from './helpers';

test.afterEach(async ({ page }) => {
    expect(pageErrors(page)).toEqual([]);
});

test('first visit: the guide is offered by itself', async ({ page }) => {
    await boot(page, { fresh: true });
    await settle(page, 900);
    await expect(page.locator('.sbx-pick')).toBeVisible();
    await shot(page, 'guide-pick');
    await page.keyboard.press('Escape');
    await settle(page);
    await expect(page.locator('.sbx-pick')).toHaveCount(0);
});

test('the controls: from the guides, and with the ? key', async ({ page }) => {
    await boot(page);
    await openMap(page, 'mapA.json');
    await page.locator('.sbx-tour-btn').click();
    await page.locator('.sbx-pick-keys').click();
    await settle(page);
    await shot(page, 'keys-sheet');
    await page.keyboard.press('Escape');
    await settle(page);
    await expect(page.locator('.sbx-pick')).toHaveCount(0);
    await page.keyboard.press('?');
    await settle(page);
    await expect(page.locator('.sbx-keys')).toBeVisible();
});

test('the tour of the screen, step by step', async ({ page }) => {
    await boot(page, { lang: 'en' });
    await page.locator('.sbx-tour-btn').click();
    await page.locator('.sbx-pick-option').nth(1).click();
    await settle(page, 500);
    await shot(page, 'tour-0');
    for (let i = 1; i <= 8; i++) {
        await page.keyboard.press('ArrowRight');
        await settle(page, 450);
        await shot(page, 'tour-' + i);
    }
    await page.keyboard.press('ArrowLeft');
    await settle(page, 450);
    await shot(page, 'tour-back');
    await page.keyboard.press('Escape');
    await settle(page, 300);
    await shot(page, 'tour-ended');
});

test('the lesson: steps done for you', async ({ page }) => {
    await boot(page);
    await page.locator('.sbx-empty-tour').click();
    await page.locator('.sbx-pick-option').nth(0).click();
    await settle(page, 500);
    await shot(page, 'lesson-0');
    for (let i = 1; i <= 7; i++) {
        const doIt = page.locator('.sbx-tour-nav.auto');
        if (await doIt.count()) { await doIt.click(); await settle(page, 450); }
        await page.locator('.sbx-tour-nav.primary').click();
        await settle(page, 500);
        await shot(page, 'lesson-' + i);
    }
    await page.locator('.sbx-tour-fold').click();
    await settle(page, 300);
    await shot(page, 'lesson-folded');
});

test('the room 4 guide opens the creator', async ({ page }) => {
    await boot(page);
    await openMap(page, 'mapD.json');
    await tool(page, 'room');
    await page.locator('.sbx-tour-btn').click();
    await settle(page);
    await shot(page, 'guide-pick-map');
    await page.locator('.sbx-pick-option').nth(3).click();
    await settle(page, 1200);
    await shot(page, 'room4tour-0');
    await page.keyboard.press('ArrowRight');
    await settle(page, 600);
    await shot(page, 'room4tour-1');
    await page.keyboard.press('Escape');
    await settle(page, 900);
    await shot(page, 'room4tour-ended');
});
