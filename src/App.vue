<script setup lang="ts">
// The editor's page: the top bar, the tool rail and panel, the map with its checks card, the status
// line, the dialogs, the guide, and the room 4 creator over all of it.
import { onMounted, ref } from 'vue';
import { createEditor } from './editor/editor';
import { tick } from './editor/runtime';
import { fixed, monthDayTime } from './editor/format';
import { t } from './i18n';
import * as Keys from './lib/keys';
import type { AreaScore } from './rules/types';
import RotationDial from './components/RotationDial.vue';
import CtRings from './components/CtRings.vue';
import Modal from './components/Modal.vue';
import BuildInfo from './components/BuildInfo.vue';
import LangMenu from './components/LangMenu.vue';
import RulesMenu from './components/RulesMenu.vue';
import Room4Creator from './room4/Room4Creator.vue';

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
function keyName(k: string) { return k.charAt(0) === '@' ? t('admin.simBeta.keySheet.keys.' + k.slice(1)) : keys(k); }

const fileEl = ref<HTMLInputElement | null>(null);
const canvasEl = ref<HTMLCanvasElement | null>(null);
const stageEl = ref<HTMLElement | null>(null);

// points as the score shows them (at most two decimals)
function pts(n: number) { return String(Math.round(n * 100) / 100); }
// what an area's points come from
function scoreWhat(a: AreaScore) {
    return [t('admin.simBeta.score.victims', { n: a.victims }), t('admin.simBeta.score.targets', { n: a.targets }), t('admin.simBeta.score.checkpoints', { n: a.checkpoints })].join(' · ');
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
});
</script>

<template>
  <template v-if="tick > -1">
    <input id="simBetaFile" ref="fileEl" type="file" accept=".json,application/json" @click="clearValue" @change="E.fileChosen" style="display:none;">
    <div class="sbx" :class="{ 'no-map': !S.map }">
      <header class="sbx-top">
        <span class="sbx-title">{{ t('admin.simBeta.title') }}<span class="sbx-beta-wrap">
          <button class="sim-beta-badge sbx-beta-btn" type="button" @click="S.ui.betaMenu = !S.ui.betaMenu" :class="{ open: S.ui.betaMenu }" :title="t('admin.simBeta.betaMenu')" aria-haspopup="true" :aria-expanded="S.ui.betaMenu ? 'true' : 'false'">β<i class="fas fa-caret-down"></i></button>
          <div class="sbx-beta-back" v-if="S.ui.betaMenu" @click="S.ui.betaMenu = false"></div>
          <div class="sbx-beta-menu" v-if="S.ui.betaMenu" role="menu">
            <p class="sbx-beta-menu-lead">{{ t('admin.simBeta.betaLead') }}</p>
            <a class="sbx-beta-menu-item" href="https://osaka.rcj.cloud/service/editor/simulation/2026/classic" target="_blank" rel="noopener" role="menuitem">
              <i class="fas fa-external-link-alt fa-fw"></i>
              <span><strong>{{ t('admin.simBeta.backToClassic') }}</strong><small>{{ t('admin.simBeta.backToClassicNote') }}</small></span>
            </a>
          </div>
        </span></span>
        <div class="sbx-name">
          <i class="fas fa-map sbx-name-icon"></i>
          <input class="sbx-name-input" v-if="S.map" type="text" :value="S.map.name" @input="rename" :placeholder="t('admin.simMapEditor.name')" :aria-label="t('admin.simMapEditor.name')">
          <span class="sbx-name-empty" v-if="!S.map">{{ t('admin.simBeta.noMap') }}</span>
        </div>
        <RulesMenu v-if="S.map" :year="S.ruleYear" :years="S.ruleYears" :upcoming="S.upcomingYears" @pick="E.changeRules"></RulesMenu>
        <div class="sbx-group sbx-file">
          <button class="sbx-btn" type="button" @click="E.newMap()" :title="t('admin.simBeta.new')">
            <i class="fas fa-file"></i><span class="sbx-btn-label">{{ t('admin.simBeta.newShort') }}</span>
          </button>
          <button class="sbx-btn" type="button" @click="chooseFile()" :title="t('admin.simBeta.open')">
            <i class="fas fa-folder-open"></i><span class="sbx-btn-label">{{ t('admin.simBeta.openShort') }}</span>
          </button>
          <button class="sbx-btn" type="button" @click="E.saveJson()" :disabled="!S.map" :title="t('admin.simBeta.save')">
            <i class="fas fa-save"></i><span class="sbx-btn-label">{{ t('admin.simBeta.saveShort') }}</span>
          </button>
        </div>
        <div class="sbx-group sbx-history" v-if="S.map">
          <button class="sbx-btn icon" type="button" @click="E.undo()" :disabled="!S.canUndo" :title="t('admin.simBeta.undo') + ' (' + keys('Ctrl+Z') + ')'">
            <i class="fas fa-undo"></i>
          </button>
          <button class="sbx-btn icon" type="button" @click="E.redo()" :disabled="!S.canRedo" :title="t('admin.simBeta.redo') + ' (' + keys('Ctrl+Shift+Z') + ')'">
            <i class="fas fa-redo"></i>
          </button>
        </div>
        <div class="sbx-spacer"></div>
        <div class="sbx-group sbx-linear" v-if="S.map">
          <button class="sbx-btn sbx-toggle" type="button" @click="E.toggleLinear()" :class="{ on: S.ui.showLinear }" :title="t('admin.simBeta.linearTitle')">
            <i class="fas fa-route"></i><span class="sbx-btn-label">{{ t('admin.simBeta.linear') }}</span>
          </button>
        </div>
        <div class="sbx-group sbx-score" v-if="S.map">
          <button class="sbx-btn sbx-score-btn" type="button" @click="S.ui.scoreMenu = !S.ui.scoreMenu" :class="{ open: S.ui.scoreMenu }" :title="t('admin.simBeta.score.button')" aria-haspopup="true" :aria-expanded="S.ui.scoreMenu ? 'true' : 'false'">
            <i class="fas fa-trophy"></i><span class="sbx-score-value" v-if="S.score"><span class="sbx-score-word">{{ t('admin.simBeta.score.short') }} </span>{{ pts(S.score.field) }}<span class="sbx-score-word">{{ t('admin.simBeta.score.unit') }}</span></span><span class="sbx-score-value" v-else>–</span>
          </button>
          <div class="sbx-beta-back" v-if="S.ui.scoreMenu" @click="S.ui.scoreMenu = false"></div>
          <div class="sbx-score-menu" v-if="S.ui.scoreMenu" role="dialog" :aria-label="t('admin.simBeta.score.title')">
            <h3>{{ t('admin.simBeta.score.title') }}</h3>
            <p class="sbx-score-lead">{{ t('admin.simBeta.score.lead') }}</p>
            <p class="sbx-score-note" v-if="!S.score">{{ t('admin.simBeta.score.noStart') }}</p>
            <template v-if="S.score">
              <table class="sbx-score-table">
                <tbody>
                  <tr v-for="a in S.score.areas" :key="a.room">
                    <th><i class="sbx-room" :class="'room' + a.room"></i>{{ t('admin.simBeta.score.area', { n: a.room }) }}<span class="sbx-score-mult">{{ t('admin.simBeta.score.multiplier', { m: a.multiplier }) }}</span></th>
                    <td class="sbx-score-what">{{ scoreWhat(a) }}</td>
                    <td class="sbx-score-pts">{{ pts(a.points) }}</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr class="sbx-score-total"><th colspan="2">{{ t('admin.simBeta.score.field') }}</th><td class="sbx-score-pts">{{ pts(S.score.field) }}</td></tr>
                  <tr><th colspan="2">{{ t('admin.simBeta.score.withExit') }}</th><td class="sbx-score-pts">{{ pts(S.score.withExit) }}</td></tr>
                  <tr><th colspan="2">{{ t('admin.simBeta.score.withMap') }}</th><td class="sbx-score-pts">{{ pts(S.score.withMap) }}</td></tr>
                </tfoot>
              </table>
              <ul class="sbx-score-notes">
                <li v-if="S.score.untypedTokens">{{ t('admin.simBeta.score.untypedNote', { n: S.score.untypedTokens }) }}</li>
                <li v-if="S.score.unreachableTokens">{{ t('admin.simBeta.score.unreachableTokens', { n: S.score.unreachableTokens }) }}</li>
                <li v-if="S.score.unreachableCheckpoints">{{ t('admin.simBeta.score.unreachableCheckpoints', { n: S.score.unreachableCheckpoints }) }}</li>
                <li v-if="S.score.room4Preset">{{ t('admin.simBeta.score.presetNote') }}</li>
                <li>{{ t('admin.simBeta.score.fakeNote') }}</li>
              </ul>
            </template>
          </div>
        </div>
        <div class="sbx-group sbx-view" v-if="S.map">
          <button class="sbx-btn icon" type="button" @click="E.zoomOut()" :title="t('admin.simBeta.zoomOut')">
            <i class="fas fa-search-minus"></i>
          </button>
          <span class="sbx-zoom">{{ fixed(S.zoom, 1) }} px/cm</span>
          <button class="sbx-btn icon" type="button" @click="E.zoomIn()" :title="t('admin.simBeta.zoomIn')">
            <i class="fas fa-search-plus"></i>
          </button>
          <button class="sbx-btn icon" type="button" @click="E.fit()" :title="t('admin.simBeta.fit')">
            <i class="fas fa-expand"></i>
          </button>
        </div>
        <button class="sbx-export" type="button" @click="E.exportWorld()" :disabled="!S.map" :class="{ blocked: S.blocking }" :title="S.blocking ? t('admin.simBeta.exportBlocked') : t('admin.simMapEditor.exportW')">
          <i class="fas fa-globe"></i>.wbt
        </button>
      </header>
      <div class="sbx-body">
        <nav class="sbx-rail" :aria-label="t('admin.simBeta.toolsTitle')">
          <div v-for="(g, gi) in S.toolGroups" :key="gi">
            <div class="sbx-rail-sep" v-if="gi !== 0"></div>
            <button class="sbx-tool" type="button" v-for="x in g" :key="x.id" :data-tool="x.id" :class="{ active: S.ui.tool === x.id }" @click="E.setTool(x.id)" :disabled="!S.map" :title="t('admin.simBeta.tools.' + x.id) + ' (' + x.key + ')'" :aria-label="t('admin.simBeta.tools.' + x.id)">
              <i :class="x.icon"></i><span class="sbx-tool-key">{{ x.key }}</span>
            </button>
          </div>
        </nav>
        <aside class="sbx-tool-panel" v-if="S.map">
          <div class="sbx-tool-head"><span>{{ t('admin.simBeta.tools.' + S.ui.tool) }}</span><kbd>{{ E.toolKey(S.ui.tool) }}</kbd></div>
          <p class="sbx-help">{{ keys(t('admin.simBeta.help.' + S.ui.tool)) }}</p>
          <div v-if="S.ui.tool === 'select'">
            <p class="sbx-muted" v-if="!S.region">{{ keys(t('admin.simBeta.regionNone')) }}</p>
            <div v-if="S.region">
              <div class="sbx-region-size"><i class="far fa-object-group mr-1"></i>{{ t('admin.simBeta.regionSize', { size: E.regionSize() }) }}</div>
              <div class="sbx-region-actions">
                <button class="sbx-choice" type="button" @click="E.copyRegion()" :title="keys('Ctrl+C')">
                  <i class="far fa-copy fa-fw"></i>{{ t('admin.simBeta.copy') }}
                </button>
                <button class="sbx-choice" type="button" @click="E.cutRegion()" :title="keys('Ctrl+X')">
                  <i class="fas fa-cut fa-fw"></i>{{ t('admin.simBeta.cut') }}
                </button>
                <button class="sbx-choice" type="button" @click="E.duplicateRegion()" :title="keys('Ctrl+D')">
                  <i class="far fa-clone fa-fw"></i>{{ t('admin.simBeta.duplicate') }}
                </button>
                <button class="sbx-choice danger" type="button" @click="E.clearRegion()" title="Delete">
                  <i class="fas fa-trash-alt fa-fw"></i>{{ t('admin.simBeta.clearRegion') }}
                </button>
              </div>
              <p class="sbx-muted mt-2">{{ keys(t('admin.simBeta.regionHelp')) }}</p>
            </div>
            <button class="sbx-choice mt-2" type="button" @click="E.pasteRegion()" :disabled="!S.hasClip" :title="keys('Ctrl+V')">
              <i class="fas fa-paste fa-fw"></i>{{ t('admin.simBeta.paste') }}
            </button>
          </div>
          <div v-if="S.ui.tool === 'shape'">
            <!-- The size: the tiles across and down, typed in or stepped (it grows and shrinks at the
                 right and the bottom) -->
            <div class="sbx-size-box" :class="{ fresh: S.ui.freshMap }">
              <div class="sbx-size-head">
                <span class="sbx-size-title">{{ t('admin.simBeta.mapSize') }}</span>
                <span class="sbx-size-cm">{{ 12 * S.map.width }} × {{ 12 * S.map.length }} cm</span>
              </div>
              <div class="sbx-size" v-for="a in (['x', 'y'] as const)" :key="a">
                <label class="sbx-size-name" :for="'sbxSize' + a">{{ t(a === 'x' ? 'admin.simBeta.width' : 'admin.simBeta.length') }}</label>
                <div class="sbx-size-field">
                  <button type="button" @click="a === 'x' ? E.resize(-1, 0) : E.resize(0, -1)" :disabled="(a === 'x' ? S.map.width : S.map.length) <= 1" aria-label="−"><i class="fas fa-minus"></i></button>
                  <input :id="'sbxSize' + a" type="number" inputmode="numeric" min="1" max="40" :value="a === 'x' ? S.map.width : S.map.length"
                    @change="E.setSize(($event.target as HTMLInputElement), a)" @keydown.enter="($event.target as HTMLInputElement).blur()" @focus="($event.target as HTMLInputElement).select()">
                  <button type="button" @click="a === 'x' ? E.resize(1, 0) : E.resize(0, 1)" :disabled="(a === 'x' ? S.map.width : S.map.length) >= 40" aria-label="+"><i class="fas fa-plus"></i></button>
                </div>
                <span class="sbx-size-unit">{{ t('admin.simBeta.tiles') }}</span>
              </div>
              <p class="sbx-size-note">{{ t('admin.simBeta.mapSizeNote') }}</p>
            </div>
            <div class="sbx-label">{{ t('admin.simBeta.shapeEdit') }}</div>
            <div class="sbx-shape-modes">
              <button class="sbx-choice" type="button" v-for="m in S.shapeModes" :key="m.id" :class="[m.id, { active: S.ui.shapeMode === m.id }]" @click="S.ui.shapeMode = m.id">
                <i class="fas fa-fw" :class="m.icon"></i><span>{{ t('admin.simBeta.shapeModes.' + m.id) }}</span>
              </button>
            </div>
          </div>
          <div class="sbx-choices column" v-if="S.ui.tool === 'room'">
            <button class="sbx-choice" type="button" v-for="r in S.roomChoices" :key="r" :class="{ active: S.ui.room === r }" @click="S.ui.room = r">
              <i class="sbx-room" :class="'room' + r"></i>{{ t('admin.simBeta.room', { n: r }) }}<span class="sbx-choice-note">{{ t('admin.simBeta.roomNote' + r) }}</span>
            </button>
          </div>
          <div class="sbx-room4-block" v-if="S.ui.tool === 'room'">
            <div class="sbx-label">{{ t('admin.simBeta.room4') }}</div>
            <div class="sbx-room4">
              <p class="sbx-muted" v-if="E.room4State() === 'none'">{{ t('admin.simBeta.room4Hint') }}</p>
              <div v-else-if="E.room4State() === 'empty'">
                <p class="sbx-room4-state todo"><i class="fas fa-exclamation-circle"></i>{{ t('admin.simBeta.room4NotDrawn') }}</p>
              </div>
              <div v-else-if="E.room4State() === 'drawn'">
                <p class="sbx-room4-state done"><i class="fas fa-check-circle"></i>{{ t('admin.simBeta.room4Drawn') }}</p>
              </div>
              <div v-else-if="E.room4State() === 'preset'">
                <p class="sbx-room4-state todo"><i class="fas fa-exclamation-triangle"></i>{{ t('admin.simBeta.room4PresetBeta', { name: S.map.area4Room.value }) }}</p>
                <button class="btn btn-sm btn-outline-warning btn-block" type="button" @click="E.toCustomRoom4()">
                  <i class="fas fa-exchange-alt mr-1"></i>{{ t('admin.simBeta.room4ToCustom') }}
                </button>
              </div>
            </div>
            <button class="btn btn-sm btn-outline-primary btn-block mt-2" type="button" v-if="E.room4State() === 'empty' || E.room4State() === 'drawn'" @click="E.openRoom4()">
              <i class="fas fa-paint-brush mr-1"></i>{{ t('admin.simBeta.drawRoom4') }}
            </button>
            <p class="sbx-muted sbx-room4-dbl" v-if="E.room4State() === 'empty' || E.room4State() === 'drawn'">{{ t('admin.simBeta.drawRoom4Note') }}</p>
          </div>
          <div class="sbx-choices column" v-if="S.ui.tool === 'floor'">
            <button class="sbx-choice" type="button" v-for="f in S.floorChoices" :key="f.id" :class="{ active: S.ui.floor === f.id }" @click="S.ui.floor = f.id">
              <i class="fas fa-fw" :class="f.icon"></i>{{ t('admin.simBeta.floors.' + f.id) }}
            </button>
          </div>
          <div v-if="S.ui.tool === 'victim'">
            <div class="sbx-selected" v-if="S.selected">
              <div class="sbx-selected-head">
                <span><i class="fas fa-mouse-pointer mr-1"></i>{{ t('admin.simBeta.selectedVictim') }}</span>
                <button class="btn btn-sm btn-link p-0" type="button" @click="E.selectNone()">{{ t('admin.simBeta.selectDone') }}</button>
              </div>
              <div class="sbx-sel-head">
                <span class="sbx-sel-symbol target" v-if="E.isTarget(S.selected.victim.type)" :style="E.targetStyle(S.selected.victim.code)"></span>
                <span class="sbx-sel-symbol" v-if="!E.isTarget(S.selected.victim.type)" :class="{ fake: S.selected.victim.fake }">{{ E.symbolOf(S.selected.victim.type) }}</span>
                <span v-if="E.isTarget(S.selected.victim.type)">{{ t(S.selected.letter === 'X' ? 'admin.simMapEditor.ctFake' : 'admin.simMapEditor.ct' + S.selected.letter) }}</span>
                <span v-if="!E.isTarget(S.selected.victim.type) && S.selected.victim.fake">{{ t('admin.simBeta.fake') }}</span>
              </div>
              <div class="sbx-label" v-if="!E.isTarget(S.selected.victim.type)">{{ t('admin.simBeta.kind') }}</div>
              <div class="sbx-choices" v-if="!E.isTarget(S.selected.victim.type)">
                <button class="sbx-choice letter" type="button" v-for="v in S.victimChoices.slice(0, 3)" :key="v.id" :class="{ active: S.selected.victim.type === v.id }" @click="E.changeSelected({ type: v.id })">{{ v.symbol }}</button>
              </div>
              <label class="sbx-check" v-if="!E.isTarget(S.selected.victim.type)">
                <input type="checkbox" :checked="S.selected.victim.fake" @click="E.changeSelected({ fake: !S.selected.victim.fake })">{{ t('admin.simBeta.fake') }}</label>
              <div v-if="!E.isTarget(S.selected.victim.type)">
                <div class="sbx-label">{{ t('admin.simBeta.rot') }}</div>
                <RotationDial class="sbx-dial" :model-value="S.selected.rot" @update:model-value="(v: number) => S.selected!.rot = v" @change="E.changeSelected({ rot: S.selected!.rot })" :symbol="E.symbolOf(S.selected.victim.type)"></RotationDial>
              </div>
              <!-- where along its wall: dragged on the map, or here -->
              <div class="sbx-along" v-for="r in [E.selectedRange()]" :key="'along'">
                <template v-if="r">
                  <div class="sbx-label">{{ t('admin.simBeta.along') }}</div>
                  <div class="sbx-along-row">
                    <input type="range" class="sbx-along-range" :min="r.min" :max="r.max" step="0.1" :value="S.selected.offset" :disabled="r.min === r.max"
                      :aria-label="t('admin.simBeta.along')" @input="E.slideSelected(Number(($event.target as HTMLInputElement).value))" @change="E.slideDone()" @pointerup="E.slideDone()" @blur="E.slideDone()">
                    <span class="sbx-along-value">{{ E.offsetText(S.selected.offset) }} cm</span>
                  </div>
                  <div class="sbx-along-foot">
                    <span>{{ t('admin.simBeta.alongNote') }}</span>
                    <button class="btn btn-sm btn-link p-0" type="button" :disabled="!S.selected.offset" @click="E.moveSelected(0)">{{ t('admin.simBeta.alongMiddle') }}</button>
                  </div>
                </template>
              </div>
              <button class="btn btn-sm btn-outline-danger btn-block mt-3" type="button" @click="E.removeSelected()">
                <i class="fas fa-trash-alt mr-1"></i>{{ t('admin.simBeta.remove') }}
              </button>
            </div>
            <div class="sim-r4-panel sbx-stamps">
              <div class="sim-r4-stamps">
                <div class="sim-r4-stamp-group">
                  <span class="sim-r4-stamp-group-label">{{ t('admin.simMapEditor.room4Creator.groups.victim') }}</span>
                  <div class="sim-r4-stamp-row cols-3" v-for="row in S.victimRows" :key="row.label">
                    <span class="sim-r4-stamp-row-label">{{ t('admin.simMapEditor.room4Creator.rows.' + row.label) }}</span>
                    <button class="sim-r4-stamp" type="button" v-for="v in row.types" :key="v.name" :class="['kind-' + v.kind, { active: S.ui.victim === v.id && !!S.ui.fake === v.fake }]" @click="E.pickVictim(v)" :style="{ '--stamp-color': v.color }" :title="t(v.name)">
                      <span class="sim-r4-stamp-badge">{{ v.symbol }}</span><span class="sim-r4-stamp-name">{{ t(v.name) }}</span>
                    </button>
                  </div>
                </div>
                <div class="sim-r4-stamp-group">
                  <span class="sim-r4-stamp-group-label">{{ t('admin.simMapEditor.room4Creator.groups.ct') }}</span>
                  <div class="sim-r4-stamp-row cols-2">
                    <button class="sim-r4-stamp" type="button" v-for="c in S.ctStamps" :key="c.name" :class="['kind-' + c.kind, { active: E.isTarget(S.ui.victim) && E.ctLetter() === c.letter }]" @click="E.pickCt(c.letter!)" :style="{ '--stamp-color': c.color }" :title="t(c.name)">
                      <span class="sim-r4-stamp-badge">{{ c.symbol }}</span><span class="sim-r4-stamp-name">{{ t(c.name) }}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <CtRings v-if="S.selected ? E.isTarget(S.selected.victim.type) : E.isTarget(S.ui.victim)" :rings="E.pickerRings()" :ring="S.ui.ring" :colors="S.ringColors" :letter="E.ctLetter()" :sum="E.ctSum()" @pick-ring="(i: number) => S.ui.ring = i" @pick-color="E.pickColor"></CtRings>
            <div v-if="!S.selected && !E.isTarget(S.ui.victim)">
              <div class="sbx-label">{{ t('admin.simBeta.rot') }}</div>
              <div class="sbx-seg">
                <button type="button" :class="{ active: !S.ui.randomRot }" @click="S.ui.randomRot = false">
                  <i class="fas fa-compass mr-1"></i>{{ t('admin.simBeta.rotFixed') }}
                </button>
                <button type="button" :class="{ active: S.ui.randomRot }" @click="S.ui.randomRot = true">
                  <i class="fas fa-dice mr-1"></i>{{ t('admin.simBeta.rotRandom') }}
                </button>
              </div>
              <p class="sbx-rot-note" v-if="S.ui.randomRot">{{ t('admin.simBeta.rotRandomNote') }}</p>
              <RotationDial class="sbx-dial" v-if="!S.ui.randomRot" v-model="S.ui.rot" :symbol="E.victimSymbol()"></RotationDial>
            </div>
          </div>
        </aside>
        <main class="sbx-stage" id="simBetaStage" ref="stageEl" :class="'tool-' + S.ui.tool">
          <canvas id="simBetaCanvas" ref="canvasEl" @dblclick="E.canvasDblClick"></canvas>
          <section class="sbx-checks" v-if="S.map" :class="{ folded: S.ui.checksFolded, ok: !S.problems.length, bad: S.blocking }">
            <header class="sbx-checks-head" @click="S.ui.checksFolded = !S.ui.checksFolded" :title="t(S.ui.checksFolded ? 'admin.simBeta.checksOpen' : 'admin.simBeta.checksFold')">
              <i class="fas" :class="!S.problems.length ? 'fa-check-circle ok' : S.blocking ? 'fa-times-circle bad' : 'fa-exclamation-triangle warn'"></i>
              <span class="sbx-checks-title">{{ t('admin.simBeta.problemsTitle') }}</span>
              <span class="sbx-count" :class="{ ok: !S.problems.length, bad: S.blocking }">{{ S.problems.length }}</span>
              <i class="fas sbx-checks-chevron" :class="S.ui.checksFolded ? 'fa-chevron-down' : 'fa-chevron-up'"></i>
            </header>
            <div class="sbx-checks-body" v-if="!S.ui.checksFolded">
              <p class="sbx-ok" v-if="!S.problems.length">{{ t('admin.simBeta.noProblems') }}</p>
              <button class="sbx-fix-all" type="button" v-if="E.canFixAll()" @click="E.fixAll()">
                <i class="fas fa-magic mr-1"></i>{{ t('admin.simBeta.fixAll') }}
              </button>
              <ul class="sbx-problems" v-if="S.problems.length">
                <li v-for="(p, pi) in S.problems" :key="pi" :class="{ block: p.block, jump: p.at }" @click="E.showProblem(p)" @mouseenter="E.pointProblem(p)" @mouseleave="E.pointProblem(null)" :title="p.at ? t('admin.simBeta.showWhere') : ''">
                  <i class="fas" :class="p.block ? 'fa-times-circle' : 'fa-exclamation-triangle'"></i>
                  <span class="sbx-problem-text">{{ p.text }}</span>
                  <button class="sbx-fix" type="button" v-if="p.fix" @click="E.fixProblem(p, $event)" :title="t(p.fix === 'draw' ? 'admin.simBeta.fixDraw' : 'admin.simBeta.fixThis')">
                    <i class="fas" :class="p.fix === 'draw' ? 'fa-paint-brush' : 'fa-magic'"></i>{{ t(p.fix === 'draw' ? 'admin.simBeta.fixDrawShort' : 'admin.simBeta.fixShort') }}
                  </button>
                </li>
              </ul>
            </div>
          </section>
          <div class="sbx-empty" v-if="!S.map">
            <div class="sbx-empty-card">
              <i class="fas fa-drafting-compass sbx-empty-icon"></i>
              <h2>{{ t('admin.simBeta.emptyTitle') }}</h2>
              <p>{{ t('admin.simBeta.emptyLead') }}</p>
              <!-- the rules a new map is made with: the years the editor takes, and those on their way -->
              <div class="sbx-empty-rules">
                <span class="sbx-empty-rules-label" id="sbxEmptyRules"><i class="fas fa-book"></i>{{ t('admin.simBeta.rules.pick') }}</span>
                <div class="sbx-empty-rules-choices" role="radiogroup" aria-labelledby="sbxEmptyRules">
                  <button type="button" role="radio" v-for="y in S.ruleYears" :key="y.year" :aria-checked="S.ui.newYear === y.year" :class="{ active: S.ui.newYear === y.year }" @click="S.ui.newYear = y.year">
                    <i class="fas fa-check-circle"></i>{{ t('admin.simBeta.rules.label', { year: y.year }) }}
                  </button>
                  <button type="button" role="radio" class="soon" v-for="y in S.upcomingYears" :key="y" aria-checked="false" disabled>
                    {{ t('admin.simBeta.rules.label', { year: y }) }}<span class="sbx-rules-soon">{{ t('admin.simBeta.rules.soon') }}</span>
                  </button>
                </div>
                <small class="sbx-empty-rules-note">{{ t('admin.simBeta.rules.pickNote') }}</small>
              </div>
              <div class="sbx-empty-actions">
                <button class="btn btn-primary" type="button" @click="E.newMap()"><i class="fas fa-file mr-2"></i>{{ t('admin.simBeta.new') }}</button>
                <button class="btn btn-outline-secondary" type="button" @click="chooseFile()">
                  <i class="fas fa-folder-open mr-2"></i>{{ t('admin.simBeta.openJson') }}
                </button>
              </div>
              <button class="btn btn-outline-primary btn-block mt-2 sbx-restore" type="button" v-if="S.kept" @click="E.restoreKept()">
                <span><i class="fas fa-history mr-2"></i>{{ t('admin.simBeta.restore') }}</span>
                <small class="sbx-restore-what">{{ S.kept.name }} · {{ monthDayTime(S.kept.time) }}</small>
              </button>
              <div class="sbx-empty-drop">{{ t('admin.simBeta.dropHere') }}</div>
              <button class="sbx-empty-tour" type="button" @click="E.openGuidePick()">
                <i class="fas fa-graduation-cap"></i>
                <span><strong>{{ t('admin.simBeta.tourEmpty') }}</strong><small>{{ t('admin.simBeta.tourEmptyNote') }}</small></span>
                <i class="fas fa-chevron-right"></i>
              </button>
              <div class="sbx-error" v-if="S.error">{{ t(S.error, S.errorParams) }}</div>
            </div>
          </div>
        </main>
      </div>
      <div class="sbx-dialog-back" v-if="S.dialog" @click="E.closeDialog(null)">
        <div class="sbx-dialog" role="alertdialog" aria-modal="true" aria-labelledby="sbxDialogTitle" :class="'kind-' + S.dialog.kind" @click.stop>
          <div class="sbx-dialog-head">
            <span class="sbx-dialog-icon"><i class="fas" :class="({ error: 'fa-times', warn: 'fa-exclamation', info: 'fa-info' } as Record<string, string>)[S.dialog.kind || 'info']"></i></span>
            <h2 id="sbxDialogTitle">{{ S.dialog.title }}</h2>
            <button class="sbx-dialog-x" type="button" @click="E.closeDialog(null)" :aria-label="t('admin.simBeta.close')">
              <i class="fas fa-times"></i>
            </button>
          </div>
          <p class="sbx-dialog-message" v-if="S.dialog.message">{{ S.dialog.message }}</p>
          <ul class="sbx-dialog-items" v-if="S.dialog.items && S.dialog.items.length">
            <li v-for="(p, pi) in S.dialog.items" :key="pi" :class="{ jump: p.at }" @click="p.at && E.dialogItem(p)" :title="p.at ? t('admin.simBeta.showWhere') : ''">
              <i class="fas" :class="p.block ? 'fa-times-circle' : 'fa-exclamation-triangle'"></i>
              <span>{{ p.text }}</span>
              <i class="fas fa-crosshairs sbx-jump" v-if="p.at"></i>
            </li>
          </ul>
          <div class="sbx-dialog-actions">
            <button class="sbx-dialog-btn" type="button" v-for="(a, ai) in S.dialog.actions" :key="ai" :class="a.style" @click="E.closeDialog(a.value)">
              <i class="fas mr-1" v-if="a.icon" :class="a.icon"></i>{{ a.label }}
            </button>
          </div>
        </div>
      </div>
      <footer class="sbx-status">
        <span class="sbx-hint sbx-notice" v-if="S.notice" :class="S.notice.kind"><i class="fas" :class="({ ok: 'fa-check-circle', warn: 'fa-exclamation-triangle', info: 'fa-info-circle' } as Record<string, string>)[S.notice.kind]"></i><span class="sbx-hint-text" :title="S.notice.text">{{ S.notice.text }}</span></span>
        <span class="sbx-hint" v-if="!S.notice && S.hint"><i class="fas fa-mouse-pointer"></i><span class="sbx-hint-text" :title="S.hint">{{ S.hint }}</span></span>
        <span class="sbx-tool-hint" v-if="!S.notice && !S.hint && !S.ui.showLinear && E.toolHint()"><i class="fas fa-lightbulb"></i><span class="sbx-hint-text" :title="E.toolHint()">{{ E.toolHint() }}</span></span>
        <span class="sbx-legend" v-if="!S.notice && !S.hint && S.ui.showLinear && !E.linearNoStart()">
          <span><i class="sbx-key linear"></i>{{ t('admin.simBeta.legendLinear') }}</span>
          <span><i class="sbx-key floating"></i>{{ t('admin.simBeta.legendFloating') }}</span>
          <span><i class="sbx-key floating-wall"></i>{{ t('admin.simBeta.legendFloatingWall') }}</span>
          <span v-if="E.linearUnreached()"><i class="sbx-key unreached"></i>{{ t('admin.simBeta.legendUnreached') }}</span>
        </span>
        <span class="sbx-hint" v-if="!S.notice && !S.hint && S.ui.showLinear && E.linearNoStart()"><i class="fas fa-info-circle"></i><span class="sbx-hint-text">{{ t('admin.simBeta.linearNoStart') }}</span></span>
        <BuildInfo></BuildInfo>
        <span class="sbx-status-tools">
          <LangMenu :lang="S.lang" @pick="E.switchLang"></LangMenu>
          <button class="sbx-status-btn sbx-tour-btn" type="button" @click="E.openGuidePick()" :title="t('admin.simBeta.tourStart')" aria-haspopup="dialog">
            <i class="far fa-question-circle"></i><span>{{ t('admin.simBeta.tourShort') }}</span><span class="sbx-tour-dot" v-if="!S.tourSeen"></span>
          </button>
        </span>
      </footer>
    </div>
    <div class="sbx-pick-back" v-if="S.ui.guidePick" @click="E.closeGuidePick()">
      <div class="sbx-pick" :class="{ wide: S.ui.guidePick === 'keys' }" role="dialog" aria-modal="true" aria-labelledby="sbxPickTitle" @click.stop>
        <div class="sbx-pick-head">
          <h2 id="sbxPickTitle">{{ t(S.ui.guidePick === 'room4' ? 'admin.simBeta.pickRoom4Title' : S.ui.guidePick === 'keys' ? 'admin.simBeta.keySheet.title' : 'admin.simBeta.pickTitle') }}</h2>
          <button class="sbx-tour-x" type="button" @click="E.closeGuidePick()" :aria-label="t('admin.simBeta.close')">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <template v-if="S.ui.guidePick === 'keys'">
          <div class="sbx-keys">
            <section v-for="g in KEY_SHEET" :key="g.id">
              <h3>{{ t('admin.simBeta.keySheet.' + g.id) }}</h3>
              <dl>
                <div class="sbx-keys-row" v-for="r in g.rows" :key="r.id">
                  <dt>{{ t('admin.simBeta.keySheet.rows.' + r.id) }}</dt>
                  <dd><kbd v-for="(k, ki) in r.keys" :key="ki">{{ keyName(k) }}</kbd></dd>
                </div>
              </dl>
            </section>
          </div>
        </template>
        <p class="sbx-pick-lead" v-if="S.ui.guidePick !== 'keys'">{{ t('admin.simBeta.pickLead') }}</p>
        <div class="sbx-pick-options" v-if="S.ui.guidePick !== 'keys'">
          <button class="sbx-pick-option" type="button" v-if="S.ui.guidePick !== 'room4'" @click="E.pickGuide('lesson')">
            <span class="sbx-pick-icon lesson"><i class="fas fa-graduation-cap"></i></span>
            <span class="sbx-pick-text"><strong>{{ t('admin.simBeta.guideLesson') }}</strong><span class="sbx-pick-time">{{ t('admin.simBeta.pickLessonTime') }}</span><small>{{ t('admin.simBeta.pickLessonNote') }}</small><small class="sbx-pick-warn" v-if="S.map">{{ t('admin.simBeta.pickLessonMap') }}</small></span>
          </button>
          <button class="sbx-pick-option" type="button" v-if="S.ui.guidePick !== 'room4'" @click="E.pickGuide('tour')">
            <span class="sbx-pick-icon tour"><i class="fas fa-route"></i></span>
            <span class="sbx-pick-text"><strong>{{ t('admin.simBeta.guideTour') }}</strong><span class="sbx-pick-time">{{ t('admin.simBeta.pickTourTime') }}</span><small>{{ t('admin.simBeta.pickTourNote') }}</small></span>
          </button>
          <button class="sbx-pick-option" type="button" @click="E.pickGuide('room4')" :disabled="!E.room4Ready()">
            <span class="sbx-pick-icon room4"><i class="fas fa-paint-brush"></i></span>
            <span class="sbx-pick-text"><strong>{{ t('admin.simBeta.guideRoom4') }}</strong><span class="sbx-pick-time">{{ t('admin.simBeta.pickRoom4Time') }}</span><small>{{ t(E.room4Ready() ? 'admin.simBeta.pickRoom4Note' : 'admin.simBeta.guideRoom4Need') }}</small></span>
          </button>
          <button class="sbx-pick-option" type="button" @click="E.pickGuide('room4tour')" :disabled="!E.room4Ready()">
            <span class="sbx-pick-icon room4look"><i class="fas fa-binoculars"></i></span>
            <span class="sbx-pick-text"><strong>{{ t('admin.simBeta.guideRoom4Tour') }}</strong><span class="sbx-pick-time">{{ t('admin.simBeta.pickRoom4TourTime') }}</span><small>{{ t(E.room4Ready() ? 'admin.simBeta.pickRoom4TourNote' : 'admin.simBeta.guideRoom4Need') }}</small></span>
          </button>
        </div>
        <div class="sbx-pick-foot">
          <button class="sbx-pick-keys" type="button" v-if="S.ui.guidePick === 'main'" @click="E.openGuidePick('keys')"><i class="far fa-keyboard"></i>{{ t('admin.simBeta.keySheet.open') }}<kbd>?</kbd></button>
          <button class="sbx-pick-keys" type="button" v-if="S.ui.guidePick === 'keys'" @click="E.openGuidePick('main')"><i class="fas fa-arrow-left"></i>{{ t('admin.simBeta.keySheet.back') }}</button>
          <button class="sbx-tour-skip" type="button" @click="E.closeGuidePick()">{{ t(S.ui.guidePick === 'keys' ? 'admin.simBeta.close' : 'admin.simBeta.pickLater') }}</button>
        </div>
      </div>
    </div>
    <div class="sbx-tour" v-if="S.tour" :class="['kind-' + S.tour.kind, { ready: S.tour.ready, look: E.tourLook() }]">
      <div class="sbx-tour-block" v-if="E.tourLook()" @click.stop></div>
      <svg class="sbx-tour-shade" aria-hidden="true">
        <defs>
          <mask id="sbxTourMask" maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%">
            <rect x="0" y="0" width="100%" height="100%" fill="#fff"></rect>
            <rect v-for="(q, qi) in S.tour.lit" :key="qi" :x="q.left" :y="q.top" :width="q.right - q.left" :height="q.bottom - q.top" rx="10" fill="#000"></rect>
          </mask>
        </defs>
        <rect class="sbx-tour-dim" x="0" y="0" width="100%" height="100%" mask="url(#sbxTourMask)"></rect>
        <polyline class="sbx-tour-guide" v-for="(g, gi) in S.tour.guides" :key="gi" :points="g"></polyline>
      </svg>
      <div class="sbx-tour-ring" v-if="S.tour.hole" :style="S.tour.hole"></div>
      <div class="sbx-tour-ring extra" v-for="(m, mi) in S.tour.marks" :key="'m' + mi" :style="m"></div>
      <div class="sbx-tour-ring place" v-for="(m, mi) in S.tour.regions" :key="'r' + mi" :style="m"></div>
      <div class="sbx-tour-card" role="dialog" aria-labelledby="sbxTourTitle" :style="S.tour.card" :class="{ welcome: E.tourStep()!.plan || E.tourStep()!.id === 'welcome', done: S.tour.done, compact: S.tour.compact }">
        <div class="sbx-tour-head">
          <span class="sbx-tour-chapter">{{ t('admin.simBeta.tour.chapters.' + E.tourStep()!.chapter) }}</span>
          <span class="sbx-tour-count">{{ S.tour.i + 1 }} / {{ S.tour.steps.length }}</span>
          <button class="sbx-tour-fold" type="button" v-if="!E.tourLook()" @click="E.tourFold()" :title="t(S.tour.compact ? 'admin.simBeta.lessonUnfold' : 'admin.simBeta.lessonFold')" :aria-expanded="S.tour.compact ? 'false' : 'true'">
            <i class="fas" :class="S.tour.compact ? 'fa-chevron-down' : 'fa-chevron-up'"></i>
            <span>{{ t(S.tour.compact ? 'admin.simBeta.lessonUnfold' : 'admin.simBeta.lessonFold') }}</span>
          </button>
          <button class="sbx-tour-x" type="button" @click="E.endTour()" :title="t('admin.simBeta.tourEnd')" :aria-label="t('admin.simBeta.tourEnd')">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="sbx-tour-progress">
          <button type="button" v-for="c in S.tour.chapters" :key="c.id" @click="E.tourJump(c.first)" :class="{ on: c.on }" :style="{ flex: '1 1 ' + c.count + 'px' }" :title="t('admin.simBeta.tour.chapters.' + c.id)">
            <span :style="{ width: (100 * c.done / c.count) + '%' }"></span>
          </button>
        </div>
        <div class="sbx-tour-icon" v-if="E.tourStep()!.id === 'welcome'"><i class="fas fa-drafting-compass"></i></div>
        <svg class="sbx-tour-plan" v-if="E.tourStep()!.plan" :viewBox="'-2 -2 ' + (S.tourPlan.w + 4) + ' ' + (S.tourPlan.h + 4)" role="img" :aria-label="t('admin.simBeta.lesson.planLabel')">
          <rect v-for="(x, xi) in S.tourPlan.tiles" :key="xi" :x="x.x" :y="x.y" width="12" height="12" :fill="x.fill" stroke="#cbd5e1" stroke-width="0.4"></rect>
          <polyline v-for="(w, wi) in S.tourPlan.walls" :key="'w' + wi" :points="w" fill="none" stroke="#1e293b" stroke-width="1.2"></polyline>
          <circle v-for="(p, pi) in S.tourPlan.passages" :key="'p' + pi" :cx="p.x" :cy="p.y" r="2.6" :fill="p.c"></circle>
          <path :d="'M' + (S.tourPlan.start.x - 2.5) + ' ' + (S.tourPlan.start.y - 3) + 'L' + (S.tourPlan.start.x + 3) + ' ' + S.tourPlan.start.y + 'L' + (S.tourPlan.start.x - 2.5) + ' ' + (S.tourPlan.start.y + 3) + 'Z'" fill="#16a34a"></path>
          <text v-for="(l, li) in S.tourPlan.labels" :key="'l' + li" :x="l.x" :y="l.y + 2" text-anchor="middle" font-size="6" font-weight="700" fill="#475569">{{ t('admin.simBeta.room', { n: l.n }) }}</text>
        </svg>
        <h2 id="sbxTourTitle">{{ E.tourText('title') }}</h2>
        <div class="sbx-tour-body"><p v-for="(line, li) in E.tourLines()" :key="li">{{ line }}</p></div>
        <div class="sbx-tour-keys" v-if="E.tourStep()!.keys"><kbd v-for="k in E.tourStep()!.keys" :key="k">{{ keys(k) }}</kbd></div>
        <div class="sbx-tour-task" v-if="E.tourText('task')" :class="{ done: S.tour.done, changed: !S.tour.done && S.tour.task }">
          <i class="fas" :class="S.tour.done ? 'fa-check-circle' : S.tour.task ? 'fa-exclamation-circle' : 'fa-hand-point-right'"></i>
          <span><strong>{{ t(S.tour.done ? 'admin.simBeta.lessonDone' : 'admin.simBeta.lessonTodo') }}</strong>{{ E.tourTask() }}</span>
        </div>
        <button class="sbx-tour-inner" type="button" v-if="S.tour.kind === 'tour' && E.tourStep()!.id === 'room4' && E.room4Ready()" @click="E.tourRoom4Inside()">
          <i class="fas fa-paint-brush"></i><span>{{ t('admin.simBeta.tourRoom4Inside') }}</span><i class="fas fa-chevron-right"></i>
        </button>
        <div class="sbx-tour-closed" v-if="E.tourCreatorOver()">
          <i class="fas fa-info-circle"></i>
          <span>{{ t('admin.simBeta.lessonCreatorOver') }}</span>
          <button class="sbx-tour-nav" type="button" @click="E.tourCloseCreator()">
            <i class="fas fa-check mr-1"></i>{{ t('admin.simBeta.lessonCloseCreator') }}
          </button>
        </div>
        <div class="sbx-tour-closed" v-if="E.tourCreatorClosed()">
          <i class="fas fa-info-circle"></i>
          <span>{{ t('admin.simBeta.lessonCreatorClosed') }}</span>
          <button class="sbx-tour-nav" type="button" @click="E.tourOpenCreator()">
            <i class="fas fa-paint-brush mr-1"></i>{{ t('admin.simBeta.lessonOpenCreator') }}
          </button>
        </div>
        <div class="sbx-tour-actions">
          <button class="sbx-tour-skip" type="button" v-if="E.tourLook() && S.tour.i < S.tour.steps.length - 1" @click="E.endTour()">{{ t('admin.simBeta.tourSkip') }}</button>
          <span class="sbx-spacer"></span>
          <button class="sbx-tour-nav" type="button" v-if="S.tour.i > 0" @click="E.tourGo(-1)" :title="t('admin.simBeta.tourBack')">
            <i class="fas fa-arrow-left"></i>
          </button>
          <button class="sbx-tour-nav auto" type="button" v-if="E.tourStep()!.auto && !S.tour.done" @click="E.tourDoIt()" :disabled="E.tourCreatorClosed()">
            <i class="fas fa-magic mr-1"></i>{{ t('admin.simBeta.lessonDoIt') }}
          </button>
          <button class="sbx-tour-nav primary" type="button" @click="E.tourGo(1)" :disabled="!E.tourLook() && !!E.tourStep()!.goal && !S.tour.done">
            <span v-if="S.tour.i === 0">{{ t('admin.simBeta.tourBegin') }}</span>
            <span v-if="S.tour.i > 0 && S.tour.i < S.tour.steps.length - 1">{{ t('admin.simBeta.tourNext') }}</span>
            <span v-if="S.tour.i === S.tour.steps.length - 1">{{ t('admin.simBeta.tourFinish') }}</span>
            <i class="fas ml-1" :class="S.tour.i === S.tour.steps.length - 1 ? 'fa-check' : 'fa-arrow-right'"></i>
          </button>
        </div>
        <div class="sbx-tour-back" v-if="S.tour.outer">
          <i class="fas fa-level-up-alt fa-rotate-270"></i>{{ t('admin.simBeta.tourBackTo', { name: t('admin.simBeta.' + (S.tour.outer.tour.kind === 'tour' ? 'guideTour' : 'guideLesson')) }) }}
        </div>
        <div class="sbx-tour-tip" v-if="E.tourLook()">{{ t('admin.simBeta.tourKeys') }}</div>
        <div class="sbx-tour-foot" v-if="!E.tourLook()">
          <button class="sbx-tour-skip" type="button" v-if="E.tourStep()!.goal && !S.tour.done" @click="E.tourGo(1, true)">{{ t('admin.simBeta.lessonSkip') }}</button>
          <span class="sbx-tour-tip">{{ t('admin.simBeta.lessonTip') }}</span>
        </div>
      </div>
    </div>
    <Modal v-if="S.room4" :open="S.room4.open" window-class="sim-r4-window sbx-r4-full" size="xl" @dismiss="E.closeRoom4()" @gone="E.room4Gone()">
      <Room4Creator :editor="E"></Room4Creator>
    </Modal>
  </template>
</template>
