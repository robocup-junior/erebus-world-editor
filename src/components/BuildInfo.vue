<script setup lang="ts">
// The copyright in the status line: clicked, what this build is (the commit, its branch, when it was
// built), to copy into a bug report
import { ref, onBeforeUnmount } from 'vue';
import { t, lang } from '../i18n';

const B = __BUILD_INFO__;
const open = ref(false);
const copied = ref(false);
const root = ref<HTMLElement | null>(null);

function short(sha: string) { return sha ? sha.slice(0, 7) : ''; }
function when(iso: string) {
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? iso : d.toLocaleString(lang());
}
// one line for a bug report
function line() {
    return 'Erebus World Editor (' + (short(B.commit) || '?') + (B.dirty ? '+' : '')
        + (B.branch ? ', ' + B.branch : '') + ', built ' + B.builtAt + ')';
}
function copy() {
    const done = function () { copied.value = true; setTimeout(function () { copied.value = false; }, 1500); };
    try { navigator.clipboard.writeText(line()).then(done, function () {}); } catch (e) { /* no clipboard: the text is there to select */ }
}

// closed by a click elsewhere or Esc
function away(e: Event) { if (root.value && !root.value.contains(e.target as Node)) open.value = false; }
function key(e: KeyboardEvent) { if (e.key === 'Escape') open.value = false; }
function toggle() {
    open.value = !open.value;
    if (open.value) { document.addEventListener('pointerdown', away); document.addEventListener('keydown', key); }
    else stop();
}
function stop() { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', key); }
onBeforeUnmount(stop);
</script>

<template>
  <span class="sbx-copyright" ref="root">
    <button class="sbx-copyright-btn" type="button" @click="toggle" :aria-expanded="open" :title="t('app.build.title')">©︎ 2021-2026 Erebus Development Team</button>
    <div class="sbx-build" v-if="open" role="dialog" :aria-label="t('app.build.title')">
      <div class="sbx-build-head">Erebus World Editor</div>
      <dl>
        <dt>{{ t('app.build.commit') }}</dt>
        <dd>
          <a v-if="B.commit" :href="B.repo + '/commit/' + B.commit" target="_blank" rel="noopener"><code>{{ short(B.commit) }}</code></a>
          <span v-else>—</span>
          <span class="sbx-build-dirty" v-if="B.dirty">{{ t('app.build.dirty') }}</span>
        </dd>
        <template v-if="B.branch"><dt>{{ t('app.build.branch') }}</dt><dd>{{ B.branch }}</dd></template>
        <template v-if="B.commitDate"><dt>{{ t('app.build.commitDate') }}</dt><dd>{{ when(B.commitDate) }}</dd></template>
        <dt>{{ t('app.build.builtAt') }}</dt><dd>{{ when(B.builtAt) }}</dd>
      </dl>
      <div class="sbx-build-foot">
        <a :href="B.repo" target="_blank" rel="noopener"><i class="fas fa-code-branch"></i> GitHub</a>
        <button class="btn btn-sm btn-link p-0" type="button" @click="copy"><i :class="copied ? 'fas fa-check' : 'far fa-copy'"></i> {{ t(copied ? 'app.build.copied' : 'app.build.copy') }}</button>
      </div>
    </div>
  </span>
</template>
