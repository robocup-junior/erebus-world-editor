<script setup lang="ts">
// The language button of the status lines (the editor's and the room 4 creator's): the language in
// use (its flag and name); clicked, the list of the languages (each by its flag and its own name) to
// pick from
import { ref, computed, onBeforeUnmount } from 'vue';
import { LANGUAGES, type Lang } from '../i18n';

const props = defineProps<{ lang: Lang }>();
const emit = defineEmits<{ (e: 'pick', code: Lang): void }>();

const open = ref(false);
const root = ref<HTMLElement | null>(null);
const shown = computed(function () {
    return LANGUAGES.find(function (l) { return l.code === props.lang; }) || null;
});

function away(e: Event) { if (root.value && !root.value.contains(e.target as Node)) close(); }
function key(e: KeyboardEvent) { if (e.key === 'Escape') close(); }
function close() {
    open.value = false;
    document.removeEventListener('pointerdown', away);
    document.removeEventListener('keydown', key);
}
function click() {
    if (open.value) { close(); return; }
    open.value = true;
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key);
}
function pick(code: Lang) {
    close();
    if (code !== props.lang) emit('pick', code);
}
onBeforeUnmount(close);
</script>

<template>
  <span class="ed-lang-wrap" ref="root">
    <button class="ed-status-btn ed-lang" type="button" @click="click" title="Language" aria-haspopup="menu" :aria-expanded="open">
      <img class="ed-lang-flag" v-if="shown" :src="shown.flag" alt=""><i class="fas fa-globe-asia" v-else></i><span>{{ shown ? shown.name : lang }}</span><i class="fas fa-caret-up ed-lang-caret"></i>
    </button>
    <div class="ed-lang-menu" v-if="open" role="menu">
      <button class="ed-lang-item" type="button" role="menuitemradio" v-for="l in LANGUAGES" :key="l.code" :lang="l.code" :aria-checked="l.code === lang" :class="{ active: l.code === lang }" @click="pick(l.code)">
        <i class="fas fa-check" :style="{ visibility: l.code === lang ? 'visible' : 'hidden' }"></i><img class="ed-lang-flag" :src="l.flag" alt="">{{ l.name }}
      </button>
    </div>
  </span>
</template>
