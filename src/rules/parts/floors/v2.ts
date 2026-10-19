// The floors of 2027: those of 2026 (checkpoints, holes, swamps - a swamp now drains the battery
// faster, 3.6.2) and contact tiles (cyan, 3.7), where the robot has its battery replaced: a tile
// in contact with the outside (4.3), so only one beside the field's outer wall. Its cyan is as Erebus
// shows it: worldTile's diffuseColor 0 0.635 0.635, a linear colour, is #00d1d1 on the screen
import type { FloorKind } from '../../types';
import { floors as v1 } from './v1';

export const floors: FloorKind[] = v1.concat([
    { id: 'contact', icon: 'fa-battery-full', color: '#00d1d1', hole: false, checkpoint: false, outerOnly: true }
]);
