# Erebus Map Editor

**Erebus Editor 2026** — the world editor for the RoboCupJunior Rescue Simulation (Erebus) 2026 rules — as a static site. It needs no server: serve `dist/` as it is (Cloudflare Pages, or any static host).

The editor is made in [rcj-rescue-cms](https://github.com/robocup-junior/rcj-rescue-cms), where it is served at `/service/editor/simulation/2026`; this repository takes it out of the CMS.

## Development

Node.js 22 or later.

```sh
npm ci          # install the libraries
npm run dev     # build dist/ and serve it on http://localhost:8080/
npm test        # the editor's tests
npm run build   # build dist/
```

## Deploying (Cloudflare Pages)

With the Git integration, set the project up as follows.

| Setting | Value |
| --- | --- |
| Framework preset | None |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Environment variable | `NODE_VERSION` = `22` |

To deploy from the command line: `npm run build && npx wrangler pages deploy` (settings in `wrangler.toml`).

### Caching

So that no old file is used after an update, two things work together:

- The scripts, styles and libraries the page names get their content's fingerprint at build time (`?v=...`): a changed file has a new URL.
- Every file is served with `Cache-Control: no-cache` (`dist/_headers`): the browser asks again each time it uses one, and an unchanged file is answered with a short 304. This also covers what the scripts load by name (templates, language files, icons, fonts) and the page itself.

## Taking the editor from the CMS

When the editor changes in the CMS, take it from a checkout of the CMS:

```sh
npm run sync -- ../rcj-rescue-cms   # update src/ and test/ from the CMS
npm test && npm run build           # check
git diff                            # look at what changed, and commit
```

What it takes:

- The editor's scripts, styles and templates (into `src/`, under the same paths as in the CMS's `public/`).
- The editor's part of the language files (`admin.simBeta`, `admin.simMapEditor`). Where a text links to another text of the CMS (`@:...`), that text is put in its place.
- The page markup: the CMS's Pug view rendered as the public service renders it, put into `src/index.html` between `<!-- editor -->` and `<!-- /editor -->`. Links back into the CMS (Home, the classic editor) are taken off.
- The editor's tests (`test/`).
- The CMS version and commit it was taken from (`cms-source.json`).

Outside its marks, `src/index.html` (what `<head>` loads) belongs to this repository, as does `src/stylesheets/editor_base.css`. When the editor starts to use a new file, add it to the list in `scripts/sync-from-cms.mjs` and to `src/index.html`.

## Libraries

All from npm, at the versions the CMS uses, with two differences:

| Library | Here | In the CMS | Why it is the same for the editor |
| --- | --- | --- | --- |
| OpenCV.js (room 4: its picture made into the world's walls and victims, and the places out of reach) | `@techstark/opencv-js` 4.5.1 | 4.5.0 (not on npm) | The same official build of the next patch release. The same map exports the same world (apart from what is random in every export: random turns and ring colours), and the same places out of reach. |
| Angular UI Bootstrap (the room 4 creator is one of its modals) | `ui-bootstrap4` 3.0.0-beta.3 | its own copy of the same version | The CMS's copy differs only in templates the editor does not use (carousel, datepicker, rating, timepicker). |

AngularJS needs jQuery loaded before it: with jqLite it cannot set the CSS variables the templates set (`ng-style` with `--stamp-color`).

## Layout

```
src/                the page (index.html) and the editor's files (the paths of the CMS's public/)
  stylesheets/editor_base.css   the part of the CMS's common CSS the editor uses (text, modals)
scripts/
  build.mjs         builds dist/
  serve.mjs         serves dist/ locally
  sync-from-cms.mjs takes the editor from the CMS
test/               the editor's tests (node --test)
dist/               the build output (not committed)
```

`dist/` holds only the files the page loads. All libraries come from npm (`node_modules/`, versions pinned in `package.json`), and only the files that are needed are copied; the shape tool's icons (Font Awesome's SVGs) are also taken from the npm package at build time. At the end of the build, every file that is loaded is checked to be there and every file there to be loaded; otherwise the build fails.

## Licence

MIT (`LICENSE`). The libraries are under their own licences (each package in `node_modules/`).
