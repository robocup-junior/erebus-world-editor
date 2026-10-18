# Erebus World Editor

**Erebus World Editor 2026** — the world editor for the RoboCupJunior Rescue Simulation (Erebus) 2026 rules — as a static site. It needs no server: serve `dist/` as it is (Cloudflare Workers, or any static host).

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
  lib/              the map, its rules and the world export, framework-free (model, lattice, world2026,
                    room4World2026, score - the most a map can score, by rule 5.6 -, view, tour, icons, keys)
  lang/             the texts, one file per language (ja, en)
  styles/           base.css (from Bootstrap), page.css, sim_modern.css, editor.css
public/             files served as they are (fonts, images, _headers)
test/               unit tests (vitest) with sample maps
e2e/                end-to-end tests (Playwright): screenshots, and the files the editor saves
```

### Adding a language

1. Copy `src/lang/en.json` to `src/lang/<code>.json` (`<code>`: its BCP 47 code, such as `fr` or `pt-BR`) and translate the texts. Keep each `{{name}}` parameter as it is; it may move within the sentence. `listSep` is what joins the items of a list (`, ` in English, `・` in Japanese).
2. Add it to `LANGUAGES` in `src/i18n.ts`: its code, its name in its own language, and its texts (imported like the others).
3. `npm test`: `test/simLang.test.ts` checks that every language has each key English has, with the same parameters, and that each file is in `LANGUAGES`.

A text not translated yet is shown in English. The language button (`src/components/LangMenu.vue`) shows the language in use and lists every language in `LANGUAGES` by its own name, so a new one appears there by itself. The page's `lang` attribute follows the language chosen, so the browser picks the right fonts for its script.

### The end-to-end tests

They drive the built site in Chromium with the same random numbers and time each run, compare each screen with its screenshot in `e2e/__screenshots__/` pixel for pixel, and fail on any error in the page. `E2E_OUT=<dir>` keeps the JSON and `.wbt` files the editor saves; `E2E_DIST=<dir>` tests another build. To compare two builds: take the screenshots of one with `--update-snapshots` (and `E2E_SNAPSHOTS=<dir name>` to keep them apart), test the other against them, and compare their `E2E_OUT` files.

## Licence

MIT (`LICENSE`). The libraries are under their own licences (each package in `node_modules/`).
