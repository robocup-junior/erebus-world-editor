// The floors of 2027: those of 2026 (checkpoints, holes, swamps - a swamp now drains the battery
// faster, 3.6.2) and contact tiles (cyan, 3.7), where the robot has its battery replaced: a tile
// in contact with the outside (4.3), so only one beside the field's outer wall
import type { FloorKind } from '../../types';
import { floors as v1 } from './v1';

export const floors: FloorKind[] = v1.concat([
    { id: 'contact', icon: 'fa-battery-full', color: '#00a2a2', hole: false, checkpoint: false, outerOnly: true }
]);
