// The floors of 2026: checkpoints (silver, rule 3.5), holes (3.6.4: a black tile, a hole inside its
// 1.5 cm rim; the robot's centre keeps off the hole) and swamps (brown, 3.6.2). A tile is no more than
// one of a swamp, a hole, a checkpoint, the start or a passage (5.6.10.b.iii): each is alone
import type { FloorKind } from '../../types';

export const floors: FloorKind[] = [
    { id: 'checkpoint', icon: 'fa-flag-checkered', color: '#cbd5e1', hole: false, checkpoint: true, alone: true },
    { id: 'black', icon: 'fa-square', color: '#111', hole: true, checkpoint: false, alone: true },
    { id: 'swamp', icon: 'fa-water', color: '#cd853f', hole: false, checkpoint: false, alone: true }
];
