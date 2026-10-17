// Serves dist/ on http://localhost:8080 (PORT to change it), as a static host would: text in UTF-8.
//
//   npm run dev     (build, then serve)
//   npm run serve   (serve what is built)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { root } from './lib.mjs';

const dist = path.join(root, 'dist');
const port = Number(process.env.PORT) || 8080;
const TYPES = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8', '.yml': 'text/yaml; charset=utf-8', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.woff2': 'font/woff2'
};

http.createServer(function (req, res) {
    let p = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(dist, path.normalize(p));
    if (!file.startsWith(dist) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found: ' + p);
        return;
    }
    // as dist/_headers asks: no-cache, so each use asks again and an unchanged file is a 304
    const st = fs.statSync(file), etag = '"' + st.size.toString(36) + '-' + st.mtimeMs.toString(36) + '"';
    const head = { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', ETag: etag };
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, head); res.end(); return; }
    res.writeHead(200, head);
    fs.createReadStream(file).pipe(res);
}).listen(port, function () {
    console.log('Erebus Editor 2026 on http://localhost:' + port + '/');
});
