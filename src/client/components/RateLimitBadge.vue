<script setup lang="ts">
import { computed } from "vue";
import type { RateLimitInfo } from "../composables/useWorkflows";

const props = defineProps<{ rateLimit: RateLimitInfo | null }>();

const colorClass = computed(() => {
  if (!props.rateLimit) return "";
  const pct = props.rateLimit.remaining / props.rateLimit.limit;
  if (pct > 0.5) return "rl-ok";
  if (pct > 0.2) return "rl-warn";
  return "rl-danger";
});

const tooltip = computed(() => {
  if (!props.rateLimit?.checkedAt) return "";
  return `Checked: ${new Date(props.rateLimit.checkedAt).toLocaleString()}`;
});
</script>

<template>
  <span v-if="rateLimit" class="rate-limit-badge" :class="colorClass" :title="tooltip">
    API: {{ rateLimit.remaining }}/{{ rateLimit.limit }}
  </span>
</template>
