// The world file for Erebus 26.x (./world: the tiles, walls and tokens; ./room4: a custom room 4 read
// from its picture)
import type { Exporter } from '../../../types';
import * as W from './world';
import * as R4W from './room4';

export const exporter: Exporter = {
    erebus: '26',
    createWorld: function (map, hooks) { return W.createWorld(map, hooks); },
    room4: function (map) { return R4W.create(map); }
};
