// The world file (.wbt) for Erebus 26.x: the tiles of the map (worldTile / halfTile), its walls,
// curves, victims and cognitive targets, room 4 (a preset, or a custom picture through the hooks of
// ./room4) and the supervisor. Works on a copy of the map the field has been worked out on
// (lib/field: recalculate). Erebus 27 (../erebus27) writes the same file with what it adds (Flavor).
import type { MapData, Tile, Pt } from '../../../../lib/types';
import type { WorldHooks } from '../../../types';
import { noRandom, getRandomAngle, checkRoomNumber } from '../../../../lib/field';
import { randomCognitiveCode } from '../../tokens/cognitive';

// Rotations in the world file
interface Quaternion { x: number; y: number; z: number; w: number }
interface AxisAngle { x: number; y: number; z: number; angle: number }

const UP = 0, RIGHT = 1, DOWN = 2, LEFT = 3;

// [0, 1, ..., n - 1], as the editor's range()
function range(n: number): number[] {
    const arr = [];
    for (let i = 0; i < n; i++) arr.push(i);
    return arr;
}

function checkForExternalWalls(map: MapData, pos: Pt, walls: any[][]): boolean[] {
    let thisWall = walls[pos[1]][pos[0]];
    if(!thisWall.is_reachable) return [false, false, false, false];

    //Surrounding tiles
    let around = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    let otherTiles = [false, false, false, false];

    let d = 0;

    for(let a of around){
        //Get the tiles position
        let xPos = pos[0] + a[0];
        let yPos = pos[1] + a[1];
        //If it is a valid positon
        if(xPos > -1 && xPos < map.width && yPos > -1 && yPos < map.length){
            //Add the tiles present data
            if(!walls[yPos][xPos].is_reachable) otherTiles[d] = false;
            else otherTiles[d] = true;
        }else{
            //No tile present
            otherTiles[d] = false;
        }

        //Add one to direction counter
        d = d + 1
    }
    //Convert to needed walls
    const externalsNeeded = [!otherTiles[0], !otherTiles[1], !otherTiles[2], !otherTiles[3]]
    return externalsNeeded
}


function is_truthy(v: any): boolean {
    if(v) return true;
    return false;
}

function getRandomArbitrary(min: number, max: number): number {
    if (noRandom()) return (min + max) / 2
    return Math.random() * (max - min) + min;
}

function orgRound(value: number, base: number): number {
    return Math.round(value / base) * base;
}

//tag proto file creation

const HUMAN_PLACE_TOP    = 0;
const HUMAN_PLACE_RIGHT  = 1;
const HUMAN_PLACE_BOTTOM = 2;
const HUMAN_PLACE_LEFT   = 3;

// tag quaternions
/**
* @typedef {Object} Quaternion
* @property {number} x
* @property {number} y
* @property {number} z
* @property {number} w
*/

/**
* @param {Quaternion} q
* @returns {Quaternion}
* @see {@link https://www.euclideanspace.com/maths/algebra/realNormedAlgebra/quaternions/code/index.htm} for reference implementation in java.
*/
function normalize_quaternion(q: Quaternion): Quaternion {
    let n = Math.sqrt(q.x*q.x + q.y*q.y + q.z*q.z + q.w*q.w);
    return {
        x: q.x / n,
        y: q.y / n,
        z: q.z / n,
        w: q.w / n
    }
}

/**
* @param {Quaternion} q1
* @param {Quaternion} q2
* @returns {Quaternion}
* @see {@link https://www.euclideanspace.com/maths/algebra/realNormedAlgebra/quaternions/code/index.htm} for reference implementation in java.
*/
function multiply_quaternions(q1: Quaternion, q2: Quaternion): Quaternion {
    return {
        x:  q1.x * q2.w + q1.y * q2.z - q1.z * q2.y + q1.w * q2.x,
        y: -q1.x * q2.z + q1.y * q2.w + q1.z * q2.x + q1.w * q2.y,
        z:  q1.x * q2.y - q1.y * q2.x + q1.z * q2.w + q1.w * q2.z,
        w: -q1.x * q2.x - q1.y * q2.y - q1.z * q2.z + q1.w * q2.w
    }
}

/**
* @typedef {Object} AxisAngle
* @property {number} x
* @property {number} y
* @property {number} z
* @property {number} angle
*/

/**
* @param {AxisAngle} a
* @returns {Quaternion}
* @see {@link https://www.euclideanspace.com/maths/geometry/rotations/conversions/angleToQuaternion/index.htm} for reference implementation in java.
*/
function axis_angle_to_quaternion(a: AxisAngle): Quaternion {
    let s = Math.sin(a.angle/2);
    return {
        x: a.x * s,
        y: a.y * s,
        z: a.z * s,
        w: Math.cos(a.angle/2)
    }
}

/**
* @param {Quaternion} q
* @returns {AxisAngle}
* @see {@link https://www.euclideanspace.com/maths/geometry/rotations/conversions/quaternionToAngle/index.htm} for reference implementation in java.
*/
function quaternion_to_axis_angle(q: Quaternion): AxisAngle {
    // if w>1, acos and sqrt will produce errors
    if (q.w > 1) normalize_quaternion(q);
    let angle = 2 * Math.acos(q.w);
    let s = Math.sqrt(1-q.w*q.w); // if quaternion is normalized w is less than 1, so term is always positive
    if (s < 0.001) { // avoid divide by zero
        return {
            x: q.x,
            y: q.y,
            z: q.z,
            angle: angle
        }
    } else {
        return {
            x: q.x / s, // normalize axis
            y: q.y / s,
            z: q.z / s,
            angle: angle
        }
    }
}

// tag rotation wall tokens

/**
* Calculate rotation for wall tokens
* @param {number} y_rot
* @param {number} front_rot
* @returns {AxisAngle}
*/
function calculateWallTokenRot(y_rot: number, front_rot: number): AxisAngle {
    let z_rot_quat = axis_angle_to_quaternion({x: 0, y: 0, z: 1, angle: front_rot})
    let y_rot_quat = axis_angle_to_quaternion({x: 0, y: 1, z: 0, angle: y_rot    }) 
    /**
    * Multiplying two quaternions is equivalent to applying their rotations one after the
    * other in a procedural way, just that the second factor is applied first. So we basically do:
    *
    *  . . . .                      .                        .
    *  .     .  rot. on z axis    .   .    rot. on y axis   . .
    *  .     .       -->        .       .        -->       .   .
    *  . . . .                    .   .                     . .
    *                               .                        .
    */
    let final_rot_quat = multiply_quaternions(y_rot_quat, z_rot_quat)
    let final_rot = quaternion_to_axis_angle(final_rot_quat)
    return final_rot;
}

const HUMAN_NONE    = 0;
const HUMAN_H       = 1;
const HUMAN_U       = 2;
const HUMAN_S       = 3;
const HUMAN_F       = 5;
const HUMAN_P       = 6;
const HUMAN_C       = 7;
const HUMAN_O       = 8;
const HUMAN_CT_FAKE = 9; // CT with sum outside [0,3] → CTfake, scoreWorth 0

/**
* @param {string} str
* @returns {number}
*/
function human_str_to_type(str: string): number | undefined {
    switch (str) {
        case 'None': return HUMAN_NONE;
        case 'H'   : return HUMAN_H;
        case 'U'   : return HUMAN_U;
        case 'S'   : return HUMAN_S;
        case 'F'   : return HUMAN_F;
        case 'P'   : return HUMAN_P;
        case 'C'   : return HUMAN_C;
        case 'O'   : return HUMAN_O;
    } 
}

function cognitive_string_to_hazmat(str: string): number | undefined {
    let sum = 0
    for (const c of str) {
        switch (c) {
        case 'K': sum += -2; break;
        case 'R': sum += -1; break;
        case 'Y': sum += 0; break;
        case 'G': sum += 1; break;
        case 'B': sum += 2; break;
        }
    }
    console.log("sum = ", sum)

    switch (sum) {
    case 0: return HUMAN_F;
    case 1: return HUMAN_P;
    case 2: return HUMAN_C;
    case 3: return HUMAN_O;
    default: return HUMAN_CT_FAKE; // sum outside [0,3] → CTfake
    }
}

// tag tile typedef
/**
 * @typedef {Object} Tile
 * @property {boolean} is_reachable
 * @property {boolean} is_checkpoint
 * @property {boolean} is_black
 * @property {boolean} is_start
 * @property {boolean} is_swamp
 * @property {boolean} is_obstacle
 * @property {boolean} is_linear
 *
 * @property {Array  } whole_walls
 * @property {Number } wall_token_type
 * @property {Number } wall_token_place
 * @property {Number } wall_token_front_rot
 * @poperty  {boolean} wall_token_is_fake
 *
 * @property {string } inner_half_walls
 * @property {string } outer_half_walls
 * @property {Number } outer_half_walls_info
 * @property {string } curved_walls
 * @property {Array  } half_wall_tokens
 * @property {Array  } half_wall_tokens_front_rot
 * @poperty  {Array  } half_wall_tokens_fakes
 *
 * @property {string } floor_color
 * @property {Number } room_number
 */
// (its fields change type while the export works: walls as arrays, then as strings for the file)
type WorldTile = Record<string, any>;

// What a version of Erebus writes otherwise than 26.x: contact tiles (a tile's contact field), and
// the model of a fake victim (Fake's type) for each type of victim
export interface Flavor {
    contact: boolean;
    fakeModel: Record<string, string>;
}
export const EREBUS26: Flavor = {
    contact: false,
    fakeModel: { harmed: 'phi', stable: 'psi', unharmed: 'omega' }
};

// A victim or cognitive target as the world file lists it
interface VictimPart { x: number; z: number; rot: number; frontRotation: number; is_fake?: boolean; id: number; type: string | undefined; score: number }

function createWorld(map: MapData, hooks?: Partial<WorldHooks>, flavor: Flavor = EREBUS26): string {
    // (these were the page's globals: set and read within one export)
    let tile: any, tile_string: any, r: any, arr1: any, arr2: any, room4: any, connect14: any, connect34: any, area4X: any, area4Y: any, area4Rot: any,
        startTrans: any, xOffset: any, zOffset: any, area4Humans: any, vicPosTrans: any, thisHuman: any,
        area4Hazards: any, hazPosTrans: any, thisHazard: any;
    // one i for the whole export (it was `var i` in the 16-slot loop, hoisted): kept as one variable
    var i: any;
    function get_cell(x: number, y: number, z: number): any {
        return map.cells[x + ',' + y + ',' + z];
    }

    let tiles: WorldTile[][] = [];
    for (let x=1, l=map.length*2+1; x<l; x+=2){
        let row: WorldTile[] = [];
        for (let z=1, m=map.width*2+1; z<m; z+=2){
            row.push({
                is_reachable               : false,
                is_checkpoint              : false,
                is_black                   : false,
                is_start                   : false,
                is_swamp                   : false,
                is_contact                 : false,
                is_obstacle                : false,
                is_linear                  : false,

                whole_walls                : [0, 0, 0, 0],
                wall_token_type            : 0,
                wall_token_place           : 0,
                wall_token_front_rot       : 0,
                wall_token_is_fake         : false,
                wall_token_cognitive_code  : '',
                wall_token_offset          : 0,

                inner_half_walls           : '',
                outer_half_walls           : '',
                outer_half_walls_info      : 0,
                curved_walls               : '',
                half_wall_tokens           : [],
                half_wall_cognitives       : [''],
                half_wall_tokens_front_rot : [],
                half_wall_tokens_fakes     : [],
                half_wall_tokens_cognitive_codes : [],
                half_wall_tokens_offsets   : [],

                floor_color                : '0.635 0.635 0.635',
                room_number                : 0,
            });
        }
        tiles.push(row);
    }
    for(let y=1, l=map.length*2+1; y<l; y+=2){
        for(let x=1, m=map.width*2+1; x<m; x+=2){
            let thisCell = get_cell(x, y, 0);
            let tile = tiles[(y-1)/2][(x-1)/2]

            tile.whole_walls      = [0, 0, 0, 0]
            tile.outer_half_walls = [0, 0, 0, 0]

            if (get_cell(x, y-2, 0) == null
            &&  get_cell(x, y-1, 0)
            &&  get_cell(x, y-1, 0).isWall
            ) tile.whole_walls[0] = 1;

            if (get_cell(x+1, y, 0) 
            &&  get_cell(x+1, y, 0).isWall
            ) tile.whole_walls[1] = 1;

            if (get_cell(x, y+1, 0) 
            &&  get_cell(x, y+1, 0).isWall
            ) tile.whole_walls[2] = 1;

            if (get_cell(x-2, y, 0) == null 
            &&  get_cell(x-1, y, 0) 
            &&  get_cell(x-1, y, 0).isWall
            ) tile.whole_walls[3] = 1;

            if (y == 1
            && get_cell(x, y-1, 0) 
            && get_cell(x, y-1, 0).halfWall > 0) {
                get_cell(x, y, 0).tile.halfTile = 1;
                tile.outer_half_walls[0] = get_cell(x, y-1, 0).halfWall;
            }

            if (get_cell(x+1, y, 0)
            &&  get_cell(x+1, y, 0).halfWall > 0) {
                get_cell(x, y, 0).tile.halfTile = 1;
                tile.outer_half_walls[1] = get_cell(x+1, y, 0).halfWall;
            }

            if(get_cell(x, y+1, 0) 
            && get_cell(x, y+1, 0).halfWall > 0) {
                get_cell(x, y, 0).tile.halfTile = 1;
                tile.outer_half_walls[2] = get_cell(x, y+1, 0).halfWall;
            }

            if (x == 1 
            && get_cell(x-1, y, 0) 
            && get_cell(x-1, y, 0).halfWall > 0) {
                get_cell(x, y, 0).tile.halfTile = 1;
                tile.outer_half_walls[3] = get_cell(x-1, y, 0).halfWall;
            }

            let floorColor = '0.635 0.635 0.635';
            //stores shortening, lengthing of outer half walls
            tile.outer_half_walls_info = [1, 1, 1, 1];
            if (!thisCell)      { continue; }
            if (!thisCell.tile) { continue; }

            tile.wall_token_type  = HUMAN_NONE
            tile.wall_token_place = HUMAN_PLACE_TOP
            if (thisCell.tile.victims) {
                if (thisCell.tile.victims.top) {
                    tile.wall_token_type = human_str_to_type(thisCell.tile.victims.top);
                    tile.wall_token_place = HUMAN_PLACE_TOP
                } else if (thisCell.tile.victims.right) {
                    tile.wall_token_type = human_str_to_type(thisCell.tile.victims.right);
                    tile.wall_token_place = HUMAN_PLACE_RIGHT
                } else if(thisCell.tile.victims.bottom){
                    tile.wall_token_type = human_str_to_type(thisCell.tile.victims.bottom);
                    tile.wall_token_place = HUMAN_PLACE_BOTTOM;
                } else if(thisCell.tile.victims.left){
                    tile.wall_token_type = human_str_to_type(thisCell.tile.victims.left);
                    tile.wall_token_place = HUMAN_PLACE_LEFT;
                }
            }
            if (thisCell.tile.cognitives) {
                if (thisCell.tile.cognitives.top_code) {
                    tile.wall_token_cognitive_code = thisCell.tile.cognitives.top_code
                    tile.wall_token_type = cognitive_string_to_hazmat(thisCell.tile.cognitives.top_code);
                    tile.wall_token_place = HUMAN_PLACE_TOP
                } else if (thisCell.tile.cognitives.right_code) {
                    tile.wall_token_cognitive_code = thisCell.tile.cognitives.right_code
                    tile.wall_token_type = cognitive_string_to_hazmat(thisCell.tile.cognitives.right_code);
                    tile.wall_token_place = HUMAN_PLACE_RIGHT
                } else if (thisCell.tile.cognitives.bottom_code){
                    tile.wall_token_cognitive_code = thisCell.tile.cognitives.bottom_code
                    tile.wall_token_type = cognitive_string_to_hazmat(thisCell.tile.cognitives.bottom_code);
                    tile.wall_token_place = HUMAN_PLACE_BOTTOM;
                } else if (thisCell.tile.cognitives.left_code){
                    tile.wall_token_cognitive_code = thisCell.tile.cognitives.left_code
                    tile.wall_token_type = cognitive_string_to_hazmat(thisCell.tile.cognitives.left_code);
                    tile.wall_token_place = HUMAN_PLACE_LEFT;
                } else {
                    console.log("")
                }
            }

            /**
             * @param {number} d
             * @returns {number}
             */
            function degreesToRadians(d: number) {
                return d * (Math.PI / 180);
            }

            tile.wall_token_front_rot = 0
            if (thisCell.tile.single_victim_rotation) {
                tile.wall_token_front_rot = degreesToRadians(thisCell.tile.single_victim_rotation)
            }

            tile.wall_token_is_fake = false;
            if (thisCell.tile.victim_is_fake) {
                tile.wall_token_is_fake = true;
            }

            // moved along its wall in the editor: cm from the middle of the face
            tile.wall_token_offset = Number(thisCell.tile.victim_offset) || 0;

            if (thisCell.tile.color) {
                floorColor = '';
                if (thisCell.tile.color == '#08D508') // area 1 <-> 4
                    map.connect14 = [x, y];
                else if (thisCell.tile.color == '#e71a1a') // area 3 <-> 4
                    map.connect34 = [x, y]
                for (i = 1; i < 7; i += 2)
                    floorColor += String(parseInt('0x' + thisCell.tile.color.substring(i, i + 2)) / 255.0) + ' ';
            }
            // using array.slice[] to make copy of the array, so no state is accidentally kept on the ui between world generations
            tile.inner_half_walls = thisCell.tile.halfWallIn.slice() 
            tile.curved_walls = '[' + thisCell.tile.curve.toString() + ']';

            tile.is_reachable               = is_truthy(thisCell.reachable);
            tile.is_checkpoint              = is_truthy(thisCell.tile.checkpoint);
            tile.is_black                   = is_truthy(thisCell.tile.black);
            tile.is_swamp                   = is_truthy(thisCell.tile.swamp);
            tile.is_contact                 = is_truthy(thisCell.tile.contact);
            tile.is_obstacle                = is_truthy(thisCell.tile.obstacle);
            tile.is_linear                  = is_truthy(thisCell.isLinear);
            tile.is_start                   = (x == map.startTile.x && y == map.startTile.y);

            tile.half_wall_tokens_cognitive_codes = thisCell.tile.halfWallCognitives

            // Normalize: objects with numeric keys (e.g. {"0":"1"}) -> sparse array
            function objToArray(val: any): any[] {
                if (!val || Array.isArray(val)) return val || [];
                var arr: any[] = [];
                Object.keys(val).forEach(function(k) { arr[parseInt(k)] = val[k]; });
                return arr;
            }
            tile.half_wall_tokens_offsets = objToArray(thisCell.tile.halfWallVicOffsets);
            arr2 = objToArray(tile.half_wall_tokens_cognitive_codes);
            tile.half_wall_tokens_cognitive_codes = arr2;
            arr1 = objToArray(thisCell.tile.halfWallVic);
            tile.half_wall_tokens = []

            console.log("half_wall_tokens_cognitive_codes", tile.half_wall_tokens_cognitive_codes)
            console.log("arr1", arr1)
            console.log("arr2", arr2)

            for (let i = 0; i < Math.max(arr1.length, arr2.length); i++) {
                if (arr1[i]) {
                    tile.half_wall_tokens.push(arr1[i])
                } else if (arr2[i]) {
                    tile.half_wall_tokens.push(cognitive_string_to_hazmat(arr2[i]))
                } else {
                    tile.half_wall_tokens.push(undefined)
                }
            }

            console.log(tile.half_wall_tokens)
            //tile.half_wall_tokens           = 

            tile.half_wall_tokens_front_rot = objToArray(thisCell.tile.halfWallVicRots).map(Number).map(degreesToRadians);
            tile.half_wall_tokens_fakes     = thisCell.tile.halfWallVicFakes;
            tile.floor_color                = floorColor;
            tile.room_number                = checkRoomNumber(map, x,y,0);
        }
    }
    
    const DIR_NORTH = 0;
    const DIR_EAST  = 1;
    const DIR_SOUTH = 2;
    const DIR_WEST  = 3;
    function vectorRotate(vector: number[], dir: number): any {
        switch (dir) {
            case DIR_NORTH: return [vector[0], vector[1]]
            case DIR_EAST : return [-1 * vector[1], vector[0]]
            case DIR_SOUTH: return [-1 * vector[0], -1 * vector[1]]
            case DIR_WEST : return [vector[1], -1 * vector[0]]
        }
    }

    function inBounds(z: number, x: number): boolean {
        return (z >= 0) && (z < map.length) && (x >= 0) && (x < map.width);
    }


    //General scale for tiles - adjusts position and size of pieces and obstacles
    let tileScale = [0.4, 0.4, 0.4];
    //The vertical position of the floor
    let floorPos = -0.075 * tileScale[1];

    //Strings to hold the tile parts
    let allTiles = "";
    //Strings to hold the boundaries for special tiles
    let allCheckpointBounds = "";
    let allTrapBounds = "";
    let allGoalBounds = "";
    let allSwampBounds = "";
    let allObstacles = "";

    const boundsPart = ({name, id, xmin, zmin, xmax, zmax, y}: any) => `
        DEF boundary Group {
            children [
              DEF ${name}${id}min Transform {
                    translation ${xmin} ${y} ${zmin}
              }
              DEF ${name}${id}max Transform {
                    translation ${xmax} ${y} ${zmax}
              }
            ]
          }
        `;

    const area4Part = ({roomNum, x, y, rot, width, height, xScale, yScale, zScale, area4Width, area4Height}: any) => `
        Area4_${roomNum-1} {
            X ${x}
            Y ${y}
            DIR ${rot}
            width ${width}
            height ${height}
            xScale ${xScale}
            zScale ${zScale}
            yScale ${yScale}
            area4Width ${area4Width}
            area4Height ${area4Height}
        }
        `;


    function hsu_to_greek_letters(hsu: string): string | undefined {
        const model = flavor.fakeModel[hsu];
        if (!model) console.log("UNREACHABLE: invalid victim name");
        return model;
    }

    function visualHumanPart({x, z, rot, frontRotation, is_fake, id, type, score}: VictimPart) {
        r = calculateWallTokenRot(rot, frontRotation)
        let name = "Victim"
        if (is_fake) {
            name = "Fake"
            type = hsu_to_greek_letters(type as string)
        }
        return `
            ${name} {
                translation ${x} 0 ${z}
                rotation ${r.x} ${r.y} ${r.z} ${r.angle}
                name "${name}${id}"
                type "${type}"
                scoreWorth ${score}
            }
            `;
    }

    function hazardPart({x, z, rot, frontRotation, id, type, score}: VictimPart) {
        r = calculateWallTokenRot(rot, frontRotation)
        return `
            CognitiveTarget {
                translation ${x} 0 ${z}
                rotation ${r.x} ${r.y} ${r.z} ${r.angle}
                name "Hazard${id}"
                type "${type}"
                scoreWorth ${score}
            }
            `;
    }

    const obstaclePart = ({id, xSize, ySize, zSize, x, y, z, rot}: any) => `
        DEF OBSTACLE${id} Solid {
            translation ${x} ${y} ${z}
			rotation 0 1 0 ${rot}
            children [
                Shape {
                    appearance Appearance {
						material Material {
						diffuseColor 0.45 0.45 0.45
						}
                    }
                    geometry DEF OBSTACLEBOX${id} Box {
						size ${xSize} ${ySize} ${zSize}
                    }
                }
            ]
            name "obstacle${id}"
            boundingObject USE OBSTACLEBOX${id}
	    recognitionColors [
			0.45 0.45 0.45
		]
        }
        `;

    const groupPart = ({data, name}: { data: string; name: string }) => `
        DEF ${name} Group {
            children [
              ${data}
            ]
        }
        `;

    const supervisorPart = ({time}: { time: number }) => `
        DEF MAINSUPERVISOR Robot {
            children [
              Receiver {
                channel 1
              }
              Emitter {
                channel 1
              }
            ]
            supervisor TRUE
            controller "MainSupervisor"
            customData "${time}"
            window "MainSupervisorWindow"
          }
        `;

    //Upper left corner to start placing tiles from
    let width = map.width;
    let height = map.length;
    let startX = -(map.width * (0.3 * tileScale[0]) / 2.0);
    let startZ = -(map.length * (0.3 * tileScale[2]) / 2.0);

    let fileData = `#VRML_SIM R2022b utf8
        EXTERNPROTO "../protos/TexturedBackgroundLight.proto"
        EXTERNPROTO "../protos/TexturedBackground.proto"
        EXTERNPROTO "../protos/curvedWall.proto"
        EXTERNPROTO "../protos/halfTile.proto"
        EXTERNPROTO "../protos/CognitiveTarget.proto"
        EXTERNPROTO "../protos/HazardMap.proto"
        EXTERNPROTO "../protos/Fake.proto"
        EXTERNPROTO "../protos/obstacle.proto"
        EXTERNPROTO "../protos/Victim.proto"
        EXTERNPROTO "../protos/worldTile.proto"
        EXTERNPROTO "../protos/Area4_1.proto"
        EXTERNPROTO "../protos/Area4_2.proto"
        IMPORTABLE EXTERNPROTO "../protos/custom_robot.proto"

        WorldInfo {
          basicTimeStep 16
          coordinateSystem "NUE"
          contactProperties [
            ContactProperties {
              material1  "TILE"
              material2  "NO_FRIC"
              coulombFriction 0
              bounce 0
              bumpSound ""
              rollSound ""
              slideSound ""
            }
          ]
        }
        DEF Viewpoint Viewpoint {
          orientation -0.683263 0.683263 0.257493 2.63756
          position -0.08 ${0.2*height} ${0.17*height}
        }
        TexturedBackground {
        }
        TexturedBackgroundLight {
        }
        `;

    //Y rotation of humans for each wall
    let humanRotation = [3.14, 1.57, 0, -1.57]
    let humanRotationCurve = [2.355, 0.785, -0.785, -2.355];

    let halfWallVicPos = [[-0.075, -0.136], [-0.014, -0.075], [-0.075, -0.014], [-0.136, -0.075], 
                          [ 0.075, -0.136], [ 0.136, -0.075], [ 0.075, -0.014], [ 0.014, -0.074], 
                          [-0.075,  0.014], [-0.014,  0.075], [-0.075,  0.136], [-0.136,  0.075],
                          [ 0.075,  0.014], [ 0.136,  0.075], [ 0.075,  0.136], [ 0.014,  0.075]];

    let curveWallVicPos = [[-0.022, -0.039], [-0.022, -0.022], [-0.039, -0.023], [-0.038, -0.038],
                           [ 0.038, -0.039], [ 0.038, -0.022], [ 0.021, -0.023], [ 0.022, -0.038],
                           [-0.022,  0.021], [-0.022,  0.038], [-0.039,  0.037], [-0.038,  0.022],
                           [ 0.038,  0.021], [ 0.038,  0.038], [ 0.021,  0.037], [ 0.022,  0.022]];
    //Offsets for visual and thermal humans
    let humanOffset = [
        [0,                      -0.1375 * tileScale[2]],
        [ 0.1375 * tileScale[0],  0                    ],
        [0,                       0.1375 * tileScale[2]],
        [-0.1375 * tileScale[0],  0                    ]
    ]
    let hazardOffset = [
        [ 0,                     -0.136 * tileScale[2]],
        [ 0.136 * tileScale[0],   0                   ],
        [ 0,                      0.136 * tileScale[2]],
        [-0.136 * tileScale[0],   0                   ]
    ]
    let humanOffsetCurve = [
        [-0.008,  0.008],
        [-0.008, -0.008],
        [ 0.008, -0.008],
        [ 0.008,  0.008]
    ]
    //Names of types of visual human
    let humanTypesVisual = ["harmed", "unharmed", "stable"]

    //Id numbers used to give a unique but interable name to tile pieces
    let tileId     = 0
    let checkId    = 0
    let trapId     = 0
    let goalId     = 0
    let swampId    = 0
    let humanId    = 0
    let fakeHumanId    = 0
    let obstacleId = 0
    let hazardId   = 0

    //Resolve corners
    // halfwallout 10, hallwallin 11, halfwalloutinfo 15
    for(let x = 0; x < map.length+1; x++) {
        for(let z = 0; z < map.width+1; z++) {

            let verticalWalls = 0;
            let horizontalWalls = 0;
            let topLeft = false;

            if((tiles[x-1] != null && tiles[x-1][ z ] != null && (tiles[x-1][ z ].whole_walls[3] > 0 || tiles[x-1][ z ].outer_half_walls[3] == 1))
            || (tiles[x-1] != null && tiles[x-1][z-1] != null && (tiles[x-1][z-1].whole_walls[1] > 0 || tiles[x-1][z-1].outer_half_walls[1] == 1))) verticalWalls++; //North wall

            if((tiles[ x ] != null && tiles[ x ][ z ] != null && (tiles[ x ][ z ].whole_walls[0] > 0 || tiles[ x ][ z ].outer_half_walls[0] == 1))
            || (tiles[x-1] != null && tiles[x-1][ z ] != null && (tiles[x-1][ z ].whole_walls[2] > 0 || tiles[x-1][ z ].outer_half_walls[2] == 1))) horizontalWalls++;

            if((tiles[ x ] != null && tiles[ x ][ z ] != null && (tiles[ x ][ z ].whole_walls[3] > 0 || tiles[ x ][ z ].outer_half_walls[3] == 2))
            || (tiles[ x ] != null && tiles[ x ][z-1] != null && (tiles[ x ][z-1].whole_walls[1] > 0 || tiles[ x ][z-1].outer_half_walls[1] == 2))) verticalWalls++;

            if((tiles[x-1] != null && tiles[x-1][z-1] != null && (tiles[x-1][z-1].whole_walls[2] > 0 || tiles[x-1][z-1].outer_half_walls[2] == 2))
            || (tiles[ x ] != null && tiles[ x ][z-1] != null && (tiles[ x ][z-1].whole_walls[0] > 0 || tiles[ x ][z-1].outer_half_walls[0] == 2))) horizontalWalls++;

            //Very special case for top left corner
            if((tiles[x] != null && tiles[x][z] != null && (tiles[x][z].whole_walls[0] > 0 || tiles[x][z].outer_half_walls[0] == 1))
            || (tiles[x] != null && tiles[x][z] != null && (tiles[x][z].whole_walls[3] > 0 || tiles[x][z].outer_half_walls[3] == 2))) topLeft = true;


            if(horizontalWalls > 0 && verticalWalls > 0) {
                //North wall
                if (tiles[x-1] != null && tiles[x-1][ z ] && tiles[x-1][ z ].whole_walls[3] > 0)
                    tiles[x-1][ z ].whole_walls[3] = (tiles[x-1][ z ].whole_walls[3]) * 3;
                else if (tiles[x-1] != null && tiles[x-1][z-1] && tiles[x-1][z-1].whole_walls[1] > 0)
                    tiles[x-1][z-1].whole_walls[1] = (tiles[x-1][z-1].whole_walls[1]) * 3;
                else if(tiles[x-1] != null && tiles[x-1][ z ] && tiles[x-1][ z ].outer_half_walls[3] == 1)
                    tiles[x-1][ z ].outer_half_walls_info[3] *= 3;
                else if( tiles[x-1] != null && tiles[x-1][z-1] && tiles[x-1][z-1].outer_half_walls[1] == 1)
                    tiles[x-1][z-1].outer_half_walls_info[1] *= 3;

                if     ((tiles[x-1] != null && tiles[x-1][z] && tiles[x-1][z].whole_walls[2] > 0 )) tiles[x-1][z].whole_walls[2] = (tiles[x-1][z].whole_walls[2]) * horizontalWalls == 1 ? 5 : 2;
                else if( tiles[ x ] != null && tiles[ x ][z] && tiles[ x ][z].whole_walls[0] > 0 )  tiles[ x ][z].whole_walls[0] = (tiles[x  ][z].whole_walls[0]) * 2;
                else if((tiles[x-1] != null && tiles[x-1][z] && tiles[x-1][z].outer_half_walls[2] == 1)) tiles[x-1][z].outer_half_walls_info[2] *= horizontalWalls == 1 ? 5 : 2;
                else if( tiles[ x ] != null && tiles[ x ][z] && tiles[ x ][z].outer_half_walls[0] == 1)  tiles[ x ][z].outer_half_walls_info[0] *= 2;

                if     ((tiles[x] != null && tiles[x][z-1] && tiles[x][z-1].whole_walls [1] > 0))  tiles[x][z-1].whole_walls[1] = (tiles[x][z-1].whole_walls[1]) * 2;
                else if( tiles[x] != null && tiles[x][z]   && tiles[x][z  ].whole_walls [3] > 0)   tiles[x][z  ].whole_walls[3] = (tiles[x][z  ].whole_walls[3]) * 2;
                else if((tiles[x] != null && tiles[x][z-1] && tiles[x][z-1].outer_half_walls[1] == 2)) tiles[x][z-1].outer_half_walls_info[1] *= 2; 
                else if( tiles[x] != null && tiles[x][z]   && tiles[x][z  ].outer_half_walls[3] == 2)  tiles[x][z  ].outer_half_walls_info[3] *= 2; 

                if     ((tiles[x  ] != null && tiles[x  ][z-1] && tiles[x  ][z-1].whole_walls[0] > 0))  tiles[x  ][z-1].whole_walls[0] = (tiles[x  ][z-1].whole_walls[0]) * 3;
                else if (tiles[x-1] != null && tiles[x-1][z-1] && tiles[x-1][z-1].whole_walls[2] > 0)   tiles[x-1][z-1].whole_walls[2] = (tiles[x-1][z-1].whole_walls[2]) * 3;
                else if((tiles[x  ] != null && tiles[x  ][z-1] && tiles[x  ][z-1].outer_half_walls[0] == 2)) tiles[x  ][z-1].outer_half_walls_info[0] *= 3; 
                else if (tiles[x-1] != null && tiles[x-1][z-1] && tiles[x-1][z-1].outer_half_walls[2] == 2)  tiles[x-1][z-1].outer_half_walls_info[2] *= 3; 

                if (topLeft && horizontalWalls == 1 && verticalWalls == 1) {
                    // If the left and top walls are the only horizontal and vertical walls

                    tiles[x][z].whole_walls[0] /= 2;
                    tiles[x][z].whole_walls[3] /= 2;
                    if (tiles[x][z].outer_half_walls[0] == 1) tiles[x][z].outer_half_walls_info[0] /= 2;
                    if (tiles[x][z].outer_half_walls[3] == 1) tiles[x][z].outer_half_walls_info[3] /= 2;
                }
            }

            //inner half tile walls along horizontal edge of 2 different tiles
            horizontalWalls = 0;
            verticalWalls = 0;
            if(tiles[ x ] != null && tiles[ x ][z] != null && tiles[ x ][z].inner_half_walls[0] > 0) verticalWalls++;
            if(tiles[x-1] != null && tiles[x-1][z] != null && tiles[x-1][z].inner_half_walls[2] > 0) verticalWalls++;
            if(tiles[ x ] != null && tiles[ x ][z] != null && tiles[ x ][z].outer_half_walls[0] > 0) horizontalWalls++;
            if(tiles[x-1] != null && tiles[x-1][z] != null && tiles[x-1][z].outer_half_walls[2] > 0) horizontalWalls++;
            if(horizontalWalls > 0 && verticalWalls > 0) {

                if(tiles[ x ] != null && tiles[ x ][z] != null && tiles[ x ][z].inner_half_walls[0] > 0) tiles[ x ][z].inner_half_walls[0] *= 2;
                if(tiles[x-1] != null && tiles[x-1][z] != null && tiles[x-1][z].inner_half_walls[2] > 0) tiles[x-1][z].inner_half_walls[2] *= 3;

                if     (tiles[x] != null && tiles[x][z] != null && tiles[x][z].outer_half_walls[0] == 1) tiles[x][z].outer_half_walls_info[0] *= 3;
                else if(tiles[x] != null && tiles[x][z] != null && tiles[x][z].outer_half_walls[0] == 2) tiles[x][z].outer_half_walls_info[0] *= horizontalWalls == 1 ? 5 : 2;

                if     (tiles[x-1] != null && tiles[x-1][z] != null && tiles[x-1][z].outer_half_walls[2] == 1) tiles[x-1][z].outer_half_walls_info[2] *= 2;
                else if(tiles[x-1] != null && tiles[x-1][z] != null && tiles[x-1][z].outer_half_walls[2] == 2) tiles[x-1][z].outer_half_walls_info[2] *= horizontalWalls == 1 ? 5 : 2;
            }

            horizontalWalls = 0;
            verticalWalls = 0;

            //inner half tile walls in center
            if(tiles[x] != null && tiles[x][z] != null) {
                if(tiles[x][z].inner_half_walls[0] > 0) verticalWalls++;
                if(tiles[x][z].inner_half_walls[1] > 0) horizontalWalls++;
                if(tiles[x][z].inner_half_walls[2] > 0) verticalWalls++;
                if(tiles[x][z].inner_half_walls[3] > 0) horizontalWalls++;

                if(verticalWalls > 0 && horizontalWalls > 0) {
                    tiles[x][z].inner_half_walls[0] *= 3;
                    tiles[x][z].inner_half_walls[1] *= horizontalWalls == 1 ? 5 : 2;
                    tiles[x][z].inner_half_walls[2] *= 2;
                    tiles[x][z].inner_half_walls[3] *= 3;
                }
            }

            horizontalWalls = 0;
            verticalWalls = 0;
            //inner half tile walls along vertical edge of 2 different tiles
            if(tiles[x] != null && (tiles[x][ z ] != null && tiles[x][ z ].outer_half_walls[3] > 0)) verticalWalls++;
            if(tiles[x] != null &&  tiles[x][z-1] != null && tiles[x][z-1].outer_half_walls[1] > 0) verticalWalls++;

            if(tiles[x] != null && tiles[x][ z ] != null && tiles[x][ z ].inner_half_walls[3] > 0) horizontalWalls++;
            if(tiles[x] != null && tiles[x][z-1] != null && tiles[x][z-1].inner_half_walls[1] > 0) horizontalWalls++;

            if(verticalWalls > 0 && horizontalWalls > 0) {
                if     (tiles[x] != null && tiles[x][z] != null && tiles[x][z].outer_half_walls[3] == 2) tiles[x][z].outer_half_walls_info[3] *= 3;
                else if(tiles[x] != null && tiles[x][z] != null && tiles[x][z].outer_half_walls[3] == 1) tiles[x][z].outer_half_walls_info[3] *= 2;

                if     (tiles[x] != null && tiles[x][z-1] != null && tiles[x][z-1].outer_half_walls[1] == 2) tiles[x][z-1].outer_half_walls_info[1] *= 3;
                else if(tiles[x] != null && tiles[x][z-1] != null && tiles[x][z-1].outer_half_walls[1] == 1) tiles[x][z-1].outer_half_walls_info[1] *= 2;

                if(tiles[x] != null && tiles[x][ z ] != null && tiles[x][ z ].inner_half_walls[3] > 0) tiles[x][ z ].inner_half_walls[3] *= horizontalWalls == 1 ? 5 : 2;
                if(tiles[x] != null && tiles[x][z-1] != null && tiles[x][z-1].inner_half_walls[1] > 0) tiles[x][z-1].inner_half_walls[1] *= 3;
            }
        }
    }

    //String to hold all the humans/hazards
    let allHumans = ""
    let allFakes = ""
    let allHazards = ""
    for(let x=0;x<map.width;x++){
        for(let z=0;z<map.length;z++){
            //Check which corners and external walls and notches are needed
            let externals = checkForExternalWalls(map, [x, z], tiles)
            //Name to be given to the tile
            let tileName = "TILE"
            tile = tiles[z][x]
            if(tile.is_start) tileName = "START_TILE"
            //Create a new tile with all the data
            let _cellKey = String(x * 2 + 1) + "," + String(z * 2 + 1) + ",0";
            let _cell = map.cells[_cellKey];
            if (_cell && _cell.tile && _cell.tile.halfTile) {
                let t1w = [
                    tile.outer_half_walls[UP] == 1 ? tile.outer_half_walls_info[UP] : 0,
                    tile.inner_half_walls[UP],
                    tile.inner_half_walls[3],
                    tile.outer_half_walls[3] == 2 ? tile.outer_half_walls_info[3] : 0
                ].map(Number);

                let t2w = [
                    tile.outer_half_walls[UP] == 2 ? tile.outer_half_walls_info[0] : 0,
                    tile.outer_half_walls[1] == 2 ? tile.outer_half_walls_info[1] : 0,
                    tile.inner_half_walls[1],
                    0
                ].map(Number); 

                let t3w = [
                    0,
                    tile.inner_half_walls[2],
                    tile.outer_half_walls[2] == 1 ? tile.outer_half_walls_info[2] : 0,
                    tile.outer_half_walls[3] == 1 ? tile.outer_half_walls_info[3] : 0
                ].map(Number);

                let t4w = [
                    0,
                    tile.outer_half_walls[1] == 1 ? tile.outer_half_walls_info[1] : 0,
                    tile.outer_half_walls[2] == 2 ? tile.outer_half_walls_info[2] : 0,
                    0
                ].map(Number);

                console.log("b", tile.outer_half_walls);
                
                let t1e = [externals[UP], false           , false          , externals[LEFT]];
                let t2e = [externals[UP], externals[RIGHT], false          , false          ];
                let t3e = [false        , false           , externals[DOWN], externals[LEFT]];
                let t4e = [false        , externals[RIGHT], externals[DOWN], false          ];

                tile_string = `
        DEF ${tileName} halfTile {
            xPos ${x}
            zPos ${z}
            floor ${tile.is_reachable && !tile.is_black }
            topWall ${   tile.whole_walls[UP]   }
            rightWall ${ tile.whole_walls[RIGHT]}
            bottomWall ${tile.whole_walls[DOWN] }
            leftWall ${  tile.whole_walls[LEFT] }
            tile1Walls [ ${t1w[UP]}, ${t1w[RIGHT]}, ${t1w[DOWN]}, ${t1w[LEFT]} ]
            tile2Walls [ ${t2w[UP]}, ${t2w[RIGHT]}, ${t2w[DOWN]}, ${t2w[LEFT]} ]
            tile3Walls [ ${t3w[UP]}, ${t3w[RIGHT]}, ${t3w[DOWN]}, ${t3w[LEFT]} ]
            tile4Walls [ ${t4w[UP]}, ${t4w[RIGHT]}, ${t4w[DOWN]}, ${t4w[LEFT]} ]
            tile1External [ ${t1e[UP]}, ${t1e[RIGHT]}, ${t1e[DOWN]}, ${t1e[LEFT]} ]
            tile2External [ ${t2e[UP]}, ${t2e[RIGHT]}, ${t2e[DOWN]}, ${t2e[LEFT]} ]
            tile3External [ ${t3e[UP]}, ${t3e[RIGHT]}, ${t3e[DOWN]}, ${t3e[LEFT]} ]
            tile4External [ ${t4e[UP]}, ${t4e[RIGHT]}, ${t4e[DOWN]}, ${t4e[LEFT]} ]
            curve ${tile.curved_walls}
            start ${tile.is_start}
            trap ${tile.is_black}
            checkpoint ${tile.is_checkpoint}
            swamp ${tile.is_swamp}${flavor.contact ? `
            contact ${tile.is_contact}` : ''}
            width ${width}
            height ${height}
            id "${tileId}"
            xScale ${tileScale[0]}
            yScale ${tileScale[1]}
            zScale ${tileScale[2]}
            tileColor ${tile.floor_color}
            room ${tile.room_number}
          }
        `;
                tile_string = tile_string.replace(/true/g, "TRUE")
                tile_string = tile_string.replace(/false/g, "FALSE")
            }
            else {
                tile_string = `
        DEF ${tileName} worldTile {
            xPos ${x}
            zPos ${z}
            floor ${tile.is_reachable && !tile.is_black}
            topWall ${   tile.whole_walls[UP]   }
            rightWall ${ tile.whole_walls[RIGHT]}
            bottomWall ${tile.whole_walls[DOWN] }
            leftWall ${  tile.whole_walls[LEFT] }
            topExternal ${   externals[UP]   }
            rightExternal ${ externals[RIGHT]}
            bottomExternal ${externals[DOWN] }
            leftExternal ${  externals[LEFT] }
            start ${tile.is_start}
            trap ${tile.is_black}
            checkpoint ${tile.is_checkpoint}
            swamp ${tile.is_swamp}${flavor.contact ? `
            contact ${tile.is_contact}` : ''}
            width ${width}
            height ${height}
            id "${tileId}"
            xScale ${tileScale[0]}
            yScale ${tileScale[1]}
            zScale ${tileScale[2]}
            tileColor ${tile.floor_color}
            room ${tile.room_number}
          }
        `
                tile_string = tile_string.replace(/true/g, "TRUE")
                tile_string = tile_string.replace(/false/g, "FALSE")
            }
            allTiles += tile_string


            let xmin = (x * 0.3 * tileScale[0] + startX) - (0.15 * tileScale[0])
            let zmin = (z * 0.3 * tileScale[2] + startZ) - (0.15 * tileScale[2])
            let xmax = (x * 0.3 * tileScale[0] + startX) + (0.15 * tileScale[0])
            let zmax = (z * 0.3 * tileScale[2] + startZ) + (0.15 * tileScale[2])

            //checkpoint
            if (tile.is_checkpoint) {
                allCheckpointBounds += boundsPart({
                    name: "checkpoint",
                    id: checkId,
                    xmin, zmin, xmax, zmax,
                    y: floorPos
                });
                checkId += 1
            }
            //trap
            if (tile.is_black) {
                //Add bounds to the trap boundaries
                allTrapBounds += boundsPart({
                    name: "trap",
                    id: trapId,
                    xmin, zmin, xmax, zmax,
                    y: floorPos
                });
                trapId += 1
            }
            //goal
            if (tile.is_start) {
                allGoalBounds += boundsPart({
                    name: "start",
                    id: goalId,
                    xmin, zmin, xmax, zmax,
                    y: floorPos
                });
                goalId += 1
            }
            if (tile.is_swamp) {
                allSwampBounds += boundsPart({
                    name: "swamp",
                    id: swampId,
                    xmin, zmin, xmax, zmax,
                    y: floorPos
                });
                swampId +=1
            }
            //Increment id counter
            tileId += 1

            //Human
            if(tile.wall_token_type != 0){
                //Position of tile
                let humanPos = [
                    (x * 0.3 * tileScale[0]) + startX ,
                    (z * 0.3 * tileScale[2]) + startZ
                ]
                let humanRot = humanRotation[tile.wall_token_place]
                //Randomly move human left and right on wall
                let randomOffset = [0, 0]
                if ((inBounds(z-1, x  ) && tiles[z-1][x  ].wall_token_type == 0) &&  // ensure no adjacent tile victims (random offset can place too close)
                    (inBounds(z+1, x  ) && tiles[z+1][x  ].wall_token_type == 0) && 
                    (inBounds(z  , x-1) && tiles[z  ][x-1].wall_token_type == 0) && 
                    (inBounds(z  , x+1) && tiles[z  ][x+1].wall_token_type == 0)) {
                    if(tile.wall_token_place == HUMAN_PLACE_TOP || tile.wall_token_place == HUMAN_PLACE_BOTTOM){
                        //X offset for top and bottom
                        randomOffset = [orgRound(getRandomArbitrary(-0.1 * tileScale[0], 0.1 * tileScale[0]), 0.001), 0]
                    } else {
                        //Z offset for left and right
                        randomOffset = [0, orgRound(getRandomArbitrary(-0.1 * tileScale[2], 0.1 * tileScale[2]), 0.001)]
                    }
                }
                randomOffset=[0,0] //remove random offset because its causing too many issues with CT
                // where the editor moved it along its wall (1 cm of the editor is 0.01 m here)
                if (tile.wall_token_offset) {
                    randomOffset = (tile.wall_token_place == HUMAN_PLACE_TOP || tile.wall_token_place == HUMAN_PLACE_BOTTOM)
                        ? [tile.wall_token_offset * 0.01, 0] : [0, tile.wall_token_offset * 0.01]
                }
                if (tile.wall_token_type >= 5){ //hazards (includes HUMAN_CT_FAKE=9)
                    humanPos[0] = humanPos[0] + hazardOffset[tile.wall_token_place][0] + randomOffset[0]
                    humanPos[1] = humanPos[1] + hazardOffset[tile.wall_token_place][1] + randomOffset[1]
                    let score = (tile.wall_token_type === HUMAN_CT_FAKE) ? 0 : (tile.is_linear ? 10 : 30)
                    allHazards = allHazards + hazardPart({
                        x: humanPos[0],
                        z: humanPos[1],
                        rot: humanRot,
                        frontRotation: tile.wall_token_front_rot,
                        is_fake: tile.wall_token_is_fake,
                        id: hazardId,
                        type: tile.wall_token_cognitive_code,
                        score: score
                    })
                    hazardId = hazardId + 1
                } else { //humans
                    humanPos[0] = humanPos[0] + humanOffset[tile.wall_token_place][0] + randomOffset[0]
                    humanPos[1] = humanPos[1] + humanOffset[tile.wall_token_place][1] + randomOffset[1]
                    let score = 15
                    if(tile.is_linear) score = 5
                    if (tile.wall_token_is_fake) {
                        allFakes = allFakes + visualHumanPart({
                            x: humanPos[0],
                            z: humanPos[1],
                            rot: humanRot,
                            frontRotation: tile.wall_token_front_rot,
                            is_fake: tile.wall_token_is_fake,
                            id: humanId,
                            type: humanTypesVisual[tile.wall_token_type - 1],
                            score: 0
                        })
                        fakeHumanId = fakeHumanId + 1
                    } else {
                        allHumans = allHumans + visualHumanPart({
                            x: humanPos[0],
                            z: humanPos[1],
                            rot: humanRot,
                            frontRotation: tile.wall_token_front_rot,
                            is_fake: tile.wall_token_is_fake,
                            id: humanId,
                            type: humanTypesVisual[tile.wall_token_type - 1],
                            score: score
                        })
                        humanId = humanId + 1
                    }
                }
            }
            if(tile.half_wall_tokens){
                for (i in range(16)) {
                    if (tile.half_wall_tokens[i] || (tile.half_wall_tokens_cognitive_codes && tile.half_wall_tokens_cognitive_codes[i])) {
                        let humanType = Number(tile.half_wall_tokens[i]);
                        let humanPos = [(x * 0.3 * tileScale[0]) + startX , (z * 0.3 * tileScale[2]) + startZ]
                        let humanFrontRotation = tile.half_wall_tokens_front_rot[i];
                        console.log("Fakes: ", tile.half_wall_tokens_fakes);
                        let humanIsFake        = tile.half_wall_tokens_fakes[i];
                        console.log("humanIsFake: ", humanIsFake);
                        console.log("i: ", i);
                        if (humanFrontRotation === undefined) humanFrontRotation = 0;
                        let score = 30
                        if(tile.is_linear) score = 10
                        //Curved Wall Humans
                        let curveWallArr = JSON.parse(tile.curved_walls);
                        if (curveWallArr[parseInt(String(i / 4))]) {
                            let curveDir = curveWallArr[parseInt(String(i / 4))] - 1;
                            let inside = 0;
                            let ind = parseInt(String(i / 4)) * 4 + curveDir;
                            // if victim is on inside or outside of curve
                            if (!(curveDir == (parseInt(i) + 2) % 4 || curveDir == (parseInt(i) + 1) % 4)) {
                                console.log("outside");
                                inside = 1;
                                curveDir = (curveDir + 2) % 4;
                            } else {
                                console.log("inside");
                            }
                            // where the editor moved it round the arc (cm of arc, + clockwise as drawn): its
                            // place turned about the arc's centre, and its facing with it
                            let arcTurn = (Number(tile.half_wall_tokens_offsets && tile.half_wall_tokens_offsets[i]) || 0) / 6;
                            let q = parseInt(String(i / 4)), corner = [[0, 6], [0, 0], [6, 0], [6, 6]][curveWallArr[q] - 1];
                            let arcCentre = [humanPos[0] + (-6 + (q % 2) * 6 + corner[0]) * 0.01, humanPos[1] + (-6 + Math.floor(q / 2) * 6 + corner[1]) * 0.01];
                            let onArc = function (part: VictimPart): VictimPart {
                                if (!arcTurn) return part;
                                let dx = part.x - arcCentre[0], dz = part.z - arcCentre[1];
                                part.x = arcCentre[0] + dx * Math.cos(arcTurn) - dz * Math.sin(arcTurn);
                                part.z = arcCentre[1] + dx * Math.sin(arcTurn) + dz * Math.cos(arcTurn);
                                part.rot = part.rot - arcTurn;
                                return part;
                            }
                            if (humanType >= 0 && humanType <= 3) { // is human victim
                                console.log("HP: " + humanPos);
                                console.log("Curve Offset: " + curveWallVicPos[ind] + " " + ind + " " + i);
                                console.log("Curvedir: " + curveDir);
                                console.log("Inside: " + inside);
                                console.log("In/Out X: " + humanOffsetCurve[curveDir][0] * inside);
                                console.log("In/Out Z: " + humanOffsetCurve[curveDir][1] * inside);
                                console.log("X: " + humanPos[0] + curveWallVicPos[ind][0] + humanOffsetCurve[curveDir][0] * inside);
                                console.log("Z: " + humanPos[1] + curveWallVicPos[ind][1] + humanOffsetCurve[curveDir][1] * inside);
                                score = score / 2;
                                //allHumans = allHumans + visualHumanPart({x: humanPos[0], z: humanPos[1], rot: humanRotationCurve[curveDir], id: humanId, type: humanTypesVisual[walls[z][x][13][i] - 1], score: score})
                                if (humanIsFake) {
                                    allFakes = allFakes + visualHumanPart(onArc({
                                        x: humanPos[0] + curveWallVicPos[ind][0] + humanOffsetCurve[curveDir][0] * inside,
                                        z: humanPos[1] + curveWallVicPos[ind][1] + humanOffsetCurve[curveDir][1] * inside,
                                        rot: humanRotationCurve[curveDir],
                                        frontRotation: humanFrontRotation,
                                        is_fake: humanIsFake,
                                        id: humanId,
                                        type: humanTypesVisual[tile.half_wall_tokens[i] - 1],
                                        score: 0
                                    }))
                                    fakeHumanId = fakeHumanId + 1

                                } else {
                                    allHumans = allHumans + visualHumanPart(onArc({
                                        x: humanPos[0] + curveWallVicPos[ind][0] + humanOffsetCurve[curveDir][0] * inside,
                                        z: humanPos[1] + curveWallVicPos[ind][1] + humanOffsetCurve[curveDir][1] * inside,
                                        rot: humanRotationCurve[curveDir],
                                        frontRotation: humanFrontRotation,
                                        is_fake: humanIsFake,
                                        id: humanId,
                                        type: humanTypesVisual[tile.half_wall_tokens[i] - 1],
                                        score: score
                                    }))
                                    humanId = humanId + 1
                                }
                            } else if (humanType >= 5) { // is hazmat sign (includes CTfake=9)
                                let cogOffsetFactor = inside ? inside : 0.25;
                                let hazScore = (humanType === HUMAN_CT_FAKE) ? 0 : score;
                                allHazards = allHazards + hazardPart(onArc({
                                    x: humanPos[0] + curveWallVicPos[ind][0] + humanOffsetCurve[curveDir][0] * cogOffsetFactor,
                                    z: humanPos[1] + curveWallVicPos[ind][1] + humanOffsetCurve[curveDir][1] * cogOffsetFactor,
                                    rot: humanRotationCurve[curveDir],
                                    frontRotation: humanFrontRotation,
                                    is_fake: humanIsFake,
                                    id: hazardId,
                                    type: tile.half_wall_tokens_cognitive_codes[i],
                                    score: hazScore
                                }))
                                hazardId = hazardId + 1
                            } else if (isNaN(humanType) && tile.half_wall_tokens_cognitive_codes[i]) { // invalid CT code (legacy fallback)
                                let cogOffsetFactor = inside ? inside : 0.25;
                                allHazards = allHazards + hazardPart(onArc({
                                    x: humanPos[0] + curveWallVicPos[ind][0] + humanOffsetCurve[curveDir][0] * cogOffsetFactor,
                                    z: humanPos[1] + curveWallVicPos[ind][1] + humanOffsetCurve[curveDir][1] * cogOffsetFactor,
                                    rot: humanRotationCurve[curveDir],
                                    frontRotation: humanFrontRotation,
                                    is_fake: humanIsFake,
                                    id: hazardId,
                                    type: tile.half_wall_tokens_cognitive_codes[i],
                                    score: 0
                                }))
                                hazardId = hazardId + 1
                            }
                        }
                        //Half Wall Humans
                        else {
                            // where the editor moved it along its 6 cm wall: x on a top or bottom face, z on a side one
                            let along = Number(tile.half_wall_tokens_offsets && tile.half_wall_tokens_offsets[i]) || 0;
                            let halfOff = (i % 2 == 0) ? [along * 0.01, 0] : [0, along * 0.01];
                            if (humanType >= 0 && humanType <= 3) {
                                score = score / 2;
                                if (humanIsFake) {
                                    allFakes = allFakes + visualHumanPart({
                                        x: humanPos[0] + halfWallVicPos[i][0] * tileScale[0] + halfOff[0],
                                        z: humanPos[1] + halfWallVicPos[i][1] * tileScale[2] + halfOff[1],
                                        rot: humanRotation[i % 4],
                                        frontRotation: humanFrontRotation,
                                        is_fake: humanIsFake,
                                        id: humanId,
                                        type: humanTypesVisual[tile.half_wall_tokens[i] - 1],
                                        score: 0
                                    })
                                    fakeHumanId = fakeHumanId + 1
                                } else {
                                    allHumans = allHumans + visualHumanPart({
                                        x: humanPos[0] + halfWallVicPos[i][0] * tileScale[0] + halfOff[0],
                                        z: humanPos[1] + halfWallVicPos[i][1] * tileScale[2] + halfOff[1],
                                        rot: humanRotation[i % 4],
                                        frontRotation: humanFrontRotation,
                                        is_fake: humanIsFake,
                                        id: humanId,
                                        type: humanTypesVisual[tile.half_wall_tokens[i] - 1],
                                        score: score
                                    })
                                    humanId = humanId + 1
                                }
                            }
                            else if (humanType >= 5) { // is hazmat sign (includes CTfake=9)
                                let hazScore = (humanType === HUMAN_CT_FAKE) ? 0 : score;
                                allHazards = allHazards + hazardPart({
                                    x: humanPos[0] + halfWallVicPos[i][0] * tileScale[0] + halfOff[0],
                                    z: humanPos[1] + halfWallVicPos[i][1] * tileScale[2] + halfOff[1],
                                    rot: humanRotation[i % 4],
                                    frontRotation: humanFrontRotation,
                                    is_fake: humanIsFake,
                                    id: hazardId,
                                    type: tile.half_wall_tokens_cognitive_codes[i],
                                    score: hazScore
                                })
                                hazardId = hazardId + 1
                            } else if (isNaN(humanType) && tile.half_wall_tokens_cognitive_codes[i]) { // invalid CT code (legacy fallback)
                                allHazards = allHazards + hazardPart({
                                    x: humanPos[0] + halfWallVicPos[i][0] * tileScale[0] + halfOff[0],
                                    z: humanPos[1] + halfWallVicPos[i][1] * tileScale[2] + halfOff[1],
                                    rot: humanRotation[i % 4],
                                    frontRotation: humanFrontRotation,
                                    is_fake: humanIsFake,
                                    id: hazardId,
                                    type: tile.half_wall_tokens_cognitive_codes[i],
                                    score: 0
                                })
                                hazardId = hazardId + 1
                            }
                        }
                    }
                }
            }
            //Obstacle
            if(tile.is_obstacle != 0){
                //Default height for static obstacle
                let height = 0.15

                //Default size contstraints for static obstacle
                let minSize = 5
                let maxSize = 15

                //Generate random size
                let width = getRandomArbitrary(minSize, maxSize) / 100.0
                let depth = getRandomArbitrary(minSize, maxSize) / 100.0

                //Calculate radius of obstacle
                let r = (((width / 2.0) ** 2) + ((depth / 2.0) ** 2)) ** 0.50

                //Boundaries of tile to pick
                console.log(r)
                let xBounds = [-0.1 + r, 0.1 - r]
                let zBounds = [-0.1 + r, 0.1 - r]

                //Get the centre position of the tile
                let tPos = [(x * 0.3 * tileScale[0]) + startX , (z * 0.3 * tileScale[2]) + startZ]

                //Get a random position
                let pos = [orgRound(getRandomArbitrary(xBounds[0], xBounds[1]), 0.00001), orgRound(getRandomArbitrary(zBounds[0], zBounds[1]), 0.00001)]
                //Offset with tile position
                pos[0] = pos[0] + tPos[0]
                pos[1] = pos[1] + tPos[1]

                //Random rotation for obstacle
                let rot = orgRound(getRandomArbitrary(0.00, 6.28), 0.001)

                allObstacles += obstaclePart({
                    id: obstacleId,
                    xSize: width  * tileScale[0],
                    ySize: height * tileScale[1],
                    zSize: depth  * tileScale[2],
                    x: pos[0], y: 0, z: pos[1],
                    rot: rot
                })
                //Increment id counter
                obstacleId = obstacleId + 1

            }
        }
    }

    // area 4 positioning
    if (map.area4Room.value == "Custom Room") {
        allTiles = allTiles + hooks!.createArea4Solid!();
        map.room4VicTypes = [];
        let scoringElements = hooks!.createArea4Victims!(humanId, hazardId);
        allHumans += scoringElements[0];
        allHazards += scoringElements[1];
        allFakes += scoringElements[2];
    }
    else {
        room4 = map.area4[map.area4Room.type]
        if (map.area4Room.type != 0 && map.connect14 && map.connect34) {
            connect14 = [(map.connect14[0] - 1) / 2, (map.connect14[1] - 1) / 2]
            connect34 = [(map.connect34[0] - 1) / 2, (map.connect34[1] - 1) / 2]
            area4X = 0
            area4Y = 0
            area4Rot = 0

            area4X = connect14[0]
            area4Y = connect14[1]

            if      (connect34[0] - connect14[0] == room4.room3Tile[0] - room4.room1Tile[0] &&
                     connect34[1] - connect14[1] == room4.room3Tile[1] - room4.room1Tile[1]) area4Rot = DIR_NORTH;
            else if (connect14[0] - connect34[0] == room4.room3Tile[1] - room4.room1Tile[1] &&
                     connect34[1] - connect14[1] == room4.room3Tile[0] - room4.room1Tile[0]) area4Rot = DIR_EAST;
            else if (connect14[0] - connect34[0] == room4.room3Tile[0] - room4.room1Tile[0] &&
                     connect14[1] - connect34[1] == room4.room3Tile[1] - room4.room1Tile[1]) area4Rot = DIR_SOUTH;
            else if (connect34[0] - connect14[0] == room4.room3Tile[1] - room4.room1Tile[1] &&
                     connect14[1] - connect34[1] == room4.room3Tile[0] - room4.room1Tile[0]) area4Rot = DIR_WEST;

            startTrans = vectorRotate(room4.room1Tile, area4Rot)
            area4X -= startTrans[0]
            area4Y -= startTrans[1]
            allTiles = allTiles + area4Part({ roomNum: map.area4Room.type, x: area4X, y: area4Y, rot: area4Rot, width: width, height: height, xScale: tileScale[0], yScale: tileScale[1], zScale: tileScale[2], area4Width: room4.width, area4Height: room4.height})

            xOffset = -(width  * 0.3 * tileScale[0] / 2.0) + area4X * 0.3 * tileScale[0]
            zOffset = -(height * 0.3 * tileScale[1] / 2.0) + area4Y * 0.3 * tileScale[1]
            area4Humans = room4.humans
            for (i = 0; i < area4Humans.length; i++) {
                vicPosTrans = vectorRotate([area4Humans[i].x, area4Humans[i].z], area4Rot)
                thisHuman = {
                    x: vicPosTrans[0] + xOffset,
                    z: vicPosTrans[1] + zOffset,
                    rot: area4Humans[i].rot + area4Rot * -1.57,
                    frontRotation: getRandomAngle(),
                    id: humanId,
                    is_fake: area4Humans[i].is_fake,
                    type: area4Humans[i].type,
                    score: area4Humans[i].score,
                }
                if (thisHuman.is_fake) {
                    thisHuman.score = 0;
                    allFakes += visualHumanPart(thisHuman)
                    fakeHumanId += 1
                } else {
                    allHumans += visualHumanPart(thisHuman)
                    humanId += 1
                }
            }
            area4Hazards = room4.hazards
            for (i = 0; i < area4Hazards.length; i++) {
                hazPosTrans = vectorRotate([area4Hazards[i].x, area4Hazards[i].z], area4Rot)
                thisHazard = {
                    x: hazPosTrans[0] + xOffset,
                    z: hazPosTrans[1] + zOffset,
                    rot: area4Hazards[i].rot + area4Rot * -1.57,
                    frontRotation: getRandomAngle(),
                    id: hazardId,
                    // Erebus 2026 only shows/scores targets whose type is a 5-letter ring code
                    type: randomCognitiveCode(area4Hazards[i].type),
                    score: area4Hazards[i].score,
                }
                allHazards += hazardPart(thisHazard)
                hazardId += 1
            }
        }
    }

    //Add the data pieces to the file data
    fileData = fileData + groupPart({data: allTiles,            name: "WALLTILES"})
    fileData = fileData + groupPart({data: allCheckpointBounds, name: "CHECKPOINTBOUNDS"})
    fileData = fileData + groupPart({data: allTrapBounds,       name: "TRAPBOUNDS"})
    fileData = fileData + groupPart({data: allGoalBounds,       name: "STARTBOUNDS"})
    fileData = fileData + groupPart({data: allSwampBounds,      name: "SWAMPBOUNDS"})
    fileData = fileData + groupPart({data: allObstacles,        name: "OBSTACLES"})
    fileData = fileData + groupPart({data: allHumans,           name: "HUMANGROUP"})
    fileData = fileData + groupPart({data: allFakes,            name: "FAKES"})
    fileData = fileData + groupPart({data: allHazards,          name: "TARGETGROUP"})
    fileData = fileData + supervisorPart({time: map.time})
    return fileData

}

export {
    calculateWallTokenRot,
    createWorld
};
