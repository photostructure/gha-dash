<script setup lang="ts">
import type { RepoGroup } from "../composables/useWorkflows";
import { displayStatus } from "../../types.js";
import WorkflowRow from "./WorkflowRow.vue";
import RefreshIcon from "./RefreshIcon.vue";

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
      <span v-if="collapsed" class="status-dots">
        <span
          v-for="run in group.runs"
          :key="run.workflowId"
          class="status-dot"
          :class="`dot-${displayStatus(run)}`"
          :title="`${run.workflowName}: ${displayStatus(run)}`"
        ></span>
      </span>
      <button
        type="button"
        class="btn-refresh"
        :class="{ spinning: refreshing }"
        :title="`Refresh ${group.repo}`"
        :aria-label="`Refresh ${group.repo}`"
        @click.stop="emit('refresh', group.repo)"
      >
        <RefreshIcon />
      </button>
    </td>
  </tr>
  <template v-if="!collapsed">
    <WorkflowRow v-for="run in group.runs" :key="`${run.workflowId}-${run.branch}`" :run="run" />
  </template>
</template>
