// Builds the static site into dist/ (what Cloudflare Pages serves).
//
//   npm run build
//
// dist/ holds only what the page loads: src/ as it is, and from the libraries (node_modules/) only
// the files it names, under the paths the editor asks for (/components/..., /javascripts/opencv.js). Then every file the page, its scripts, styles and templates load is
// checked to be there, and every file there to be loaded, so nothing is missing and nothing extra.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { root, read, write, copyFile, filesUnder } from './lib.mjs';

const dist = path.join(root, 'dist');
const nm = path.join(root, 'node_modules');

// the libraries' files, at the paths the page asks for them (as the CMS serves them)
const LIBS = [
    ['components/jquery/dist/jquery.min.js', nm, 'jquery/dist/jquery.min.js'],
    ['components/angular/angular.min.js', nm, 'angular/angular.min.js'],
    ['components/angular-animate/angular-animate.min.js', nm, 'angular-animate/angular-animate.min.js'],
    ['components/angular-touch/angular-touch.min.js', nm, 'angular-touch/angular-touch.min.js'],
    ['components/angular-cookies/angular-cookies.min.js', nm, 'angular-cookies/angular-cookies.min.js'],
    ['components/angular-translate/angular-translate.min.js', nm, 'angular-translate/dist/angular-translate.min.js'],
    ['components/angular-translate-loader-static-files/angular-translate-loader-static-files.min.js', nm, 'angular-translate-loader-static-files/angular-translate-loader-static-files.min.js'],
    ['components/angular-translate-storage-local/angular-translate-storage-local.min.js', nm, 'angular-translate-storage-local/angular-translate-storage-local.min.js'],
    ['components/angular-translate-storage-cookie/angular-translate-storage-cookie.min.js', nm, 'angular-translate-storage-cookie/angular-translate-storage-cookie.min.js'],
    ['components/angular-translate-handler-log/angular-translate-handler-log.min.js', nm, 'angular-translate-handler-log/angular-translate-handler-log.min.js'],
    ['components/bootstrap/dist/css/bootstrap.min.css', nm, 'bootstrap/dist/css/bootstrap.min.css'],
    ['components/font-awesome-5/css/all.min.css', nm, '@fortawesome/fontawesome-free/css/all.min.css'],
    // the two styles the editor uses (fas, far); browsers take the woff2 of the faces they need
    ['components/font-awesome-5/webfonts/fa-solid-900.woff2', nm, '@fortawesome/fontawesome-free/webfonts/fa-solid-900.woff2'],
    ['components/font-awesome-5/webfonts/fa-regular-400.woff2', nm, '@fortawesome/fontawesome-free/webfonts/fa-regular-400.woff2'],
    // the room 4 creator's shape tool: the icon list, and each icon's SVG (solid and regular)
    ['components/font-awesome-5/metadata/icons.yml', nm, '@fortawesome/fontawesome-free/metadata/icons.yml'],
    ['components/font-awesome-5/metadata/categories.yml', nm, '@fortawesome/fontawesome-free/metadata/categories.yml'],
    ['components/font-awesome-5/svgs/solid/', nm, '@fortawesome/fontawesome-free/svgs/solid/'],
    ['components/font-awesome-5/svgs/regular/', nm, '@fortawesome/fontawesome-free/svgs/regular/'],
    // ui-bootstrap4 (the CMS has its own copy of it, changed only in templates the editor does not
    // use: carousel, datepicker, rating, timepicker); the room 4 creator is one of its modals
    ['components/angular-bootstrap/dist/ui-bootstrap-tpls.js', nm, 'ui-bootstrap4/dist/ui-bootstrap-tpls.js'],
    ['components/angular-bootstrap/dist/ui-bootstrap-csp.css', nm, 'ui-bootstrap4/dist/ui-bootstrap-csp.css'],
    // OpenCV.js (the CMS has 4.5.0, which npm does not: 4.5.1 is the same build, and gives the same
    // room 4 walls and victims, and the same places out of reach)
    ['javascripts/opencv.js', nm, '@techstark/opencv-js/dist/opencv.js']
];

fs.rmSync(dist, { recursive: true, force: true });
filesUnder(path.join(root, 'src')).forEach(function (f) { copyFile(path.join(root, 'src', f), path.join(dist, f)); });
LIBS.forEach(function (l) {
    const from = path.join(l[1], l[2]);
    if (!fs.existsSync(from)) throw new Error('Missing (npm install?): ' + from);
    if (l[0].endsWith('/')) filesUnder(from).forEach(function (f) { copyFile(path.join(from, f), path.join(dist, l[0], f)); });
    else copyFile(from, path.join(dist, l[0]));
});

// ---- no old file kept after an update ----
// Every file the page names gets its content's fingerprint (?v=...), so a changed file has a new
// address; and every file is asked for again each time it is used (no-cache: answered by a short
// 304 when unchanged), which covers those the scripts load by name (templates, language files,
// icons, fonts) and the page itself.
const fingerprint = function (p) {
    return crypto.createHash('sha256').update(fs.readFileSync(path.join(dist, p))).digest('hex').slice(0, 10);
};
const indexPath = path.join(dist, 'index.html');
write(indexPath, read(indexPath).replace(/(src|href)="(\/[^"?#]+)"/g, function (m, attr, p) {
    const rel = p.replace(/^\//, '');
    return fs.existsSync(path.join(dist, rel)) ? attr + '="' + p + '?v=' + fingerprint(rel) + '"' : m;
}));
write(path.join(dist, '_headers'), [
    '/*',
    '  Cache-Control: no-cache',
    '  X-Content-Type-Options: nosniff',
    ''
].join('\n'));

// ---- nothing missing, nothing extra ----
const have = new Set(filesUnder(dist));
const used = new Set(['index.html', '_headers']);
const missing = [];
function use(p, from) {
    p = p.split(/[?#]/)[0].replace(/^\//, '');
    if (!p || used.has(p)) return;
    if (!have.has(p)) { missing.push('/' + p + ' (from ' + from + ')'); return; }
    used.add(p);
    if (/\.(html|css|js)$/.test(p)) scan(p);
}
function scan(p) {
    const text = read(path.join(dist, p));
    if (p.endsWith('.html')) for (const m of text.matchAll(/(?:src|href)="(\/[^"{}]+)"/g)) use(m[1], p);
    if (p.endsWith('.css')) {
        for (const m of text.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) {
            const u = m[1];
            if (/^(data:|https?:|#)/.test(u)) continue;
            // Font Awesome's faces: only the woff2 of the two styles used (the rest is never fetched)
            if (/font-awesome-5\/css/.test(p) && !/fa-(solid-900|regular-400)\.woff2$/.test(u)) continue;
            use(u.startsWith('/') ? u : path.posix.join(path.posix.dirname(p), u), p);
        }
    }
    if (p.endsWith('.js') && p !== 'javascripts/opencv.js') {
        for (const m of text.matchAll(/['"](\/(?:templates|images|fonts|stylesheets|lang)\/[^'"\s+]+\.[a-z0-9]+)['"]/g)) use(m[1], p);
    }
}
scan('index.html');
// loaded by name at run time: the language files, and the shape tool's icons
['en', 'ja'].forEach(function (l) { use('/lang/' + l + '.json', 'translate_config.js'); });
have.forEach(function (p) { if (/^components\/font-awesome-5\/(svgs|metadata)\//.test(p)) used.add(p); });
const extra = [...have].filter(function (p) { return !used.has(p); });
if (missing.length || extra.length) {
    if (missing.length) console.error('Missing:\n  ' + missing.join('\n  '));
    if (extra.length) console.error('Not used by the page:\n  ' + extra.join('\n  '));
    process.exit(1);
}

let bytes = 0;
have.forEach(function (p) { bytes += fs.statSync(path.join(dist, p)).size; });
console.log('dist/: ' + have.size + ' files, ' + (bytes / 1048576).toFixed(1) + ' MB');
