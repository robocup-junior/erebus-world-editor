# Erebus World Editor

**Erebus World Editor** — the world editor for the RoboCupJunior Rescue Simulation (Erebus), for the rules of 2026 and later (a map keeps the year of its rules) — as a static site. It needs no server: serve `dist/` as it is (Cloudflare Workers, or any static host).

It started in [rcj-rescue-cms](https://github.com/robocup-junior/rcj-rescue-cms) (taken from 26.1.1) and is now made here, on its own. The β menu links to the classic editor, which stays in the CMS at https://osaka.rcj.cloud/service/editor/simulation/2026/classic.

Built with Vue 3, TypeScript and Vite.

## Development

Node.js 22.12 or later (24 recommended).

```sh
npm ci                          # install the libraries
npm run dev                     # the editor on http://localhost:5173/, reloaded as you change it
npm run build                   # type check (vue-tsc), then build dist/
npm run preview                 # serve dist/ as built
npm test                        # unit tests (vitest)
npx playwright install chromium # once, for the end-to-end tests
npm run test:e2e                # end-to-end tests of dist/ (npm run build first)
```

## Deploying (Cloudflare Workers)

The site is a Worker with static assets only (`wrangler.toml`: the files of `dist/`), built and deployed by Workers Builds, set up as follows.

| Setting | Value |
| --- | --- |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Environment variable | `NODE_VERSION` = `24` |

Workers Builds does not start by itself on a push here: GitHub Actions starts it (`.github/workflows/ci.yml`), for every push to `main` once the tests and the build pass, and by hand from Actions → CI → Run workflow. It posts to the Worker's deploy hook for `main` (Settings → Builds → Deploy Hooks), kept in the repository's secret `CLOUDFLARE_DEPLOY_HOOK`.

To deploy from the command line: `npm run build && npx wrangler deploy`.

### Caching

So that no old file is used after an update, two things work together:

- The scripts and styles get their content's hash in their names at build time (`assets/index-<hash>.js`): a changed file has a new URL.
- Every file is served with `Cache-Control: no-cache` (`public/_headers`): the browser asks again each time it uses one, and an unchanged file is answered with a short 304. This also covers the page itself and what is loaded by name (the fonts, the images).

## Libraries

| Library | Version | Used for |
| --- | --- | --- |
| Vue | 3.5 | the page |
| vue-i18n | 11 | the texts, one file per language (`src/lang/`; written with `{{name}}` parameters, compiled by `src/i18n.ts`) |
| Font Awesome Free | 7 | icons; the room 4 creator's shape tool draws its icons (SVGs) as walls |
| OpenCV.js (`@techstark/opencv-js`) | 5.0 | the room 4 picture read for the world export, and where the robot can get to |
| earcut | 3.2 | the tops of room 4's walls in the world file, in triangles round the floor a shape encloses |

The page's base styles (`src/styles/base.css`) are the parts of Bootstrap 4.4.1's CSS the editor uses (its reboot, buttons, the modal); Bootstrap itself is not a dependency. TypeScript stays at 6 until vue-tsc supports TypeScript 7.

OpenCV.js (13 MB) and Font Awesome's icon lists are files of their own, loaded when needed: Vite takes them from `node_modules/` into the build with their content's hash in their names. The room 4 creator's shape tool draws its icons with Font Awesome's font, which the page loads anyway.

## Layout

```
index.html          the page (Vite's entry)
src/
  main.ts           styles, vue-i18n, the app
  App.vue           the editor's page: top bar, tool rail and panel, map, checks, dialogs, guide
  editor/           what the page does (editor.ts), redrawing after changes (runtime.ts), formats
  room4/            the custom room 4 creator (Room4Creator.vue; its picture: canvas.ts)
  components/       rotation dial, cognitive target rings, modal, language button, build info
  rules/            the rules of each year (see "Rules by year"): registry, a manifest per year, parts
  lib/              the map and its editing, framework-free: model, lattice, field (rooms, passages, the
                    connection check, the tiles the robot reaches - the same for every year), view,
                    tour, icons, keys
  lang/             the texts, one file per language (de, en, es, fr, id, ja, ko, pt-BR, th, tr, zh-CN, zh-Hant)
  styles/           base.css (from Bootstrap), page.css, components.css, editor.css
public/             files served as they are (fonts, images, manifest.webmanifest, _headers)
art/                the icon and the link preview picture (SVG), and render.mjs, which renders
                    them to public/images/ (node art/render.mjs)
test/               unit tests (vitest) with sample maps
e2e/                end-to-end tests (Playwright): screenshots, and the files the editor saves
```

### Rules by year

One editor, one build, every year's rules in it - 2026, and 2027 (draft) - : a map file keeps its year (`"rules": 2026`; a file without one is of 2026) and opens in it, a new map is of the year chosen on the start screen (the latest at first), and the editor does what that year's rules say. A map goes to another year's rules only by the rules menu in the top bar (asked first; undo takes it back); the work kept in the browser opens only with its year chosen. The year's rules are a manifest (`src/rules/y2026.ts`, `y2027.ts`) that picks a version of each part:

| Part | What it holds |
| --- | --- |
| `geometry` | tile, wall thickness, the robot's size, how near it comes to identify a token |
| `rooms` | for each room, the kinds of wall it takes (whole or half tile edges, walls inside a tile, curves, a picture) and where its victims go |
| `floors` | the kinds of floor (each: its flag in the map file, its icon and colour, whether it is a hole - no floor, the robot keeps off it -, a checkpoint, or only for a tile beside the outer wall - 2027's contact tiles) |
| `passages` | the colour of the passage between each pair of rooms, and whether a checkpoint is wanted right behind each passage into room 4 |
| `tokens` | the kinds of victim (each: family - a victim of a symbol, a letter or a smiley face, or a ring target -, symbol, face, width, whether it can be fake, its codes in the map file), the room between them, whether they may go in passages, the ring target types, the room 4 stamps |
| `scoring` | the most a map can score |
| `export` | the world file, for the Erebus version the year is played on (`parts/export/erebus26/`: the tiles, walls and tokens, and a custom room 4 read from its picture; `parts/export/erebus27/`: the same with what Erebus 27 adds - contact tiles, the smiley fakes' models) |
| `refs` | the rule numbers the texts cite (`{{rule_reach}}` in a text is the year's `refs.reach`) |

The rest of the editor asks `rulesOf(map)` (`src/rules/registry.ts`) and never names or compares a year; `test/rules.test.ts` fails if it does, checks each year is complete, and makes a world and a score with each.

- **A new year**: copy the latest manifest to `src/rules/yYYYY.ts` and add it to `YEARS` in the registry. For each part the year changes, copy the part's latest version to the next one (`parts/tokens/v2.ts`) and change the copy; the parts it does not change stay shared. A text the year words otherwise goes under `"years": { "YYYY": { ... } }` in each language file, at the key's path. Give the year sample maps and expected world files in its tests. A test of one year's rules makes its maps of that year (`M.newMap(w, l, 2026)`; a map without a year is of the latest), so it keeps testing that year once a newer one is added. The guide's lesson builds its sample map in the year of the rules chosen (the map open, else the start screen's), its steps taking that year's floors and its texts that year's words; `test/lesson.test.ts` runs it in every year.
- **A change to a year's rules** (a correction to its rule book): change that year's part version, or give the year a new version if other years share it.
- **Dropping a year**: take it out of `YEARS` and delete its manifest; then delete the parts and `"years"` texts nothing uses any more.

### Adding a language

1. Copy `src/lang/en.json` to `src/lang/<code>.json` (`<code>`: its BCP 47 code, such as `fr` or `pt-BR`) and translate the texts. Keep each `{{name}}` parameter as it is; it may move within the sentence. `listSep` is what joins the items of a list (`, ` in English, `・` in Japanese).
2. Add it to `LANGUAGES` in `src/i18n.ts`: its code, its name in its own language (the list is in the order of these names: Latin script alphabetically, then the other scripts), the flag of the country most taken for it (from `flag-icons`, imported as a URL like the others), and its texts.
3. `npm test`: `test/lang.test.ts` checks that every language has each key English has, with the same parameters, and that each file is in `LANGUAGES`.

The texts are grouped by what they are for: `common` (words used all over: close, undo, ...), `app` (the editor, its about menu and build), `rules`, `file` (new, open, save, the work kept), `export`, `map` (its name, size and outline), `tools` (their names, help and hints), `rooms`, `passages`, `floors`, `victims`, `targets`, `select`, `linear`, `checks`, `score`, `status` (the status line's messages), `guide` (the tour, the lesson, room 4's guides and the keys) and `room4` (the room 4 creator).

A text not translated yet is shown in English. The language button (`src/components/LangMenu.vue`) shows the language in use and lists every language in `LANGUAGES` by its flag and its own name, so a new one appears there by itself. The page's `lang` attribute follows the language chosen, so the browser picks the right fonts for its script; for a language of Chinese characters, give it its own font list in `src/styles/page.css` (as `ja`, `zh-CN`, `zh-Hant` and `ko` have), or it may be drawn with another language's glyph shapes; a script Outfit lacks (Thai) gets one too. A browser's language finds its file by the exact code, else by its language (`pt-PT`: `pt-BR`); Chinese in traditional characters (`zh-TW`, `zh-HK`, `zh-Hant-*`) goes to `zh-Hant`.

### The end-to-end tests

They drive the built site in Chromium with the same random numbers and time each run, compare each screen with its screenshot in `e2e/__screenshots__/` pixel for pixel, and fail on any error in the page. `E2E_OUT=<dir>` keeps the JSON and `.wbt` files the editor saves; `E2E_DIST=<dir>` tests another build. To compare two builds: take the screenshots of one with `--update-snapshots` (and `E2E_SNAPSHOTS=<dir name>` to keep them apart), test the other against them, and compare their `E2E_OUT` files.

## Licence

MIT (`LICENSE`). The libraries are under their own licences (each package in `node_modules/`).
