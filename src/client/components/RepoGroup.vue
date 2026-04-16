<script setup lang="ts">
import { displayStatus } from "../../types.js";
import type { RepoGroup } from "../composables/useWorkflows";
import RefreshIcon from "./RefreshIcon.vue";
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
      <div class="repo-header-content">
        <span class="collapse-icon">{{ collapsed ? "\u25B6" : "\u25BC" }}</span>
        <strong>{{ group.repo }}</strong>
        <span v-if="group.error" class="error-badge" :title="group.error"
          >&#x26A0; error</span
        >
        <span class="status-dots">
          <span
            v-for="run in group.runs"
            :key="run.htmlUrl"
            class="status-dot"
            :class="`dot-${displayStatus(run)}`"
            :title="`${run.workflowName}: ${displayStatus(run)}`"
          ></span>
        </span>
        <span class="repo-stats">
          <a
            :href="`https://github.com/${group.repo}`"
            target="_blank"
            rel="noopener"
            class="repo-stat-pill"
            :title="`Open ${group.repo} on GitHub`"
            :aria-label="`Open ${group.repo} on GitHub`"
            @click.stop
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path
                d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"
              /></svg
          ></a>
          <a
            v-if="group.stats && group.stats.openPrs > 0"
            :href="`https://github.com/${group.repo}/pulls`"
            target="_blank"
            rel="noopener"
            class="repo-stat-pill"
            :title="`${group.stats.openPrs} open pull request${group.stats.openPrs === 1 ? '' : 's'}`"
            @click.stop
            >{{ group.stats.openPrs }}
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path
                d="M5 3.254V3.25v.005a.75.75 0 1 1 0-.005m.45 1.9a2.25 2.25 0 1 0-1.95.218v5.256a2.25 2.25 0 1 0 1.5 0V7.123A5.7 5.7 0 0 0 9.25 9h1.378a2.251 2.251 0 1 0 0-1.5H9.25a4.25 4.25 0 0 1-3.8-2.346M12.75 7.5a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5m-8 4.25a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5"
              /></svg
          ></a>
          <a
            v-if="group.stats && group.stats.openIssues > 0"
            :href="`https://github.com/${group.repo}/issues`"
            target="_blank"
            rel="noopener"
            class="repo-stat-pill"
            :title="`${group.stats.openIssues} open issue${group.stats.openIssues === 1 ? '' : 's'}`"
            @click.stop
            >{{ group.stats.openIssues }}
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
              <path
                d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z"
              /></svg
          ></a>
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
    <WorkflowRow
      v-for="run in group.runs"
      :key="run.htmlUrl"
      :run="run"
      :can-push="group.stats?.canPush ?? false"
    />
  </template>
</template>
