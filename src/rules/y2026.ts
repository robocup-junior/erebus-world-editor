// RoboCupJunior Rescue Simulation 2026 (the rules of 2026-02-11), played on Erebus 26.x
import type { Ruleset } from './types';
import { geometry } from './parts/geometry/v1';
import { rooms } from './parts/rooms/v1';
import { floors } from './parts/floors/v1';
import { passages } from './parts/passages/v1';
import { tokens } from './parts/tokens/v1';
import * as scoring from './parts/scoring/v1';
import { exporter } from './parts/export/erebus26/index';

export const rules: Ruleset = {
    year: 2026,
    draft: false,
    book: 'https://junior.robocup.org/wp-content/uploads/2026/02/RCJRescueSimulation2026-final.pdf',
    geometry: geometry,
    rooms: rooms,
    floors: floors,
    passages: passages,
    tokens: tokens,
    scoring: scoring,
    export: exporter,
    refs: {
        reach: '3.2.4',             // no tokens where the robot cannot go
        room4Checkpoint: '3.5.3',   // a checkpoint right behind each passage into area 4
        passageTokens: '3.7.2',     // no tokens in the passages between areas
        scoring: '5.6'
    }
};
