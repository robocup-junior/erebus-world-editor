# Erebus World Editor

**Erebus World Editor 2026** — the world editor for the RoboCupJunior Rescue Simulation (Erebus) 2026 rules — as a static site. It needs no server: serve `dist/` as it is (Cloudflare Pages, or any static host).

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

## Deploying (Cloudflare Pages)

With the Git integration, set the project up as follows.

| Setting | Value |
| --- | --- |
| Framework preset | None |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Environment variable | `NODE_VERSION` = `24` |

To deploy from the command line: `npm run build && npx wrangler pages deploy` (settings in `wrangler.toml`).

### Caching

So that no old file is used after an update, two things work together:

- The scripts and styles get their content's hash in their names at build time (`assets/index-<hash>.js`): a changed file has a new URL.
- Every file is served with `Cache-Control: no-cache` (`public/_headers`): the browser asks again each time it uses one, and an unchanged file is answered with a short 304. This also covers the page itself and what is loaded by name (OpenCV.js, the icon list and icons of the room 4 creator's shape tool, fonts).

## Libraries

| Library | Version | Used for |
| --- | --- | --- |
| Vue | 3.5 | the page |
| vue-i18n | 11 | Japanese and English (`src/lang/`; texts written with `{{name}}` parameters, compiled by `src/i18n.ts`) |
| Font Awesome Free | 7 | icons; the room 4 creator's shape tool draws its icons (SVGs) as walls |
| OpenCV.js (`@techstark/opencv-js`) | 5.0 | the room 4 picture read for the world export, and where the robot can get to |

The page's base styles (`src/styles/base.css`) are the parts of Bootstrap 4.4.1's CSS the editor uses (its reboot, buttons, the modal); Bootstrap itself is not a dependency. TypeScript stays at 6 until vue-tsc supports TypeScript 7.

OpenCV.js and Font Awesome's icon files are loaded at run time as files of their own: `scripts/vendor.mjs` (run by `dev` and `build`) copies them from `node_modules/` into `public/vendor/` (not committed).

## Layout

```
index.html          the page (Vite's entry)
src/
  main.ts           styles, vue-i18n, the app
  App.vue           the editor's page: top bar, tool rail and panel, map, checks, dialogs, guide
  editor/           what the page does (editor.ts), redrawing after changes (runtime.ts), formats
  room4/            the custom room 4 creator (Room4Creator.vue; its picture: canvas.ts)
  components/       rotation dial, cognitive target rings, modal
  lib/              the map, its rules and the world export, framework-free (model, lattice, world2026,
                    room4World2026, score - the most a map can score, by rule 5.6 -, view, tour, icons, keys)
  lang/             the texts (ja, en)
  styles/           base.css (from Bootstrap), page.css, sim_modern.css, editor.css
public/             files served as they are (fonts, images, _headers; vendor/ made by scripts/vendor.mjs)
test/               unit tests (vitest) with sample maps
e2e/                end-to-end tests (Playwright): screenshots, and the files the editor saves
```

### The end-to-end tests

They drive the built site in Chromium with the same random numbers and time each run, compare each screen with its screenshot in `e2e/__screenshots__/` pixel for pixel, and fail on any error in the page. `E2E_OUT=<dir>` keeps the JSON and `.wbt` files the editor saves; `E2E_DIST=<dir>` tests another build. To compare two builds: take the screenshots of one with `--update-snapshots` (and `E2E_SNAPSHOTS=<dir name>` to keep them apart), test the other against them, and compare their `E2E_OUT` files.

## Licence

MIT (`LICENSE`). The libraries are under their own licences (each package in `node_modules/`).
