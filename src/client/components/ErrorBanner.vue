<script setup lang="ts">
import { computed, ref } from "vue";

const props = defineProps<{
  errors: { repo: string; message: string }[];
}>();

const dismissed = ref(false);

// Deduplicate: group repos by identical error message
const grouped = computed(() => {
  const map = new Map<string, string[]>();
  for (const e of props.errors) {
    const repos = map.get(e.message) ?? [];
    repos.push(e.repo);
    map.set(e.message, repos);
  }
  return Array.from(map.entries()).map(([message, repos]) => ({
    message,
    count: repos.length,
    repos,
  }));
});
</script>

<template>
  <div v-if="errors.length > 0 && !dismissed" class="error-banner">
    <button class="error-dismiss" @click="dismissed = true" aria-label="Dismiss errors">&times;</button>
    <div v-for="g in grouped" :key="g.message">
      <template v-if="g.count > 1">{{ g.count }} repos: </template>{{ g.message }}
    </div>
  </div>
</template>
