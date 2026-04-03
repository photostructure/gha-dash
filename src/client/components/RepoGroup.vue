<script setup lang="ts">
import type { RepoGroup } from "../composables/useWorkflows";
import WorkflowRow from "./WorkflowRow.vue";

const props = defineProps<{
  group: RepoGroup;
  collapsed: boolean;
  refreshing: boolean;
}>();

const emit = defineEmits<{
  toggle: [];
  refresh: [repo: string];
}>();

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    emit("toggle");
  }
}
</script>

<template>
  <tr
    class="repo-header"
    :data-repo-header="group.repo"
    :aria-expanded="String(!collapsed)"
    role="button"
    tabindex="0"
    @click="emit('toggle')"
    @keydown="onKeydown"
  >
    <td colspan="8">
      <span class="collapse-icon">{{ collapsed ? "\u25B6" : "\u25BC" }}</span>
      <strong>{{ group.repo }}</strong>
      <span v-if="group.error" class="error-badge" :title="group.error">&#x26A0; error</span>
      <button
        type="button"
        class="btn-refresh"
        :class="{ spinning: refreshing }"
        :title="`Refresh ${group.repo}`"
        :aria-label="`Refresh ${group.repo}`"
        @click.stop="emit('refresh', group.repo)"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="transform:scaleX(-1)">
          <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/>
        </svg>
      </button>
    </td>
  </tr>
  <template v-if="!collapsed">
    <WorkflowRow v-for="run in group.runs" :key="`${run.workflowId}-${run.branch}`" :run="run" />
  </template>
</template>
