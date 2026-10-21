<script setup lang="ts">
// The custom room 4 creator, in a modal over the editor. The room is a picture: the world export
// reads black pixels as walls and red blobs as wall tokens; victims are stamps (see lib/room4). The
// tools only draw on the picture (canvas.ts); the panels here choose how.
import { computed, markRaw, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import * as Icons from '../lib/icons';
import * as Keys from '../lib/keys';
import { t } from '../i18n';
import { tick } from '../editor/runtime';
import type { Editor } from '../editor/editor';
import CtRings from '../components/CtRings.vue';
import LangMenu from '../components/LangMenu.vue';
import RotationDial from '../components/RotationDial.vue';
import VictimGlyph from '../components/VictimGlyph.vue';
import { mountCanvas } from './canvas';
import { scopeTools, type CreatorScope, type R4State, type StampType, type ShapeIcon } from './scope';
import * as FaIcons from './faIcons';

const props = defineProps<{ editor: Editor }>();
const E = props.editor;
const host = E.S.room4!.host;

const r4 = reactive<R4State>({
    tool: 'pen',
    floor: host.room4FloorKinds.length ? host.room4FloorKinds[0].id : 'clear',
    stamp: -1,
    snap: true,
    eraser: 'm',
    eraseTarget: 'all',     // 'all' or 'tokens' (victims only, walls stay)
    showReach: true,        // tint where the robot cannot get to
    mirror: 'none',         // 'none', 'x' (left / right), 'y' (top / bottom) or 'xy'
    smooth: true,           // curve tool: smooth curve or straight segments
    sides: 6,               // polygon tool
    shapeSource: 'icon',    // shape tool: 'icon' (Font Awesome) or 'picture'
    shapeStyle: 'fill',     // 'fill' or 'outline'
    shapeRot: 0,
    shapeReady: false,
    shapePreview: '',
    shapeName: '',
    iconQuery: '',
    iconCategory: '',
    unreachCount: 0,
    showGuides: true,       // entrances and checkpoints from the map
    zoom: 1,                // 1 = the whole picture fits the view
    zoomPct: 100,
    panning: false,
    hasSelection: false,
    hasClip: false,
    randomCount: 5,
    randomMode: 'current',  // 'current' (the chosen type) or 'mixed' (a type picked for each)
    template: 'maze',
    templateClear: true,
    messageParams: {},
    entranceCount: 0,
    passageCount: 0,
    missingCheckpoints: 0,
    reachState: '',         // '', 'ok', 'noStart', 'loading' (OpenCV) or 'unavailable'
    canUndo: false,
    canRedo: false,
    summary: [],
    tokenCount: 0,
    farCount: 0,
    message: '',
    // How a stamp is placed, as the victims of the map editor: a turn (or random) for letter
    // victims, the ring code for a cognitive target. Kept per stamp in the host's room4Tokens.
    rings: 'GYYKG'.split(''),
    ring: 0,
    rot: 0,
    randomRot: true,
    sel: null                // the stamp clicked on: { cx, cy, idx, rot, code }
});
const ringColors = Icons.RING_LIST;

// filled in by the picture (canvas.ts)
const r4api: Record<string, (...args: any[]) => any> = markRaw({});

const stampTypes: StampType[] = host.room4StampTypes || [];
if (stampTypes.length) r4.stamp = stampTypes[0].idx;
// Palette groups, each with rows: fake victims are a kind of letter victim, so they are the
// second row of that group; the fake target goes with the cognitive targets
const ofKind = function (kinds: string[]) {
    return stampTypes.filter(function (x) { return kinds.indexOf(x.kind) > -1; });
};
const stampGroups = [
    { kind: 'victim', rows: [{ label: 'real' as string | undefined, types: ofKind(['victim']) }, { label: 'fake' as string | undefined, types: ofKind(['fake']) }] },
    { kind: 'ct', rows: [{ label: undefined as string | undefined, types: ofKind(['ct', 'fakect']) }] },
    { kind: 'hazmat', rows: [{ label: undefined as string | undefined, types: ofKind(['hazmat']) }] }
].map(function (g) {
    g.rows = g.rows.filter(function (r) { return r.types.length; });
    if (g.rows.length < 2) g.rows.forEach(function (r) { delete r.label; });
    return g;
}).filter(function (g) { return g.rows.length; });

const tools = [
    { id: 'select', icon: 'fas fa-mouse-pointer', key: 'S' },
    { id: 'template', icon: 'fas fa-th-large', key: 'T' },
    { id: 'pen', icon: 'fas fa-pen', key: 'P' },
    { id: 'line', icon: 'fas fa-slash', key: 'L' },
    { id: 'curve', icon: 'fas fa-bezier-curve', key: 'B' },
    { id: 'arc', icon: 'fas fa-circle-notch', key: 'A' },
    { id: 'rect', icon: 'far fa-square', key: 'R' },
    { id: 'circle', icon: 'far fa-circle', key: 'C' },
    { id: 'ellipse', icon: 'far fa-dot-circle', key: 'O' },
    { id: 'polygon', icon: 'fas fa-draw-polygon', key: 'G' },
    { id: 'shape', icon: 'fas fa-icons', key: 'I' },
    { id: 'erase', icon: 'fas fa-eraser', key: 'E' },
    { id: 'floor', icon: 'fas fa-fill-drip', key: 'F' },
    { id: 'stamp', icon: 'fas fa-user-injured', key: 'V' }
];
// The rail groups the tools in the order of the map editor's rail: looking (select), the room's
// layout (templates, as the map editor's map and rooms), walls (lines, then shapes and the eraser)
// and floors and victims
const byId: Record<string, (typeof tools)[number]> = {};
tools.forEach(function (x) { byId[x.id] = x; });
const toolGroups = [['select'], ['template'], ['pen', 'line', 'curve', 'arc'], ['rect', 'circle', 'ellipse', 'polygon', 'shape', 'erase'], ['floor', 'stamp']]
    .map(function (g) { return g.map(function (id) { return byId[id]; }); });
function toolKey(id: string) {
    return byId[id] ? byId[id].key : '';
}
// Tools that draw walls (mirror drawing applies to them)
function drawsWalls() {
    return ['stamp', 'floor', 'select', 'template'].indexOf(r4.tool) < 0;
}
const templates = [
    { id: 'maze', icon: 'fas fa-border-all' },
    { id: 'pillars', icon: 'fas fa-braille' },
    { id: 'diagonal', icon: 'fas fa-slash' },
    { id: 'zigzag', icon: 'fas fa-wave-square' },
    { id: 'rings', icon: 'far fa-dot-circle' },
    { id: 'obstacles', icon: 'fas fa-shapes' }
];
// The floor tool's floors, as the map editor's floor tool has them (a whole tile each, as Erebus
// has them in room 4 too); no start tile, which is not in room 4
const floorChoices = host.room4FloorKinds.map(function (k) { return { id: k.id, icon: k.icon }; })
    .concat([{ id: 'clear', icon: 'fa-times' }]);
function stepCount(d: number) {
    r4.randomCount = Math.max(1, Math.min(30, (r4.randomCount || 1) + d));
}

// ---- Font Awesome icons for the shape tool (the free set's metadata, loaded on first use) ----
const icons = reactive({ loaded: false, loading: false, failed: false, all: [] as FaIcons.Icon[], byName: {} as Record<string, FaIcons.Icon>, categories: [] as FaIcons.Category[] });
function loadIcons() {
    if (icons.loaded || icons.loading) return;
    icons.loading = true;
    FaIcons.loadIcons().then(function (res) {
        scope.$applyAsync(function () {
            icons.all = markRaw(res.all);
            icons.byName = markRaw(res.byName);
            icons.categories = res.categories;
            icons.loaded = true;
            icons.loading = false;
        });
    }).catch(function () {
        scope.$applyAsync(function () { icons.failed = true; icons.loading = false; });
    });
}
const iconResults = computed(function () { return FaIcons.iconResults(icons, r4.iconQuery, r4.iconCategory); });

// an icon by its name only (the guide's "do it for me"): its code point from the list first, as the
// shape is drawn with the font
function pickIcon(i: ShapeIcon) {
    if (!i.unicode) {
        FaIcons.loadIcons().then(function (res) { if (res.byName[i.name]) pickIcon(res.byName[i.name]); })
            .catch(function () { r4.message = 'iconFailed'; });
        return;
    }
    r4.shapeName = i.name;
    r4.shapeReady = false;
    r4api.useIcon(i);
}

watch(function () { return r4.tool; }, function (tool) {
    if (tool === 'shape') loadIcons();
}, { immediate: true });

function setTool(id: string) {
    r4.tool = id;
    r4.message = '';
}

function rotateShape(deg: number) {
    r4.shapeRot = (((r4.shapeRot || 0) + deg) % 360 + 360) % 360;
}

function setStamp(idx: number) {
    r4.stamp = idx;
    setTool('stamp');
    // a cognitive target type gives random rings of it, unless the rings are of it already
    const letter = ctLetterOf(idx);
    if (letter && Icons.typeOf(r4.rings.join('')) !== letter) randomCode(letter);
}

// The cognitive target type letter (F P C O, X fake) of a stamp type, or null for a letter victim
function ctLetterOf(idx: number) {
    const x = stampType(idx);
    if (!x || (x.kind !== 'ct' && x.kind !== 'fakect')) return null;
    return x.kind === 'fakect' ? 'X' : x.symbol;
}
function ctIdxOf(letter: string) {
    const x = stampTypes.find(function (s) {
        return letter === 'X' ? s.kind === 'fakect' : s.kind === 'ct' && s.symbol === letter;
    });
    return x ? x.idx : null;
}
function isLetterVictim(idx: number) {
    const x = stampType(idx);
    return !!x && (x.kind === 'victim' || x.kind === 'fake');
}
function randomCode(letter: string) {
    r4.rings = host.room4Target.randomCode(letter).split('');
}
function ringSum(rings: string[]) { return Icons.ringSum(rings); }
function ringLetter(rings: string[]) { return Icons.typeOf(rings.join('')); }
function targetStyle(code: string | null, idx: number) {
    const x = stampType(idx);
    return { background: Icons.targetBackground(code, x ? x.color : Icons.TYPE[Icons.typeOf(code)]) };
}

// the ring picked on the target takes the colour, and the next ring is picked; the stamp type
// follows the type of the rings
function pickColor(c: string) {
    const sel = r4.sel;
    const rings = sel ? sel.code!.split('') : r4.rings;
    rings[r4.ring] = c;
    r4.ring = (r4.ring + 1) % 5;
    const idx = ctIdxOf(Icons.typeOf(rings.join('')));
    if (sel) { r4api.changeSel({ code: rings.join(''), idx: idx }); return; }
    if (idx !== null) r4.stamp = idx;
}
function setSelRot(rot: number) { r4api.changeSel({ rot: rot }); }
function setSelRandomRot(random: boolean) { r4api.changeSel({ rot: random ? null : 0 }); }
function removeSel() { r4api.removeSel(); }

function stampType(idx: number) {
    return stampTypes.find(function (x) { return x.idx === idx; });
}

function closeRoom4() {
    E.closeRoom4();
}
// key names as this computer has them
const keyName = Keys.text;

// the picture file of the dialog, and the shape tool's picture
function importFile(e: Event) {
    const file = (e.target as HTMLInputElement).files && (e.target as HTMLInputElement).files![0];
    scope.$apply(function () { r4api.importFile(file); });
}
function shapeFile(e: Event) {
    const file = (e.target as HTMLInputElement).files && (e.target as HTMLInputElement).files![0];
    scope.$apply(function () {
        r4.shapeName = file ? file.name : '';
        r4.shapeReady = false;
        r4api.useShapeFile(file);
    });
}
function clearValue(e: Event) { (e.target as HTMLInputElement).value = ''; }

// what the picture sees of the creator
const kit = scopeTools(function () { return { r4: r4 }; });
const scope: CreatorScope = Object.assign(kit, {
    r4: r4,
    r4api: r4api,
    host: host,
    stampTypes: stampTypes,
    tools: tools,
    // tips drawn next to a token under the pointer
    get r4tips() {
        return {
            stamp: t('room4.tipStamp'), other: t('room4.tipOther'),
            curve: t('room4.tipCurve'), arc: t('room4.tipArc')
        };
    },
    ctLetterOf: ctLetterOf,
    setTool: setTool,
    pickIcon: pickIcon
});

const stage = ref<HTMLElement | null>(null);
onMounted(function () {
    mountCanvas(scope, stage.value!);
    kit.start();
    // the guide sees the creator through this
    E.S.creator = markRaw({ r4: r4, r4api: r4api, setTool: setTool, closeRoom4: closeRoom4 });
});
onBeforeUnmount(function () {
    kit.destroy();
    E.S.creator = null;
});
</script>

<template>
  <template v-if="tick > -1">
    <div class="modal-header modal-header">
      <h3 class="modal-title"><i class="fas fa-paint-brush"></i>{{ t('room4.title') }}</h3>
      <button class="btn btn-primary r4-head-ok" type="button" @click="closeRoom4()"><i class="fas fa-check mr-1"></i>OK</button>
    </div>
    <div class="modal-body modal-body">
      <div class="r4">
        <!-- Tool rail: icons only, grouped; the name and key are in the tooltip -->
        <nav class="r4-rail" role="toolbar">
          <div class="r4-rail-group" v-for="(group, gi) in toolGroups" :key="gi">
            <button type="button" class="r4-rail-tool" v-for="x in group" :key="x.id" :data-tool="x.id" :class="{ active: r4.tool === x.id }" @click="setTool(x.id)" :title="t('room4.tools.' + x.id) + ' (' + x.key + ')'">
              <i :class="x.icon"></i><span class="r4-rail-key">{{ x.key }}</span>
            </button>
          </div>
        </nav>

        <!-- Options of the chosen tool only -->
        <aside class="r4-panel">
          <div class="r4-panel-head">
            <span class="r4-panel-title">{{ t('room4.tools.' + r4.tool) }}</span>
            <kbd class="r4-key">{{ toolKey(r4.tool) }}</kbd>
          </div>

          <!-- Victim stamps -->
          <div class="r4-stamps" v-if="r4.tool === 'stamp'">
            <div class="r4-stamp-group" v-for="g in stampGroups" :key="g.kind">
              <span class="r4-stamp-group-label">{{ t('room4.groups.' + g.kind) }}</span>
              <div class="r4-stamp-row" v-for="(row, ri) in g.rows" :key="ri" :class="g.kind === 'victim' ? 'cols-3' : 'cols-2'">
                <span class="r4-stamp-row-label" v-if="row.label">{{ t('room4.rows.' + row.label) }}</span>
                <button type="button" class="r4-stamp" v-for="x in row.types" :key="x.idx" :class="['kind-' + x.kind, { active: r4.stamp === x.idx }]" @click="setStamp(x.idx)" :title="t(x.name)" :style="{ '--stamp-color': x.color }">
                  <span class="r4-stamp-badge"><VictimGlyph :symbol="x.symbol" :face="x.face" :color="x.color" :hollow="x.kind === 'fake'"></VictimGlyph></span><span class="r4-stamp-name">{{ t(x.name) }}</span>
                </button>
              </div>
            </div>
            <!-- How the next stamp is placed, as the victims of the map editor: rings of a cognitive target, or the turn -->
            <div class="r4-place" v-if="!r4.sel && r4.stamp >= 0">
              <div v-if="ctLetterOf(r4.stamp)">
                <CtRings :rings="r4.rings" :ring="r4.ring" :colors="ringColors" :letter="ringLetter(r4.rings)" :sum="ringSum(r4.rings)" @pick-ring="(i: number) => r4.ring = i" @pick-color="pickColor"></CtRings>
              </div>
              <div v-if="isLetterVictim(r4.stamp)">
                <div class="ed-label">{{ t('victims.turn.title') }}</div>
                <div class="ed-seg">
                  <button type="button" :class="{ active: !r4.randomRot }" @click="r4.randomRot = false"><i class="fas fa-compass mr-1"></i>{{ t('victims.turn.fixed') }}</button>
                  <button type="button" :class="{ active: r4.randomRot }" @click="r4.randomRot = true"><i class="fas fa-dice mr-1"></i>{{ t('victims.turn.random') }}</button>
                </div>
                <p class="ed-rot-note" v-if="r4.randomRot">{{ t('victims.turn.randomNote') }}</p>
                <RotationDial class="ed-dial" v-if="!r4.randomRot" v-model="r4.rot" :symbol="stampType(r4.stamp)?.symbol" :face="stampType(r4.stamp)?.face" :mark="ctLetterOf(r4.stamp) ? stampType(r4.stamp)?.color : null"></RotationDial>
              </div>
            </div>

            <!-- The stamp clicked on: its rings or its turn -->
            <div class="r4-selected" v-if="r4.sel">
              <div class="r4-selected-head">
                <span><i class="fas fa-mouse-pointer mr-1"></i>{{ t('room4.selectedStamp') }}</span>
                <button type="button" class="btn btn-sm btn-link p-0" @click="r4.sel = null">{{ t('room4.selectDone') }}</button>
              </div>
              <div class="ed-sel-head mt-2">
                <span class="ed-sel-symbol target" v-if="ctLetterOf(r4.sel.idx)" :style="targetStyle(r4.sel.code, r4.sel.idx)"></span>
                <span class="ed-sel-symbol" v-if="!ctLetterOf(r4.sel.idx)" :class="{ fake: stampType(r4.sel.idx)?.kind === 'fake' }" :style="{ '--victim-color': stampType(r4.sel.idx)?.color }"><VictimGlyph :symbol="stampType(r4.sel.idx)?.symbol" :face="stampType(r4.sel.idx)?.face" :color="stampType(r4.sel.idx)?.color" :hollow="stampType(r4.sel.idx)?.kind === 'fake'"></VictimGlyph></span>
                <span>{{ stampType(r4.sel.idx) ? t(stampType(r4.sel.idx)!.name) : '' }}</span>
              </div>
              <div v-if="ctLetterOf(r4.sel.idx)">
                <CtRings :rings="(r4.sel.code || '').split('')" :ring="r4.ring" :colors="ringColors" :letter="ringLetter((r4.sel.code || '').split(''))" :sum="ringSum((r4.sel.code || '').split(''))" @pick-ring="(i: number) => r4.ring = i" @pick-color="pickColor"></CtRings>
              </div>
              <div v-if="isLetterVictim(r4.sel.idx)">
                <div class="ed-label">{{ t('victims.turn.title') }}</div>
                <div class="ed-seg">
                  <button type="button" :class="{ active: r4.sel.rot !== null }" @click="r4.sel.rot === null && setSelRandomRot(false)"><i class="fas fa-compass mr-1"></i>{{ t('victims.turn.fixed') }}</button>
                  <button type="button" :class="{ active: r4.sel.rot === null }" @click="setSelRandomRot(true)"><i class="fas fa-dice mr-1"></i>{{ t('victims.turn.random') }}</button>
                </div>
                <p class="ed-rot-note" v-if="r4.sel.rot === null">{{ t('victims.turn.randomNote') }}</p>
                <RotationDial class="ed-dial" v-if="r4.sel.rot !== null" :model-value="r4.sel.rot" @update:model-value="(v: number) => r4.sel!.rot = v" @change="setSelRot(r4.sel!.rot!)" :symbol="stampType(r4.sel.idx)?.symbol" :face="stampType(r4.sel.idx)?.face" :mark="ctLetterOf(r4.sel.idx) ? stampType(r4.sel.idx)?.color : null"></RotationDial>
              </div>
              <button type="button" class="btn btn-sm btn-outline-danger btn-block mt-3" @click="removeSel()"><i class="fas fa-trash-alt mr-1"></i>{{ t('common.remove') }}</button>
            </div>

            <!-- Place several stamps at once along walls the robot can reach -->
            <details class="r4-more">
              <summary><i class="fas fa-dice"></i>{{ t('room4.randomPlace') }}</summary>
              <div class="r4-random-body">
                <!-- one grid for both fields: the names' column as wide as the longer name -->
                <div class="r4-random-fields">
                <div class="r4-random-field">
                  <span class="r4-random-label">{{ t('room4.randomCount') }}</span>
                  <div class="r4-stepper">
                    <button type="button" @click="stepCount(-1)" :disabled="r4.randomCount <= 1" :aria-label="'-1'"><i class="fas fa-minus"></i></button>
                    <output>{{ r4.randomCount }}</output>
                    <button type="button" @click="stepCount(1)" :disabled="r4.randomCount >= 30" :aria-label="'+1'"><i class="fas fa-plus"></i></button>
                  </div>
                </div>
                <div class="r4-random-field">
                  <span class="r4-random-label">{{ t('room4.randomKind') }}</span>
                  <div class="ed-seg">
                    <button type="button" v-for="m in ['current', 'mixed']" :key="m" :class="{ active: r4.randomMode === m }" @click="r4.randomMode = m">{{ t('room4.randomModes.' + m) }}</button>
                  </div>
                </div>
                </div>
                <button type="button" class="btn btn-sm btn-primary btn-block r4-random-go" @click="r4api.randomStamps(r4.randomCount, r4.randomMode)"><i class="fas fa-dice mr-1"></i>{{ t('room4.randomGo', { n: r4.randomCount }) }}</button>
                <p class="r4-note">{{ t('room4.randomNote2') }}</p>
              </div>
            </details>
          </div>

          <!-- Selection: move, turn, flip, copy -->
          <div class="r4-sel-buttons" v-if="r4.tool === 'select'">
            <button type="button" class="r4-icon" @click="r4api.selection('ccw')" :disabled="!r4.hasSelection" :title="t('room4.sel.ccw') + ' ( [ )'"><i class="fas fa-undo"></i></button>
            <button type="button" class="r4-icon" @click="r4api.selection('cw')" :disabled="!r4.hasSelection" :title="t('room4.sel.cw') + ' ( ] )'"><i class="fas fa-redo"></i></button>
            <button type="button" class="r4-icon" @click="r4api.selection('h')" :disabled="!r4.hasSelection" :title="t('room4.sel.h')"><i class="fas fa-arrows-alt-h"></i></button>
            <button type="button" class="r4-icon" @click="r4api.selection('v')" :disabled="!r4.hasSelection" :title="t('room4.sel.v')"><i class="fas fa-arrows-alt-v"></i></button>
            <button type="button" class="r4-icon" @click="r4api.selection('duplicate')" :disabled="!r4.hasSelection" :title="t('room4.sel.duplicate') + ' (' + keyName('Ctrl+D') + ')'"><i class="far fa-clone"></i></button>
            <button type="button" class="r4-icon" @click="r4api.selection('copy')" :disabled="!r4.hasSelection" :title="t('room4.sel.copy') + ' (' + keyName('Ctrl+C') + ')'"><i class="far fa-copy"></i></button>
            <button type="button" class="r4-icon" @click="r4api.selection('paste')" :disabled="!r4.hasClip" :title="t('room4.sel.paste') + ' (' + keyName('Ctrl+V') + ')'"><i class="fas fa-paste"></i></button>
            <button type="button" class="r4-icon danger" @click="r4api.selection('delete')" :disabled="!r4.hasSelection" :title="t('room4.sel.delete') + ' (Delete)'"><i class="fas fa-trash-alt"></i></button>
            <button type="button" class="r4-icon" @click="r4api.selection('drop')" :disabled="!r4.hasSelection" :title="t('room4.sel.drop') + ' (Enter)'"><i class="fas fa-check"></i></button>
          </div>

          <!-- Templates -->
          <div class="r4-templates" v-if="r4.tool === 'template'">
            <div class="r4-template-grid">
              <button type="button" class="r4-template" v-for="x in templates" :key="x.id" :class="{ active: r4.template === x.id }" @click="r4.template = x.id" :title="t('room4.templateHints.' + x.id)">
                <i :class="x.icon"></i>
                <span class="r4-template-name">{{ t('room4.templates.' + x.id) }}</span>
              </button>
            </div>
            <label class="r4-switch">
              <input type="checkbox" v-model="r4.templateClear">
              <span class="r4-switch-track"></span>
              {{ t('room4.templateClear') }}
            </label>
            <button type="button" class="btn btn-sm btn-primary rounded-pill" @click="r4api.applyTemplate(r4.template, r4.templateClear)"><i class="fas fa-magic mr-1"></i>{{ t('room4.templateApply') }}</button>
          </div>

          <!-- Shape tool: a Font Awesome icon or a picture, drawn as walls -->
          <div class="r4-shape" v-if="r4.tool === 'shape'">
            <div class="r4-seg r4-seg-full">
              <button type="button" :class="{ active: r4.shapeSource === 'icon' }" @click="r4.shapeSource = 'icon'"><i class="fas fa-icons mr-1"></i>{{ t('room4.shapeIcon') }}</button>
              <button type="button" :class="{ active: r4.shapeSource === 'picture' }" @click="r4.shapeSource = 'picture'"><i class="far fa-image mr-1"></i>{{ t('room4.shapePicture') }}</button>
            </div>
            <div class="r4-shape-icons" v-if="r4.shapeSource === 'icon'">
              <input type="search" class="form-control form-control-sm" v-model.trim="r4.iconQuery" :placeholder="t('room4.iconSearch')">
              <select class="custom-select custom-select-sm" v-model="r4.iconCategory">
                <option value="">{{ t('room4.iconAll') }}</option>
                <option v-for="c in icons.categories" :key="c.id" :value="c.id">{{ c.label }}</option>
              </select>
              <div class="r4-icon-grid" v-if="icons.loaded">
                <button type="button" v-for="i in iconResults" :key="i.name" :class="{ active: r4.shapeName === i.name }" @click="pickIcon(i)" :title="i.label"><i :class="FaIcons.iconClass(i)"></i></button>
              </div>
              <div class="r4-note" v-if="icons.loading"><i class="fas fa-spinner fa-spin mr-1"></i>{{ t('room4.iconLoading') }}</div>
              <div class="r4-note" v-if="icons.failed">{{ t('room4.iconUnavailable') }}</div>
              <div class="r4-note" v-if="icons.loaded && !iconResults.length">{{ t('room4.iconNone') }}</div>
            </div>
            <div class="r4-shape-picture" v-if="r4.shapeSource === 'picture'">
              <label class="btn btn-sm btn-outline-primary rounded-pill mb-0" :title="t('room4.pictureNote')">
                <i class="far fa-image mr-1"></i>{{ t('room4.pictureChoose') }}
                <input type="file" accept="image/png, image/svg+xml, image/jpeg, image/gif, image/webp" @click="clearValue" @change="shapeFile" hidden />
              </label>
            </div>
            <div class="r4-option-row">
              <div class="r4-shape-current" v-if="r4.shapePreview">
                <img :src="r4.shapePreview" alt="" :style="{ transform: 'rotate(' + r4.shapeRot + 'deg)' }">
              </div>
              <div class="r4-seg">
                <button type="button" v-for="m in ['fill', 'outline']" :key="m" :class="{ active: r4.shapeStyle === m }" @click="r4.shapeStyle = m">{{ t('room4.shapeStyles.' + m) }}</button>
              </div>
              <div class="r4-seg">
                <button type="button" @click="rotateShape(-90)" title="-90°"><i class="fas fa-undo"></i></button>
                <button type="button" disabled>{{ r4.shapeRot }}°</button>
                <button type="button" @click="rotateShape(90)" title="+90°"><i class="fas fa-redo"></i></button>
              </div>
            </div>
          </div>

          <div class="r4-option-row" v-if="r4.tool === 'curve'">
            <div class="r4-seg">
              <button type="button" :class="{ active: r4.smooth }" @click="r4.smooth = true">{{ t('room4.curveSmooth') }}</button>
              <button type="button" :class="{ active: !r4.smooth }" @click="r4.smooth = false">{{ t('room4.curveStraight') }}</button>
            </div>
          </div>
          <div class="r4-option-row" v-if="r4.tool === 'polygon'">
            <span class="r4-option-label">{{ t('room4.sides') }}</span>
            <div class="r4-seg">
              <button type="button" v-for="n in [3, 4, 5, 6, 8, 12]" :key="n" :class="{ active: r4.sides === n }" @click="r4.sides = n">{{ n }}</button>
            </div>
          </div>
          <div class="r4-option-row" v-if="r4.tool === 'erase'">
            <div class="r4-seg">
              <button type="button" v-for="m in ['all', 'tokens']" :key="m" :class="{ active: r4.eraseTarget === m }" @click="r4.eraseTarget = m">{{ t('room4.eraseTargets.' + m) }}</button>
            </div>
            <div class="r4-seg">
              <button type="button" v-for="s in ['s', 'm', 'l']" :key="s" :class="{ active: r4.eraser === s }" @click="r4.eraser = s" :title="t('room4.eraserSize')">{{ t('room4.size.' + s) }}</button>
            </div>
          </div>

          <!-- Drawing aids for the wall tools -->
          <div class="r4-aids" v-if="drawsWalls() || r4.tool === 'select'">
            <label class="r4-switch">
              <input type="checkbox" v-model="r4.snap">
              <span class="r4-switch-track"></span>
              {{ t('room4.snap') }}
            </label>
            <div class="r4-option-row" v-if="drawsWalls()">
              <span class="r4-option-label">{{ t('room4.mirror') }}</span>
              <div class="r4-seg">
                <button type="button" v-for="m in ['none', 'x', 'y', 'xy']" :key="m" :class="{ active: r4.mirror === m }" @click="r4.mirror = m" :title="t('room4.mirrors.' + m)">
                  <i :class="({ none: 'fas fa-ban', x: 'fas fa-arrows-alt-h', y: 'fas fa-arrows-alt-v', xy: 'fas fa-arrows-alt' } as Record<string, string>)[m]"></i>
                </button>
              </div>
            </div>
          </div>

          <!-- Floors of room 4's tiles -->
          <div class="ed-choices column" v-if="r4.tool === 'floor'">
            <button class="ed-choice" type="button" v-for="f in floorChoices" :key="f.id" :class="{ active: r4.floor === f.id }" @click="r4.floor = f.id">
              <i class="fas fa-fw" :class="f.icon"></i>{{ t('floors.' + f.id) }}
            </button>
          </div>

          <div class="r4-hint">
            <i class="fas fa-info-circle"></i>
            <span>{{ keyName(t('room4.hints.' + (r4.tool === 'erase' && r4.eraseTarget === 'tokens' ? 'eraseTokens' : r4.tool))) }}</span>
          </div>
        </aside>

        <div class="r4-main">
          <!-- History, what to show, and the picture file -->
          <div class="r4-topbar">
            <div class="r4-topbar-group">
              <button type="button" class="r4-icon" @click="scope.$apply(() => r4api.undo())" :disabled="!r4.canUndo" :title="t('room4.undo') + ' (' + keyName('Ctrl+Z') + ')'"><i class="fas fa-undo"></i></button>
              <button type="button" class="r4-icon" @click="scope.$apply(() => r4api.redo())" :disabled="!r4.canRedo" :title="t('room4.redo') + ' (' + keyName('Ctrl+Shift+Z') + ')'"><i class="fas fa-redo"></i></button>
              <button type="button" class="r4-icon danger" @click="scope.$apply(() => r4api.clear())" :title="t('room4.clear')"><i class="fas fa-trash-alt"></i></button>
            </div>
            <div class="r4-topbar-group">
              <button type="button" class="r4-chip" :class="{ on: r4.showReach }" @click="r4.showReach = !r4.showReach" :title="t('room4.showReach')">
                <i class="r4-legend-reach"></i>{{ t('room4.viewReach') }}
              </button>
              <button type="button" class="r4-chip" :class="{ on: r4.showGuides }" @click="r4.showGuides = !r4.showGuides" :title="t('room4.showGuides')">
                <i class="r4-legend-entrance"></i>{{ t('room4.viewGuides') }}
              </button>
            </div>
            <div class="r4-topbar-group r4-zoom">
              <button type="button" class="r4-icon" @click="r4api.zoom(-1)" :disabled="r4.zoom <= 1" :title="t('room4.zoomOut') + ' (' + keyName('Ctrl+-') + ')'"><i class="fas fa-search-minus"></i></button>
              <button type="button" class="r4-zoom-pct" @click="r4api.zoom(0)" :title="t('room4.zoomFit') + ' (' + keyName('Ctrl+0') + ')'">{{ r4.zoomPct }}%</button>
              <button type="button" class="r4-icon" @click="r4api.zoom(1)" :disabled="r4.zoom >= 8" :title="t('room4.zoomIn') + ' (' + keyName('Ctrl++') + ')'"><i class="fas fa-search-plus"></i></button>
              <button type="button" class="r4-icon" @click="r4api.zoom(0)" :title="t('room4.zoomFit') + ' (' + keyName('Ctrl+0') + ')'"><i class="fas fa-expand"></i></button>
            </div>
            <div class="r4-topbar-group">
              <label class="r4-icon mb-0" :title="t('room4.import') + ' — ' + t('room4.hint')">
                <i class="fas fa-file-import"></i>
                <input type="file" accept="image/png, image/jpeg" @click="clearValue" @change="importFile" hidden />
              </label>
              <button type="button" class="r4-icon" @click="r4api.download()" :title="t('room4.download')"><i class="fas fa-download"></i></button>
            </div>
          </div>

          <!-- Scrolling view: the picture is sized by the zoom -->
          <div class="r4-viewport" :class="{ panning: r4.panning }">
            <div class="r4-stage" ref="stage" :class="'tool-' + r4.tool">
              <canvas class="r4-main"></canvas>
              <canvas class="r4-over"></canvas>
            </div>
          </div>

          <div class="r4-message" v-if="r4.message">
            <i class="fas fa-info-circle"></i>{{ t('room4.messages.' + r4.message, r4.messageParams) }}
          </div>

          <!-- One status line: tokens, warnings, notes about the views -->
          <div class="r4-status">
            <span class="r4-summary-title"><i class="fas fa-user-injured"></i>{{ t('room4.tokens', { count: r4.tokenCount }) }}</span>
            <span class="r4-summary-chip" v-for="s in r4.summary" :key="s.idx" :class="stampType(s.idx) ? 'kind-' + stampType(s.idx)!.kind : 'kind-random'" :style="{ '--stamp-color': stampType(s.idx)?.color }">
              <span class="r4-stamp-badge"><VictimGlyph :symbol="stampType(s.idx) ? stampType(s.idx)!.symbol : '?'" :face="stampType(s.idx)?.face" :color="stampType(s.idx)?.color" :hollow="stampType(s.idx)?.kind === 'fake'"></VictimGlyph></span>× {{ s.count }}
            </span>
            <span class="r4-summary-warn" v-if="r4.unreachCount" :title="t('room4.unreachable', { count: r4.unreachCount })"><i class="fas fa-exclamation-circle"></i>{{ t('room4.unreachableShort', { count: r4.unreachCount }) }}</span>
            <span class="r4-summary-warn" v-if="r4.farCount" :title="t('room4.farFromWall', { count: r4.farCount })"><i class="fas fa-exclamation-circle"></i>{{ t('room4.farShort', { count: r4.farCount }) }}</span>
            <span class="r4-summary-warn" v-if="r4.showGuides && r4.missingCheckpoints" :title="t('room4.missingCheckpoints', { count: r4.missingCheckpoints })"><i class="fas fa-flag-checkered"></i>{{ t('room4.missingShort', { count: r4.missingCheckpoints }) }}</span>
            <span class="r4-summary-warn" v-if="r4.showGuides && !r4.entranceCount" :title="t('room4.noEntrance')"><i class="fas fa-door-closed"></i>{{ t('room4.noEntranceShort') }}</span>
            <span class="r4-status-note" v-if="r4.showReach && (r4.reachState === 'noStart' || r4.reachState === 'noSeed' || r4.reachState === 'unavailable')" :title="t('room4.reach.' + r4.reachState)"><i class="fas fa-info-circle"></i>{{ t('room4.reachOff') }}</span>
            <!-- the guide and the language, at the right end as in the editor -->
            <span class="r4-status-tools">
              <LangMenu :lang="E.S.lang" @pick="E.switchLang"></LangMenu>
              <button type="button" class="ed-status-btn ed-tour-btn r4-help" @click="E.startRoom4Tour()" :title="t('guide.room4.name')"><i class="far fa-question-circle"></i><span>{{ t('guide.short') }}</span></button>
            </span>
            <span class="r4-status-legend">
              <span v-if="r4.showReach"><i class="r4-legend-reach"></i>{{ t('room4.legendReach') }}</span>
              <span><i class="r4-legend-wall"></i>{{ t('room4.legendMapWallShort') }}</span>
              <span v-if="r4.showGuides"><i class="r4-legend-cp"></i>{{ t('room4.legendCheckpointShort') }}</span>
            </span>
          </div>
        </div>
      </div>
    </div>
    <div class="modal-footer modal-footer">
      <button class="btn btn-primary" type="button" @click="closeRoom4()"><i class="fas fa-check mr-1"></i>OK</button>
    </div>
  </template>
</template>
