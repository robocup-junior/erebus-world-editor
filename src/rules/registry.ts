// The years the editor takes, and the rules of a map. The only module that names the years: the rest
// of the editor asks rulesOf(map) and never compares years itself (test/simRulesBoundary.test.ts).
//
// To add a year: rules/yYYYY.ts (a manifest: copy the last one, and give a new version of each part
// that year changes - rules/parts/<part>/vN.ts, copied from the last version and changed), and a line
// in YEARS. To drop one: take its line out and delete its manifest; parts no year uses any more go too.
import type { MapData } from '../lib/types';
import type { Ruleset } from './types';
import { rules as y2026 } from './y2026';

// oldest first
const YEARS: Ruleset[] = [y2026];

// Years whose rules are on their way: the rules menu lists them, not to be picked yet. A year moves
// from here to YEARS once it is in.
const UPCOMING = [2027];

// A map file without a year is of the first year the editor made (2026)
export const FIRST_YEAR = 2026;
export const LATEST_YEAR = YEARS[YEARS.length - 1].year;

// The year the guide's lesson (lib/tour) is written for: its steps place that year's walls, floors
// and victims, so its sample map is of that year whatever year is the latest. When a lesson is
// written for a new year, change it with the lesson's steps and texts.
export const LESSON_YEAR = 2026;

export function years(): number[] {
    return YEARS.map(function (r) { return r.year; });
}

export function upcomingYears(): number[] {
    return UPCOMING.slice();
}

export function rulesFor(year: number): Ruleset | null {
    return YEARS.find(function (r) { return r.year === year; }) || null;
}

// The rules of the map's year; a year this editor does not take is an error (a map is checked on
// opening: rulesFor)
export function rulesOf(map: MapData): Ruleset {
    const year = Number(map.rules) || FIRST_YEAR;
    const r = rulesFor(year);
    if (!r) throw new Error('No rules for ' + year);
    return r;
}
