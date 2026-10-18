// The victims (wall tokens) of 2027: as 2026's (./v1), but a victim is a smiley face (rule 3.8.3) -
// harmed a sad face, stable a neutral one, unharmed a happy one - real or fake (3D faces, 3.8.4),
// drawn as Font Awesome's faces. Their codes (H S U), names and the map file are the same.
import type { Tokens, TokenKind, StampType } from '../../types';
import { tokens as v1 } from './v1';

const FACES: Record<string, string> = { H: 'face-frown', S: 'face-meh', U: 'face-smile' };
// the room 4 stamps of a victim (real or fake), by its type of victim
const STAMP: Record<number, string> = { 0: 'H', 1: 'S', 2: 'U', 9: 'H', 8: 'S', 10: 'U' };

const kinds: TokenKind[] = v1.kinds.map(function (k) {
    return FACES[k.id] ? Object.assign({}, k, { symbol: k.id, face: FACES[k.id] }) : k;
});

const stamps: StampType[] = v1.stamps.map(function (s) {
    const id = STAMP[s.idx];
    return id ? Object.assign({}, s, { symbol: id, face: FACES[id] }) : s;
});

export const tokens: Tokens = Object.assign({}, v1, { kinds: kinds, stamps: stamps });
