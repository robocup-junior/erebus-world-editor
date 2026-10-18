// Erebus World Editor: the map drawn on a canvas, with tools that follow the rules of the room
// under the pointer. Maps are the classic editor's JSON. Rooms with their border walls and passages,
// walls on the 12 / 6 cm grid, curves (room 3), floors, victims, a custom room 4 (drawn in the room 4
// creator; presets are left to the classic editor), undo, problems with where they are, JSON and .wbt.
//
// createEditor() gives the page's state (S, read by the components) with what the page does; the
// map itself is a plain object edited in place, and the page is drawn again after each change
// (runtime.digest).
import { reactive, markRaw, watch } from 'vue';
import * as M from '../lib/model';
import * as L from '../lib/lattice';
import * as W from '../lib/field';
import * as Icons from '../lib/icons';
import * as View from '../lib/view';
import * as T from '../lib/tour';
import * as Keys from '../lib/keys';
import { fixed } from './format';
import { rulesOf, rulesFor, years, upcomingYears, FIRST_YEAR, LATEST_YEAR } from '../rules/registry';
import type { Ruleset, MaxScore, StampType, Tokens, FloorKind } from '../rules/types';
import * as OpenCV from '../lib/opencv';
import type { MapData, Room4Token } from '../lib/types';
import type { Problem, Region, Where, VictimInfo, Clip, Show } from '../lib/model';
import type { TourStep, TourEnv, CreatorApi, Rect, StepState } from '../lib/tour';
import { i18n, t, lang, setLang, setRuleTexts, type Lang } from '../i18n';
import { tick, digest, apply, later, cancel, applyAsync } from './runtime';

const TILE = 12;

export interface Tool { id: string; icon: string; key: string }
interface StampChoice { id?: string; letter?: string; fake?: boolean; kind: string; symbol: string; face?: string; color: string; name: string }
interface ProblemItem { text: string; block: boolean; at: number[] | null; show: Show | null; raw: Problem; fix: string }
interface DialogAction { label: string; value: unknown; style: string; icon?: string }
interface Dialog {
    kind: 'error' | 'warn' | 'info';
    title: string;
    message?: string;
    items?: ProblemItem[];
    actions: DialogAction[];
    done: (v: unknown) => void;
}
interface Selected { where: Where; victim: VictimInfo; rot: number; letter: string; offset: number }
interface Notice { text: string; kind: string }
// The room 4 creator while it is open: what it is given, and what it leaves (its picture)
export interface Room4Host {
    roomTiles: string[][];
    canvasWidth: number;
    canvasHeight: number;
    room4MapGeometry(): W.MapGeometry;
    room4Img: HTMLImageElement;
    room4CanvasSave: string | null;
    room4Tokens: Room4Token[];
    room4StampTypes: StampType[];
    // the ring targets of the map's year: the type of a code, a random code of a type
    room4Target: Tokens['target'];
    // the kinds of floor of the map's year, and whether it wants a checkpoint behind each passage into
    // room 4
    room4FloorKinds: FloorKind[];
    room4Checkpoints: boolean;
    // whether a floor of that kind may be on the tile of cell (x, y) (a contact tile only beside the
    // field's outside)
    room4FloorFits(x: number, y: number, kind: string): boolean;
    // the floor of each room 4 tile ('black', 'swamp', 'checkpoint'; none left out), by its cell key
    // "x,y": set in the creator, put on the map when it closes
    room4Floors: Record<string, string>;
}
// The guide while it is shown
interface Tour {
    kind: string;
    steps: TourStep[];
    i: number;
    st: StepState;
    done: boolean;
    task?: string;
    outer: { tour: Tour; keep: TourKeep | null } | null;
    openedCreator: boolean;
    chapterIds: string[];
    chapters?: { id: string; first: number; done: number; count: number; on: boolean }[];
    compact?: boolean;
    compactSet?: boolean;
    ready?: boolean;
    left?: TourStep;
    lit?: Rect[];
    hole?: Record<string, string> | null;
    marks?: Record<string, string>[];
    regions?: Record<string, string>[];
    guides?: string[];
    card?: { left: string; top: string };
}
interface TourKeep { tool: string; checksFolded: boolean; shapeMode: string; made: boolean }

export function createEditor() {
    const tools: Tool[] = [
        // icons and keys as the same tools of the custom room 4 creator
        { id: 'select', icon: 'fas fa-mouse-pointer', key: 'S' },
        { id: 'hand', icon: 'fas fa-hand-paper', key: 'H' },
        { id: 'shape', icon: 'fas fa-crop-alt', key: 'X' },
        { id: 'room', icon: 'fas fa-layer-group', key: 'M' },
        { id: 'passage', icon: 'fas fa-door-open', key: 'P' },
        { id: 'line', icon: 'fas fa-slash', key: 'L' },
        { id: 'curve', icon: 'fas fa-circle-notch', key: 'A' },
        { id: 'eraser', icon: 'fas fa-eraser', key: 'E' },
        { id: 'floor', icon: 'fas fa-fill-drip', key: 'F' },
        { id: 'victim', icon: 'fas fa-user-injured', key: 'V' }
    ];
    // the rail shows them in groups: look / rooms / walls / floors and victims
    const byId = function (id: string) { return tools.find(function (x) { return x.id === id; })!; };
    // Victim choices, by the rules of the map's year (rules: tokens), as the stamps of the room 4
    // creator: its letter victims (real / fake rows) and its ring targets by type (a type gives random
    // rings of it, then the rings can be changed). Made again when a map of another year opens.
    function victimPanel(rules: Ruleset) {
        const kinds = rules.tokens.kinds, stamps = rules.tokens.stamps;
        const target = kinds.find(function (k) { return k.family === 'target'; });
        const idOf = function (symbol: string) {
            const k = kinds.find(function (k) { return k.family === 'letter' && k.symbol === symbol; });
            return k ? k.id : symbol;
        };
        return {
            victimRows: [
                { label: 'real', types: stamps.filter(function (x) { return x.kind === 'victim'; }) },
                { label: 'fake', types: stamps.filter(function (x) { return x.kind === 'fake'; }) }
            ].map(function (row) {
                return {
                    label: row.label,
                    types: row.types.map(function (x): StampChoice { return { id: idOf(x.symbol), fake: x.kind === 'fake', kind: x.kind, symbol: x.symbol, face: x.face, color: x.color, name: x.name }; })
                };
            }),
            ctStamps: stamps.filter(function (x) { return x.kind === 'ct' || x.kind === 'fakect'; })
                .map(function (x): StampChoice { return { letter: x.kind === 'fakect' ? 'X' : x.symbol, kind: x.kind, symbol: x.symbol, color: x.color, name: x.name }; }),
            victimChoices: kinds.map(function (k) { return { id: k.id, symbol: k.symbol, face: k.face }; }),
            // the kind that is a ring target ('' when the year has none)
            targetId: target ? target.id : ''
        };
    }
    const firstPanel = victimPanel(rulesFor(LATEST_YEAR)!);
    // The floor tool's choices: the kinds of floor of the map's year (rules: floors), the start tile
    // and none
    function floorPanel(rules: Ruleset) {
        return rules.floors.map(function (k) { return { id: k.id, icon: k.icon }; })
            .concat([{ id: 'start', icon: 'fa-play' }, { id: 'clear', icon: 'fa-times' }]);
    }
    let panelYear = LATEST_YEAR;

    const S = reactive({
        tools: tools,
        toolGroups: [['select', 'hand'], ['shape', 'room', 'passage'], ['line', 'curve', 'eraser'], ['floor', 'victim']]
            .map(function (g) { return g.map(byId); }),
        roomChoices: [1, 2, 3, 4],
        shapeModes: [
            { id: 'outline', icon: 'fa-crop-alt' }, { id: 'addRow', icon: 'fa-grip-lines' }, { id: 'addCol', icon: 'fa-grip-lines-vertical' },
            { id: 'delRow', icon: 'fa-minus' }, { id: 'delCol', icon: 'fa-minus fa-rotate-90' }
        ],
        floorChoices: floorPanel(rulesFor(LATEST_YEAR)!),
        // the rules menu: the year of the map open, the years the editor takes (with their rule
        // books) and those on their way
        ruleYear: LATEST_YEAR,
        ruleYears: years().map(function (y) { return { year: y, book: rulesFor(y)!.book, draft: rulesFor(y)!.draft }; }),
        upcomingYears: upcomingYears(),
        victimRows: firstPanel.victimRows,
        ctStamps: firstPanel.ctStamps,
        victimChoices: firstPanel.victimChoices,
        targetId: firstPanel.targetId,
        // Cognitive target: five rings, K R Y G B from the outside in (Erebus order); the sum of their
        // values gives the type (0 F, 1 P, 2 C, 3 O, anything else fake)
        ringColors: [
            { id: 'K', color: '#111827', value: -2 }, { id: 'R', color: '#dc2626', value: -1 }, { id: 'Y', color: '#facc15', value: 0 },
            { id: 'G', color: '#16a34a', value: 1 }, { id: 'B', color: '#2563eb', value: 2 }
        ],
        ctTypes: ['F', 'P', 'C', 'O', 'X'],
        selected: null as Selected | null,
        ui: {
            tool: 'line', room: 2, floor: 'checkpoint', victim: 'H', fake: false,
            // the year of the rules a new map is made with (asked on the start screen)
            newYear: LATEST_YEAR,
            rings: 'GYYKG'.split(''), ring: 0, rot: 0, randomRot: true, shapeMode: 'outline', showLinear: false,
            checksFolded: false, freshMap: false, betaMenu: false, scoreMenu: false, guidePick: false as false | string
        },
        map: null as MapData | null,
        fileName: '',
        problems: [] as ProblemItem[],
        blocking: false,
        // the most the map can score (rules: scoring), worked out after each change; null without a start
        score: null as MaxScore | null,
        hint: '',
        notice: null as Notice | null,
        canUndo: false,
        canRedo: false,
        zoom: 0,
        lang: lang() as Lang,
        error: '',
        errorParams: {} as Record<string, unknown>,
        dialog: null as Dialog | null,
        kept: null as { time: number; name: string; year: number; map: MapData } | null,
        region: null as Region | null,
        hasClip: false,
        tour: null as Tour | null,
        tourSeen: false,
        tourPlan: null as any,
        // the room 4 creator, while it is open
        room4: null as { host: Room4Host; open: boolean } | null,
        creator: null as CreatorApi | null
    });
    const ui = S.ui;

    // the rules of the map open (before one is, of the year chosen for new maps)
    function rules(): Ruleset {
        return map ? rulesOf(map) : rulesFor(ui.newYear) || rulesFor(LATEST_YEAR)!;
    }
    // whether a kind of victim is the ring target kind
    function isTarget(id: string) {
        return !!id && id === S.targetId;
    }
    // what the editor shows for a kind of victim
    function symbolOf(id: string) {
        const k = rules().tokens.kinds.find(function (k) { return k.id === id; });
        return k ? k.symbol : '';
    }
    // its colour (a victim's type; '' for none)
    function colorOf(id: string) {
        const k = rules().tokens.kinds.find(function (k) { return k.id === id; });
        return k && k.color ? k.color : '';
    }
    // the face it shows instead (a smiley victim), or ''
    function faceOf(id: string) {
        const k = rules().tokens.kinds.find(function (k) { return k.id === id; });
        return k && k.face ? k.face : '';
    }

    function pickVictim(v: StampChoice) { ui.victim = v.id!; ui.fake = !!v.fake; }
    function pickCt(letter: string) {
        ui.victim = S.targetId;
        if (ctLetter() !== letter) randomCode(letter);
    }
    function targetStyle(code: string) {
        return { background: Icons.targetBackground(code, Icons.TYPE[Icons.typeOf(code)]) };
    }

    function ctLetter() {
        return rules().tokens.target.typeOf(pickerRings().join('')) || 'X';
    }
    function setRing(i: number, c: string) { ui.rings[i] = c; }
    // the ring picked on the target takes the colour, and the next ring is picked
    function pickColor(c: string) {
        const sel = S.selected;
        if (sel && isTarget(sel.victim.type)) {
            const rings = sel.victim.code.split('');
            rings[ui.ring] = c;
            ui.ring = (ui.ring + 1) % 5;
            changeSelected({ code: rings.join('') });
            return;
        }
        ui.rings[ui.ring] = c;
        ui.ring = (ui.ring + 1) % 5;
    }
    // the rings the picker shows: those of the selected cognitive target, or of the next one
    function pickerRings(): string[] {
        const sel = S.selected;
        return sel && isTarget(sel.victim.type) ? sel.victim.code.split('') : ui.rings;
    }
    function ringColor(i: number) {
        const rings = pickerRings();
        const c = S.ringColors.find(function (r) { return r.id === rings[i]; });
        return c ? c.color : '#fff';
    }
    function ctSum() {
        return pickerRings().reduce(function (sum, id) {
            const c = S.ringColors.find(function (r) { return r.id === id; });
            return sum + (c ? c.value : 0);
        }, 0);
    }
    // the symbol shown on the rotation dial for the victim being placed
    function victimSymbol() {
        if (isTarget(ui.victim)) { const l = ctLetter(); return l === 'X' ? '×' : l; }
        return symbolOf(ui.victim);
    }
    function victimFace() {
        return isTarget(ui.victim) ? '' : faceOf(ui.victim);
    }
    function randomCode(type: string) { ui.rings = rules().tokens.target.randomCode(type).split(''); }

    // the victim being placed: type, fake, ring code and turn (random each time when asked)
    function victimOpts() {
        const rot = ui.randomRot ? Math.floor(Math.random() * 360) : (Number(ui.rot) || 0) % 360;
        return { code: ui.rings.join(''), rot: rot };
    }

    function sameVictim(cur: VictimInfo | null) {
        if (!cur || cur.type !== ui.victim) return false;
        return isTarget(ui.victim) ? cur.code === ui.rings.join('') : cur.fake === !!ui.fake;
    }

    let map: MapData = null as unknown as MapData, borders = new Set<string>(), past: string[] = [], future: string[] = [], before: string | null = null, dirty = false;
    let hover: any = null, stroke: any = null;
    let view: View.MapView = null as unknown as View.MapView;

    // ---- the page's parts, once they are there ----
    let canvas: HTMLCanvasElement, stageEl: HTMLElement;

    function mount(parts: { canvas: HTMLCanvasElement; stage: HTMLElement }) {
        canvas = parts.canvas;
        stageEl = parts.stage;
        view = View.create(canvas, {
            onView: function (v) { later(function () { S.zoom = v.zoom; }); },
            // the checks card floats at the top right of the map: fit the map beside it while it is open
            fitInset: function () {
                const card = document.querySelector('.sbx-checks');
                if (!card || ui.checksFolded) return 0;
                return card.getBoundingClientRect().width + 24;
            },
            overlay: drawOverlay,
            underlay: drawLinear,
            tool: {
                pans: function () { return ui.tool === 'hand'; },
                down: function (p, e) { apply(function () { toolDown(p, e); }); },
                move: function (p, dragging) { apply(function () { toolMove(p, dragging); }); },
                up: function (p) { apply(function () { toolUp(p); }); },
                cancel: function () { apply(cancelStroke); },
                leave: function () { apply(function () { hover = null; say(''); }); view.redraw(); }
            }
        });
        // for the end-to-end tests: where a point of the map is on the page
        (window as any).__sbxView = view;
        listen();
        askGuideOnce();
    }

    // folding the checks card gives the map its room (opening it leaves the map as it is: the card
    // floats over it; the next fit - the fit button, a new size of the window - keeps clear of it)
    watch(function () { return ui.checksFolded; }, function (now, was) { if (now !== was && now) later(function () { view.fitIfAuto(); }); });

    // to the language picked in the language button
    function switchLang(code: Lang) {
        S.lang = code;
        setLang(S.lang);
    }
    watch(function () { return i18n.global.locale.value; }, function () { S.lang = lang(); changed(); digest(); });

    // ---- the map, undo and redo --------------------------------------------------------------------

    function load(m: MapData, name: string) {
        map = markRaw(M.normalize(m));
        borders = M.borderEdges(map);
        past = [];
        future = [];
        dirty = false;
        S.map = map;
        S.fileName = name || '';
        view.setMap(map);
        changed(true);
        // fit again once the side panel is there
        later(function () { view.fit(); });
    }

    function begin() {
        before = JSON.stringify(map);
    }

    function commit() {
        if (before === null) return;
        if (before !== JSON.stringify(map)) {
            past.push(before);
            if (past.length > 100) past.shift();
            future = [];
            dirty = true;
            autosave();
        }
        before = null;
        changed();
    }

    function restore(json: string) {
        map = markRaw(JSON.parse(json));
        borders = M.borderEdges(map);
        S.map = map;
        view.setMap(map, true);
        dirty = true;
        changed();
    }

    function undo() {
        slideDone();
        if (!past.length) return;
        future.push(JSON.stringify(map));
        restore(past.pop()!);
        notify('undone', null, 'ok');
    }

    function redo() {
        slideDone();
        if (!future.length) return;
        past.push(JSON.stringify(map));
        restore(future.pop()!);
        notify('redone', null, 'ok');
    }

    // ---- linear / floating: which tiles a victim scores less on ----
    // As the world export works it out (W.recalculate, as the classic editor): from the start tile
    // along the walls joined to it; the walls reached and the tiles beside them are linear, and a
    // victim on a linear tile is worth less. Worked out on a copy of the map, when it is shown.
    let linear: { noStart?: boolean; tiles?: Record<string, string>; floating?: number[][]; unreached?: boolean } | null = null;
    function computeLinear() {
        linear = null;
        if (!ui.showLinear || !map) return;
        const st = map.startTile;
        if (!st || !(st.x > 0)) { linear = { noStart: true }; return; }
        const copy = JSON.parse(JSON.stringify(M.saved(map)));
        W.recalculate(copy);
        const tiles: Record<string, string> = {}, floating: number[][] = [];
        Object.keys(copy.cells).forEach(function (k) {
            const p = k.split(',').map(Number), c = copy.cells[k];
            if (p[2] !== 0) return;
            if (p[0] % 2 === 1 && p[1] % 2 === 1) {
                if (!M.inMap(map, p[0], p[1])) return;     // the calculation also makes tiles round the map
                // only where a victim can be: a tile with a wall on a side, or inside it
                // not reached from the start (a room without its passage): no linear / floating to tell
                if (!M.isOutside(map, p[0], p[1]) && hasAnyWall(p[0], p[1])) tiles[p[0] + ',' + p[1]] = !c.reachable ? 'U' : c.isLinear ? 'L' : 'F';
            } else if ((p[0] + p[1]) % 2 === 1 && c.isWall && !c.isLinear && p[0] <= 2 * map.width && p[1] <= 2 * map.length) {
                floating.push(p);
            }
        });
        linear = { tiles: tiles, floating: floating, unreached: Object.keys(tiles).some(function (k) { return tiles[k] === 'U'; }) };
    }

    function hasAnyWall(x: number, y: number) {
        const tl = M.tileOf(map, x, y);
        if (tl && ((tl.halfWallIn || []).some(Boolean) || (tl.curve || []).some(function (v) { return Number(v); }))) return true;
        return Object.keys(M.SIDES).some(function (d) {
            const e = map.cells[M.key(x + M.SIDES[d][0], y + M.SIDES[d][1])];
            return !!(e && (e.isWall || e.halfWall));
        });
    }

    // where the robot cannot get to (M.robotReach): its mask as a picture, shown hatched light red
    let pocketMask: { canvas: HTMLCanvasElement; w: number; h: number; hatched: HTMLCanvasElement | null } | null = null, lostVictims: number[][] = [];
    // where the robot gets to, as worked out after the last change (for the victim tool's preview)
    let robot: ReturnType<typeof M.robotReach> = null;
    function computePockets() {
        const r = robot = map ? M.robotReach(map, room4Picture()) : null;
        lostVictims = r ? r.victims : [];
        pocketMask = null;
        if (!r || !r.pocketCount) return;
        const c = document.createElement('canvas');
        c.width = r.gw;
        c.height = r.gh;
        const g = c.getContext('2d')!, img = g.createImageData(r.gw, r.gh);
        for (let n = 0; n < r.gw * r.gh; n++) if (r.miss[n]) img.data[4 * n + 3] = 255;
        g.putImageData(img, 0, 0);
        pocketMask = { canvas: c, w: r.gw * r.res, h: r.gh * r.res, hatched: null };
    }

    function drawPockets(ctx: CanvasRenderingContext2D, v: { scale: number }) {
        if (!pocketMask) return;
        // the hatched picture is made at the size shown, and again when the zoom changes
        const scale = Math.min(4, v.scale);
        const pw = Math.ceil(pocketMask.w * scale), ph = Math.ceil(pocketMask.h * scale);
        let hc = pocketMask.hatched;
        if (!hc || hc.width !== pw || hc.height !== ph) {
            hc = document.createElement('canvas');
            hc.width = pw;
            hc.height = ph;
            const g = hc.getContext('2d')!;
            g.fillStyle = 'rgba(254, 202, 202, 0.55)';
            g.fillRect(0, 0, pw, ph);
            g.strokeStyle = 'rgba(220, 38, 38, 0.45)';
            g.lineWidth = 0.35 * scale;
            g.beginPath();
            for (let o = -ph; o < pw; o += 1.5 * scale) { g.moveTo(o, ph); g.lineTo(o + ph, 0); }
            g.stroke();
            g.globalCompositeOperation = 'destination-in';
            g.imageSmoothingEnabled = true;
            g.drawImage(pocketMask.canvas, 0, 0, pw, ph);
            pocketMask.hatched = hc;
        }
        ctx.drawImage(hc, 0, 0, pocketMask.w, pocketMask.h);
    }

    // victims where they may not be (the checks' victim problems: no wall, in a passage, overlapping,
    // out of the robot's reach): a red dashed ring round each
    const VICTIM_PROBLEMS = ['victimNoWall', 'victimInPassage', 'victimMisplaced', 'victimUnreachable'];
    let badVictims: number[][] = [];
    function drawBadVictims(ctx: CanvasRenderingContext2D, px: number) {
        if (!badVictims.length) return;
        ctx.save();
        ctx.strokeStyle = '#dc2626';
        ctx.lineWidth = 2 * px;
        ctx.setLineDash([4 * px, 3 * px]);
        badVictims.forEach(function (p) {
            ctx.beginPath();
            ctx.arc(p[0], p[1], 2.4, 0, 2 * Math.PI);
            ctx.stroke();
        });
        ctx.restore();
    }

    function drawLinear(ctx: CanvasRenderingContext2D, v: { scale: number }) {
        if (linear && !linear.noStart) drawLinearTiles(ctx);
        drawPockets(ctx, v);
    }

    function drawLinearTiles(ctx: CanvasRenderingContext2D) {
        const tiles = linear!.tiles!;
        Object.keys(tiles).forEach(function (k) {
            const p = k.split(',').map(Number);
            // its own colours, nearly opaque: a light tint over the room colours would turn grey
            ctx.fillStyle = ({ L: 'rgba(187, 247, 208, 0.92)', F: 'rgba(254, 215, 170, 0.95)', U: 'rgba(203, 213, 225, 0.9)' } as Record<string, string>)[tiles[k]];
            ctx.fillRect(6 * (p[0] - 1), 6 * (p[1] - 1), 12, 12);
        });
    }

    // floating walls over the walls, in amber
    function drawFloatingWalls(ctx: CanvasRenderingContext2D) {
        if (!linear || !linear.floating) return;
        ctx.save();
        ctx.strokeStyle = '#d97706';
        ctx.lineWidth = 1.1;
        ctx.lineCap = 'square';
        ctx.beginPath();
        linear.floating.forEach(function (p) {
            if (p[0] % 2 === 0) { ctx.moveTo(6 * p[0], 6 * (p[1] - 1)); ctx.lineTo(6 * p[0], 6 * (p[1] + 1)); }
            else { ctx.moveTo(6 * (p[0] - 1), 6 * p[1]); ctx.lineTo(6 * (p[0] + 1), 6 * p[1]); }
        });
        ctx.stroke();
        ctx.restore();
    }

    function toggleLinear() {
        ui.showLinear = !ui.showLinear;
        computeLinear();
        view.redraw();
    }
    function linearNoStart() { return !!(linear && linear.noStart); }
    function linearUnreached() { return !!(linear && linear.unreached); }

    // opened: a map just opened, whose checks card starts closed when there is nothing to show
    function changed(opened?: boolean) {
        followRules();
        computeLinear();
        computePockets();
        // the problems are worked out again: one pointed out may be gone (its item with it)
        pointed = null;
        if (S.selected && !M.victimAt(map, S.selected.where)) S.selected = null;
        S.canUndo = past.length > 0;
        S.canRedo = future.length > 0;
        const had = S.problems.length;
        const picture = room4Picture();
        const problems = map ? M.problems(map, picture) : [];
        S.problems = problems.map(problemText);
        badVictims = [];
        problems.forEach(function (p) {
            if (VICTIM_PROBLEMS.indexOf(p.key) > -1 && p.show && p.show.points) badVictims = badVictims.concat(p.show.points);
        });
        S.blocking = S.problems.some(function (p) { return p.block; });
        // the most the map can score
        S.score = map ? rulesOf(map).scoring.maxScore(map, picture) : null;
        // the checks card folds by itself when the last problem goes, and opens again when one comes
        if (opened) ui.checksFolded = !S.problems.length;
        else if (had && !S.problems.length) ui.checksFolded = true;
        else if (!had && S.problems.length) ui.checksFolded = false;
        if (view) view.redraw();
    }

    // The map's year: its victims in the panel, its rule numbers and texts (i18n) - again only when a
    // map of another year is open
    function followRules() {
        const r = rules();
        setRuleTexts(r.year, r.refs);
        S.ruleYear = r.year;
        if (r.year === panelYear) return;
        panelYear = r.year;
        Object.assign(S, victimPanel(r));
        S.floorChoices = floorPanel(r);
        if (!S.floorChoices.some(function (f) { return f.id === ui.floor; })) ui.floor = S.floorChoices[0].id;
        if (!r.tokens.kinds.some(function (k) { return k.id === ui.victim; })) { ui.victim = r.tokens.kinds[0].id; ui.fake = false; }
    }
    // before a map is open: the latest year's
    setRuleTexts(LATEST_YEAR, rulesFor(LATEST_YEAR)!.refs);
    // on the start screen the texts and panels follow the year chosen for new maps
    watch(function () { return ui.newYear; }, function () { if (!map) followRules(); });

    // A custom room 4 picture read for the checks and the score (its walls and its stamps): read once
    // per picture; it loads first, and the map is looked at again then
    let room4Read: { picture: string; data: M.Room4Picture | null } | null = null;
    function room4Picture(): M.Room4Picture | null {
        const picture = map && map.area4Room && map.area4Room.type === 1 ? map.room4CanvasSave || '' : '';
        if (!picture) return null;
        if (!room4Read || room4Read.picture !== picture) readPicture(picture);
        return room4Read!.data;
    }
    function readPicture(picture: string) {
        room4Read = { picture: picture, data: null };
        const img = new Image();
        img.onload = function () {
            if (!room4Read || room4Read.picture !== picture) return;
            const c = document.createElement('canvas');
            c.width = img.naturalWidth;
            c.height = img.naturalHeight;
            const g = c.getContext('2d')!;
            g.drawImage(img, 0, 0);
            room4Read.data = M.readRoom4Picture(g.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
            apply(function () { changed(); });
        };
        img.src = picture;
    }

    function problemText(p: Problem): ProblemItem {
        let text;
        if (p.key.indexOf('conn.') === 0) {
            const params = Object.assign({}, p.params);
            if (params.name) params.name = t(params.name);
            text = t('admin.simMapEditor.connCheck.' + p.key.slice(5), params);
        } else {
            text = t('admin.simBeta.problems.' + p.key, p.params);
        }
        return { text: text, block: !!p.block, at: p.at || null, show: p.show || null, raw: p,
            fix: M.FIXABLE.indexOf(p.key) > -1 ? 'fix' : M.DRAW_FIX.indexOf(p.key) > -1 ? 'draw' : '' };
    }

    // ---- the editor's own dialogs (in place of alert / confirm) ----
    // openDialog({ kind: 'error' | 'warn' | 'info', title, message, items: [problems], actions:
    // [{ label, value, style: 'primary' | 'danger' | '' , icon }] }) -> a promise of the value chosen
    // (null when closed)
    function openDialog(d: Partial<Dialog> & { kind: Dialog['kind']; title: string }): Promise<unknown> {
        return new Promise(function (resolve) {
            S.dialog = Object.assign({ actions: [{ label: t('admin.simBeta.close'), value: null, style: 'primary' }] }, d, { done: resolve }) as Dialog;
        });
    }
    function closeDialog(value?: unknown) {
        const d = S.dialog;
        S.dialog = null;
        if (d) d.done(value === undefined ? null : value);
    }
    function dialogItem(p: ProblemItem) {
        closeDialog(null);
        showProblem(p);
    }

    // unsaved changes: go on only when they may be dropped
    function whenDiscarded(go: () => void) {
        if (!dirty) { go(); return; }
        openDialog({
            kind: 'warn', title: t('admin.simBeta.discardTitle'), message: t('admin.simBeta.discard'),
            actions: [
                { label: t('admin.simBeta.cancel'), value: false, style: '' },
                { label: t('admin.simBeta.saveFirst'), value: 'save', style: '', icon: 'fa-save' },
                { label: t('admin.simBeta.discardGo'), value: true, style: 'danger', icon: 'fa-trash-alt' }
            ]
        }).then(function (v) {
            if (v === 'save') { saveJson(); go(); }
            else if (v === true) go();
            digest();
        });
    }

    function newMap() {
        whenDiscarded(function () {
            load(M.newMap(8, 6, ui.newYear), '');
            // a new map starts with its size: the outline tool, whose panel holds it
            setTool('shape');
            ui.shapeMode = 'outline';
            ui.freshMap = true;     // its size box stands out until another tool is taken
            notify('newMapSize', null, 'info', 10000);
        });
    }

    function open(text: string, fileName: string) {
        let data;
        try {
            data = JSON.parse(text);
            if (!data || typeof data.cells !== 'object' || !(data.width > 0) || !(data.length > 0)) throw new Error('format');
        } catch (e) {
            S.error = 'admin.simBeta.badFile';
            return;
        }
        // a map of a year this editor does not take (made by a newer one)
        if (data.rules && !rulesFor(Number(data.rules))) {
            S.error = 'admin.simBeta.unknownRules';
            S.errorParams = { year: data.rules, years: years().join(', ') };
            return;
        }
        S.error = '';
        S.errorParams = {};
        // a map opens in the rules of its own year, whatever year was chosen: said when it is another,
        // with the way to switch it (the rules menu)
        const chosen = rules().year;
        load(data, fileName);
        const year = rulesOf(map).year;
        if (year !== chosen) notify('openedOtherYear', { year: year, chosen: chosen }, 'info', 9000);
    }

    function download(data: string, type: string, name: string) {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(new Blob([data], { type: type }));
        link.download = name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // Saved as the classic editor saves (with its reachable / linear flags worked out)
    function saveJson() {
        if (!map) return;
        const data = JSON.parse(JSON.stringify(M.saved(map)));
        if (data.startTile && data.startTile.x > 0) W.recalculate(data);
        download(JSON.stringify(data), 'application/json', (map.name || 'world') + '.json');
        dirty = false;
    }

    function exportWorld() {
        if (!map) return;
        const blocking = S.problems.filter(function (p) { return p.block; });
        if (blocking.length) {
            const fixable = blocking.some(function (p) { return p.fix === 'fix'; });
            const actions: DialogAction[] = [{ label: t('admin.simBeta.close'), value: null, style: '' }];
            if (fixable) actions.push({ label: t('admin.simBeta.fixAll'), value: 'fix', style: 'primary', icon: 'fa-magic' });
            openDialog({
                kind: 'error', title: t('admin.simBeta.exportBlocked'),
                message: t('admin.simBeta.exportBlockedLead', { count: blocking.length }),
                items: blocking, actions: actions
            }).then(function (v) {
                if (v === 'fix') {
                    fixAll();
                    const left = S.problems.filter(function (p) { return p.block; }).length;
                    if (!left) exportWorld();
                }
                digest();
            });
            return;
        }
        const failed = function (err: any) {
            applyAsync(function () {
                // a value that is not a number: what it is on, and that the file was not made
                const message = err instanceof M.BrokenWorld ? t('admin.simBeta.exportBroken', { line: err.line }) : String(err && err.message || err);
                openDialog({ kind: 'error', title: t('admin.simBeta.exportFailed'), message: message });
            });
        };
        if (map.area4Room && map.area4Room.type === 1) {
            customWorld().then(function (text) { download(text, 'text/plain', (map.name || 'world') + '.wbt'); }, failed);
            return;
        }
        let text;
        try { text = M.world(map); } catch (e) { failed(e); return; }
        download(text, 'text/plain', (map.name || 'world') + '.wbt');
    }

    // The world with a custom room 4: its picture is read with OpenCV, once both are loaded
    function customWorld(): Promise<string> {
        return new Promise(function (resolve, reject) {
            OpenCV.ready.then(go, reject);
            function go() {
                const img = new Image();
                img.onload = function () {
                    try {
                        resolve(M.world(map, function (m) {
                            m.room4Img = img;
                            const size = room4CanvasSize();
                            m.canvasWidth = size.w;
                            m.canvasHeight = size.h;
                            return rulesOf(map).export.room4(m);
                        }));
                    } catch (e) { reject(e); }
                };
                img.onerror = function () { reject(new Error('picture')); };
                img.src = map.room4CanvasSave!;
            }
        });
    }

    // ---- custom room 4: the creator, on this map ---------------------------------------------------

    // Picture size as in the classic editor: 1600 px on the longer side of the room 4 area
    function room4CanvasSize() {
        const r = W.room4Region(map)!;
        const w = r.maxX - r.minX + 1, h = r.maxY - r.minY + 1;
        const block = Math.floor(1600 / Math.max(w, h));
        return { w: block * w, h: block * h };
    }

    let room4Open = false;          // the creator is open (a second double-click does not open another)
    let room4Done: (() => void) | null = null;
    function openRoom4() {
        if (room4Open) return;
        if (!map || !map.roomTiles[2].length) { notify('room4NoTiles', null, 'warn'); return; }
        if (!map.area4Room || map.area4Room.type !== 1) {
            begin();
            map.area4Room = W.area4Presets()[1];
            borders = M.syncBorderWalls(map, borders);
            commit();
        }
        const size = room4CanvasSize();
        const floors: Record<string, string> = {};
        map.roomTiles[2].forEach(function (k) {
            const p = k.split(',').map(Number), kind = M.floorKind(map, p[0], p[1]);
            if (kind) floors[p[0] + ',' + p[1]] = kind;
        });
        // the creator leaves its picture and the floors in its host
        const host: Room4Host = {
            roomTiles: map.roomTiles,
            canvasWidth: size.w,
            canvasHeight: size.h,
            room4MapGeometry: function () { return W.mapGeometry(map); },
            room4Img: new Image(),
            room4CanvasSave: map.room4CanvasSave || null,
            room4Tokens: JSON.parse(JSON.stringify(map.room4Tokens || [])),
            room4StampTypes: rulesOf(map).tokens.stamps,
            room4Target: rulesOf(map).tokens.target,
            room4FloorKinds: rulesOf(map).floors,
            room4Checkpoints: rulesOf(map).passages.room4Checkpoints,
            room4FloorFits: function (x, y, kind) { return M.floorFits(map, x, y, kind); },
            room4Floors: floors
        };
        room4Done = function () {
            const picture = (host.room4CanvasSave || null) !== (map.room4CanvasSave || null);
            const kept = JSON.stringify(host.room4Tokens || []) !== JSON.stringify(map.room4Tokens || []);
            const floored = map.roomTiles[2].some(function (k) {
                const p = k.split(',').map(Number);
                return M.floorKind(map, p[0], p[1]) !== (host.room4Floors[p[0] + ',' + p[1]] || '');
            });
            if (picture || kept || floored) {
                begin();
                map.room4CanvasSave = host.room4CanvasSave;
                map.room4Tokens = host.room4Tokens || [];
                map.roomTiles[2].forEach(function (k) {
                    const p = k.split(',').map(Number);
                    M.setFloorKind(map, p[0], p[1], host.room4Floors[p[0] + ',' + p[1]] || '');
                });
                commit();
                view.setMap(map, true);
            }
            room4Open = false;
        };
        room4Open = true;
        S.room4 = { host: markRaw(host), open: true };
    }
    // the creator closed (OK, Esc, or by the guide): its picture taken into the map
    function closeRoom4() {
        if (!S.room4 || !S.room4.open) return;
        S.room4.open = false;
        const done = room4Done;
        room4Done = null;
        if (done) done();
        digest();
    }
    // the creator gone from the page (after its closing animation)
    function room4Gone() {
        S.room4 = null;
    }

    // ---- problems: click to see where ---------------------------------------------------------------

    function showProblem(p: ProblemItem) {
        if (p.at) view.showCm(p.at[0], p.at[1]);
    }

    // Fixing: one problem, or all that can be fixed (one undo step); a custom room 4 picture is drawn
    // in the room 4 creator
    function fixProblem(p: ProblemItem, e?: Event) {
        if (e) e.stopPropagation();
        if (p.fix === 'draw') { openRoom4(); return; }
        begin();
        const after = M.fixProblem(map, p.raw, borders);
        if (after) borders = after;
        pointed = null;
        commit();
        if (problemsLeft(p.raw.key)) notify('fixPartly', null, 'warn'); else notify('fixed', null, 'ok');
    }
    function fixAll() {
        begin();
        borders = M.fixAll(map, borders, room4Picture());
        pointed = null;
        commit();
        notify(S.problems.length ? 'fixAllLeft' : 'fixed', { count: S.problems.length }, S.problems.length ? 'warn' : 'ok');
    }
    function canFixAll() {
        return S.problems.some(function (p) { return p.fix === 'fix'; });
    }
    function problemsLeft(key: string) {
        return S.problems.some(function (p) { return p.raw.key === key; });
    }

    // The problem under the pointer in the checks card: what it is about is pointed out on the map
    let pointed: Show | null = null;
    function pointProblem(p: ProblemItem | null) {
        pointed = p && p.show ? p.show : null;
        view.redraw();
    }

    // ---- the work kept in this browser, in case the page is closed without saving -------------------

    const AUTOSAVE = 'simBeta2026.autosave';
    let autosaveTimer: number | null = null;
    function autosave() {
        if (autosaveTimer) clearTimeout(autosaveTimer);
        autosaveTimer = window.setTimeout(function () {
            try { localStorage.setItem(AUTOSAVE, JSON.stringify({ time: Date.now(), map: M.saved(map) })); } catch (e) { /* storage full or off */ }
        }, 800);
    }
    try {
        const kept = JSON.parse(localStorage.getItem(AUTOSAVE) || 'null');
        if (kept && kept.map && kept.map.cells) S.kept = { time: kept.time, name: kept.map.name, year: Number(kept.map.rules) || FIRST_YEAR, map: markRaw(kept.map) };
    } catch (e) { S.kept = null; }

    // The work kept is opened in the rules of its year only when that year is the one chosen: a map
    // goes to another year's rules by the rules menu, asked (changeRules), not by opening it
    function keptOtherYear() {
        return !!S.kept && S.kept.year !== ui.newYear;
    }
    function restoreKept() {
        if (!S.kept || keptOtherYear()) return;
        load(JSON.parse(JSON.stringify(S.kept.map)), '');
        dirty = true;
    }

    // ---- map settings ------------------------------------------------------------------------------

    // The size typed in the size panel: the input put back as it is when it is not a size
    function setSize(input: HTMLInputElement, axis: string) {
        if (!map) return;
        const now = axis === 'x' ? map.width : map.length;
        const n = Math.max(1, Math.min(40, Math.round(Number(input.value))));
        if (!isFinite(n) || n === now) { input.value = String(now); return; }
        if (axis === 'x') resize(n - map.width, 0); else resize(0, n - map.length);
        input.value = String(n);
    }

    function resize(dw: number, dl: number) {
        if (!map) return;
        begin();
        M.resize(map, map.width + dw, map.length + dl);
        borders = M.syncBorderWalls(map, borders);
        commit();
        view.fitIfAuto();
    }

    // A preset room 4 from a classic map: this editor makes room 4 as a picture only
    function toCustomRoom4() {
        begin();
        map.area4Room = W.area4Presets()[(map.roomTiles[2] || []).length ? 1 : 0];
        borders = M.syncBorderWalls(map, borders);
        commit();
    }

    function room4State() {
        if (!map) return '';
        const type = map.area4Room && map.area4Room.type;
        if (type >= 2) return 'preset';
        if (!(map.roomTiles[2] || []).length) return 'none';
        return map.room4CanvasSave ? 'drawn' : 'empty';
    }

    function renamed() {
        dirty = true;
    }

    function zoomIn() { view.zoom(1); }
    function zoomOut() { view.zoom(-1); }
    function fit() { view.fit(); }

    function setTool(id: string) {
        cancelStroke();
        if (id !== ui.tool) { S.selected = null; ui.freshMap = false; }
        ui.tool = id;
        hover = null;
        S.hint = '';
        view.redraw();
    }

    // ---- tools -------------------------------------------------------------------------------------

    type P = { x: number; y: number };

    function tileAt(p: P) {
        const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
        if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.length) return null;
        return { x: 2 * tx + 1, y: 2 * ty + 1 };
    }

    // The side of the tile under p that p is nearest to, and the edge cell there
    function sideAt(p: P) {
        const tl = tileAt(p);
        if (!tl) return null;
        const cx = 6 * tl.x, cy = 6 * tl.y, dx = p.x - cx, dy = p.y - cy;
        const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'bottom' : 'top');
        const d = M.SIDES[dir];
        return { tile: tl, dir: dir, ex: tl.x + d[0], ey: tl.y + d[1] };
    }

    // Whether p is near the side of its tile that s names (within 4 cm of it)
    function nearEdge(p: P, s: { dir: string; ex: number; ey: number }) {
        const d = M.SIDES[s.dir];
        const ex = 6 * s.ex, ey = 6 * s.ey;
        return d[0] ? Math.abs(p.x - ex) < 4 : Math.abs(p.y - ey) < 4;
    }

    // Walls of rooms 2 and 3 sit on the 6 cm grid, the rest on tile edges
    function stepAt(p: P) {
        const tl = tileAt(p);
        const room = tl ? M.roomOf(map, tl.x, tl.y) : 1;
        return room === 2 || room === 3 ? 1 : 2;
    }

    function reach() {
        return Math.max(1.5, 8 / view.scale());
    }

    function hintText(key: string, params?: Record<string, unknown> | null) {
        return Keys.text(t('admin.simBeta.hints.' + key, params || undefined));
    }

    // The status line: what the tool would do where the pointer is (say), over the tool's own
    // how-to; and what has just happened (notify: kind 'ok', 'warn' or 'info'), kept for a few
    // seconds over both, so the pointer moving on does not wipe it at once
    function say(key: string, params?: Record<string, unknown>) {
        S.hint = key ? hintText(key, params) : '';
    }

    let noticeTimer: number | null = null;
    function notify(key: string, params: Record<string, unknown> | null, kind?: string, ms?: number) {
        cancel(noticeTimer);
        S.notice = { text: hintText(key, params), kind: kind || 'info' };
        noticeTimer = later(function () { S.notice = null; }, ms || 4000);
    }

    // The name of the victim the victim tool places (as in its panel)
    function victimName() {
        let x: StampChoice | null = null;
        if (isTarget(ui.victim)) {
            const l = ctLetter();
            x = S.ctStamps.find(function (c) { return c.letter === l; }) || null;
        } else {
            S.victimRows.forEach(function (row) {
                row.types.forEach(function (v) { if (v.id === ui.victim && v.fake === !!ui.fake) x = v; });
            });
        }
        return x ? t((x as StampChoice).name) : '';
    }

    // What the tool does, while the pointer is on nothing it would change
    function toolHint() {
        if (!map) return '';
        const tool = ui.tool;
        let key = tool, params: Record<string, unknown> | undefined;
        if (tool === 'shape') key = 'shape_' + ui.shapeMode;
        else if (tool === 'select' && S.region) { key = 'select_region'; params = { size: regionSize() }; }
        else if (tool === 'victim' && S.selected) key = 'victim_selected';
        else if (tool === 'victim') params = { name: victimName() };
        else if (tool === 'room') params = { room: ui.room };
        else if (tool === 'floor') params = { floor: t('admin.simBeta.floors.' + ui.floor) };
        return Keys.text(t('admin.simBeta.toolHints.' + key, params));
    }

    function toolDown(p: P, e: PointerEvent) {
        const tool = ui.tool;
        slideDone();
        begin();
        if (tool === 'select') { regionDown(p, e); view.redraw(); return; }
        if (tool === 'line') {
            const step = stepAt(p);
            stroke = { step: step, from: L.snap(p.x, p.y, step, map.width, map.length), straight: !!(e && e.shiftKey) };
            stroke.to = stroke.from;
            stroke.corners = [stroke.from];
            planStroke();
        } else if (tool === 'room') {
            stroke = {};
            paintRoom(p);
        } else if (tool === 'shape' && ui.shapeMode === 'outline') {
            const tl = tileAt(p);
            stroke = { out: !!tl && !M.isOutside(map, tl.x, tl.y) };
            paintShape(p);
        } else if (tool === 'eraser') {
            // a drag keeps to what it started on: walls and victims, or the floors of tiles
            stroke = { floors: !thingNear(p) };
            erase(p, stroke.floors, true);
        } else if (tool === 'victim') {
            // on a placed one: dragged, it goes along its wall
            const hit = victimUnder(p);
            stroke = hit ? { grab: hit, down: p } : {};
        } else {
            stroke = {};
        }
        view.redraw();
    }

    function toolMove(p: P, dragging: boolean) {
        const tool = ui.tool;
        if (dragging && stroke) {
            if (tool === 'line') {
                stroke.to = L.snap(p.x, p.y, stroke.step, map.width, map.length);
                planStroke();
            } else if (tool === 'room') paintRoom(p);
            else if (tool === 'select') regionMove(p);
            else if (tool === 'shape' && ui.shapeMode === 'outline') paintShape(p);
            else if (tool === 'eraser') erase(p, stroke.floors, false);
            else if (tool === 'victim') dragVictim(p);
        }
        hover = hoverAt(p);
        view.redraw();
    }

    function toolUp(p: P) {
        const tool = ui.tool;
        if (!stroke) return;
        if (tool === 'line' && stroke.plan) {
            const n = M.setWalls(map, stroke.plan.ok, true);
            if (stroke.plan.bad.length) notify('someRefused', { count: stroke.plan.bad.length }, 'warn');
            else if (n) notify('wallsDrawn', { cm: 6 * n }, 'ok');
        } else if (tool === 'passage') {
            const s = sideAt(p);
            const near = s && nearEdge(p, s);
            if (s && near && M.borderAt(map, s.ex, s.ey)) {
                const b = M.borderAt(map, s.ex, s.ey)!;
                const at = M.passageSide(map, b, [s.tile.x, s.tile.y]);
                const r = M.togglePassage(map, s.ex, s.ey, [s.tile.x, s.tile.y]);
                borders = M.syncBorderWalls(map, borders);
                if (at[0] !== s.tile.x || at[1] !== s.tile.y) notify('passageRoom4', null, 'info', 7000);
                else notify('passage_' + r, null, 'ok');
            } else if (s && M.clearPassage(map, s.tile.x, s.tile.y)) {
                borders = M.syncBorderWalls(map, borders);
                notify('passage_closed', null, 'ok');
            } else notify('noBorder', null, 'warn');
        } else if (tool === 'floor') {
            const tl = tileAt(p);
            if (tl && !M.setFloor(map, tl.x, tl.y, ui.floor) && !M.floorFits(map, tl.x, tl.y, ui.floor)) {
                notify('floor_notOuter', { floor: t('admin.simBeta.floors.' + ui.floor) }, 'warn');
            }
        } else if (tool === 'victim' && stroke.victim) {
            dropVictim();
        } else if (tool === 'victim') {
            placeVictim(p);
        } else if (tool === 'select') {
            regionUp();
        } else if (tool === 'shape' && ui.shapeMode !== 'outline') {
            const op = lineAt(p);
            if (op) lineOp(op);
        } else if (tool === 'curve') {
            const c = M.arcChoice(map, p.x, p.y);
            if (c && !c.rule.ok) notify('curve_' + c.rule.reason, null, 'warn');
            else if (c) {
                const cur = Number(M.tileOf(map, c.x, c.y)!.curve![c.q]);
                M.setCurve(map, c.x, c.y, c.q, cur === c.v ? 0 : c.v);
            }
        }
        stroke = null;
        commit();
        hover = hoverAt(p);
        view.redraw();
    }

    function cancelStroke() {
        if (!stroke) return;
        stroke = null;
        if (before !== null) { const json = before; before = null; if (json !== JSON.stringify(map)) restore(json); }
        view.redraw();
    }

    // A line follows the pointer round corners: the run from the last corner keeps its direction
    // (across or down) and goes as far as the pointer; when the pointer leaves the run's line by a grid
    // step, the run's end becomes a corner and the next run goes the other way. Going back along the
    // run before takes its corner away again. With Shift (at the start) it stays one straight line.
    function planStroke() {
        const cs = stroke.corners, to = stroke.to;
        const along = function (c: number[], d: string): [number, number] { return d === 'h' ? [to[0], c[1]] : [c[0], to[1]]; };
        if (stroke.straight) stroke.dir = null;
        else {
            for (let guard = 0; guard < 64; guard++) {
                const c = cs[cs.length - 1];
                // back onto the line of the run before: its corner goes
                if (cs.length >= 2) {
                    const pa = cs[cs.length - 2], prev = pa[1] === c[1] ? 'h' : 'v';
                    if (prev === 'h' ? to[1] === c[1] : to[0] === c[0]) { cs.pop(); stroke.dir = prev; continue; }
                }
                const dx = Math.abs(to[0] - c[0]), dy = Math.abs(to[1] - c[1]);
                if (!stroke.dir || (cs.length === 1 && (stroke.dir === 'h' ? dx : dy) === 0)) stroke.dir = dx === 0 && dy === 0 ? null : dx >= dy ? 'h' : 'v';
                if (!stroke.dir) break;
                const end = along(c, stroke.dir);
                const len = stroke.dir === 'h' ? dx : dy, off = stroke.dir === 'h' ? dy : dx;
                if (len > 0 && off >= stroke.step) { cs.push(end); stroke.dir = stroke.dir === 'h' ? 'v' : 'h'; continue; }
                break;
            }
        }
        const lastRun = function (c: [number, number]) { return stroke.dir ? L.axisLine(c, along(c, stroke.dir)) : L.axisLine(c, to); };
        const segs: string[] = [], seen: Record<string, boolean> = {};
        const add = function (list: string[]) { list.forEach(function (k) { if (!seen[k]) { seen[k] = true; segs.push(k); } }); };
        for (let i = 1; i < cs.length; i++) add(L.axisLine(cs[i - 1], cs[i]).segs);
        const last = lastRun(cs[cs.length - 1]);
        add(last.segs);
        stroke.plan = M.wallPlan(map, segs);
        stroke.end = last.end;
        strokeSay();
    }

    function strokeSay() {
        if (stroke.plan.bad.length) say('refusedHere');
        else say(stroke.straight ? 'lineDrawingStraight' : 'lineDrawing', { cm: 6 * stroke.plan.ok.length });
    }

    // The row / column the shape tool would add or take out at p: { axis, insert, index } (index: the
    // edge line after which a line is added, or the tile line taken out)
    type LineOp = { axis: string; insert: boolean; index: number };
    function lineAt(p: P): LineOp | null {
        const mode = ui.shapeMode;
        const axis = mode === 'addRow' || mode === 'delRow' ? 'y' : 'x';
        const v = axis === 'y' ? p.y : p.x, size = axis === 'y' ? map.length : map.width;
        if (mode === 'addRow' || mode === 'addCol') {
            const g = Math.max(0, Math.min(size, Math.round(v / TILE)));
            return { axis: axis, insert: true, index: 2 * g };
        }
        const tl = Math.floor(v / TILE);
        if (tl < 0 || tl >= size || size <= 1) return null;
        return { axis: axis, insert: false, index: 2 * tl + 1 };
    }

    // The custom room 4 picture covers the room 4 box: a line added inside the box adds a blank strip
    // to it, one taken out cuts its strip out (as in the classic editor); the stamps' kept turns /
    // rings move with it. Resolves to { picture, tokens } or null.
    function room4PictureFor(op: LineOp): Promise<{ picture: string; tokens: Room4Token[] } | null> {
        const pic = map.room4CanvasSave;
        const r = W.room4Region(map);
        if (!pic || !r) return Promise.resolve(null);
        const tile = op.insert ? op.index / 2 : (op.index - 1) / 2;
        const lo = op.axis === 'x' ? r.minX : r.minY, hi = op.axis === 'x' ? r.maxX : r.maxY;
        if (op.insert ? !(tile > lo && tile <= hi) : !(tile >= lo && tile <= hi)) return Promise.resolve(null);
        const tiles = hi - lo + 1;
        return new Promise(function (resolve) {
            const img = new Image();
            img.onload = function () {
                const along = op.axis === 'x' ? img.width : img.height;
                const cut = function (n: number) { return Math.round(n * along / tiles); };
                const at = cut(tile - lo), strip = op.insert ? cut(1) : cut(tile - lo + 1) - at;
                const c = document.createElement('canvas');
                c.width = op.axis === 'x' ? img.width + (op.insert ? strip : -strip) : img.width;
                c.height = op.axis === 'y' ? img.height + (op.insert ? strip : -strip) : img.height;
                const g = c.getContext('2d')!;
                g.imageSmoothingEnabled = false;
                g.fillStyle = '#FFFFFF';
                g.fillRect(0, 0, c.width, c.height);
                const end = op.insert ? at : at + strip;
                if (op.axis === 'x') {
                    g.drawImage(img, 0, 0, at, img.height, 0, 0, at, img.height);
                    g.drawImage(img, end, 0, img.width - end, img.height, op.insert ? at + strip : at, 0, img.width - end, img.height);
                } else {
                    g.drawImage(img, 0, 0, img.width, at, 0, 0, img.width, at);
                    g.drawImage(img, 0, end, img.width, img.height - end, 0, op.insert ? at + strip : at, img.width, img.height - end);
                }
                const tokens = (map.room4Tokens || []).map(function (k) {
                    const v = (op.axis === 'x' ? k.fx * img.width : k.fy * img.height);
                    let nv = v;
                    if (op.insert) { if (v >= at) nv = v + strip; }
                    else if (v >= at && v < end) return null;
                    else if (v >= end) nv = v - strip;
                    const n = Object.assign({}, k);
                    if (op.axis === 'x') n.fx = +(nv / c.width).toFixed(5); else n.fy = +(nv / c.height).toFixed(5);
                    if (op.axis === 'x') n.fy = k.fy; else n.fx = k.fx;
                    return n;
                }).filter(Boolean) as Room4Token[];
                resolve({ picture: c.toDataURL('image/png'), tokens: tokens });
            };
            img.onerror = function () { resolve(null); };
            img.src = pic;
        });
    }

    function lineOp(op: LineOp) {
        room4PictureFor(op).then(function (pic) {
            apply(function () {
                begin();
                const done = op.insert ? M.insertLine(map, op.axis, op.index) : M.removeLine(map, op.axis, op.index);
                if (!done) { before = null; notify('lineLimit', null, 'warn'); return; }
                if (pic) { map.room4CanvasSave = pic.picture; map.room4Tokens = pic.tokens; }
                borders = M.resyncBorderWalls(map, borders);
                S.region = null;
                commit();
                notify('lineDone_' + ui.shapeMode, null, 'ok');
                view.setMap(map, true);
                view.fitIfAuto();
            });
        });
    }

    function paintShape(p: P) {
        const tl = tileAt(p);
        if (!tl || !M.setRoom(map, tl.x, tl.y, stroke.out ? 0 : 1)) return;
        borders = M.syncBorderWalls(map, borders);
    }

    function paintRoom(p: P) {
        const tl = tileAt(p);
        if (!tl || !M.setRoom(map, tl.x, tl.y, ui.room)) return;
        borders = M.syncBorderWalls(map, borders);
    }

    // The placed victim whose badge is under p (the nearest), wherever along its wall it is
    function victimUnder(p: P): Where | null {
        let best: Where | null = null, bestD = Infinity;
        M.allVictims(map).forEach(function (w) {
            const at = M.victimPlace(map, w).at, d = Math.hypot(p.x - at[0], p.y - at[1]);
            if (d < (w.kind === 'edge' ? 2.5 : 1.8) && d < bestD) { best = w; bestD = d; }
        });
        return best;
    }

    // A victim, curve or wall the eraser would take at p
    function thingNear(p: P) {
        return !!(victimUnder(p) || M.arcNear(map, p.x, p.y, reach()) || M.segNear(map, p.x, p.y, reach()));
    }

    // The floor of the tile under p the eraser takes off: a hole, swamp or checkpoint, or the start
    // (on a click only, not dragged over); null if there is none
    function floorNear(p: P, click: boolean) {
        const at = tileAt(p);
        if (!at) return null;
        const tl = M.tileOf(map, at.x, at.y);
        if (W.floorKindOf(map, tl)) return { tile: at, kind: 'clear' };
        const st = map.startTile;
        if (click && st && st.x === at.x && st.y === at.y) return { tile: at, kind: 'start' };
        return null;
    }

    function erase(p: P, floors: boolean, click: boolean) {
        if (floors) {
            const f = floorNear(p, click);
            if (!f) return;
            if (f.kind === 'start') map.startTile = { x: 0, y: 0, z: 0 };
            else M.setFloor(map, f.tile.x, f.tile.y, 'clear');
            return;
        }
        const w = victimUnder(p);
        if (w) { M.removeVictim(map, w); return; }
        const a = M.arcNear(map, p.x, p.y, reach());
        if (a) { M.setCurve(map, a.x, a.y, a.q, 0); return; }
        const s = M.segNear(map, p.x, p.y, reach());
        if (!s) return;
        const rule = L.segRule(s, M.roomLookup(map), rulesOf(map).rooms);
        M.setWalls(map, rule.whole ? [s, L.otherHalf(s)!] : [s], false);
    }

    // ---- select: a region of tiles - moved by dragging (Alt: a copy), copied, cut, pasted, cleared ----

    let clip: Clip | null = null;     // what copy / cut took
    let lastTile: number[] | null = null;   // the tile under the pointer, where paste puts things

    function tileIndex(p: P, clamp: boolean) {
        let tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
        if (clamp) { tx = Math.max(0, Math.min(map.width - 1, tx)); ty = Math.max(0, Math.min(map.length - 1, ty)); }
        return [tx, ty];
    }

    function rect(a: number[], b: number[]): Region {
        return { x0: Math.min(a[0], b[0]), y0: Math.min(a[1], b[1]), x1: Math.max(a[0], b[0]), y1: Math.max(a[1], b[1]) };
    }

    function inRegion(tl: number[]) {
        const r = S.region;
        return !!r && tl[0] >= r.x0 && tl[0] <= r.x1 && tl[1] >= r.y0 && tl[1] <= r.y1;
    }

    function regionDown(p: P, e: PointerEvent) {
        const tl = tileIndex(p, true);
        if (inRegion(tl)) stroke = { move: true, start: tl, dx: 0, dy: 0, copy: !!(e && e.altKey) };
        else { stroke = { selecting: true, a: tl }; S.region = rect(tl, tl); }
    }

    function regionMove(p: P) {
        const tl = tileIndex(p, true);
        const r = S.region!;
        if (stroke.selecting) S.region = rect(stroke.a, tl);
        else if (stroke.move) {
            // kept inside the map
            stroke.dx = Math.max(-r.x0, Math.min(map.width - 1 - r.x1, tl[0] - stroke.start[0]));
            stroke.dy = Math.max(-r.y0, Math.min(map.length - 1 - r.y1, tl[1] - stroke.start[1]));
        }
    }

    function regionUp() {
        if (stroke && stroke.move && (stroke.dx || stroke.dy)) moveRegion(stroke.dx, stroke.dy, stroke.copy);
        say('');
    }

    function moveRegion(dx: number, dy: number, copy: boolean) {
        const r = S.region!;
        const st = map.startTile;
        const startIn = st && st.x > 0 && inRegion([(st.x - 1) / 2, (st.y - 1) / 2]);
        const c = M.copyRegion(map, r);
        if (!copy) M.clearRegion(map, r);
        M.pasteRegion(map, c, r.x0 + dx, r.y0 + dy);
        if (startIn && !copy) map.startTile = { x: st.x + 2 * dx, y: st.y + 2 * dy, z: 0 };
        borders = M.resyncBorderWalls(map, borders);
        S.region = { x0: r.x0 + dx, y0: r.y0 + dy, x1: r.x1 + dx, y1: r.y1 + dy };
    }

    function regionAction(fn: () => void) {
        if (!map) return;
        begin();
        fn();
        commit();
        view.redraw();
    }

    function copyRegion() {
        if (!S.region) return;
        clip = M.copyRegion(map, S.region);
        S.hasClip = true;
        notify('regionCopied', null, 'ok');
    }
    function cutRegion() {
        if (!S.region) return;
        copyRegion();
        regionAction(function () { M.clearRegion(map, S.region!); borders = M.resyncBorderWalls(map, borders); });
    }
    function clearRegion() {
        if (!S.region) return;
        regionAction(function () { M.clearRegion(map, S.region!); borders = M.resyncBorderWalls(map, borders); });
    }
    // at the tile under the pointer, or where the selection is
    function pasteRegion() {
        if (!clip) return;
        const c = clip;
        const at = lastTile || (S.region ? [S.region.x0, S.region.y0] : [0, 0]);
        const x0 = Math.max(0, Math.min(map.width - c.w, at[0])), y0 = Math.max(0, Math.min(map.length - c.h, at[1]));
        regionAction(function () { M.pasteRegion(map, c, x0, y0); borders = M.resyncBorderWalls(map, borders); });
        S.region = { x0: x0, y0: y0, x1: Math.min(map.width - 1, x0 + c.w - 1), y1: Math.min(map.length - 1, y0 + c.h - 1) };
    }
    // a copy beside the selection (right of it, or below when there is no room)
    function duplicateRegion() {
        const r = S.region;
        if (!r) return;
        const w = r.x1 - r.x0 + 1, h = r.y1 - r.y0 + 1;
        const dx = r.x1 + w < map.width ? w : 0, dy = dx ? 0 : (r.y1 + h < map.length ? h : 0);
        if (!dx && !dy) { notify('regionNoRoom', null, 'warn'); return; }
        regionAction(function () { moveRegion(dx, dy, true); });
    }
    function nudgeRegion(dx: number, dy: number) {
        const r = S.region;
        if (!r || r.x0 + dx < 0 || r.y0 + dy < 0 || r.x1 + dx >= map.width || r.y1 + dy >= map.length) return;
        regionAction(function () { moveRegion(dx, dy, false); });
    }
    function regionSize() {
        const r = S.region;
        return r ? (r.x1 - r.x0 + 1) + ' × ' + (r.y1 - r.y0 + 1) : '';
    }

    // ---- the victim tool: a placed victim clicked on is selected, and changed in the panel ----

    function selectWhere(where: Where | null) {
        const v = where && M.victimAt(map, where);
        S.selected = v ? { where: where!, victim: v, rot: v.rot!, letter: isTarget(v.type) ? (rules().tokens.target.typeOf(v.code) || 'X') : '', offset: M.victimOffset(map, where!) } : null;
    }

    function selectNone() { S.selected = null; view.redraw(); }

    function changeSelected(change: { type?: string; fake?: boolean; rot?: number; code?: string }) {
        const sel = S.selected;
        if (!sel) return;
        begin();
        M.changeVictim(map, sel.where, change);
        commit();
        selectWhere(sel.where);
    }

    // The selected victim moved along its wall from the panel: to `offset`, as far as it fits. The
    // slider moves it as it goes (slideSelected) and is one change when let go (slideDone); the
    // middle button is one change at once.
    let sliding: { from: number } | null = null;
    function slideSelected(offset: number) {
        const sel = S.selected;
        if (!sel) return;
        if (!sliding) { begin(); sliding = { from: M.victimOffset(map, sel.where) }; }
        M.moveVictim(map, sel.where, Number(offset) || 0);
        selectWhere(sel.where);
        view.redraw();
    }
    function slideDone() {
        const sel = S.selected;
        if (!sliding || !sel) { sliding = null; return; }
        if (M.victimOffset(map, sel.where) !== sliding.from && newlyLost()) {
            M.moveVictim(map, sel.where, sliding.from);
            notify('victim_unreachable', null, 'warn');
        }
        sliding = null;
        commit();
        selectWhere(sel.where);
    }
    function moveSelected(offset: number) {
        slideSelected(offset);
        slideDone();
    }
    // how far it goes, for the panel's slider
    function selectedRange() {
        const sel = S.selected;
        if (!sel) return null;
        return M.victimRange(map, sel.where);
    }

    function removeSelected() {
        const sel = S.selected;
        if (!sel) return;
        begin();
        M.removeVictim(map, sel.where);
        commit();
        S.selected = null;
    }

    function selectedPos() {
        const w = S.selected && S.selected.where;
        return w ? M.victimPlace(map, w).at : null;
    }

    function quarterTile(p: P) {
        const tl = tileAt(p);
        const room = tl ? M.roomOf(map, tl.x, tl.y) : 0;
        return room === 2 || room === 3;
    }

    // A placed victim dragged: along its wall, as far as it fits (it starts once the pointer has gone
    // half a cm, so a click stays a click)
    function dragVictim(p: P) {
        if (!stroke.victim) {
            if (!stroke.grab || Math.hypot(p.x - stroke.down.x, p.y - stroke.down.y) < 0.5) return;
            stroke.victim = stroke.grab;
            stroke.from = M.victimOffset(map, stroke.grab);
            selectWhere(stroke.grab);
        }
        if (M.moveVictim(map, stroke.victim, M.offsetToward(map, stroke.victim, p.x, p.y))) selectWhere(stroke.victim);
    }
    // an offset as the page shows it: +2.5, −1.0, 0.0 (cm)
    function offsetText(o: number) {
        return (o > 0 ? '+' : o < 0 ? '−' : '') + fixed(Math.abs(o), 1);
    }
    function dropVictim() {
        const w = stroke.victim;
        if (M.victimOffset(map, w) === stroke.from) return;
        // where the robot cannot get to: back where it was, with why
        if (newlyLost()) {
            M.moveVictim(map, w, stroke.from);
            notify('victim_unreachable', null, 'warn');
        } else notify('victim_moved', { cm: offsetText(M.victimOffset(map, w)) }, 'ok');
        selectWhere(w);
    }

    // A placed victim of the chosen kind is selected (its turn / rings in the panel, as the room 4
    // creator does); one of another kind takes the chosen kind
    function placeVictim(p: P) {
        const keep = JSON.stringify(map.cells);
        put(p);
        // none where the robot cannot get to (rule 3.2.4): taken back, with why
        if (keep !== JSON.stringify(map.cells) && newlyLost()) {
            map.cells = JSON.parse(keep);
            S.selected = null;
            notify('victim_unreachable', null, 'warn');
        }
    }
    // whether the robot cannot get to more victims than before the change (lostVictims: as worked out
    // after the last change)
    function newlyLost() {
        const r = M.robotReach(map, room4Picture());
        const was = new Set(lostVictims.map(function (q) { return q[0] + ',' + q[1]; }));
        return !!r && r.victims.some(function (q) { return !was.has(q[0] + ',' + q[1]); });
    }
    function put(p: P) {
        // a placed one clicked on: selected, or given the chosen kind (it stays where it is)
        const hit = victimUnder(p);
        if (hit) {
            if (sameVictim(M.victimAt(map, hit))) { selectWhere(hit); return; }
            replaceKind(hit);
            selectWhere(null);
            return;
        }
        const where = placementAt(p);
        if (!where) return;
        const rule = where.kind === 'slot' ? M.slotRule(map, where.x, where.y, where.i) : M.victimRule(map, where.x, where.y, where.dir);
        if (!rule.ok) { notify('victim_' + rule.reason, null, 'warn'); return; }
        // a new one goes where the click is along the wall, as far as it fits
        const opts = Object.assign(victimOpts(), { offset: 0 });
        if (where.kind === 'slot') M.setSlotVictim(map, where.x, where.y, where.i, ui.victim, ui.fake, opts);
        else M.setVictim(map, where.x, where.y, where.dir, ui.victim, ui.fake, opts);
        M.moveVictim(map, where, M.offsetToward(map, where, p.x, p.y));
        if (!M.victimFits(map, where, M.victimOffset(map, where))) {
            M.removeVictim(map, where);
            notify('victim_noRoom', null, 'warn');
            return;
        }
        selectWhere(null);
    }
    // a placed victim given the chosen kind (with the turn and rings chosen), where it is - or, a
    // cognitive target being wider, the nearest place it fits; none: left as it was
    function replaceKind(w: Where) {
        const keep = JSON.stringify(map.cells);
        const o = M.victimOffset(map, w), opts = Object.assign(victimOpts(), { offset: o });
        if (w.kind === 'slot') M.setSlotVictim(map, w.x, w.y, w.i, ui.victim, ui.fake, opts);
        else M.setVictim(map, w.x, w.y, w.dir, ui.victim, ui.fake, opts);
        if (M.victimFits(map, w, o)) return;
        M.moveVictim(map, w, o);
        if (M.victimFits(map, w, M.victimOffset(map, w))) return;
        map.cells = JSON.parse(keep);
        notify('victim_noRoom', null, 'warn');
    }
    // The spot of a new victim at p: the face of the wall nearest to it, of its quarter (rooms 2, 3)
    // or its tile - one with a wall, when one is within half the face; else the side p is on
    function placementAt(p: P): Where | null {
        if (quarterTile(p)) {
            const sl = M.slotAt(map, p.x, p.y)!;
            const t = M.tileOf(map, sl.x, sl.y), q = Math.floor(sl.i / 4);
            if (t && t.curve && Number(t.curve[q])) return { kind: 'slot', x: sl.x, y: sl.y, i: sl.i };
            return nearestFace([0, 1, 2, 3].map(function (side): Where { return { kind: 'slot', x: sl.x, y: sl.y, i: q * 4 + side }; }), p, 3)
                || { kind: 'slot', x: sl.x, y: sl.y, i: sl.i };
        }
        const s = sideAt(p);
        if (!s) return null;
        return nearestFace(Object.keys(M.SIDES).map(function (d): Where { return { kind: 'edge', x: s.tile.x, y: s.tile.y, dir: d }; }), p, 6)
            || { kind: 'edge', x: s.tile.x, y: s.tile.y, dir: s.dir };
    }
    function nearestFace(faces: Where[], p: P, reach: number): Where | null {
        let best: Where | null = null, bestD = reach;
        faces.forEach(function (w) {
            const ok = w.kind === 'slot' ? M.slotHasWall(map, w.x, w.y, w.i) : M.hasWall(map, w.x, w.y, w.dir);
            if (!ok) return;
            const wall = M.victimPlace(map, w, 0).wall, along = M.victimPlace(map, w, 0).along;
            // across its wall's line
            const d = Math.abs((p.x - wall[0]) * along[1] - (p.y - wall[1]) * along[0]);
            if (d < bestD) { best = w; bestD = d; }
        });
        return best;
    }

    // What a click of the victim tool does on the placed victim cur
    function victimSay(cur: VictimInfo | null) {
        if (cur && sameVictim(cur)) say('victim_selectDrag');
        else say('victim_replace', { name: victimName() });
    }

    // What the tool would do at p, for the preview
    function hoverAt(p: P) {
        const ti = tileIndex(p, false);
        lastTile = ti[0] >= 0 && ti[1] >= 0 && ti[0] < map.width && ti[1] < map.length ? ti : lastTile;
        // what the tool would do here, said in the status line; nothing said: the tool's how-to
        say('');
        return hoverOf(p);
    }

    function hoverOf(p: P): any {
        const tool = ui.tool;
        if (tool === 'shape' && ui.shapeMode !== 'outline') {
            const op = lineAt(p);
            if (op) say('line_' + ui.shapeMode);
            return op ? { kind: 'line', op: op } : null;
        }
        if (tool === 'line') {
            if (stroke) { if (stroke.plan) strokeSay(); return null; }
            const tl = tileAt(p);
            const room = tl ? M.roomOf(map, tl.x, tl.y) : 0;
            if (room === 4) say('line_room4');
            else if (room) say(room === 2 || room === 3 ? 'line_fine' : 'line_tile', { room: room });
            const step = stepAt(p);
            return { kind: 'point', at: L.snap(p.x, p.y, step, map.width, map.length), step: step };
        }
        if (tool === 'hand') { say('hand'); return null; }
        if (tool === 'shape') {
            const tl = tileAt(p);
            if (!tl) return null;
            const out = M.isOutside(map, tl.x, tl.y);
            say(out ? 'shapeIn' : 'shapeOut');
            return { kind: 'tile', tile: tl, color: out ? '#16a34a' : '#dc2626' };
        }
        if (tool === 'room') {
            const tl = tileAt(p);
            if (!tl) return null;
            const cur = M.roomOf(map, tl.x, tl.y);
            if (M.isOutside(map, tl.x, tl.y)) say('room_outside');
            else if (cur === ui.room && cur === 4) say('room_room4');
            else if (cur === ui.room) say('room_same', { room: cur });
            else say('room_paint', { room: ui.room, cur: cur });
            return { kind: 'tile', tile: tl };
        }
        if (tool === 'floor') {
            const tl = tileAt(p);
            if (!tl) return null;
            const kind = ui.floor, tile = M.tileOf(map, tl.x, tl.y);
            const st = map.startTile;
            const name = t('admin.simBeta.floors.' + kind);
            if (M.isOutside(map, tl.x, tl.y)) say('floor_outside');
            else if (kind === 'start') say(st && st.x === tl.x && st.y === tl.y ? 'floor_isStart' : 'floor_start');
            else if (kind === 'clear') say('floor_clear');
            else if (tile && tile[kind]) say('floor_off', { floor: name });
            else if (!M.floorFits(map, tl.x, tl.y, kind)) { say('floor_notOuter', { floor: name }); return { kind: 'tile', tile: tl, color: '#dc2626' }; }
            else say('floor_on', { floor: name });
            return { kind: 'tile', tile: tl };
        }
        if (tool === 'select') {
            const tl = tileIndex(p, false);
            say(inRegion(tl) ? 'regionDrag' : 'regionPick');
            return null;
        }
        if (tool === 'curve') {
            const c = M.arcChoice(map, p.x, p.y);
            if (!c) return null;
            if (!c.rule.ok) say('curve_' + c.rule.reason);
            else say(Number(M.tileOf(map, c.x, c.y)!.curve![c.q]) === c.v ? 'curve_off' : 'curve_on');
            return { kind: 'curve', choice: c };
        }
        if (tool === 'eraser') {
            const w = victimUnder(p);
            if (w) { say('erase_victim'); return { kind: 'spot', at: M.victimPlace(map, w).at, color: '#dc2626', small: w.kind === 'slot' }; }
            const a = M.arcNear(map, p.x, p.y, reach());
            if (a) { say('erase_curve'); return { kind: 'arc', arc: a, color: '#dc2626' }; }
            const s = M.segNear(map, p.x, p.y, reach());
            if (!s) {
                // while dragging over walls, floors are left alone
                const f = !(stroke && !stroke.floors) && floorNear(p, !stroke);
                if (f) say(f.kind === 'start' ? 'erase_start' : 'erase_floor');
                return f ? { kind: 'tile', tile: f.tile, color: '#dc2626' } : null;
            }
            const rule = L.segRule(s, M.roomLookup(map), rulesOf(map).rooms);
            say(rule.whole ? 'erase_wallWhole' : 'erase_wall');
            return { kind: 'segs', segs: rule.whole ? [s, L.otherHalf(s)] : [s], color: '#dc2626' };
        }
        if (tool === 'passage') {
            const s = sideAt(p);
            if (!s) return null;
            const b = nearEdge(p, s) && M.borderAt(map, s.ex, s.ey);
            if (b) {
                const at = M.passageSide(map, b, [s.tile.x, s.tile.y]);
                const here = M.tileOf(map, at[0], at[1]);
                const moved = at[0] !== s.tile.x || at[1] !== s.tile.y;
                say(moved ? 'passageRoom4' : here && here.color === b.pass.color ? 'passageClose' : 'passageOpen');
                return { kind: 'border', side: s, border: b, at: at };
            }
            const tl = M.tileOf(map, s.tile.x, s.tile.y);
            const isPass = tl && tl.color && W.passagesOf(map).some(function (q: W.RoomPassage) { return q.color === tl.color; });
            say(isPass ? 'passageRemove' : 'passageHere');
            return isPass ? { kind: 'tile', tile: s.tile, color: '#dc2626' } : null;
        }
        if (tool === 'victim') {
            // moving one along its wall
            if (stroke && stroke.victim) {
                say('victim_moving', { cm: offsetText(M.victimOffset(map, stroke.victim)) });
                return null;
            }
            // on a placed one: select it (and drag it along its wall), or give it the chosen kind
            const hit = victimUnder(p);
            if (hit) {
                victimSay(M.victimAt(map, hit));
                return { kind: 'spot', at: M.victimPlace(map, hit).at, color: '#16a34a', small: hit.kind === 'slot' };
            }
            const where = placementAt(p);
            if (!where) return null;
            const rule = where.kind === 'slot' ? M.slotRule(map, where.x, where.y, where.i) : M.victimRule(map, where.x, where.y, where.dir);
            if (!rule.ok) say('victim_' + rule.reason);
            else if (where.kind === 'edge') {
                const v = M.edgeVictim(map, where.x, where.y);
                say(v ? 'victim_move' : 'victim_place', { name: victimName() });
            } else say(M.slotVictim(map, where.x, where.y, where.i) ? 'victim_moveSlot' : 'victim_place', { name: victimName() });
            // where it would go: the click's place along the wall, as far as it fits - red where the
            // robot would not get to it (rule 3.2.4: it is not put there)
            const place = M.victimPlace(map, where, rule.ok ? M.offsetToward(map, where, p.x, p.y, 0, ui.victim) : 0);
            const lost = rule.ok && !!robot && !robot.gotTo(where.x, where.y, place.at, place.wall);
            if (lost) say('victim_unreachable');
            return { kind: 'spot', at: place.at, color: rule.ok && !lost ? '#16a34a' : '#dc2626', small: where.kind === 'slot' };
        }
        return null;
    }

    // ---- preview on the canvas (cm) ----------------------------------------------------------------

    function segLine(ctx: CanvasRenderingContext2D, s: string) {
        const g = L.parseSeg(s);
        ctx.moveTo(6 * g.i, 6 * g.j);
        if (g.dir === 'v') ctx.lineTo(6 * g.i, 6 * (g.j + 1));
        else ctx.lineTo(6 * (g.i + 1), 6 * g.j);
    }

    function drawSegs(ctx: CanvasRenderingContext2D, segs: string[], color: string, width: number) {
        if (!segs.length) return;
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineCap = 'square';
        ctx.beginPath();
        segs.forEach(function (s) { segLine(ctx, s); });
        ctx.stroke();
    }

    function drawOverlay(ctx: CanvasRenderingContext2D, v: { scale: number }) {
        if (!map) return;
        const px = 1 / v.scale;
        drawFloatingWalls(ctx);
        drawBadVictims(ctx, px);
        const tool = ui.tool;
        // the borders where a passage can go, while the passage tool is out
        if (tool === 'passage') {
            ctx.lineWidth = 4 * px;
            ctx.setLineDash([6 * px, 4 * px]);
            for (let x = 1; x < 2 * map.width; x += 2) {
                for (let y = 1; y < 2 * map.length; y += 2) {
                    [[1, 0], [0, 1]].forEach(function (d) {
                        const b = M.borderAt(map, x + d[0], y + d[1]);
                        if (!b) return;
                        ctx.strokeStyle = b.pass.color;
                        ctx.beginPath();
                        const ex = 6 * (x + d[0]), ey = 6 * (y + d[1]);
                        if (d[0]) { ctx.moveTo(ex, ey - 5); ctx.lineTo(ex, ey + 5); } else { ctx.moveTo(ex - 5, ey); ctx.lineTo(ex + 5, ey); }
                        ctx.stroke();
                    });
                }
            }
            ctx.setLineDash([]);
        }
        if (stroke && stroke.plan) {
            drawSegs(ctx, stroke.plan.ok, 'rgba(37, 99, 235, 0.85)', 1.2);
            drawSegs(ctx, stroke.plan.bad, 'rgba(220, 38, 38, 0.85)', 1.2);
            [stroke.from, stroke.end].forEach(function (pt: number[]) { dot(ctx, 6 * pt[0], 6 * pt[1], 3.5 * px, '#2563eb'); });
            (stroke.corners || []).slice(1).forEach(function (pt: number[]) { dot(ctx, 6 * pt[0], 6 * pt[1], 2.5 * px, '#2563eb'); });
        }
        if (pointed) { drawPointed(ctx, px); return; }
        if (tool === 'passage') drawPassageHelp(ctx, px);
        if (tool === 'select' && S.region) {
            const r = S.region;
            const box = function (dx: number, dy: number, fill: string) {
                ctx.fillStyle = fill;
                ctx.fillRect(12 * (r.x0 + dx), 12 * (r.y0 + dy), 12 * (r.x1 - r.x0 + 1), 12 * (r.y1 - r.y0 + 1));
                ctx.strokeStyle = '#2563eb';
                ctx.lineWidth = 2 * px;
                ctx.setLineDash([6 * px, 4 * px]);
                ctx.strokeRect(12 * (r.x0 + dx), 12 * (r.y0 + dy), 12 * (r.x1 - r.x0 + 1), 12 * (r.y1 - r.y0 + 1));
                ctx.setLineDash([]);
            };
            box(0, 0, 'rgba(37, 99, 235, 0.08)');
            if (stroke && stroke.move && (stroke.dx || stroke.dy)) box(stroke.dx, stroke.dy, stroke.copy ? 'rgba(22, 163, 74, 0.18)' : 'rgba(37, 99, 235, 0.18)');
        }
        const sp = selectedPos();
        if (sp) { ring(ctx, sp[0], sp[1], 2.4, '#f59e0b', px * 1.4); }
        if (!hover) return;
        if (hover.kind === 'line') {
            const o = hover.op;
            const w = map.width * TILE, h = map.length * TILE;
            if (o.insert) {
                const at = 6 * o.index;
                ctx.strokeStyle = '#16a34a';
                ctx.lineWidth = 3 * px;
                ctx.beginPath();
                if (o.axis === 'y') { ctx.moveTo(-6, at); ctx.lineTo(w + 6, at); } else { ctx.moveTo(at, -6); ctx.lineTo(at, h + 6); }
                ctx.stroke();
                dot(ctx, o.axis === 'y' ? -6 : at, o.axis === 'y' ? at : -6, 9 * px, '#16a34a');
                ctx.fillStyle = '#fff';
                ctx.font = '700 ' + (14 * px) + 'px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('+', o.axis === 'y' ? -6 : at, (o.axis === 'y' ? at : -6) + px);
            } else {
                const at = 6 * (o.index - 1);
                ctx.fillStyle = 'rgba(220, 38, 38, 0.18)';
                if (o.axis === 'y') ctx.fillRect(0, at, w, TILE); else ctx.fillRect(at, 0, TILE, h);
                ctx.strokeStyle = '#dc2626';
                ctx.lineWidth = 2 * px;
                if (o.axis === 'y') ctx.strokeRect(0, at, w, TILE); else ctx.strokeRect(at, 0, TILE, h);
            }
            return;
        }
        if (hover.kind === 'curve') {
            const c = hover.choice;
            for (let v2 = 1; v2 <= 4; v2++) arcPath(ctx, c.x, c.y, c.q, v2, v2 === c.v ? (c.rule.ok ? 'rgba(37, 99, 235, 0.9)' : 'rgba(220, 38, 38, 0.9)') : 'rgba(100, 116, 139, 0.35)', v2 === c.v ? 1.2 : 0.5);
            return;
        }
        if (hover.kind === 'arc') {
            arcPath(ctx, hover.arc.x, hover.arc.y, hover.arc.q, hover.arc.v, hover.color, 1.4);
            return;
        }
        if (hover.kind === 'spot') {
            ring(ctx, hover.at[0], hover.at[1], hover.small ? 1.8 : 2.3, hover.color, px);
            return;
        }
        if (hover.kind === 'point') {
            dot(ctx, 6 * hover.at[0], 6 * hover.at[1], 4 * px, hover.step === 1 ? '#7c3aed' : '#2563eb');
        } else if (hover.kind === 'tile') {
            ctx.strokeStyle = hover.color || '#2563eb';
            ctx.lineWidth = 2.5 * px;
            ctx.strokeRect(6 * (hover.tile.x - 1) + px, 6 * (hover.tile.y - 1) + px, TILE - 2 * px, TILE - 2 * px);
        } else if (hover.kind === 'segs') {
            drawSegs(ctx, hover.segs, hover.color, 1.4);
        } else if (hover.kind === 'border') {
            const s = hover.side;
            ctx.fillStyle = hover.border.pass.color;
            ctx.globalAlpha = 0.45;
            ctx.fillRect(6 * (hover.at[0] - 1), 6 * (hover.at[1] - 1), TILE, TILE);
            ctx.globalAlpha = 1;
            ctx.strokeStyle = hover.border.pass.color;
            ctx.lineWidth = 2.2;
            ctx.beginPath();
            const ex = 6 * s.ex, ey = 6 * s.ey;
            if (s.ex % 2 === 0) { ctx.moveTo(ex, ey - 6); ctx.lineTo(ex, ey + 6); } else { ctx.moveTo(ex - 6, ey); ctx.lineTo(ex + 6, ey); }
            ctx.stroke();
        }
    }

    function arcPath(ctx: CanvasRenderingContext2D, x: number, y: number, q: number, v: number, color: string, width: number) {
        const c = M.arcCentre(x, y, q, v);
        const start = [[-Math.PI / 2, 0], [0, Math.PI / 2], [Math.PI / 2, Math.PI], [Math.PI, 1.5 * Math.PI]][v - 1];
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.arc(c[0], c[1], 6, start[0], start[1]);
        ctx.stroke();
    }

    // With the passage tool: what the room check says (gaps to close or mark, where a passage
    // would join a room that is not reached yet)
    function drawPassageHelp(ctx: CanvasRenderingContext2D, px: number) {
        const tileBox = function (k: string, color: string, dash: boolean) {
            const tl = k.split(',').map(Number);
            ctx.strokeStyle = color;
            ctx.lineWidth = 3 * px;
            ctx.setLineDash(dash ? [5 * px, 4 * px] : []);
            ctx.strokeRect(12 * tl[0] + 2 * px, 12 * tl[1] + 2 * px, 12 - 4 * px, 12 - 4 * px);
            ctx.setLineDash([]);
        };
        const marks = W.connectionStatus(map).marks;
        Object.keys(marks).forEach(function (k) {
            const m = marks[k];
            const color = (m.style && m.style['border-color']) || '#dc2626';
            tileBox(k, color, m.cls === 'hint');
        });
    }

    // Everything a problem is about: the rest of the map dimmed, its places outlined
    function drawPointed(ctx: CanvasRenderingContext2D, px: number) {
        const sh = pointed!;
        const tiles = new Set((sh.tiles || []).map(function (tl) { return tl[0] + ',' + tl[1]; }));
        ctx.save();
        ctx.fillStyle = 'rgba(15, 23, 42, 0.38)';
        ctx.beginPath();
        ctx.rect(-1e4, -1e4, 2e4, 2e4);
        // holes over what is pointed out, so it stays bright
        (sh.tiles || []).forEach(function (tl) { ctx.rect(12 * tl[0], 12 * tl[1], 12, 12); });
        (sh.points || []).forEach(function (pt) { ctx.moveTo(pt[0] + 3, pt[1]); ctx.arc(pt[0], pt[1], 3, 0, 2 * Math.PI); });
        ctx.fill('evenodd');
        const glow = function (strokeIt: () => void, width: number) {
            ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
            ctx.lineWidth = width + 6 * px;
            strokeIt();
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = width;
            strokeIt();
        };
        // the outline of the tiles together (their sides that touch no other of them)
        ctx.lineCap = 'round';
        glow(function () {
            ctx.beginPath();
            (sh.tiles || []).forEach(function (tl) {
                const x = 12 * tl[0], y = 12 * tl[1];
                if (!tiles.has(tl[0] + ',' + (tl[1] - 1))) { ctx.moveTo(x, y); ctx.lineTo(x + 12, y); }
                if (!tiles.has((tl[0] + 1) + ',' + tl[1])) { ctx.moveTo(x + 12, y); ctx.lineTo(x + 12, y + 12); }
                if (!tiles.has(tl[0] + ',' + (tl[1] + 1))) { ctx.moveTo(x, y + 12); ctx.lineTo(x + 12, y + 12); }
                if (!tiles.has((tl[0] - 1) + ',' + tl[1])) { ctx.moveTo(x, y); ctx.lineTo(x, y + 12); }
            });
            ctx.stroke();
        }, 3 * px);
        (sh.points || []).forEach(function (pt) {
            glow(function () { ctx.beginPath(); ctx.arc(pt[0], pt[1], 2.6, 0, 2 * Math.PI); ctx.stroke(); }, 3 * px);
        });
        (sh.segs || []).forEach(function (sg) {
            glow(function () { ctx.beginPath(); segLine(ctx, sg); ctx.stroke(); }, 1.6);
        });
        (sh.arcs || []).forEach(function (a) {
            const c = M.arcCentre(a.x, a.y, a.q, a.v);
            const start = [[-Math.PI / 2, 0], [0, Math.PI / 2], [Math.PI / 2, Math.PI], [Math.PI, 1.5 * Math.PI]][a.v - 1];
            glow(function () { ctx.beginPath(); ctx.arc(c[0], c[1], 6, start[0], start[1]); ctx.stroke(); }, 1.6);
        });
        ctx.restore();
    }

    function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, 2 * Math.PI);
        ctx.fill();
    }

    function ring(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, px: number) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5 * px;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, 2 * Math.PI);
        ctx.stroke();
    }

    // ---- files, keys, leaving ----------------------------------------------------------------------

    function readFile(file: File) {
        const reader = new FileReader();
        reader.onload = function () { apply(function () { open(reader.result as string, file.name); }); };
        reader.readAsText(file);
    }

    function fileChosen(e: Event) {
        const file = (e.target as HTMLInputElement).files![0];
        if (!file) return;
        apply(function () { whenDiscarded(function () { readFile(file); }); });
    }

    function canvasDblClick(e: MouseEvent) {
        if (!map) return;
        const r = (e.target as HTMLElement).getBoundingClientRect();
        const q = view.toPx(0, 0), sc = view.scale();
        const p = { x: (e.clientX - r.left - q[0]) / sc, y: (e.clientY - r.top - q[1]) / sc };
        const tl = tileAt(p);
        if (tl && M.roomOf(map, tl.x, tl.y) === 4 && (!map.area4Room || map.area4Room.type <= 1)) apply(openRoom4);
    }

    // ---- the guide (lib/tour): the tour of the screen, the lesson (a sample map built step by
    // step) and the room 4 part on its own. The window is shaded but for the parts the step is about,
    // with a card beside them. In the tour the editor waits; in the lesson it is used as usual.
    const TOUR_SEEN = 'simBeta2026.tourSeen';
    let tourKeep: TourKeep | null = null, tourTimer: number | null = null, tourTick: number | null = null;
    S.tourSeen = (function () { try { return !!localStorage.getItem(TOUR_SEEN); } catch (e) { return true; } })();
    const GUIDE_ASKED = 'simBeta2026.guideAsked';

    // which way through the guide: the lesson, the tour of the screen or the room 4 part
    // what: 'main' (from the editor: everything), 'room4' (from the room 4 creator: its two ways) or
    // 'keys' (the mouse and the keys)
    function openGuidePick(what?: string) {
        if (S.dialog) return;
        ui.betaMenu = false;
        ui.guidePick = what || 'main';
    }
    function closeGuidePick() {
        ui.guidePick = false;
        try { localStorage.setItem(GUIDE_ASKED, '1'); } catch (e) { /* storage off */ }
    }
    const ROOM4_KINDS = ['room4', 'room4tour'];
    function pickGuide(kind: string) {
        closeGuidePick();
        if (ROOM4_KINDS.indexOf(kind) >= 0) {
            // within the tour of the screen or the lesson, the room 4 part comes in between: they go
            // on where they were when it ends
            const nest = !!S.tour && ROOM4_KINDS.indexOf(S.tour.kind) < 0;
            startRoom4Guide(kind, nest);
        } else startTour(kind);
    }
    function room4Ready() { return room4State() === 'empty' || room4State() === 'drawn'; }
    // asked once by itself, on a first visit with nothing open
    function askGuideOnce() {
        later(function () {
            let asked = true;
            try { asked = !!localStorage.getItem(GUIDE_ASKED) || !!localStorage.getItem(TOUR_SEEN); } catch (e) { /* storage off: not asked */ }
            if (!asked && !map && !S.tour && !S.dialog) openGuidePick();
        }, 600);
    }

    // the sample map as the lesson's first and last cards draw it: tiles by room, passages, the start
    S.tourPlan = (function () {
        const SA = T.SAMPLE, fill: Record<number, string> = { 1: '#ffffff', 2: '#dcebfb', 3: '#f7e3f7', 4: '#e6d9ff' }, tiles: { x: number; y: number; fill: string }[] = [];
        for (let x = 0; x < SA.width; x++) {
            for (let y = 0; y < SA.length; y++) {
                let room = 1;
                [2, 3, 4].forEach(function (r) { const b = SA.rooms[r]; if (x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]) room = r; });
                if (x === SA.outside[0] && y === SA.outside[1]) continue;
                tiles.push({ x: 12 * x, y: 12 * y, fill: fill[room] });
            }
        }
        const room = function (r: number) { const b = SA.rooms[r]; return { x: 12 * b[0] + 6 * (b[2] - b[0] + 1), y: 12 * b[1] + 6 * (b[3] - b[1] + 1), n: r }; };
        return {
            w: 12 * SA.width, h: 12 * SA.length, tiles: tiles, labels: [room(2), room(3), room(4), { x: 18, y: 42, n: 1 }],
            passages: [{ x: 24, y: 12, c: '#1a1ae6' }, { x: 48, y: 24, c: '#4d1a99' }, { x: 60, y: 48, c: '#e71a1a' }],
            start: { x: 12 * SA.start[0] + 6, y: 12 * SA.start[1] + 6 },
            walls: [SA.wall1, SA.wall2].map(function (l) { return l.map(function (p) { return p.join(','); }).join(' '); })
        };
    })();

    // The year of the lesson's sample map: that of the rules chosen now (the map open, else the year
    // chosen for new maps); the lesson's steps and texts follow it
    function lessonYear() {
        return rules().year;
    }

    // kind: 'tour' (the screen), 'lesson' (the sample map) or 'room4' (the room 4 creator's part)
    function startTour(kind?: string) {
        if (S.dialog) return;
        ui.betaMenu = false;
        ui.guidePick = false;
        kind = kind || (map ? 'tour' : 'lesson');
        if (kind === 'lesson' && map) {
            // the lesson builds its own map: from a new one of the same year, once the open one may go
            const year = lessonYear();
            whenDiscarded(function () { newBlank(year); beginTour('lesson'); });
            return;
        }
        beginTour(kind);
    }
    // from the room 4 creator (its header has the button); during the lesson it goes to the lesson's
    // own room 4 part, so the lesson goes on after it
    function startRoom4Tour() {
        const tr = S.tour;
        // the lesson at its own room 4 part (or just before it): on to that part
        if (tr && tr.kind === 'lesson') {
            const openAt = tr.steps.findIndex(function (s) { return s.id === 'r4open'; });
            const first = tr.steps.findIndex(function (s) { return s.id === T.ROOM4[0].id; });
            const last = tr.steps.findIndex(function (s) { return s.id === T.ROOM4[T.ROOM4.length - 1].id; });
            if (first >= 0 && tr.i >= openAt && tr.i <= last) { if (tr.i < first) tourJump(first); return; }
        }
        // the room 4 guide already shown: nothing to choose
        if (tr && ROOM4_KINDS.indexOf(tr.kind) >= 0) return;
        openGuidePick('room4');
    }
    // from the tour of the screen (its room 4 step): the creator's own tour in between
    function tourRoom4Inside() { startRoom4Guide('room4tour', true); }
    // the room 4 guide in the room 4 creator (opened for it if it is not, and closed again when the
    // guide ends); nest: the guide shown now goes on after it
    function startRoom4Guide(kind: string, nest: boolean) {
        const opened = !creatorScope();
        if (opened) openRoom4();
        later(function () { beginTour(kind || 'room4', nest, opened); }, opened ? 450 : 0);
    }
    // the guide to look at only (the tour of the screen, or of the room 4 creator): the editor is kept
    // still, the keys go through the steps, there are no tasks
    function tourLook() { return !!S.tour && (S.tour.kind === 'tour' || S.tour.kind === 'room4tour'); }

    // The map switched to the rules of another year (the rules menu): asked first; what does not
    // fit the new rules is pointed out by the checks, and undo takes the map back to its year
    function changeRules(year: number) {
        if (!map || !rulesFor(year) || year === rulesOf(map).year) return;
        const from = rulesOf(map).year;
        openDialog({
            kind: 'warn', title: t('admin.simBeta.rules.switchTitle', { year: year }),
            message: t('admin.simBeta.rules.switchLead', { from: from, to: year }),
            actions: [{ label: t('admin.simBeta.cancel'), value: null, style: '' }, { label: t('admin.simBeta.rules.switch'), value: 'switch', style: 'primary', icon: 'fa-book' }]
        }).then(function (v) {
            if (v !== 'switch' || !map) return;
            begin();
            map.rules = year;
            borders = M.syncBorderWalls(map, borders);
            commit();
            notify('rulesSwitched', { year: year }, 'ok');
            digest();
        });
    }

    // a blank start (the lesson's: of the year of its rules; else of the year chosen for new maps)
    function newBlank(year?: number) {
        load(M.newMap(8, 6, year || ui.newYear), '');
        setTool('shape');
        ui.shapeMode = 'outline';
        ui.freshMap = true;
    }

    function beginTour(kind: string, nest?: boolean, openedCreator?: boolean) {
        cancelStroke();
        // a guide in between keeps the one shown now (and what it keeps of the editor) to go back to
        const outer = nest && S.tour ? { tour: S.tour, keep: tourKeep } : null;
        if (!outer) tourKeep = { tool: ui.tool, checksFolded: !!ui.checksFolded, shapeMode: ui.shapeMode, made: false };
        const steps = kind === 'tour' ? T.STEPS : kind === 'room4' ? T.ROOM4 : kind === 'room4tour' ? T.ROOM4_TOUR : T.LESSON.filter(function (s) { return !(s.noMap && map); });
        S.tour = { kind: kind, steps: steps, i: 0, st: markRaw({}), done: false, outer: outer, openedCreator: !!openedCreator,
            chapterIds: kind === 'tour' ? T.CHAPTERS : ROOM4_KINDS.indexOf(kind) >= 0 ? ['room4'] : T.LESSON_CHAPTERS };
        showTourStep();
        cancel(tourTick);
        // the lesson's parts move while the map is used (zoom, panels, the room 4 creator): laid out again
        if (kind !== 'tour') tourTick = later(function tickFn() { if (!S.tour) return; layoutTour(true); tourTick = later(tickFn, 400); }, 400);
    }

    function tourStep(): TourStep | null { return S.tour ? S.tour.steps[S.tour.i] : null; }
    function tourKey(s: TourStep) { return 'admin.simBeta.' + (S.tour!.kind === 'tour' ? 'tour.' : 'lesson.') + s.id; }
    function tourText(part: string) {
        const s = tourStep();
        if (!s) return '';
        if (part === 'task' && tourLook()) return '';
        const k = tourKey(s) + '.' + part, v = t(k);
        return v === k ? '' : Keys.text(v);
    }
    // the step's paragraphs (kept while the text is the same)
    let tourLinesOf: { text: string | null; lines: string[] } = { text: null, lines: [] };
    function tourLines() {
        const text = tourText('body');
        if (text !== tourLinesOf.text) tourLinesOf = { text: text, lines: text.split('\n').filter(function (l) { return l.trim(); }) };
        return tourLinesOf.lines;
    }
    // one bar per chapter: how many of its steps are passed (worked out once per step)
    function tourChapters() {
        const tr = S.tour!;
        return tr.chapterIds.map(function (c) {
            const idx = tr.steps.map(function (s, i) { return s.chapter === c ? i : -1; }).filter(function (i) { return i >= 0; });
            return { id: c, first: idx[0], done: idx.filter(function (i) { return i < tr.i; }).length, count: idx.length, on: idx.indexOf(tr.i) >= 0 };
        }).filter(function (c) { return c.count; });
    }

    // what a lesson step sees and does (lib/tour's env)
    function creatorScope(): CreatorApi | null {
        const el = document.querySelector('.sbx-r4-full .sim-r4');
        return el && S.creator ? S.creator : null;
    }
    function tourEnv(): TourEnv {
        return {
            M: M, W: W, L: L, map: map, ui: ui, selected: S.selected, region: S.region,
            creator: creatorScope(), room4State: room4State(), problems: S.problems,
            sync: function () { borders = M.resyncBorderWalls(map, borders); },
            act: {
                newMap: function () { newBlank(lessonYear()); },
                resize: function (w, l) { resize(w - map.width, l - map.length); },
                openRoom4: function () { openRoom4(); },
                fixAll: function () { fixAll(); },
                toggleLinear: function () { toggleLinear(); },
                select: function (where) { selectWhere(where); },
                setRegion: function (r) { S.region = r; },
                rename: function (name) { map.name = name; renamed(); }
            }
        };
    }
    // done? (looked at whenever the page is drawn again, so it ticks as soon as the map has it; the
    // step is part of what is watched, so a step done already when it starts shows it too)
    // What to do changes with the map: a step not done yet says what is left or what to put right
    // (its state), in place of its usual task
    function tourWatch() {
        const tr = S.tour, s = tr && tr.steps[tr.i];
        if (!s || !s.goal) return '';
        let done = false, state = null;
        if (!((s.creator && !creatorScope() && !s.closes) || (!map && !s.noMap))) {
            const env = tourEnv();
            try { done = !!s.goal(env, tr!.st); } catch (e) { done = false; }
            if (!done && s.state) { try { state = s.state(env, tr!.st); } catch (e) { state = null; } }
        }
        return JSON.stringify([tr!.i, done, state]);
    }
    function tourWatched(v: string) {
        const tr = S.tour;
        if (!tr || !v) { if (tr) { tr.done = false; tr.task = ''; } return; }
        const w = JSON.parse(v);
        tr.done = w[1];
        tr.task = w[2] ? stateText(tr.steps[w[0]], w[2]) : '';
    }
    function stateText(s: TourStep, state: { key: string; params?: Record<string, any>; nameOf?: string }) {
        const params: Record<string, any> = Object.assign({}, state.params);
        if (state.nameOf && params.name) params.name = t(state.nameOf + params.name);
        if (params.list) {
            params.list = params.list.map(function (id: string) { return t(params.listOf + id); }).join(t('admin.simBeta.listSep'));
        }
        // the step's own text, else the one the steps share (lessonState)
        let k = 'admin.simBeta.lesson.' + s.id + '.tasks.' + state.key, v = t(k, params);
        if (v === k) { k = 'admin.simBeta.lessonState.' + state.key; v = t(k, params); }
        return v === k ? '' : Keys.text(v);
    }
    // looked at each time the page is drawn again (and when the guide's own state changes)
    watch(function () { void tick.value; return tourWatch(); }, function (v) { tourWatched(v); });
    function tourTask() { return (S.tour && !S.tour.done && S.tour.task) || tourText('task'); }
    // a step in the room 4 creator while it is closed: it can be opened again from the card
    function tourCreatorClosed() {
        const s = tourStep();
        return !!s && !!s.creator && !s.closes && !creatorScope();
    }
    function tourFold() {
        const tr = S.tour;
        if (!tr) return;
        tr.compact = !tr.compact;
        tr.compactSet = true;
        later(function () { layoutTour(true); });
    }
    // a step on the editor while the room 4 creator covers it (opened by hand, or left open by a
    // guide in between): it is closed to go on
    function tourCreatorOver() {
        const s = tourStep();
        return !!s && !s.creator && s.id !== 'r4open' && !!creatorScope();
    }
    function tourCloseCreator() {
        const cr = creatorScope();
        if (cr) cr.closeRoom4();
        later(function () { if (S.tour) layoutTour(false); }, 450);
    }
    function tourOpenCreator() { openRoom4(); later(showTourStep, 500); }

    function tourDoIt() {
        const tr = S.tour!, s = tourStep();
        if (!s || !s.auto) return;
        const env = tourEnv();
        if ((s.creator && !s.closes && !env.creator) || (!map && !s.noMap)) return;
        if (s.creator || !map) { s.auto(env, tr.st); later(function () { layoutTour(true); }, 300); return; }
        begin();
        s.auto(env, tr.st);
        commit();
        changed();
        view.setMap(map, true);
        later(function () { layoutTour(true); }, 100);
    }
    function tourGo(d: number, skip?: boolean) {
        const tr = S.tour, s = tourStep();
        if (!tr) return;
        // in the lesson a step is done before the next (or passed over on purpose)
        if (d > 0 && tr.kind !== 'tour' && s!.goal && !tr.done && !skip) return;
        const i = tr.i + d;
        if (i < 0) return;
        if (i >= tr.steps.length) { endTour(); return; }
        tr.i = i;
        showTourStep();
    }
    function tourJump(i: number) {
        if (!S.tour || i === S.tour.i) return;
        S.tour.i = i;
        showTourStep();
    }
    function endTour() {
        const tr = S.tour;
        if (!tr) return;
        // a guide in between: back to the one it came from, at the step it was on (the creator closed
        // again when it was opened for the guide)
        if (tr.outer) {
            const cr = creatorScope();
            const outer = tr.outer;
            if (tr.openedCreator && cr) cr.closeRoom4();
            S.tour = outer.tour;
            tourKeep = outer.keep;
            S.tour.ready = false;
            cancel(tourTimer);
            later(function () { if (S.tour === outer.tour) showTourStep(); }, tr.openedCreator && cr ? 450 : 0);
            cancel(tourTick);
            if (S.tour.kind !== 'tour') tourTick = later(function tickFn() { if (!S.tour) return; layoutTour(true); tourTick = later(tickFn, 400); }, 400);
            return;
        }
        S.tour = null;
        cancel(tourTimer);
        cancel(tourTick);
        try { localStorage.setItem(TOUR_SEEN, '1'); } catch (e) { /* storage off */ }
        S.tourSeen = true;
        // the tour of the screen leaves the editor as it was; the lesson leaves the map as it is
        if (tr.kind === 'tour' && map && tourKeep) {
            setTool(tourKeep.made ? 'shape' : tourKeep.tool);
            ui.shapeMode = tourKeep.made ? 'outline' : tourKeep.shapeMode;
            ui.checksFolded = tourKeep.checksFolded;
            if (tourKeep.made) notify('newMapSize', null, 'info', 10000);
        }
        tourKeep = null;
    }

    function showTourStep() {
        const tr = S.tour!, s = tourStep()!;
        // the step left puts back what it changed for itself
        if (tr.left && tr.left !== s && tr.left.leave) { try { tr.left.leave(tourEnv()); } catch (e) { /* nothing to put back */ } }
        tr.left = s;
        // the tour of the screen needs a map past its first card: a new blank one, if none is open
        if (tr.kind === 'tour' && !map && s.id !== 'welcome') {
            newBlank();
            tourKeep!.made = true;
        }
        tr.st = markRaw({});
        if (map && s.tool) {
            setTool(s.tool);
            if (s.tool === 'shape') ui.shapeMode = s.mode || 'outline';
        }
        if (s.room) ui.room = s.room;
        if (s.floor) ui.floor = s.floor;
        if (s.victim) { ui.victim = s.victim; ui.fake = false; }
        if (s.checks) ui.checksFolded = false;
        const cr = creatorScope();
        if (cr && s.r4tool && cr.setTool) cr.setTool(s.r4tool);
        if (cr && s.showReach) cr.r4.showReach = true;
        if (cr && s.r4tool === 'erase') cr.r4.eraseTarget = s.eraseTokens ? 'tokens' : 'all';
        if (s.openMore) later(function () { const d = document.querySelector('.sim-r4-more') as HTMLDetailsElement | null; if (d) d.open = true; }, 60);
        if (s.enter && (map || s.noMap) && (!s.creator || cr)) { try { s.enter(tourEnv(), tr.st); } catch (e) { /* the step shows anyway */ } }
        tr.done = false;
        tr.task = '';
        tr.compact = false;
        tr.compactSet = false;
        tr.chapters = tourChapters();
        tr.ready = false;
        // laid out once the panels for the step are drawn (and again when the window changes)
        cancel(tourTimer);
        tourTimer = later(function () { layoutTour(false); }, 120);
    }

    // The lit parts and the card, in window pixels. again: a relayout while the step is shown (only
    // what moved changes)
    function layoutTour(again: boolean) {
        const tr = S.tour;
        if (!tr) return;
        const s = tourStep()!, vw = window.innerWidth, vh = window.innerHeight;
        // while the room 4 creator is open it covers the editor: only its own parts are lit
        const modal = creatorScope() ? document.querySelector('.sbx-r4-full') : null;
        const rectOf = function (sel?: string) {
            const el = sel && document.querySelector(sel);
            if (!el || (modal && !modal.contains(el))) return null;
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 ? T.pad(r, 6, vw, vh) : null;
        };
        const main = rectOf(s.target);
        const marks = (s.mark || []).map(function (m) { return rectOf(m); }).filter(Boolean) as Rect[];
        // the lesson's places on the map (tiles), and the lines to draw along
        const cv = canvas.getBoundingClientRect();
        const toWin = function (x: number, y: number) { const q = view.toPx(x, y); return [cv.left + q[0], cv.top + q[1]]; };
        const env = map ? tourEnv() : null;
        const regions = env && s.region && !s.creator && !modal ? s.region(env, tr.st).map(function (b) {
            const a = toWin(12 * b[0], 12 * b[1]), z = toWin(12 * (b[2] + 1), 12 * (b[3] + 1));
            return T.pad({ left: a[0], top: a[1], right: z[0], bottom: z[1] }, 3, vw, vh);
        }) : [];
        let guideLines = env && s.guide && !s.creator && !modal ? s.guide(env).map(function (line) {
            return line.map(function (p) { return toWin(p[0], p[1]); });
        }) : [];
        // in the room 4 creator: its lines are fractions of the picture
        const pic = modal && s.creator && s.r4guide ? modal.querySelector('canvas.r4-over') : null;
        if (pic) {
            const pr = pic.getBoundingClientRect();
            guideLines = s.r4guide!.map(function (line) {
                return line.map(function (f) { return [pr.left + f[0] * pr.width, pr.top + f[1] * pr.height]; });
            });
        }
        tr.guides = guideLines.map(function (line) { return line.map(function (p) { return p.join(','); }).join(' '); });
        // the card keeps clear of the lines too
        const guideBoxes = guideLines.map(function (line) {
            const xs = line.map(function (p) { return p[0]; }), ys = line.map(function (p) { return p[1]; });
            return T.pad({ left: Math.min.apply(null, xs), top: Math.min.apply(null, ys), right: Math.max.apply(null, xs), bottom: Math.max.apply(null, ys) }, 12, vw, vh);
        });
        const box = function (q: Rect) { return { left: q.left + 'px', top: q.top + 'px', width: (q.right - q.left) + 'px', height: (q.bottom - q.top) + 'px' }; };
        tr.lit = (main ? [main] : []).concat(marks, regions);
        tr.hole = main ? box(main) : null;
        tr.marks = marks.map(box);
        tr.regions = regions.map(box);
        const card = document.querySelector('.sbx-tour-card') as HTMLElement | null;
        const cw = card ? card.offsetWidth : 380, ch = card ? card.offsetHeight : 260;
        let at: { left: number; top: number };
        const inside = s.cardIn && rectOf(s.cardIn);
        if (inside) {
            at = { left: Math.max(12, inside.right - cw - 16), top: Math.max(12, inside.bottom - ch - 16) };
        } else if (regions.length || tr.guides.length) {
            // a step on the map: the card in a corner of the map that keeps the places (and the
            // panel) clear
            const stageOf = modal && s.creator ? modal.querySelector('.sim-r4-viewport')! : stageEl;
            const st = stageOf.getBoundingClientRect(), E = 14;
            const corners = [
                { left: st.right - cw - E, top: st.bottom - ch - E }, { left: st.left + E, top: st.bottom - ch - E },
                { left: st.left + E, top: st.top + E }, { left: st.right - cw - E, top: st.top + E }
            ];
            // the corner covering least of them (none, when one is free)
            const keep = regions.concat(guideBoxes, main && !(modal && s.creator) ? [main] : []);
            const covered = function (q: { left: number; top: number }) {
                return keep.reduce(function (sum, r) {
                    const w = Math.min(q.left + cw, r.right) - Math.max(q.left, r.left), h = Math.min(q.top + ch, r.bottom) - Math.max(q.top, r.top);
                    return sum + (w > 0 && h > 0 ? w * h : 0);
                }, 0);
            };
            at = corners.reduce(function (best, q) { return covered(q) < covered(best) ? q : best; }, corners[0]);
            // a small window: the card folds its text (title, what to do and the buttons stay) when it
            // would still cover the places; unfolded again from its head
            if (covered(at) > 0 && !tr.compact && !tr.compactSet) { tr.compact = true; later(function () { if (S.tour === tr) layoutTour(true); }); }
            at.left = Math.max(12, Math.min(vw - cw - 12, at.left));
            at.top = Math.max(12, Math.min(vh - ch - 12, at.top));
        } else {
            at = T.place(main, cw, ch, vw, vh, s.place, marks);
        }
        const next = { left: Math.round(at.left) + 'px', top: Math.round(at.top) + 'px' };
        if (!again || !tr.card || tr.card.left !== next.left || tr.card.top !== next.top) tr.card = next;
        tr.ready = true;
        // the card's height is known only once its text is in: placed again after that
        if (!again) later(function () { if (S.tour === tr) layoutTour(true); });
    }

    // ---- the window's events ----
    function listen() {
        window.addEventListener('resize', function () {
            if (!S.tour) return;
            cancel(tourTimer);
            tourTimer = later(function () { layoutTour(true); }, 150);
        });

        stageEl.addEventListener('dragover', function (e) { e.preventDefault(); });
        stageEl.addEventListener('drop', function (e) {
            e.preventDefault();
            const file = e.dataTransfer!.files[0];
            if (!file) return;
            apply(function () { whenDiscarded(function () { readFile(file); }); });
        });

        // The guide to look at only, and the guide's choice, take the keys before anything else (the
        // room 4 creator, a modal, would close on Esc): arrows and Enter go through the guide, Esc ends
        // it or closes the choice. The lesson leaves the keys to the editor, which is being used.
        window.addEventListener('keydown', function (e) {
            if (ui.guidePick) {
                e.preventDefault();
                e.stopPropagation();
                if (e.key === 'Escape') apply(closeGuidePick);
                return;
            }
            if (!tourLook()) return;
            e.preventDefault();
            e.stopPropagation();
            const go = ({ arrowright: 1, enter: 1, ' ': 1, arrowleft: -1 } as Record<string, number>)[e.key.toLowerCase()];
            if (go) apply(function () { tourGo(go); });
            else if (e.key === 'Escape') apply(endTour);
        }, true);

        window.addEventListener('keydown', function (e) {
            // a dialog takes the keys: Esc closes it, Enter takes its main (blue) action
            if (S.dialog) {
                if (e.key === 'Escape') { e.preventDefault(); apply(function () { closeDialog(null); }); }
                else if (e.key === 'Enter') {
                    e.preventDefault();
                    // never a destructive one: without a main action Enter does nothing
                    const main = S.dialog.actions.find(function (a) { return a.style === 'primary'; });
                    if (main) apply(function () { closeDialog(main.value); });
                }
                return;
            }
            // typing in a field keeps its keys (a slider or a check box does not: Ctrl+Z still undoes)
            const el = e.target as HTMLElement;
            if (/TEXTAREA|SELECT/.test(el.tagName) || (el.tagName === 'INPUT' && !/^(range|checkbox|radio|button)$/.test((el as HTMLInputElement).type))) return;
            if (!map) {
                if (e.key === '?' && !S.tour) { e.preventDefault(); apply(function () { openGuidePick('keys'); }); }
                return;
            }
            const k = e.key.toLowerCase();
            if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); apply(e.shiftKey ? redo : undo); return; }
            if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); apply(redo); return; }
            if (ui.tool === 'select') {
                const act = (e.ctrlKey || e.metaKey) ? ({ c: copyRegion, x: cutRegion, v: pasteRegion, d: duplicateRegion } as Record<string, () => void>)[k]
                    : ({ delete: clearRegion, backspace: clearRegion } as Record<string, () => void>)[k];
                if (act) { e.preventDefault(); apply(act); return; }
                const arrow = ({ arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] } as Record<string, number[]>)[k];
                if (arrow && S.region && !e.ctrlKey && !e.metaKey) { e.preventDefault(); apply(function () { nudgeRegion(arrow[0], arrow[1]); }); return; }
                if (k === 'escape') { apply(function () { S.region = null; view.redraw(); }); return; }
            }
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            if (e.key === '?') { e.preventDefault(); apply(function () { openGuidePick('keys'); }); return; }
            if (k === 'escape') { apply(cancelStroke); return; }
            const tool = tools.find(function (x) { return x.key.toLowerCase() === k; });
            if (tool) apply(function () { setTool(tool.id); });
        });

        window.addEventListener('beforeunload', function (e) {
            if (!dirty) return;
            e.preventDefault();
            e.returnValue = '';
        });
    }

    // what the page calls: each one draws the page again afterwards
    const act = function <A extends unknown[], R>(fn: (...args: A) => R) {
        return function (...args: A): R { return apply(function () { return fn(...args); }); };
    };

    return {
        S: S,
        mount: mount,
        fileChosen: fileChosen,
        canvasDblClick: canvasDblClick,
        room4Gone: room4Gone,
        // read while drawing the page
        changeRules: act(changeRules), ctLetter: ctLetter, isTarget: isTarget, symbolOf: symbolOf, faceOf: faceOf, colorOf: colorOf, victimFace: victimFace, pickerRings: pickerRings, ringColor: ringColor, ctSum: ctSum, victimSymbol: victimSymbol,
        targetStyle: targetStyle, toolKey: function (id: string) { return (byId(id) || {} as Tool).key; },
        linearNoStart: linearNoStart, linearUnreached: linearUnreached, room4State: room4State, canFixAll: canFixAll,
        regionSize: regionSize, toolHint: toolHint, room4Ready: room4Ready, tourLook: tourLook, tourStep: tourStep,
        tourText: tourText, tourLines: tourLines, tourTask: tourTask, tourCreatorClosed: tourCreatorClosed,
        tourCreatorOver: tourCreatorOver,
        // what the page does
        pickVictim: act(pickVictim), pickCt: act(pickCt), setRing: act(setRing), pickColor: act(pickColor), randomCode: act(randomCode),
        undo: act(undo), redo: act(redo), toggleLinear: act(toggleLinear), closeDialog: act(closeDialog), dialogItem: act(dialogItem),
        newMap: act(newMap), saveJson: act(saveJson), exportWorld: act(exportWorld), openRoom4: act(openRoom4),
        closeRoom4: closeRoom4, showProblem: act(showProblem), fixProblem: act(fixProblem), fixAll: act(fixAll),
        pointProblem: act(pointProblem), restoreKept: act(restoreKept), keptOtherYear: keptOtherYear, resize: act(resize), setSize: act(setSize), toCustomRoom4: act(toCustomRoom4),
        renamed: act(renamed), zoomIn: act(zoomIn), zoomOut: act(zoomOut), fit: act(fit), setTool: act(setTool),
        copyRegion: act(copyRegion), cutRegion: act(cutRegion), clearRegion: act(clearRegion), pasteRegion: act(pasteRegion),
        duplicateRegion: act(duplicateRegion), selectNone: act(selectNone), changeSelected: act(changeSelected), moveSelected: act(moveSelected), slideSelected: act(slideSelected), slideDone: act(slideDone), selectedRange: selectedRange, offsetText: offsetText,
        removeSelected: act(removeSelected), switchLang: act(switchLang), openGuidePick: act(openGuidePick),
        closeGuidePick: act(closeGuidePick), pickGuide: act(pickGuide), startTour: act(startTour), startRoom4Tour: act(startRoom4Tour),
        tourRoom4Inside: act(tourRoom4Inside), tourFold: act(tourFold), tourCloseCreator: act(tourCloseCreator),
        tourOpenCreator: act(tourOpenCreator), tourDoIt: act(tourDoIt), tourGo: act(tourGo), tourJump: act(tourJump), endTour: act(endTour)
    };
}

export type Editor = ReturnType<typeof createEditor>;
