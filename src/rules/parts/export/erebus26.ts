// The world file for Erebus 26.x (lib/world2026: the tiles, walls and tokens; lib/room4World2026: a
// custom room 4 read from its picture)
import type { Exporter } from '../../types';
import * as W from '../../../lib/world2026';
import * as R4W from '../../../lib/room4World2026';

export const exporter: Exporter = {
    erebus: '26',
    createWorld: function (map, hooks) { return W.createWorld(map, hooks); },
    room4: function (map) { return R4W.create(map); }
};
