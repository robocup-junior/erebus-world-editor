// Small helpers shared by the scripts.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function read(file) {
    return fs.readFileSync(file, 'utf8');
}

export function write(file, text) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
}

export function copyFile(from, to) {
    if (!fs.existsSync(from)) throw new Error('Missing: ' + from);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
}

// every file under dir, as paths relative to it (with /)
export function filesUnder(dir) {
    const out = [];
    (function walk(rel) {
        fs.readdirSync(path.join(dir, rel), { withFileTypes: true }).forEach(function (e) {
            const r = rel ? rel + '/' + e.name : e.name;
            if (e.isDirectory()) walk(r); else out.push(r);
        });
    })('');
    return out;
}
