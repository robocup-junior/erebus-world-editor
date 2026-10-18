// Editing a map for the new Simulation 2026 editor (beta): the map is kept in the format of the
// Simulation 2026 editor (cells, roomTiles, startTile, area4Room ...), so either editor opens it.
// Coordinates are the map's cell coordinates (tiles at odd x and y). Needs SimLattice and
// SimWorld2026.
import type { MapData, Cell, Tile, Pt } from './types';
import * as L from './lattice';
import * as W from './world2026';
import * as R4 from './room4';
import type { RoomPassage, WorldHooks } from './world2026';
import { rulesOf, FIRST_YEAR, LATEST_YEAR } from '../rules/registry';
import type { TokenKind } from '../rules/types';

// What a map's year takes (rules/registry): the walls of each room, the victims, the sizes, the
// world file. Everything below asks it of the map, and never asks for a year.
export { rulesOf };

// A placed victim: on a side of a tile (rooms 1 and 4), or in slot i of a room 2 / 3 tile
export type Where = { kind: 'edge'; x: number; y: number; dir: string } | { kind: 'slot'; x: number; y: number; i: number };
// What is there: type H, S, U or CT (code: its ring code), fake, turn (degrees)
export interface VictimInfo { dir?: string; type: string; value?: any; code: string; fake: boolean; rot?: number }
// offset: where along its wall (cm from the middle of its face; left as it is when not given)
interface VictimOpts { code?: string; rot?: number; offset?: number }
// Tiles by their indices, both ends in
export interface Region { x0: number; y0: number; x1: number; y1: number }
export interface Clip { w: number; h: number; cells: Record<string, Cell>; rooms: Record<string, number> }
// The edge between two tiles of different rooms
interface Border { a: Pt; b: Pt; ra: number; rb: number; pass: RoomPassage }
// What a problem is about, to point out on the map
export interface Show { tiles?: number[][]; points?: number[][]; segs?: string[]; arcs?: L.Arc[] }
export interface Problem { key: string; params?: any; block?: boolean; at?: number[] | null; show?: Show }
interface Quarter { x: number; y: number; q: number; v?: number; rule?: { ok: boolean; reason?: string } }
export interface Slot { x: number; y: number; i: number }
interface Reach {
    res: number; gw: number; gh: number; reached: Uint8Array; miss: Uint8Array; pocketCount: number;
    pocketAt: (x: number, y: number) => boolean; victims: number[][];
    // whether the robot would get to a victim of tile (x, y) at `at` on the wall at `wall` (one in a
    // room left out is not looked at: got to)
    gotTo: (x: number, y: number, at: Pt, wall: Pt) => boolean;
}
// A custom room 4 picture as the checks read it: its size, its wall pixels (summed: wallSum[(y) * (w
// + 1) + x] counts the walls above and left of (x, y), so a box of them is counted at once) and its
// stamps (centre as fractions of the picture, scoring type 0-10; -1: a red with no type set)
export interface Room4Picture { w: number; h: number; wallSum: Int32Array; tokens: { fx: number; fy: number; type: number }[] }

function readRoom4Picture(px: ArrayLike<number>, w: number, h: number): Room4Picture {
    const sum = new Int32Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) {
        let row = 0;
        for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            if (R4.isWall(px[i], px[i + 1], px[i + 2])) row++;
            sum[(y + 1) * (w + 1) + x + 1] = sum[y * (w + 1) + x + 1] + row;
        }
    }
    const tokens = R4.findTokens(px, w, h).map(function (t) { return { fx: t.cx / w, fy: t.cy / h, type: t.type }; });
    return { w: w, h: h, wallSum: sum, tokens: tokens };
}

// Where the room 4 picture lies on the map (cm), with the room's tile box; null if it has none
function room4Place(map: MapData) {
    if (!map.area4Room || map.area4Room.type !== 1) return null;
    const r = W.room4Region(map);
    if (!r) return null;
    return { x0: 12 * r.minX, y0: 12 * r.minY, w: 12 * (r.maxX - r.minX + 1), h: 12 * (r.maxY - r.minY + 1) };
}

// The stamps of the room 4 picture the robot cannot identify (as the room 4 creator tells them):
// none of the places its centre gets to is within half a tile of the stamp, or its body never
// covers the stamp's side of the wall. Their indices in picture.tokens, and places in cm.
function room4Unreached(map: MapData, picture: Room4Picture, reach: Reach): { index: number; at: number[] }[] {
    const place = room4Place(map);
    if (!place) return [];
    const g = rulesOf(map).geometry;
    const res = reach.res, need = g.robotRadiusCm / res, R = Math.ceil(need + 0.5);
    const out: { index: number; at: number[] }[] = [];
    picture.tokens.forEach(function (t, index) {
        const cx = place.x0 + t.fx * place.w, cy = place.y0 + t.fy * place.h;
        const gx = Math.round(cx / res), gy = Math.round(cy / res);
        let d = Infinity;
        for (let j = gy - R; j <= gy + R; j++) {
            for (let i = gx - R; i <= gx + R; i++) {
                if (i < 0 || j < 0 || i >= reach.gw || j >= reach.gh || !reach.reached[j * reach.gw + i]) continue;
                d = Math.min(d, Math.hypot(i - gx, j - gy));
            }
        }
        if (d * res > g.identifyCm || d > need + 0.5) out.push({ index: index, at: [cx, cy] });
    });
    return out;
}

const SIDES: Record<string, Pt> = { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] };
const FLOORS = ['black', 'swamp', 'checkpoint'];

function key(x: number, y: number) {
    return x + ',' + y + ',0';
}

function inMap(map: MapData, x: number, y: number) {
    return x > 0 && y > 0 && x < 2 * map.width && y < 2 * map.length;
}

function tileOf(map: MapData, x: number, y: number): Tile | undefined {
    const cell = map.cells[key(x, y)];
    return cell && cell.tile;
}

// A tile cell with the arrays the editors and the export expect
function ensureTile(map: MapData, x: number, y: number): Tile & Required<Pick<Tile, 'curve' | 'halfWallIn' | 'halfWallVic' | 'halfWallVicRots' | 'halfWallVicFakes' | 'halfWallCognitives'>> {
    let cell = map.cells[key(x, y)];
    if (!cell) cell = map.cells[key(x, y)] = { isTile: true, tile: {} };
    cell.isTile = true;
    const t = cell.tile || (cell.tile = {});
    if (t.changeFloorTo === undefined) t.changeFloorTo = 0;
    if (!t.curve) t.curve = [0, 0, 0, 0];
    if (!t.halfWallIn) t.halfWallIn = [0, 0, 0, 0];
    if (!t.halfWallVic) t.halfWallVic = [];
    if (!t.halfWallVicRots) t.halfWallVicRots = [];
    if (!t.halfWallVicFakes) t.halfWallVicFakes = [];
    if (!t.halfWallCognitives) t.halfWallCognitives = [];
    return t as any;
}

function ensureTiles(map: MapData) {
    for (let x = 1; x < 2 * map.width; x += 2) for (let y = 1; y < 2 * map.length; y += 2) ensureTile(map, x, y);
}

function setEdge(map: MapData, ex: number, ey: number, wall: boolean) {
    const cell = map.cells[key(ex, ey)] || (map.cells[key(ex, ey)] = {});
    cell.isWall = !!wall;
    cell.halfWall = 0;
}

// A tile can be outside the map's shape (tile.outside, kept only by this editor): the map does not
// have to be a rectangle. Outside tiles get no floor in the world (the robot cannot reach them).
function isOutside(map: MapData, x: number, y: number) {
    const t = tileOf(map, x, y);
    return !!(t && t.outside);
}

function isInside(map: MapData, x: number, y: number) {
    return inMap(map, x, y) && !isOutside(map, x, y);
}

// The two tiles beside the edge cell (ex, ey)
function edgeTiles(ex: number, ey: number): Pt[] {
    return ex % 2 === 0 ? [[ex - 1, ey], [ex + 1, ey]] : [[ex, ey - 1], [ex, ey + 1]];
}

// The outer walls: edges with the map on one side only (around the rectangle and its outside tiles)
function isOuterEdge(map: MapData, ex: number, ey: number) {
    if ((ex + ey) % 2 !== 1) return false;
    const t = edgeTiles(ex, ey);
    return isInside(map, t[0][0], t[0][1]) !== isInside(map, t[1][0], t[1][1]);
}

// The outer walls are always there (as the classic editor's "outer walls" button makes them)
function outerWalls(map: MapData) {
    syncBorderWalls(map, new Set());
}

function newMap(width: number, length: number): MapData {
    const map: MapData = {
        name: 'New world', length: length, height: 1, width: width, finished: true,
        startTile: { x: 0, y: 0, z: 0 }, cells: {}, roomTiles: [[], [], []], time: 480,
        area4Room: W.area4Presets()[0], room4CanvasSave: null, room4VicTypes: [], connCheckOff: false,
        rules: LATEST_YEAR
    };
    ensureTiles(map);
    outerWalls(map);
    return map;
}

// Fills in what an older or hand-made map may lack, so the editing below can rely on it
function normalize(map: MapData) {
    if (!map.roomTiles) map.roomTiles = [[], [], []];
    while (map.roomTiles.length < 3) map.roomTiles.push([]);
    if (!map.startTile) map.startTile = { x: 0, y: 0, z: 0 };
    if (!map.area4Room || typeof map.area4Room !== 'object') map.area4Room = W.area4Presets()[0];
    if (!map.height) map.height = 1;
    // a map file from before maps kept their year
    if (!map.rules) map.rules = FIRST_YEAR;
    ensureTiles(map);
    return map;
}

// Changes the size, keeping what fits (cells, rooms, the start tile) and the outer walls
function resize(map: MapData, width: number, length: number) {
    width = Math.max(1, Math.min(40, Math.round(width)));
    length = Math.max(1, Math.min(40, Math.round(length)));
    // the old outer walls go where the map now carries on, and new ones come on its new border
    const before = borderEdges(map);
    map.width = width;
    map.length = length;
    Object.keys(map.cells).forEach(function (k) {
        const p = k.split(',').map(Number);
        if (p[0] > 2 * width || p[1] > 2 * length) delete map.cells[k];
    });
    map.roomTiles = map.roomTiles.map(function (list) {
        return list.filter(function (k) { const p = k.split(',').map(Number); return p[0] < 2 * width && p[1] < 2 * length; });
    });
    const st = map.startTile;
    if (st.x >= 2 * width || st.y >= 2 * length) map.startTile = { x: 0, y: 0, z: 0 };
    ensureTiles(map);
    syncBorderWalls(map, before);
}

// ---- Rooms -----------------------------------------------------------------------------------

// 1-4, or 0 outside the map (beyond it, or an outside tile)
function roomOf(map: MapData, x: number, y: number) {
    if (!isInside(map, x, y)) return 0;
    const k = key(x, y);
    for (let i = 0; i < 3; i++) if ((map.roomTiles[i] || []).indexOf(k) > -1) return i + 2;
    return 1;
}

function roomMap(map: MapData): Record<string, number> {
    const rooms: Record<string, number> = {};
    for (let x = 1; x < 2 * map.width; x += 2) for (let y = 1; y < 2 * map.length; y += 2) rooms[x + ',' + y] = 1;
    map.roomTiles.forEach(function (list, i) {
        list.forEach(function (k) {
            const p = k.split(',');
            if (p[2] === '0' && (p[0] + ',' + p[1]) in rooms) rooms[p[0] + ',' + p[1]] = i + 2;
        });
    });
    Object.keys(rooms).forEach(function (k) {
        const p = k.split(',').map(Number);
        if (isOutside(map, p[0], p[1])) rooms[k] = 0;
    });
    return rooms;
}

function roomLookup(map: MapData) {
    const rooms = roomMap(map);
    return function (x: number, y: number) { return rooms[x + ',' + y] || 0; };
}

// Puts the tile at (x, y) into a room (1 = no room list), or outside the map (0). A tile leaves
// behind the walls its new room does not take (rules: rooms): inner walls and half walls on its
// edges, curves. An outside tile loses everything on it. Returns whether anything changed.
function setRoom(map: MapData, x: number, y: number, room: number) {
    if (!inMap(map, x, y) || roomOf(map, x, y) === room) return false;
    const k = key(x, y);
    map.roomTiles = map.roomTiles.map(function (list) { return list.filter(function (t) { return t !== k; }); });
    if (room >= 2) map.roomTiles[room - 2].push(k);
    const t = ensureTile(map, x, y);
    if (room === 0) {
        t.outside = true;
        FLOORS.forEach(function (f) { t[f] = false; });
        t.color = '';
        t.victims = {};
        t.cognitives = {};
        t.victim_is_fake = false;
        const st = map.startTile;
        if (st && st.x === x && st.y === y) map.startTile = { x: 0, y: 0, z: 0 };
    } else {
        delete t.outside;
    }
    // the room it goes into (an outside tile takes nothing)
    const takes = rulesOf(map).rooms[room] || { edges: 'whole', inner: false, curves: false, picture: false, tokens: 'edge' };
    t.halfTile = takes.inner ? 1 : 0;
    if (!takes.curves) t.curve = [0, 0, 0, 0];
    if (!takes.inner) {
        t.halfWallIn = [0, 0, 0, 0];
        t.halfWallVic = [];
        t.halfWallVicFakes = [];
        t.halfWallVicRots = [];
        t.halfWallCognitives = [];
        Object.keys(SIDES).forEach(function (d) {
            const e = map.cells[key(x + SIDES[d][0], y + SIDES[d][1])];
            if (e && !e.isWall && e.halfWall) e.halfWall = 0;
        });
    }
    return true;
}

// ---- Walls on room borders -------------------------------------------------------------------
// Where two rooms meet there is a wall, except at a passage: a tile in the passage colour of the
// two rooms opens onto the other room. A room 4 preset brings its own walls, so its border gets
// none. The editor keeps the set it made and, after each change of rooms or passages, adds the
// walls of new borders and takes away those of borders that are gone.

function passageFor(a: number, b: number): RoomPassage | undefined {
    return W.ROOM_PASSAGES.find(function (p) { return (p.from === a && p.to === b) || (p.from === b && p.to === a); });
}

// The edges that get a wall by themselves: the outer walls (the map on one side only) and the
// room borders that are not passages
function borderEdges(map: MapData) {
    const room = roomLookup(map);
    const preset = map.area4Room && map.area4Room.type >= 2;
    const edges = new Set<string>();
    const check = function (ex: number, ey: number) {
        const t = edgeTiles(ex, ey);
        const ra = room(t[0][0], t[0][1]), rb = room(t[1][0], t[1][1]);
        if (ra === rb) return;
        if (!ra || !rb) { edges.add(ex + ',' + ey); return; }
        if (preset && (ra === 4 || rb === 4)) return;
        const color = passageFor(ra, rb)!.color;
        const ta = tileOf(map, t[0][0], t[0][1]), tb = tileOf(map, t[1][0], t[1][1]);
        if ((ta && ta.color === color) || (tb && tb.color === color)) return;
        edges.add(ex + ',' + ey);
    };
    for (let ex = 0; ex <= 2 * map.width; ex += 2) for (let ey = 1; ey < 2 * map.length; ey += 2) check(ex, ey);
    for (let ex = 1; ex < 2 * map.width; ex += 2) for (let ey = 0; ey <= 2 * map.length; ey += 2) check(ex, ey);
    return edges;
}

// Whether tile (x, y) is a passage between rooms (in a passage colour): the rules may keep victims
// out of it (rules: tokens.inPassages)
function isPassage(map: MapData, x: number, y: number) {
    const t = tileOf(map, x, y);
    return !!(t && t.color && W.ROOM_PASSAGES.some(function (p: RoomPassage) { return p.color === t.color; }));
}

// A passage tile that no longer lies between its two rooms loses its colour: it has to be in one
// of them and touch the other
function prunePassages(map: MapData) {
    let n = 0;
    for (let x = 1; x < 2 * map.width; x += 2) {
        for (let y = 1; y < 2 * map.length; y += 2) {
            const t = tileOf(map, x, y);
            const pass = t && t.color && W.ROOM_PASSAGES.find(function (p) { return p.color === t.color; });
            if (!pass) continue;
            const own = roomOf(map, x, y);
            const other = own === pass.from ? pass.to : own === pass.to ? pass.from : 0;
            const touches = other && Object.keys(SIDES).some(function (d) {
                return roomOf(map, x + 2 * SIDES[d][0], y + 2 * SIDES[d][1]) === other;
            });
            if (!touches) { t!.color = ''; n++; }
        }
    }
    return n;
}

// The new editor makes room 4 only as a picture (custom): it is custom as soon as it has tiles,
// and none without. A preset (from a map of the classic editor) stays until it is switched.
function syncArea4(map: MapData) {
    const type = map.area4Room && map.area4Room.type;
    if (type >= 2) return;
    const want = (map.roomTiles[2] || []).length ? 1 : 0;
    if (type !== want) map.area4Room = W.area4Presets()[want];
}

// Rule 3.5.3: a checkpoint right behind each passage into area 4. The room 4 tile inside each
// passage becomes a checkpoint by itself (tile.cpAuto marks it); one set so that no passage needs
// any more goes again. A checkpoint set by hand stays.
function room4Checkpoints(map: MapData) {
    const need: Record<string, boolean> = {};
    if (map.area4Room && map.area4Room.type === 1) {
        W.mapGeometry(map).entrances.forEach(function (e: any) {
            if (e.passage) need[(2 * e.tile[0] + 1) + ',' + (2 * e.tile[1] + 1)] = true;
        });
    }
    for (let x = 1; x < 2 * map.width; x += 2) {
        for (let y = 1; y < 2 * map.length; y += 2) {
            const t = tileOf(map, x, y);
            if (!t) continue;
            if (need[x + ',' + y]) {
                if (!t.checkpoint) { FLOORS.forEach(function (f) { t[f] = false; }); t.checkpoint = true; t.cpAuto = true; }
            } else if (t.cpAuto) {
                t.checkpoint = false;
                delete t.cpAuto;
            }
        }
    }
}

function syncBorderWalls(map: MapData, before: Set<string>): Set<string> {
    syncArea4(map);
    prunePassages(map);
    const after = borderEdges(map);
    after.forEach(function (e) {
        if (before.has(e)) return;
        const p = e.split(',').map(Number);
        setEdge(map, p[0], p[1], true);
    });
    before.forEach(function (e) {
        if (after.has(e)) return;
        const p = e.split(',').map(Number);
        if (p[0] <= 2 * map.width && p[1] <= 2 * map.length) setEdge(map, p[0], p[1], false);
    });
    room4Checkpoints(map);
    return after;
}

// After a change that may have taken walls off borders (pasting, moving, rows / columns): every
// border edge gets its wall again, and the walls of borders that are gone come off
function resyncBorderWalls(map: MapData, before: Set<string>): Set<string> {
    syncArea4(map);
    prunePassages(map);
    const after = borderEdges(map);
    after.forEach(function (e) {
        const p = e.split(',').map(Number);
        setEdge(map, p[0], p[1], true);
    });
    before.forEach(function (e) {
        if (after.has(e)) return;
        const p = e.split(',').map(Number);
        if (p[0] <= 2 * map.width && p[1] <= 2 * map.length) setEdge(map, p[0], p[1], false);
    });
    room4Checkpoints(map);
    return after;
}

// The edge (ex, ey) between two tiles of different rooms: its two tiles, rooms and passage
function borderAt(map: MapData, ex: number, ey: number): Border | null {
    if ((ex + ey) % 2 !== 1) return null;
    const t = edgeTiles(ex, ey);
    const ra = roomOf(map, t[0][0], t[0][1]), rb = roomOf(map, t[1][0], t[1][1]);
    if (!ra || !rb || ra === rb) return null;
    return { a: t[0], b: t[1], ra: ra, rb: rb, pass: passageFor(ra, rb)! };
}

// The tile of a border that takes the passage colour when `side` ([x, y], one of its two tiles)
// is asked for: that one, except in room 4 - a preset or a picture - whose entrances lie outside it
function passageSide(map: MapData, b: Border, side?: Pt | null): Pt {
    let pick = side && side[0] === b.b[0] && side[1] === b.b[1] ? 'b' : side ? 'a' : (b.ra < b.rb ? 'a' : 'b');
    if ((pick === 'a' ? b.ra : b.rb) === 4) pick = pick === 'a' ? 'b' : 'a';
    return pick === 'a' ? b.a : b.b;
}

// At a border edge: opens a passage with its colour on the side asked for (by default the
// lower room number), moves it there from the other side, or closes it when it is there already.
// Returns 'open', 'moved', 'closed' or '' (not a border).
function togglePassage(map: MapData, ex: number, ey: number, side?: Pt | null): string {
    const b = borderAt(map, ex, ey);
    if (!b) return '';
    const want = passageSide(map, b, side);
    const ta = ensureTile(map, b.a[0], b.a[1]), tb = ensureTile(map, b.b[0], b.b[1]);
    const target = want === b.a ? ta : tb, other = want === b.a ? tb : ta;
    if (target.color === b.pass.color) { target.color = ''; return 'closed'; }
    const moved = other.color === b.pass.color;
    if (moved) other.color = '';
    target.color = b.pass.color;
    return moved ? 'moved' : 'open';
}

// Takes the passage colour off the tile at (x, y)
function clearPassage(map: MapData, x: number, y: number) {
    const t = tileOf(map, x, y);
    if (!t || !t.color || !W.ROOM_PASSAGES.some(function (p: RoomPassage) { return p.color === t.color; })) return false;
    t.color = '';
    return true;
}

// ---- Walls -------------------------------------------------------------------------------------

// The unit segments that would go in for `segs`, by the rules of the rooms they touch: beside
// room 1 a segment takes its whole tile edge with it. { ok: [...], bad: [...] }
function wallPlan(map: MapData, segs: string[]) {
    const room = roomLookup(map);
    const ok = new Set<string>(), bad = new Set<string>();
    segs.forEach(function (s) {
        const rule = L.segRule(s, room, rulesOf(map).rooms);
        if (!rule.ok) { bad.add(s); return; }
        ok.add(s);
        if (rule.whole) ok.add(L.otherHalf(s)!);
    });
    return { ok: Array.from(ok), bad: Array.from(bad).filter(function (s) { return !ok.has(s); }) };
}

function isOuterSeg(map: MapData, seg: string) {
    const at = L.place(seg);
    const p = at.cell.split(',').map(Number);
    return at.kind === 'edge' && isOuterEdge(map, p[0], p[1]);
}

function setWalls(map: MapData, segs: string[], on: boolean) {
    let n = 0;
    segs.forEach(function (s) {
        if (isOuterSeg(map, s) || L.hasSeg(map, s) === !!on) return;
        L.setSeg(map, s, on);
        n++;
    });
    return n;
}

// The unit segment nearest to (x, y) cm within `reach` cm, outer walls left out
function segNear(map: MapData, x: number, y: number, reach: number): string | null {
    const walls = L.fromCells(map);
    let best: string | null = null, bestD = reach;
    walls.segs.forEach(function (s) {
        if (isOuterSeg(map, s)) return;
        const g = L.parseSeg(s);
        const x1 = 6 * g.i, y1 = 6 * g.j, x2 = g.dir === 'v' ? x1 : x1 + 6, y2 = g.dir === 'v' ? y1 + 6 : y1;
        const t = Math.max(0, Math.min(1, ((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) / 36));
        const d = Math.hypot(x - x1 - t * (x2 - x1), y - y1 - t * (y2 - y1));
        if (d < bestD) { bestD = d; best = s; }
    });
    return best;
}

// ---- Floors and victims ------------------------------------------------------------------------

// kind: black, swamp, checkpoint (each turns the others off; again turns it off), start, clear
function setFloor(map: MapData, x: number, y: number, kind: string) {
    if (!isInside(map, x, y)) return false;
    if (kind === 'start') {
        map.startTile = { x: x, y: y, z: 0 };
        return true;
    }
    const t = ensureTile(map, x, y);
    const was = !!t[kind];
    FLOORS.forEach(function (f) { t[f] = false; });
    if (kind !== 'clear') t[kind] = !was;
    delete t.cpAuto;
    return true;
}

// The floor of tile (x, y) as `kind` ('black', 'swamp', 'checkpoint', or '' for none): set, not
// switched as setFloor does (the room 4 creator gives the floors it ends with). Whether it changed.
function setFloorKind(map: MapData, x: number, y: number, kind: string) {
    if (!isInside(map, x, y)) return false;
    const now = tileOf(map, x, y);
    if (FLOORS.every(function (f) { return !!(now && now[f]) === (f === kind); })) return false;
    const t = ensureTile(map, x, y);
    FLOORS.forEach(function (f) { t[f] = f === kind; });
    delete t.cpAuto;
    return true;
}

// The floor kind of tile (x, y): 'black', 'swamp', 'checkpoint' or ''
function floorKind(map: MapData, x: number, y: number) {
    const t = tileOf(map, x, y);
    return (t && FLOORS.find(function (f) { return !!t[f]; })) || '';
}

function hasWall(map: MapData, x: number, y: number, dir: string) {
    const e = map.cells[key(x + SIDES[dir][0], y + SIDES[dir][1])];
    return !!(e && e.isWall);
}

// The kind of victim `id` names, among the map's year's (rules: tokens.kinds)
function tokenKind(map: MapData, id: string): TokenKind | null {
    return rulesOf(map).tokens.kinds.find(function (k) { return k.id === id; }) || null;
}
// The ring target kind of the map's year (in the map file, a token with a ring code is one)
function targetKind(map: MapData): TokenKind | null {
    return rulesOf(map).tokens.kinds.find(function (k) { return k.family === 'target'; }) || null;
}
function isTarget(map: MapData, id: string) {
    const k = tokenKind(map, id);
    return !!k && k.family === 'target';
}
// The kind a letter on a tile side, or a value of a 6 cm face, stands for in the map file
function kindByEdge(map: MapData, letter: string) {
    const k = rulesOf(map).tokens.kinds.find(function (k) { return k.edge === letter; });
    return k ? k.id : letter;
}
function kindBySlot(map: MapData, value: string) {
    const k = rulesOf(map).tokens.kinds.find(function (k) { return k.slot === value; });
    return k ? k.id : '';
}

function edgeVictim(map: MapData, x: number, y: number): (VictimInfo & { dir: string }) | null {
    const t = tileOf(map, x, y);
    if (!t) return null;
    for (const d of Object.keys(SIDES)) {
        const v = t.victims && t.victims[d];
        const code = t.cognitives && t.cognitives[d + '_code'];
        if (v || code) {
            const target = code ? targetKind(map) : null;
            return { dir: d, type: target ? target.id : v ? kindByEdge(map, v) : '', code: code || '', fake: !!t.victim_is_fake };
        }
    }
    return null;
}

// A victim on the wall at side `dir` of the tile, in a room whose victims go on tile sides (rules:
// rooms); a tile holds one (as in the classic editor). Victims of rooms whose victims go on the
// 6 cm faces are in slots (setSlotVictim), those of a picture in the picture.
function victimRule(map: MapData, x: number, y: number, dir: string): { ok: boolean; reason?: string } {
    if (!isInside(map, x, y)) return { ok: false, reason: 'outside' };
    const rules = rulesOf(map), takes = rules.rooms[roomOf(map, x, y)];
    if (takes.tokens === 'picture') return { ok: false, reason: 'room4' };
    if (isPassage(map, x, y) && !rules.tokens.inPassages) return { ok: false, reason: 'passage' };
    if (takes.tokens === 'slot') return { ok: false, reason: 'quarterTile' };
    if (!hasWall(map, x, y, dir)) return { ok: false, reason: 'noWall' };
    return { ok: true };
}

// type: a kind of the map's year (rules: tokens.kinds; 2026: H, S, U letters, CT a cognitive target:
// opts.code = its ring code, K R Y G B from the outside in, as Erebus draws it); opts.rot = the turn
// of the token in degrees
function setVictim(map: MapData, x: number, y: number, dir: string, type: string, fake?: boolean, opts?: VictimOpts) {
    opts = opts || {};
    const kind = tokenKind(map, type);
    if (!kind || !victimRule(map, x, y, dir).ok) return false;
    const t = ensureTile(map, x, y);
    t.victims = {};
    t.cognitives = {};
    if (kind.family === 'target') {
        // the classic editor keeps the letter of a valid code beside it (scores read it)
        const letter = rulesOf(map).tokens.target.typeOf(opts.code);
        t.cognitives![dir + '_code'] = opts.code;
        if (letter) t.victims![dir] = letter;
        t.victim_is_fake = false;
    } else {
        t.victims![dir] = kind.edge || kind.id;
        t.victim_is_fake = !!fake && kind.fakeable;
    }
    t.single_victim_rotation = opts.rot || 0;
    if (opts.offset !== undefined) setOffsetValue(t, null, opts.offset);
    return true;
}

function clearVictim(map: MapData, x: number, y: number) {
    const t = tileOf(map, x, y);
    if (!t || !edgeVictim(map, x, y)) return false;
    t.victims = {};
    t.cognitives = {};
    t.victim_is_fake = false;
    delete t.victim_offset;
    return true;
}

// ---- Curves (room 3) ----------------------------------------------------------------------------
// Quarter q (NW, NE, SW, SE) of tile (x, y) takes one quarter circle of radius 6 cm; its value v
// names where it bulges (1 NE, 2 SE, 3 SW, 4 NW), so its centre is the opposite corner.

function quarterAt(map: MapData, px: number, py: number): Quarter | null {
    const tx = Math.floor(px / 12), ty = Math.floor(py / 12);
    if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.length) return null;
    const q = (py - 12 * ty >= 6 ? 2 : 0) + (px - 12 * tx >= 6 ? 1 : 0);
    return { x: 2 * tx + 1, y: 2 * ty + 1, q: q };
}

function arcCentre(x: number, y: number, q: number, v: number): Pt {
    const ox = 6 * (x - 1) + (q % 2) * 6, oy = 6 * (y - 1) + Math.floor(q / 2) * 6;
    const c = [[0, 6], [0, 0], [6, 0], [6, 6]][v - 1];
    return [ox + c[0], oy + c[1]];
}

function arcDistance(x: number, y: number, q: number, v: number, px: number, py: number) {
    const c = arcCentre(x, y, q, v);
    return Math.abs(Math.hypot(px - c[0], py - c[1]) - 6);
}

// The curve of the quarter under (px, py) that passes nearest to it
function arcChoice(map: MapData, px: number, py: number): Required<Quarter> | null {
    const at = quarterAt(map, px, py);
    if (!at) return null;
    let best = 1;
    for (let v = 2; v <= 4; v++) if (arcDistance(at.x, at.y, at.q, v, px, py) < arcDistance(at.x, at.y, at.q, best, px, py)) best = v;
    at.v = best;
    at.rule = L.arcRule(roomOf(map, at.x, at.y), rulesOf(map).rooms);
    return at as Required<Quarter>;
}

// Sets curve v in a quarter (0 takes it out); only room 3 takes curves
function setCurve(map: MapData, x: number, y: number, q: number, v: number) {
    if (v && !L.arcRule(roomOf(map, x, y), rulesOf(map).rooms).ok) return false;
    const t = ensureTile(map, x, y);
    if (Number(t.curve[q]) === v) return false;
    L.setArc(map, x, y, q, v);
    return true;
}

// The curve within `reach` cm of (px, py), if any
function arcNear(map: MapData, px: number, py: number, reach: number): L.Arc | null {
    let best: L.Arc | null = null, bestD = reach;
    const tx = Math.floor(px / 12), ty = Math.floor(py / 12);
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            const x = 2 * (tx + dx) + 1, y = 2 * (ty + dy) + 1;
            const t = tileOf(map, x, y);
            if (!t || !t.curve) continue;
            t.curve.forEach(function (cv, q) {
                const v = Number(cv);
                if (!v) return;
                const ox = 6 * (x - 1) + (q % 2) * 6, oy = 6 * (y - 1) + Math.floor(q / 2) * 6;
                if (px < ox - reach || py < oy - reach || px > ox + 6 + reach || py > oy + 6 + reach) return;
                const d = arcDistance(x, y, q, v, px, py);
                if (d < bestD) { bestD = d; best = { x: x, y: y, q: q, v: v }; }
            });
        }
    }
    return best;
}

// ---- Victims on the 6 cm walls (rooms 2 and 3) -------------------------------------------------
// Slot i = quarter (NW, NE, SW, SE) * 4 + side (top, right, bottom, left), as halfWallVic. A slot
// is on a wall when the tile edge (whole, or the half wall over that half) is there, or the inner
// half wall, or - in a quarter with a curve - that curve. Same as the classic tile dialog.

function slotHasWall(map: MapData, x: number, y: number, i: number) {
    const q = Math.floor(i / 4), side = i % 4, qx = q % 2, qy = Math.floor(q / 2);
    const t = tileOf(map, x, y);
    if (!t) return false;
    if (t.curve && Number(t.curve[q])) return true;
    const inner = t.halfWallIn || [];
    const outer = function (dx: number, dy: number, half: number) {
        const c = map.cells[key(x + dx, y + dy)];
        return !!c && (c.isWall || c.halfWall == half);
    };
    switch (side) {
        case 0: return qy === 0 ? outer(0, -1, qx + 1) : !!inner[qx ? 1 : 3];
        case 1: return qx === 1 ? outer(1, 0, qy ? 1 : 2) : !!inner[qy ? 2 : 0];
        case 2: return qy === 1 ? outer(0, 1, qx + 1) : !!inner[qx ? 1 : 3];
        case 3: return qx === 0 ? outer(-1, 0, qy ? 1 : 2) : !!inner[qy ? 2 : 0];
    }
    return false;
}

// Where slot i of tile (x, y) is drawn, cm (on a curve: beside the face of the arc it is on)
function slotPos(x: number, y: number, i: number, map: MapData) {
    const t = map && tileOf(map, x, y);
    return L.slotPoint(x, y, i, t && t.curve).at;
}

// The slot of the quarter under (px, py): on the side it is nearest to, or - in a quarter with a
// curve - on the face of the arc on its side (inside / outside the arc); a victim already on that
// face keeps its own slot
function slotAt(map: MapData, px: number, py: number): Slot | null {
    const at = quarterAt(map, px, py);
    if (!at) return null;
    const t = tileOf(map, at.x, at.y);
    const v = t && t.curve ? Number(t.curve[at.q]) || 0 : 0;
    if (v) {
        const c = L.curveCentre(at.x, at.y, at.q, v);
        const inside = Math.hypot(px - c[0], py - c[1]) < 6;
        for (let side = 0; side < 4; side++) {
            if (L.curveInside(v, side) === inside && slotVictim(map, at.x, at.y, at.q * 4 + side)) return { x: at.x, y: at.y, i: at.q * 4 + side };
        }
        return { x: at.x, y: at.y, i: at.q * 4 + L.curveSide(v, inside) };
    }
    const cx = 6 * at.x - 3 + (at.q % 2) * 6, cy = 6 * at.y - 3 + Math.floor(at.q / 2) * 6;
    const dx = px - cx, dy = py - cy;
    const side = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0);
    return { x: at.x, y: at.y, i: at.q * 4 + side };
}

function slotVictim(map: MapData, x: number, y: number, i: number): VictimInfo | null {
    const t = tileOf(map, x, y);
    if (!t) return null;
    const v = t.halfWallVic && t.halfWallVic[i];
    const code = t.halfWallCognitives && t.halfWallCognitives[i];
    if ((!v || v == 0) && !code) return null;
    const target = code ? targetKind(map) : null;
    return { type: target ? target.id : kindBySlot(map, String(v)), value: v, code: code || '', fake: !!(t.halfWallVicFakes && t.halfWallVicFakes[i]) };
}

function slotRule(map: MapData, x: number, y: number, i: number): { ok: boolean; reason?: string } {
    const rules = rulesOf(map), takes = rules.rooms[roomOf(map, x, y)];
    if (!takes || takes.tokens !== 'slot') return { ok: false, reason: 'notQuarterTile' };
    if (isPassage(map, x, y) && !rules.tokens.inPassages) return { ok: false, reason: 'passage' };
    if (!slotHasWall(map, x, y, i)) return { ok: false, reason: 'noWall' };
    return { ok: true };
}

// As setVictim, for slot i of a tile whose victims go on the 6 cm faces
function setSlotVictim(map: MapData, x: number, y: number, i: number, type: string, fake?: boolean, opts?: VictimOpts) {
    opts = opts || {};
    const kind = tokenKind(map, type);
    if (!kind || !slotRule(map, x, y, i).ok) return false;
    const t = ensureTile(map, x, y);
    if (kind.family === 'target') {
        const target = rulesOf(map).tokens.target, letter = target.typeOf(opts.code);
        t.halfWallCognitives[i] = opts.code as string;
        t.halfWallVic[i] = letter ? target.slot[letter] : (null as any);
        t.halfWallVicFakes[i] = false;
    } else {
        t.halfWallVic[i] = kind.slot as string;
        t.halfWallCognitives[i] = '';
        t.halfWallVicFakes[i] = !!fake && kind.fakeable;
    }
    t.halfWallVicRots[i] = opts.rot || 0;
    if (opts.offset !== undefined) setOffsetValue(t, i, opts.offset);
    return true;
}

function clearSlotVictim(map: MapData, x: number, y: number, i: number) {
    const t = tileOf(map, x, y);
    if (!t || !slotVictim(map, x, y, i)) return false;
    t.halfWallVic![i] = '';
    if (t.halfWallCognitives) t.halfWallCognitives[i] = '';
    if (t.halfWallVicFakes) t.halfWallVicFakes[i] = false;
    setOffsetValue(t, i, 0);
    return true;
}

// ---- A placed victim, looked at and changed (select tool) --------------------------------------
// where: { kind: 'edge', x, y, dir } or { kind: 'slot', x, y, i }

function victimAt(map: MapData, where: Where): VictimInfo | null {
    const v = where.kind === 'edge' ? edgeVictim(map, where.x, where.y) : slotVictim(map, where.x, where.y, where.i);
    if (!v || (where.kind === 'edge' && v.dir !== where.dir)) return null;
    const t = tileOf(map, where.x, where.y);
    v.rot = Number(where.kind === 'edge' ? t!.single_victim_rotation : (t!.halfWallVicRots || [])[where.i]) || 0;
    return v;
}

// Changes what is given of type (a letter kind for a letter victim), fake and rot; a target keeps
// its kind and changes only its code
function changeVictim(map: MapData, where: Where, change: { type?: string; fake?: boolean; rot?: number; code?: string }) {
    const v = victimAt(map, where);
    if (!v) return false;
    const type = change.type && !isTarget(map, v.type) ? change.type : v.type;
    const fake = change.fake === undefined ? v.fake : change.fake;
    const rot = change.rot === undefined ? v.rot : ((Number(change.rot) % 360) + 360) % 360;
    const opts = { code: change.code || v.code, rot: rot };
    if (where.kind === 'edge') return setVictim(map, where.x, where.y, where.dir, type, fake, opts);
    return setSlotVictim(map, where.x, where.y, where.i, type, fake, opts);
}

function removeVictim(map: MapData, where: Where) {
    return where.kind === 'edge' ? clearVictim(map, where.x, where.y) : clearSlotVictim(map, where.x, where.y, where.i);
}

// ---- Where a victim is along its wall -----------------------------------------------------------
// A victim of rooms 1-3 sits on the face of its wall, anywhere along it: its offset (cm) from the
// middle of the face, + to the right on a top or bottom face, + down on a left or right one. It
// stays on its face (the tile's side, or the 6 cm wall of its quarter), clear of the walls at the
// ends and of the other victims. Kept in the tile (victim_offset, halfWallVicOffsets[i]); the classic
// editor leaves it alone and shows the victim in the middle. On a curve (room 3) it goes round the
// arc of its quarter: its offset is the length of arc from the middle, + clockwise as drawn.
// (how wide each kind is, and how far apart they keep: rules: tokens)
const OFFSET_STEP = 0.1;

export interface VictimPlace {
    at: Pt;                 // where it is drawn (2 cm off the wall)
    wall: Pt;               // the point of the wall it is on (the wall's middle line)
    along: Pt;              // the way its face runs there
    offset: number;
    half: number;           // half its face (6 cm for a tile side, 3 cm on a 6 cm wall, 3π/2 cm on a curve)
    centre?: Pt;            // on a curve: the centre of its arc (radius 6)
}

function setOffsetValue(t: Tile, i: number | null, offset: number) {
    const o = Math.round((Number(offset) || 0) / OFFSET_STEP) * OFFSET_STEP;
    const v = Math.abs(o) < 1e-9 ? 0 : Number(o.toFixed(1));
    if (i === null) {
        if (v) t.victim_offset = v; else delete t.victim_offset;
        return;
    }
    if (!v && !t.halfWallVicOffsets) return;
    if (!t.halfWallVicOffsets) t.halfWallVicOffsets = [];
    t.halfWallVicOffsets[i] = v || null;
    if (!t.halfWallVicOffsets.some(function (x: number | null) { return x; })) delete t.halfWallVicOffsets;
}

function victimOffset(map: MapData, where: Where): number {
    const t = tileOf(map, where.x, where.y);
    if (!t) return 0;
    const o = where.kind === 'edge' ? t.victim_offset : t.halfWallVicOffsets && t.halfWallVicOffsets[where.i];
    return Number(o) || 0;
}

// Where the victim at `where` is, with its offset (or the one given)
function victimPlace(map: MapData, where: Where, offset?: number): VictimPlace {
    const o = offset === undefined ? victimOffset(map, where) : offset;
    if (where.kind === 'slot') {
        const t = tileOf(map, where.x, where.y);
        const sp = L.slotPoint(where.x, where.y, where.i, t && t.curve, o);
        return { at: sp.at, wall: sp.wall, along: sp.along, offset: o, half: sp.curved ? 1.5 * Math.PI : 3, centre: sp.centre };
    }
    const d = SIDES[where.dir], along: Pt = d[0] ? [0, 1] : [1, 0];
    return {
        at: [6 * where.x + 4 * d[0] + along[0] * o, 6 * where.y + 4 * d[1] + along[1] * o],
        wall: [6 * where.x + 6 * d[0] + along[0] * o, 6 * where.y + 6 * d[1] + along[1] * o],
        along: along, offset: o, half: 6
    };
}

// The point of the wall k cm along the face from the victim's middle (round the arc on a curve), and
// the way off the wall to its face there
function faceAt(p: VictimPlace, k: number): { w: Pt; n: Pt } {
    const n0 = [p.at[0] - p.wall[0], p.at[1] - p.wall[1]], l = Math.hypot(n0[0], n0[1]) || 1;
    if (!p.centre) return { w: [p.wall[0] + p.along[0] * k, p.wall[1] + p.along[1] * k], n: [n0[0] / l, n0[1] / l] };
    const c = p.centre, a = Math.atan2(p.wall[1] - c[1], p.wall[0] - c[0]) + k / 6;
    const u = [Math.cos(a), Math.sin(a)], out = Math.hypot(p.at[0] - c[0], p.at[1] - c[1]) > 6 ? 1 : -1;
    return { w: [c[0] + 6 * u[0], c[1] + 6 * u[1]], n: [out * u[0], out * u[1]] };
}

// Every victim of rooms 1-3 on the map
function allVictims(map: MapData): Where[] {
    const out: Where[] = [];
    for (let x = 1; x < 2 * map.width; x += 2) {
        for (let y = 1; y < 2 * map.length; y += 2) {
            const v = edgeVictim(map, x, y);
            if (v) out.push({ kind: 'edge', x: x, y: y, dir: v.dir });
            for (let i = 0; i < 16; i++) if (slotVictim(map, x, y, i)) out.push({ kind: 'slot', x: x, y: y, i: i });
        }
    }
    return out;
}

function sameWhere(a: Where, b: Where) {
    return a.kind === b.kind && a.x === b.x && a.y === b.y && (a.kind === 'edge' ? a.dir === (b as any).dir : a.i === (b as any).i);
}

// Every wall as short straight pieces (a curve in pieces), cm
function wallPieces(map: MapData): number[][][] {
    const walls = L.fromCells(map);
    const pieces: number[][][] = [];
    walls.segs.forEach(function (k) {
        const g = L.parseSeg(k);
        const a = [6 * g.i, 6 * g.j], b = g.dir === 'h' ? [6 * g.i + 6, 6 * g.j] : [6 * g.i, 6 * g.j + 6];
        pieces.push([a, b]);
    });
    // a curve: the quarter of the circle (radius 6) about its centre inside its quarter
    walls.arcs.forEach(function (a) {
        const c = L.curveCentre(a.x, a.y, a.q, a.v);
        const ox = 6 * (a.x - 1) + (a.q % 2) * 6, oy = 6 * (a.y - 1) + Math.floor(a.q / 2) * 6;
        const pts: number[][] = [];
        for (let k = 0; k <= 96; k++) {
            const t = 2 * Math.PI * k / 96, p = [c[0] + 6 * Math.cos(t), c[1] + 6 * Math.sin(t)];
            if (p[0] >= ox - 0.01 && p[0] <= ox + 6.01 && p[1] >= oy - 0.01 && p[1] <= oy + 6.01) pts.push(p);
        }
        for (let k = 1; k < pts.length; k++) {
            if (Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]) >= 1) continue;
            pieces.push([pts[k - 1], pts[k]]);
        }
    });
    return pieces;
}

function pointSegDist(p: number[], a: number[], b: number[]) {
    const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

function segSegDist(a: number[], b: number[], c: number[], d: number[]) {
    return Math.min(pointSegDist(a, c, d), pointSegDist(b, c, d), pointSegDist(c, a, b), pointSegDist(d, a, b));
}

// Half the width of the victim at `where` along its wall (type: of the one to go there instead)
function tokenHalf(map: MapData, where: Where, type?: string) {
    if (!type) {
        const v = victimAt(map, where);
        type = v ? v.type : '';
    }
    const kind = tokenKind(map, type) || rulesOf(map).tokens.kinds[0];
    return kind.widthCm / 2;
}

// The victim on the face of its wall: from end to end (on a curve, the chord of its arc)
function tokenSpan(p: VictimPlace, half: number, wallHalf: number): { a: number[]; b: number[]; r: number } {
    const ends = [-half, half].map(function (k) {
        const f = faceAt(p, k);
        return [f.w[0] + f.n[0] * wallHalf, f.w[1] + f.n[1] * wallHalf];
    });
    return { a: ends[0], b: ends[1], r: 0 };
}

interface FitWorld { half: number; wallHalf: number; gap: number; pieces: number[][][]; others: { a: number[]; b: number[]; r: number }[] }

// What the victim at `where` (or one of `type` there) has to fit among
function fitWorld(map: MapData, where: Where, type?: string): FitWorld {
    const rules = rulesOf(map), wallHalf = rules.geometry.wallHalfCm;
    return {
        half: tokenHalf(map, where, type),
        wallHalf: wallHalf,
        gap: rules.tokens.gapCm,
        pieces: wallPieces(map),
        others: allVictims(map).filter(function (w) { return !sameWhere(w, where); }).map(function (w) { return tokenSpan(victimPlace(map, w), tokenHalf(map, w), wallHalf); })
    };
}

// Whether the victim at `where` fits at `offset`: on its face, its wall under it all the way, clear
// of every other wall (the ones at the ends of its face) and of the other victims
function victimFits(map: MapData, where: Where, offset: number, world?: FitWorld): boolean {
    world = world || fitWorld(map, where);
    const p = victimPlace(map, where, offset), half = world.half;
    if (Math.abs(offset) > p.half - half + 1e-9) return false;
    const near = world.pieces.filter(function (s) { return pointSegDist(p.wall, s[0], s[1]) < half + 3; });
    // every half cm across it (a wall coming up to its face in the middle stops it too)
    const steps = Math.ceil(2 * half / 0.5);
    for (let j = 0; j <= steps; j++) {
        const k = -half + 2 * half * j / steps;
        // its wall is under it
        const { w, n } = faceAt(p, k);
        if (!near.some(function (s) { return pointSegDist(w, s[0], s[1]) <= 0.01; })) return false;
        // nothing else comes up to its face
        const f = [w[0] + n[0] * (world.wallHalf + 0.05), w[1] + n[1] * (world.wallHalf + 0.05)];
        if (near.some(function (s) { return pointSegDist(f, s[0], s[1]) < world!.wallHalf - 1e-9; })) return false;
    }
    const me = tokenSpan(p, half, world.wallHalf);
    return world.others.every(function (o) { return segSegDist(me.a, me.b, o.a, o.b) - o.r - me.r >= world!.gap - 1e-9; });
}

// How far the victim at `where` can go along its wall, from where it is (start: from that offset
// instead), or from the nearest place it fits when it does not fit there: { min, max } offsets, cm.
// type: for one of that type to go there (its width), instead of the one there
function victimRange(map: MapData, where: Where, start?: number, type?: string): { min: number; max: number } {
    const p = victimPlace(map, where, start);
    const world = fitWorld(map, where, type);
    const steps = Math.round(2 * p.half / OFFSET_STEP);
    let from = p.offset;
    // not fitting where it is: from the nearest place where it does
    for (let k = 0; k <= steps && !victimFits(map, where, from, world); k++) {
        const lo = Number((p.offset - k * OFFSET_STEP).toFixed(1)), hi = Number((p.offset + k * OFFSET_STEP).toFixed(1));
        if (victimFits(map, where, lo, world)) from = lo;
        else if (victimFits(map, where, hi, world)) from = hi;
    }
    if (!victimFits(map, where, from, world)) return { min: p.offset, max: p.offset };
    let min = from, max = from;
    for (let k = 1; k <= steps; k++) {
        const o = Number((from - k * OFFSET_STEP).toFixed(1));
        if (!victimFits(map, where, o, world)) break;
        min = o;
    }
    for (let k = 1; k <= steps; k++) {
        const o = Number((from + k * OFFSET_STEP).toFixed(1));
        if (!victimFits(map, where, o, world)) break;
        max = o;
    }
    return { min: min, max: max };
}

// The offset of the point (px, py) on the face of the victim at `where`, kept where it fits
// (from: the offset to look from; where it is when not given. type: as for victimRange)
function offsetToward(map: MapData, where: Where, px: number, py: number, from?: number, type?: string): number {
    const base = victimPlace(map, where, 0);
    let want = (px - base.wall[0]) * base.along[0] + (py - base.wall[1]) * base.along[1];
    // on a curve: the length of arc round to the point's angle
    if (base.centre) {
        const c = base.centre, a = Math.atan2(py - c[1], px - c[0]) - Math.atan2(base.wall[1] - c[1], base.wall[0] - c[0]);
        want = 6 * Math.atan2(Math.sin(a), Math.cos(a));
    }
    const r = victimRange(map, where, from, type);
    return Number(Math.max(r.min, Math.min(r.max, Math.round(want / OFFSET_STEP) * OFFSET_STEP)).toFixed(1));
}

// Moves the victim at `where` along its wall (as far as it fits toward the offset asked for)
function moveVictim(map: MapData, where: Where, offset: number) {
    const t = tileOf(map, where.x, where.y);
    if (!t || !victimAt(map, where)) return false;
    const r = victimRange(map, where);
    const o = Number(Math.max(r.min, Math.min(r.max, Math.round(offset / OFFSET_STEP) * OFFSET_STEP)).toFixed(1));
    if (o === victimOffset(map, where)) return false;
    setOffsetValue(t, where.kind === 'edge' ? null : where.i, o);
    return true;
}

// The victims that do not fit where they are moved to (a wall or another victim came there since)
function misplacedVictims(map: MapData): Where[] {
    return allVictims(map).filter(function (w) {
        const o = victimOffset(map, w);
        return o !== 0 && !victimFits(map, w, o);
    });
}

// Puts a victim that does not fit back: the nearest offset toward the middle where it does
function settleVictim(map: MapData, where: Where) {
    const t = tileOf(map, where.x, where.y);
    if (!t) return false;
    const o = victimOffset(map, where), world = fitWorld(map, where);
    const steps = Math.round(Math.abs(o) / OFFSET_STEP);
    for (let k = 1; k <= steps; k++) {
        const c = Number((o - Math.sign(o) * k * OFFSET_STEP).toFixed(1));
        if (victimFits(map, where, c, world)) { setOffsetValue(t, where.kind === 'edge' ? null : where.i, c); return true; }
    }
    setOffsetValue(t, where.kind === 'edge' ? null : where.i, 0);
    return true;
}

// ---- Regions of tiles: copy, clear, paste (the select tool) ------------------------------------
// r = { x0, y0, x1, y1 }: tile indices, both ends in. A region holds its tiles (with what is on
// them and their room) and the edges round and inside them.

function regionCells(r: Region): Pt[] {
    const keys: Pt[] = [];
    for (let x = 2 * r.x0; x <= 2 * r.x1 + 2; x++) {
        for (let y = 2 * r.y0; y <= 2 * r.y1 + 2; y++) {
            if (x % 2 === 0 && y % 2 === 0) continue;   // corners hold nothing
            keys.push([x, y]);
        }
    }
    return keys;
}

function copyRegion(map: MapData, r: Region): Clip {
    const clip: Clip = { w: r.x1 - r.x0 + 1, h: r.y1 - r.y0 + 1, cells: {}, rooms: {} };
    regionCells(r).forEach(function (p) {
        const cell = map.cells[key(p[0], p[1])];
        const rk = (p[0] - 2 * r.x0) + ',' + (p[1] - 2 * r.y0);
        if (cell) clip.cells[rk] = JSON.parse(JSON.stringify(cell));
        if (p[0] % 2 === 1 && p[1] % 2 === 1) clip.rooms[rk] = isOutside(map, p[0], p[1]) ? 0 : roomOf(map, p[0], p[1]);
    });
    return clip;
}

function clearTile(map: MapData, x: number, y: number) {
    const k = key(x, y);
    map.roomTiles = map.roomTiles.map(function (list) { return list.filter(function (t) { return t !== k; }); });
    map.cells[k] = { isTile: true, tile: {} };
    ensureTile(map, x, y);
    const st = map.startTile;
    if (st && st.x === x && st.y === y) map.startTile = { x: 0, y: 0, z: 0 };
}

// Empties the region: room 1 tiles with nothing on them, no walls inside or round it (the outer
// walls and room borders come back with resyncBorderWalls)
function clearRegion(map: MapData, r: Region) {
    regionCells(r).forEach(function (p) {
        if (p[0] % 2 === 1 && p[1] % 2 === 1) clearTile(map, p[0], p[1]);
        else if (map.cells[key(p[0], p[1])]) setEdge(map, p[0], p[1], false);
    });
}

// Puts a copied region with its top left tile at (tx, ty); what falls off the map is left out
function pasteRegion(map: MapData, clip: Clip, tx: number, ty: number) {
    const ox = 2 * tx, oy = 2 * ty;
    Object.keys(clip.rooms).forEach(function (rk) {
        const p = rk.split(',').map(Number);
        const x = p[0] + ox, y = p[1] + oy;
        if (!inMap(map, x, y)) return;
        clearTile(map, x, y);
        if (clip.cells[rk]) map.cells[key(x, y)] = JSON.parse(JSON.stringify(clip.cells[rk]));
        ensureTile(map, x, y);
        const room = clip.rooms[rk];
        if (room >= 2) map.roomTiles[room - 2].push(key(x, y));
        if (room === 0) map.cells[key(x, y)].tile!.outside = true;
        else delete map.cells[key(x, y)].tile!.outside;
    });
    for (let x = 0; x <= 2 * clip.w; x++) {
        for (let y = 0; y <= 2 * clip.h; y++) {
            if ((x + y) % 2 !== 1) continue;
            const ex = x + ox, ey = y + oy;
            if (ex < 0 || ey < 0 || ex > 2 * map.width || ey > 2 * map.length) continue;
            const c = clip.cells[x + ',' + y];
            map.cells[key(ex, ey)] = c ? JSON.parse(JSON.stringify(c)) : { isWall: false, halfWall: 0 };
        }
    }
}

// ---- Rows and columns (as the classic editor inserts and removes them) ---------------------------
// Grid indices: tiles odd, the edges between them even. insertLine adds a tile line after edge
// line g (0 = before the first); removeLine takes out tile line t with the edge line after it
// (before it at the far end, so the border stays).

function shiftKey(k: string, axis: string, from: number, amount: number) {
    const p = k.split(',').map(Number);
    const i = axis === 'x' ? 0 : 1;
    if (p[i] >= from) p[i] += amount;
    return p.join(',');
}

function insertLine(map: MapData, axis: string, g: number) {
    const size = axis === 'x' ? map.width : map.length;
    if (size >= 40) return false;
    const atEnd = g >= 2 * size;
    const from = atEnd ? g : g + 1;
    const cells: Record<string, Cell> = {};
    Object.keys(map.cells).forEach(function (k) { cells[shiftKey(k, axis, from, 2)] = map.cells[k]; });
    const fresh = g + 1;
    const other = axis === 'x' ? map.length : map.width;
    const keyAt = function (a: number, b: number) { return axis === 'x' ? a + ',' + b + ',0' : b + ',' + a + ',0'; };
    // walls that run across the new line are carried over it
    for (let b = 0; b <= 2 * other; b += 2) {
        const before = cells[keyAt(fresh - 2, b)], after = cells[keyAt(fresh + 2, b)];
        const wallBefore = g > 0 && before && before.isWall;
        const wallAfter = !atEnd && after && after.isWall;
        if ((wallBefore && wallAfter) || (g === 0 && wallAfter) || (atEnd && wallBefore)) cells[keyAt(fresh, b)] = { isWall: true, halfWall: 0 };
    }
    map.cells = cells;
    // a new tile between two tiles of the same room joins it; between two outside tiles, it is outside
    const rooms = map.roomTiles.map(function (list) { return list.map(function (k) { return shiftKey(k, axis, from, 2); }); });
    if (g > 0 && !atEnd) {
        for (let b = 1; b < 2 * other; b += 2) {
            rooms.forEach(function (list) {
                if (list.indexOf(keyAt(fresh - 2, b)) > -1 && list.indexOf(keyAt(fresh + 2, b)) > -1) list.push(keyAt(fresh, b));
            });
            const a = cells[keyAt(fresh - 2, b)], c = cells[keyAt(fresh + 2, b)];
            if (a && a.tile && a.tile.outside && c && c.tile && c.tile.outside) cells[keyAt(fresh, b)] = { isTile: true, tile: { outside: true } };
        }
    }
    map.roomTiles = rooms;
    const st = map.startTile;
    if (st && st.x > 0 && (axis === 'x' ? st.x : st.y) >= from) { if (axis === 'x') st.x += 2; else st.y += 2; }
    if (axis === 'x') map.width++; else map.length++;
    ensureTiles(map);
    return true;
}

function removeLine(map: MapData, axis: string, t: number) {
    const size = axis === 'x' ? map.width : map.length;
    if (size <= 1) return false;
    const atEnd = t >= 2 * size - 1;
    const gone = atEnd ? [t - 1, t] : [t, t + 1];
    const i = axis === 'x' ? 0 : 1;
    const cells: Record<string, Cell> = {};
    Object.keys(map.cells).forEach(function (k) {
        const p = k.split(',').map(Number);
        if (gone.indexOf(p[i]) > -1) return;
        cells[shiftKey(k, axis, gone[1] + 1, -2)] = map.cells[k];
    });
    map.cells = cells;
    map.roomTiles = map.roomTiles.map(function (list) {
        return list.filter(function (k) { return Number(k.split(',')[i]) !== t; })
            .map(function (k) { return shiftKey(k, axis, gone[1] + 1, -2); });
    });
    const st = map.startTile;
    if (st && st.x > 0) {
        const v = axis === 'x' ? st.x : st.y;
        if (v === t) map.startTile = { x: 0, y: 0, z: 0 };
        else if (v > t) { if (axis === 'x') st.x -= 2; else st.y -= 2; }
    }
    if (axis === 'x') map.width--; else map.length--;
    ensureTiles(map);
    return true;
}

// ---- Problems ----------------------------------------------------------------------------------
// { key, params, block, at }: block = the world export stops for it; at = [x, y] cm to show


// ---- Where the robot can go ---------------------------------------------------------------------
// As the custom room 4 creator works it out, on a 0.5 cm grid over the map: the walls are 1 cm
// thick; a robot centre may be where it keeps its radius (3.7 cm) from every wall, so it passes a
// 12 cm gap but not a 6 cm one; from the start tile the free places joined to it are reached; the
// floor its body (within its radius of a reached centre) never covers is out of reach, leaving
// out specks under 5 cm2 (the corners a round robot cannot fill). Room 4's inside is a picture,
// so it is taken as open, and rooms the robot does not get into at all (no passage yet, pointed
// out on their own) are left out.
// Out: { res, gw, gh, reached (Uint8Array, 1 = a centre gets there), miss (Uint8Array, 1 = out of
// reach), pocketCount, pocketAt(x, y) cm, victims: [[x, y]] cm of the victims it cannot get to },
// or null without a start tile.
// (the robot's size, the walls' thickness and how near it comes to identify a token: rules: geometry)
const REACH_RES = 0.5, SPECK_CM2 = 5;

// Distance (in cells) from every cell to the nearest cell with src set, two passes over a 5 x 5
// chamfer mask (close to the straight-line distance)
function distanceTo(src: ArrayLike<number>, gw: number, gh: number) {
    const INF = 1e9, d = new Float32Array(gw * gh);
    for (let i = 0; i < gw * gh; i++) d[i] = src[i] ? 0 : INF;
    const r2 = Math.SQRT2, r5 = Math.sqrt(5);
    const fwd = [[-1, 0, 1], [-1, -1, r2], [0, -1, 1], [1, -1, r2], [-2, -1, r5], [-1, -2, r5], [1, -2, r5], [2, -1, r5]];
    const pass = function (mask: number[][], y0: number, y1: number, dy: number, x0: number, x1: number, dx: number) {
        for (let y = y0; y !== y1; y += dy) {
            for (let x = x0; x !== x1; x += dx) {
                const i = y * gw + x;
                let v = d[i];
                for (let k = 0; k < mask.length; k++) {
                    const nx = x + mask[k][0], ny = y + mask[k][1];
                    if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
                    const c = d[ny * gw + nx] + mask[k][2];
                    if (c < v) v = c;
                }
                d[i] = v;
            }
        }
    };
    pass(fwd, 0, gh, 1, 0, gw, 1);
    pass(fwd.map(function (m) { return [-m[0], -m[1], m[2]]; }), gh - 1, -1, -1, gw - 1, -1, -1);
    return d;
}

function robotReach(map: MapData, picture?: Room4Picture | null): Reach | null {
    const st = map.startTile;
    if (!st || !(st.x > 0 && st.y > 0)) return null;
    const geometry = rulesOf(map).geometry;
    const res = REACH_RES, gw = Math.round(12 * map.width / res), gh = Math.round(12 * map.length / res);
    const at = function (x: number, y: number) { return Math.floor(y / res) * gw + Math.floor(x / res); };
    // walls (and the floor that is not there: outside tiles) on the grid
    const wall = new Uint8Array(gw * gh);
    const markSeg = function (a: number[], b: number[]) {
        const r = geometry.wallHalfCm;
        const i0 = Math.max(0, Math.floor((Math.min(a[0], b[0]) - r) / res)), i1 = Math.min(gw - 1, Math.ceil((Math.max(a[0], b[0]) + r) / res));
        const j0 = Math.max(0, Math.floor((Math.min(a[1], b[1]) - r) / res)), j1 = Math.min(gh - 1, Math.ceil((Math.max(a[1], b[1]) + r) / res));
        const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
        for (let j = j0; j <= j1; j++) {
            for (let i = i0; i <= i1; i++) {
                const px = (i + 0.5) * res, py = (j + 0.5) * res;
                const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / l2));
                if (Math.hypot(px - a[0] - t * dx, py - a[1] - t * dy) <= r) wall[j * gw + i] = 1;
            }
        }
    };
    // no floor: an outside tile (a wall to the robot), or a hole - the whole tile, as Erebus has no
    // floor there and counts the robot fallen in once its centre is over it: its centre keeps off it
    const outside = new Uint8Array(gw * gh), hole = new Uint8Array(gw * gh);
    for (let x = 1; x < 2 * map.width; x += 2) {
        for (let y = 1; y < 2 * map.length; y += 2) {
            const t = tileOf(map, x, y), off = isOutside(map, x, y);
            if (!off && !(t && t.black)) continue;
            for (let j = 6 * (y - 1) / res; j < 6 * (y + 1) / res; j++) {
                for (let i = 6 * (x - 1) / res; i < 6 * (x + 1) / res; i++) {
                    outside[j * gw + i] = 1;
                    if (off) wall[j * gw + i] = 1; else hole[j * gw + i] = 1;
                }
            }
        }
    }
    // the walls of a custom room 4 picture, on room 4's tiles: a cell is a wall where they cover a
    // sixth of it (as the room 4 creator works it out)
    const place = picture ? room4Place(map) : null;
    if (picture && place) {
        const kx = picture.w / place.w, ky = picture.h / place.h, W1 = picture.w + 1;
        for (let j = Math.floor(place.y0 / res); j < Math.ceil((place.y0 + place.h) / res); j++) {
            for (let i = Math.floor(place.x0 / res); i < Math.ceil((place.x0 + place.w) / res); i++) {
                if (i < 0 || j < 0 || i >= gw || j >= gh) continue;
                if (roomOf(map, 2 * Math.floor(i * res / 12) + 1, 2 * Math.floor(j * res / 12) + 1) !== 4) continue;
                const px0 = Math.max(0, Math.floor((i * res - place.x0) * kx)), px1 = Math.min(picture.w, Math.ceil(((i + 1) * res - place.x0) * kx));
                const py0 = Math.max(0, Math.floor((j * res - place.y0) * ky)), py1 = Math.min(picture.h, Math.ceil(((j + 1) * res - place.y0) * ky));
                const area = (px1 - px0) * (py1 - py0);
                if (area <= 0) continue;
                const n = picture.wallSum[py1 * W1 + px1] - picture.wallSum[py0 * W1 + px1] - picture.wallSum[py1 * W1 + px0] + picture.wallSum[py0 * W1 + px0];
                if (n / area > 40 / 255) wall[j * gw + i] = 1;
            }
        }
    }
    // every wall as short straight pieces (curves too), for line of sight
    const pieces = wallPieces(map);
    pieces.forEach(function (s) { markSeg(s[0], s[1]); });
    // the map's edge is a wall too
    const dWall = (function () {
        const src = new Uint8Array(gw * gh);
        for (let i = 0; i < gw * gh; i++) src[i] = wall[i];
        return distanceTo(src, gw, gh);
    })();
    const edgeDist = function (i: number, j: number) { return Math.min(i + 0.5, j + 0.5, gw - i - 0.5, gh - j - 0.5); };
    const need = geometry.robotRadiusCm / res;
    const free = new Uint8Array(gw * gh);
    for (let j = 0; j < gh; j++)
        for (let i = 0; i < gw; i++) free[j * gw + i] = dWall[j * gw + i] >= need && edgeDist(i, j) >= need && !hole[j * gw + i] ? 1 : 0;
    // from the start: its nearest free cell, then everything joined to it (8 ways)
    const reached = new Uint8Array(gw * gh);
    let seed = -1;
    const sx = Math.floor(6 * st.x / res), sy = Math.floor(6 * st.y / res);
    for (let r = 0; r < 12 / res && seed < 0; r++) {
        for (let y = sy - r; y <= sy + r && seed < 0; y++) for (let x = sx - r; x <= sx + r; x++) {
            if (x >= 0 && y >= 0 && x < gw && y < gh && free[y * gw + x]) { seed = y * gw + x; break; }
        }
    }
    if (seed >= 0) {
        const stack = [seed];
        reached[seed] = 1;
        while (stack.length) {
            const q = stack.pop()!, qx = q % gw, qy = (q - qx) / gw;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                const nx = qx + dx, ny = qy + dy;
                if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
                const n = ny * gw + nx;
                if (!reached[n] && free[n]) { reached[n] = 1; stack.push(n); }
            }
        }
    }
    // the floor its body covers
    const dReach = distanceTo(reached, gw, gh);
    const covered = function (n: number) { return dReach[n] <= need + 0.5; };
    // rooms it gets into at all
    const roomIn: Record<number, boolean> = {};
    const roomAtCell = function (n: number) {
        const i = n % gw, j = (n - i) / gw;
        return roomOf(map, 2 * Math.floor(i * res / 12) + 1, 2 * Math.floor(j * res / 12) + 1);
    };
    for (let n = 0; n < gw * gh; n++) if (reached[n]) roomIn[roomAtCell(n)] = true;
    // the floor of rooms 1-3 out of reach, without specks
    const miss = new Uint8Array(gw * gh);
    for (let n = 0; n < gw * gh; n++) {
        if (wall[n] || outside[n] || covered(n)) continue;
        const room = roomAtCell(n);
        if (room === 4 || !roomIn[room]) continue;
        miss[n] = 1;
    }
    const minCells = SPECK_CM2 / (res * res);
    const seen = new Uint8Array(gw * gh);
    let pocketCount = 0;
    for (let start = 0; start < gw * gh; start++) {
        if (!miss[start] || seen[start]) continue;
        const region = [start];
        seen[start] = 1;
        for (let h = 0; h < region.length; h++) {
            const q = region[h], qx = q % gw, qy = (q - qx) / gw;
            const next = [qx > 0 ? q - 1 : -1, qx < gw - 1 ? q + 1 : -1, qy > 0 ? q - gw : -1, qy < gh - 1 ? q + gw : -1];
            for (let k = 0; k < 4; k++) if (next[k] >= 0 && miss[next[k]] && !seen[next[k]]) { seen[next[k]] = 1; region.push(next[k]); }
        }
        if (region.length < minCells) region.forEach(function (q) { miss[q] = 0; });
        else pocketCount++;
    }
    const pocketAt = function (x: number, y: number) {
        if (x < 0 || y < 0 || x >= 12 * map.width || y >= 12 * map.length) return false;
        return !!miss[at(x, y)];
    };
    // a victim is got to when a reached centre is near its wall, on the side it faces, with no wall
    // between them; one in a place out of reach never is
    const cross = function (p: number[], q: number[], a: number[], b: number[]) {
        const d = function (u: number[], v: number[], w2: number[]) { return (v[0] - u[0]) * (w2[1] - u[1]) - (v[1] - u[1]) * (w2[0] - u[0]); };
        const d1 = d(a, b, p), d2 = d(a, b, q), d3 = d(p, q, a), d4 = d(p, q, b);
        return ((d1 > 1e-9 && d2 < -1e-9) || (d1 < -1e-9 && d2 > 1e-9)) && ((d3 > 1e-9 && d4 < -1e-9) || (d3 < -1e-9 && d4 > 1e-9));
    };
    const seenFrom = function (p: number[], q: number[]) {
        const x0 = Math.min(p[0], q[0]), x1 = Math.max(p[0], q[0]), y0 = Math.min(p[1], q[1]), y1 = Math.max(p[1], q[1]);
        return !pieces.some(function (s2) {
            if (Math.max(s2[0][0], s2[1][0]) < x0 || Math.min(s2[0][0], s2[1][0]) > x1 || Math.max(s2[0][1], s2[1][1]) < y0 || Math.min(s2[0][1], s2[1][1]) > y1) return false;
            return cross(p, q, s2[0], s2[1]);
        });
    };
    const near = function (pt: number[], wallPt: number[]) {
        if (pocketAt(pt[0], pt[1])) return false;
        const n = [pt[0] - wallPt[0], pt[1] - wallPt[1]], r = geometry.identifyCm;
        for (let j = Math.max(0, Math.floor((wallPt[1] - r) / res)); j <= Math.min(gh - 1, Math.ceil((wallPt[1] + r) / res)); j++) {
            for (let i = Math.max(0, Math.floor((wallPt[0] - r) / res)); i <= Math.min(gw - 1, Math.ceil((wallPt[0] + r) / res)); i++) {
                if (!reached[j * gw + i]) continue;
                const c = [(i + 0.5) * res, (j + 0.5) * res], dx = c[0] - wallPt[0], dy = c[1] - wallPt[1];
                if (Math.hypot(dx, dy) <= r && dx * n[0] + dy * n[1] > 0 && seenFrom(c, pt)) return true;
            }
        }
        return false;
    };
    const skip = function (x: number, y: number) { return isOutside(map, x, y) || roomOf(map, x, y) === 4 || !roomIn[roomOf(map, x, y)]; };
    const victims: number[][] = [];
    for (let x = 1; x < 2 * map.width; x += 2) {
        for (let y = 1; y < 2 * map.length; y += 2) {
            if (skip(x, y)) continue;
            const v = edgeVictim(map, x, y);
            if (v && hasWall(map, x, y, v.dir)) {
                const p = victimPlace(map, { kind: 'edge', x: x, y: y, dir: v.dir });
                if (!near(p.at, p.wall)) victims.push(p.at);
            }
            for (let i = 0; i < 16; i++) {
                if (!slotVictim(map, x, y, i) || !slotHasWall(map, x, y, i)) continue;
                const p = victimPlace(map, { kind: 'slot', x: x, y: y, i: i });
                if (!near(p.at, p.wall)) victims.push(p.at);
            }
        }
    }
    const gotTo = function (x: number, y: number, at: Pt, wallPt: Pt) { return skip(x, y) || near(at, wallPt); };
    return { res: res, gw: gw, gh: gh, reached: reached, miss: miss, pocketCount: pocketCount, pocketAt: pocketAt, victims: victims, gotTo: gotTo };
}

// { key, params, block, at, show }: block = the world export stops for it; at = [x, y] cm to go to;
// show = everything the problem is about, to point out on the map: { tiles: [[tx, ty]] (tile
// indices), points: [[x, y]] cm, segs: [unit segments], arcs: [{x, y, q, v}] }
function problems(map: MapData, picture?: Room4Picture | null): Problem[] {
    const out: Problem[] = [];
    const st = map.startTile;
    if (!st || !(st.x > 0 && st.y > 0)) out.push({ key: 'noStart', block: true });
    const type = map.area4Room && map.area4Room.type;
    const region = W.room4Region(map);
    const regionAt = region ? [6 * (region.minX + region.maxX + 1), 6 * (region.minY + region.maxY + 1)] : null;
    const rooms = roomMap(map);
    const tilesOf = function (room: number) {
        return Object.keys(rooms).filter(function (k) { return rooms[k] === room; })
            .map(function (k) { const p = k.split(',').map(Number); return [(p[0] - 1) / 2, (p[1] - 1) / 2]; });
    };
    if (type === 1 && !map.room4CanvasSave) out.push({ key: 'customRoom4NoPicture', block: true, at: regionAt, show: { tiles: tilesOf(4) } });
    if (type === 1) {
        // the room 4 tile behind each passage should be a checkpoint (rule 3.5.3), as the creator says
        const geo = W.mapGeometry(map);
        const cps: Record<string, boolean> = {};
        geo.checkpoints.forEach(function (t: number[]) { cps[t[0] + ',' + t[1]] = true; });
        const missing: string[] = [];
        geo.entrances.forEach(function (e: any) {
            const k = e.tile[0] + ',' + e.tile[1];
            if (e.passage && !cps[k] && missing.indexOf(k) < 0) missing.push(k);
        });
        if (missing.length) {
            const tiles = missing.map(function (k) { return k.split(',').map(Number); });
            out.push({ key: 'room4Checkpoint', params: { count: missing.length }, block: true, at: [12 * tiles[0][0] + 6, 12 * tiles[0][1] + 6], show: { tiles: tiles } });
        }
    }
    if (type >= 2) out.push({ key: 'presetNotSupported', block: true, at: regionAt, show: { tiles: tilesOf(4) } });
    // the rooms' connections are always checked here (the classic editor's switch, connCheckOff,
    // is kept in the map as it is, for that editor)
    const conn = W.connectionStatus(map);
    const centre = function (t: number[]) { return [12 * t[0] + 6, 12 * t[1] + 6]; };
    const markTiles = function (test: (mark: any, k: string) => unknown) {
        return Object.keys(conn.marks).filter(function (m) { return test(conn.marks[m], m); }).map(function (m) { return m.split(',').map(Number); });
    };
    conn.rooms.forEach(function (r: any) {
        if (r.reached) return;
        const tiles = tilesOf(r.room);
        out.push({ key: 'conn.notConnected', params: { room: r.room }, block: true, at: tiles.length ? centre(tiles[0]) : null, show: { tiles: tiles } });
    });
    conn.issues.forEach(function (i: any) {
        // a passage tile in the wrong place, or the gaps between two rooms that are not passages
        const tiles = i.key === 'unmarkedGap'
            ? markTiles(function (m: any) { return m.style && m.style['border-color'] === i.pass.color; })
            : markTiles(function (m: any, k: string) { const t = k.split(',').map(Number); const tile = tileOf(map, 2 * t[0] + 1, 2 * t[1] + 1); return m.cls === 'bad' && tile && tile.color === i.pass.color; });
        out.push({ key: 'conn.' + i.key, params: { name: i.pass.name, from: i.pass.from, to: i.pass.to, room: i.room, count: i.count }, block: true,
            at: tiles.length ? centre(tiles[0]) : null, show: { tiles: tiles } });
    });
    // victims whose wall has gone, and walls the rooms do not take
    const floating: number[][] = [];
    for (let x = 1; x < 2 * map.width; x += 2) {
        for (let y = 1; y < 2 * map.length; y += 2) {
            const v = edgeVictim(map, x, y);
            if (v && !hasWall(map, x, y, v.dir)) floating.push(victimPlace(map, { kind: 'edge', x: x, y: y, dir: v.dir }).at);
            for (let i = 0; i < 16; i++) {
                if (slotVictim(map, x, y, i) && !slotHasWall(map, x, y, i)) floating.push(victimPlace(map, { kind: 'slot', x: x, y: y, i: i }).at);
            }
        }
    }
    if (floating.length) out.push({ key: 'victimNoWall', params: { count: floating.length }, at: floating[0], show: { points: floating } });
    // victims in a passage between rooms (a passage put where they were): there are none (rule 3.7.2)
    const inPassage = allVictims(map).filter(function (w) { return isPassage(map, w.x, w.y); }).map(function (w) { return victimPlace(map, w).at; });
    if (inPassage.length) out.push({ key: 'victimInPassage', params: { count: inPassage.length }, block: true, at: inPassage[0], show: { points: inPassage } });
    // victims moved along their wall where they no longer fit (a wall or another victim came there)
    const misplaced = misplacedVictims(map).filter(function (w) {
        return w.kind === 'edge' ? hasWall(map, w.x, w.y, w.dir) : slotHasWall(map, w.x, w.y, w.i);
    }).map(function (w) { return victimPlace(map, w).at; });
    if (misplaced.length) out.push({ key: 'victimMisplaced', params: { count: misplaced.length }, block: true, at: misplaced[0], show: { points: misplaced } });
    // victims the robot cannot get to (walls too close round them): there are none there (rule 3.2.4)
    const reach = robotReach(map, picture);
    if (reach && reach.victims.length) {
        out.push({ key: 'victimUnreachable', params: { count: reach.victims.length }, block: true, at: reach.victims[0],
            show: { points: reach.victims } });
    }
    // the stamps of a custom room 4 picture: each of a type (the world is the same each export, and
    // so is the most it can score), and each where the robot can identify it
    if (type === 1 && picture && map.room4CanvasSave) {
        const untyped = picture.tokens.filter(function (t) { return !(t.type >= 0 && t.type <= 10); }).length;
        if (untyped) out.push({ key: 'room4Untyped', params: { count: untyped }, block: true, at: regionAt, show: { tiles: tilesOf(4) } });
        const lost = reach ? room4Unreached(map, picture, reach).map(function (u) { return u.at; }) : [];
        if (lost.length) out.push({ key: 'room4Unreachable', params: { count: lost.length }, block: true, at: lost[0], show: { points: lost } });
    }
    const room = roomLookup(map);
    const walls = L.fromCells(map);
    const badSegs: string[] = [], badArcs: L.Arc[] = [];
    walls.segs.forEach(function (s) {
        if (isOuterSeg(map, s)) return;
        const rule = L.segRule(s, room, rulesOf(map).rooms);
        if (!rule.ok || (rule.whole && !L.hasSeg(map, L.otherHalf(s)!))) badSegs.push(s);
    });
    walls.arcs.forEach(function (a) { if (!L.arcRule(room(a.x, a.y), rulesOf(map).rooms).ok) badArcs.push(a); });
    if (badSegs.length || badArcs.length) {
        let at: number[];
        if (badSegs.length) { const g = L.parseSeg(badSegs[0]); at = [6 * g.i + (g.dir === 'h' ? 3 : 0), 6 * g.j + (g.dir === 'v' ? 3 : 0)]; }
        else { const a0 = badArcs[0]; at = [6 * a0.x - 3 + (a0.q % 2) * 6, 6 * a0.y - 3 + Math.floor(a0.q / 2) * 6]; }
        out.push({ key: 'wallRule', params: { count: badSegs.length + badArcs.length }, at: at, show: { segs: badSegs, arcs: badArcs } });
    }
    return out;
}

// ---- Fixing problems -----------------------------------------------------------------------------
// fixProblem(map, problem, borders) does what can be done for a problem and returns the border
// walls set (as syncBorderWalls), or null when it cannot be fixed here (the custom room 4 picture
// has to be drawn). FIXABLE: the problems it handles.

const FIXABLE = ['noStart', 'presetNotSupported', 'room4Checkpoint', 'conn.notConnected', 'conn.passageNoRoom',
    'conn.passageMisplaced', 'conn.unmarkedGap', 'victimNoWall', 'victimInPassage', 'victimMisplaced', 'victimUnreachable', 'wallRule'];
// fixed by drawing in the room 4 creator
const DRAW_FIX = ['customRoom4NoPicture', 'room4Untyped', 'room4Unreachable'];

// A start tile: a plain room 1 tile, looked for from the bottom left
function fixStart(map: MapData) {
    for (let y = 2 * map.length - 1; y > 0; y -= 2) {
        for (let x = 1; x < 2 * map.width; x += 2) {
            const t = tileOf(map, x, y);
            if (roomOf(map, x, y) !== 1 || !t || t.black || t.swamp || t.color) continue;
            map.startTile = { x: x, y: y, z: 0 };
            return true;
        }
    }
    return false;
}

// A passage for a room that is not reached: border places towards a reached room (room 1 first)
// are tried one after the other until one joins the room
function connectRoom(map: MapData, room: number, borders: Set<string>): Set<string> {
    const reachedRooms = function () {
        const conn = W.connectionStatus(map);
        const r: Record<number, boolean> = { 1: true };
        conn.rooms.forEach(function (e: any) { if (e.reached) r[e.room] = true; });
        return r;
    };
    const reached = reachedRooms();
    if (reached[room]) return borders;
    const cands: { ex: number; ey: number; score: number }[] = [];
    for (let x = 1; x < 2 * map.width; x += 2) {
        for (let y = 1; y < 2 * map.length; y += 2) {
            [[2, 0], [0, 2]].forEach(function (d) {
                const b = borderAt(map, x + d[0] / 2, y + d[1] / 2);
                if (!b) return;
                const other = b.ra === room ? b.rb : b.rb === room ? b.ra : 0;
                if (!other || !reached[other]) return;
                const ta = tileOf(map, b.a[0], b.a[1]), tb = tileOf(map, b.b[0], b.b[1]);
                if ((ta && (ta.black || ta.color)) || (tb && (tb.black || tb.color))) return;
                cands.push({ ex: x + d[0] / 2, ey: y + d[1] / 2, score: (other === 1 ? 0 : 1) });
            });
        }
    }
    cands.sort(function (a, b) { return a.score - b.score; });
    for (let i = 0; i < Math.min(cands.length, 80); i++) {
        const keep = JSON.stringify(map.cells);
        togglePassage(map, cands[i].ex, cands[i].ey);
        const after = syncBorderWalls(map, borders);
        const conn = W.connectionStatus(map);
        const ok = conn.rooms.some(function (e: any) { return e.room === room && e.reached; })
            && !conn.issues.some(function (is: any) { return is.key === 'passageMisplaced'; });
        if (ok) return after;
        map.cells = JSON.parse(keep);
    }
    return borders;
}

function fixProblem(map: MapData, p: Problem, borders: Set<string>): Set<string> | null {
    const key = p.key;
    if (key === 'noStart') { fixStart(map); return borders; }
    if (key === 'presetNotSupported') {
        map.area4Room = W.area4Presets()[(map.roomTiles[2] || []).length ? 1 : 0];
        return resyncBorderWalls(map, borders);
    }
    if (key === 'room4Checkpoint') {
        (p.show && p.show.tiles || []).forEach(function (t) {
            const tile = ensureTile(map, 2 * t[0] + 1, 2 * t[1] + 1);
            FLOORS.forEach(function (f) { tile[f] = false; });
            tile.checkpoint = true;
            tile.cpAuto = true;
        });
        return borders;
    }
    if (key === 'conn.notConnected') return connectRoom(map, p.params.room, borders);
    if (key === 'conn.passageNoRoom' || key === 'conn.passageMisplaced') {
        (p.show && p.show.tiles || []).forEach(function (t) { clearPassage(map, 2 * t[0] + 1, 2 * t[1] + 1); });
        prunePassages(map);
        const after = resyncBorderWalls(map, borders);
        // a room the passage joined is joined again another way
        return [2, 3, 4].reduce(function (b, room) { return connectRoom(map, room, b); }, after);
    }
    if (key === 'conn.unmarkedGap') return resyncBorderWalls(map, borders);
    if (key === 'victimNoWall') {
        for (let x = 1; x < 2 * map.width; x += 2) {
            for (let y = 1; y < 2 * map.length; y += 2) {
                const v = edgeVictim(map, x, y);
                if (v && !hasWall(map, x, y, v.dir)) clearVictim(map, x, y);
                for (let i = 0; i < 16; i++) if (slotVictim(map, x, y, i) && !slotHasWall(map, x, y, i)) clearSlotVictim(map, x, y, i);
            }
        }
        return borders;
    }
    if (key === 'victimInPassage') {
        allVictims(map).filter(function (w) { return isPassage(map, w.x, w.y); }).forEach(function (w) { removeVictim(map, w); });
        return borders;
    }
    if (key === 'victimUnreachable') {
        // the victims at the places the problem points out
        const at = new Set((p.show && p.show.points || []).map(function (q) { return q[0] + ',' + q[1]; }));
        allVictims(map).filter(function (w) { const q = victimPlace(map, w).at; return at.has(q[0] + ',' + q[1]); })
            .forEach(function (w) { removeVictim(map, w); });
        return borders;
    }
    if (key === 'victimMisplaced') {
        misplacedVictims(map).forEach(function (w) { settleVictim(map, w); });
        return borders;
    }
    if (key === 'wallRule') {
        const room = roomLookup(map);
        (p.show && p.show.segs || []).forEach(function (s) {
            const rule = L.segRule(s, room, rulesOf(map).rooms);
            if (!rule.ok) L.setSeg(map, s, false);
            else if (rule.whole) L.setSeg(map, L.otherHalf(s)!, true);   // beside room 1: the whole tile edge
        });
        (p.show && p.show.arcs || []).forEach(function (a) { L.setArc(map, a.x, a.y, a.q, 0); });
        return borders;
    }
    return null;
}

// Every problem that can be fixed, in an order where one fix does not undo another
function fixAll(map: MapData, borders: Set<string>, picture?: Room4Picture | null): Set<string> {
    const order = ['presetNotSupported', 'conn.passageNoRoom', 'conn.passageMisplaced', 'conn.unmarkedGap', 'wallRule',
        'conn.notConnected', 'room4Checkpoint', 'victimNoWall', 'victimInPassage', 'victimMisplaced', 'victimUnreachable', 'noStart'];
    order.forEach(function (key) {
        problems(map, picture).filter(function (p) { return p.key === key; }).forEach(function (p) {
            const after = fixProblem(map, p, borders);
            if (after) borders = after;
        });
    });
    return borders;
}

// The map as the classic editor saves it (its JSON export)
function saved(map: MapData) {
    return {
        name: map.name, length: map.length, height: map.height, width: map.width, finished: map.finished,
        startTile: map.startTile, cells: map.cells, roomTiles: map.roomTiles, time: map.time,
        area4Room: map.area4Room, room4CanvasSave: map.room4CanvasSave || null,
        room4VicTypes: map.room4VicTypes || [], room4Tokens: map.room4Tokens || [], connCheckOff: !!map.connCheckOff,
        rules: map.rules || FIRST_YEAR
    };
}

// The world (.wbt) of the map; worked out on a copy, so the map is left as it is. A custom room 4
// needs room4(copy) = the hooks that read its picture (SimRoom4World2026, browser only).
// A value that is not a number in it (NaN, undefined) would make Webots read nothing at all and open
// an empty world: it is not given out, but thrown as a BrokenWorld with the line it is on.
function world(map: MapData, room4?: (copy: MapData) => Partial<WorldHooks>): string {
    const m = JSON.parse(JSON.stringify(saved(map)));
    m.area4 = W.area4Presets();
    W.recalculate(m);
    const text = rulesOf(map).export.createWorld(m, room4 ? room4(m) : {});
    const bad = text.match(/^.*\b(NaN|undefined|Infinity)\b.*$/m);
    if (bad) throw new BrokenWorld(bad[0].trim());
    return text;
}

class BrokenWorld extends Error {
    line: string;
    constructor(line: string) {
        super('The world has a value that is not a number: ' + line);
        this.line = line;
    }
}

export {
    tokenKind,
    isTarget,
    setFloorKind,
    floorKind,
    BrokenWorld,
    SIDES,
    key,
    inMap,
    isOutside,
    tileOf,
    newMap,
    normalize,
    resize,
    isOuterEdge,
    roomOf,
    roomLookup,
    setRoom,
    borderEdges,
    syncBorderWalls,
    borderAt,
    togglePassage,
    FIXABLE,
    DRAW_FIX,
    readRoom4Picture,
    room4Unreached,
    fixProblem,
    fixAll,
    passageSide,
    resyncBorderWalls,
    copyRegion,
    clearRegion,
    pasteRegion,
    insertLine,
    removeLine,
    clearPassage,
    wallPlan,
    setWalls,
    segNear,
    setFloor,
    hasWall,
    edgeVictim,
    victimRule,
    setVictim,
    clearVictim,
    arcCentre,
    arcChoice,
    setCurve,
    arcNear,
    slotHasWall,
    slotPos,
    victimPlace,
    victimOffset,
    victimFits,
    victimRange,
    offsetToward,
    moveVictim,
    misplacedVictims,
    allVictims,
    slotAt,
    slotVictim,
    slotRule,
    setSlotVictim,
    clearSlotVictim,
    victimAt,
    changeVictim,
    removeVictim,
    robotReach,
    problems,
    saved,
    world

};
