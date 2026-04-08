<script setup lang="ts">
import { computed } from "vue";
import type { WorkflowRun } from "../../types.js";
import { displayStatus } from "../../types.js";

const props = defineProps<{ run: WorkflowRun }>();

const status = computed(() => displayStatus(props.run));
</script>

<template>
  <span
    class="status-badge"
    :class="`status-${status}`"
    :aria-label="`Status: ${status}`"
    >{{ status }}</span
  >
</template>
