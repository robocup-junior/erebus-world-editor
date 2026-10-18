// The passages of 2026 (rule 3.2.2: one tile wide, its floor in a colour; 3.4: the colour of each
// pair of areas), and a checkpoint right behind each passage into area 4 (3.5.3)
import type { Passages } from '../../types';

export const passages: Passages = {
    list: [
        { color: '#1a1ae6', from: 1, to: 2, name: 'admin.simMapEditor.passageBlue' },
        { color: '#e7e71a', from: 1, to: 3, name: 'admin.simMapEditor.passageYellow' },
        { color: '#08D508', from: 1, to: 4, name: 'admin.simMapEditor.passageGreen' },
        { color: '#4d1a99', from: 2, to: 3, name: 'admin.simMapEditor.passagePurple' },
        { color: '#e7991a', from: 2, to: 4, name: 'admin.simMapEditor.passageOrange' },
        { color: '#e71a1a', from: 3, to: 4, name: 'admin.simMapEditor.passageRed' }
    ],
    room4Checkpoints: true
};
