// The victims (wall tokens) of 2026: letter victims Φ Ψ Ω, 2 cm (rule 3.7.2), real or fake (3D
// letters, 3.7.4); cognitive targets, 5 cm (3.7.7), whose five rings give their type (3.7.9) - one
// whose rings add up to no type is a fake. None in a passage between areas (3.7.2). In the map file
// (the classic editor's format) a letter victim is its letter on a tile side and 1-3 on a 6 cm face,
// a target its ring code and the value of its type (5-8).
import type { Tokens } from '../../types';
import * as W from '../../../lib/world2026';
import * as R4W from '../../../lib/room4World2026';

export const tokens: Tokens = {
    kinds: [
        { id: 'H', family: 'letter', symbol: 'Φ', nameKey: 'admin.simMapEditor.room4Creator.types.harmed', widthCm: 2, fakeable: true, edge: 'H', slot: '1' },
        { id: 'S', family: 'letter', symbol: 'Ψ', nameKey: 'admin.simMapEditor.room4Creator.types.stable', widthCm: 2, fakeable: true, edge: 'S', slot: '3' },
        { id: 'U', family: 'letter', symbol: 'Ω', nameKey: 'admin.simMapEditor.room4Creator.types.unharmed', widthCm: 2, fakeable: true, edge: 'U', slot: '2' },
        { id: 'CT', family: 'target', symbol: 'CT', nameKey: 'admin.simMapEditor.room4Creator.groups.ct', widthCm: 5, fakeable: false }
    ],
    gapCm: 0.5,
    inPassages: false,
    target: {
        typeOf: function (code) { return W.cognitiveCodeToVictimLetter(code); },
        randomCode: function (type) { return W.randomCognitiveCode(type); },
        slot: { F: 5, P: 6, C: 7, O: 8 }
    },
    stamps: R4W.stampTypes
};
