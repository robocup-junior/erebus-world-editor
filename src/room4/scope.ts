// What the room 4 creator's picture (canvas.ts) is given: the creator's state and the few things it
// asks of it, with $apply / $applyAsync (then the page drawn again), $watch / $watchGroup on paths
// of the scope ('r4.tool': its listener is called once at the start too, as the old editor did) and
// $on('$destroy') - the creator calls destroy() when it goes.
import { watch } from 'vue';
import { apply, applyAsync } from '../editor/runtime';
import type { Room4Host } from '../editor/editor';
import type { StampType as RuleStamp } from '../rules/types';

export type StampType = RuleStamp;
export interface ShapeIcon { name: string; label?: string; terms?: string[]; styles: string[]; unicode?: string }

// The creator's state, shown by its panels and changed by the picture
export interface R4State {
    tool: string;
    floor: string;          // the floor tool's floor: 'checkpoint', 'black', 'swamp' or 'clear'
    stamp: number;
    snap: boolean;
    eraser: string;
    eraseTarget: string;
    showReach: boolean;
    mirror: string;
    smooth: boolean;
    sides: number;
    shapeSource: string;
    shapeStyle: string;
    shapeRot: number;
    shapeReady: boolean;
    shapePreview: string;
    shapeName: string;
    iconQuery: string;
    iconCategory: string;
    unreachCount: number;
    showGuides: boolean;
    zoom: number;
    zoomPct: number;
    panning: boolean;
    hasSelection: boolean;
    hasClip: boolean;
    randomCount: number;
    randomMode: string;
    template: string;
    templateClear: boolean;
    messageParams: Record<string, unknown>;
    entranceCount: number;
    passageCount: number;
    missingCheckpoints: number;
    reachState: string;
    reachBlocked?: number;
    reachRoom?: number;
    canUndo: boolean;
    canRedo: boolean;
    undoCount?: number;
    drawCount?: number;
    summary: { idx: number; count: number }[];
    tokenCount: number;
    farCount: number;
    message: string;
    rings: string[];
    ring: number;
    rot: number;
    randomRot: boolean;
    sel: { cx: number; cy: number; idx: number; rot: number | null; code: string | null } | null;
}

export interface CreatorScope {
    r4: R4State;
    r4api: Record<string, (...args: any[]) => any>;
    host: Room4Host;
    stampTypes: StampType[];
    tools: { id: string; icon: string; key: string }[];
    r4tips: { stamp: string; other: string; curve: string; arc: string } | null;
    ctLetterOf(idx: number): string | null;
    setTool(id: string): void;
    pickIcon(icon: ShapeIcon): void;
    $apply(fn: () => void): void;
    $applyAsync(fn: () => void): void;
    $watch(path: string, listener: (now: any, before: any) => void): void;
    $watchGroup(paths: string[], listener: () => void): void;
    $on(event: '$destroy', fn: () => void): void;
}

// The scope functions over `self` (the creator's scope object): start() calls the listeners once
// (after the picture is set up), destroy() stops the watchers and runs the $destroy handlers
export function scopeTools(self: () => Record<string, any>) {
    const destroyers: (() => void)[] = [];
    const starts: (() => void)[] = [];
    const read = function (path: string) {
        return function () { return path.split('.').reduce(function (o: any, k) { return o == null ? o : o[k]; }, self()); };
    };
    return {
        $apply: function (fn: () => void) { apply(fn); },
        $applyAsync: applyAsync,
        $watch: function (path: string, listener: (now: any, before: any) => void) {
            const get = read(path);
            destroyers.push(watch(get, listener));
            starts.push(function () { const v = get(); listener(v, v); });
        },
        $watchGroup: function (paths: string[], listener: () => void) {
            const gets = paths.map(read);
            destroyers.push(watch(gets, function () { listener(); }));
            starts.push(function () { listener(); });
        },
        $on: function (event: '$destroy', fn: () => void) { destroyers.push(fn); },
        start: function () { starts.splice(0).forEach(function (f) { f(); }); },
        destroy: function () { destroyers.splice(0).forEach(function (f) { f(); }); }
    };
}
