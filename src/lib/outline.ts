// Outlines of obstacles made from a drawing or an icon (lib/field: ObstacleShape, 'polygon' and
// 'icon'): an icon's silhouette traced from its glyph, outlines kept to a unit box, and their
// triangles for the world file. Pure geometry, but iconOutline, which draws the glyph on a canvas.

export type Ring = number[][];

// A ring's signed area (shoelace): above 0 when its points run anticlockwise with y up
function area(r: Ring) {
    let a = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1];
    return a / 2;
}

// Douglas-Peucker on an open line of points
function simplifyLine(pts: Ring, eps: number): Ring {
    if (pts.length < 3) return pts.slice();
    const a = pts[0], b = pts[pts.length - 1];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    let far = 0, at = 0;
    for (let i = 1; i < pts.length - 1; i++) {
        const d = Math.abs(dy * (pts[i][0] - a[0]) - dx * (pts[i][1] - a[1])) / l;
        if (d > far) { far = d; at = i; }
    }
    if (far <= eps) return [a, b];
    return simplifyLine(pts.slice(0, at + 1), eps).slice(0, -1).concat(simplifyLine(pts.slice(at), eps));
}
// ... on a closed ring: split at its two points farthest apart
function simplifyRing(r: Ring, eps: number): Ring {
    if (r.length < 4) return r.slice();
    let j = 0, far = 0;
    for (let i = 1; i < r.length; i++) { const d = Math.hypot(r[i][0] - r[0][0], r[i][1] - r[0][1]); if (d > far) { far = d; j = i; } }
    const one = simplifyLine(r.slice(0, j + 1), eps), two = simplifyLine(r.slice(j).concat([r[0]]), eps);
    return one.slice(0, -1).concat(two.slice(0, -1));
}

// The outer outlines of the shapes in a mask (1 = solid; w x h), holes filled: one ring per piece
// of more than minPx pixels, along its pixels' outer corners, simplified to eps px
export function traceMask(mask: Uint8Array, w: number, h: number, minPx: number, eps: number): Ring[] {
    // the outside: what is reached from the border through empty pixels; the rest is solid
    const out = new Uint8Array(w * h), queue: number[] = [];
    const push = function (i: number) { if (!out[i] && !mask[i]) { out[i] = 1; queue.push(i); } };
    for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
    while (queue.length) {
        const i = queue.pop()!, x = i % w, y = (i - x) / w;
        if (x > 0) push(i - 1); if (x < w - 1) push(i + 1); if (y > 0) push(i - w); if (y < h - 1) push(i + w);
    }
    const solid = function (x: number, y: number) { return x >= 0 && y >= 0 && x < w && y < h && !out[y * w + x]; };
    // each piece (4-connected), and its boundary as the edges between its pixels and the outside
    const seen = new Uint8Array(w * h), rings: Ring[] = [];
    for (let start = 0; start < w * h; start++) {
        if (out[start] || seen[start]) continue;
        const piece = [start];
        seen[start] = 1;
        for (let k = 0; k < piece.length; k++) {
            const i = piece[k], x = i % w, y = (i - x) / w;
            [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].forEach(function (q) {
                if (!solid(q[0], q[1])) return;
                const n = q[1] * w + q[0];
                if (!seen[n]) { seen[n] = 1; piece.push(n); }
            });
        }
        if (piece.length < minPx) continue;
        // the boundary edges, clockwise round the solid (directed corner to corner), chained
        const next: Record<string, number[]> = {};
        const add = function (ax: number, ay: number, bx: number, by: number) { next[ax + ',' + ay] = [bx, by]; };
        piece.forEach(function (i) {
            const x = i % w, y = (i - x) / w;
            if (!solid(x, y - 1)) add(x, y, x + 1, y);
            if (!solid(x + 1, y)) add(x + 1, y, x + 1, y + 1);
            if (!solid(x, y + 1)) add(x + 1, y + 1, x, y + 1);
            if (!solid(x - 1, y)) add(x, y + 1, x, y);
        });
        // its outer ring: from its top left corner (a hole is filled, so there is one ring; where two
        // pixels touch at a corner the chain takes the first edge it finds)
        const s0 = piece.reduce(function (m, i) { return i < m ? i : m; }, Infinity);
        const sx = s0 % w, sy = (s0 - sx) / w;
        const ring: Ring = [[sx, sy]];
        let cur = next[sx + ',' + sy];
        for (let guard = 0; cur && (cur[0] !== sx || cur[1] !== sy) && guard < 4 * w * h; guard++) {
            ring.push(cur);
            cur = next[cur[0] + ',' + cur[1]];
        }
        const r = simplifyRing(ring, eps);
        if (r.length >= 3) rings.push(r);
    }
    return rings;
}

// Rings kept to a unit box about their middle (x, y in -0.5..0.5) and how wide they are for their
// height (aspect), or null for none / a box of no size
export function normalize(rings: Ring[]): { rings: Ring[]; aspect: number } | null {
    const pts = ([] as Ring).concat.apply([], rings);
    if (!pts.length) return null;
    const x0 = Math.min.apply(null, pts.map(function (p) { return p[0]; })), x1 = Math.max.apply(null, pts.map(function (p) { return p[0]; }));
    const y0 = Math.min.apply(null, pts.map(function (p) { return p[1]; })), y1 = Math.max.apply(null, pts.map(function (p) { return p[1]; }));
    const bw = x1 - x0, bh = y1 - y0;
    if (!(bw > 0 && bh > 0)) return null;
    const r4 = function (v: number) { return Math.round(v * 10000) / 10000; };
    return {
        rings: rings.map(function (r) { return r.map(function (p) { return [r4((p[0] - x0) / bw - 0.5), r4((p[1] - y0) / bh - 0.5)]; }); }),
        aspect: bw / bh
    };
}

// Whether a ring crosses itself (two of its sides that are not neighbours meet)
export function selfCrossing(r: Ring): boolean {
    const n = r.length;
    const o = function (p: number[], q: number[], s: number[]) { return (q[0] - p[0]) * (s[1] - p[1]) - (q[1] - p[1]) * (s[0] - p[0]); };
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            if (j === i + 1 || (i === 0 && j === n - 1)) continue;
            const a = r[i], b = r[(i + 1) % n], c = r[j], d = r[(j + 1) % n];
            if (o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0) return true;
        }
    }
    return false;
}

// The triangles of a simple ring (indices into it), by cutting off ears; a fan from its first point
// should it not be simple
export function triangulate(r: Ring): number[][] {
    const n = r.length;
    if (n < 3) return [];
    const idx = r.map(function (_, i) { return i; });
    if (area(r) < 0) idx.reverse();       // anticlockwise (y up), as the ears below are taken
    const out: number[][] = [];
    const cross = function (a: number[], b: number[], c: number[]) { return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); };
    // in the triangle or on its sides (a corner on a side would be cut off with it), not at its corners
    const same = function (p: number[], q: number[]) { return p[0] === q[0] && p[1] === q[1]; };
    const inTri = function (p: number[], a: number[], b: number[], c: number[]) {
        if (same(p, a) || same(p, b) || same(p, c)) return false;
        return cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;
    };
    let guard = 0;
    while (idx.length > 3 && guard++ < 10 * n) {
        let cut = false;
        for (let k = 0; k < idx.length; k++) {
            const ia = idx[(k + idx.length - 1) % idx.length], ib = idx[k], ic = idx[(k + 1) % idx.length];
            const a = r[ia], b = r[ib], c = r[ic];
            if (cross(a, b, c) <= 0) continue;            // not convex here
            if (idx.some(function (j) { return j !== ia && j !== ib && j !== ic && inTri(r[j], a, b, c); })) continue;
            out.push([ia, ib, ic]);
            idx.splice(k, 1);
            cut = true;
            break;
        }
        if (!cut) break;
    }
    if (idx.length === 3) out.push([idx[0], idx[1], idx[2]]);
    else if (idx.length > 3) for (let k = 1; k < idx.length - 1; k++) out.push([idx[0], idx[k], idx[k + 1]]);
    return out;
}

// An icon of Font Awesome's font (the page's icons) as outlines: its glyph drawn on a canvas, traced
// (holes filled: the robot gets into none), in a unit box
export function iconOutline(unicode: string, solid: boolean): Promise<{ rings: Ring[]; aspect: number } | null> {
    const font = (solid ? '900' : '400') + ' 160px "Font Awesome 7 Free"';
    const glyph = String.fromCodePoint(parseInt(unicode, 16));
    return document.fonts.load(font, glyph).then(function (faces) {
        if (!faces.length) return null;
        const m = document.createElement('canvas').getContext('2d')!;
        m.font = font;
        const metrics = m.measureText(glyph);
        const asc = metrics.fontBoundingBoxAscent, w = Math.ceil(metrics.width) + 4, h = Math.ceil(asc + metrics.fontBoundingBoxDescent) + 4;
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const g = c.getContext('2d', { willReadFrequently: true })!;
        g.font = font;
        g.fillStyle = '#000';
        g.fillText(glyph, 2, asc + 2);
        const px = g.getImageData(0, 0, w, h).data, mask = new Uint8Array(w * h);
        for (let i = 0; i < w * h; i++) mask[i] = px[4 * i + 3] > 127 ? 1 : 0;
        return normalize(traceMask(mask, w, h, 30, 1.2));
    });
}
