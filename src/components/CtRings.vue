<script setup lang="ts">
// The rings of a cognitive target (K R Y G B from the outside in): the target to pick a ring on,
// its type and the sum of the ring values, and the colours to give the picked ring
import { t } from '../i18n';
import * as Icons from '../lib/icons';

const props = defineProps<{
    rings: string[];
    ring: number;
    colors: { id: string; color: string; value: number }[];
    letter: string;
    sum: number;
}>();
const emit = defineEmits<{ (e: 'pick-ring', i: number): void; (e: 'pick-color', id: string): void }>();

// the type's mark and name (no letter: F P C O mean nothing at a glance)
function typeName() {
    return t('targets.types.' + props.letter);
}
function typeMark() {
    return { background: Icons.markBackground(Icons.TYPE[props.letter] || Icons.TYPE.X) };
}
function ringColor(i: number) {
    const c = props.colors.find(function (r) { return r.id === props.rings[i]; });
    return c ? c.color : '#fff';
}
</script>

<template>
  <div class="sbx-ct">
    <div class="sbx-ct-top">
      <svg class="sbx-ct-target" viewBox="0 0 100 100" role="img" :aria-label="t('targets.rings')">
        <circle v-for="r in [0, 1, 2, 3, 4]" :key="r" cx="50" cy="50" :r="48 - 9 * r" :fill="ringColor(r)" @click="emit('pick-ring', r)" stroke="#fff" stroke-width="1"></circle>
        <circle class="sbx-ct-sel" cx="50" cy="50" :r="43.5 - 9 * ring" fill="none"></circle>
      </svg>
      <div class="sbx-ct-info">
        <span class="sbx-ct-type"><span class="sbx-ct-mark" :style="typeMark()"></span>{{ typeName() }}</span>
        <div class="sbx-ct-sum">{{ t('targets.sum') }} {{ sum > 0 ? '+' : '' }}{{ sum }}</div>
        <div class="sbx-ct-code">
          <span v-for="(c, i) in rings" :key="i" :class="{ sel: ring === i }" @click="emit('pick-ring', i)">{{ c }}</span>
        </div>
      </div>
    </div>
    <div class="sbx-ct-hint">{{ t('targets.hint', { n: ring + 1 }) }}</div>
    <div class="sbx-ct-palette">
      <button class="sbx-ct-swatch" type="button" v-for="c in colors" :key="c.id" @click="emit('pick-color', c.id)" :class="{ active: rings[ring] === c.id }" :title="c.id">
        <span class="sbx-ct-dot" :style="{ background: c.color }"></span><span class="sbx-ct-val">{{ c.value > 0 ? '+' : '' }}{{ c.value }}</span>
      </button>
    </div>
  </div>
</template>
