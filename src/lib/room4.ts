// The custom room 4 picture: the world export reads black pixels as walls and red blobs as wall
// tokens. Victims are stamps: small squares in a red that the export already reads as a token, with
// the token type carried in the blue value (stampColor). A red drawn by hand, or a stamp left on
// "random", gets a random type.

// A token found in the picture: its box, centre and stamp type (-1 random)
export interface FoundToken { minX: number; minY: number; maxX: number; maxY: number; n: number; sx: number; sy: number; cx: number; cy: number; type: number }
// The face of a wall a token stands against, and how thick the wall is there
export interface WallAnchor { x: number; y: number; thick: number }

function isWall(r: number, g: number, b: number) { return r <= 50 && g <= 50 && b <= 50; }
function isToken(r: number, g: number, b: number) { return r >= 100 && g <= 50 && b <= 50; }

// idx: the year's scoring type index (createArea4Victims); -1 = random
function stampRGB(idx: number) { return [255, 0, idx >= 0 ? 4 * (idx + 1) : 0]; }
function stampColor(idx: number) { return 'rgb(' + stampRGB(idx).join(',') + ')'; }
function codeOf(r: number, g: number, b: number) {
    return r === 255 && g === 0 && b > 0 && b % 4 === 0 && b <= 48 ? b / 4 - 1 : -1;
}

// The type of a token from the colours of its pixels: the most common exact stamp colour
function majorityType(counts: Record<string, number>) {
    let best: string | null = null, most = 0;
    Object.keys(counts).forEach(function (k) {
        if (counts[k] > most) { most = counts[k]; best = k; }
    });
    return best === null ? -1 : Number(best);
}

// For the world export: the stamp type of a token contour in an OpenCV RGBA image, or -1
function contourType(src: any, contour: any) {
    const rect = cv.boundingRect(contour);
    const ch = src.channels();
    const counts: Record<string, number> = {};
    for (let y = rect.y; y < rect.y + rect.height; y++) {
        for (let x = rect.x; x < rect.x + rect.width; x++) {
            const i = (y * src.cols + x) * ch;
            const r = src.data[i], g = src.data[i + 1], b = src.data[i + 2];
            if (!isToken(r, g, b)) continue;
            if (cv.pointPolygonTest(contour, new cv.Point(x, y), false) < 0) continue;
            const t = codeOf(r, g, b);
            counts[t] = (counts[t] || 0) + 1;
        }
    }
    return majorityType(counts);
}

// The face of the wall nearest to (cx, cy) within reach px, by isWallAt(x, y) of pixels, or
// null: where a token is shown standing - its badge is drawn against that face, not in the gap
// the stamp keeps. Out: { x, y } the face point (the edge of the nearest wall pixel towards the
// token), and thick, how thick the wall is behind it (px)
function wallAnchor(isWallAt: (x: number, y: number) => boolean, cx: number, cy: number, reach: number): WallAnchor | null {
    let best: { x: number; y: number } | null = null, bestD = reach * reach;
    for (let y = Math.floor(cy - reach); y <= Math.ceil(cy + reach); y++) {
        for (let x = Math.floor(cx - reach); x <= Math.ceil(cx + reach); x++) {
            const d = (x + 0.5 - cx) * (x + 0.5 - cx) + (y + 0.5 - cy) * (y + 0.5 - cy);
            if (d < bestD && isWallAt(x, y)) { bestD = d; best = { x: x, y: y }; }
        }
    }
    if (!best) return null;
    const mx = best.x + 0.5, my = best.y + 0.5;
    const l = Math.sqrt(bestD) || 1, ux = (cx - mx) / l, uy = (cy - my) / l;
    let thick = 1;
    while (thick < 4 * reach && isWallAt(Math.floor(mx - ux * thick), Math.floor(my - uy * thick))) thick++;
    return { x: mx + ux * 0.5, y: my + uy * 0.5, thick: thick };
}

// Where a token's badge of radius r is drawn: against its wall's face (anchor), on the token's
// side, the badge reaching into the wall by at most most of its thickness (never through it, and
// never apart from it). wallThick overrides the anchor's thickness (same units as r)
function badgeOnWall(t: { cx: number; cy: number }, anchor: WallAnchor | null, r: number, wallThick?: number) {
    if (!anchor) return { x: t.cx, y: t.cy };
    const dx = t.cx - anchor.x, dy = t.cy - anchor.y, l = Math.hypot(dx, dy);
    if (l < 1e-6) return { x: t.cx, y: t.cy };
    const thick = wallThick !== undefined ? wallThick : anchor.thick || 1;
    const off = r - Math.min(0.5 * r, 0.8 * thick);
    return { x: anchor.x + dx / l * off, y: anchor.y + dy / l * off };
}

// Tokens in canvas pixels: connected red blobs with their box, centre and type
function findTokens(px: ArrayLike<number>, w: number, h: number): FoundToken[] {
    const seen = new Uint8Array(w * h);
    const tokens: FoundToken[] = [];
    for (let start = 0; start < w * h; start++) {
        if (seen[start]) continue;
        const s4 = start * 4;
        if (!isToken(px[s4], px[s4 + 1], px[s4 + 2])) continue;
        const stack = [start];
        seen[start] = 1;
        const t: FoundToken = { minX: w, minY: h, maxX: 0, maxY: 0, n: 0, sx: 0, sy: 0, cx: 0, cy: 0, type: -1 };
        const counts: Record<string, number> = {};
        while (stack.length) {
            const p = stack.pop()!;
            const x = p % w, y = (p - x) / w;
            const i = p * 4;
            const code = codeOf(px[i], px[i + 1], px[i + 2]);
            counts[code] = (counts[code] || 0) + 1;
            t.n++; t.sx += x; t.sy += y;
            if (x < t.minX) t.minX = x;
            if (x > t.maxX) t.maxX = x;
            if (y < t.minY) t.minY = y;
            if (y > t.maxY) t.maxY = y;
            const next = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
            for (let k = 0; k < 4; k++) {
                const q = next[k];
                if (q < 0 || seen[q]) continue;
                const j = q * 4;
                if (isToken(px[j], px[j + 1], px[j + 2])) { seen[q] = 1; stack.push(q); }
            }
        }
        if (t.n < 3) continue;
        t.cx = t.sx / t.n;
        t.cy = t.sy / t.n;
        t.type = majorityType(counts);
        tokens.push(t);
    }
    return tokens;
}

export {
    isWall,
    isToken,
    stampRGB,
    stampColor,
    contourType,
    findTokens,
    wallAnchor,
    badgeOnWall
};
