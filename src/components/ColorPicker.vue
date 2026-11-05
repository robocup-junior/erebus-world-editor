<script setup lang="ts">
// A colour picker of the editor's own (the same on every system, unlike the browser's): a square of
// saturation across and brightness down for the hue picked on the bar below it, and the colour as
// #rrggbb to type. `input` as it is dragged, `change` once it is let go or typed.
import { ref, watch } from 'vue';
import { t } from '../i18n';

const props = defineProps<{ modelValue: string }>();
const emit = defineEmits<{ (e: 'input', hex: string): void; (e: 'change', hex: string): void }>();

// hue 0-360, saturation and value 0-1: kept here, so a grey keeps the hue it was dragged from
const hsv = ref(toHsv(props.modelValue));
const text = ref(props.modelValue);
watch(function () { return props.modelValue; }, function (v) {
    if (v.toLowerCase() !== toHex(hsv.value).toLowerCase()) hsv.value = toHsv(v);
    text.value = v;
});

function toHsv(hex: string) {
    const ok = /^#[0-9a-f]{6}$/i.test(hex);
    const [r, g, b] = ok ? [1, 3, 5].map(function (i) { return parseInt(hex.slice(i, i + 2), 16) / 255; }) : [0.7, 0.7, 0.7];
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
}
function toHex(c: { h: number; s: number; v: number }) {
    const f = function (n: number) {
        const k = (n + c.h / 60) % 6;
        return c.v - c.v * c.s * Math.max(0, Math.min(k, 4 - k, 1));
    };
    return '#' + [f(5), f(3), f(1)].map(function (x) { return Math.round(x * 255).toString(16).padStart(2, '0'); }).join('');
}

// a drag on the square or the bar: the colour follows the pointer; one change when let go
function drag(e: PointerEvent, part: 'square' | 'hue') {
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const at = function (ev: PointerEvent) {
        const r = el.getBoundingClientRect();
        const x = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)), y = Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height));
        if (part === 'hue') hsv.value = { h: x * 360, s: hsv.value.s, v: hsv.value.v };
        else hsv.value = { h: hsv.value.h, s: x, v: 1 - y };
        emit('input', toHex(hsv.value));
    };
    const up = function () {
        el.removeEventListener('pointermove', at);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
        emit('change', toHex(hsv.value));
    };
    at(e);
    el.addEventListener('pointermove', at);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
}
// the colour typed: taken once it is a whole #rrggbb (the # may be left out)
function typed() {
    const v = text.value.trim().replace(/^#?/, '#').toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(v)) { text.value = props.modelValue; return; }
    hsv.value = toHsv(v);
    emit('input', v);
    emit('change', v);
}
</script>

<template>
  <div class="ed-color-picker">
    <div class="ed-color-sv" :style="{ background: 'hsl(' + hsv.h + ', 100%, 50%)' }" @pointerdown="drag($event, 'square')">
      <div class="ed-color-sv-white"></div>
      <div class="ed-color-sv-black"></div>
      <span class="ed-color-knob" :style="{ left: hsv.s * 100 + '%', top: (1 - hsv.v) * 100 + '%', background: modelValue }"></span>
    </div>
    <div class="ed-color-hue" @pointerdown="drag($event, 'hue')">
      <span class="ed-color-knob" :style="{ left: hsv.h / 3.6 + '%', top: '50%', background: 'hsl(' + hsv.h + ', 100%, 50%)' }"></span>
    </div>
    <div class="ed-color-row">
      <span class="ed-color-now" :style="{ background: modelValue }"></span>
      <input class="form-control form-control-sm ed-color-hex" type="text" maxlength="7" spellcheck="false" v-model="text" :aria-label="t('obstacles.fields.color')"
        @change="typed()" @keydown.enter="typed()">
    </div>
  </div>
</template>

<style scoped>
.ed-color-picker { display: flex; flex-direction: column; gap: 0.45rem; padding: 0.5rem; border: 1px solid var(--ed-line, #e2e8f0); border-radius: 8px; background: #fff; }
.ed-color-sv { position: relative; height: 7rem; border-radius: 6px; cursor: crosshair; touch-action: none; }
.ed-color-sv-white, .ed-color-sv-black { position: absolute; inset: 0; border-radius: 6px; pointer-events: none; }
.ed-color-sv-white { background: linear-gradient(to right, #fff, rgba(255, 255, 255, 0)); }
.ed-color-sv-black { background: linear-gradient(to top, #000, rgba(0, 0, 0, 0)); }
.ed-color-hue { position: relative; height: 0.8rem; border-radius: 999px; cursor: pointer; touch-action: none;
    background: linear-gradient(to right, #f00 0%, #ff0 16.7%, #0f0 33.3%, #0ff 50%, #00f 66.7%, #f0f 83.3%, #f00 100%); }
.ed-color-knob { position: absolute; width: 0.9rem; height: 0.9rem; border: 2px solid #fff; border-radius: 50%; box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.45); transform: translate(-50%, -50%); pointer-events: none; }
.ed-color-row { display: flex; align-items: center; gap: 0.4rem; }
.ed-color-now { flex: none; width: 1.6rem; height: 1.6rem; border-radius: 4px; border: 1px solid #cbd5e1; }
.ed-color-hex { font-family: ui-monospace, monospace; }
</style>
