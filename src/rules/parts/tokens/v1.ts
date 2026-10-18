// The victims (wall tokens) of 2026: letter victims Φ Ψ Ω, 2 cm (rule 3.7.2), real or fake (3D
// letters, 3.7.4); cognitive targets, 5 cm (3.7.7), whose five rings give their type (3.7.9) - one
// whose rings add up to no type is a fake. None in a passage between areas (3.7.2). In the map file
// (the classic editor's format) a letter victim is its letter on a tile side and 1-3 on a 6 cm face,
// a target its ring code and the value of its type (5-8).
import type { Tokens, StampType } from '../../types';
import { cognitiveCodeToVictimLetter, randomCognitiveCode } from './cognitive';

// The colours of the victims by type, so a map shows at a glance which is where: harmed orange,
// stable blue, unharmed green (apart from the targets' type colours); a fake is drawn hollow in its
// type's colour
const HARMED = '#ea580c', STABLE = '#2563eb', UNHARMED = '#16a34a';

// The stamps of the room 4 picture: idx is the type the picture's colour names (lib/room4); coloured
// as the victims of the editor - victims by their type (fakes hollow), targets by type
const stamps: StampType[] = [
    { idx: 0,  kind: 'victim', symbol: 'Φ', color: HARMED, name: 'admin.simMapEditor.room4Creator.types.harmed' },
    { idx: 1,  kind: 'victim', symbol: 'Ψ', color: STABLE, name: 'admin.simMapEditor.room4Creator.types.stable' },
    { idx: 2,  kind: 'victim', symbol: 'Ω', color: UNHARMED, name: 'admin.simMapEditor.room4Creator.types.unharmed' },
    // fake victims are letter victims too (3D letters), so they sit with them
    { idx: 9,  kind: 'fake', symbol: 'Φ', color: HARMED, name: 'admin.simMapEditor.room4Creator.types.fakeHarmed' },
    { idx: 8,  kind: 'fake', symbol: 'Ψ', color: STABLE, name: 'admin.simMapEditor.room4Creator.types.fakeStable' },
    { idx: 10, kind: 'fake', symbol: 'Ω', color: UNHARMED, name: 'admin.simMapEditor.room4Creator.types.fakeUnharmed' },
    { idx: 5,  kind: 'ct', symbol: 'F', color: '#dc2626', name: 'admin.simMapEditor.ctF' },
    { idx: 3,  kind: 'ct', symbol: 'P', color: '#7e22ce', name: 'admin.simMapEditor.ctP' },
    { idx: 6,  kind: 'ct', symbol: 'C', color: '#1f2937', name: 'admin.simMapEditor.ctC' },
    { idx: 4,  kind: 'ct', symbol: 'O', color: '#eab308', name: 'admin.simMapEditor.ctO' },
    { idx: 7,  kind: 'fakect', symbol: '×', color: '#a8b0bb', name: 'admin.simMapEditor.ctFake' }
];

export const tokens: Tokens = {
    kinds: [
        { id: 'H', family: 'letter', symbol: 'Φ', nameKey: 'admin.simMapEditor.room4Creator.types.harmed', widthCm: 2, fakeable: true, edge: 'H', slot: '1', color: HARMED },
        { id: 'S', family: 'letter', symbol: 'Ψ', nameKey: 'admin.simMapEditor.room4Creator.types.stable', widthCm: 2, fakeable: true, edge: 'S', slot: '3', color: STABLE },
        { id: 'U', family: 'letter', symbol: 'Ω', nameKey: 'admin.simMapEditor.room4Creator.types.unharmed', widthCm: 2, fakeable: true, edge: 'U', slot: '2', color: UNHARMED },
        { id: 'CT', family: 'target', symbol: 'CT', nameKey: 'admin.simMapEditor.room4Creator.groups.ct', widthCm: 5, fakeable: false }
    ],
    gapCm: 0.5,
    inPassages: false,
    target: {
        typeOf: function (code) { return cognitiveCodeToVictimLetter(code); },
        randomCode: function (type) { return randomCognitiveCode(type); },
        slot: { F: 5, P: 6, C: 7, O: 8 }
    },
    stamps: stamps
};
