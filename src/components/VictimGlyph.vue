<script setup lang="ts">
// What a victim shows in the panels: its symbol (a letter), or its face (a smiley victim, lib/faces).
// Given its colour (on a badge), a face is drawn with its disc in one picture - filled, or hollow for a
// fake - so the face is always in the middle of the disc, as on the map (lib/icons: victim)
import { computed } from 'vue';
import { FACES, FACE_BOX } from '../lib/faces';

const props = defineProps<{ symbol?: string | null; face?: string | null; color?: string | null; hollow?: boolean }>();

// the face in the middle of the disc (0-100), as large as on the map (1.3 of its radius)
const FACE = 65, AT = (100 - FACE) / 2;
const path = computed(function () { return props.face ? FACES[props.face] || '' : ''; });
</script>

<template>
  <svg v-if="path && color" class="ed-glyph-disc" viewBox="0 0 100 100" role="img" :aria-label="symbol || ''">
    <circle v-if="!hollow" cx="50" cy="50" r="50" :fill="color"></circle>
    <circle v-else cx="50" cy="50" r="45" fill="#fff" :stroke="color" stroke-width="10"></circle>
    <path :d="path" :fill="hollow ? color : '#fff'" :transform="'translate(' + AT + ' ' + AT + ') scale(' + FACE / FACE_BOX + ')'"></path>
  </svg>
  <svg v-else-if="path" class="ed-glyph-face" :viewBox="'0 0 ' + FACE_BOX + ' ' + FACE_BOX" role="img" :aria-label="symbol || ''"><path :d="path" fill="currentColor"></path></svg>
  <template v-else>{{ symbol }}</template>
</template>
