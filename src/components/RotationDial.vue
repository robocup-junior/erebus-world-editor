<script setup lang="ts">
// Rotation dial of a victim / cognitive target token (v-model: the turn in degrees). Drag on the dial
// (0° at the top, clockwise; snaps to 5°, or 1° with Shift), arrow keys (1°, 15° with Shift), the
// steps, the presets, a typed value, or a random turn. `change` comes when the user changes it.
import { ref, watch } from 'vue';
import { t } from '../i18n';
import * as Icons from '../lib/icons';
import VictimGlyph from './VictimGlyph.vue';

// mark: a cognitive target's type colour (its mark is shown instead of a symbol); face: a smiley
// victim's face (shown instead of its symbol)
const props = defineProps<{ modelValue: number | null | undefined; symbol?: string | null; face?: string | null; image?: string | null; mark?: string | null; disabled?: boolean }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: number): void; (e: 'change', v: number): void }>();

function normalize(value: unknown) {
    const n = Math.round(Number(value) || 0);
    return ((n % 360) + 360) % 360;
}

const angle = ref(normalize(props.modelValue));
const angleInput = ref<number | string>(angle.value);
// the value last given to the model (a set to it again changes nothing)
let committed: unknown = props.modelValue;

watch(function () { return props.modelValue; }, function (v) {
    committed = v;
    angle.value = normalize(v);
    angleInput.value = angle.value;
});

function set(value: unknown) {
    if (props.disabled) return;
    angle.value = normalize(value);
    angleInput.value = angle.value;
    if (angle.value === committed) return;
    committed = angle.value;
    emit('update:modelValue', angle.value);
    emit('change', angle.value);
}
function step(delta: number) {
    set(angle.value + delta);
}
function random() {
    set(Math.floor(Math.random() * 360));
}
function typed(e: Event) {
    const raw = (e.target as HTMLInputElement).value;
    angleInput.value = raw === '' ? '' : Number(raw);
    if (raw === '' || isNaN(Number(raw))) return;
    set(Number(raw));
}

function angleFromEvent(dial: HTMLElement, event: PointerEvent) {
    const rect = dial.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const deg = Math.atan2(dx, -dy) * 180 / Math.PI;
    const snap = event.shiftKey ? 1 : 5;
    return Math.round(deg / snap) * snap;
}

function pointerDown(event: PointerEvent) {
    const dial = (event.target as HTMLElement).closest('.sim-rot-dial') as HTMLElement | null;
    if (!dial || props.disabled) return;
    event.preventDefault();
    dial.focus();
    dial.setPointerCapture(event.pointerId);
    set(angleFromEvent(dial, event));
    function move(e: PointerEvent) {
        set(angleFromEvent(dial!, e));
    }
    function up() {
        dial!.removeEventListener('pointermove', move);
        dial!.removeEventListener('pointerup', up);
        dial!.removeEventListener('pointercancel', up);
    }
    dial.addEventListener('pointermove', move);
    dial.addEventListener('pointerup', up);
    dial.addEventListener('pointercancel', up);
}

function keyDown(event: KeyboardEvent) {
    if (!(event.target as HTMLElement).closest('.sim-rot-dial') || props.disabled) return;
    const amount = event.shiftKey ? 15 : 1;
    let delta = 0;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') delta = amount;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') delta = -amount;
    if (!delta) return;
    event.preventDefault();
    step(delta);
}
</script>

<template>
  <sim-rotation-dial @pointerdown="pointerDown" @keydown="keyDown">
    <div class="sim-rot" :class="{ disabled: disabled }">
      <div class="sim-rot-dial" role="slider" :tabindex="disabled ? -1 : 0" aria-valuemin="0" aria-valuemax="359" :aria-valuenow="angle" :title="t('admin.simMapEditor.rotDialHint')">
        <span class="sim-rot-tick t0">0°</span>
        <span class="sim-rot-tick t90">90°</span>
        <span class="sim-rot-tick t180">180°</span>
        <span class="sim-rot-tick t270">270°</span>
        <div class="sim-rot-arm" :style="{ transform: 'rotate(' + angle + 'deg)' }"><span class="sim-rot-knob"></span></div>
        <div class="sim-rot-card" :class="{ 'has-image': image }" :style="{ transform: 'translate(-50%, -50%) rotate(' + angle + 'deg)' }">
          <img class="sim-rot-image" v-if="image" :src="image" :alt="symbol || ''">
          <span class="sim-rot-mark" v-if="!image && mark" :style="{ background: Icons.markBackground(mark) }"></span>
          <span class="sim-rot-symbol" v-if="!image && !mark" :class="{ placeholder: !symbol && !face }"><VictimGlyph :symbol="symbol || 'Φ'" :face="face"></VictimGlyph></span>
        </div>
      </div>
      <div class="sim-rot-controls">
        <div class="sim-rot-value">
          <button type="button" class="sim-rot-step" @click="step(-15)" :disabled="disabled" title="-15°">
            <i class="fas fa-undo-alt"></i>
          </button>
          <span class="sim-rot-input">
            <input type="number" min="0" max="359" :value="angleInput" @input="typed" @blur="angleInput = angle" :disabled="disabled">
            <span class="sim-rot-unit">°</span>
          </span>
          <button type="button" class="sim-rot-step" @click="step(15)" :disabled="disabled" title="+15°">
            <i class="fas fa-redo-alt"></i>
          </button>
        </div>
        <div class="sim-rot-presets">
          <button type="button" v-for="p in [0, 90, 180, 270]" :key="p" :class="{ active: angle === p }" @click="set(p)" :disabled="disabled"><span class="sim-rot-num">{{ p }}<span class="sim-rot-deg">°</span></span></button>
          <button type="button" class="sim-rot-random" @click="random()" :disabled="disabled" :title="t('admin.simMapEditor.rotRandom')">
            <i class="fas fa-dice"></i>
          </button>
        </div>
        <div class="sim-rot-help">{{ t('admin.simMapEditor.rotHelp') }}</div>
      </div>
    </div>
  </sim-rotation-dial>
</template>
