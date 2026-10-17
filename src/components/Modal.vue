<script setup lang="ts">
// A modal window as Bootstrap draws one (.modal.fade / .modal-dialog / .modal-content over a
// .modal-backdrop): it fades in, takes the focus, closes on Esc (unless a key handler took the key
// first) and on a click beside the dialog, and fades out before it goes (then `gone`).
import { onBeforeUnmount, onMounted, ref, watch, nextTick } from 'vue';

const props = defineProps<{ open: boolean; windowClass?: string; size?: string }>();
const emit = defineEmits<{ (e: 'dismiss'): void; (e: 'gone'): void }>();

const shown = ref(false);
const win = ref<HTMLElement | null>(null);
let opener: Element | null = null;
let goneTimer = 0;

function onKey(e: KeyboardEvent) {
    if (e.defaultPrevented || !props.open) return;
    if (e.key === 'Escape') {
        e.preventDefault();
        emit('dismiss');
    }
}

function onWindowClick(e: MouseEvent) {
    if (e.target === e.currentTarget) emit('dismiss');
}

onMounted(function () {
    opener = document.activeElement;
    document.body.classList.add('modal-open');
    document.addEventListener('keydown', onKey);
    nextTick(function () {
        if (win.value) win.value.focus();
        // the next frame, so the fade runs
        requestAnimationFrame(function () { shown.value = props.open; });
    });
});

watch(function () { return props.open; }, function (open) {
    if (open) return;
    shown.value = false;
    // as long as the fade (Bootstrap: .3s for the dialog)
    goneTimer = window.setTimeout(function () { emit('gone'); }, 300);
});

onBeforeUnmount(function () {
    window.clearTimeout(goneTimer);
    document.removeEventListener('keydown', onKey);
    document.body.classList.remove('modal-open');
    if (opener && (opener as HTMLElement).focus && document.body.contains(opener)) (opener as HTMLElement).focus();
});
</script>

<template>
  <Teleport to="body">
    <div ref="win" class="modal fade" :class="[windowClass, { show: shown }]" role="dialog" :size="size" tabindex="-1" style="z-index: 1050; display: block;" @click="onWindowClick">
      <div class="modal-dialog" :class="size ? 'modal-' + size : ''">
        <div class="modal-content">
          <slot></slot>
        </div>
      </div>
    </div>
    <div class="modal-backdrop fade" :class="{ show: shown }" style="z-index: 1040;" aria-hidden="true"></div>
  </Teleport>
</template>
