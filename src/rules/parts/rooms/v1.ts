// What each room takes (2026: rule 3.3.2). Room 1: whole tile edges (12 cm). Rooms 2 and 3: the 6 cm
// grid (halves of tile edges, and walls inside a tile); room 3 also quarter circles. Room 4: a
// picture, drawn freely; walls on its border with another room are tile edges like any other.
import type { RoomRules } from '../../types';

export const rooms: Record<number, RoomRules> = {
    1: { edges: 'whole', inner: false, curves: false, picture: false, tokens: 'edge' },
    2: { edges: 'half', inner: true, curves: false, picture: false, tokens: 'slot' },
    3: { edges: 'half', inner: true, curves: true, picture: false, tokens: 'slot' },
    4: { edges: 'half', inner: false, curves: false, picture: true, tokens: 'picture' }
};
