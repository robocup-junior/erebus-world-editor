// The room 4 creator's picture: drawing on it (pen, lines, curves, shapes, icons and pictures as
// walls; stamps for victims; the eraser; selections; templates), what it shows over it (the grid, the
// map's walls and entrances, where the robot cannot get to, the victims' badges) and its zoom.
// mountCanvas(scope, stage) sets it up in the stage element (holding canvas.r4-main and
// canvas.r4-over); scope is the creator's (Room4Creator.vue): its r4 state, its r4api (filled in
// here), its host (the editor's map side) and the few scope functions the drawing needs.
import * as R4 from '../lib/room4';
import * as Icons from '../lib/icons';
import { drawHole } from '../lib/hole';
import type * as World from '../lib/field';
import type { CreatorScope } from './scope';
import * as OpenCV from '../lib/opencv';
import type { Room4Token } from '../lib/types';

// a point of the picture (px)
type P = { x: number; y: number };
type Ctx = CanvasRenderingContext2D;
// a stamp found in the picture, with what the creator works out about it
interface Token extends R4.FoundToken { nearWall?: boolean; anchor: R4.WallAnchor | null; unreachable?: boolean }
// a shape being drawn: line / rect / ellipse (a, b), circle (a, r), polygon (a, r, n, rot), arc (p0, c, p1),
// curve (pts, smooth, closed), icon (a, b, free)
type Shape = { type: string; [key: string]: any };
type Spot = { ok: true; x: number; y: number; wall: P } | { ok: false; reason: string };

export function mountCanvas(scope: CreatorScope, stage: HTMLElement): void {
    // The editor's host holds the room 4 tiles and receives the picture
    const editor = scope.host;
    const r4 = scope.r4;
    const types = scope.stampTypes;

    const main = stage.querySelector('canvas.r4-main') as HTMLCanvasElement;
    const over = stage.querySelector('canvas.r4-over') as HTMLCanvasElement;
    const ctx = main.getContext('2d')!;
    const octx = over.getContext('2d')!;
    const W = Math.round(editor.canvasWidth);
    const H = Math.round(editor.canvasHeight);
    main.width = over.width = W;
    main.height = over.height = H;

    // Room 4 tiles inside the picture; the rest of its bounding box is painted grey
    const keys = editor.roomTiles[2] || [];
    let minX = Infinity, minY = Infinity, maxX = -Infinity;
    keys.forEach(function (k) {
        const p = k.split(',').map(Number);
        minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]);
    });
    const cols = (maxX - minX) / 2 + 1;
    const block = W / cols;                       // pixels per tile (12 cm)
    const rows = Math.round(H / block);
    const inRoom: Record<string, boolean> = {};
    keys.forEach(function (k) {
        const p = k.split(',').map(Number);
        inRoom[((p[0] - minX) / 2) + ',' + ((p[1] - minY) / 2)] = true;
    });
    function roomAt(x: number, y: number) {
        return !!inRoom[Math.floor(x / block) + ',' + Math.floor(y / block)];
    }

    const wallWidth = Math.max(2, Math.round(block / 12));    // 1 cm
    const stampSize = Math.max(6, Math.round(block / 6));     // 2 cm, the size of a wall token
    // the badge shown for a token: it reaches the wall face whatever gap (2-4 px) the token
    // was put down with, so it does not look apart from its wall
    function badgeRadius() { return Math.max(9 * k, stampSize / 2 + 5); }
    const eraserSizes: Record<string, number> = { s: block / 8, m: block / 4, l: block / 2 };

    // ---- the map around room 4: its walls, and where the robot can get to ---------------
    // All in cm as in the world: the walls of the map (whole, half, inner and curved, from the
    // editor), its holes and start tile, plus the walls of this picture on room 4.
    const geo = editor.room4MapGeometry ? editor.room4MapGeometry() : null;
    const pxPerCm = block / 12;
    const originCm = { x: ((minX - 1) / 2) * 12, y: ((minY - 1) / 2) * 12 };
    const REACH_RES = 0.5;          // cm per cell of the reach grid
    let reachLayer: HTMLCanvasElement | null = null;          // canvas over the room 4 box: tint where the robot cannot get to
    let reachInfo: { dist: Float32Array; gw: number; gh: number; need: number } | null = null;           // distance (cells) from each cell to the nearest reachable robot centre
    let reachStats: { blocked: number; room: number } | null = null;          // { blocked, room }: reach-grid cells of room 4 floor, and those out of reach

    function arcAngles(sh: Extract<World.WallShape, { type: 'arc' }>) {
        // the arc runs from (cx + dx r, cy) to (cx, cy + dy r), a quarter circle
        const a1 = sh.dx > 0 ? 0 : Math.PI;
        const a2 = sh.dy > 0 ? Math.PI / 2 : -Math.PI / 2;
        let diff = a2 - a1;
        while (diff <= -Math.PI) diff += 2 * Math.PI;
        while (diff > Math.PI) diff -= 2 * Math.PI;
        return { a1: a1, a2: a2, ccw: diff < 0 };
    }

    function mapShapePath(c: Ctx, sh: World.WallShape) {
        c.beginPath();
        if (sh.type === 'seg') {
            c.moveTo(sh.x1, sh.y1);
            c.lineTo(sh.x2, sh.y2);
        } else {
            const a = arcAngles(sh);
            c.arc(sh.cx, sh.cy, sh.r, a.a1, a.a2, a.ccw);
        }
    }

    // The map's walls and border on the reach grid; drawn once, the map does not change here
    const reachBase = (function () {
        if (!geo) return null;
        const gw = Math.ceil(geo.width * geo.tileCm / REACH_RES);
        const gh = Math.ceil(geo.length * geo.tileCm / REACH_RES);
        const c = document.createElement('canvas');
        c.width = gw;
        c.height = gh;
        const x = c.getContext('2d')!;
        x.scale(1 / REACH_RES, 1 / REACH_RES);
        x.strokeStyle = '#000';
        x.lineWidth = geo.wallHalfCm * 2;
        x.lineCap = 'square';
        geo.shapes.forEach(function (sh) { mapShapePath(x, sh); x.stroke(); });
        return { canvas: c, gw: gw, gh: gh, holes: new Uint8Array(gw * gh), holeTiles: new Uint8Array(gw * gh) };
    })();

    // ---- the floors of room 4's tiles: holes, swamps, checkpoints (the floor tool) ---------------
    // In editor.room4Floors by cell key "x,y" (the map's own coordinates); the tile (tx, ty) of the
    // picture is the cell (2 (box x + tx) + 1, 2 (box y + ty) + 1)
    const floors: Record<string, string> = editor.room4Floors || (editor.room4Floors = {});
    const box = { x: (minX - 1) / 2, y: (minY - 1) / 2 };
    function floorKey(tx: number, ty: number) { return (2 * (box.x + tx) + 1) + ',' + (2 * (box.y + ty) + 1); }
    function floorAt(tx: number, ty: number) { return floors[floorKey(tx, ty)] || ''; }
    // the kind of floor (of the map's year) of a tile of the picture
    function floorKindAt(tx: number, ty: number) {
        const id = floorAt(tx, ty);
        return id ? editor.room4FloorKinds.find(function (k) { return k.id === id; }) || null : null;
    }
    // the holes on the reach grid: the map's, outside room 4, and room 4's as they are here. A black
    // tile is a hole inside its black rim: the robot's centre keeps off the hole (holes) and
    // may go onto the rim; the whole tile is no floor to reach (holeTiles).
    function markHoles() {
        if (!reachBase || !geo) return;
        const holes = reachBase.holes, holeTiles = reachBase.holeTiles, gw = reachBase.gw, gh = reachBase.gh, n = Math.round(geo.tileCm / REACH_RES);
        const rim = Math.round(geo.holeRimCm / REACH_RES);
        holes.fill(0);
        holeTiles.fill(0);
        const mark = function (tx: number, ty: number) {
            const x0 = Math.floor(tx * geo.tileCm / REACH_RES), y0 = Math.floor(ty * geo.tileCm / REACH_RES);
            for (let yy = y0; yy < Math.min(gh, y0 + n); yy++) {
                for (let xx = x0; xx < Math.min(gw, x0 + n); xx++) {
                    holeTiles[yy * gw + xx] = 1;
                    if (yy >= y0 + rim && yy < y0 + n - rim && xx >= x0 + rim && xx < x0 + n - rim) holes[yy * gw + xx] = 1;
                }
            }
        };
        geo.holes.forEach(function (h) { if (!inRoom[(h[0] - box.x) + ',' + (h[1] - box.y)]) mark(h[0], h[1]); });
        Object.keys(inRoom).forEach(function (k) {
            const t = k.split(',').map(Number);
            const kind = floorKindAt(t[0], t[1]);
            if (kind && kind.hole) mark(box.x + t[0], box.y + t[1]);
        });
    }
    markHoles();

    // The map's walls in picture pixels: stamps attach to them as to the walls drawn here
    const mapWallMask = (function () {
        const m = new Uint8Array(W * H);
        if (!geo) return m;
        const c = document.createElement('canvas');
        c.width = W;
        c.height = H;
        const x = c.getContext('2d')!;
        x.translate(-originCm.x * pxPerCm, -originCm.y * pxPerCm);
        x.scale(pxPerCm, pxPerCm);
        x.strokeStyle = '#000';
        x.lineWidth = geo.wallHalfCm * 2;
        x.lineCap = 'square';
        geo.shapes.forEach(function (sh) { mapShapePath(x, sh); x.stroke(); });
        const d = x.getImageData(0, 0, W, H).data;
        for (let i = 0; i < W * H; i++) m[i] = d[i * 4 + 3] >= 128 ? 1 : 0;
        return m;
    })();

    // Where the robot (its centre at least its radius away from every wall) can get to from
    // the start tile, and the floor of room 4 its body never covers
    function computeReach() {
        reachLayer = null;
        reachInfo = null;
        reachStats = null;
        let state = 'ok';
        if (!reachBase || OpenCV.failed()) state = 'unavailable';
        else if (!OpenCV.isReady()) state = 'loading';
        else if (!geo!.start) state = 'noStart';
        scope.$applyAsync(function () { r4.reachState = state; if (state !== 'ok') r4.reachBlocked = 0; });
        if (state !== 'ok') return;

        const gw = reachBase!.gw, gh = reachBase!.gh;
        const c = document.createElement('canvas');
        c.width = gw;
        c.height = gh;
        const x = c.getContext('2d')!;
        x.drawImage(reachBase!.canvas, 0, 0);
        // the walls of this picture, on room 4 only
        const pic = document.createElement('canvas');
        pic.width = W;
        pic.height = H;
        const pctx = pic.getContext('2d')!;
        const img = pctx.createImageData(W, H);
        for (let i = 0; i < W * H; i++) {
            const j = i * 4;
            if (R4.isWall(pixels[j], pixels[j + 1], pixels[j + 2]) && roomAt(i % W, Math.floor(i / W))) {
                img.data[j + 3] = 255;
            }
        }
        pctx.putImageData(img, 0, 0);
        x.drawImage(pic, originCm.x / REACH_RES, originCm.y / REACH_RES, W / pxPerCm / REACH_RES, H / pxPerCm / REACH_RES);
        const occ = x.getImageData(0, 0, gw, gh).data;

        const src = new cv.Mat(gh, gw, cv.CV_8UC1);
        for (let i = 0; i < gw * gh; i++) {
            const gx = i % gw, gy = (i - gx) / gw;
            const border = gx === 0 || gy === 0 || gx === gw - 1 || gy === gh - 1;
            src.data[i] = border || occ[i * 4 + 3] > 40 ? 0 : 255;
        }
        const dist = new cv.Mat();
        cv.distanceTransform(src, dist, cv.DIST_L2, 5);
        const need = geo!.robotRadiusCm / REACH_RES;
        const free = new Uint8Array(gw * gh);
        for (let i = 0; i < gw * gh; i++) free[i] = dist.data32F[i] >= need && !reachBase!.holes[i] ? 1 : 0;

        // flood from the start (the nearest free cell to its centre)
        const reached = new Uint8Array(gw * gh);
        let sx = Math.round(geo!.start!.x / REACH_RES), sy = Math.round(geo!.start!.y / REACH_RES);
        let seed = -1;
        for (let r = 0; r < 12 / REACH_RES && seed < 0; r++) {
            for (let yy = sy - r; yy <= sy + r && seed < 0; yy++) for (let xx = sx - r; xx <= sx + r; xx++) {
                if (xx >= 0 && yy >= 0 && xx < gw && yy < gh && free[yy * gw + xx]) { seed = yy * gw + xx; break; }
            }
        }
        if (seed >= 0) {
            const stack = [seed];
            reached[seed] = 1;
            while (stack.length) {
                const q = stack.pop()!;
                const qx = q % gw, qy = (q - qx) / gw;
                for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                    const nx = qx + dx, ny = qy + dy;
                    if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
                    const n = ny * gw + nx;
                    if (!reached[n] && free[n]) { reached[n] = 1; stack.push(n); }
                }
            }
        }

        if (seed < 0) {
            // the robot cannot move from the start (or the start is off the map): say so
            // rather than tint the whole room
            src.delete(); dist.delete();
            scope.$applyAsync(function () { r4.reachState = 'noSeed'; });
            return;
        }

        // the floor the robot's body can cover: within its radius of a reached centre
        const rsrc = new cv.Mat(gh, gw, cv.CV_8UC1);
        for (let i = 0; i < gw * gh; i++) rsrc.data[i] = reached[i] ? 0 : 255;
        const rdist = new cv.Mat();
        cv.distanceTransform(rsrc, rdist, cv.DIST_L2, 5);

        // tint the room 4 floor it never covers
        const bw = Math.round(cols * 12 / REACH_RES), bh = Math.round(rows * 12 / REACH_RES);
        const layer = document.createElement('canvas');
        layer.width = bw;
        layer.height = bh;
        const lctx = layer.getContext('2d')!;
        const out = lctx.createImageData(bw, bh);
        const gx0 = Math.round(originCm.x / REACH_RES), gy0 = Math.round(originCm.y / REACH_RES);
        const miss = new Uint8Array(bw * bh);
        let roomCells = 0;
        for (let by = 0; by < bh; by++) {
            for (let bx = 0; bx < bw; bx++) {
                if (!inRoom[Math.floor(bx * REACH_RES / 12) + ',' + Math.floor(by * REACH_RES / 12)]) continue;
                const gx = gx0 + bx, gy = gy0 + by;
                if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) continue;
                const i = gy * gw + gx;
                // a black tile is no floor to cover
                if (reachBase!.holeTiles[i]) continue;
                if (src.data[i] !== 0) roomCells++;
                if (src.data[i] !== 0 && rdist.data32F[i] > need + 0.5) miss[by * bw + bx] = 1;
            }
        }
        // leave out specks such as the corners a round robot cannot fill (under 5 cm2)
        const minCells = 5 / (REACH_RES * REACH_RES);
        const seen = new Uint8Array(bw * bh);
        let blocked = 0;
        for (let start = 0; start < bw * bh; start++) {
            if (!miss[start] || seen[start]) continue;
            const region = [start];
            seen[start] = 1;
            for (let h = 0; h < region.length; h++) {
                const q = region[h], qx = q % bw, qy = (q - qx) / bw;
                const next = [qx > 0 ? q - 1 : -1, qx < bw - 1 ? q + 1 : -1, qy > 0 ? q - bw : -1, qy < bh - 1 ? q + bw : -1];
                for (let k2 = 0; k2 < 4; k2++) {
                    const n = next[k2];
                    if (n >= 0 && miss[n] && !seen[n]) { seen[n] = 1; region.push(n); }
                }
            }
            if (region.length < minCells) continue;
            region.forEach(function (q) {
                const o = q * 4;
                out.data[o] = 239; out.data[o + 1] = 68; out.data[o + 2] = 68; out.data[o + 3] = 255;   // a mask: shown hatched
            });
            blocked += region.length;
        }
        lctx.putImageData(out, 0, 0);
        reachLayer = blocked ? layer : null;
        if (seed >= 0) reachInfo = { dist: Float32Array.from(rdist.data32F), gw: gw, gh: gh, need: need };
        reachStats = { blocked: blocked, room: roomCells };
        // how much is out of reach (cells), for the editor's guide
        scope.$applyAsync(function () { r4.reachBlocked = blocked; r4.reachRoom = roomCells; });
        src.delete(); dist.delete(); rsrc.delete(); rdist.delete();
    }

    // The places out of reach in the map editor's look: a light red with red stripes (every
    // 0.65 cm), cut to the reach mask; kept until the mask or the size changes
    let hatchCache: { layer: HTMLCanvasElement | null; w: number; h: number; canvas: HTMLCanvasElement } | null = null;
    function hatchedReach() {
        const w = Math.round(cols * block), h = Math.round(rows * block);
        if (hatchCache && hatchCache.layer === reachLayer && hatchCache.w === w && hatchCache.h === h) return hatchCache.canvas;
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const g = c.getContext('2d')!;
        g.fillStyle = 'rgba(254, 202, 202, 0.55)';
        g.fillRect(0, 0, w, h);
        g.strokeStyle = 'rgba(220, 38, 38, 0.45)';
        // the room 4 picture is shown larger than the map, so finer stripes look the same
        g.lineWidth = Math.max(1, 0.15 * pxPerCm);
        g.beginPath();
        const step = 0.65 * pxPerCm;
        for (let o = -h; o < w; o += step) { g.moveTo(o, h); g.lineTo(o + h, 0); }
        g.stroke();
        g.globalCompositeOperation = 'destination-in';
        g.imageSmoothingEnabled = true;
        g.drawImage(reachLayer!, 0, 0, w, h);
        hatchCache = { layer: reachLayer, w: w, h: h, canvas: c };
        return c;
    }

    // Tiles of the bounding box that are not room 4. A light grey: the export reads only
    // dark pixels as walls and red ones as tokens (older pictures used blue here)
    function mask() {
        ctx.save();
        ctx.fillStyle = '#D9DEE5';
        for (let tx = 0; tx < cols; tx++) {
            for (let ty = 0; ty < rows; ty++) {
                if (!inRoom[tx + ',' + ty]) ctx.fillRect(tx * block, ty * block, block, block);
            }
        }
        ctx.restore();
    }

    function clipToRoom(c: Ctx) {
        c.beginPath();
        Object.keys(inRoom).forEach(function (k) {
            const p = k.split(',').map(Number);
            c.rect(p[0] * block, p[1] * block, block, block);
        });
        c.clip();
    }

    // ---- picture state, history and saving ------------------------------------------
    let pixels: Uint8ClampedArray = null as unknown as Uint8ClampedArray;
    let tokens: Token[] = [];
    // a step of the history: the picture and the floors
    type Step = { img: ImageData; floors: string };
    const undo: Step[] = [];
    let redo: Step[] = [];

    function snapshot() {
        return ctx.getImageData(0, 0, W, H);
    }
    function step(): Step {
        return { img: snapshot(), floors: JSON.stringify(floors) };
    }

    function checkpoint() {
        undo.push(step());
        if (undo.length > 40) undo.shift();
        redo = [];
    }

    function save() {
        editor.room4CanvasSave = main.toDataURL('image/png');
        editor.room4Img.src = editor.room4CanvasSave;
    }

    // ---- what each stamp keeps besides its type: turn (degrees, or null = random) and the
    // ring code of a cognitive target, in editor.room4Tokens as fractions of the picture ----
    if (!Array.isArray(editor.room4Tokens)) editor.room4Tokens = [];
    const metaReach = function () { return Math.max(W, H) / 40; };
    function metaAt(cx: number, cy: number) {
        let best: Room4Token | null = null, bestD = metaReach();
        editor.room4Tokens.forEach(function (m) {
            const d = Math.hypot(m.fx * W - cx, m.fy * H - cy);
            if (d < bestD) { bestD = d; best = m; }
        });
        return best;
    }
    function setMetaAt(cx: number, cy: number, data: { rot?: number | null; code?: string | null }) {
        editor.room4Tokens = editor.room4Tokens.filter(function (m) { return Math.hypot(m.fx * W - cx, m.fy * H - cy) >= metaReach(); });
        editor.room4Tokens.push({ fx: +(cx / W).toFixed(5), fy: +(cy / H).toFixed(5), rot: data.rot === undefined ? null : data.rot, code: data.code || null });
    }
    // only what still has its stamp
    function pruneMeta() {
        editor.room4Tokens = editor.room4Tokens.filter(function (m) {
            return tokens.some(function (t) { return Math.hypot(m.fx * W - t.cx, m.fy * H - t.cy) < metaReach(); });
        });
    }
    function currentMeta() {
        const letter = scope.ctLetterOf ? scope.ctLetterOf(r4.stamp) : null;
        return { rot: letter || r4.randomRot ? null : r4.rot, code: letter ? r4.rings.join('') : null };
    }
    function selectToken(t: Token | null) {
        if (!t) { scope.$applyAsync(function () { r4.sel = null; }); drawOverlay(); return; }
        const m: any = metaAt(t.cx, t.cy) || {};
        const letter = scope.ctLetterOf(t.type);
        scope.$applyAsync(function () {
            r4.sel = { cx: t.cx, cy: t.cy, idx: t.type, rot: m.rot === undefined ? null : m.rot,
                code: letter ? (m.code && Icons.typeOf(m.code) === letter ? m.code : '') : null };
            if (letter && !r4.sel.code) r4.sel.code = editor.room4Target.randomCode(letter);
            r4.ring = 0;
        });
        drawOverlay();
    }
    // repaint the token at (cx, cy) as stamp type idx
    function retype(t: Token, idx: number) {
        checkpoint();
        const data = snapshot();
        const rgb = R4.stampRGB(idx);
        for (let y = t.minY; y <= t.maxY; y++) {
            for (let x = t.minX; x <= t.maxX; x++) {
                const i = (y * W + x) * 4;
                if (!R4.isToken(data.data[i], data.data[i + 1], data.data[i + 2])) continue;
                data.data[i] = rgb[0]; data.data[i + 1] = rgb[1]; data.data[i + 2] = rgb[2]; data.data[i + 3] = 255;
            }
        }
        ctx.putImageData(data, 0, 0);
        commit();
    }
    scope.r4api.changeSel = function (change) {
        const sel = r4.sel;
        if (!sel) return;
        const t = tokens.find(function (k) { return Math.hypot(k.cx - sel.cx, k.cy - sel.cy) < metaReach(); });
        if (!t) { r4.sel = null; return; }
        if (change.rot !== undefined) sel.rot = change.rot;
        if (change.code !== undefined) sel.code = change.code;
        setMetaAt(t.cx, t.cy, { rot: sel.rot, code: sel.code });
        if (change.idx !== undefined && change.idx !== null && change.idx !== t.type) { retype(t, change.idx); sel.idx = change.idx; }
        else save();
        drawOverlay();
    };
    scope.r4api.removeSel = function () {
        const sel = r4.sel;
        if (!sel) return;
        const t = tokens.find(function (k) { return Math.hypot(k.cx - sel.cx, k.cy - sel.cy) < metaReach(); });
        r4.sel = null;
        if (!t) return;
        checkpoint();
        removeTokens([t]);
        commit();
    };

    // The red of the tokens, covered on screen so only their badges show (the picture keeps it)
    let tokenCover: HTMLCanvasElement | null = null;
    function buildTokenCover() {
        const c = document.createElement('canvas');
        c.width = W;
        c.height = H;
        const cc = c.getContext('2d')!;
        const img = cc.createImageData(W, H);
        let any = false;
        // the token red and its soft edge, one pixel wider so no rim shows when scaled down
        for (let i = 0; i < W * H; i++) {
            const j = i * 4;
            const r = pixels[j], g = pixels[j + 1], b = pixels[j + 2];
            if (!(r > g + 40 && r > b + 40)) continue;
            any = true;
            const x = i % W, y = (i - x) / W;
            for (let yy = Math.max(0, y - 1); yy <= Math.min(H - 1, y + 1); yy++) {
                for (let xx = Math.max(0, x - 1); xx <= Math.min(W - 1, x + 1); xx++) {
                    const q = (yy * W + xx) * 4;
                    // never over a wall
                    if (R4.isWall(pixels[q], pixels[q + 1], pixels[q + 2])) continue;
                    img.data[q] = img.data[q + 1] = img.data[q + 2] = img.data[q + 3] = 255;
                }
            }
        }
        cc.putImageData(img, 0, 0);
        tokenCover = any ? c : null;
    }

    function analyse() {
        pixels = snapshot().data;
        buildTokenCover();
        try { computeReach(); } catch (err) { reachLayer = null; console.warn('room 4 reach', err); }
        tokens = R4.findTokens(pixels, W, H) as Token[];
        // a token touches its wall: stamps sit 2-4 px off it, a little more against a curve
        const reach = Math.max(4, Math.round(stampSize * 0.15));
        tokens.forEach(function (t) {
            t.nearWall = false;
            for (let y = Math.max(0, t.minY - reach); y <= Math.min(H - 1, t.maxY + reach) && !t.nearWall; y++) {
                for (let x = Math.max(0, t.minX - reach); x <= Math.min(W - 1, t.maxX + reach); x++) {
                    const i = (y * W + x) * 4;
                    if (R4.isWall(pixels[i], pixels[i + 1], pixels[i + 2]) || mapWallMask[y * W + x]) { t.nearWall = true; break; }
                }
            }
        });
        // the wall each one stands on, for drawing it there
        tokens.forEach(function (t) { t.anchor = R4.wallAnchor(wallPx, t.cx, t.cy, 1.2 * stampSize + 8); });
        // identification needs the robot's centre within half a tile of the token (rule 5.6.2)
        tokens.forEach(function (t) {
            t.unreachable = false;
            if (!reachInfo) return;
            const gx = Math.round((originCm.x + t.cx / pxPerCm) / REACH_RES);
            const gy = Math.round((originCm.y + t.cy / pxPerCm) / REACH_RES);
            if (gx < 0 || gy < 0 || gx >= reachInfo.gw || gy >= reachInfo.gh) return;
            // too far for identification, or on a side of the wall the robot's body never reaches
            const d = reachInfo.dist[gy * reachInfo.gw + gx];
            t.unreachable = d * REACH_RES > 6 || d > reachInfo.need + 0.5;
        });
        const counts: Record<number, number> = {};
        tokens.forEach(function (t) { counts[t.type] = (counts[t.type] || 0) + 1; });
        scope.$applyAsync(function () {
            r4.tokenCount = tokens.length;
            r4.farCount = tokens.filter(function (t) { return !t.nearWall; }).length;
            r4.unreachCount = tokens.filter(function (t) { return t.unreachable; }).length;
            const order = function (idx: number) {
                const i = types.findIndex(function (t) { return t.idx === idx; });
                return i < 0 ? 99 : i;
            };
            r4.summary = Object.keys(counts).map(Number).sort(function (a, b) { return order(a) - order(b); }).map(function (idx) { return { idx: idx, count: counts[idx] }; });
            r4.canUndo = undo.length > 0;
            r4.undoCount = undo.length;     // the editor's guide sees drawing by it
            r4.canRedo = redo.length > 0;
            if (r4.sel && !tokens.some(function (t) { return Math.hypot(t.cx - r4.sel!.cx, t.cy - r4.sel!.cy) < metaReach(); })) r4.sel = null;
        });
        pruneMeta();
        drawOverlay();
    }

    function commit() {
        mask();
        save();
        // every change put onto the picture, counted on (undo keeps only 40): the guide of the
        // new editor sees by it that a tool was used
        r4.drawCount = (r4.drawCount || 0) + 1;
        analyse();
    }

    // OpenCV loaded as the creator opens (or still loading): where the robot gets to is worked out
    // once it is there
    let open = true;
    scope.$on('$destroy', function () { open = false; });
    if (!OpenCV.isReady()) OpenCV.load().then(function () { if (open && pixels) { analyse(); drawOverlay(); } });

    function restore(s: Step) {
        ctx.putImageData(s.img, 0, 0);
        save();
        Object.keys(floors).forEach(function (key) { delete floors[key]; });
        Object.assign(floors, JSON.parse(s.floors));
        markHoles();
        checkGuide();
        analyse();
    }

    // ---- overlay: grid, token badges, previews ----------------------------------------
    let preview: Shape | null = null;     // shape being drawn (drag tools, or the open curve / arc)
    let pending: { type: string; pts: P[] } | null = null;     // multi-click shape in progress: { type: 'curve' | 'arc', pts: [...] }
    let hover: P | null = null;       // pointer position when not drawing

    // Canvas pixels per screen pixel: overlay marks and text keep their size on screen
    let k = 1;
    function updateScale() {
        const w = over.getBoundingClientRect().width;
        k = w > 0 ? W / w : 1;
    }

    function typeOf(idx: number) {
        return types.find(function (t) { return t.idx === idx; });
    }

    function drawBadge(t: Token) {
        const type = typeOf(t.type);
        const r = badgeRadius();
        // on the face of its wall (R4.badgeOnWall), with the icons of the map editor
        // (lib/icons): letter victims as discs, cognitive targets as on its map - a disc in the
        // type colour with the type letter (× a fake one)
        const at = R4.badgeOnWall(t, t.anchor, r);
        if (type && (type.kind === 'ct' || type.kind === 'fakect')) Icons.targetMark(octx, at.x, at.y, r, null, type.color, 2 * k);
        else Icons.victim(octx, at.x, at.y, r, type ? type.symbol : '?', type ? type.color : '#94a3b8', 2 * k, type ? type.face : undefined, !!type && type.kind === 'fake');
        if (!t.nearWall || t.unreachable) {
            octx.save();
            octx.beginPath();
            octx.setLineDash([4 * k, 3 * k]);
            octx.arc(at.x, at.y, r + 5 * k, 0, Math.PI * 2);
            octx.lineWidth = 2 * k;
            octx.strokeStyle = '#dc2626';
            octx.stroke();
            octx.restore();
        }
    }

    // ---- mirror drawing: walls are drawn again mirrored about the middle of the picture ----
    function mirrors() {
        const list = [[1, 1]];
        if (r4.mirror === 'x' || r4.mirror === 'xy') list.push([-1, 1]);
        if (r4.mirror === 'y' || r4.mirror === 'xy') list.push([1, -1]);
        if (r4.mirror === 'xy') list.push([-1, -1]);
        return list;
    }

    function eachMirror(c: Ctx, clip: boolean, draw: (c: Ctx) => void) {
        mirrors().forEach(function (m) {
            c.save();
            if (clip) clipToRoom(c);
            c.transform(m[0], 0, 0, m[1], m[0] < 0 ? W : 0, m[1] < 0 ? H : 0);
            draw(c);
            c.restore();
        });
    }

    // ---- shapes -------------------------------------------------------------------
    // Circle through three points, or null when they are in a line
    function circleThrough(p: P, q: P, r: P) {
        const d = 2 * (p.x * (q.y - r.y) + q.x * (r.y - p.y) + r.x * (p.y - q.y));
        if (Math.abs(d) < 1e-6) return null;
        const p2 = p.x * p.x + p.y * p.y, q2 = q.x * q.x + q.y * q.y, r2 = r.x * r.x + r.y * r.y;
        const cx = (p2 * (q.y - r.y) + q2 * (r.y - p.y) + r2 * (p.y - q.y)) / d;
        const cy = (p2 * (r.x - q.x) + q2 * (p.x - r.x) + r2 * (q.x - p.x)) / d;
        return { x: cx, y: cy, r: Math.hypot(p.x - cx, p.y - cy) };
    }

    // Smooth curve through the points (Catmull-Rom as cubic Béziers), or a polyline
    function curvePath(c: Ctx, pts: P[], smooth: boolean, closed: boolean) {
        if (!pts.length) return;
        c.moveTo(pts[0].x, pts[0].y);
        if (pts.length === 1) { c.lineTo(pts[0].x + 0.01, pts[0].y); return; }
        const n = pts.length;
        const at = function (i: number) {
            if (closed) return pts[(i + n) % n];
            return pts[Math.max(0, Math.min(n - 1, i))];
        };
        const segs = closed ? n : n - 1;
        for (let i = 0; i < segs; i++) {
            const p1 = at(i), p2 = at(i + 1);
            if (!smooth) { c.lineTo(p2.x, p2.y); continue; }
            const p0 = at(i - 1), p3 = at(i + 2);
            c.bezierCurveTo(p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6,
                p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6, p2.x, p2.y);
        }
        if (closed) c.closePath();
    }

    function shapePath(c: Ctx, s: Shape) {
        c.beginPath();
        if (s.type === 'line') {
            c.moveTo(s.a.x, s.a.y);
            c.lineTo(s.b.x, s.b.y);
        } else if (s.type === 'rect') {
            c.rect(Math.min(s.a.x, s.b.x), Math.min(s.a.y, s.b.y), Math.abs(s.b.x - s.a.x), Math.abs(s.b.y - s.a.y));
        } else if (s.type === 'circle') {
            c.arc(s.a.x, s.a.y, s.r, 0, Math.PI * 2);
        } else if (s.type === 'ellipse') {
            c.ellipse((s.a.x + s.b.x) / 2, (s.a.y + s.b.y) / 2, Math.abs(s.b.x - s.a.x) / 2, Math.abs(s.b.y - s.a.y) / 2, 0, 0, Math.PI * 2);
        } else if (s.type === 'polygon') {
            for (let i = 0; i < s.n; i++) {
                const ang = s.rot + i * 2 * Math.PI / s.n;
                const x = s.a.x + Math.cos(ang) * s.r, y = s.a.y + Math.sin(ang) * s.r;
                if (i) c.lineTo(x, y); else c.moveTo(x, y);
            }
            c.closePath();
        } else if (s.type === 'arc') {
            const circ = s.c ? circleThrough(s.p0, s.c, s.p1) : null;
            if (!circ) {
                c.moveTo(s.p0.x, s.p0.y);
                c.lineTo(s.p1.x, s.p1.y);
            } else {
                const a0 = Math.atan2(s.p0.y - circ.y, s.p0.x - circ.x);
                const a1 = Math.atan2(s.p1.y - circ.y, s.p1.x - circ.x);
                const am = Math.atan2(s.c.y - circ.y, s.c.x - circ.x);
                // go the way round that passes the middle point
                const norm = function (a: number) { while (a < 0) a += 2 * Math.PI; return a % (2 * Math.PI); };
                const ccw = !(norm(am - a0) < norm(a1 - a0));
                c.arc(circ.x, circ.y, circ.r, a0, a1, ccw);
            }
        } else if (s.type === 'curve') {
            curvePath(c, s.pts, s.smooth, s.closed);
        }
    }

    function strokeShape(c: Ctx, s: Shape, color: string) {
        eachMirror(c, true, function (cc: Ctx) {
            cc.strokeStyle = color;
            cc.lineWidth = wallWidth;
            cc.lineCap = 'round';
            cc.lineJoin = 'round';
            shapePath(cc, s);
            cc.stroke();
        });
    }

    function shapeSize(s: Shape) {
        if (s.type === 'circle' || s.type === 'polygon') return s.r;
        if (s.type === 'arc') return Math.hypot(s.p1.x - s.p0.x, s.p1.y - s.p0.y);
        if (s.type === 'curve') return s.pts.length > 1 ? 99 : 0;
        return Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
    }

    // A tip next to a token under the pointer: what clicking does
    // A tip beside the box x0, y0 - x1, y1 (canvas pixels): a page element over everything, not
    // on the canvas, so it is seen whole even where the picture is narrower than its text; at
    // the window's edges it moves inwards
    const tipEl = document.createElement('div');
    tipEl.className = 'r4-tip';
    tipEl.style.display = 'none';
    document.body.appendChild(tipEl);
    scope.$on('$destroy', function () { if (tipEl.parentNode) tipEl.parentNode.removeChild(tipEl); });
    let tipShown = false;
    function drawTip(x0: number, y0: number, x1: number, y1: number, text: string) {
        const r = over.getBoundingClientRect(), f = r.width / W;
        const box = { left: r.left + x0 * f, top: r.top + y0 * f, right: r.left + x1 * f, bottom: r.top + y1 * f };
        if (tipEl.textContent !== text) tipEl.textContent = text;
        tipEl.style.display = 'block';
        const w = tipEl.offsetWidth, h = tipEl.offsetHeight, E = 8;
        let x = box.right + 10, y = box.top - h - 6;
        if (x + w > window.innerWidth - E) x = box.left - 10 - w;
        x = Math.max(E, Math.min(window.innerWidth - w - E, x));
        if (y < E) y = box.bottom + 8;
        tipEl.style.left = Math.round(x) + 'px';
        tipEl.style.top = Math.round(y) + 'px';
        tipShown = true;
    }

    function dot(p: P, color: string, r?: number) {
        octx.fillStyle = color;
        octx.beginPath(); octx.arc(p.x, p.y, (r || 3) * k, 0, Math.PI * 2); octx.fill();
    }

    // ---- entrances and checkpoints (from the map) -------------------------------------------
    const boxTile = box;
    const guide = {
        entrances: (geo && geo.entrances ? geo.entrances : []).map(function (e: any) {
            return { tx: e.tile[0] - boxTile.x, ty: e.tile[1] - boxTile.y, dir: e.dir, color: e.color,
                passage: e.passage === undefined ? !!e.color : e.passage, half: e.half } as { tx: number; ty: number; dir: number[]; color: string; passage: boolean; half: boolean };
        }),
        missing: [] as string[]
    };
    // the room 4 tile behind each passage should be a checkpoint (rule 3.5.3): worked out again as
    // the floor tool changes the floors
    function checkGuide() {
        guide.missing = [];
        guide.entrances.forEach(function (e: any) {
            const key = e.tx + ',' + e.ty;
            const kind = floorKindAt(e.tx, e.ty);
            if (editor.room4Checkpoints && e.passage && !(kind && kind.checkpoint) && guide.missing.indexOf(key) < 0) guide.missing.push(key);
        });
        scope.$applyAsync(function () {
            r4.entranceCount = guide.entrances.length;
            r4.passageCount = guide.entrances.filter(function (e: any) { return e.passage; }).length;
            r4.missingCheckpoints = guide.missing.length;
        });
    }
    checkGuide();

    // The floors as the map editor shows them (a black tile with its hole inside the rim), under the
    // picture's walls, see-through so the walls drawn over them still show
    function drawFloors() {
        octx.save();
        Object.keys(inRoom).forEach(function (key) {
            const t = key.split(',').map(Number), kind = floorKindAt(t[0], t[1]);
            if (!kind) return;
            const x = t[0] * block, y = t[1] * block;
            if (kind.checkpoint) {
                const g = octx.createLinearGradient(x, y, x + block, y + block);
                g.addColorStop(0, 'rgba(148, 163, 184, 0.35)');
                g.addColorStop(0.5, 'rgba(226, 232, 240, 0.35)');
                g.addColorStop(1, 'rgba(148, 163, 184, 0.35)');
                octx.fillStyle = g;
                octx.fillRect(x, y, block, block);
                octx.fillStyle = '#64748b';
                octx.font = '700 ' + (11 * k) + 'px system-ui, sans-serif';
                octx.textBaseline = 'top';
                octx.fillText('CP', x + 5 * k, y + 5 * k);
            } else if (kind.hole && geo) {
                // a hole with its rim, see-through so the walls over it still show
                octx.globalAlpha = 0.6;
                drawHole(octx, x, y, block, block * geo.holeRimCm / geo.tileCm, kind.color);
                octx.globalAlpha = 1;
            } else {
                octx.globalAlpha = 0.45;
                octx.fillStyle = kind.color;
                octx.fillRect(x, y, block, block);
                octx.globalAlpha = 1;
            }
        });
        octx.restore();
    }

    // The floor tool on the tile at p: `to` the floor it gets ('' none); whether it changed
    function floorTile(p: P) {
        const tx = Math.floor(p.x / block), ty = Math.floor(p.y / block);
        return inRoom[tx + ',' + ty] ? { tx: tx, ty: ty } : null;
    }
    // whether the floor `to` may be on the tile (a contact tile only beside the field's outside)
    function floorFits(tx: number, ty: number, to: string) {
        const c = floorKey(tx, ty).split(',').map(Number);
        return !to || editor.room4FloorFits(c[0], c[1], to);
    }
    function setFloor(tx: number, ty: number, to: string) {
        const key = floorKey(tx, ty);
        if ((floors[key] || '') === to || !floorFits(tx, ty, to)) return false;
        if (to) floors[key] = to; else delete floors[key];
        return true;
    }
    function floorsChanged() {
        markHoles();
        checkGuide();
        analyse();
    }

    function drawGuides() {
        octx.save();
        // tiles behind a passage that are not a checkpoint yet
        guide.missing.forEach(function (key) {
            const t = key.split(',').map(Number);
            octx.strokeStyle = '#d97706';
            octx.lineWidth = 2 * k;
            octx.setLineDash([6 * k, 4 * k]);
            octx.strokeRect(t[0] * block + 4 * k, t[1] * block + 4 * k, block - 8 * k, block - 8 * k);
            octx.setLineDash([]);
            octx.fillStyle = '#d97706';
            octx.font = '700 ' + (11 * k) + 'px system-ui, sans-serif';
            octx.textBaseline = 'top';
            octx.fillText('CP?', t[0] * block + 8 * k, t[1] * block + 8 * k);
        });
        // entrances: a bar in the passage colour on the edge, and an arrow into the room
        guide.entrances.forEach(function (e: any) {
            const color = e.color || '#0ea5e9';
            const x0 = e.tx * block, y0 = e.ty * block;
            const t = Math.max(4 * k, block * 0.06);
            octx.fillStyle = color;
            octx.globalAlpha = 0.85;
            if (e.dir[0] === 1) octx.fillRect(x0 + block - t, y0, t, block);
            if (e.dir[0] === -1) octx.fillRect(x0, y0, t, block);
            if (e.dir[1] === 1) octx.fillRect(x0, y0 + block - t, block, t);
            if (e.dir[1] === -1) octx.fillRect(x0, y0, block, t);
            octx.globalAlpha = 1;
            // arrow pointing inwards, from the edge
            const cx = x0 + block / 2 + e.dir[0] * block * 0.32, cy = y0 + block / 2 + e.dir[1] * block * 0.32;
            const ax = -e.dir[0], ay = -e.dir[1];
            const sz = Math.max(7 * k, block * 0.09);
            octx.beginPath();
            octx.moveTo(cx + ax * sz, cy + ay * sz);
            octx.lineTo(cx - ax * sz * 0.6 - ay * sz * 0.8, cy - ay * sz * 0.6 + ax * sz * 0.8);
            octx.lineTo(cx - ax * sz * 0.6 + ay * sz * 0.8, cy - ay * sz * 0.6 - ax * sz * 0.8);
            octx.closePath();
            octx.fill();
            octx.strokeStyle = '#fff';
            octx.lineWidth = 1.5 * k;
            octx.stroke();
        });
        octx.restore();
    }

    function drawOverlay() {
        updateScale();
        tipShown = false;
        drawOverlayParts();
        if (!tipShown) tipEl.style.display = 'none';
    }

    function drawOverlayParts() {
        octx.clearRect(0, 0, W, H);
        drawFloors();
        if (tokenCover) octx.drawImage(tokenCover, 0, 0);
        // grid: tiles, and quarter tiles while snapping
        octx.save();
        octx.lineWidth = k;
        for (let i = 0; i <= cols * 4; i++) {
            if (i % 4 && !r4.snap) continue;
            octx.strokeStyle = i % 4 ? 'rgba(59, 130, 246, 0.12)' : 'rgba(15, 23, 42, 0.18)';
            octx.beginPath(); octx.moveTo(i * block / 4 + 0.5, 0); octx.lineTo(i * block / 4 + 0.5, H); octx.stroke();
        }
        for (let j = 0; j <= rows * 4; j++) {
            if (j % 4 && !r4.snap) continue;
            octx.strokeStyle = j % 4 ? 'rgba(59, 130, 246, 0.12)' : 'rgba(15, 23, 42, 0.18)';
            octx.beginPath(); octx.moveTo(0, j * block / 4 + 0.5); octx.lineTo(W, j * block / 4 + 0.5); octx.stroke();
        }
        // mirror axes
        if (r4.mirror !== 'none') {
            octx.strokeStyle = 'rgba(168, 85, 247, 0.6)';
            octx.lineWidth = 1.5 * k;
            octx.setLineDash([6 * k, 4 * k]);
            if (r4.mirror !== 'y') { octx.beginPath(); octx.moveTo(W / 2, 0); octx.lineTo(W / 2, H); octx.stroke(); }
            if (r4.mirror !== 'x') { octx.beginPath(); octx.moveTo(0, H / 2); octx.lineTo(W, H / 2); octx.stroke(); }
            octx.setLineDash([]);
        }
        // hatch the tiles outside room 4
        octx.strokeStyle = 'rgba(100, 116, 139, 0.35)';
        octx.lineWidth = k;
        for (let tx = 0; tx < cols; tx++) {
            for (let ty = 0; ty < rows; ty++) {
                if (inRoom[tx + ',' + ty]) continue;
                octx.save();
                octx.beginPath();
                octx.rect(tx * block, ty * block, block, block);
                octx.clip();
                octx.beginPath();
                for (let d = -block; d < block; d += 10 * k) {
                    octx.moveTo(tx * block + d, ty * block + block);
                    octx.lineTo(tx * block + d + block, ty * block);
                }
                octx.stroke();
                octx.restore();
            }
        }
        octx.restore();

        // where the robot cannot get to (hatched light red, as on the map), and the walls of the
        // map around room 4
        if (reachLayer && r4.showReach) octx.drawImage(hatchedReach(), 0, 0);
        if (geo) {
            octx.save();
            octx.translate(-originCm.x * pxPerCm, -originCm.y * pxPerCm);
            octx.scale(pxPerCm, pxPerCm);
            octx.strokeStyle = '#475569';
            octx.lineWidth = geo.wallHalfCm * 2;
            octx.lineCap = 'square';
            geo.shapes.forEach(function (sh) { mapShapePath(octx, sh); octx.stroke(); });
            octx.restore();
        }

        if (r4.showGuides) drawGuides();

        tokens.forEach(drawBadge);
        if (r4.sel) {
            const st = tokens.find(function (t) { return Math.hypot(t.cx - r4.sel!.cx, t.cy - r4.sel!.cy) < metaReach(); });
            const sa = st ? R4.badgeOnWall(st, st.anchor, badgeRadius()) : { x: r4.sel.cx, y: r4.sel.cy };
            octx.save();
            octx.beginPath();
            octx.arc(sa.x, sa.y, badgeRadius() + 5 * k, 0, Math.PI * 2);
            octx.lineWidth = 3 * k;
            octx.strokeStyle = '#f59e0b';
            octx.stroke();
            octx.restore();
        }

        // shape being drawn
        if (preview) {
            if (preview.type === 'icon') {
                const art = shapeArt(preview);
                if (art) {
                    octx.save();
                    octx.globalAlpha = 0.55;
                    eachMirror(octx, true, function (cc: Ctx) { cc.drawImage(art.canvas!, art.x, art.y); });
                    octx.restore();
                    octx.save();
                    octx.strokeStyle = '#2563eb';
                    octx.lineWidth = k;
                    octx.setLineDash([4 * k, 3 * k]);
                    octx.strokeRect(art.x, art.y, art.canvas!.width, art.canvas!.height);
                    octx.restore();
                }
            } else {
                strokeShape(octx, preview, 'rgba(15, 23, 42, 0.7)');
            }
            octx.save();
            if (preview.type === 'circle' || preview.type === 'polygon') dot(preview.a, '#2563eb');
            if (preview.type === 'arc') { dot(preview.p0, '#2563eb'); dot(preview.p1, '#2563eb'); if (preview.c) dot(preview.c, '#a855f7'); }
            if (preview.type === 'curve') {
                preview.pts.forEach(function (p: P, i: number) { dot(p, i === 0 ? '#16a34a' : '#2563eb', i === 0 ? 4.5 : 3); });
            }
            octx.restore();
            if (pending && scope.r4tips) {
                const last = pending.pts[pending.pts.length - 1];
                drawTip(last.x, last.y, last.x, last.y, pending.type === 'curve' ? scope.r4tips.curve : scope.r4tips.arc);
            }
        }

        drawSelection();

        if (hover && !drag) {
            octx.save();
            if (r4.tool === 'erase') {
                octx.strokeStyle = r4.eraseTarget === 'tokens' ? 'rgba(220, 38, 38, 0.8)' : 'rgba(37, 99, 235, 0.8)';
                octx.lineWidth = 1.5 * k;
                mirrors().forEach(function (m) {
                    const hx = m[0] < 0 ? W - hover!.x : hover!.x, hy = m[1] < 0 ? H - hover!.y : hover!.y;
                    octx.beginPath(); octx.arc(hx, hy, eraserSizes[r4.eraser] / 2, 0, Math.PI * 2); octx.stroke();
                });
                if (r4.eraseTarget === 'tokens') {
                    tokensUnder(hover, eraserSizes[r4.eraser] / 2).forEach(function (t) {
                        octx.strokeStyle = '#dc2626';
                        octx.lineWidth = 2 * k;
                        octx.strokeRect(t.minX - 4 * k, t.minY - 4 * k, t.maxX - t.minX + 8 * k, t.maxY - t.minY + 8 * k);
                    });
                }
            } else if (r4.tool === 'stamp') {
                const hit = tokenAt(hover);
                if (hit) {
                    octx.strokeStyle = '#2563eb';
                    octx.lineWidth = 2 * k;
                    octx.strokeRect(hit.minX - 4 * k, hit.minY - 4 * k, hit.maxX - hit.minX + 8 * k, hit.maxY - hit.minY + 8 * k);
                } else {
                    const spot = stampSpot(hover);
                    if (spot.ok) {
                        octx.globalAlpha = 0.6;
                        octx.fillStyle = R4.stampColor(r4.stamp);
                        octx.fillRect(spot.x, spot.y, stampSize, stampSize);
                        octx.globalAlpha = 1;
                        octx.strokeStyle = '#2563eb';
                        octx.lineWidth = 1.5 * k;
                        octx.setLineDash([3 * k, 2 * k]);
                        octx.beginPath(); octx.moveTo(spot.wall.x, spot.wall.y); octx.lineTo(spot.x + stampSize / 2, spot.y + stampSize / 2); octx.stroke();
                    } else {
                        octx.strokeStyle = '#94a3b8';
                        octx.lineWidth = 2 * k;
                        const d = 5 * k;
                        octx.beginPath();
                        octx.moveTo(hover.x - d, hover.y - d); octx.lineTo(hover.x + d, hover.y + d);
                        octx.moveTo(hover.x + d, hover.y - d); octx.lineTo(hover.x - d, hover.y + d);
                        octx.stroke();
                    }
                }
            } else if (r4.tool === 'floor') {
                // the tile it would change, or a cross off room 4
                const ft = floorTile(hover);
                if (ft) {
                    const off = r4.floor !== 'clear' && floorAt(ft.tx, ft.ty) !== r4.floor && !floorFits(ft.tx, ft.ty, r4.floor);
                    octx.strokeStyle = off ? '#dc2626' : '#2563eb';
                    octx.lineWidth = 2.5 * k;
                    octx.strokeRect(ft.tx * block + 1.5 * k, ft.ty * block + 1.5 * k, block - 3 * k, block - 3 * k);
                } else {
                    octx.strokeStyle = '#94a3b8';
                    octx.lineWidth = 2 * k;
                    const d = 5 * k;
                    octx.beginPath();
                    octx.moveTo(hover.x - d, hover.y - d); octx.lineTo(hover.x + d, hover.y + d);
                    octx.moveTo(hover.x + d, hover.y - d); octx.lineTo(hover.x - d, hover.y + d);
                    octx.stroke();
                }
            } else if (r4.snap && r4.tool !== 'pen') {
                dot(snap(hover), '#2563eb');
            }
            octx.restore();
            const under = r4.tool === 'erase' && r4.eraseTarget === 'tokens' ? null : tokenAt(hover);
            if (under && !pending && scope.r4tips) drawTip(under.minX, under.minY, under.maxX, under.maxY, r4.tool === 'stamp' ? scope.r4tips.stamp : scope.r4tips.other);
        }
    }

    // ---- stamps ----------------------------------------------------------------------
    function tokenAt(p: P) {
        return tokens.find(function (t) {
            const m = Math.max(3, 4 * k);
            return p.x >= t.minX - m && p.x <= t.maxX + m && p.y >= t.minY - m && p.y <= t.maxY + m;
        });
    }

    function pixelAt(x: number, y: number) {
        const i = (y * W + x) * 4;
        return [pixels[i], pixels[i + 1], pixels[i + 2]];
    }

    // A stamp square with a one-pixel margin that touches no wall, token or other room
    function fits(x: number, y: number) {
        for (let yy = y - 1; yy <= y + stampSize; yy++) {
            for (let xx = x - 1; xx <= x + stampSize; xx++) {
                if (xx < 0 || yy < 0 || xx >= W || yy >= H || !roomAt(xx, yy)) return false;
                const c = pixelAt(xx, yy);
                if (R4.isWall(c[0], c[1], c[2]) || R4.isToken(c[0], c[1], c[2]) || mapWallMask[yy * W + xx]) return false;
            }
        }
        return true;
    }

    function wallPx(x: number, y: number) {
        if (x < 0 || y < 0 || x >= W || y >= H) return false;
        const i = (y * W + x) * 4;
        return R4.isWall(pixels[i], pixels[i + 1], pixels[i + 2]) || mapWallMask[y * W + x] === 1;
    }

    // Outward normal of the wall surface at wall pixel (x, y): away from the wall pixels around it
    function wallNormal(x: number, y: number) {
        let nx = 0, ny = 0;
        for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
            if ((dx || dy) && !wallPx(x + dx, y + dy)) { nx += dx; ny += dy; }
        }
        const l = Math.hypot(nx, ny);
        return l ? [nx / l, ny / l] : null;
    }

    // A wall token stands on a wall face as wide as itself: along the face at w (normal n),
    // most points across the stamp's width must have wall just behind them
    function wallSupports(w: P, n: number[]) {
        const t = [-n[1], n[0]];
        const depth = Math.max(4, Math.round(stampSize * 0.25));
        let hit = 0, total = 0;
        for (let o = -stampSize / 2; o <= stampSize / 2; o += 1) {
            total++;
            for (let d = -1; d <= depth; d++) {
                if (wallPx(Math.round(w.x + t[0] * o - n[0] * d), Math.round(w.y + t[1] * o - n[1] * d))) { hit++; break; }
            }
        }
        return hit >= total * 0.8;
    }

    // Where a stamp clicked at p goes: flat against the face of a wall near the click (on the
    // click's side), never more than a few pixels off it, and only where the wall is as wide
    // as the token - not on a wall's end
    function stampSpot(p: P): Spot {
        if (!pixels) return { ok: false, reason: 'outside' };
        if (!roomAt(p.x, p.y)) return { ok: false, reason: 'outside' };
        const reach = Math.round(block * 0.45);
        const px0 = Math.round(p.x), py0 = Math.round(p.y);
        // wall surface pixels (wall with a free neighbour) near the click, nearest first
        const faces: { x: number; y: number; d: number }[] = [];
        for (let y = Math.max(0, py0 - reach); y <= Math.min(H - 1, py0 + reach); y++) {
            for (let x = Math.max(0, px0 - reach); x <= Math.min(W - 1, px0 + reach); x++) {
                if (!wallPx(x, y)) continue;
                if (wallPx(x + 1, y) && wallPx(x - 1, y) && wallPx(x, y + 1) && wallPx(x, y - 1)) continue;
                const d = (x - p.x) * (x - p.x) + (y - p.y) * (y - p.y);
                if (d <= reach * reach) faces.push({ x: x, y: y, d: d });
            }
        }
        if (!faces.length) return { ok: false, reason: 'needWall' };
        const onWall = wallPx(px0, py0);
        faces.sort(function (a, b) { return a.d - b.d; });
        const tried: P[] = [];
        let sawWall = false, outOfReach = false;
        for (let i = 0; i < faces.length && tried.length < 80; i++) {
            const w = faces[i];
            if (tried.some(function (q) { return Math.abs(q.x - w.x) + Math.abs(q.y - w.y) < 3; })) continue;
            tried.push(w);
            const n = wallNormal(w.x, w.y);
            if (!n) continue;
            // the face must look towards the click (a click on the wall itself takes the nearest face)
            if (!onWall && (p.x - w.x) * n[0] + (p.y - w.y) * n[1] < -2) continue;
            sawWall = true;
            if (!wallSupports(w, n)) continue;
            for (let gap = 2; gap <= 4; gap++) {
                const d = gap + stampSize / 2 * (Math.abs(n[0]) + Math.abs(n[1]));
                const x = Math.round(w.x + n[0] * d - stampSize / 2);
                const y = Math.round(w.y + n[1] * d - stampSize / 2);
                if (!fits(x, y)) continue;
                // where the robot can identify it only: none are where it cannot go (rule 3.2.4)
                if (identifiable({ x: x + stampSize / 2, y: y + stampSize / 2 })) return { ok: true, x: x, y: y, wall: w };
                outOfReach = true;
                break;
            }
        }
        return { ok: false, reason: outOfReach ? 'unreachable' : sawWall ? 'wallEnd' : 'needWall' };
    }

    // Remove a whole token, with the soft red edge a hand-drawn one may have
    function removeTokens(list: Token[]) {
        if (!list.length) return;
        const data = snapshot();
        const d = data.data;
        list.forEach(function (t) {
            for (let y = Math.max(0, t.minY - 2); y <= Math.min(H - 1, t.maxY + 2); y++) {
                for (let x = Math.max(0, t.minX - 2); x <= Math.min(W - 1, t.maxX + 2); x++) {
                    const i = (y * W + x) * 4;
                    if (d[i] > d[i + 1] + 40 && d[i] > d[i + 2] + 40) {
                        d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 255;
                    }
                }
            }
        });
        ctx.putImageData(data, 0, 0);
    }

    function tokensUnder(p: P, radius: number) {
        return tokens.filter(function (t) {
            const nx = Math.max(t.minX, Math.min(p.x, t.maxX));
            const ny = Math.max(t.minY, Math.min(p.y, t.maxY));
            return Math.hypot(p.x - nx, p.y - ny) <= radius;
        });
    }

    function placeStamp(p: P) {
        const hit = tokenAt(p);
        if (hit) {
            // the stamp under the pointer: look at it (its turn / rings in the panel), or give it
            // the chosen type
            if (hit.type === r4.stamp) { selectToken(hit); return; }
            setMetaAt(hit.cx, hit.cy, currentMeta());
            checkpoint();
            const data = snapshot();
            const rgb = R4.stampRGB(r4.stamp);
            for (let y = hit.minY; y <= hit.maxY; y++) {
                for (let x = hit.minX; x <= hit.maxX; x++) {
                    const i = (y * W + x) * 4;
                    if (!R4.isToken(data.data[i], data.data[i + 1], data.data[i + 2])) continue;
                    data.data[i] = rgb[0]; data.data[i + 1] = rgb[1]; data.data[i + 2] = rgb[2]; data.data[i + 3] = 255;
                }
            }
            ctx.putImageData(data, 0, 0);
            commit();
            selectToken(null);
            return;
        }
        const spot = stampSpot(p);
        if (!spot.ok) {
            scope.$applyAsync(function () { r4.message = spot.reason; });
            return;
        }
        checkpoint();
        ctx.fillStyle = R4.stampColor(r4.stamp);
        ctx.fillRect(spot.x, spot.y, stampSize, stampSize);
        setMetaAt(spot.x + stampSize / 2, spot.y + stampSize / 2, currentMeta());
        commit();
        selectToken(null);
        scope.$applyAsync(function () { r4.message = ''; });
    }

    // ---- icons and pictures as walls ---------------------------------------------------
    // The chosen silhouette (an icon or a picture) is a canvas whose opaque pixels are the shape
    let silhouette: HTMLCanvasElement | null = null;
    const artCache: { key: string; art: HTMLCanvasElement | null } = { key: '', art: null };

    // The silhouette drawn into the box of shape s: filled, or as an outline one wall thick
    function shapeArt(s: Shape) {
        if (!silhouette) return null;
        const rot = ((r4.shapeRot || 0) % 360 + 360) % 360;
        const turned = rot === 90 || rot === 270;
        const sw = turned ? silhouette.height : silhouette.width, sh = turned ? silhouette.width : silhouette.height;
        const bw = Math.abs(s.b.x - s.a.x), bh = Math.abs(s.b.y - s.a.y);
        let w = Math.max(bw, bh * sw / sh), h = w * sh / sw;
        if (s.free) { w = bw; h = bh; }
        w = Math.round(w); h = Math.round(h);
        if (w < 4 || h < 4) return null;
        const x = Math.round(s.b.x >= s.a.x ? s.a.x : s.a.x - w), y = Math.round(s.b.y >= s.a.y ? s.a.y : s.a.y - h);
        const key = [w, h, rot, r4.shapeStyle, silhouette.dataset.id].join('|');
        if (artCache.key === key) return { canvas: artCache.art, x: x, y: y };
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const cc = c.getContext('2d')!;
        cc.translate(w / 2, h / 2);
        cc.rotate(rot * Math.PI / 180);
        cc.drawImage(silhouette, -(turned ? h : w) / 2, -(turned ? w : h) / 2, turned ? h : w, turned ? w : h);
        const img = cc.getImageData(0, 0, w, h);
        const d = img.data;
        const solid = new Uint8Array(w * h);
        for (let i = 0; i < w * h; i++) solid[i] = d[i * 4 + 3] >= 128 ? 1 : 0;
        let keep = solid;
        if (r4.shapeStyle === 'outline' && OpenCV.isReady()) {
            // keep the band within one wall thickness of the edge
            const m = new cv.Mat(h, w, cv.CV_8UC1);
            for (let i = 0; i < w * h; i++) m.data[i] = solid[i] ? 255 : 0;
            const pad = new cv.Mat();
            cv.copyMakeBorder(m, pad, 1, 1, 1, 1, cv.BORDER_CONSTANT, new cv.Scalar(0));
            const dist = new cv.Mat();
            cv.distanceTransform(pad, dist, cv.DIST_L2, 3);
            keep = new Uint8Array(w * h);
            for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
                const i = yy * w + xx;
                keep[i] = solid[i] && dist.data32F[(yy + 1) * (w + 2) + xx + 1] <= wallWidth ? 1 : 0;
            }
            m.delete(); pad.delete(); dist.delete();
        }
        for (let i = 0; i < w * h; i++) {
            d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = 0;
            d[i * 4 + 3] = keep[i] ? 255 : 0;
        }
        cc.setTransform(1, 0, 0, 1, 0, 0);
        cc.putImageData(img, 0, 0);
        artCache.key = key;
        artCache.art = c;
        return { canvas: c, x: x, y: y };
    }

    let silhouetteId = 0;
    function setSilhouette(img: HTMLImageElement | HTMLCanvasElement, fromPicture: boolean) {
        // a working copy, at most 512 px on its longer side; a picture without transparency
        // counts its dark pixels as the shape
        const scale = Math.min(1, 512 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * scale));
        c.height = Math.max(1, Math.round(img.height * scale));
        const cc = c.getContext('2d')!;
        cc.drawImage(img, 0, 0, c.width, c.height);
        if (fromPicture) {
            const data = cc.getImageData(0, 0, c.width, c.height);
            const d = data.data;
            let transparent = false;
            for (let i = 3; i < d.length; i += 4) if (d[i] < 250) { transparent = true; break; }
            if (!transparent) {
                for (let i = 0; i < d.length; i += 4) {
                    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
                    d[i + 3] = lum < 128 ? 255 : 0;
                }
                cc.putImageData(data, 0, 0);
            }
        }
        c.dataset.id = String(++silhouetteId);
        silhouette = c;
        artCache.key = '';
        scope.$applyAsync(function () {
            r4.shapeReady = true;
            r4.shapePreview = c.toDataURL('image/png');
        });
        drawOverlay();
    }

    scope.r4api.useIcon = function (icon) {
        // drawn black on transparent from Font Awesome's font (the page's icons), as its SVG is: the
        // glyph's advance across, the font's ascent and descent (512 units) down; large, so the edges
        // stay smooth when scaled
        const styles = (icon.styles || ['solid']).filter(function (s: string) { return s !== 'brands'; });
        const font = (styles.indexOf('solid') > -1 || !styles.length ? '900' : '400') + ' 512px "Font Awesome 7 Free"';
        const glyph = String.fromCodePoint(parseInt(icon.unicode, 16));
        document.fonts.load(font, glyph).then(function (faces) {
            if (!faces.length || !icon.unicode) throw new Error('no glyph');
            const m = document.createElement('canvas').getContext('2d')!;
            m.font = font;
            const metrics = m.measureText(glyph);
            const asc = metrics.fontBoundingBoxAscent, gw = metrics.width, gh = asc + metrics.fontBoundingBoxDescent;
            const k = 512 / Math.max(gw, gh);
            const c = document.createElement('canvas');
            c.width = Math.round(gw * k);
            c.height = Math.round(gh * k);
            const g = c.getContext('2d')!;
            g.font = font;
            g.fillStyle = '#000';
            g.setTransform(k, 0, 0, k, 0, 0);
            g.fillText(glyph, 0, asc);
            setSilhouette(c, false);
        }).catch(function () {
            scope.$applyAsync(function () { r4.message = 'iconFailed'; });
        });
    };

    scope.r4api.useShapeFile = function (file) {
        if (!file) return;
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = function () {
            URL.revokeObjectURL(url);
            setSilhouette(img, true);
        };
        img.onerror = function () {
            URL.revokeObjectURL(url);
            scope.$applyAsync(function () { r4.message = 'imageFailed'; });
        };
        img.src = url;
    };

    // ---- pointer input -----------------------------------------------------------------
    function pos(e: MouseEvent): P {
        const rect = over.getBoundingClientRect();
        return { x: (e.clientX - rect.left) * W / rect.width, y: (e.clientY - rect.top) * H / rect.height };
    }

    function snap(p: P): P {
        if (!r4.snap) return p;
        const step = block / 4;
        return { x: Math.round(p.x / step) * step, y: Math.round(p.y / step) * step };
    }

    // Shapes drawn by dragging from a to p
    function shapeFrom(a: P, p: P, shift: boolean): Shape {
        let b = snap(p);
        const tool = r4.tool;
        if (tool === 'line' && shift) {
            // keep to multiples of 45 degrees
            const ang = Math.round(Math.atan2(p.y - a.y, p.x - a.x) / (Math.PI / 4)) * (Math.PI / 4);
            const l = Math.hypot(p.x - a.x, p.y - a.y);
            b = snap({ x: a.x + Math.cos(ang) * l, y: a.y + Math.sin(ang) * l });
        }
        if ((tool === 'rect' || tool === 'ellipse') && shift) {
            const s = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
            b = { x: a.x + Math.sign(b.x - a.x || 1) * s, y: a.y + Math.sign(b.y - a.y || 1) * s };
        }
        if (tool === 'shape') return { type: 'icon', a: a, b: p, free: shift };
        const shape: Shape = { type: tool, a: a, b: b };
        if (tool === 'circle' || tool === 'polygon') {
            let r = Math.hypot(p.x - a.x, p.y - a.y);
            if (r4.snap) r = Math.max(block / 4, Math.round(r / (block / 4)) * (block / 4));
            shape.r = r;
        }
        if (tool === 'polygon') {
            shape.n = Math.max(3, Math.min(12, r4.sides || 6));
            let rot = Math.atan2(p.y - a.y, p.x - a.x);
            if (!shift) rot = Math.round(rot / (Math.PI / 12)) * (Math.PI / 12);   // 15 degree steps
            shape.rot = rot;
        }
        return shape;
    }

    function stroke(a: P, b: P, eraser: boolean) {
        eachMirror(ctx, true, function (c: Ctx) {
            c.lineCap = 'round';
            c.lineJoin = 'round';
            c.strokeStyle = eraser ? '#FFFFFF' : '#000000';
            c.lineWidth = eraser ? eraserSizes[r4.eraser] : wallWidth;
            c.beginPath();
            c.moveTo(a.x, a.y);
            c.lineTo(b.x + (a.x === b.x && a.y === b.y ? 0.01 : 0), b.y);
            c.stroke();
        });
    }

    // Commit a finished shape onto the picture
    function drawShape(s: Shape) {
        checkpoint();
        if (s.type === 'icon') {
            const art = shapeArt(s);
            if (art) eachMirror(ctx, true, function (c: Ctx) { c.drawImage(art.canvas!, art.x, art.y); });
        } else {
            strokeShape(ctx, s, '#000000');
        }
        commit();
    }

    // ---- selection: move, turn, flip, copy ----------------------------------------------
    // A selected box can be lifted off the picture (its white floor left out) and moved,
    // turned and flipped before it is put down again. Turns are by 90 degrees and drawn
    // without smoothing, so walls and stamp colours stay exact.
    let sel: Record<string, any> | null = null;         // { x, y, w, h, float: canvas or null, fx, fy }
    let clip: (HTMLCanvasElement & { at?: P }) | null = null;        // copied selection (canvas with transparent floor)

    function isFloor(r: number, g: number, b: number) {
        return (r >= 245 && g >= 245 && b >= 245) || (r === 0xD9 && g === 0xDE && b === 0xE5);
    }

    function regionCanvas(x: number, y: number, w: number, h: number) {
        const img = ctx.getImageData(x, y, w, h);
        const d = img.data;
        for (let i = 0; i < d.length; i += 4) if (isFloor(d[i], d[i + 1], d[i + 2])) d[i + 3] = 0;
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        c.getContext('2d')!.putImageData(img, 0, 0);
        return c;
    }

    function clearRegion(x: number, y: number, w: number, h: number) {
        ctx.save();
        clipToRoom(ctx);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(x, y, w, h);
        ctx.restore();
        mask();
    }

    function liftSelection(copy: boolean) {
        if (!sel || sel.float) return;
        checkpoint();
        sel.float = regionCanvas(sel.x, sel.y, sel.w, sel.h);
        sel.fx = sel.x;
        sel.fy = sel.y;
        if (!copy) clearRegion(sel.x, sel.y, sel.w, sel.h);
        analyse();
    }

    function pasteFloat() {
        ctx.save();
        clipToRoom(ctx);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(sel!.float, Math.round(sel!.fx), Math.round(sel!.fy));
        ctx.restore();
        mask();
    }

    function dropSelection() {
        if (!sel) return;
        const floating = !!sel.float;
        if (floating) pasteFloat();
        sel = null;
        syncSel();
        if (floating) commit(); else drawOverlay();
    }

    function selBox() {
        if (!sel) return null;
        return sel.float ? { x: sel.fx, y: sel.fy, w: sel.float.width, h: sel.float.height } : sel;
    }

    function syncSel() {
        scope.$applyAsync(function () {
            r4.hasSelection = !!sel;
            r4.hasClip = !!clip;
        });
    }

    function transformFloat(kind: string) {
        if (!sel) return;
        if (!sel.float) liftSelection(false);
        const src = sel.float;
        const turn = kind === 'cw' || kind === 'ccw';
        const c = document.createElement('canvas');
        c.width = turn ? src.height : src.width;
        c.height = turn ? src.width : src.height;
        const x = c.getContext('2d')!;
        x.imageSmoothingEnabled = false;
        x.translate(c.width / 2, c.height / 2);
        if (kind === 'cw') x.rotate(Math.PI / 2);
        if (kind === 'ccw') x.rotate(-Math.PI / 2);
        if (kind === 'h') x.scale(-1, 1);
        if (kind === 'v') x.scale(1, -1);
        x.drawImage(src, -src.width / 2, -src.height / 2);
        const cx = sel.fx + src.width / 2, cy = sel.fy + src.height / 2;
        sel.float = c;
        sel.fx = Math.round(cx - c.width / 2);
        sel.fy = Math.round(cy - c.height / 2);
        drawOverlay();
    }

    const selStep = function () { return r4.snap ? block / 4 : 1; };

    scope.r4api.selection = function (action) {
        if (action === 'paste') {
            if (!clip) return;
            if (sel) dropSelection();
            checkpoint();
            const c = document.createElement('canvas');
            c.width = clip.width;
            c.height = clip.height;
            c.getContext('2d')!.drawImage(clip, 0, 0);
            const step = block / 4;
            const at = clip.at || { x: 0, y: 0 };
            sel = { x: at.x + step, y: at.y + step, w: c.width, h: c.height, float: c, fx: at.x + step, fy: at.y + step };
            clip.at = { x: sel.fx, y: sel.fy };
            if (r4.tool !== 'select') scope.setTool('select');
            syncSel();
            drawOverlay();
            return;
        }
        if (!sel) return;
        if (action === 'cw' || action === 'ccw' || action === 'h' || action === 'v') transformFloat(action);
        else if (action === 'copy') {
            const b = selBox();
            clip = sel.float ? sel.float : regionCanvas(b!.x, b!.y, b!.w, b!.h);
            clip!.at = { x: b!.x, y: b!.y };
            syncSel();
        } else if (action === 'duplicate') {
            // put a copy down where it is, and keep moving the other one
            if (sel.float) {
                pasteFloat();
                save();
                checkpoint();
            } else {
                liftSelection(true);
            }
            const c = document.createElement('canvas');
            c.width = sel.float.width;
            c.height = sel.float.height;
            c.getContext('2d')!.drawImage(sel.float, 0, 0);
            sel.float = c;
            sel.fx += block / 4;
            sel.fy += block / 4;
            analyse();
        } else if (action === 'delete') {
            if (sel.float) {
                sel = null;
                commit();
            } else {
                checkpoint();
                clearRegion(sel.x, sel.y, sel.w, sel.h);
                sel = null;
                commit();
            }
            syncSel();
        } else if (action === 'drop') {
            dropSelection();
        }
    };

    function nudgeSelection(dx: number, dy: number) {
        if (!sel) return;
        if (!sel.float) liftSelection(false);
        sel.fx += dx * selStep();
        sel.fy += dy * selStep();
        drawOverlay();
    }

    function drawSelection() {
        const b = selBox();
        if (!b && !(drag && drag.selecting)) return;
        octx.save();
        if (sel && sel.float) {
            octx.imageSmoothingEnabled = false;
            octx.drawImage(sel.float, Math.round(sel.fx), Math.round(sel.fy));
        }
        const r = b || drag!.rect;
        if (r) {
            octx.lineWidth = 1.5 * k;
            octx.strokeStyle = '#fff';
            octx.strokeRect(r.x, r.y, r.w, r.h);
            octx.strokeStyle = '#2563eb';
            octx.setLineDash([6 * k, 4 * k]);
            octx.strokeRect(r.x, r.y, r.w, r.h);
            octx.setLineDash([]);
            if (b) {
                octx.fillStyle = 'rgba(37, 99, 235, 0.06)';
                octx.fillRect(r.x, r.y, r.w, r.h);
            }
        }
        octx.restore();
    }

    function selectRect(a: P, p: P) {
        const q = snap(p);
        const x = Math.max(0, Math.min(a.x, q.x)), y = Math.max(0, Math.min(a.y, q.y));
        const x2 = Math.min(W, Math.max(a.x, q.x)), y2 = Math.min(H, Math.max(a.y, q.y));
        return { x: Math.round(x), y: Math.round(y), w: Math.round(x2 - x), h: Math.round(y2 - y) };
    }

    function inSelection(p: P) {
        const b = selBox();
        return b && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
    }

    // ---- random victims along the walls -------------------------------------------------
    // Places stamps next to walls where the robot can identify them (its centre can come
    // within half a tile and its body reaches that side), at least half a tile apart
    function identifiable(c: P) {
        if (!reachInfo) return true;
        const gx = Math.round((originCm.x + c.x / pxPerCm) / REACH_RES);
        const gy = Math.round((originCm.y + c.y / pxPerCm) / REACH_RES);
        if (gx < 0 || gy < 0 || gx >= reachInfo.gw || gy >= reachInfo.gh) return false;
        const d = reachInfo.dist[gy * reachInfo.gw + gx];
        return d * REACH_RES <= 6 && d <= reachInfo.need + 0.5;
    }

    scope.r4api.randomStamps = function (count, mode) {
        if (!pixels) return;
        if (sel) dropSelection();
        checkpoint();
        const placed: P[] = [];
        const others = tokens.map(function (t) { return { x: t.cx, y: t.cy }; });
        const gap = block / 2;
        const choices = types.length ? types : [{ idx: -1 }];
        let tries = 0;
        while (placed.length < count && tries < count * 600) {
            tries++;
            const p = { x: Math.random() * W, y: Math.random() * H };
            if (!roomAt(p.x, p.y)) continue;
            const spot = stampSpot(p);
            if (!spot.ok) continue;
            const c = { x: spot.x + stampSize / 2, y: spot.y + stampSize / 2 };
            if (others.concat(placed).some(function (q) { return Math.hypot(q.x - c.x, q.y - c.y) < gap; })) continue;
            if (!identifiable(c)) continue;
            const idx = mode === 'mixed' ? choices[Math.floor(Math.random() * choices.length)].idx : r4.stamp;
            const rgb = R4.stampRGB(idx);
            ctx.fillStyle = R4.stampColor(idx);
            ctx.fillRect(spot.x, spot.y, stampSize, stampSize);
            // keep the pixel copy current for the next spot
            for (let yy = spot.y; yy < spot.y + stampSize; yy++) {
                for (let xx = spot.x; xx < spot.x + stampSize; xx++) {
                    const i = (yy * W + xx) * 4;
                    pixels[i] = rgb[0]; pixels[i + 1] = rgb[1]; pixels[i + 2] = rgb[2];
                }
            }
            placed.push(c);
        }
        commit();
        scope.$applyAsync(function () {
            r4.message = placed.length < count ? 'randomShort' : 'randomDone';
            r4.messageParams = { placed: placed.length, asked: count };
        });
    };

    // ---- room templates -----------------------------------------------------------------
    const roomTiles = Object.keys(inRoom).map(function (key) { return key.split(',').map(Number); });
    function shuffle<T>(a: T[]) {
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
    }
    function line(c: Ctx, x1: number, y1: number, x2: number, y2: number) { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); }

    const TEMPLATES: Record<string, (c: Ctx) => void> = {
        // a maze on the tile grid: corridors one tile wide, a few extra openings for loops
        maze: function (c: Ctx) {
            const seen: Record<string, boolean> = {}, open: Record<string, boolean> = {};
            const keyOf = function (x: number, y: number) { return x + ',' + y; };
            const start = roomTiles[Math.floor(Math.random() * roomTiles.length)];
            const stack = [start];
            seen[keyOf(start[0], start[1])] = true;
            while (stack.length) {
                const cur = stack[stack.length - 1];
                const next = shuffle([[1, 0], [-1, 0], [0, 1], [0, -1]]).map(function (d) { return [cur[0] + d[0], cur[1] + d[1]]; })
                    .find(function (n) { return inRoom[keyOf(n[0], n[1])] && !seen[keyOf(n[0], n[1])]; });
                if (!next) { stack.pop(); continue; }
                seen[keyOf(next[0], next[1])] = true;
                open[[keyOf(cur[0], cur[1]), keyOf(next[0], next[1])].sort().join('|')] = true;
                stack.push(next);
            }
            roomTiles.forEach(function (t) {
                [[1, 0], [0, 1]].forEach(function (d) {
                    const n = [t[0] + d[0], t[1] + d[1]];
                    if (!inRoom[keyOf(n[0], n[1])]) return;
                    if (open[[keyOf(t[0], t[1]), keyOf(n[0], n[1])].sort().join('|')] || Math.random() < 0.12) return;
                    if (d[0]) line(c, n[0] * block, t[1] * block, n[0] * block, (t[1] + 1) * block);
                    else line(c, t[0] * block, n[1] * block, (t[0] + 1) * block, n[1] * block);
                });
            });
        },
        // round pillars on the inner tile corners
        pillars: function (c: Ctx) {
            const r = block * 0.12;
            roomTiles.forEach(function (t) {
                const x = t[0] + 1, y = t[1] + 1;
                if (!inRoom[x + ',' + t[1]] || !inRoom[t[0] + ',' + y] || !inRoom[x + ',' + y]) return;
                c.beginPath(); c.arc(x * block, y * block, r, 0, Math.PI * 2); c.fill();
            });
        },
        // short diagonal walls in some tiles (room 4 asks for diagonal movement)
        diagonal: function (c: Ctx) {
            roomTiles.forEach(function (t) {
                // fewer next to the room's edge, where a wall end leaves a pocket the robot cannot enter
                const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(function (d) { return !inRoom[(t[0] + d[0]) + ',' + (t[1] + d[1])]; });
                if (Math.random() > (edge ? 0.2 : 0.5)) return;
                const cx = (t[0] + 0.5) * block, cy = (t[1] + 0.5) * block, h = block * 0.3;
                const s = Math.random() < 0.5 ? 1 : -1;
                line(c, cx - h, cy - s * h, cx + h, cy + s * h);
            });
        },
        // walls across the room, leaving a tile-wide gap at alternate ends
        zigzag: function (c: Ctx) {
            const cols = Math.round(W / block), rowsN = Math.round(H / block);
            if (cols >= rowsN) {
                for (let i = 1; i < cols; i++) {
                    const top = i % 2 === 1;
                    line(c, i * block, top ? block : 0, i * block, top ? H : H - block);
                }
            } else {
                for (let j = 1; j < rowsN; j++) {
                    const left = j % 2 === 1;
                    line(c, left ? block : 0, j * block, left ? W : W - block, j * block);
                }
            }
        },
        // rings round the middle, each with a gap
        rings: function (c: Ctx) {
            const cx = W / 2, cy = H / 2;
            const maxR = Math.min(W, H) / 2 - block * 0.35;
            for (let r = block * 0.75; r <= maxR; r += block) {
                const gapAng = (block * 1.1) / r;
                const a0 = Math.random() * Math.PI * 2;
                c.beginPath();
                c.arc(cx, cy, r, a0 + gapAng, a0 + Math.PI * 2);
                c.stroke();
            }
        },
        // scattered obstacles: circles, boxes and triangles, at least a tile apart
        obstacles: function (c: Ctx) {
            const n = Math.max(2, Math.round(roomTiles.length * 0.35));
            const placed: { x: number; y: number; size: number }[] = [];
            for (let tries = 0; placed.length < n && tries < n * 60; tries++) {
                const t = roomTiles[Math.floor(Math.random() * roomTiles.length)];
                const x = (t[0] + 0.2 + Math.random() * 0.6) * block, y = (t[1] + 0.2 + Math.random() * 0.6) * block;
                const size = block * (0.15 + Math.random() * 0.15);
                // keep clear of the room's edge (its walls and entrances) and of each other
                const m = size + block * 0.75;
                if (![[m, 0], [-m, 0], [0, m], [0, -m], [m * 0.7, m * 0.7], [-m * 0.7, m * 0.7], [m * 0.7, -m * 0.7], [-m * 0.7, -m * 0.7]]
                    .every(function (d) { const qx = x + d[0], qy = y + d[1]; return qx > 0 && qy > 0 && qx < W && qy < H && roomAt(qx, qy); })) continue;
                if (placed.some(function (q) { return Math.hypot(q.x - x, q.y - y) < q.size + size + block; })) continue;
                placed.push({ x: x, y: y, size: size });
                const kind = Math.floor(Math.random() * 3);
                c.beginPath();
                if (kind === 0) c.arc(x, y, size, 0, Math.PI * 2);
                else if (kind === 1) c.rect(x - size, y - size, size * 2, size * 2);
                else { for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / 3; if (i) c.lineTo(x + Math.cos(a) * size * 1.2, y + Math.sin(a) * size * 1.2); else c.moveTo(x + Math.cos(a) * size * 1.2, y + Math.sin(a) * size * 1.2); } c.closePath(); }
                c.fill();
            }
        }
    };

    scope.r4api.applyTemplate = function (id, clearFirst) {
        const make = TEMPLATES[id];
        if (!make) return;
        if (sel) dropSelection();
        checkpoint();
        const base = snapshot();
        let ok = true, best: { blocked: number; image: ImageData } | null = null;
        // random templates are tried again (up to 10 times) while they shut off a part of the
        // room (over 12 % of its floor); otherwise the best try is kept
        for (let attempt = 0; attempt < 10; attempt++) {
            ctx.putImageData(base, 0, 0);
            if (clearFirst) { ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H); }
            ctx.save();
            clipToRoom(ctx);
            ctx.strokeStyle = '#000000';
            ctx.fillStyle = '#000000';
            ctx.lineWidth = wallWidth;
            ctx.lineCap = 'round';
            make(ctx);
            ctx.restore();
            mask();
            pixels = snapshot().data;
            try { computeReach(); } catch (err) { reachStats = null; }
            ok = !reachStats || reachStats.blocked <= reachStats.room * 0.12;
            if (ok) break;
            if (!best || reachStats!.blocked < best.blocked) best = { blocked: reachStats!.blocked, image: snapshot() };
        }
        if (!ok && best) ctx.putImageData(best.image, 0, 0);
        commit();
        scope.$applyAsync(function () { r4.message = ok ? '' : 'templateBlocked'; r4.messageParams = {}; });
    };

    // ---- curve (click points) and arc (drag the chord, then bend) ----------------------
    function finishPending(closed: boolean) {
        if (!pending) return;
        const s = pending.type === 'curve'
            ? { type: 'curve', pts: pending.pts.slice(), smooth: r4.smooth, closed: !!closed }
            : null;
        pending = null;
        preview = null;
        if (s && s.pts.length > 1) drawShape(s);
        else drawOverlay();
    }

    function cancelPending() {
        pending = null;
        preview = null;
        drawOverlay();
    }

    function updatePendingPreview(p: P) {
        if (!pending) return;
        const q = snap(p);
        if (pending.type === 'curve') {
            preview = { type: 'curve', pts: pending.pts.concat([q]), smooth: r4.smooth, closed: false };
        } else if (pending.type === 'arc') {
            preview = { type: 'arc', p0: pending.pts[0], p1: pending.pts[1], c: q };
        }
    }

    let drag: Record<string, any> | null = null;
    over.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    over.addEventListener('pointerdown', function (e) {
        const p = pos(e);
        // right click: finish a curve, or remove the token under the pointer
        if (e.button === 2) {
            if (pending && pending.type === 'curve') { finishPending(false); return; }
            if (pending) { cancelPending(); return; }
            const hit = tokenAt(p);
            if (hit) {
                checkpoint();
                removeTokens([hit]);
                commit();
            }
            return;
        }
        if (e.button !== 0) return;
        over.setPointerCapture(e.pointerId);
        const tool = r4.tool;
        if (tool === 'select') {
            if (inSelection(p)) {
                // drag the selection; Alt drags a copy
                if (!sel!.float) liftSelection(e.altKey);
                drag = { move: true, start: p, fx: sel!.fx, fy: sel!.fy };
            } else {
                if (sel) dropSelection();
                drag = { selecting: true, start: snap(p), rect: null };
            }
            drawOverlay();
            return;
        }
        if (tool === 'stamp') { placeStamp(p); return; }
        if (tool === 'template') return;
        if (tool === 'floor') {
            // the tile clicked gets the floor chosen, or loses it when it has it already (or with
            // none chosen); dragging gives the tiles passed the same
            const ft = floorTile(p);
            if (!ft) return;
            const to = r4.floor === 'clear' || floorAt(ft.tx, ft.ty) === r4.floor ? '' : r4.floor;
            if (!floorFits(ft.tx, ft.ty, to)) {
                scope.$applyAsync(function () { r4.message = 'floorNotOuter'; r4.messageParams = {}; });
                return;
            }
            checkpoint();
            drag = { floor: to, changed: setFloor(ft.tx, ft.ty, to) };
            drawOverlay();
            return;
        }
        if (tool === 'curve') {
            const q = snap(p);
            if (!pending) pending = { type: 'curve', pts: [q] };
            else {
                const first = pending.pts[0], last = pending.pts[pending.pts.length - 1];
                const near = 8 * k;
                if (pending.pts.length >= 3 && Math.hypot(q.x - first.x, q.y - first.y) <= near) { finishPending(true); return; }
                // a click on the last point again (as in a double-click) adds nothing
                if (Math.hypot(q.x - last.x, q.y - last.y) > near) pending.pts.push(q);
            }
            updatePendingPreview(p);
            drawOverlay();
            return;
        }
        if (tool === 'arc' && pending) {
            const s = { type: 'arc', p0: pending.pts[0], p1: pending.pts[1], c: snap(p) };
            pending = null;
            preview = null;
            drawShape(s);
            return;
        }
        if (tool === 'erase' && r4.eraseTarget === 'tokens') {
            checkpoint();
            drag = { tokensOnly: true };
            eraseTokensAt(p);
            drawOverlay();
            return;
        }
        if (tool === 'pen' || tool === 'erase') {
            checkpoint();
            drag = { last: p };
            stroke(p, p, tool === 'erase');
        } else if (tool === 'arc') {
            drag = { start: snap(p), arc: true };
            preview = { type: 'line', a: drag.start, b: drag.start };
        } else {
            if (tool === 'shape' && !silhouette) {
                scope.$applyAsync(function () { r4.message = 'pickShape'; });
                return;
            }
            drag = { start: tool === 'shape' ? p : snap(p) };
            preview = shapeFrom(drag.start, p, e.shiftKey);
        }
        drawOverlay();
    });
    over.addEventListener('dblclick', function (e) {
        e.preventDefault();
        if (pending && pending.type === 'curve') finishPending(false);
    });
    over.addEventListener('pointermove', function (e) {
        const p = pos(e);
        hover = p;
        if (drag && drag.move) {
            let dx = p.x - drag.start.x, dy = p.y - drag.start.y;
            if (r4.snap) { const st = block / 4; dx = Math.round(dx / st) * st; dy = Math.round(dy / st) * st; }
            sel!.fx = Math.round(drag.fx + dx);
            sel!.fy = Math.round(drag.fy + dy);
        } else if (drag && drag.selecting) {
            drag.rect = selectRect(drag.start, p);
        } else if (drag && drag.floor !== undefined) {
            const ft = floorTile(p);
            if (ft && setFloor(ft.tx, ft.ty, drag.floor)) drag.changed = true;
        } else if (drag && drag.tokensOnly) {
            eraseTokensAt(p);
        } else if (drag && drag.arc) {
            preview = { type: 'line', a: drag.start, b: snap(p) };
        } else if (drag) {
            if (r4.tool === 'pen' || r4.tool === 'erase') {
                stroke(drag.last, p, r4.tool === 'erase');
                drag.last = p;
                mask();
            } else {
                preview = shapeFrom(drag.start, p, e.shiftKey);
            }
        } else if (pending) {
            updatePendingPreview(p);
        }
        drawOverlay();
    });
    // Eraser on "victims only": every token the eraser touches goes, walls stay
    function eraseTokensAt(p: P) {
        const hit = tokensUnder(p, eraserSizes[r4.eraser] / 2);
        if (!hit.length) return;
        removeTokens(hit);
        tokens = tokens.filter(function (t) { return hit.indexOf(t) < 0; });
    }

    function finish(e: PointerEvent) {
        if (!drag) return;
        const d = drag;
        drag = null;
        if (d.move) { drawOverlay(); return; }
        if (d.floor !== undefined) {
            // nothing changed: no step to undo
            if (!d.changed) { undo.pop(); drawOverlay(); return; }
            floorsChanged();
            return;
        }
        if (d.selecting) {
            const r = selectRect(d.start, pos(e));
            sel = r.w >= 4 && r.h >= 4 ? { x: r.x, y: r.y, w: r.w, h: r.h, float: null } : null;
            syncSel();
            drawOverlay();
            return;
        }
        if (d.arc) {
            // the chord is set; now move to bend it and click
            const end = snap(pos(e));
            if (Math.hypot(end.x - d.start.x, end.y - d.start.y) >= 2) {
                pending = { type: 'arc', pts: [d.start, end] };
                updatePendingPreview(pos(e));
            } else {
                preview = null;
            }
            drawOverlay();
            return;
        }
        if (preview) {
            const shape = shapeFrom(d.start, pos(e), e.shiftKey);
            preview = null;
            if (shapeSize(shape) >= 2) { drawShape(shape); return; }
        }
        if (d.tokensOnly || d.last) commit();
        else drawOverlay();
    }
    over.addEventListener('pointerup', finish);
    over.addEventListener('pointercancel', finish);
    over.addEventListener('pointerleave', function () {
        hover = null;
        drawOverlay();
    });

    // keys for a curve or arc in progress: Enter finishes, Esc cancels, Backspace undoes a point
    function selectionKey(e: KeyboardEvent) {
        const mod = e.ctrlKey || e.metaKey;
        const key = e.key.toLowerCase();
        if (mod && key === 'v' && clip) { scope.$apply(function () { scope.r4api.selection('paste'); }); return true; }
        if (!sel) return false;
        if (mod && key === 'c') { scope.r4api.selection('copy'); return true; }
        if (mod && key === 'd') { scope.$apply(function () { scope.r4api.selection('duplicate'); }); return true; }
        if (mod) return false;
        if (e.key === 'Delete' || e.key === 'Backspace') { scope.$apply(function () { scope.r4api.selection('delete'); }); return true; }
        if (e.key === 'Enter' || e.key === 'Escape') { scope.$apply(function () { scope.r4api.selection('drop'); }); return true; }
        const arrows: Record<string, number[]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
        if (arrows[e.key]) { nudgeSelection(arrows[e.key][0], arrows[e.key][1]); return true; }
        if (key === '[' || key === ']') { transformFloat(key === ']' ? 'cw' : 'ccw'); return true; }
        return false;
    }

    function shapeKey(e: KeyboardEvent) {
        if (!pending) return false;
        if (e.key === 'Enter') { finishPending(false); return true; }
        if (e.key === 'Escape') { cancelPending(); return true; }
        if (e.key === 'Backspace' && pending.type === 'curve') {
            pending.pts.pop();
            if (!pending.pts.length) cancelPending();
            else { if (hover) updatePendingPreview(hover); drawOverlay(); }
            return true;
        }
        return false;
    }
    // a tool change drops a curve or arc in progress
    scope.$watch('r4.tool', function () {
        if (pending) cancelPending();
        if (sel) dropSelection();
    });

    // ---- actions for the dialog -------------------------------------------------------
    // A pen stroke along pts ([x, y] fractions of the picture), as a drag with the pen would
    // draw it (one undo step); without pts, a gentle wave across the upper middle (the guide
    // of the editor draws it for "do it for me")
    scope.r4api.drawPen = function (pts) {
        if (!pts) {
            pts = [];
            for (let i = 0; i <= 40; i++) {
                const t = i / 40;
                pts.push([0.3 + 0.4 * t, 0.36 + 0.07 * Math.min(1, W / H) * Math.sin(2 * Math.PI * t)]);
            }
        }
        checkpoint();
        for (let i = 1; i < pts.length; i++) {
            stroke({ x: pts[i - 1][0] * W, y: pts[i - 1][1] * H }, { x: pts[i][0] * W, y: pts[i][1] * H }, false);
        }
        commit();
    };
    // What the editor's guide does for "do it for me", as the tools do it. Points are
    // [x, y] fractions of the picture, sizes fractions of its width.
    const atF = function (f: number[]): P { return { x: f[0] * W, y: f[1] * H }; };
    // spec: { type: line | rect | ellipse (a, b), circle (a, r), polygon (a, r, n, rot), arc (p0, c,
    // p1), curve (pts, smooth, closed) } - drawn as that tool draws it (mirrored as set)
    scope.r4api.drawShape = function (spec) {
        const s: Shape = { type: spec.type };
        if (spec.a) s.a = atF(spec.a);
        if (spec.b) s.b = atF(spec.b);
        if (spec.r) s.r = spec.r * W;
        if (spec.type === 'polygon') { s.n = spec.n || 6; s.rot = spec.rot || 0; }
        if (spec.type === 'arc') { s.p0 = atF(spec.p0); s.c = atF(spec.c); s.p1 = atF(spec.p1); }
        if (spec.type === 'curve') { s.pts = spec.pts.map(atF); s.smooth = spec.smooth !== false; s.closed = !!spec.closed; }
        drawShape(s);
    };
    // an icon (Font Awesome, by name) put into the box a-b, once it has loaded: as large as fits the
    // box with its own proportions, in the middle of it (a drag sizes it by its larger side)
    scope.r4api.drawIcon = function (name, a, b) {
        scope.pickIcon({ name: name, styles: ['solid'] });
        const want = silhouetteId;
        let tries = 0;
        (function wait() {
            if (silhouette && silhouetteId !== want) {
                const p = atF(a), q = atF(b);
                const bw = Math.abs(q.x - p.x), bh = Math.abs(q.y - p.y);
                const k = Math.min(bw / silhouette.width, bh / silhouette.height);
                const w = silhouette.width * k, h = silhouette.height * k;
                const x = Math.min(p.x, q.x) + (bw - w) / 2, y = Math.min(p.y, q.y) + (bh - h) / 2;
                drawShape({ type: 'icon', a: { x: x, y: y }, b: { x: x + w, y: y + h }, free: true });
                return;
            }
            if (++tries < 100) setTimeout(wait, 100);
        })();
    };
    // the select tool's box, from a to b
    scope.r4api.selectBox = function (a, b) {
        const p = atF(a), q = atF(b);
        sel = { x: Math.round(Math.min(p.x, q.x)), y: Math.round(Math.min(p.y, q.y)), w: Math.round(Math.abs(q.x - p.x)), h: Math.round(Math.abs(q.y - p.y)), float: null };
        syncSel();
        drawOverlay();
    };
    // the eraser (on everything) along pts
    scope.r4api.erasePen = function (pts) {
        checkpoint();
        for (let i = 1; i < pts.length; i++) stroke(atF(pts[i - 1]), atF(pts[i]), true);
        commit();
    };
    // the eraser on victims only, on the i-th victim; and the victim tool's click on it
    scope.r4api.eraseToken = function (i) {
        const t = tokens[i || 0];
        if (!t) return;
        checkpoint();
        eraseTokensAt({ x: t.cx, y: t.cy });
        commit();
    };
    scope.r4api.selectToken = function (i) { selectToken(tokens[i || 0] || null); };
    scope.r4api.undo = function () {
        if (sel) { sel = null; syncSel(); }
        if (!undo.length) return;
        redo.push(step());
        restore(undo.pop()!);
    };
    scope.r4api.redo = function () {
        if (!redo.length) return;
        undo.push(step());
        restore(redo.pop()!);
    };
    scope.r4api.clear = function () {
        checkpoint();
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, W, H);
        commit();
    };
    scope.r4api.download = function () {
        const link = document.createElement('a');
        link.download = 'custom_room_4_pic.png';
        link.href = main.toDataURL('image/png');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };
    function drawPicture(src: string, done: () => void) {
        const img = new Image();
        img.onload = function () {
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, W, H);
            // nearest-neighbour scaling keeps the exact stamp colours
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(img, 0, 0, W, H);
            ctx.imageSmoothingEnabled = true;
            done();
        };
        img.src = src;
    }
    scope.r4api.importFile = function (file) {
        if (!file) return;
        const url = URL.createObjectURL(file);
        checkpoint();
        drawPicture(url, function () {
            URL.revokeObjectURL(url);
            commit();
        });
    };

    // redraw the overlay when options change
    scope.$watchGroup(['r4.snap', 'r4.tool', 'r4.floor', 'r4.stamp', 'r4.eraser', 'r4.eraseTarget', 'r4.showReach', 'r4.showGuides',
        'r4.mirror', 'r4.shapeStyle', 'r4.shapeRot', 'r4.smooth'], function () { artCache.key = ''; drawOverlay(); });

    // ---- zoom and pan ----------------------------------------------------------------------
    // The picture is shown in a scrolling view; zoom 1 fits it, up to 8 times that. Ctrl / Cmd
    // + wheel (or a pinch) zooms at the pointer; Space + drag or the middle button pans.
    const view = stage.parentElement!;
    const ZOOM_MIN = 1, ZOOM_MAX = 8;
    function fitScale() {
        const vw = view.clientWidth, vh = view.clientHeight;
        if (!vw || !vh) return 1;
        return Math.min(vw / W, vh / H);
    }
    function applyZoom(anchor?: P) {
        const before = over.getBoundingClientRect();
        const scale = fitScale() * r4.zoom;
        const w = Math.max(1, Math.floor(W * scale)), h = Math.max(1, Math.floor(H * scale));
        stage.style.width = w + 'px';
        stage.style.height = h + 'px';
        main.style.width = w + 'px';
        main.style.height = h + 'px';
        if (anchor && before.width) {
            // keep the point under the pointer where it is
            const fx = (anchor.x - before.left) / before.width, fy = (anchor.y - before.top) / before.height;
            const after = over.getBoundingClientRect();
            view.scrollLeft += after.left + fx * after.width - anchor.x;
            view.scrollTop += after.top + fy * after.height - anchor.y;
        }
        scope.$applyAsync(function () { r4.zoomPct = Math.round(r4.zoom * 100); });
        drawOverlay();
    }
    function setZoom(z: number, anchor?: P) {
        const nz = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
        if (nz === r4.zoom && !anchor) { applyZoom(); return; }
        if (!anchor) {
            const r = view.getBoundingClientRect();
            anchor = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        }
        r4.zoom = nz;
        applyZoom(anchor);
    }
    scope.r4api.zoom = function (dir) {
        if (dir === 0) { r4.zoom = 1; applyZoom(); return; }
        setZoom(r4.zoom * (dir > 0 ? 1.25 : 0.8));
    };
    view.addEventListener('wheel', function (e) {
        if (!(e.ctrlKey || e.metaKey)) return;
        e.preventDefault();
        setZoom(r4.zoom * Math.exp(-e.deltaY * 0.0025), { x: e.clientX, y: e.clientY });
    }, { passive: false });

    let spaceHeld = false;
    let pan: { x: number; y: number; left: number; top: number } | null = null;
    function startPan(e: PointerEvent) {
        pan = { x: e.clientX, y: e.clientY, left: view.scrollLeft, top: view.scrollTop };
        over.setPointerCapture(e.pointerId);
        scope.$applyAsync(function () { r4.panning = true; });
    }
    over.addEventListener('pointerdown', function (e) {
        if (e.button === 1 || (e.button === 0 && spaceHeld)) {
            e.preventDefault();
            e.stopImmediatePropagation();
            startPan(e);
        }
    }, true);
    over.addEventListener('pointermove', function (e) {
        if (!pan) return;
        e.stopImmediatePropagation();
        view.scrollLeft = pan.left - (e.clientX - pan.x);
        view.scrollTop = pan.top - (e.clientY - pan.y);
    }, true);
    function endPan(e: PointerEvent) {
        if (!pan) return;
        e.stopImmediatePropagation();
        pan = null;
        scope.$applyAsync(function () { r4.panning = false; });
    }
    over.addEventListener('pointerup', endPan, true);
    over.addEventListener('pointercancel', endPan, true);
    function onSpace(e: KeyboardEvent) {
        const tag = (e.target && (e.target as HTMLElement).tagName) || '';
        if (e.key !== ' ' || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') return;
        e.preventDefault();
        spaceHeld = e.type === 'keydown';
        stage.classList.toggle('pan-ready', spaceHeld);
    }
    document.addEventListener('keydown', onSpace, true);
    document.addEventListener('keyup', onSpace, true);
    window.addEventListener('resize', function () { applyZoom(); });
    scope.$on('$destroy', function () {
        document.removeEventListener('keydown', onSpace, true);
        document.removeEventListener('keyup', onSpace, true);
    });
    // size the picture once the dialog is laid out
    (window.requestAnimationFrame || setTimeout)(function () { applyZoom(); });
    setTimeout(function () { applyZoom(); }, 300);

    // keyboard: undo / redo and tool keys
    function onKey(e: KeyboardEvent) {
        const tag = (e.target && (e.target as HTMLElement).tagName) || '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (shapeKey(e) || selectionKey(e)) { e.preventDefault(); e.stopPropagation(); return; }
        const mod = e.ctrlKey || e.metaKey;
        const k = e.key.toLowerCase();
        if (mod && k === 'z') { e.preventDefault(); scope.$apply(e.shiftKey ? scope.r4api.redo : scope.r4api.undo); return; }
        if (mod && k === 'y') { e.preventDefault(); scope.$apply(scope.r4api.redo); return; }
        if (mod && (k === '+' || k === '=' || k === ';')) { e.preventDefault(); scope.r4api.zoom(1); return; }
        if (mod && k === '-') { e.preventDefault(); scope.r4api.zoom(-1); return; }
        if (mod && k === '0') { e.preventDefault(); scope.r4api.zoom(0); return; }
        if (mod || e.altKey) return;
        const tool = scope.tools.find(function (t) { return t.key.toLowerCase() === k; });
        if (tool) scope.$apply(function () { scope.setTool(tool.id); });
    }
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', drawOverlay);
    scope.$on('$destroy', function () {
        document.removeEventListener('keydown', onKey, true);
        window.removeEventListener('resize', drawOverlay);
    });

    // ---- start: the saved picture, or a blank room -----------------------------------
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, W, H);
    if (editor.room4CanvasSave) {
        drawPicture(editor.room4CanvasSave, function () {
            mask();
            analyse();
        });
    } else {
        commit();
    }
}
