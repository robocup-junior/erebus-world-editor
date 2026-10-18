// The field of a map, read the same way whatever the year: which room each tile is in, room 4's
// place and its presets, the passages between rooms and whether the robot gets through them (the
// connection check), the walls as shapes in cm, and the tiles the robot reaches from the start
// (recalculate: reachable and linear tiles, as the export and the score read them). The sizes it
// reckons with (the robot, the walls) are the map's year's (rules: geometry). Works on the map as
// the editor holds it: cells keyed "x,y,z" (tiles at odd x and y, the edges between them at even
// ones), roomTiles, startTile, area4Room.
import type { MapData, Tile, Pt } from './types';
import { rulesOf } from '../rules/registry';

export interface Bounds { minX: number; maxX: number; minY: number; maxY: number }
export interface Room4Region extends Bounds { w: number; h: number; isRect: boolean }
// A wall of the map in cm: a straight piece, or a quarter circle from (cx + dx r, cy) to (cx, cy + dy r)
export type WallShape =
    | { type: 'seg'; x1: number; y1: number; x2: number; y2: number }
    | { type: 'arc'; cx: number; cy: number; r: number; dx: number; dy: number };
export interface RoomPassage { from: number; to: number; color: string; [key: string]: any }
export interface MapGeometry {
    width: number; length: number; tileCm: number; wallHalfCm: number; robotRadiusCm: number;
    shapes: WallShape[]; holes: Pt[]; start: { x: number; y: number } | null; [key: string]: any;
}

// DISABLE_RANDOMNESS (set by the editor page, or by tests) makes the export the same every time
function noRandom() {
    return typeof DISABLE_RANDOMNESS !== 'undefined' && DISABLE_RANDOMNESS;
}

const UP = 0, RIGHT = 1, DOWN = 2, LEFT = 3;

// Room 4 presets (Erebus Area4_1 / Area4_2); a new list each time, with new token turns
function area4Presets() {
    return [
        {value: "None", type: 0},
        {value: "Custom Room", type: 1},
        {
            value: "Option 1 (7x5)", 
            type: 2,
            width: 7,
            height: 5,
            room1Tile: [0, -1],
            room3Tile: [6, -1],
            humans: [
                {
                    x: 0.01,
                    z: 0.238,
                    rot: 1.5708,
                    frontRotation: getRandomAngle(),
                    type: "harmed",
                    score: 15,
                }
            ],
            hazards: [
                {
                    x: 0.548,
                    z: 0.193396,
                    rot: 1.05,
                    frontRotation: getRandomAngle(),
                    type: "P",
                    score: 30,
                }
            ],
        },
        {
            value: "Option 2 (6x6)", 
            type: 3,
            width: 6,
            height: 6,
            room1Tile: [-1, 0],
            room3Tile: [2, 6],
            humans: [
                {
                    x: 0.33,
                    z: 0.3,
                    rot: 0,
                    frontRotation: getRandomAngle(),
                    type: "unharmed",
                    score: 15,
                },
                {
                    x: 0.4991,
                    z: 0.27366,
                    rot: 2.0944,
                    frontRotation: getRandomAngle(),
                    type: "harmed",
                    score: 15,
                }
            ],
            hazards: [
                {
                    x: 0.14,
                    z: 0.299,
                    rot: 0,
                    frontRotation: getRandomAngle(),
                    type: "C",
                    score: 30,
                },
                {
                    x: 0.564142,
                    z: 0.474142,
                    rot: 0.785398,
                    frontRotation: getRandomAngle(),
                    type: "P",
                    score: 30,
                }
            ],
        },
    ];
}

function getRandomAngle() {
    if (noRandom()) return 0
    return Math.random() * 3.14 * 2.0
}

function checkRoomNumber(map: MapData, x: number, y: number, z: number): number {
    for (let i = 0; i < map.roomTiles.length; i++) {
        if(map.roomTiles[i].find(cord => cord === `${x},${y},${z}`)){
            return i + 2;
        }
    }
    return 1;
}

function checkRoomNumberKey(map: MapData, key: string): number {
    for (let i = 0; i < map.roomTiles.length; i++) {
        if(map.roomTiles[i].find(cord => cord === key)){
            return i + 2;
        }
    }
    return 1;
}

// ---- Room 4 presets: where they can go -------------------------------------------------
function room4Region(map: MapData): Room4Region | null {
    const tiles = (map.roomTiles && map.roomTiles[2]) || [];
    if (!tiles.length) return null;
    const pts = tiles.map(function (key) {
        const p = key.split(',').map(Number);
        return [(p[0] - 1) / 2, (p[1] - 1) / 2];
    });
    const xs = pts.map(function (p) { return p[0]; });
    const ys = pts.map(function (p) { return p[1]; });
    const r: any = { minX: Math.min.apply(null, xs), maxX: Math.max.apply(null, xs), minY: Math.min.apply(null, ys), maxY: Math.max.apply(null, ys) };
    r.w = r.maxX - r.minX + 1;
    r.h = r.maxY - r.minY + 1;
    r.isRect = new Set(pts.map(function (p) { return p[0] + ',' + p[1]; })).size === r.w * r.h;
    return r;
}

function inMap(map: MapData, p: Pt): boolean {
    return p[0] >= 0 && p[1] >= 0 && p[0] < map.width && p[1] < map.length;
}

// ---- Passages between rooms -----------------------------------------------------------
// Areas are joined by one-tile passages with a coloured floor (rules 3.3.2 / 3.3.4 / 3.4). Where
// two different rooms meet, every gap a robot might get through has to be such a passage tile
// (or be closed by a wall). A passage tile belongs to one of its two rooms and opens onto both,
// and a room counts as connected once passages link it, directly or through other rooms, to room 1.
const ROOM_PASSAGES = [
    { color: '#1a1ae6', from: 1, to: 2, name: 'admin.simMapEditor.passageBlue' },
    { color: '#e7e71a', from: 1, to: 3, name: 'admin.simMapEditor.passageYellow' },
    { color: '#08D508', from: 1, to: 4, name: 'admin.simMapEditor.passageGreen' },
    { color: '#4d1a99', from: 2, to: 3, name: 'admin.simMapEditor.passagePurple' },
    { color: '#e7991a', from: 2, to: 4, name: 'admin.simMapEditor.passageOrange' },
    { color: '#e71a1a', from: 3, to: 4, name: 'admin.simMapEditor.passageRed' }
];

// Room number of every tile on the first floor, keyed by tile index "x,y"
function tileRooms(map: MapData): Record<string, number> {
    const rooms: Record<string, number> = {};
    for (let x = 0; x < map.width; x++) for (let y = 0; y < map.length; y++) rooms[x + ',' + y] = 1;
    (map.roomTiles || []).forEach(function (list, i) {
        (list || []).forEach(function (key) {
            const p = key.split(',').map(Number);
            const k = (p[0] - 1) / 2 + ',' + (p[1] - 1) / 2;
            if (p[2] === 0 && k in rooms) rooms[k] = i + 2;
        });
    });
    return rooms;
}

function tileNeighbours(k: string, rooms: Record<string, number>): string[] {
    const p = k.split(',').map(Number);
    return [[1, 0], [-1, 0], [0, 1], [0, -1]]
        .map(function (d) { return (p[0] + d[0]) + ',' + (p[1] + d[1]); })
        .filter(function (n) { return n in rooms; });
}

function tileAt(map: MapData, k: string): Tile | undefined {
    const p = k.split(',').map(Number);
    const cell = map.cells[(2 * p[0] + 1) + ',' + (2 * p[1] + 1) + ',0'];
    return cell && cell.tile;
}

// ---- Where the robot fits ---------------------------------------------------------------
// Sizes in cm: 12 cm tiles (the grid of the map file), and the walls and the robot of the map's
// year (rules: geometry; 2026: 1 cm walls, a robot body that is a cylinder of radius 3.7 cm,
// E-puck-custom-default-FLU.proto). So a half-tile gap (5 cm between the walls) is too narrow,
// while a whole tile or a half wall next to an open edge is not.
const TILE_CM = 12;

// Wall centre lines on the first floor: tile edges, half walls, inner half walls and the
// quarter-circle walls (radius 6 cm, centred on a corner of their quarter tile)
function wallShapes(map: MapData): WallShape[] {
    const shapes: WallShape[] = [];
    const seg = function (x1: number, y1: number, x2: number, y2: number) { shapes.push({ type: 'seg', x1: x1, y1: y1, x2: x2, y2: y2 }); };
    Object.keys(map.cells).forEach(function (key) {
        const p = key.split(',').map(Number);
        if (p[2] !== 0) return;
        const cell = map.cells[key];
        const ex = p[0], ey = p[1];
        if (ex % 2 === 0 && ey % 2 === 1) {          // vertical edge; half wall 1 = lower half
            if (cell.isWall) seg(6 * ex, 6 * (ey - 1), 6 * ex, 6 * (ey + 1));
            else if (cell.halfWall == 1) seg(6 * ex, 6 * ey, 6 * ex, 6 * (ey + 1));
            else if (cell.halfWall == 2) seg(6 * ex, 6 * (ey - 1), 6 * ex, 6 * ey);
        } else if (ex % 2 === 1 && ey % 2 === 0) {   // horizontal edge; half wall 1 = left half
            if (cell.isWall) seg(6 * (ex - 1), 6 * ey, 6 * (ex + 1), 6 * ey);
            else if (cell.halfWall == 1) seg(6 * (ex - 1), 6 * ey, 6 * ex, 6 * ey);
            else if (cell.halfWall == 2) seg(6 * ex, 6 * ey, 6 * (ex + 1), 6 * ey);
        } else if (ex % 2 === 1 && ey % 2 === 1 && cell.tile) {
            const cx = 6 * ex, cy = 6 * ey;          // tile centre
            const inner = cell.tile.halfWallIn || [];
            if (inner[0]) seg(cx, cy - 6, cx, cy);    // up, right, down, left from the centre
            if (inner[1]) seg(cx, cy, cx + 6, cy);
            if (inner[2]) seg(cx, cy, cx, cy + 6);
            if (inner[3]) seg(cx - 6, cy, cx, cy);
            (cell.tile.curve || []).forEach(function (v, q) {
                if (!v) return;
                // quarter tiles NW, NE, SW, SE; the curve value names where the arc bulges, so
                // its centre is the opposite corner: 1 (NE) -> SW, 2 (SE) -> NW, 3 (SW) -> NE, 4 (NW) -> SE
                const ox = cx - 6 + (q % 2) * 6, oy = cy - 6 + Math.floor(q / 2) * 6;
                const c = [[0, 6], [0, 0], [6, 0], [6, 6]][(v as number) - 1];
                if (!c) return;
                shapes.push({ type: 'arc', cx: ox + c[0], cy: oy + c[1], r: 6, dx: c[0] === 0 ? 1 : -1, dy: c[1] === 0 ? 1 : -1 });
            });
        }
    });
    return shapes;
}

function shapeDistance(s: WallShape, x: number, y: number): number {
    if (s.type === 'seg') {
        const vx = s.x2 - s.x1, vy = s.y2 - s.y1;
        const t = Math.max(0, Math.min(1, ((x - s.x1) * vx + (y - s.y1) * vy) / (vx * vx + vy * vy)));
        return Math.hypot(x - s.x1 - t * vx, y - s.y1 - t * vy);
    }
    // the arc runs from (cx + dx r, cy) to (cx, cy + dy r)
    const px = x - s.cx, py = y - s.cy;
    if (px * s.dx >= 0 && py * s.dy >= 0) return Math.abs(Math.hypot(px, py) - s.r);
    return Math.min(Math.hypot(px - s.dx * s.r, py), Math.hypot(px, py - s.dy * s.r));
}

// fits(x, y): whether the robot body fits with its centre at (x, y) cm
function robotFits(map: MapData): (x: number, y: number) => boolean {
    const g = rulesOf(map).geometry;
    const reach = g.robotRadiusCm + g.wallHalfCm;
    const buckets: Record<string, WallShape[]> = {};
    wallShapes(map).forEach(function (s) {
        const box = s.type === 'seg'
            ? [Math.min(s.x1, s.x2), Math.min(s.y1, s.y2), Math.max(s.x1, s.x2), Math.max(s.y1, s.y2)]
            : [s.cx - s.r, s.cy - s.r, s.cx + s.r, s.cy + s.r];
        for (let i = Math.floor((box[0] - reach) / TILE_CM); i <= Math.floor((box[2] + reach) / TILE_CM); i++)
            for (let j = Math.floor((box[1] - reach) / TILE_CM); j <= Math.floor((box[3] + reach) / TILE_CM); j++)
                (buckets[i + ',' + j] = buckets[i + ',' + j] || []).push(s);
    });
    return function (x, y) {
        const list = buckets[Math.floor(x / TILE_CM) + ',' + Math.floor(y / TILE_CM)] || [];
        return list.every(function (s) { return shapeDistance(s, x, y) >= reach; });
    };
}

// Whether the robot can cross the edge between the neighbouring tiles a and b: somewhere on
// that edge its centre fits between the walls, and neither side is a hole
function edgePassable(map: MapData, a: string, b: string, fits: (x: number, y: number) => boolean): boolean {
    const ta = tileAt(map, a), tb = tileAt(map, b);
    if ((ta && ta.black) || (tb && tb.black)) return false;
    const p = a.split(',').map(Number), q = b.split(',').map(Number);
    for (let d = 0.125; d < TILE_CM; d += 0.25) {
        const x = p[0] === q[0] ? TILE_CM * p[0] + d : TILE_CM * Math.max(p[0], q[0]);
        const y = p[1] === q[1] ? TILE_CM * p[1] + d : TILE_CM * Math.max(p[1], q[1]);
        if (fits(x, y)) return true;
    }
    return false;
}

function passageBetween(r1: number, r2: number): RoomPassage | undefined {
    return ROOM_PASSAGES.find(function (pass) {
        return (pass.from === r1 && pass.to === r2) || (pass.from === r2 && pass.to === r1);
    });
}

function connectionStatus(map: MapData): any {
    const rooms = tileRooms(map);
    const keys = Object.keys(rooms);
    const present: Record<number, boolean> = { 1: true };
    keys.forEach(function (k) { present[rooms[k]] = true; });
    const status: any = { show: false, ok: true, rooms: [], issues: [], marks: {} };
    const fits = robotFits(map);
    // A room 4 preset brings its own walls, open only at its entrances (checked by the preset
    // placement check), so the room 4 border is left to that check
    const presetRoom4 = map.area4Room && map.area4Room.type >= 2;

    // The passage tiles that are placed, and whether each really opens onto its two rooms
    const links: RoomPassage[] = [];
    ROOM_PASSAGES.forEach(function (pass) {
        let missing = 0, misplaced = false;
        keys.forEach(function (k) {
            const tile = tileAt(map, k);
            if (!tile || tile.color !== pass.color) return;
            status.show = true;
            if (!present[pass.from] || !present[pass.to]) {
                missing = present[pass.from] ? pass.to : pass.from;
                status.marks[k] = { cls: 'bad' };
                return;
            }
            const own = rooms[k];
            const other = own === pass.from ? pass.to : pass.from;
            const opens = function (room: number) {
                return tileNeighbours(k, rooms).some(function (n) { return rooms[n] === room && edgePassable(map, k, n, fits); });
            };
            if ((own === pass.from || own === pass.to) && opens(own) && opens(other)) links.push(pass);
            else { misplaced = true; status.marks[k] = { cls: 'bad' }; }
        });
        if (missing) status.issues.push({ key: 'passageNoRoom', pass: pass, room: missing });
        if (misplaced) status.issues.push({ key: 'passageMisplaced', pass: pass });
    });

    // Gaps the robot fits through between two different rooms that are not a passage tile of their colour
    const gaps: Record<string, any> = {};
    const gapRooms: Record<number, boolean> = {};
    keys.forEach(function (k) {
        tileNeighbours(k, rooms).forEach(function (n) {
            if (k > n) return;   // each edge once
            const ra = rooms[k], rb = rooms[n];
            if (ra === rb || (presetRoom4 && (ra === 4 || rb === 4)) || !edgePassable(map, k, n, fits)) return;
            const pass = passageBetween(ra, rb)!;
            const tk = tileAt(map, k), tn = tileAt(map, n);
            if ((tk && tk.color === pass.color) || (tn && tn.color === pass.color)) return;
            if (!gaps[pass.color]) gaps[pass.color] = { key: 'unmarkedGap', pass: pass, count: 0 };
            gaps[pass.color].count++;
            gapRooms[ra] = gapRooms[rb] = true;
            // marked on the side of the higher-numbered room, the room being joined
            const t = ra > rb ? k : n;
            if (!status.marks[t] || status.marks[t].cls === 'hint') status.marks[t] = { cls: 'gap', style: { 'border-color': pass.color } };
        });
    });
    ROOM_PASSAGES.forEach(function (pass) {
        if (gaps[pass.color]) status.issues.push(gaps[pass.color]);
    });

    // Rooms reached from room 1 through the passages
    const reached: Record<number, boolean> = { 1: true };
    let grew = true;
    while (grew) {
        grew = false;
        links.forEach(function (l) {
            if (reached[l.from] !== reached[l.to]) { reached[l.from] = reached[l.to] = true; grew = true; }
        });
    }

    [2, 3, 4].forEach(function (room) {
        if (!present[room]) return;
        status.show = true;
        const own = keys.filter(function (k) { return rooms[k] === room; });
        const linked = ROOM_PASSAGES.filter(function (pass) {
            return (pass.from === room || pass.to === room) && links.indexOf(pass) > -1;
        });
        // Passages that could join this room: the rooms it borders, and the tiles on the border
        const options: { pass: RoomPassage; border: string[] }[] = [];
        ROOM_PASSAGES.forEach(function (pass) {
            if (pass.from !== room && pass.to !== room) return;
            const other = pass.from === room ? pass.to : pass.from;
            if (!present[other]) return;
            const border = own.filter(function (k) {
                return tileNeighbours(k, rooms).some(function (n) { return rooms[n] === other; });
            });
            if (border.length) options.push({ pass: pass, border: border });
        });
        const entry = { room: room, linked: linked, reached: !!reached[room], gap: !!gapRooms[room], options: options };
        status.rooms.push(entry);
        if (entry.reached) return;
        status.ok = false;
        // Where to put a passage, unless the preset frames or the gap marks already show it
        if ((room === 4 && presetRoom4) || gapRooms[room]) return;
        options.forEach(function (o) {
            o.border.forEach(function (k) {
                if (!status.marks[k]) status.marks[k] = { cls: 'hint', style: { 'border-color': o.pass.color } };
            });
        });
    });
    if (status.issues.length) status.ok = false;
    return status;
}


// For the custom room 4 creator: the map's walls (cm, as for the connection check), its holes
// and the start, to draw the walls around room 4 and work out where the robot can get to; the
// sizes are the map's year's (rules: geometry)
function mapGeometry(map: MapData): MapGeometry {
    const g = rulesOf(map).geometry;
    const holes: Pt[] = [];
    Object.keys(map.cells).forEach(function (key) {
        const p = key.split(',').map(Number);
        const cell = map.cells[key];
        if (p[2] === 0 && cell.isTile && cell.tile && cell.tile.black) holes.push([(p[0] - 1) / 2, (p[1] - 1) / 2]);
    });
    const st = map.startTile;
    const hasStart = st && st.z == 0 && st.x > 0 && st.y > 0;
    // Openings of room 4 (no whole wall towards a floor tile outside it, with the passage colour of
    // that tile) and its checkpoint tiles; rule 3.5.3 wants a checkpoint right behind each passage
    const room4: Record<string, boolean> = {};
    ((map.roomTiles && map.roomTiles[2]) || []).forEach(function (key) {
        const p = key.split(',').map(Number);
        if (p[2] === 0) room4[(p[0] - 1) / 2 + ',' + (p[1] - 1) / 2] = true;
    });
    const entrances: any[] = [], checkpoints: number[][] = [];
    Object.keys(room4).forEach(function (k) {
        const t = k.split(',').map(Number);
        const cell = map.cells[(2 * t[0] + 1) + ',' + (2 * t[1] + 1) + ',0'];
        if (cell && cell.tile && cell.tile.checkpoint) checkpoints.push(t);
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
            const nx = t[0] + d[0], ny = t[1] + d[1];
            if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.length || room4[nx + ',' + ny]) return;
            const edge = map.cells[(2 * t[0] + 1 + d[0]) + ',' + (2 * t[1] + 1 + d[1]) + ',0'];
            if (edge && edge.isWall) return;
            const next = map.cells[(2 * nx + 1) + ',' + (2 * ny + 1) + ',0'];
            if (next && next.tile && next.tile.black) return;
            // the colour of the passage to the room on the other side (1-4 green, 2-4 orange,
            // 3-4 red), or of the passage tile itself when there is one
            const tileColor = (next && next.tile && next.tile.color) || '';
            const other = checkRoomNumberKey(map, (2 * nx + 1) + ',' + (2 * ny + 1) + ',0');
            const pass = ROOM_PASSAGES.find(function (p) { return p.from === other && p.to === 4; });
            entrances.push({ tile: t, dir: d, color: tileColor || (pass ? pass.color : ''), passage: !!tileColor,
                room: other, half: !!(edge && Number(edge.halfWall) > 0) });
        });
    });
    return {
        entrances: entrances,
        checkpoints: checkpoints,
        shapes: wallShapes(map),
        holes: holes,
        width: map.width,
        length: map.length,
        start: hasStart ? { x: 6 * st.x, y: 6 * st.y } : null,
        tileCm: g.tileCm,
        wallHalfCm: g.wallHalfCm,
        robotRadiusCm: g.robotRadiusCm
    };
};

// Reachable tiles and linear walls from the start tile, as the editor works them out before
// each export (cell.reachable, cell.isLinear, cell.virtualWall), and the tile arrays the export
// reads. Creates the tile cells it reaches.
function recalculate(map: MapData): void {
    function get_cell(x: number, y: number, z: number): any {
        return map.cells[x + ',' + y + ',' + z];
    }

    function set_cell(x: number, y: number, z: number, val: any): void {
        map.cells[x + ',' + y + ',' + z] = val;
    }

    function init_cell(x: number, y: number, z: number): void {
        map.cells[x + ',' + y + ',' + z] = {};
    }

    function startNotSet() {
        return map.startTile.x == 0 && map.startTile.y == 0 && map.startTile.z == 0;
    }

    // tag recalculate
    function recalculateLinear() {
        console.log("update");
        //console.log(map.cells)
            //console.log(map.cells);
        if (startNotSet())
            return;

        // Reset all previous linear walls
        for (var index in map.cells) {
            map.cells[index].isLinear = false;
            map.cells[index].virtualWall = false;
            map.cells[index].reachable= false;
            map.cells[index].explored= false;
            if (map.cells[index].tile) {
                if(map.cells[index].tile!.curve == undefined)
                    map.cells[index].tile!.curve = [0, 0, 0, 0]; //NW quadrant, NE, SW, SE
                if(map.cells[index].tile!.halfWallIn == undefined)
                    map.cells[index].tile!.halfWallIn = [0, 0, 0, 0];
                if(!map.cells[index].tile!.halfWallVic)
                    map.cells[index].tile!.halfWallVic = [];
                if(!map.cells[index].tile!.halfWallVicRots)
                    map.cells[index].tile!.halfWallVicRots = [];
                if(!map.cells[index].tile!.halfWallVicFakes)
                    map.cells[index].tile!.halfWallVicFakes = [];
                if(!map.cells[index].tile!.halfWallCognitives)
                    map.cells[index].tile!.halfWallCognitives = [];
            }
        }
        
        // Set to virtual wall around the black tile and start tile
        let startTilePosition = map.startTile.x + "," + map.startTile.y + "," + map.startTile.z;
        for (var index in map.cells) {
            if (map.cells[index].tile) {
                if (map.cells[index].tile!.black || index == startTilePosition) {
                    var x = Number(index.split(',')[0]);
                    var y = Number(index.split(',')[1]);
                    var z = Number(index.split(',')[2]);
                    // if(map.cells[x + "," + (y-1) + "," + z]) map.cells[x + "," + (y-1) + "," + z].virtualWall = true;
                    // else map.cells[x + "," + (y-1) + "," + z] = {virtualWall: true};

                    if (!get_cell(x,   y-1, z)) init_cell(x,   y-1, z)
                    if (!get_cell(x+1, y,   z)) init_cell(x+1, y,   z)
                    if (!get_cell(x-1, y,   z)) init_cell(x-1, y,   z)
                    if (!get_cell(x,   y+1, z)) init_cell(x,   y+1, z)

                    get_cell(x,   y-1, z).virtualWall = true;
                    get_cell(x+1, y,   z).virtualWall = true;
                    get_cell(x-1, y,   z).virtualWall = true;
                    get_cell(x,   y+1, z).virtualWall = true;

                }
            }
        }

        // Start it will all 4 walls around the starting tile

        recurs(map.startTile.x - 1, map.startTile.y    , map.startTile.z);
        recurs(map.startTile.x + 1, map.startTile.y    , map.startTile.z);
        recurs(map.startTile.x,     map.startTile.y - 1, map.startTile.z);
        recurs(map.startTile.x,     map.startTile.y + 1, map.startTile.z);

        //Top Left
        recurs(map.startTile.x-1, map.startTile.y - 2, map.startTile.z);
        recurs(map.startTile.x-2, map.startTile.y - 1, map.startTile.z);

        //Top Right
        recurs(map.startTile.x+1, map.startTile.y - 2, map.startTile.z);
        recurs(map.startTile.x+2, map.startTile.y - 1, map.startTile.z);

        //Bottom Left
        recurs(map.startTile.x-1, map.startTile.y + 2, map.startTile.z);
        recurs(map.startTile.x-2, map.startTile.y + 1, map.startTile.z);

        //Bottom Right
        recurs(map.startTile.x+1, map.startTile.y + 2, map.startTile.z);
        recurs(map.startTile.x+2, map.startTile.y + 1, map.startTile.z);

        //Search reachable tiles
        quarterReachable = [];
        reachable(map.startTile.x, map.startTile.y, map.startTile.z);
    }

    const UP = 0, RIGHT = 1, DOWN = 2, LEFT = 3;
    let quarterReachable: any;

    function curveBlock(toDir: number, fromDir: number, curve: any): boolean {
        // if continuing straight, any curve wall will block
        // if curve has orientation 2 or 4, the following are blocked:
        //      UP <-> RIGHT, DOWN <-> LEFT 
        //      aka toDir + fromDir == 1 || toDir + fromDir == 5
        // if curve has orientation 1 or 3, the following are blocked:
        //      UP <-> LEFT, DOWN <-> RIGHT
        //      aka toDir + 1 and fromDir + 1 satisfies prev condition 
        const tmpToDir = (toDir + 1) % 4, tmpFromDir = (fromDir + 1) % 4;
        return curve != 0 && ((toDir == (fromDir + 2) % 4) || 
                (curve % 2 == 0 && (toDir + fromDir == 1 || toDir + fromDir == 5)) || 
                (curve % 2 == 1 && (tmpToDir + tmpFromDir == 1 || tmpToDir + tmpFromDir == 5)));
    }

    function getHalfWall(x: number, y: number, z: number): any {
        if (!get_cell(x, y, z)) return 0;
        return get_cell(x, y, z).halfWall;
    }

    function getWall(x: number, y: number, z: number): any {
        if (!get_cell(x, y, z)) return 0;
        return get_cell(x, y, z).isWall;
    }

    function blocked(x: number, y: number, z: number, halfWallSide: number): boolean {
        return getWall(x,y,z) || getHalfWall(x,y,z) == halfWallSide;
    }

    function reachable(x: number, y: number, z: number, i = -1, dir = -1): void {
        if(x<0 || x>map.width*2 || y<0 || y>map.length*2) return;
        let cell = get_cell(x, y, z);
        if (cell) {
            if (!cell.tile.halfTile) i = -1; // if going from quarter tile to full tile
            if (i == -1 && !cell.tile.halfTile) { // if going from full tile to full tile
                if (cell.reachable) return;
                cell.reachable = true;
            } else {
                const qr = quarterReachable[i+','+x+','+y+','+z];
                if ((cell.tile.curve[i] == 0 && qr != undefined) ||
                    (cell.tile.curve[i] != 0 && qr != undefined && qr.find((i: number) => {return i == dir}) != undefined)) return;

                if (qr == undefined)
                    quarterReachable[i+','+x+','+y+','+z] = [dir];
                else
                    quarterReachable[i+','+x+','+y+','+z].push(dir);
                cell.reachable = true;
            }
        } else {
            set_cell(x, y, z,
                {
                    isTile: true,
                    tile: {
                        changeFloorTo: z,
                        halfWallIn: [0,0,0,0],
                        curve: [0,0,0,0]
                    },
                    reachable: true
                }
            )
        }
        cell = get_cell(x, y, z)

        //console.log(`${x},${y},${z}`)
        //console.log(cell)

        if (cell.tile.halfTile && i == -1) {
            // check if going from non quarter title to quarter tile

            if ((dir == UP && !blocked(x,y-1,z,1)) || dir == -1)
                reachable(x,y,z,0,UP);
            if ((dir == UP && !blocked(x,y-1,z,2)) || dir == -1)
                reachable(x,y,z,1,UP);
            if ((dir == RIGHT && !blocked(x+1,y,z,2)) || dir == -1)
                reachable(x,y,z,1,RIGHT);
            if ((dir == RIGHT && !blocked(x+1,y,z,1)) || dir == -1)
                reachable(x,y,z,3,RIGHT);
            if ((dir == DOWN && !blocked(x,y+1,z,2)) || dir == -1)
                reachable(x,y,z,3,DOWN);
            if ((dir == DOWN && !blocked(x,y+1,z,1)) || dir == -1)
                reachable(x,y,z,2,DOWN);
            if ((dir == LEFT && !blocked(x-1,y,z,1)) || dir == -1)
                reachable(x,y,z,2,LEFT);
            if ((dir == LEFT && !blocked(x-1,y,z,2)) || dir == -1)
                reachable(x,y,z,0,LEFT);
        }
        else if (i == -1) {
            // full tile navigation

            //Upper
            if(!((map.cells[x+','+(y-1)+','+z] && map.cells[x+','+(y-1)+','+z].isWall))) {
                reachable(x,y-2,z,-1,DOWN)
            }

            //console.log(((cell.tile.halfWallIn[3] || cell.tile.curve[0] || cell.tile.curve[2]) && (cell.tile.halfWallIn[1] || cell.tile.curve[1] || cell.tile.curve[3])))
            //console.log(!((map.cells[x+','+(y+1)+','+z] && map.cells[x+','+(y+1)+','+z].isWall) || ((cell.tile.halfWallIn[3] || cell.tile.curve[0] || cell.tile.curve[2]) && (cell.tile.halfWallIn[1] || cell.tile.curve[1] || cell.tile.curve[3]))))
            //Bottom
            if(!((map.cells[x+','+(y+1)+','+z] && map.cells[x+','+(y+1)+','+z].isWall))) {
                reachable(x,y+2,z,-1,UP)
            }

            //Right
            if(!((map.cells[(x+1)+','+y+','+z] && map.cells[(x+1)+','+y+','+z].isWall))) {
                reachable(x+2,y,z,-1,LEFT)
            }

            //Left
            if(!((map.cells[(x-1)+','+y+','+z] && map.cells[(x-1)+','+y+','+z].isWall))) {
                reachable(x-2,y,z,-1,RIGHT)
            }
        }
        else {
            //quarter tile navigation
            // +-+-+
            // |a|b|
            // +-+-+    (1 tile)
            // |c|d|
            // +-+-+
            // a: i = 0
            // b: i = 1
            // c: i = 2
            // d: i = 3

            // dir represents direction of entry into quarter tile
            // relevant for calculating traversable curved walls

            if (i == 0) {
                if (!(blocked(x,y-1,z,1) || 
                    curveBlock(UP, dir, cell.tile.curve[i])))
                    reachable(x, y-2, z, 2, DOWN);           // up
                if (!(cell.tile.halfWallIn[UP] ||
                    curveBlock(RIGHT, dir, cell.tile.curve[i])))
                    reachable(x, y, z, 1, LEFT);             // right
                if (!(cell.tile.halfWallIn[LEFT] ||
                    curveBlock(DOWN, dir, cell.tile.curve[i])))
                    reachable(x, y, z, 2, UP);               // down
                if (!(blocked(x-1,y,z,2) || 
                    curveBlock(LEFT, dir, cell.tile.curve[i])))
                    reachable(x-2, y, z, 1, RIGHT);          // left
            }
            else if (i == 1) {
                if (!(blocked(x,y-1,z,2) || 
                    curveBlock(UP, dir, cell.tile.curve[i])))
                    reachable(x, y-2, z, 3, DOWN);
                if (!(blocked(x+1,y,z,2) || 
                    curveBlock(RIGHT, dir, cell.tile.curve[i])))
                    reachable(x+2, y, z, 0, LEFT);
                if (!(cell.tile.halfWallIn[RIGHT] ||
                    curveBlock(DOWN, dir, cell.tile.curve[i])))
                    reachable(x, y, z, 3, UP);
                if (!(cell.tile.halfWallIn[UP] ||
                    curveBlock(LEFT, dir, cell.tile.curve[i])))
                    reachable(x, y, z, 0, RIGHT);
            }
            else if (i == 2) {
                if (!(cell.tile.halfWallIn[LEFT] ||
                    curveBlock(UP, dir, cell.tile.curve[i])))
                    reachable(x, y, z, 0, DOWN);
                if (!(cell.tile.halfWallIn[DOWN] ||
                    curveBlock(RIGHT, dir, cell.tile.curve[i])))
                    reachable(x, y, z, 3, LEFT);
                if (!(blocked(x,y+1,z,1) || 
                    curveBlock(DOWN, dir, cell.tile.curve[i])))
                    reachable(x, y+2, z, 0, UP);
                if (!(blocked(x-1,y,z,1) || 
                    curveBlock(LEFT, dir, cell.tile.curve[i])))
                    reachable(x-2, y, z, 3, RIGHT);
            }
            else if (i == 3) {
                if (!(cell.tile.halfWallIn[RIGHT] ||
                    curveBlock(UP, dir, cell.tile.curve[i])))
                    reachable(x, y, z, 1, DOWN);
                if (!(blocked(x+1,y,z,1) || 
                    curveBlock(RIGHT, dir, cell.tile.curve[i])))
                    reachable(x+2, y, z, 2, LEFT);
                if (!(blocked(x,y+1,z,2) || 
                    curveBlock(DOWN, dir, cell.tile.curve[i])))
                    reachable(x, y+2, z, 1, UP);
                if (!(cell.tile.halfWallIn[DOWN] ||
                    curveBlock(LEFT, dir, cell.tile.curve[i])))
                    reachable(x, y, z, 2, RIGHT);
            }
        }
    }


    function isOdd(num: number): number {
        return num % 2;
    }

    function recurs(x: number, y: number, z: number, fromDir = -1): void {
        if (x < 0 || y < 0 || z < 0) {
            return;
        }

        let cell = get_cell(x, y, z)

        // If this is a wall that doesn't exists
        if (!cell)
            return;
        // Outside of the current maze size.
        if (x > map.width  * 2 + 1 || x < 0 ||
            y > map.length * 2 + 1 || y < 0 ||
            z > map.height         || z < 0)
            return;

        // Already visited this, returning
        if (cell.isLinear) return;

        if (cell.isWall || cell.virtualWall) {
            cell.isLinear = true;


            // horizontal walls
            if (isOdd(x) && !isOdd(y)) {
                // Set tiles around this wall to linear
                setTileLinear(x - 2, y - 1, z);
                setTileLinear(x, y - 1, z);
                setTileLinear(x + 2, y - 1, z);
                setTileLinear(x - 2, y + 1, z);
                setTileLinear(x, y + 1, z);
                setTileLinear(x + 2, y + 1, z);
                // Check neighbours
                recurs(x + 2, y, z, 3);
                recurs(x - 2, y, z, 1);
                recurs(x - 1, y - 1, z, 2);
                recurs(x - 1, y + 1, z, 0);
                recurs(x + 1, y - 1, z, 2);
                recurs(x + 1, y + 1, z, 0);
                // Explore the wall in the tile (TOP)
                exploreWallInTile(x, y - 1, z, 2);
                // Explore the wall in the tile (BOTTOM)
                exploreWallInTile(x, y + 1, z, 0);

                checkCurve(x-2, y-1, z, 3);
                checkCurve(x-2, y+1, z, 1);
                checkCurve(x+2, y-1, z, 2);
                checkCurve(x+2, y-1, z, 0);

            } // Vertical wall
            else if (!isOdd(x) && isOdd(y)) {
                // Set tiles around this wall to linear
                setTileLinear(x - 1, y - 2, z);
                setTileLinear(x - 1, y, z);
                setTileLinear(x - 1, y + 2, z);
                setTileLinear(x + 1, y - 2, z);
                setTileLinear(x + 1, y, z);
                setTileLinear(x + 1, y + 2, z);
                // Check neighbours
                recurs(x, y - 2, z, 2);
                recurs(x, y + 2, z, 0);
                recurs(x - 1, y - 1, z, 1);
                recurs(x - 1, y + 1, z, 1);
                recurs(x + 1, y - 1, z, 3);
                recurs(x + 1, y + 1, z, 3);
                // Explore the wall in the tile (LEFT)
                exploreWallInTile(x - 1, y, z, 1)
                // Explore the wall in the tile (RIGHT)
                exploreWallInTile(x + 1, y, z, 3)

                checkCurve(x-1, y-2, z, 3);
                checkCurve(x-1, y+2, z, 1);
                checkCurve(x+1, y-2, z, 2);
                checkCurve(x+1, y-2, z, 0);
            }

        }
        
        if(cell.halfWall > 0){
            if(fromDir == 4) cell.isLinear = true;
            if(x%2 == 0){
                // Vertical
                if(cell.halfWall == 1 && (fromDir == 2 || fromDir == 4)){
                    cell.isLinear = true;
                    recurs(x, y + 2, z, 0);
                    recurs(x + 1, y + 1, z, 3);
                    recurs(x - 1, y + 1, z, 1);
                    
                    // Explore the wall in the tile (LEFT)
                    exploreWallInTile(x - 1, y, z, 1)
                    // Explore the wall in the tile (RIGHT)
                    exploreWallInTile(x + 1, y, z, 3)

                    curveFromHalfWall(x-1, y, z, 1)
                    curveFromHalfWall(x+1, y, z, 3)
                }else if(cell.halfWall == 2 && (fromDir == 0 || fromDir == 4)){
                    cell.isLinear = true;
                    recurs(x, y - 2, z, 2);
                    recurs(x + 1, y - 1, z, 3);
                    recurs(x - 1, y - 1, z, 1);
                    
                    // Explore the wall in the tile (LEFT)
                    exploreWallInTile(x - 1, y, z, 1)
                    // Explore the wall in the tile (RIGHT)
                    exploreWallInTile(x + 1, y, z, 3)

                    curveFromHalfWall(x-1, y, z, 1)
                    curveFromHalfWall(x+1, y, z, 3)
                }
            }else{
                // Horizontal
                if(cell.halfWall == 1 && (fromDir == 3 || fromDir == 4)){
                    cell.isLinear = true;
                    recurs(x - 2, y, z, 1);
                    recurs(x - 1, y - 1, z, 2);
                    recurs(x - 1, y + 1, z, 0);              
                    // Explore the wall in the tile (TOP)
                    exploreWallInTile(x, y - 1, z, 2)
                    // Explore the wall in the tile (BOTTOM)
                    exploreWallInTile(x, y + 1, z, 0)

                    curveFromHalfWall(x, y-1, z, 2)
                    curveFromHalfWall(x, y+1, z, 0)
                }else if(cell.halfWall == 2 && (fromDir == 1 || fromDir == 4)){
                    cell.isLinear = true;
                    recurs(x + 2, y, z, 3);
                    recurs(x + 1, y - 1, z, 2);
                    recurs(x + 1, y + 1, z, 0);
                    // Explore the wall in the tile (TOP)
                    exploreWallInTile(x, y - 1, z, 2)
                    // Explore the wall in the tile (BOTTOM)
                    exploreWallInTile(x, y + 1, z, 0)

                    curveFromHalfWall(x, y-1, z, 2)
                    curveFromHalfWall(x, y+1, z, 0)
                }
            }
        }
    }

    function checkCurve(x: number, y: number, z: number, from: number): void {
        let cell = get_cell(x, y, z)

        // If this is a wall that doesn't exists
        if (!cell) return;
        if (!cell.tile) return;
        if (!cell.tile.curve) return;

        switch(from){
            case 0:
                if(cell.tile.curve[0] == 1 || cell.tile.curve[2] == 3){
                    halfTileFromCenter(x, y, z);
                    curveFromCenter(x, y, z, from);
                }
                break;
            case 1:
                if(cell.tile.curve[1] == 2 || cell.tile.curve[1] == 4){
                    halfTileFromCenter(x, y, z);
                    curveFromCenter(x, y, z, from);
                }
                break;
            case 2:
                if(cell.tile.curve[2] == 2 || cell.tile.curve[2] == 4){
                    halfTileFromCenter(x, y, z);
                    curveFromCenter(x, y, z, from);
                }
                break;
            case 3:
                if(cell.tile.curve[3] == 1 || cell.tile.curve[3] == 3){
                    halfTileFromCenter(x, y, z);
                    curveFromCenter(x, y, z, from);
                }
                break;
        }
    }

    function exploreWallInTile(x: number, y: number, z: number, fromDir: number): void {
        if (x < 0 || y < 0 || z < 0) {
            return;
        }
        
        let cell = get_cell(x, y, z)

        // If this is a wall that doesn't exists
        if (!cell) return;

        if(!cell.tile) return;
        if(!cell.tile.halfWallIn) return;
        if(!cell.tile.halfWallIn[fromDir]) return;
        if(cell.explored) return;
        else cell.explored = true;
        
        halfTileFromCenter(x, y, z, fromDir);
        curveFromCenter(x, y, z);
    }

    function halfTileFromCenter(x: number, y: number, z: number, exclude = -1): void {
        let cell = get_cell(x, y, z)

        // If this is a wall that doesn't exists
        if (!cell) return;

        for(let i=0; i<4; i++){
            if(cell.tile.halfWallIn[i] && i != exclude){
                switch(i){
                    case 0:
                        setTileLinear(x, y - 2, z);
                        recurs(x, y - 1, z, 4);
                        exploreWallInTile(x, y - 2, z, 2)
                        break;
                    case 1:
                        setTileLinear(x + 2, y, z);
                        recurs(x + 1, y, z, 4);
                        exploreWallInTile(x + 2, y, z, 3);
                        break;
                    case 2:
                        setTileLinear(x, y + 2, z);
                        recurs(x, y + 1, z, 4);
                        exploreWallInTile(x, y + 2, z, 0);
                        break;
                    case 3:
                        setTileLinear(x - 2, y, z);
                        recurs(x - 1, y, z, 4);
                        exploreWallInTile(x - 2, y, z, 1);
                        break;
                }

            }
        }
    }

    function curveFromHalfWall(x: number, y: number, z: number, start: number): void {
        let cell = get_cell(x, y, z)
        // If this is a wall that doesn't exists
        if (!cell) return;

        switch(start){
            case 0:
                if(cell.tile.curve[0] == 2 || cell.tile.curve[0] == 4){
                    recurs(x-1, y, z, 4);
                    setTileLinear(x-2, y, z);
                }
                if(cell.tile.curve[1] == 1 || cell.tile.curve[1] == 3){
                    recurs(x+1, y, z, 4);
                    setTileLinear(x+2, y, z);
                }
                break;
            case 1:
                if(cell.tile.curve[3] == 2 || cell.tile.curve[3] == 4){
                    recurs(x, y+1, z, 4);
                    setTileLinear(x, y+2, z);
                }
                if(cell.tile.curve[1] == 1 || cell.tile.curve[1] == 3){
                    recurs(x, y-1, z, 4);
                    setTileLinear(x, y-2, z);
                }
                break;
            case 2:
                if(cell.tile.curve[3] == 2 || cell.tile.curve[3] == 4){
                    recurs(x+1, y, z, 4);
                    setTileLinear(x+2, y, z);
                }
                if(cell.tile.curve[2] == 1 || cell.tile.curve[2] == 3){
                    recurs(x-1, y, z, 4);
                    setTileLinear(x-2, y, z);
                }
                break;
            case 3:
                if(cell.tile.curve[0] == 2 || cell.tile.curve[0] == 4){
                    recurs(x, y-1, z, 4);
                    setTileLinear(x, y-2, z);
                }
                if(cell.tile.curve[2] == 1 || cell.tile.curve[2] == 3){
                    recurs(x, y+1, z, 4);
                    setTileLinear(x, y+2, z);
                }
                break;
        }
    }

    function curveFromCenter(x: number, y: number, z: number, exclude = -1): void {
        let cell = get_cell(x, y, z)
        // If this is a wall that doesn't exists
        if (!cell) return;
        if((cell.tile.curve[0] == 1 || cell.tile.curve[0] == 3) && exclude != 0){
            // to TOP LEFT
            recurs(x - 1, y-2, z, 2);
            recurs(x - 1, y, z, 0);
            recurs(x - 2, y-1, z, 1);
            recurs(x, y-1, z, 3);
            setTileLinear(x, y-2, z);
            setTileLinear(x-2, y-2, z);
            setTileLinear(x-2, y, z);
        }
        if((cell.tile.curve[1] == 2 || cell.tile.curve[1] == 4) && exclude != 1){
            // to TOP RIGHT
            recurs(x + 1, y-2, z, 2);
            recurs(x + 1, y, z, 0);
            recurs(x + 2, y-1, z, 3);
            recurs(x, y-1, z, 1);
            setTileLinear(x, y-2, z);
            setTileLinear(x+2, y-2, z);
            setTileLinear(x+2, y, z);
        }
        if((cell.tile.curve[3] == 1 || cell.tile.curve[3] == 3) && exclude != 3){
            // to BOTTOM RIGHT
            recurs(x + 1, y+2, z, 0);
            recurs(x + 1, y, z, 2);
            recurs(x + 2, y+1, z, 3);
            recurs(x, y+1, z, 1);
            setTileLinear(x+2, y, z);
            setTileLinear(x+2, y+2, z);
            setTileLinear(x, y+2, z);
        }
        if((cell.tile.curve[2] == 2 || cell.tile.curve[2] == 4) && exclude != 2){
            // to BOTTOM LEFT
            recurs(x - 1, y+2, z, 0);
            recurs(x - 1, y, z, 2);
            recurs(x - 2, y+1, z, 1);
            recurs(x, y+1, z, 3);
            setTileLinear(x-2, y, z);
            setTileLinear(x-2, y+2, z);
            setTileLinear(x, y+2, z);
        }
    }

    function setTileLinear(x: number, y: number, z: number): void {
        if (x < 0 || y < 0 || z < 0) {
            return;
        }

        // Check that this is an actual tile, not a wall
        var cell = get_cell(x, y, z)
        if (cell) {
            cell.isLinear = true;
        } else {
            set_cell(x, y, z, {
                isTile: true,
                isLinear: true,
                tile: {
                    changeFloorTo: z
                }
            })
        }
    }

    return recalculateLinear();
}

export {
    noRandom,
    getRandomAngle,
    area4Presets,
    checkRoomNumber,
    checkRoomNumberKey,
    recalculate,
    ROOM_PASSAGES,
    room4Region,
    inMap,
    tileRooms,
    tileAt,
    wallShapes,
    connectionStatus,
    mapGeometry
};
