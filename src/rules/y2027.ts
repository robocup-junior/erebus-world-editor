// RoboCupJunior Rescue Simulation 2027 (the draft rules of 2026-10-14), played on Erebus 27 (Webots
// R2025a). What changes from 2026: contact tiles (floors v2), smiley victims (tokens v2) and the world
// file of Erebus 27; the rule numbers of the wall tokens move from 3.7 to 3.8.
import type { Ruleset } from './types';
import { geometry } from './parts/geometry/v1';
import { rooms } from './parts/rooms/v1';
import { floors } from './parts/floors/v2';
import { passages } from './parts/passages/v1';
import { tokens } from './parts/tokens/v2';
import * as scoring from './parts/scoring/v1';
import { exporter } from './parts/export/erebus27/index';

export const rules: Ruleset = {
    year: 2027,
    draft: true,
    book: 'https://junior.robocup.org/wp-content/uploads/2026/09/RCJRescueSimulation2027-draft.pdf',
    classic: '',                    // made in this editor only
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
        contactTile: '4.3',         // a contact tile is in contact with the outside
        passageTokens: '3.8.2',     // no tokens in the passages between areas
        scoring: '5.6'
    }
};
