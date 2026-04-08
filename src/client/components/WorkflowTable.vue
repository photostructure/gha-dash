<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { WorkflowRun } from "../../types.js";
import { displayStatus } from "../../types.js";
import type { RepoGroup } from "../composables/useWorkflows";
import RepoGroupComponent from "./RepoGroup.vue";
import SearchToolbar from "./SearchToolbar.vue";

const props = defineProps<{
  groups: RepoGroup[];
  refreshingRepo: string | null;
}>();

const emit = defineEmits<{
  refreshRepo: [repo: string];
}>();

// --- Client-side state ---
const searchQuery = ref("");
const failuresOnly = ref(false);
const sortCol = ref<string>("started");
const sortDesc = ref(true);
const collapsedRepos = ref<Record<string, boolean>>(
  JSON.parse(localStorage.getItem("gha-dash-collapsed") ?? "{}"),
);

// Persist collapse state
watch(
  collapsedRepos,
  (val) => {
    localStorage.setItem("gha-dash-collapsed", JSON.stringify(val));
  },
  { deep: true },
);

// --- Sorting ---
type SortableCol = "workflow" | "branch" | "status" | "started" | "duration";

function getSortValue(run: WorkflowRun, col: SortableCol): string | number {
  switch (col) {
    case "workflow":
      return run.workflowName.toLowerCase();
    case "branch":
      return run.branch.toLowerCase();
    case "status":
      return displayStatus(run);
    case "started":
      return run.createdAt;
    case "duration":
      return run.duration;
  }
}

function sortRuns(runs: WorkflowRun[]): WorkflowRun[] {
  const col = sortCol.value as SortableCol;
  const desc = sortDesc.value;
  return [...runs].sort((a, b) => {
    const va = getSortValue(a, col);
    const vb = getSortValue(b, col);
    const cmp = va < vb ? -1 : va > vb ? 1 : 0;
    return desc ? -cmp : cmp;
  });
}

// --- Filtering ---
const failStatuses = new Set(["failure", "timed_out"]);

function filterRuns(runs: WorkflowRun[]): WorkflowRun[] {
  let result = runs;
  const q = searchQuery.value.toLowerCase();
  if (q) {
    result = result.filter(
      (r) =>
        r.workflowName.toLowerCase().includes(q) ||
        r.branch.toLowerCase().includes(q) ||
        r.commitMessage.toLowerCase().includes(q) ||
        r.repo.toLowerCase().includes(q),
    );
  }
  if (failuresOnly.value) {
    result = result.filter((r) => failStatuses.has(displayStatus(r)));
  }
  return result;
}

// --- Combined: filter then sort ---
const processedGroups = computed(() => {
  return props.groups
    .map((g) => ({
      ...g,
      runs: sortRuns(filterRuns(g.runs)),
    }))
    .filter((g) => g.runs.length > 0 || g.error);
});

// --- Sort header interaction ---
function toggleSort(col: string) {
  if (sortCol.value === col) {
    sortDesc.value = !sortDesc.value;
  } else {
    sortCol.value = col;
    sortDesc.value = col === "started" || col === "duration";
  }
}

function sortClass(col: string): string {
  if (sortCol.value !== col) return "sortable";
  return `sortable sort-active ${sortDesc.value ? "sort-desc" : "sort-asc"}`;
}

// --- Collapse ---
function toggleCollapse(repo: string) {
  collapsedRepos.value = {
    ...collapsedRepos.value,
    [repo]: !collapsedRepos.value[repo],
  };
}

function expandAll() {
  failuresOnly.value = false;
  const state: Record<string, boolean> = {};
  for (const g of props.groups) state[g.repo] = false;
  collapsedRepos.value = state;
}

function collapseAll() {
  failuresOnly.value = false;
  const state: Record<string, boolean> = {};
  for (const g of props.groups) state[g.repo] = true;
  collapsedRepos.value = state;
}
</script>

<template>
  <SearchToolbar
    :search-query="searchQuery"
    :failures-only="failuresOnly"
    @update:search-query="searchQuery = $event"
    @update:failures-only="failuresOnly = $event"
    @expand-all="expandAll"
    @collapse-all="collapseAll"
  />

  <table class="workflow-table">
    <thead>
      <tr>
        <th
          scope="col"
          :class="sortClass('workflow')"
          @click="toggleSort('workflow')"
        >
          Workflow
        </th>
        <th
          scope="col"
          :class="sortClass('branch')"
          @click="toggleSort('branch')"
        >
          Branch
        </th>
        <th
          scope="col"
          :class="sortClass('status')"
          @click="toggleSort('status')"
        >
          Status
        </th>
        <th scope="col">Commit</th>
        <th scope="col">Message</th>
        <th
          scope="col"
          :class="sortClass('started')"
          @click="toggleSort('started')"
        >
          Started
        </th>
        <th
          scope="col"
          :class="sortClass('duration')"
          @click="toggleSort('duration')"
        >
          Duration
        </th>
        <th scope="col" class="actions-col"></th>
      </tr>
    </thead>
    <tbody aria-live="polite">
      <template v-if="processedGroups.length === 0 && groups.length === 0">
        <tr>
          <td colspan="8" class="loading">Loading workflow data...</td>
        </tr>
      </template>
      <template v-else-if="processedGroups.length === 0">
        <tr>
          <td colspan="8" class="no-runs">No matching workflows</td>
        </tr>
      </template>
      <template v-else>
        <RepoGroupComponent
          v-for="group in processedGroups"
          :key="group.repo"
          :group="group"
          :collapsed="!!collapsedRepos[group.repo]"
          :refreshing="refreshingRepo === group.repo"
          @toggle="toggleCollapse(group.repo)"
          @refresh="emit('refreshRepo', $event)"
        />
      </template>
    </tbody>
  </table>
</template>
