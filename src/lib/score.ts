// The most a robot can score on a map (RoboCupJunior Rescue Simulation 2026 rules, 5.6 Scoring):
//   - wall token identification (TI): a letter victim 5 on a linear tile, 15 on a floating tile or in
//     room 4; a cognitive target 10 / 30. On the 6 cm walls of rooms 2 and 3 a letter victim is worth
//     half (as the world export writes its scoreWorth). Fake victims, and targets whose rings add up
//     to no type, are worth nothing (they must not be reported).
//   - wall token type identification (TT): a letter victim 10, a cognitive target 20
//   - checkpoint negotiation (CN): 10 for each checkpoint
//   - each of these times the area multiplier: 1, 1.25, 1.5, 2 for rooms 1-4
//   - exit bonus (EB): 10 % more; mapping bonus (MB): times (correctness * 1.2 + 1), 2.2 at most
// Only what the robot can get to counts: tokens and checkpoints on tiles reached from the start, in
// rooms joined by their passages, and tokens the robot can come near (lib/model's robotReach, with
// the walls of a custom room 4 picture). A token the robot cannot get to, or a room 4 stamp with no
// type, is a problem of the map (lib/model's problems); it is left out here.
import type { MapData } from './types';
import * as M from './model';
import * as W from './world2026';
import * as L from './lattice';

export const MULTIPLIER: Record<number, number> = { 1: 1, 2: 1.25, 3: 1.5, 4: 2 };
export const EXIT_BONUS = 0.1;
export const MAP_BONUS_MAX = 1 * 1.2 + 1;

export interface AreaScore {
    room: number;
    multiplier: number;
    victims: number;        // letter victims that score
    targets: number;        // cognitive targets that score
    checkpoints: number;
    points: number;         // TI + TT + CN, times the multiplier
}

export interface MaxScore {
    areas: AreaScore[];
    field: number;          // all areas
    withExit: number;       // and the exit bonus
    withMap: number;        // and the most the mapping bonus gives
    // left out: tokens that score but cannot be got to, and checkpoints that cannot
    unreachableTokens: number;
    unreachableCheckpoints: number;
    untypedTokens: number;  // room 4 stamps with no type (left out)
    room4Preset: boolean;   // a room 4 preset (not counted: this editor makes room 4 as a picture)
}

// the points of a token: [TI, TT]
function letterPoints(linear: boolean, halfWall: boolean): [number, number] {
    const ti = halfWall ? (linear ? 10 : 30) / 2 : (linear ? 5 : 15);
    return [ti, 10];
}
function targetPoints(linear: boolean): [number, number] {
    return [linear ? 10 : 30, 20];
}

// room 4 picture stamps by the export's scoring types: 0-2 letter victims, 3-6 targets (P O F C),
// 7 a fake target, 8-10 fake victims
function stampPoints(type: number): { kind: 'victim' | 'target' | 'none'; points: [number, number] } {
    if (type >= 0 && type <= 2) return { kind: 'victim', points: [15, 10] };
    if (type >= 3 && type <= 6) return { kind: 'target', points: [30, 20] };
    return { kind: 'none', points: [0, 0] };
}

// null without a start tile (nothing can be reached)
export function maxScore(map: MapData, picture: M.Room4Picture | null): MaxScore | null {
    const st = map.startTile;
    if (!st || !(st.x > 0 && st.y > 0)) return null;
    // reachable tiles and linear tiles, as the export works them out
    const copy = JSON.parse(JSON.stringify(M.saved(map)));
    W.recalculate(copy);
    const reachedTile = function (x: number, y: number) { const c = copy.cells[M.key(x, y)]; return !!(c && c.reachable); };
    const linearTile = function (x: number, y: number) { const c = copy.cells[M.key(x, y)]; return !!(c && c.isLinear); };
    // tokens the robot cannot come near (it cannot get close enough to identify them)
    const reach = M.robotReach(map, picture);
    const lost = new Set((reach ? reach.victims : []).map(function (p) { return p[0] + ',' + p[1]; }));
    const reachedRooms: Record<number, boolean> = { 1: true };
    W.connectionStatus(map).rooms.forEach(function (r: any) { if (r.reached) reachedRooms[r.room] = true; });

    const areas: Record<number, AreaScore> = {};
    [1, 2, 3, 4].forEach(function (room) {
        areas[room] = { room: room, multiplier: MULTIPLIER[room], victims: 0, targets: 0, checkpoints: 0, points: 0 };
    });
    let unreachableTokens = 0, unreachableCheckpoints = 0, untypedTokens = 0;
    const add = function (room: number, kind: 'victim' | 'target', points: [number, number]) {
        const a = areas[room];
        if (kind === 'victim') a.victims++; else a.targets++;
        a.points += (points[0] + points[1]) * a.multiplier;
    };

    for (let x = 1; x < 2 * map.width; x += 2) {
        for (let y = 1; y < 2 * map.length; y += 2) {
            const room = M.roomOf(map, x, y);
            if (!room) continue;
            const tile = M.tileOf(map, x, y);
            const reached = room === 4 ? !!reachedRooms[4] : reachedTile(x, y) && !!reachedRooms[room];
            const linear = room !== 4 && linearTile(x, y);
            if (tile && tile.checkpoint) {
                if (reached) { areas[room].checkpoints++; areas[room].points += 10 * areas[room].multiplier; }
                else unreachableCheckpoints++;
            }
            if (room === 4) continue;      // room 4's tokens are in its picture
            // a token on a side of the tile
            const v = M.edgeVictim(map, x, y);
            if (v && M.hasWall(map, x, y, v.dir)) {
                const kind = v.type === 'CT' ? (W.cognitiveCodeToVictimLetter(v.code) ? 'target' : null) : (v.fake ? null : 'victim');
                if (kind) {
                    const d = M.SIDES[v.dir];
                    if (reached && !lost.has((6 * x + 4 * d[0]) + ',' + (6 * y + 4 * d[1]))) add(room, kind, kind === 'target' ? targetPoints(linear) : letterPoints(linear, false));
                    else unreachableTokens++;
                }
            }
            // tokens on the 6 cm walls (rooms 2 and 3)
            for (let i = 0; i < 16; i++) {
                const s = M.slotVictim(map, x, y, i);
                if (!s || !M.slotHasWall(map, x, y, i)) continue;
                const kind = s.type === 'CT' ? (W.cognitiveCodeToVictimLetter(s.code) ? 'target' : null) : (s.fake ? null : 'victim');
                if (!kind) continue;
                const at = L.slotPoint(x, y, i, tile && tile.curve).at;
                if (reached && !lost.has(at[0] + ',' + at[1])) add(room, kind, kind === 'target' ? targetPoints(linear) : letterPoints(linear, true));
                else unreachableTokens++;
            }
        }
    }

    // room 4: the stamps of its picture (a preset is not counted)
    const room4Preset = !!(map.area4Room && map.area4Room.type >= 2);
    if (!room4Preset && picture && map.room4CanvasSave) {
        const lost = new Set((reach ? M.room4Unreached(map, picture, reach) : []).map(function (u) { return u.index; }));
        picture.tokens.forEach(function (t, index) {
            if (!(t.type >= 0 && t.type <= 10)) { untypedTokens++; return; }
            const p = stampPoints(t.type);
            if (p.kind === 'none') return;
            if (reachedRooms[4] && !lost.has(index)) add(4, p.kind, p.points);
            else unreachableTokens++;
        });
    }

    const list = [1, 2, 3, 4].map(function (r) { return areas[r]; });
    const field = list.reduce(function (sum, a) { return sum + a.points; }, 0);
    // the exit bonus needs one token identified at least
    const tokens = list.reduce(function (sum, a) { return sum + a.victims + a.targets; }, 0);
    const withExit = tokens ? field * (1 + EXIT_BONUS) : field;
    return {
        areas: list, field: field, withExit: withExit, withMap: withExit * MAP_BONUS_MAX,
        unreachableTokens: unreachableTokens, unreachableCheckpoints: unreachableCheckpoints, untypedTokens: untypedTokens, room4Preset: room4Preset
    };
}
