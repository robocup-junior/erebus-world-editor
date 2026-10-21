// Renders the pictures of public/images from the SVGs here, in Chromium (Playwright), with the
// page's Outfit: node art/render.mjs
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const fonts = [400, 700, 800].map((weight) => {
  const file = { 400: 'Regular', 700: 'Bold', 800: 'ExtraBold' }[weight];
  return `@font-face { font-family: 'Outfit'; font-weight: ${weight}; src: url(/fonts/outfit/Outfit-${file}.woff2); }`;
}).join('\n');

// The icon as it is (rounded, on nothing), or full bleed for the platforms that cut their own shape:
// filled to the edges, its map scaled down to `scale` so that it stays inside their safe zone.
const icon = read('art/icon.svg');
const bleed = (scale) => icon
  .replace('rx="14" fill="#2563eb"/>', `fill="#2563eb"/><g transform="translate(32 32) scale(${scale}) translate(-32 -32)">`)
  .replace('</svg>', '</g></svg>');

const pictures = [
  { file: 'favicon-32.png', svg: icon, size: 32 },
  { file: 'icon-192.png', svg: icon, size: 192 },
  { file: 'icon-512.png', svg: icon, size: 512 },
  { file: 'apple-touch-icon-180.png', svg: bleed(1.1), size: 180 },
  { file: 'icon-maskable-512.png', svg: bleed(0.85), size: 512 },
  { file: 'og.png', svg: read('art/og.svg'), size: [1200, 630] },
];

const browser = await chromium.launch();
for (const { file, svg, size } of pictures) {
  const [width, height] = Array.isArray(size) ? size : [size, size];
  const page = await browser.newPage({ viewport: { width, height } });
  const sized = svg.replace('<svg ', `<svg width="${width}" height="${height}" `);
  // Served from a made-up origin, the picture on its page and the fonts from public/
  await page.route('http://render.local/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    return path === '/'
      ? route.fulfill({ contentType: 'text/html', body: `<style>${fonts} body { margin: 0; } svg { display: block; }</style>${sized}` })
      : route.fulfill({ path: new URL(`public${path}`, root).pathname });
  });
  await page.goto('http://render.local/');
  await page.evaluate(() => Promise.all([400, 700, 800].map((weight) => document.fonts.load(`${weight} 20px Outfit`))));
  await page.screenshot({ path: new URL(`public/images/${file}`, root).pathname, omitBackground: true });
  await page.close();
}
await browser.close();
