// What one year's rules give the editor (a Ruleset). The editor itself is the same for every year:
// what a room takes, the victims there are, the checks, the score and the world file all come from
// the ruleset of the map's year (rules/registry.ts: rulesOf). A year is a manifest (rules/y2026.ts)
// that picks a version of each part (rules/parts); a part is copied to a new version only when a
// year changes it, so the years that do not change it keep sharing it.
import type { MapData } from '../lib/types';
import type { Room4Picture } from '../lib/model';

// Sizes of the field and the robot, cm
export interface Geometry {
    tileCm: number;         // a tile
    wallHalfCm: number;     // half a wall's thickness
    robotRadiusCm: number;  // the robot, as the editor reckons where it gets to
    identifyCm: number;     // how near the robot's centre comes to a token to identify it
}

// The walls a room takes, and where its victims go. A kind of wall is drawn only in the rooms that
// take it (the tools refuse it elsewhere, and a tile leaving such a room loses it).
export interface RoomRules {
    edges: 'whole' | 'half';    // on tile edges: whole edges only (12 cm), or each half (6 cm)
    inner: boolean;             // walls inside a tile (the 6 cm grid)
    curves: boolean;            // quarter circles
    picture: boolean;           // drawn as a picture: no grid walls inside, a picture of its own
    tokens: 'edge' | 'slot' | 'picture';    // victims: one on a side of a tile, on the 6 cm faces of
                                            // its quarters, or stamps in its picture
}

// A kind of floor: in the map file, a flag of the tile (a tile has one kind at most)
export interface FloorKind {
    id: string;                 // the tile's flag ('black', 'swamp', 'checkpoint')
    icon: string;               // the icon of its choice in the floor tools (Font Awesome)
    color: string;              // how the map shows it
    hole: boolean;              // no floor there: the robot keeps off the tile
    checkpoint: boolean;        // a checkpoint (scores; wanted behind passages, see Passages)
}

// The passage between two rooms: a tile in its colour (in the map file, the tile's colour)
export interface Passage {
    from: number;
    to: number;
    color: string;
    name: string;               // text key
}
export interface Passages {
    list: Passage[];
    room4Checkpoints: boolean;  // a checkpoint right behind each passage into room 4
}

// A kind of victim (wall token)
export interface TokenKind {
    id: string;                 // as the map keeps it ('H', 'S', 'U', 'CT')
    family: 'letter' | 'target';    // a letter (its symbol; turned; can be fake) or a ring target
                                    // (its ring code; its type from the code, or fake)
    symbol: string;             // what the editor shows for it
    nameKey: string;            // its name (text key)
    widthCm: number;            // across, on its wall
    fakeable: boolean;          // can be a fake (3D letters)
    // in the map file: the letter on a tile side, and the value of a 6 cm face (halfWallVic);
    // a target's are its type's (target.letter / target.slot)
    edge?: string;
    slot?: string;
}

// A stamp of the room 4 picture (its colour in the picture names the kind)
export interface StampType {
    idx: number;
    kind: string;               // 'victim', 'fake', 'ct', 'fakect'
    symbol: string;
    color: string;
    name: string;
}

export interface Tokens {
    kinds: TokenKind[];
    gapCm: number;              // the least room between two tokens
    inPassages: boolean;        // whether tokens may go in a passage between areas
    // ring targets: the type a ring code gives ('F', 'P', 'C', 'O'; null: a fake), a random code of a
    // type ('X': a fake), and the value of each type in the map file (halfWallVic)
    target: {
        typeOf(code: string | null | undefined): string | null;
        randomCode(type: string): string;
        slot: Record<string, number>;
    };
    stamps: StampType[];        // the room 4 picture's stamps
}

// The most a robot can score on a map: by area, and in all
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

export interface Scoring {
    maxScore(map: MapData, picture: Room4Picture | null): MaxScore | null;
}

// What a custom room 4 adds to the world file (read from its picture)
export interface WorldHooks {
    createArea4Solid(): string;
    createArea4Victims(humanId: number, hazardId: number): [string, string, string];
    room4CorrectSize?(): boolean;
}

// The world file, for the version of Erebus the year is played on
export interface Exporter {
    erebus: string;
    // the world of a map (prepared: its reach worked out), with the hooks of a custom room 4
    createWorld(map: MapData, hooks: Partial<WorldHooks>): string;
    // the hooks that read a custom room 4 picture (browser only)
    room4(map: MapData): Partial<WorldHooks>;
}

export interface Ruleset {
    year: number;
    book: string;                       // the rule book (its URL)
    geometry: Geometry;
    rooms: Record<number, RoomRules>;   // rooms 1-4
    floors: FloorKind[];
    passages: Passages;
    tokens: Tokens;
    scoring: Scoring;
    export: Exporter;
    // rule numbers the texts cite, by what they are about (texts write {{rule_reach}} and so on)
    refs: Record<string, string>;
}
