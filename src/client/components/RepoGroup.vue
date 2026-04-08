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
      <div class="repo-header-content">
        <span class="collapse-icon">{{ collapsed ? "\u25B6" : "\u25BC" }}</span>
        <strong>{{ group.repo }}</strong>
        <span v-if="group.error" class="error-badge" :title="group.error">&#x26A0; error</span>
        <span class="status-dots">
          <span
            v-for="run in group.runs"
            :key="run.htmlUrl"
            class="status-dot"
            :class="`dot-${displayStatus(run)}`"
            :title="`${run.workflowName}: ${displayStatus(run)}`"
          ></span>
        </span>
        <span v-if="group.stats" class="repo-stats">
          <a
            v-if="group.stats.openPrs > 0"
            :href="`https://github.com/${group.repo}/pulls`"
            target="_blank"
            rel="noopener"
            class="repo-stat-pill"
            :title="`${group.stats.openPrs} open pull request${group.stats.openPrs === 1 ? '' : 's'}`"
            @click.stop
          >{{ group.stats.openPrs }} <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M5 3.254V3.25v.005a.75.75 0 1 1 0-.005m.45 1.9a2.25 2.25 0 1 0-1.95.218v5.256a2.25 2.25 0 1 0 1.5 0V7.123A5.7 5.7 0 0 0 9.25 9h1.378a2.251 2.251 0 1 0 0-1.5H9.25a4.25 4.25 0 0 1-3.8-2.346M12.75 7.5a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5m-8 4.25a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5"/></svg></a>
          <a
            v-if="group.stats.openIssues > 0"
            :href="`https://github.com/${group.repo}/issues`"
            target="_blank"
            rel="noopener"
            class="repo-stat-pill"
            :title="`${group.stats.openIssues} open issue${group.stats.openIssues === 1 ? '' : 's'}`"
            @click.stop
          >{{ group.stats.openIssues }} <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"/><path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z"/></svg></a>
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
      </div>
    </td>
  </tr>
  <template v-if="!collapsed">
    <WorkflowRow v-for="run in group.runs" :key="run.htmlUrl" :run="run" :can-push="group.stats?.canPush ?? false" />
  </template>
</template>
