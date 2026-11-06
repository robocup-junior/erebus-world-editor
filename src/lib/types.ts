// The map as the editor holds it and saves it (the classic editor's JSON): cells keyed
// "x,y,z" (tiles at odd x and y, the edges between them at even ones), the room of each tile, the
// start, room 4 (a preset, or a custom picture with its stamps).

// A tile cell's tile (rooms 2 and 3 keep walls, curves and victims per quarter)
export interface Tile {
    changeFloorTo?: number;
    halfTile?: number;
    halfWallIn?: number[];
    curve?: (number | string)[];
    halfWallVic?: (number | string)[];
    halfWallVicRots?: (number | null)[];
    halfWallVicFakes?: (boolean | number)[];
    halfWallCognitives?: (string | null)[];
    victims?: Record<string, string>;
    color?: string;
    black?: boolean;
    swamp?: boolean;
    checkpoint?: boolean;
    outside?: boolean;
    [key: string]: any;
}

export interface Cell {
    isWall?: boolean;
    halfWall?: number | string;
    isTile?: boolean;
    tile?: Tile;
    isLinear?: boolean;
    virtualWall?: boolean;
    reachable?: boolean;
    explored?: boolean;
    [key: string]: any;
}

interface Point3 {
    x: number;
    y: number;
    z: number;
}

// A stamp of the custom room 4 picture: where it is (fractions of the picture), its turn (null:
// random) and the ring code of a cognitive target
export interface Room4Token {
    fx: number;
    fy: number;
    rot: number | null;
    code: string | null;
}

// An obstacle of a custom room 4: its shape as a tile's obstacle has it (lib/field: ObstacleShape; dx, dy
// unused) and its centre as fractions of room 4's box (left to right, top to bottom), as the room 4
// picture's stamps are kept: it stays where it is on the picture when room 4 is made larger or smaller
export interface Room4ObstacleData {
    shape: string; w: number; d: number; h: number; dx: number; dy: number; rot: number;
    n?: number; outline?: number[][][]; aspect?: number; icon?: string; color?: string;
    fx: number; fy: number;
}
export interface MapData {
    name: string;
    width: number;
    length: number;
    height: number;
    cells: Record<string, Cell>;
    roomTiles: string[][];
    startTile: Point3;
    area4Room: any;
    room4CanvasSave?: string | null;
    room4Tokens?: Room4Token[];
    // the obstacles of a custom room 4 (lib/field: Room4Obstacle), put anywhere in it
    room4Obstacles?: Room4ObstacleData[];
    [key: string]: any;
}

// Grid points and points in cm
export type Pt = [number, number];
