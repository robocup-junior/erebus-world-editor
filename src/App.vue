<script setup lang="ts">
// The editor's page: the top bar, the tool rail and panel, the map with its checks card, the status
// line, the dialogs, the guide, and the room 4 creator over all of it.
import { defineAsyncComponent, h, onMounted, ref } from 'vue';
import { createEditor } from './editor/editor';
import { tick } from './editor/runtime';
import { fixed, monthDayTime } from './editor/format';
import { t } from './i18n';
import * as Keys from './lib/keys';
import type { AreaScore } from './rules/types';
import RotationDial from './components/RotationDial.vue';
import VictimGlyph from './components/VictimGlyph.vue';
import CtRings from './components/CtRings.vue';
import Modal from './components/Modal.vue';
import BuildInfo from './components/BuildInfo.vue';
import LangMenu from './components/LangMenu.vue';
import RulesMenu from './components/RulesMenu.vue';
import SmallScreen from './components/SmallScreen.vue';

// The room 4 creator: a script of its own, not needed till it is opened. It is fetched once the page
// is up and idle, so it is there by then; opened before, a spinner shows in its window till it is.
function loadCreator() { return import('./room4/Room4Creator.vue'); }
const Room4Creator = defineAsyncComponent({
    loader: loadCreator,
    loadingComponent: { render: function () { return h('div', { class: 'r4-loading' }, [h('i', { class: 'fas fa-spinner fa-spin' })]); } },
    delay: 150
});

const E = createEditor();
const S = E.S;
const keys = Keys.text;
// The mouse and the keys, in the guide's dialog (the tools' keys are on the tool rail)
const KEY_SHEET = [
    { id: 'view', rows: [{ id: 'zoom', keys: ['@wheel'] }, { id: 'pan', keys: ['@spaceDrag', '@middleDrag'] }, { id: 'hand', keys: ['H'] }] },
    { id: 'edit', rows: [{ id: 'undo', keys: ['Ctrl+Z'] }, { id: 'redo', keys: ['Ctrl+Shift+Z', 'Ctrl+Y'] }, { id: 'cancel', keys: ['Esc'] }, { id: 'tools', keys: ['S', 'X', '…'] }] },
    { id: 'select', rows: [{ id: 'copy', keys: ['Ctrl+C', 'Ctrl+X', 'Ctrl+V'] }, { id: 'duplicate', keys: ['Ctrl+D'] }, { id: 'clear', keys: ['Delete'] }, { id: 'nudge', keys: ['← ↑ → ↓'] }] },
    { id: 'guide', rows: [{ id: 'sheet', keys: ['?'] }] }
];
// a key as shown: '@name' is a mouse action in words
function keyName(k: string) { return k.charAt(0) === '@' ? t('guide.keys.keys.' + k.slice(1)) : keys(k); }

const fileEl = ref<HTMLInputElement | null>(null);
const canvasEl = ref<HTMLCanvasElement | null>(null);
const stageEl = ref<HTMLElement | null>(null);

// points as the score shows them (at most two decimals)
function pts(n: number) { return String(Math.round(n * 100) / 100); }
// what an area's points come from
function scoreWhat(a: AreaScore) {
    return [t('score.victims', { n: a.victims }), t('score.targets', { n: a.targets }), t('score.checkpoints', { n: a.checkpoints })].join(' · ');
}

function chooseFile() { fileEl.value!.click(); }
function clearValue(e: Event) { (e.target as HTMLInputElement).value = ''; }
function rename(e: Event) {
    // as typed, without the spaces round it
    S.map!.name = (e.target as HTMLInputElement).value.trim();
    E.renamed();
}

onMounted(function () {
    E.mount({ canvas: canvasEl.value!, stage: stageEl.value! });
    const idle = window.requestIdleCallback || function (f: () => void) { return window.setTimeout(f, 2000); };
    idle(function () { loadCreator().catch(function () { /* fetched again when opened */ }); });
});
</script>

<template>
  <template v-if="tick > -1">
    <input id="edFile" ref="fileEl" type="file" accept=".json,application/json" @click="clearValue" @change="E.fileChosen" style="display:none;">
    <div class="ed" :class="{ 'no-map': !S.map }">
      <header class="ed-top">
        <span class="ed-title"><img class="ed-logo" src="/images/icon.svg" alt="" width="22" height="22">{{ t('app.title') }}<span class="ed-beta-wrap">
          <button class="ed-beta-badge ed-beta-btn" type="button" @click="S.ui.betaMenu = !S.ui.betaMenu" :class="{ open: S.ui.betaMenu }" :title="t('app.about.title')" aria-haspopup="true" :aria-expanded="S.ui.betaMenu ? 'true' : 'false'">β<i class="fas fa-caret-down"></i></button>
          <div class="ed-beta-back" v-if="S.ui.betaMenu" @click="S.ui.betaMenu = false"></div>
          <div class="ed-beta-menu" v-if="S.ui.betaMenu" role="menu">
            <p class="ed-beta-menu-lead">{{ t('app.about.lead') }}</p>
            <!-- the classic editor, for a year that has one -->
            <a class="ed-beta-menu-item" v-if="S.classic" :href="S.classic" target="_blank" rel="noopener" role="menuitem">
              <i class="fas fa-external-link-alt fa-fw"></i>
              <span><strong>{{ t('app.about.classic') }}</strong><small>{{ t('app.about.classicNote') }}</small></span>
            </a>
          </div>
        </span></span>
        <div class="ed-name">
          <i class="fas fa-map ed-name-icon"></i>
          <input class="ed-name-input" v-if="S.map" type="text" :value="S.map.name" @input="rename" :placeholder="t('map.name')" :aria-label="t('map.name')">
          <span class="ed-name-empty" v-if="!S.map">{{ t('file.noMap') }}</span>
        </div>
        <RulesMenu v-if="S.map" :year="S.ruleYear" :years="S.ruleYears" :upcoming="S.upcomingYears" @pick="E.changeRules"></RulesMenu>
        <div class="ed-group ed-file">
          <button class="ed-btn" type="button" @click="E.newMap()" :title="t('file.new')">
            <i class="fas fa-file"></i><span class="ed-btn-label">{{ t('file.newShort') }}</span>
          </button>
          <button class="ed-btn" type="button" @click="chooseFile()" :title="t('file.open')">
            <i class="fas fa-folder-open"></i><span class="ed-btn-label">{{ t('file.openShort') }}</span>
          </button>
          <button class="ed-btn" type="button" @click="E.saveJson()" :disabled="!S.map" :title="t('file.save')">
            <i class="fas fa-save"></i><span class="ed-btn-label">{{ t('file.saveShort') }}</span>
          </button>
        </div>
        <div class="ed-group ed-history" v-if="S.map">
          <button class="ed-btn icon" type="button" @click="E.undo()" :disabled="!S.canUndo" :title="t('common.undo') + ' (' + keys('Ctrl+Z') + ')'">
            <i class="fas fa-undo"></i>
          </button>
          <button class="ed-btn icon" type="button" @click="E.redo()" :disabled="!S.canRedo" :title="t('common.redo') + ' (' + keys('Ctrl+Shift+Z') + ')'">
            <i class="fas fa-redo"></i>
          </button>
        </div>
        <div class="ed-spacer"></div>
        <div class="ed-group ed-linear" v-if="S.map">
          <button class="ed-btn ed-toggle" type="button" @click="E.toggleLinear()" :class="{ on: S.ui.showLinear }" :title="t('linear.title')">
            <i class="fas fa-route"></i><span class="ed-btn-label">{{ t('linear.label') }}</span>
          </button>
        </div>
        <div class="ed-group ed-score" v-if="S.map">
          <button class="ed-btn ed-score-btn" type="button" @click="S.ui.scoreMenu = !S.ui.scoreMenu" :class="{ open: S.ui.scoreMenu }" :title="t('score.button')" aria-haspopup="true" :aria-expanded="S.ui.scoreMenu ? 'true' : 'false'">
            <i class="fas fa-trophy"></i><span class="ed-score-value" v-if="S.score"><span class="ed-score-word">{{ t('score.short') + ' ' }}</span>{{ pts(S.score.field) }}<span class="ed-score-word">{{ t('score.unit') }}</span></span><span class="ed-score-value" v-else>–</span>
          </button>
          <div class="ed-beta-back" v-if="S.ui.scoreMenu" @click="S.ui.scoreMenu = false"></div>
          <div class="ed-score-menu" v-if="S.ui.scoreMenu" role="dialog" :aria-label="t('score.title')">
            <h3>{{ t('score.title') }}</h3>
            <p class="ed-score-lead">{{ t('score.lead') }}</p>
            <p class="ed-score-note" v-if="!S.score">{{ t('score.noStart') }}</p>
            <template v-if="S.score">
              <table class="ed-score-table">
                <tbody>
                  <tr v-for="a in S.score.areas" :key="a.room">
                    <th><i class="ed-room" :class="'room' + a.room"></i>{{ t('score.area', { n: a.room }) }}<span class="ed-score-mult">{{ t('score.multiplier', { m: a.multiplier }) }}</span></th>
                    <td class="ed-score-what">{{ scoreWhat(a) }}</td>
                    <td class="ed-score-pts">{{ pts(a.points) }}</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr class="ed-score-total"><th colspan="2">{{ t('score.field') }}</th><td class="ed-score-pts">{{ pts(S.score.field) }}</td></tr>
                  <tr><th colspan="2">{{ t('score.withExit') }}</th><td class="ed-score-pts">{{ pts(S.score.withExit) }}</td></tr>
                  <tr><th colspan="2">{{ t('score.withMap') }}</th><td class="ed-score-pts">{{ pts(S.score.withMap) }}</td></tr>
                </tfoot>
              </table>
              <ul class="ed-score-notes">
                <li v-if="S.score.untypedTokens">{{ t('score.untypedNote', { n: S.score.untypedTokens }) }}</li>
                <li v-if="S.score.unreachableTokens">{{ t('score.unreachableTokens', { n: S.score.unreachableTokens }) }}</li>
                <li v-if="S.score.unreachableCheckpoints">{{ t('score.unreachableCheckpoints', { n: S.score.unreachableCheckpoints }) }}</li>
                <li v-if="S.score.room4Preset">{{ t('score.presetNote') }}</li>
                <li>{{ t('score.fakeNote') }}</li>
              </ul>
            </template>
          </div>
        </div>
        <div class="ed-group ed-view" v-if="S.map">
          <button class="ed-btn icon" type="button" @click="E.zoomOut()" :title="t('common.zoomOut')">
            <i class="fas fa-search-minus"></i>
          </button>
          <span class="ed-zoom">{{ fixed(S.zoom, 1) }} px/cm</span>
          <button class="ed-btn icon" type="button" @click="E.zoomIn()" :title="t('common.zoomIn')">
            <i class="fas fa-search-plus"></i>
          </button>
          <button class="ed-btn icon" type="button" @click="E.fit()" :title="t('map.fit')">
            <i class="fas fa-expand"></i>
          </button>
        </div>
        <button class="ed-export" type="button" @click="E.exportWorld()" :disabled="!S.map" :class="{ blocked: S.blocking }" :title="S.blocking ? t('export.blocked') : t('export.button')">
          <i class="fas fa-globe"></i>.wbt
        </button>
      </header>
      <div class="ed-body">
        <nav class="ed-rail" :aria-label="t('tools.title')">
          <div v-for="(g, gi) in S.toolGroups" :key="gi">
            <div class="ed-rail-sep" v-if="gi !== 0"></div>
            <button class="ed-tool" type="button" v-for="x in g" :key="x.id" :data-tool="x.id" :class="{ active: S.ui.tool === x.id }" @click="E.setTool(x.id)" :disabled="!S.map" :title="t('tools.names.' + x.id) + ' (' + x.key + ')'" :aria-label="t('tools.names.' + x.id)">
              <i :class="x.icon"></i><span class="ed-tool-key">{{ x.key }}</span>
            </button>
          </div>
        </nav>
        <aside class="ed-tool-panel" v-if="S.map">
          <div class="ed-tool-head"><span>{{ t('tools.names.' + S.ui.tool) }}</span><kbd>{{ E.toolKey(S.ui.tool) }}</kbd></div>
          <p class="ed-help">{{ keys(t('tools.help.' + S.ui.tool)) }}</p>
          <div v-if="S.ui.tool === 'select'">
            <p class="ed-muted" v-if="!S.region">{{ keys(t('select.none')) }}</p>
            <div v-if="S.region">
              <div class="ed-region-size"><i class="far fa-object-group mr-1"></i>{{ t('select.size', { size: E.regionSize() }) }}</div>
              <div class="ed-region-actions">
                <button class="ed-choice" type="button" @click="E.copyRegion()" :title="keys('Ctrl+C')">
                  <i class="far fa-copy fa-fw"></i>{{ t('select.copy') }}
                </button>
                <button class="ed-choice" type="button" @click="E.cutRegion()" :title="keys('Ctrl+X')">
                  <i class="fas fa-cut fa-fw"></i>{{ t('select.cut') }}
                </button>
                <button class="ed-choice" type="button" @click="E.duplicateRegion()" :title="keys('Ctrl+D')">
                  <i class="far fa-clone fa-fw"></i>{{ t('select.duplicate') }}
                </button>
                <button class="ed-choice danger" type="button" @click="E.clearRegion()" title="Delete">
                  <i class="fas fa-trash-alt fa-fw"></i>{{ t('select.clear') }}
                </button>
              </div>
              <p class="ed-muted mt-2">{{ keys(t('select.help')) }}</p>
            </div>
            <button class="ed-choice mt-2" type="button" @click="E.pasteRegion()" :disabled="!S.hasClip" :title="keys('Ctrl+V')">
              <i class="fas fa-paste fa-fw"></i>{{ t('select.paste') }}
            </button>
          </div>
          <div v-if="S.ui.tool === 'shape'">
            <!-- The size: the tiles across and down, typed in or stepped (it grows and shrinks at the
                 right and the bottom) -->
            <div class="ed-size-box" :class="{ fresh: S.ui.freshMap }">
              <div class="ed-size-head">
                <span class="ed-size-title">{{ t('map.size.title') }}</span>
                <span class="ed-size-cm">{{ 12 * S.map.width }} × {{ 12 * S.map.length }} cm</span>
              </div>
              <!-- one grid for both rows: the names' column is as wide as the longer name, in every language -->
              <div class="ed-size-rows">
              <div class="ed-size" v-for="a in (['x', 'y'] as const)" :key="a">
                <label class="ed-size-name" :for="'edSize' + a">{{ t(a === 'x' ? 'map.size.width' : 'map.size.length') }}</label>
                <div class="ed-size-field">
                  <button type="button" @click="a === 'x' ? E.resize(-1, 0) : E.resize(0, -1)" :disabled="(a === 'x' ? S.map.width : S.map.length) <= 1" aria-label="−"><i class="fas fa-minus"></i></button>
                  <input :id="'edSize' + a" type="number" inputmode="numeric" min="1" max="40" :value="a === 'x' ? S.map.width : S.map.length"
                    @change="E.setSize(($event.target as HTMLInputElement), a)" @keydown.enter="($event.target as HTMLInputElement).blur()" @focus="($event.target as HTMLInputElement).select()">
                  <button type="button" @click="a === 'x' ? E.resize(1, 0) : E.resize(0, 1)" :disabled="(a === 'x' ? S.map.width : S.map.length) >= 40" aria-label="+"><i class="fas fa-plus"></i></button>
                </div>
                <span class="ed-size-unit">{{ t('map.size.tiles') }}</span>
              </div>
              </div>
              <p class="ed-size-note">{{ t('map.size.note') }}</p>
            </div>
            <div class="ed-label">{{ t('map.shape.title') }}</div>
            <div class="ed-shape-modes">
              <button class="ed-choice" type="button" v-for="m in S.shapeModes" :key="m.id" :class="[m.id, { active: S.ui.shapeMode === m.id }]" @click="S.ui.shapeMode = m.id">
                <i class="fas fa-fw" :class="m.icon"></i><span>{{ t('map.shape.modes.' + m.id) }}</span>
              </button>
            </div>
          </div>
          <div class="ed-choices column" v-if="S.ui.tool === 'room'">
            <button class="ed-choice" type="button" v-for="r in S.roomChoices" :key="r" :class="{ active: S.ui.room === r }" @click="S.ui.room = r">
              <i class="ed-room" :class="'room' + r"></i>{{ t('rooms.name', { n: r }) }}<span class="ed-choice-note">{{ t('rooms.notes.' + r) }}</span>
            </button>
          </div>
          <div class="ed-room4-block" v-if="S.ui.tool === 'room'">
            <div class="ed-label">{{ t('rooms.room4.name') }}</div>
            <div class="ed-room4">
              <p class="ed-muted" v-if="E.room4State() === 'none'">{{ t('rooms.room4.hint') }}</p>
              <div v-else-if="E.room4State() === 'empty'">
                <p class="ed-room4-state todo"><i class="fas fa-exclamation-circle"></i>{{ t('rooms.room4.notDrawn') }}</p>
              </div>
              <div v-else-if="E.room4State() === 'drawn'">
                <p class="ed-room4-state done"><i class="fas fa-check-circle"></i>{{ t('rooms.room4.drawn') }}</p>
              </div>
              <div v-else-if="E.room4State() === 'preset'">
                <p class="ed-room4-state todo"><i class="fas fa-exclamation-triangle"></i>{{ t('rooms.room4.preset', { name: S.map.area4Room.value }) }}</p>
                <button class="btn btn-sm btn-outline-warning btn-block" type="button" @click="E.toCustomRoom4()">
                  <i class="fas fa-exchange-alt mr-1"></i>{{ t('rooms.room4.toCustom') }}
                </button>
              </div>
            </div>
            <button class="btn btn-sm btn-outline-primary btn-block mt-2" type="button" v-if="E.room4State() === 'empty' || E.room4State() === 'drawn'" @click="E.openRoom4()">
              <i class="fas fa-paint-brush mr-1"></i>{{ t('rooms.room4.draw') }}
            </button>
            <p class="ed-muted ed-room4-dbl" v-if="E.room4State() === 'empty' || E.room4State() === 'drawn'">{{ t('rooms.room4.drawNote') }}</p>
          </div>
          <div class="ed-choices column" v-if="S.ui.tool === 'floor'">
            <button class="ed-choice" type="button" v-for="f in S.floorChoices" :key="f.id" :class="{ active: S.ui.floor === f.id }" @click="S.ui.floor = f.id">
              <i class="fas fa-fw" :class="f.icon"></i>{{ t('floors.' + f.id) }}
            </button>
          </div>
          <div v-if="S.ui.tool === 'victim'">
            <div class="ed-selected" v-if="S.selected">
              <div class="ed-selected-head">
                <span><i class="fas fa-mouse-pointer mr-1"></i>{{ t('victims.selected') }}</span>
                <button class="btn btn-sm btn-link p-0" type="button" @click="E.selectNone()">{{ t('common.done') }}</button>
              </div>
              <div class="ed-sel-head">
                <span class="ed-sel-symbol target" v-if="E.isTarget(S.selected.victim.type)" :style="E.targetStyle(S.selected.victim.code)"></span>
                <span class="ed-sel-symbol" v-if="!E.isTarget(S.selected.victim.type)" :class="{ fake: S.selected.victim.fake }" :style="{ '--victim-color': E.colorOf(S.selected.victim.type) || undefined }"><VictimGlyph :symbol="E.symbolOf(S.selected.victim.type)" :face="E.faceOf(S.selected.victim.type)" :color="E.colorOf(S.selected.victim.type)" :hollow="!!S.selected.victim.fake"></VictimGlyph></span>
                <span v-if="E.isTarget(S.selected.victim.type)">{{ t('targets.types.' + S.selected.letter) }}</span>
                <span v-if="!E.isTarget(S.selected.victim.type) && S.selected.victim.fake">{{ t('victims.fake') }}</span>
              </div>
              <div class="ed-label" v-if="!E.isTarget(S.selected.victim.type)">{{ t('victims.kind') }}</div>
              <div class="ed-choices" v-if="!E.isTarget(S.selected.victim.type)">
                <button class="ed-choice letter" type="button" v-for="v in S.victimChoices.slice(0, 3)" :key="v.id" :class="{ active: S.selected.victim.type === v.id }" @click="E.changeSelected({ type: v.id })" :style="{ color: E.colorOf(v.id) || undefined }"><VictimGlyph :symbol="v.symbol" :face="v.face"></VictimGlyph></button>
              </div>
              <label class="ed-check" v-if="!E.isTarget(S.selected.victim.type)">
                <input type="checkbox" :checked="S.selected.victim.fake" @click="E.changeSelected({ fake: !S.selected.victim.fake })">{{ t('victims.fake') }}</label>
              <div v-if="!E.isTarget(S.selected.victim.type)">
                <div class="ed-label">{{ t('victims.turn.title') }}</div>
                <RotationDial class="ed-dial" :model-value="S.selected.rot" @update:model-value="(v: number) => S.selected!.rot = v" @change="E.changeSelected({ rot: S.selected!.rot })" :symbol="E.symbolOf(S.selected.victim.type)" :face="E.faceOf(S.selected.victim.type)"></RotationDial>
              </div>
              <!-- where along its wall: dragged on the map, or here -->
              <div class="ed-along" v-for="r in [E.selectedRange()]" :key="'along'">
                <template v-if="r">
                  <div class="ed-label">{{ t('victims.along.title') }}</div>
                  <div class="ed-along-row">
                    <input type="range" class="ed-along-range" :min="r.min" :max="r.max" step="0.1" :value="S.selected.offset" :disabled="r.min === r.max"
                      :aria-label="t('victims.along.title')" @input="E.slideSelected(Number(($event.target as HTMLInputElement).value))" @change="E.slideDone()" @pointerup="E.slideDone()" @blur="E.slideDone()">
                    <span class="ed-along-value">{{ E.offsetText(S.selected.offset) }} cm</span>
                  </div>
                  <div class="ed-along-foot">
                    <span>{{ t('victims.along.note') }}</span>
                    <button class="btn btn-sm btn-link p-0" type="button" :disabled="!S.selected.offset" @click="E.moveSelected(0)">{{ t('victims.along.middle') }}</button>
                  </div>
                </template>
              </div>
              <button class="btn btn-sm btn-outline-danger btn-block mt-3" type="button" @click="E.removeSelected()">
                <i class="fas fa-trash-alt mr-1"></i>{{ t('common.remove') }}
              </button>
            </div>
            <div class="r4-panel ed-stamps">
              <div class="r4-stamps">
                <div class="r4-stamp-group">
                  <span class="r4-stamp-group-label">{{ t('room4.groups.victim') }}</span>
                  <div class="r4-stamp-row cols-3" v-for="row in S.victimRows" :key="row.label">
                    <span class="r4-stamp-row-label">{{ t('room4.rows.' + row.label) }}</span>
                    <button class="r4-stamp" type="button" v-for="v in row.types" :key="v.name" :class="['kind-' + v.kind, { active: S.ui.victim === v.id && !!S.ui.fake === v.fake }]" @click="E.pickVictim(v)" :style="{ '--stamp-color': v.color }" :title="t(v.name)">
                      <span class="r4-stamp-badge"><VictimGlyph :symbol="v.symbol" :face="v.face" :color="v.color" :hollow="v.kind === 'fake'"></VictimGlyph></span><span class="r4-stamp-name">{{ t(v.name) }}</span>
                    </button>
                  </div>
                </div>
                <div class="r4-stamp-group">
                  <span class="r4-stamp-group-label">{{ t('room4.groups.ct') }}</span>
                  <div class="r4-stamp-row cols-2">
                    <button class="r4-stamp" type="button" v-for="c in S.ctStamps" :key="c.name" :class="['kind-' + c.kind, { active: E.isTarget(S.ui.victim) && E.ctLetter() === c.letter }]" @click="E.pickCt(c.letter!)" :style="{ '--stamp-color': c.color }" :title="t(c.name)">
                      <span class="r4-stamp-badge">{{ c.symbol }}</span><span class="r4-stamp-name">{{ t(c.name) }}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <CtRings v-if="S.selected ? E.isTarget(S.selected.victim.type) : E.isTarget(S.ui.victim)" :rings="E.pickerRings()" :ring="S.ui.ring" :colors="S.ringColors" :letter="E.ctLetter()" :sum="E.ctSum()" @pick-ring="(i: number) => S.ui.ring = i" @pick-color="E.pickColor"></CtRings>
            <div v-if="!S.selected && !E.isTarget(S.ui.victim)">
              <div class="ed-label">{{ t('victims.turn.title') }}</div>
              <div class="ed-seg">
                <button type="button" :class="{ active: !S.ui.randomRot }" @click="S.ui.randomRot = false">
                  <i class="fas fa-compass mr-1"></i>{{ t('victims.turn.fixed') }}
                </button>
                <button type="button" :class="{ active: S.ui.randomRot }" @click="S.ui.randomRot = true">
                  <i class="fas fa-dice mr-1"></i>{{ t('victims.turn.random') }}
                </button>
              </div>
              <p class="ed-rot-note" v-if="S.ui.randomRot">{{ t('victims.turn.randomNote') }}</p>
              <RotationDial class="ed-dial" v-if="!S.ui.randomRot" v-model="S.ui.rot" :symbol="E.victimSymbol()" :face="E.victimFace()"></RotationDial>
            </div>
          </div>
        </aside>
        <main class="ed-stage" id="edStage" ref="stageEl" :class="'tool-' + S.ui.tool">
          <canvas id="edCanvas" ref="canvasEl" @dblclick="E.canvasDblClick"></canvas>
          <section class="ed-checks" v-if="S.map" :class="{ folded: S.ui.checksFolded, ok: !S.problems.length, bad: S.blocking }">
            <header class="ed-checks-head" @click="S.ui.checksFolded = !S.ui.checksFolded" :title="t(S.ui.checksFolded ? 'checks.open' : 'checks.fold')">
              <i class="fas" :class="!S.problems.length ? 'fa-check-circle ok' : S.blocking ? 'fa-times-circle bad' : 'fa-exclamation-triangle warn'"></i>
              <span class="ed-checks-title">{{ t('checks.title') }}</span>
              <span class="ed-count" :class="{ ok: !S.problems.length, bad: S.blocking }">{{ S.problems.length }}</span>
              <i class="fas ed-checks-chevron" :class="S.ui.checksFolded ? 'fa-chevron-down' : 'fa-chevron-up'"></i>
            </header>
            <div class="ed-checks-body" v-if="!S.ui.checksFolded">
              <p class="ed-ok" v-if="!S.problems.length">{{ t('checks.none') }}</p>
              <button class="ed-fix-all" type="button" v-if="E.canFixAll()" @click="E.fixAll()">
                <i class="fas fa-magic mr-1"></i>{{ t('checks.fix.all') }}
              </button>
              <ul class="ed-problems" v-if="S.problems.length">
                <li v-for="(p, pi) in S.problems" :key="pi" :class="{ block: p.block, jump: p.at }" @click="E.showProblem(p)" @mouseenter="E.pointProblem(p)" @mouseleave="E.pointProblem(null)" :title="p.at ? t('checks.showWhere') : ''">
                  <i class="fas" :class="p.block ? 'fa-times-circle' : 'fa-exclamation-triangle'"></i>
                  <span class="ed-problem-text">{{ p.text }}</span>
                  <button class="ed-fix" type="button" v-if="p.fix" @click="E.fixProblem(p, $event)" :title="t(p.fix === 'draw' ? 'checks.fix.draw' : 'checks.fix.this')">
                    <i class="fas" :class="p.fix === 'draw' ? 'fa-paint-brush' : 'fa-magic'"></i>{{ t(p.fix === 'draw' ? 'checks.fix.drawShort' : 'checks.fix.short') }}
                  </button>
                </li>
              </ul>
            </div>
          </section>
          <div class="ed-empty" v-if="!S.map">
            <div class="ed-empty-card">
              <i class="fas fa-drafting-compass ed-empty-icon"></i>
              <h2>{{ t('file.start.title') }}</h2>
              <p>{{ t('file.start.lead') }}</p>
              <!-- the rules a new map is made with: the years the editor takes, and those on their way -->
              <div class="ed-empty-rules">
                <span class="ed-empty-rules-label" id="edEmptyRules"><i class="fas fa-book"></i>{{ t('rules.pick') }}</span>
                <div class="ed-empty-rules-choices" role="radiogroup" aria-labelledby="edEmptyRules">
                  <button type="button" role="radio" v-for="y in S.ruleYears" :key="y.year" :aria-checked="S.ui.newYear === y.year" :class="{ active: S.ui.newYear === y.year }" @click="S.ui.newYear = y.year">
                    <i class="fas fa-check-circle"></i>{{ t('rules.label', { year: y.year }) }}<span class="ed-rules-draft" v-if="y.draft">{{ t('rules.draft') }}</span>
                  </button>
                  <button type="button" role="radio" class="soon" v-for="y in S.upcomingYears" :key="y" aria-checked="false" disabled>
                    {{ t('rules.label', { year: y }) }}<span class="ed-rules-soon">{{ t('rules.soon') }}</span>
                  </button>
                </div>
                <small class="ed-empty-rules-note">{{ t('rules.pickNote') }}</small>
              </div>
              <div class="ed-empty-actions">
                <button class="btn btn-primary" type="button" @click="E.newMap()"><i class="fas fa-file mr-2"></i>{{ t('file.new') }}</button>
                <button class="btn btn-outline-secondary" type="button" @click="chooseFile()">
                  <i class="fas fa-folder-open mr-2"></i>{{ t('file.openJson') }}
                </button>
              </div>
              <!-- the work kept: opened only in the rules of its year (another year is switched to by the rules menu) -->
              <button class="btn btn-outline-primary btn-block mt-2 ed-restore" type="button" v-if="S.kept" :disabled="E.keptOtherYear()" @click="E.restoreKept()">
                <span><i class="fas fa-history mr-2"></i>{{ t('file.restore') }}</span>
                <small class="ed-restore-what">{{ S.kept.name }} · {{ t('rules.label', { year: S.kept.year }) }} · {{ monthDayTime(S.kept.time) }}</small>
              </button>
              <small class="ed-restore-note" v-if="S.kept && E.keptOtherYear()"><i class="fas fa-info-circle"></i>{{ t('file.restoreOtherYear', { year: S.kept.year }) }}</small>
              <div class="ed-empty-drop">{{ t('file.dropHere') }}</div>
              <button class="ed-empty-tour" type="button" @click="E.openGuidePick()">
                <i class="fas fa-graduation-cap"></i>
                <span><strong>{{ t('guide.empty.title') }}</strong><small>{{ t('guide.empty.note') }}</small></span>
                <i class="fas fa-chevron-right"></i>
              </button>
              <div class="ed-error" v-if="S.error">{{ t(S.error, S.errorParams) }}</div>
            </div>
          </div>
        </main>
      </div>
      <div class="ed-dialog-back" v-if="S.dialog" @click="E.closeDialog(null)">
        <div class="ed-dialog" role="alertdialog" aria-modal="true" aria-labelledby="edDialogTitle" :class="'kind-' + S.dialog.kind" @click.stop>
          <div class="ed-dialog-head">
            <span class="ed-dialog-icon"><i class="fas" :class="({ error: 'fa-times', warn: 'fa-exclamation', info: 'fa-info' } as Record<string, string>)[S.dialog.kind || 'info']"></i></span>
            <h2 id="edDialogTitle">{{ S.dialog.title }}</h2>
            <button class="ed-dialog-x" type="button" @click="E.closeDialog(null)" :aria-label="t('common.close')">
              <i class="fas fa-times"></i>
            </button>
          </div>
          <p class="ed-dialog-message" v-if="S.dialog.message">{{ S.dialog.message }}</p>
          <ul class="ed-dialog-items" v-if="S.dialog.items && S.dialog.items.length">
            <li v-for="(p, pi) in S.dialog.items" :key="pi" :class="{ jump: p.at }" @click="p.at && E.dialogItem(p)" :title="p.at ? t('checks.showWhere') : ''">
              <i class="fas" :class="p.block ? 'fa-times-circle' : 'fa-exclamation-triangle'"></i>
              <span>{{ p.text }}</span>
              <i class="fas fa-crosshairs ed-jump" v-if="p.at"></i>
            </li>
          </ul>
          <div class="ed-dialog-actions">
            <button class="ed-dialog-btn" type="button" v-for="(a, ai) in S.dialog.actions" :key="ai" :class="a.style" @click="E.closeDialog(a.value)">
              <i class="fas mr-1" v-if="a.icon" :class="a.icon"></i>{{ a.label }}
            </button>
          </div>
        </div>
      </div>
      <footer class="ed-status">
        <span class="ed-hint ed-notice" v-if="S.notice" :class="S.notice.kind"><i class="fas" :class="({ ok: 'fa-check-circle', warn: 'fa-exclamation-triangle', info: 'fa-info-circle' } as Record<string, string>)[S.notice.kind]"></i><span class="ed-hint-text" :title="S.notice.text">{{ S.notice.text }}</span></span>
        <span class="ed-hint" v-if="!S.notice && S.hint"><i class="fas fa-mouse-pointer"></i><span class="ed-hint-text" :title="S.hint">{{ S.hint }}</span></span>
        <span class="ed-tool-hint" v-if="!S.notice && !S.hint && !S.ui.showLinear && E.toolHint()"><i class="fas fa-lightbulb"></i><span class="ed-hint-text" :title="E.toolHint()">{{ E.toolHint() }}</span></span>
        <span class="ed-legend" v-if="!S.notice && !S.hint && S.ui.showLinear && !E.linearNoStart()">
          <span><i class="ed-key linear"></i>{{ t('linear.legend.linear') }}</span>
          <span><i class="ed-key floating"></i>{{ t('linear.legend.floating') }}</span>
          <span><i class="ed-key floating-wall"></i>{{ t('linear.legend.floatingWall') }}</span>
          <span v-if="E.linearUnreached()"><i class="ed-key unreached"></i>{{ t('linear.legend.unreached') }}</span>
        </span>
        <span class="ed-hint" v-if="!S.notice && !S.hint && S.ui.showLinear && E.linearNoStart()"><i class="fas fa-info-circle"></i><span class="ed-hint-text">{{ t('linear.noStart') }}</span></span>
        <BuildInfo></BuildInfo>
        <span class="ed-status-tools">
          <LangMenu :lang="S.lang" @pick="E.switchLang"></LangMenu>
          <button class="ed-status-btn ed-tour-btn" type="button" @click="E.openGuidePick()" :title="t('guide.button')" aria-haspopup="dialog">
            <i class="far fa-question-circle"></i><span>{{ t('guide.short') }}</span><span class="ed-tour-dot" v-if="!S.tourSeen"></span>
          </button>
        </span>
      </footer>
    </div>
    <div class="ed-pick-back" v-if="S.ui.guidePick" @click="E.closeGuidePick()">
      <div class="ed-pick" :class="{ wide: S.ui.guidePick === 'keys' }" role="dialog" aria-modal="true" aria-labelledby="edPickTitle" @click.stop>
        <div class="ed-pick-head">
          <h2 id="edPickTitle">{{ t(S.ui.guidePick === 'room4' ? 'guide.pick.room4Title' : S.ui.guidePick === 'keys' ? 'guide.keys.title' : 'guide.pick.title') }}</h2>
          <button class="ed-tour-x" type="button" @click="E.closeGuidePick()" :aria-label="t('common.close')">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <template v-if="S.ui.guidePick === 'keys'">
          <div class="ed-keys">
            <section v-for="g in KEY_SHEET" :key="g.id">
              <h3>{{ t('guide.keys.' + g.id) }}</h3>
              <dl>
                <div class="ed-keys-row" v-for="r in g.rows" :key="r.id">
                  <dt>{{ t('guide.keys.rows.' + r.id) }}</dt>
                  <dd><kbd v-for="(k, ki) in r.keys" :key="ki">{{ keyName(k) }}</kbd></dd>
                </div>
              </dl>
            </section>
          </div>
        </template>
        <p class="ed-pick-lead" v-if="S.ui.guidePick !== 'keys'">{{ t('guide.pick.lead') }}</p>
        <div class="ed-pick-options" v-if="S.ui.guidePick !== 'keys'">
          <button class="ed-pick-option" type="button" v-if="S.ui.guidePick !== 'room4'" @click="E.pickGuide('lesson')">
            <span class="ed-pick-icon lesson"><i class="fas fa-graduation-cap"></i></span>
            <span class="ed-pick-text"><strong>{{ t('guide.lesson.name') }}</strong><span class="ed-pick-time">{{ t('guide.lesson.time') }}</span><small>{{ t('guide.lesson.note') }}</small><small class="ed-pick-warn" v-if="S.map">{{ t('guide.lesson.map') }}</small></span>
          </button>
          <button class="ed-pick-option" type="button" v-if="S.ui.guidePick !== 'room4'" @click="E.pickGuide('tour')">
            <span class="ed-pick-icon tour"><i class="fas fa-route"></i></span>
            <span class="ed-pick-text"><strong>{{ t('guide.tour.name') }}</strong><span class="ed-pick-time">{{ t('guide.tour.time') }}</span><small>{{ t('guide.tour.note') }}</small></span>
          </button>
          <button class="ed-pick-option" type="button" @click="E.pickGuide('room4')" :disabled="!E.room4Ready()">
            <span class="ed-pick-icon room4"><i class="fas fa-paint-brush"></i></span>
            <span class="ed-pick-text"><strong>{{ t('guide.room4.name') }}</strong><span class="ed-pick-time">{{ t('guide.room4.time') }}</span><small>{{ t(E.room4Ready() ? 'guide.room4.note' : 'guide.room4.need') }}</small></span>
          </button>
          <button class="ed-pick-option" type="button" @click="E.pickGuide('room4tour')" :disabled="!E.room4Ready()">
            <span class="ed-pick-icon room4look"><i class="fas fa-binoculars"></i></span>
            <span class="ed-pick-text"><strong>{{ t('guide.room4Tour.name') }}</strong><span class="ed-pick-time">{{ t('guide.room4Tour.time') }}</span><small>{{ t(E.room4Ready() ? 'guide.room4Tour.note' : 'guide.room4.need') }}</small></span>
          </button>
        </div>
        <div class="ed-pick-foot">
          <button class="ed-pick-keys" type="button" v-if="S.ui.guidePick === 'main'" @click="E.openGuidePick('keys')"><i class="far fa-keyboard"></i>{{ t('guide.keys.open') }}<kbd>?</kbd></button>
          <button class="ed-pick-keys" type="button" v-if="S.ui.guidePick === 'keys'" @click="E.openGuidePick('main')"><i class="fas fa-arrow-left"></i>{{ t('guide.keys.back') }}</button>
          <button class="ed-tour-skip" type="button" @click="E.closeGuidePick()">{{ t(S.ui.guidePick === 'keys' ? 'common.close' : 'guide.pick.later') }}</button>
        </div>
      </div>
    </div>
    <div class="ed-tour" v-if="S.tour" :class="['kind-' + S.tour.kind, { ready: S.tour.ready, look: E.tourLook() }]">
      <div class="ed-tour-block" v-if="E.tourLook()" @click.stop></div>
      <svg class="ed-tour-shade" aria-hidden="true">
        <defs>
          <mask id="edTourMask" maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%">
            <rect x="0" y="0" width="100%" height="100%" fill="#fff"></rect>
            <rect v-for="(q, qi) in S.tour.lit" :key="qi" :x="q.left" :y="q.top" :width="q.right - q.left" :height="q.bottom - q.top" rx="10" fill="#000"></rect>
          </mask>
        </defs>
        <rect class="ed-tour-dim" x="0" y="0" width="100%" height="100%" mask="url(#edTourMask)"></rect>
        <polyline class="ed-tour-guide" v-for="(g, gi) in S.tour.guides" :key="gi" :points="g"></polyline>
      </svg>
      <div class="ed-tour-ring" v-if="S.tour.hole" :style="S.tour.hole"></div>
      <div class="ed-tour-ring extra" v-for="(m, mi) in S.tour.marks" :key="'m' + mi" :style="m"></div>
      <div class="ed-tour-ring place" v-for="(m, mi) in S.tour.regions" :key="'r' + mi" :style="m"></div>
      <div class="ed-tour-card" role="dialog" aria-labelledby="edTourTitle" :style="S.tour.card" :class="{ welcome: E.tourStep()!.plan || E.tourStep()!.id === 'welcome', done: S.tour.done, compact: S.tour.compact }">
        <div class="ed-tour-head">
          <span class="ed-tour-chapter">{{ t('guide.tour.chapters.' + E.tourStep()!.chapter) }}</span>
          <span class="ed-tour-count">{{ S.tour.i + 1 }} / {{ S.tour.steps.length }}</span>
          <button class="ed-tour-fold" type="button" v-if="!E.tourLook()" @click="E.tourFold()" :title="t(S.tour.compact ? 'guide.lesson.unfold' : 'guide.lesson.fold')" :aria-expanded="S.tour.compact ? 'false' : 'true'">
            <i class="fas" :class="S.tour.compact ? 'fa-chevron-down' : 'fa-chevron-up'"></i>
            <span>{{ t(S.tour.compact ? 'guide.lesson.unfold' : 'guide.lesson.fold') }}</span>
          </button>
          <button class="ed-tour-x" type="button" @click="E.endTour()" :title="t('guide.nav.end')" :aria-label="t('guide.nav.end')">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="ed-tour-progress">
          <button type="button" v-for="c in S.tour.chapters" :key="c.id" @click="E.tourJump(c.first)" :class="{ on: c.on }" :style="{ flex: '1 1 ' + c.count + 'px' }" :title="t('guide.tour.chapters.' + c.id)">
            <span :style="{ width: (100 * c.done / c.count) + '%' }"></span>
          </button>
        </div>
        <div class="ed-tour-icon" v-if="E.tourStep()!.id === 'welcome'"><i class="fas fa-drafting-compass"></i></div>
        <svg class="ed-tour-plan" v-if="E.tourStep()!.plan" :viewBox="'-2 -2 ' + (S.tourPlan.w + 4) + ' ' + (S.tourPlan.h + 4)" role="img" :aria-label="t('guide.lesson.planLabel')">
          <rect v-for="(x, xi) in S.tourPlan.tiles" :key="xi" :x="x.x" :y="x.y" width="12" height="12" :fill="x.fill" stroke="#cbd5e1" stroke-width="0.4"></rect>
          <polyline v-for="(w, wi) in S.tourPlan.walls" :key="'w' + wi" :points="w" fill="none" stroke="#1e293b" stroke-width="1.2"></polyline>
          <circle v-for="(p, pi) in S.tourPlan.passages" :key="'p' + pi" :cx="p.x" :cy="p.y" r="2.6" :fill="p.c"></circle>
          <path :d="'M' + (S.tourPlan.start.x - 2.5) + ' ' + (S.tourPlan.start.y - 3) + 'L' + (S.tourPlan.start.x + 3) + ' ' + S.tourPlan.start.y + 'L' + (S.tourPlan.start.x - 2.5) + ' ' + (S.tourPlan.start.y + 3) + 'Z'" fill="#16a34a"></path>
          <text v-for="(l, li) in S.tourPlan.labels" :key="'l' + li" :x="l.x" :y="l.y + 2" text-anchor="middle" font-size="6" font-weight="700" fill="#475569">{{ t('rooms.name', { n: l.n }) }}</text>
        </svg>
        <h2 id="edTourTitle">{{ E.tourText('title') }}</h2>
        <div class="ed-tour-body"><p v-for="(line, li) in E.tourLines()" :key="li">{{ line }}</p></div>
        <div class="ed-tour-keys" v-if="E.tourStep()!.keys"><kbd v-for="k in E.tourStep()!.keys" :key="k">{{ keys(k) }}</kbd></div>
        <div class="ed-tour-task" v-if="E.tourText('task')" :class="{ done: S.tour.done, changed: !S.tour.done && S.tour.task }">
          <i class="fas" :class="S.tour.done ? 'fa-check-circle' : S.tour.task ? 'fa-exclamation-circle' : 'fa-hand-point-right'"></i>
          <span><strong>{{ t(S.tour.done ? 'guide.lesson.done' : 'guide.lesson.todo') }}</strong>{{ E.tourTask() }}</span>
        </div>
        <button class="ed-tour-inner" type="button" v-if="S.tour.kind === 'tour' && E.tourStep()!.id === 'room4' && E.room4Ready()" @click="E.tourRoom4Inside()">
          <i class="fas fa-paint-brush"></i><span>{{ t('guide.tour.room4Inside') }}</span><i class="fas fa-chevron-right"></i>
        </button>
        <div class="ed-tour-closed" v-if="E.tourCreatorOver()">
          <i class="fas fa-info-circle"></i>
          <span>{{ t('guide.lesson.creatorOver') }}</span>
          <button class="ed-tour-nav" type="button" @click="E.tourCloseCreator()">
            <i class="fas fa-check mr-1"></i>{{ t('guide.lesson.closeCreator') }}
          </button>
        </div>
        <div class="ed-tour-closed" v-if="E.tourCreatorClosed()">
          <i class="fas fa-info-circle"></i>
          <span>{{ t('guide.lesson.creatorClosed') }}</span>
          <button class="ed-tour-nav" type="button" @click="E.tourOpenCreator()">
            <i class="fas fa-paint-brush mr-1"></i>{{ t('guide.lesson.openCreator') }}
          </button>
        </div>
        <div class="ed-tour-actions">
          <button class="ed-tour-skip" type="button" v-if="E.tourLook() && S.tour.i < S.tour.steps.length - 1" @click="E.endTour()">{{ t('guide.nav.skip') }}</button>
          <span class="ed-spacer"></span>
          <button class="ed-tour-nav" type="button" v-if="S.tour.i > 0" @click="E.tourGo(-1)" :title="t('guide.nav.back')">
            <i class="fas fa-arrow-left"></i>
          </button>
          <button class="ed-tour-nav auto" type="button" v-if="E.tourStep()!.auto && !S.tour.done" @click="E.tourDoIt()" :disabled="E.tourCreatorClosed()">
            <i class="fas fa-magic mr-1"></i>{{ t('guide.lesson.doIt') }}
          </button>
          <button class="ed-tour-nav primary" type="button" @click="E.tourGo(1)" :disabled="!E.tourLook() && !!E.tourStep()!.goal && !S.tour.done">
            <span v-if="S.tour.i === 0">{{ t('guide.nav.begin') }}</span>
            <span v-if="S.tour.i > 0 && S.tour.i < S.tour.steps.length - 1">{{ t('guide.nav.next') }}</span>
            <span v-if="S.tour.i === S.tour.steps.length - 1">{{ t('guide.nav.finish') }}</span>
            <i class="fas ml-1" :class="S.tour.i === S.tour.steps.length - 1 ? 'fa-check' : 'fa-arrow-right'"></i>
          </button>
        </div>
        <div class="ed-tour-back" v-if="S.tour.outer">
          <i class="fas fa-level-up-alt fa-rotate-270"></i>{{ t('guide.tour.backTo', { name: t('guide.' + (S.tour.outer.tour.kind === 'tour' ? 'tour' : 'lesson') + '.name') }) }}
        </div>
        <div class="ed-tour-tip" v-if="E.tourLook()">{{ t('guide.nav.keys') }}</div>
        <div class="ed-tour-foot" v-if="!E.tourLook()">
          <button class="ed-tour-skip" type="button" v-if="E.tourStep()!.goal && !S.tour.done" @click="E.tourGo(1, true)">{{ t('guide.lesson.skip') }}</button>
          <span class="ed-tour-tip">{{ t('guide.lesson.tip') }}</span>
        </div>
      </div>
    </div>
    <Modal v-if="S.room4" :open="S.room4.open" window-class="r4-window ed-r4-full" size="xl" @dismiss="E.closeRoom4()" @gone="E.room4Gone()">
      <Room4Creator :editor="E"></Room4Creator>
    </Modal>
    <SmallScreen></SmallScreen>
  </template>
</template>
