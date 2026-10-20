<script setup lang="ts">
// Over everything, on a screen too small to edit on (a phone, or a window made that small): what
// size it needs. While it is shown the page behind takes nothing: its parts are inert (no clicks, no
// focus, no typing) and no key reaches the editor. Made big enough again, it goes, and the page is
// as it was.
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { t } from '../i18n';

// the smallest window the editor works in: its top bar fits from 1024 wide (a phone, or a tablet held
// upright, is smaller)
const MIN_W = 1024;
const MIN_H = 500;
const query = window.matchMedia('(max-width: ' + (MIN_W - 0.02) + 'px), (max-height: ' + (MIN_H - 0.02) + 'px)');

const small = ref(false);
const width = ref(0);
const height = ref(0);
const root = ref<HTMLElement | null>(null);

// the page's other parts (the editor, and the dialogs teleported to the body)
function others() { return Array.from(document.body.children).filter(function (el) { return el !== root.value; }) as HTMLElement[]; }
function update() {
    small.value = query.matches;
    width.value = window.innerWidth;
    height.value = window.innerHeight;
    // a dialog opened while small is caught on the next resize; till then the notice covers it
    others().forEach(function (el) { el.inert = small.value; });
    if (small.value && document.activeElement instanceof HTMLElement) document.activeElement.blur();
}
// first, before the editor's keys
function key(e: KeyboardEvent) { if (small.value) e.stopPropagation(); }

onMounted(function () {
    update();
    window.addEventListener('resize', update);
    window.addEventListener('keydown', key, true);
    window.addEventListener('keyup', key, true);
});
onBeforeUnmount(function () {
    window.removeEventListener('resize', update);
    window.removeEventListener('keydown', key, true);
    window.removeEventListener('keyup', key, true);
});
</script>

<template>
  <Teleport to="body">
    <div class="ed-small" ref="root" v-show="small" role="alertdialog" aria-modal="true" aria-labelledby="edSmallTitle" aria-describedby="edSmallLead">
      <div class="ed-small-card">
        <img class="ed-small-logo" src="/images/icon.svg" alt="" width="56" height="56">
        <h1 class="ed-small-title" id="edSmallTitle">{{ t('app.small.title') }}</h1>
        <p class="ed-small-lead" id="edSmallLead">{{ t('app.small.lead') }}</p>
        <p class="ed-small-size">
          <i class="fas fa-desktop"></i>{{ t('app.small.need', { width: MIN_W, height: MIN_H }) }}<br>
          <span>{{ t('app.small.now', { width: width, height: height }) }}</span>
        </p>
      </div>
    </div>
  </Teleport>
</template>
