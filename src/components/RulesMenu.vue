<script setup lang="ts">
// The rules of the map open, in the top bar: its year; clicked, the years the editor takes (each
// with its rule book; a year whose rules are a draft says so) to switch the map to, and the years on
// their way (not to be picked yet)
import { ref, onBeforeUnmount } from 'vue';
import { t } from '../i18n';

const props = defineProps<{ year: number; years: { year: number; book: string; draft: boolean }[]; upcoming: number[] }>();
const emit = defineEmits<{ (e: 'pick', year: number): void }>();

const open = ref(false);
const root = ref<HTMLElement | null>(null);

function away(e: Event) { if (root.value && !root.value.contains(e.target as Node)) close(); }
function key(e: KeyboardEvent) { if (e.key === 'Escape') close(); }
function close() {
    open.value = false;
    document.removeEventListener('pointerdown', away);
    document.removeEventListener('keydown', key);
}
function toggle() {
    if (open.value) { close(); return; }
    open.value = true;
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key);
}
function draft(year: number) {
    return props.years.some(function (y) { return y.year === year && y.draft; });
}
function pick(year: number) {
    close();
    if (year !== props.year) emit('pick', year);
}
onBeforeUnmount(close);
</script>

<template>
  <span class="ed-rules" ref="root">
    <button class="ed-btn ed-rules-btn" type="button" @click="toggle" :class="{ open: open }" :title="t('rules.title') + ': ' + t('rules.label', { year: year })" aria-haspopup="menu" :aria-expanded="open">
      <i class="fas fa-book"></i><span class="ed-rules-year">{{ t('rules.label', { year: year }) }}</span><span class="ed-rules-year short">{{ year }}</span><span class="ed-rules-draft" v-if="draft(year)">{{ t('rules.draft') }}</span><i class="fas fa-caret-down ed-rules-caret"></i>
    </button>
    <div class="ed-rules-menu" v-if="open" role="menu">
      <p class="ed-rules-lead">{{ t('rules.lead') }}</p>
      <div class="ed-rules-item" v-for="y in years" :key="y.year" :class="{ active: y.year === year }">
        <button type="button" role="menuitemradio" :aria-checked="y.year === year" @click="pick(y.year)">
          <i class="fas fa-check" :style="{ visibility: y.year === year ? 'visible' : 'hidden' }"></i>{{ t('rules.label', { year: y.year }) }}<span class="ed-rules-draft" v-if="y.draft">{{ t('rules.draft') }}</span>
        </button>
        <a :href="y.book" target="_blank" rel="noopener" :title="t('rules.book')"><i class="fas fa-file-pdf"></i>{{ t('rules.book') }}</a>
      </div>
      <div class="ed-rules-item soon" v-for="y in upcoming" :key="y">
        <button type="button" role="menuitemradio" aria-checked="false" aria-disabled="true" disabled>
          <i class="fas fa-check" style="visibility: hidden"></i>{{ t('rules.label', { year: y }) }}
        </button>
        <span class="ed-rules-soon">{{ t('rules.soon') }}</span>
      </div>
    </div>
  </span>
</template>
