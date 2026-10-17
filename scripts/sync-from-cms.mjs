// Takes Erebus Editor 2026 from a checkout of rcj-rescue-cms into this repository.
//
//   npm run sync -- [path to rcj-rescue-cms]   (default: ../rcj-rescue-cms)
//
// The editor is made in the CMS, where it is served at /service/editor/simulation/2026. This copies
// what the editor is made of into src/ (its scripts, styles, templates, the editor's part of the
// language files), the editor's tests into test/, and the editor's page markup (the CMS's Pug view, rendered
// as the public service renders it) into src/index.html between its <!-- editor --> marks. Links that
// lead back into the CMS are taken off. What it took from is noted in cms-source.json.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { root, read, write, copyFile } from './lib.mjs';

const cms = path.resolve(process.argv[2] || path.join(root, '..', 'rcj-rescue-cms'));
const pub = path.join(cms, 'public');
const view = path.join(cms, 'views', 'sim_editor', 'sim_editor_beta_2026.pug');
if (!fs.existsSync(view)) {
    console.error('Not a checkout of rcj-rescue-cms with Erebus Editor 2026: ' + cms);
    process.exit(1);
}

// ---- the editor's own files (same paths as in the CMS's public/) ----
const EDITOR_FILES = [
    'javascripts/translate_config.js',
    'javascripts/sim_editor/sim_world_2026.js',
    'javascripts/sim_editor/sim_room4_world_2026.js',
    'javascripts/sim_editor/sim_icons.js',
    'javascripts/sim_editor/room4_creator.js',
    'javascripts/sim_editor/rotation_dial.js',
    'javascripts/sim_editor_beta/lattice.js',
    'javascripts/sim_editor_beta/model.js',
    'javascripts/sim_editor_beta/view.js',
    'javascripts/sim_editor_beta/tour.js',
    'javascripts/sim_editor_beta/beta.2026.js',
    'stylesheets/sim_editor/sim_modern.css',
    'stylesheets/sim_editor/sim_beta.css',
    'templates/sim_editor/custom_room_4_modal.2026.html',
    'templates/sim_editor/rotation_dial.html'
];
EDITOR_FILES.forEach(function (f) { copyFile(path.join(pub, f), path.join(root, 'src', f)); });

// the fonts the page uses (Outfit; Japanese falls back to the system's fonts)
['Regular', 'Medium', 'SemiBold', 'Bold', 'ExtraBold', 'Black'].forEach(function (w) {
    const f = 'fonts/outfit/Outfit-' + w + '.ttf';
    if (fs.existsSync(path.join(pub, f))) copyFile(path.join(pub, f), path.join(root, 'src', f));
});
['favicon-32.png', 'apple-touch-icon-180.png'].forEach(function (f) { copyFile(path.join(pub, 'images', f), path.join(root, 'src', 'images', f)); });

// ---- the language files: the editor's part only ----
// Some of its texts link to others of the CMS (angular-translate's "@:key"): those are put in their
// place, so the part stands on its own.
['en', 'ja'].forEach(function (lang) {
    const all = JSON.parse(read(path.join(pub, 'lang', lang + '.json')));
    const lookup = function (key) {
        const v = key.split('.').reduce(function (o, k) { return o && o[k]; }, all);
        if (typeof v !== 'string') throw new Error(lang + '.json: "@:' + key + '" links to nothing');
        return v;
    };
    const resolve = function (v, depth) {
        if (typeof v === 'string') {
            if (depth > 10) throw new Error(lang + '.json: links go round: ' + v);
            return v.indexOf('@:') < 0 ? v : resolve(v.replace(/@:([A-Za-z0-9_.]+[A-Za-z0-9_])/g, function (m, key) { return lookup(key); }), depth + 1);
        }
        const out = Array.isArray(v) ? [] : {};
        Object.keys(v).forEach(function (k) { out[k] = resolve(v[k], depth); });
        return out;
    };
    const mine = { admin: { simBeta: resolve(all.admin.simBeta, 0), simMapEditor: resolve(all.admin.simMapEditor, 0) } };
    write(path.join(root, 'src', 'lang', lang + '.json'), JSON.stringify(mine, null, 4) + '\n');
});

// ---- the page: the editor's markup from the CMS's view ----
const pug = createRequire(path.join(cms, 'package.json'))('pug');
const rendered = pug.renderFile(view, { user: undefined, pubService: true, basedir: path.join(cms, 'views') });
const from = rendered.indexOf('<input id="simBetaFile"');
const to = rendered.indexOf('<div class="modal fade" id="loginModal"');
if (from < 0 || to < 0) throw new Error('The editor markup was not found in the rendered view (has the layout changed?)');
// the layout's wrapper (and its footer block, empty here) close before the CMS's own modals
let markup = rendered.slice(from, to).replace(/(<\/div>)\s*$/, '');
const edits = [
    // Home (the CMS's public services) in the top bar
    [/<a class="sbx-btn icon" href="\/service"[^>]*>\s*<i class="fas fa-home"><\/i>\s*<\/a>/, ''],
    // the β menu's way to the classic editor, which this site does not have
    [/<a class="sbx-beta-menu-item" href="\/service\/editor\/simulation\/2026\/classic"[\s\S]*?<\/a>/, '']
];
edits.forEach(function (e) {
    const before = markup;
    markup = markup.replace(e[0], e[1]);
    if (markup === before) throw new Error('Not found in the editor markup (has the view changed?): ' + e[0]);
});
const left = markup.match(/(?:href|src)="\/(?:service|home|login|api)[^"]*"/g);
if (left) throw new Error('Links into the CMS are left in the markup: ' + left.join(' '));
// kept exactly as Pug writes it: whitespace between tags would show as space between inline elements
const pagePath = path.join(root, 'src', 'index.html');
const page = read(pagePath);
const a = page.indexOf('<!-- editor -->'), b = page.indexOf('<!-- /editor -->');
if (a < 0 || b < 0) throw new Error('src/index.html has no <!-- editor --> ... <!-- /editor --> marks');
write(pagePath, page.slice(0, a) + '<!-- editor -->\n' + markup + '\n' + page.slice(b));

// ---- the editor's tests (paths into this layout) ----
const TESTS = ['simBetaModel', 'simLattice', 'simReach', 'simWorld2026', 'simTour', 'simLesson', 'simRoom4Badge'];
TESTS.forEach(function (t) {
    let s = read(path.join(cms, 'test', t + '.test.js'));
    s = s.replace(/\.\.\/public\//g, '../src/')
        // the guide's tests look for the parts it lights up in the page
        .replace("'../views/sim_editor/sim_editor_beta_2026.pug'", "'../src/index.html'");
    write(path.join(root, 'test', t + '.test.js'), s);
});
const fixtures = path.join(cms, 'test', 'fixtures', 'sim2026');
fs.readdirSync(fixtures).forEach(function (f) { copyFile(path.join(fixtures, f), path.join(root, 'test', 'fixtures', 'sim2026', f)); });

// ---- where it came from ----
const git = function (args) { try { return execFileSync('git', ['-C', cms].concat(args), { encoding: 'utf8' }).trim(); } catch (e) { return ''; } };
const source = {
    version: JSON.parse(read(path.join(cms, 'package.json'))).version,
    commit: git(['rev-parse', 'HEAD']),
    dirty: git(['status', '--porcelain', '--', 'public', 'views/sim_editor', 'test']) !== ''
};
write(path.join(root, 'cms-source.json'), JSON.stringify(source, null, 2) + '\n');
console.log('Taken from rcj-rescue-cms ' + source.version + ' (' + source.commit.slice(0, 8) + (source.dirty ? ', with changes not committed' : '') + ')');
