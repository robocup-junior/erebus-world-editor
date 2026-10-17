// Copies what the page loads from the libraries as files of their own into public/vendor (not
// committed): OpenCV.js, and Font Awesome's icon list and icon SVGs for the room 4 creator's shape
// tool. Run by npm before dev, build and the tests.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const nm = path.join(root, 'node_modules');
const out = path.join(root, 'public', 'vendor');

const COPY = [
    ['opencv.js', '@techstark/opencv-js/dist/opencv.js'],
    ['fontawesome/metadata/icons.yml', '@fortawesome/fontawesome-free/metadata/icons.yml'],
    ['fontawesome/metadata/categories.yml', '@fortawesome/fontawesome-free/metadata/categories.yml'],
    ['fontawesome/svgs/solid', '@fortawesome/fontawesome-free/svgs/solid'],
    ['fontawesome/svgs/regular', '@fortawesome/fontawesome-free/svgs/regular']
];

fs.rmSync(out, { recursive: true, force: true });
COPY.forEach(function (c) {
    const from = path.join(nm, c[1]), to = path.join(out, c[0]);
    if (!fs.existsSync(from)) throw new Error('Missing (npm install?): ' + from);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.cpSync(from, to, { recursive: true });
});
console.log('public/vendor: ' + COPY.map(function (c) { return c[0]; }).join(', '));
