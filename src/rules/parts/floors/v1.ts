// The floors of 2026: checkpoints (silver, rule 3.5), holes (3.6.4: the whole tile, the robot keeps
// off it) and swamps (brown, 3.6.2)
import type { FloorKind } from '../../types';

export const floors: FloorKind[] = [
    { id: 'checkpoint', icon: 'fa-flag-checkered', color: '#cbd5e1', hole: false, checkpoint: true, outerOnly: false },
    { id: 'black', icon: 'fa-square', color: '#111', hole: true, checkpoint: false, outerOnly: false },
    { id: 'swamp', icon: 'fa-water', color: '#cd853f', hole: false, checkpoint: false, outerOnly: false }
];
