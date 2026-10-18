// The world file for Erebus 27 (Webots R2025a): the file of Erebus 26.x (../erebus26) with contact
// tiles (a tile's contact field; Erebus colours it cyan) and the 2027 fake victims, whose models are
// smiley faces kept under the 2026 names - Fake's type phi is the neutral face (S.stl), psi the sad
// one (H.stl), omega the happy one (U.stl)
import type { Exporter } from '../../../types';
import * as W from '../erebus26/world';
import * as R4W from '../erebus26/room4';

const EREBUS27: W.Flavor = {
    contact: true,
    fakeModel: { harmed: 'psi', stable: 'phi', unharmed: 'omega' }
};

export const exporter: Exporter = {
    erebus: '27',
    createWorld: function (map, hooks) { return W.createWorld(map, hooks, EREBUS27); },
    room4: function (map) { return R4W.create(map, EREBUS27); }
};
