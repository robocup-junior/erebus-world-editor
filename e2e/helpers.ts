import { expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'test', 'fixtures', 'sim2026');

// Where the files the editor saves are kept, to compare two builds (E2E_OUT, else not kept)
export function keep(name: string, text: string): void {
    const dir = process.env.E2E_OUT;
    if (!dir) return;
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name), text);
}

// What went wrong in the page (uncaught errors, console errors): each test ends with none
const errors = new WeakMap<Page, string[]>();
function watchErrors(page: Page): void {
    if (errors.has(page)) return;
    const list: string[] = [];
    errors.set(page, list);
    page.on('pageerror', function (e) { list.push(String(e)); });
    page.on('console', function (m) { if (m.type() === 'error') list.push(m.text()); });
}
export function pageErrors(page: Page): string[] {
    return errors.get(page) || [];
}

// The page with the same random numbers and time each run, the language given, and the guide's first
// question already answered (unless fresh)
export async function boot(page: Page, opts: { lang?: string; fresh?: boolean } = {}): Promise<void> {
    watchErrors(page);
    await page.addInitScript(function (o) {
        let s = 20261017;
        // the tests start the numbers again before what uses them, so the builds compare
        (window as any).__reseed = function (seed: number) { s = seed; };
        Math.random = function () {
            s = (s + 0x6D2B79F5) | 0;
            let t = Math.imul(s ^ (s >>> 15), 1 | s);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
        try {
            if (!sessionStorage.getItem('e2e.booted')) {
                sessionStorage.setItem('e2e.booted', '1');
                localStorage.clear();
                localStorage.setItem('NG_TRANSLATE_LANG_KEY', o.lang);
                if (!o.fresh) {
                    localStorage.setItem('simBeta2026.tourSeen', '1');
                    localStorage.setItem('simBeta2026.guideAsked', '1');
                }
            }
        } catch (e) { /* storage off */ }
    }, { lang: opts.lang || 'ja', fresh: !!opts.fresh });
    await page.clock.setFixedTime(new Date('2026-10-17T10:00:00+09:00'));
    await page.goto('/');
    await expect(page.locator('.sbx-title')).toContainText('Erebus World Editor');
    await expect(page.locator('.sbx-empty h2')).not.toContainText('admin.');
    await settle(page);
}

// Fonts, the next frames and the editor's timers done
export async function settle(page: Page, ms = 250): Promise<void> {
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(ms);
}

export async function openMap(page: Page, name: string): Promise<void> {
    await page.locator('#simBetaFile').setInputFiles(path.join(FIXTURES, name));
    await expect(page.locator('.sbx-name-input')).toBeVisible();
    await settle(page, 400);
}

// A point of the map (cm) in window pixels
export async function at(page: Page, x: number, y: number): Promise<[number, number]> {
    return page.evaluate(([x, y]) => {
        const w = window as any;
        const v = w.angular ? w.angular.element(document.body).scope().viewApi : w.__sbxView;
        const c = document.getElementById('simBetaCanvas')!.getBoundingClientRect();
        const q = v.toPx(x, y);
        return [c.left + q[0], c.top + q[1]] as [number, number];
    }, [x, y]);
}

export async function click(page: Page, x: number, y: number): Promise<void> {
    const p = await at(page, x, y);
    await page.mouse.move(p[0], p[1]);
    await page.mouse.down();
    await page.mouse.up();
    await settle(page, 120);
}

export async function drag(page: Page, points: [number, number][], opts: { shift?: boolean; alt?: boolean } = {}): Promise<void> {
    if (opts.shift) await page.keyboard.down('Shift');
    if (opts.alt) await page.keyboard.down('Alt');
    const first = await at(page, points[0][0], points[0][1]);
    await page.mouse.move(first[0], first[1]);
    await page.mouse.down();
    for (const pt of points.slice(1)) {
        const q = await at(page, pt[0], pt[1]);
        await page.mouse.move(q[0], q[1], { steps: 8 });
    }
    await page.mouse.up();
    if (opts.alt) await page.keyboard.up('Alt');
    if (opts.shift) await page.keyboard.up('Shift');
    await settle(page, 120);
}

export async function hover(page: Page, x: number, y: number): Promise<void> {
    const p = await at(page, x, y);
    await page.mouse.move(p[0], p[1], { steps: 4 });
    await settle(page, 120);
}

export async function tool(page: Page, id: string): Promise<void> {
    await page.locator('.sbx-rail [data-tool="' + id + '"]').click();
    await settle(page, 120);
}

// The random numbers started again (before an export, random stamps...)
export async function reseed(page: Page, seed = 7): Promise<void> {
    await page.evaluate((n) => (window as any).__reseed(n), seed);
}

// What a click on a button downloads, as text
export async function download(page: Page, act: () => Promise<void>): Promise<{ name: string; text: string }> {
    const [d] = await Promise.all([page.waitForEvent('download'), act()]);
    const p = await d.path();
    return { name: d.suggestedFilename(), text: fs.readFileSync(p!, 'utf8') };
}

// A point of the room 4 creator's picture (fractions of it) in window pixels
export async function r4at(page: Page, fx: number, fy: number): Promise<[number, number]> {
    const box = (await page.locator('canvas.r4-over').boundingBox())!;
    return [box.x + fx * box.width, box.y + fy * box.height];
}

export async function r4drag(page: Page, points: [number, number][]): Promise<void> {
    const first = await r4at(page, points[0][0], points[0][1]);
    await page.mouse.move(first[0], first[1]);
    await page.mouse.down();
    for (const pt of points.slice(1)) {
        const q = await r4at(page, pt[0], pt[1]);
        await page.mouse.move(q[0], q[1], { steps: 10 });
    }
    await page.mouse.up();
    await settle(page, 200);
}

export async function r4click(page: Page, fx: number, fy: number): Promise<void> {
    const p = await r4at(page, fx, fy);
    await page.mouse.move(p[0], p[1]);
    await page.mouse.down();
    await page.mouse.up();
    await settle(page, 200);
}

export async function r4tool(page: Page, id: string): Promise<void> {
    await page.locator('.sim-r4-rail [data-tool="' + id + '"]').click();
    await settle(page, 150);
}

export async function shot(page: Page, name: string): Promise<void> {
    await settle(page, 150);
    await expect(page).toHaveScreenshot(name + '.png');
}
