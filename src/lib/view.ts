// The map view: draws a map (the classic editor's format) on a canvas in cm, with zoom (wheel,
// buttons) and pan (drag).
import type { MapData } from './types';
import * as L from './lattice';
import * as Icons from './icons';
import * as R4 from './room4';
import { rulesOf } from '../rules/registry';

// A stamp of the room 4 picture as the map shows it: where it is and the face of the wall it is
// against (fractions of the picture), its type index (-1 random)
interface PictureToken { fx: number; fy: number; type: number; ax: number | null; ay: number | null; thick: number }

// What the view asks of the editor: the tool gets the pointer in cm
interface ViewTool {
    pans?(): boolean;
    down?(p: { x: number; y: number }, e: PointerEvent): void;
    move?(p: { x: number; y: number }, dragging: boolean, e: PointerEvent): void;
    up?(p: { x: number; y: number }, e: PointerEvent): void;
    cancel?(): void;
    leave?(): void;
}
interface ViewOptions {
    onView?(v: { zoom: number }): void;
    fitInset?(): number;
    // under the tiles' floors (over the rooms' colours), and over them (under the grid and walls)
    underlay?(ctx: CanvasRenderingContext2D, v: { scale: number }): void;
    overFloor?(ctx: CanvasRenderingContext2D, v: { scale: number }): void;
    overlay?(ctx: CanvasRenderingContext2D, v: { scale: number; rooms: Record<string, number> }): void;
    tool?: ViewTool;
}
export interface MapView {
    setMap(m: MapData, keepView?: boolean): void;
    fit(): void;
    zoom(dir: number): void;
    redraw(): void;
    resize(): void;
    fitIfAuto(): void;
    scale(): number;
    toPx(x: number, y: number): [number, number];
    showCm(x: number, y: number): void;
    tileRooms(): Record<string, number>;
    wallCount(): number;
}

const TILE = 12;                 // cm
const WALL = 1;                  // wall thickness, cm
const ROOM_FILL: Record<number, string> = { 1: '#ffffff', 2: '#dcebfb', 3: '#f7e3f7', 4: '#e6d9ff' };
const ROOM_EDGE: Record<number, string> = { 2: '#359ef4', 3: '#c86fca', 4: '#7500ff' };

// How a victim of the map file shows (the map's year's kinds): by its letter on a tile side, or its
// value on a 6 cm face (rules: TokenKind edge / slot)
interface Glyph { symbol: string; face?: string; color?: string }
function edgeGlyph(map: MapData, letter: string): Glyph {
    const k = rulesOf(map).tokens.kinds.find(function (k) { return k.edge === letter; });
    return k ? { symbol: k.symbol, face: k.face, color: k.color } : { symbol: letter || '?' };
}
function slotGlyph(map: MapData, value: string): Glyph {
    const tokens = rulesOf(map).tokens;
    const k = tokens.kinds.find(function (k) { return k.slot === value; });
    if (k) return { symbol: k.symbol, face: k.face, color: k.color };
    // a ring target's type
    const type = Object.keys(tokens.target.slot).find(function (l) { return String(tokens.target.slot[l]) === value; });
    return { symbol: type || '?' };
}

// Room (1-4) of every first-floor tile, keyed by the tile's cell "x,y"
function tileRooms(map: MapData): Record<string, number> {
    const rooms: Record<string, number> = {};
    for (let x = 0; x < map.width; x++) for (let y = 0; y < map.length; y++) rooms[(2 * x + 1) + ',' + (2 * y + 1)] = 1;
    (map.roomTiles || []).forEach(function (list, i) {
        (list || []).forEach(function (key) {
            const p = key.split(',');
            if (p[2] === '0' && (p[0] + ',' + p[1]) in rooms) rooms[p[0] + ',' + p[1]] = i + 2;
        });
    });
    // tiles outside the map's shape: 0
    Object.keys(rooms).forEach(function (k) {
        const c = map.cells[k + ',0'];
        if (c && c.tile && c.tile.outside) rooms[k] = 0;
    });
    return rooms;
}

// A custom room 4 picture read for the map: the picture with the red of its wall tokens (stamps)
// painted white, so only their badges show (as in the creator), and the tokens - where they are
// (fractions of the picture) and their type index (-1 = random), as the creator finds them
// (R4.findTokens)
function readPicture(img: HTMLImageElement): { picture: CanvasImageSource; tokens: PictureToken[] } {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    const data = g.getImageData(0, 0, c.width, c.height);
    const px = data.data;
    const pw = c.width, ph = c.height;
    const wallAt = function (x: number, y: number) {
        if (x < 0 || y < 0 || x >= pw || y >= ph) return false;
        const i = (y * pw + x) * 4;
        return R4.isWall(px[i], px[i + 1], px[i + 2]);
    };
    const tokens = R4.findTokens(px, pw, ph).map(function (t) {
        // the wall of the picture it stands on (if it is not one of room 4's edges)
        const a = R4.wallAnchor(wallAt, t.cx, t.cy, 1.2 * Math.max(t.maxX - t.minX, t.maxY - t.minY) + 4);
        return { fx: t.cx / pw, fy: t.cy / ph, type: t.type, ax: a ? a.x / pw : null, ay: a ? a.y / ph : null, thick: a ? a.thick / pw : 0 };
    });
    // the token red and its soft edge, one pixel wider so no rim shows when scaled down; never
    // over a wall (marked first, then painted, so the painting does not spread)
    const clear = new Uint8Array(pw * ph);
    let any = false;
    for (let i = 0; i < pw * ph; i++) {
        const j = i * 4;
        if (!(px[j] > px[j + 1] + 40 && px[j] > px[j + 2] + 40)) continue;
        any = true;
        const x = i % pw, y = (i - x) / pw;
        for (let yy = Math.max(0, y - 1); yy <= Math.min(ph - 1, y + 1); yy++) {
            for (let xx = Math.max(0, x - 1); xx <= Math.min(pw - 1, x + 1); xx++) {
                if (!wallAt(xx, yy)) clear[yy * pw + xx] = 1;
            }
        }
    }
    if (!any) return { picture: img, tokens: tokens };
    for (let i = 0; i < pw * ph; i++) {
        if (!clear[i]) continue;
        px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = px[i * 4 + 3] = 255;
    }
    g.putImageData(data, 0, 0);
    return { picture: c, tokens: tokens };
}

function room4Box(rooms: Record<string, number>) {
    const keys = Object.keys(rooms).filter(function (k) { return rooms[k] === 4; });
    if (!keys.length) return null;
    const pts = keys.map(function (k) { return k.split(',').map(Number); });
    const xs = pts.map(function (p) { return p[0]; }), ys = pts.map(function (p) { return p[1]; });
    return { x0: Math.min.apply(null, xs) - 1, y0: Math.min.apply(null, ys) - 1, x1: Math.max.apply(null, xs) + 1, y1: Math.max.apply(null, ys) + 1 };
}

function create(canvas: HTMLCanvasElement, options: ViewOptions = {}): MapView {
    const ctx = canvas.getContext('2d')!;
    let map: MapData | null = null, rooms: Record<string, number> = {}, walls: { segs: Set<string>; arcs: L.Arc[] } = { segs: new Set(), arcs: [] },
        picture: CanvasImageSource | null = null, tokens: PictureToken[] = [];
    // view: cm -> css px is (cm * scale + ox, cm * scale + oy)
    const view = { scale: 4, ox: 20, oy: 20 };
    let cssW = 0, cssH = 0;

    // the map stays fitted to the view (centred, whole) until the user zooms or moves it
    let autoFit = true;

    function resize() {
        const r = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        cssW = Math.max(1, r.width);
        cssH = Math.max(1, r.height);
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (autoFit && map) fit();
        else draw();
    }

    function refresh() {
        if (!map) return;
        rooms = tileRooms(map);
        walls = L.fromCells(map, 0);
    }

    function setMap(m: MapData, keepView?: boolean) {
        map = m;
        refresh();
        picture = null;
        tokens = [];
        if (m.room4CanvasSave && m.area4Room && m.area4Room.type === 1) {
            const img = new Image();
            img.onload = function () { const r = readPicture(img); picture = r.picture; tokens = r.tokens; draw(); };
            img.src = m.room4CanvasSave;
        }
        if (keepView) draw();
        else fit();
    }

    function fit() {
        autoFit = true;
        if (!map) return draw();
        const pad = 24;
        // room kept free on the right (a panel floating over the map), when there is width for it
        const right = options.fitInset ? Math.max(0, options.fitInset()) : 0;
        const free = cssW - right > 0.55 * cssW ? cssW - right : cssW;
        const w = map.width * TILE, h = map.length * TILE;
        view.scale = Math.max(0.5, Math.min((free - 2 * pad) / w, (cssH - 2 * pad) / h));
        view.ox = (free - w * view.scale) / 2;
        view.oy = (cssH - h * view.scale) / 2;
        draw();
        changed();
    }

    function zoomAt(factor: number, px: number, py: number) {
        autoFit = false;
        const s = Math.max(0.5, Math.min(60, view.scale * factor));
        const k = s / view.scale;
        view.ox = px - (px - view.ox) * k;
        view.oy = py - (py - view.oy) * k;
        view.scale = s;
        draw();
        changed();
    }

    function zoom(dir: number) {
        zoomAt(dir > 0 ? 1.25 : 0.8, cssW / 2, cssH / 2);
    }

    function changed() {
        if (options.onView) options.onView({ zoom: view.scale });
    }

    // ---- drawing (all in cm after the view transform) ----
    function tileRect(cx: number, cy: number) {
        return [6 * (cx - 1), 6 * (cy - 1), TILE, TILE];
    }

    function drawFloor() {
        Object.keys(rooms).forEach(function (k) {
            const p = k.split(',').map(Number);
            const r = tileRect(p[0], p[1]);
            if (!rooms[k]) {
                ctx.save();
                ctx.beginPath();
                ctx.rect(r[0], r[1], r[2], r[3]);
                ctx.clip();
                ctx.strokeStyle = 'rgba(100, 116, 139, 0.18)';
                ctx.lineWidth = 0.4;
                ctx.beginPath();
                for (let o = -12; o < 12; o += 3) { ctx.moveTo(r[0] + o, r[1] + 12); ctx.lineTo(r[0] + o + 12, r[1]); }
                ctx.stroke();
                ctx.restore();
                return;
            }
            ctx.fillStyle = ROOM_FILL[rooms[k]];
            ctx.fillRect(r[0], r[1], r[2], r[3]);
        });
    }

    // each tile's own floor: its kind, and its colour (a passage's)
    function drawTileFloors() {
        Object.keys(rooms).forEach(function (k) {
            if (!rooms[k]) return;
            const p = k.split(',').map(Number);
            const r = tileRect(p[0], p[1]);
            const cell = map!.cells[k + ',0'];
            const t = cell && cell.tile;
            if (!t) return;
            // its kind of floor (rules: floors; a hole first, a checkpoint last, should a tile have two):
            // a checkpoint silver, the others in their colour
            const kinds = rulesOf(map!).floors.filter(function (k) { return !!t[k.id]; })
                .sort(function (a, b) { return Number(b.hole) - Number(a.hole) || Number(a.checkpoint) - Number(b.checkpoint); });
            const floor = kinds[0];
            if (floor && floor.checkpoint) {
                const g = ctx.createLinearGradient(r[0] + TILE, r[1] + TILE, r[0], r[1]);
                g.addColorStop(0, '#a5a5a5'); g.addColorStop(0.5, '#e8e8e8'); g.addColorStop(1, '#babac2');
                ctx.fillStyle = g; ctx.fillRect(r[0], r[1], r[2], r[3]);
            } else if (floor) { ctx.fillStyle = floor.color; ctx.fillRect(r[0], r[1], r[2], r[3]); }
            if (t.color) { ctx.fillStyle = t.color; ctx.globalAlpha = 0.75; ctx.fillRect(r[0], r[1], r[2], r[3]); ctx.globalAlpha = 1; }
        });
    }

    function drawGrid() {
        ctx.lineWidth = 1 / view.scale;
        // 6 cm lines inside rooms 2 and 3, where walls can sit on them
        ctx.strokeStyle = 'rgba(100, 116, 139, 0.25)';
        ctx.setLineDash([2 / view.scale, 3 / view.scale]);
        ctx.beginPath();
        Object.keys(rooms).forEach(function (k) {
            if (rooms[k] !== 2 && rooms[k] !== 3) return;
            const p = k.split(',').map(Number);
            const cx = 6 * p[0], cy = 6 * p[1];
            ctx.moveTo(cx, cy - 6); ctx.lineTo(cx, cy + 6);
            ctx.moveTo(cx - 6, cy); ctx.lineTo(cx + 6, cy);
        });
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(100, 116, 139, 0.35)';
        ctx.beginPath();
        Object.keys(rooms).forEach(function (k) {
            if (!rooms[k]) return;
            const p = k.split(',').map(Number);
            ctx.rect(6 * (p[0] - 1), 6 * (p[1] - 1), TILE, TILE);
        });
        ctx.stroke();
    }

    // Room borders, in the colour of the room on each side
    function drawRoomEdges() {
        ctx.lineWidth = 2.5 / view.scale;
        Object.keys(rooms).forEach(function (k) {
            const room = rooms[k];
            if (room <= 1) return;
            const p = k.split(',').map(Number);
            [[2, 0], [-2, 0], [0, 2], [0, -2]].forEach(function (d) {
                const n = (p[0] + d[0]) + ',' + (p[1] + d[1]);
                if (rooms[n] === room) return;
                const ex = 6 * (p[0] + d[0] / 2), ey = 6 * (p[1] + d[1] / 2);
                const inset = 1.5 / view.scale * (d[0] ? -Math.sign(d[0]) : -Math.sign(d[1]));
                ctx.strokeStyle = ROOM_EDGE[room];
                ctx.beginPath();
                if (d[0]) { ctx.moveTo(ex + inset, ey - 6); ctx.lineTo(ex + inset, ey + 6); }
                else { ctx.moveTo(ex - 6, ey + inset); ctx.lineTo(ex + 6, ey + inset); }
                ctx.stroke();
            });
        });
    }

    // The face of room 4's border wall nearest to (px, py) cm within reach: the edges of room 4
    // tiles with no room 4 beside them (their walls are 1 cm thick, centred on the edge)
    function room4EdgeNear(px: number, py: number, reach: number) {
        const tx = 2 * Math.floor(px / 12) + 1, ty = 2 * Math.floor(py / 12) + 1;
        if (rooms[tx + ',' + ty] !== 4) return null;
        let best: { x: number; y: number } | null = null, bestD = reach;
        [[2, 0], [-2, 0], [0, 2], [0, -2]].forEach(function (d) {
            if (rooms[(tx + d[0]) + ',' + (ty + d[1])] === 4) return;
            const ex = 6 * (tx + d[0] / 2), ey = 6 * (ty + d[1] / 2);
            // the face, half a centimetre in from the edge
            const fx = d[0] ? ex - Math.sign(d[0]) * 0.5 : px, fy = d[1] ? ey - Math.sign(d[1]) * 0.5 : py;
            const dist = Math.hypot(fx - px, fy - py);
            if (dist < bestD) { bestD = dist; best = { x: fx, y: fy }; }
        });
        return best as { x: number; y: number } | null;
    }

    function drawRoom4() {
        const box = room4Box(rooms);
        if (!box || !map || !map.area4Room) return;
        const x = 6 * box.x0, y = 6 * box.y0, w = 6 * (box.x1 - box.x0), h = 6 * (box.y1 - box.y0);
        if (picture) {
            // multiplied, so its white floor keeps the room 4 colour underneath; only on the room 4
            // tiles - the picture greys the other tiles of its box (not room 4), which are not its
            ctx.save();
            ctx.beginPath();
            Object.keys(rooms).forEach(function (k) {
                if (rooms[k] !== 4) return;
                const p = k.split(',').map(Number);
                ctx.rect(6 * (p[0] - 1), 6 * (p[1] - 1), 12, 12);
            });
            ctx.clip();
            ctx.globalCompositeOperation = 'multiply';
            ctx.drawImage(picture, x, y, w, h);
            ctx.restore();
            return;
        }
        if (map.area4Room.type >= 2) {
            ctx.fillStyle = 'rgba(117, 0, 255, 0.55)';
            ctx.font = '600 ' + Math.min(6, w / 10) + 'px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(map.area4Room.value, x + w / 2, y + h / 2);
        }
    }

    // The victims of a custom room 4 picture, drawn after the walls so they are always on top
    function drawRoom4Victims() {
        const box = room4Box(rooms);
        if (!box || !map || !map.area4Room || !picture) return;
        const x = 6 * box.x0, y = 6 * box.y0, w = 6 * (box.x1 - box.x0), h = 6 * (box.y1 - box.y0);
        const types = rulesOf(map).tokens.stamps;
        tokens.forEach(function (t) {
            const type = types.find(function (s) { return s.idx === t.type; });
            const c = { cx: x + t.fx * w, cy: y + t.fy * h };
            // against the face of its wall: the picture's, or the edge of room 4 (1 cm) if that is nearer
            let a = t.ax === null || t.ay === null ? null : { x: x + t.ax * w, y: y + t.ay * h, thick: t.thick * w };
            const edge = room4EdgeNear(c.cx, c.cy, 3);
            if (edge && (!a || Math.hypot(edge.x - c.cx, edge.y - c.cy) < Math.hypot(a.x - c.cx, a.y - c.cy))) a = { x: edge.x, y: edge.y, thick: 1 };
            const at = R4.badgeOnWall(c, a, 1.6);
            if (type && (type.kind === 'ct' || type.kind === 'fakect')) ctBadge(at.x, at.y, null, type.color);
            else badge(at.x, at.y, type ? { symbol: type.symbol, face: type.face, color: type.color } : { symbol: '?', color: Icons.FAKE }, !!type && type.kind === 'fake');
        });
    }

    function drawWalls() {
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = WALL;
        ctx.lineCap = 'square';
        ctx.beginPath();
        walls.segs.forEach(function (s) {
            const g = L.parseSeg(s);
            ctx.moveTo(6 * g.i, 6 * g.j);
            if (g.dir === 'v') ctx.lineTo(6 * g.i, 6 * (g.j + 1));
            else ctx.lineTo(6 * (g.i + 1), 6 * g.j);
        });
        ctx.stroke();
        ctx.lineCap = 'butt';
        walls.arcs.forEach(function (a) {
            // quarter q of tile (x, y); the arc's centre is the corner opposite to where it bulges
            const ox = 6 * (a.x - 1) + (a.q % 2) * 6, oy = 6 * (a.y - 1) + Math.floor(a.q / 2) * 6;
            const c = [[0, 6], [0, 0], [6, 0], [6, 6]][a.v - 1];
            if (!c) return;
            const start = [[-Math.PI / 2, 0], [0, Math.PI / 2], [Math.PI / 2, Math.PI], [Math.PI, 1.5 * Math.PI]][a.v - 1];
            ctx.beginPath();
            ctx.arc(ox + c[0], oy + c[1], 6, start[0], start[1]);
            ctx.stroke();
        });
    }

    // Victims and cognitive targets with the icons shared with the room 4 creator (SimIcons)
    // a victim in the colour of its type (lib/icons), hollow when it is a fake
    function badge(x: number, y: number, glyph: Glyph, fake?: boolean | number) {
        Icons.victim(ctx, x, y, 1.6, glyph.symbol, glyph.color || (fake ? Icons.FAKE : Icons.VICTIM), 0.25, glyph.face, !!fake);
    }

    // on the map a cognitive target shows its type's mark: its own rings would be too small to see
    function ctBadge(x: number, y: number, code: string | null, color?: string) {
        Icons.targetMark(ctx, x, y, 1.6, code, color as string, 0.25);
    }

    function drawVictims() {
        const cells = map!.cells;
        Object.keys(cells).forEach(function (key) {
            const p = key.split(',').map(Number);
            const cell = cells[key];
            if (p[2] !== 0 || !cell.tile || p[0] % 2 !== 1 || p[1] % 2 !== 1) return;
            const t = cell.tile, cx = 6 * p[0], cy = 6 * p[1];
            const side: Record<string, number[]> = { top: [0, -4], right: [4, 0], bottom: [0, 4], left: [-4, 0] };
            Object.keys(side).forEach(function (d) {
                const code = t.cognitives && t.cognitives[d + '_code'];
                const v = t.victims && t.victims[d];
                if (!v && !code) return;
                // where it is along its wall (lib/model's victimPlace)
                const off = Number(t.victim_offset) || 0;
                const x = cx + side[d][0] + (side[d][0] ? 0 : off), y = cy + side[d][1] + (side[d][0] ? off : 0);
                if (code) { ctBadge(x, y, code); return; }
                badge(x, y, edgeGlyph(map!, v as string), t.victim_is_fake);
            });
            for (let i = 0; i < 16; i++) {
                const v = t.halfWallVic && t.halfWallVic[i];
                const code = t.halfWallCognitives && t.halfWallCognitives[i];
                if ((!v || v == 0) && !code) continue;
                // on its wall, where it is along it: beside the face of the arc in a curved quarter, joined
                // to it (as room 4 shows)
                const pt = L.slotPoint(p[0], p[1], i, t.curve, t.halfWallVicOffsets ? Number(t.halfWallVicOffsets[i]) || 0 : 0);
                if (pt.curved) {
                    ctx.save();
                    ctx.strokeStyle = '#475569';
                    ctx.lineWidth = 0.35;
                    ctx.beginPath();
                    ctx.moveTo(pt.at[0], pt.at[1]);
                    ctx.lineTo(pt.wall[0], pt.wall[1]);
                    ctx.stroke();
                    ctx.restore();
                }
                if (code) { ctBadge(pt.at[0], pt.at[1], code); continue; }
                badge(pt.at[0], pt.at[1], slotGlyph(map!, String(v)), t.halfWallVicFakes && t.halfWallVicFakes[i]);
            }
        });
    }

    function drawStart() {
        const st = map!.startTile;
        if (!st || st.z != 0 || !(st.x > 0)) return;
        const r = tileRect(st.x, st.y);
        ctx.strokeStyle = '#16a34a';
        ctx.lineWidth = 1;
        ctx.strokeRect(r[0] + 1.5, r[1] + 1.5, r[2] - 3, r[3] - 3);
    }

    function draw() {
        refresh();
        ctx.save();
        ctx.setTransform(canvas.width / cssW, 0, 0, canvas.height / cssH, 0, 0);
        ctx.fillStyle = '#eef2f7';
        ctx.fillRect(0, 0, cssW, cssH);
        if (map) {
            ctx.translate(view.ox, view.oy);
            ctx.scale(view.scale, view.scale);
            drawFloor();
            if (options.underlay) options.underlay(ctx, { scale: view.scale });
            drawTileFloors();
            if (options.overFloor) options.overFloor(ctx, { scale: view.scale });
            drawGrid();
            drawRoom4();
            drawRoomEdges();
            drawStart();
            drawWalls();
            drawRoom4Victims();
            drawVictims();
            if (options.overlay) options.overlay(ctx, { scale: view.scale, rooms: rooms });
        }
        ctx.restore();
    }

    // ---- input: wheel zooms at the pointer; the tool gets the pointer in cm, and dragging pans
    // with the hand tool, the middle button or Space held down ----
    let drag: { pan: boolean; x?: number; y?: number; ox?: number; oy?: number } | null = null, space = false;
    const tool: ViewTool = options.tool || {};
    function toCm(e: MouseEvent) {
        const r = canvas.getBoundingClientRect();
        return { x: (e.clientX - r.left - view.ox) / view.scale, y: (e.clientY - r.top - view.oy) / view.scale };
    }
    canvas.addEventListener('wheel', function (e) {
        e.preventDefault();
        const r = canvas.getBoundingClientRect();
        zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    canvas.addEventListener('pointerdown', function (e) {
        canvas.setPointerCapture(e.pointerId);
        const pan = e.button === 1 || space || (tool.pans && tool.pans());
        if (pan) {
            drag = { pan: true, x: e.clientX, y: e.clientY, ox: view.ox, oy: view.oy };
            canvas.classList.add('panning');
        } else if (e.button === 0 && map && tool.down) {
            drag = { pan: false };
            tool.down(toCm(e), e);
        }
        e.preventDefault();
    });
    canvas.addEventListener('pointermove', function (e) {
        if (drag && drag.pan) {
            autoFit = false;
            view.ox = drag.ox! + e.clientX - drag.x!;
            view.oy = drag.oy! + e.clientY - drag.y!;
            draw();
        } else if (map && tool.move) {
            tool.move(toCm(e), !!drag, e);
        }
    });
    const end = function (e: PointerEvent) {
        const was = drag;
        drag = null;
        canvas.classList.remove('panning');
        if (was && !was.pan && tool.up) tool.up(toCm(e), e);
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', function () {
        const was = drag;
        drag = null;
        canvas.classList.remove('panning');
        if (was && !was.pan && tool.cancel) tool.cancel();
    });
    canvas.addEventListener('pointerleave', function () { if (!drag && tool.leave) tool.leave(); });
    window.addEventListener('keydown', function (e) {
        if (e.code === 'Space' && !/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName)) { space = true; canvas.classList.add('pan-ready'); e.preventDefault(); }
    });
    window.addEventListener('keyup', function (e) {
        if (e.code === 'Space') { space = false; canvas.classList.remove('pan-ready'); }
    });
    // the canvas changes size with the page and when the side panel comes or goes
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(function () { resize(); }).observe(canvas);
    else window.addEventListener('resize', resize);
    resize();

    return {
        setMap: setMap, fit: fit, zoom: zoom, redraw: draw, resize: resize,
        fitIfAuto: function () { if (autoFit) fit(); else draw(); },
        scale: function () { return view.scale; },
        toPx: function (x: number, y: number): [number, number] { return [x * view.scale + view.ox, y * view.scale + view.oy]; },
        showCm: function (x: number, y: number) {   // centres the view on (x, y) cm, zoomed in
            autoFit = false;
            view.scale = Math.max(view.scale, 12);
            view.ox = cssW / 2 - x * view.scale;
            view.oy = cssH / 2 - y * view.scale;
            draw();
            changed();
        },
        tileRooms: function () { return rooms; },
        wallCount: function () { return walls.segs.size + walls.arcs.length; }
    };
}

export {
    create,
    tileRooms

};
