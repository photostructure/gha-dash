<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useConfig } from "../composables/useConfig";

const router = useRouter();
const { config, loading, saving, saveConfig } = useConfig();

// Local form state
const selectedRepos = ref<Set<string>>(new Set());
const repoFilter = ref("");
const sortCol = ref<"selected" | "owner" | "repo">("repo");
const sortDesc = ref(false);

// General settings local state
const refreshInterval = ref(3600);
const rateLimitFloor = ref(500);
const rateBudgetPct = ref(50);
const port = ref(3131);
const hiddenWorkflows = ref("");

// Initialize local state from config when loaded
onMounted(async () => {
  // Wait for config to be populated (useConfig fetches onMounted)
  const check = setInterval(() => {
    if (config.value) {
      clearInterval(check);
      selectedRepos.value = new Set(config.value.repos);
      refreshInterval.value = config.value.refreshInterval;
      rateLimitFloor.value = config.value.rateLimitFloor;
      rateBudgetPct.value = config.value.rateBudgetPct;
      port.value = config.value.port;
      hiddenWorkflows.value = config.value.hiddenWorkflows.join(", ");
    }
  }, 50);
});

// Repo table: filter + sort
const repoRows = computed(() => {
  if (!config.value) return [];
  const q = repoFilter.value.toLowerCase();
  let repos = config.value.availableRepos.map((r) => {
    const [owner, name] = r.split("/");
    return { full: r, owner, name, selected: selectedRepos.value.has(r) };
  });
  if (q) {
    repos = repos.filter(
      (r) =>
        r.owner.toLowerCase().includes(q) || r.name.toLowerCase().includes(q),
    );
  }
  repos.sort((a, b) => {
    let va: string | number, vb: string | number;
    if (sortCol.value === "selected") {
      va = a.selected ? 1 : 0;
      vb = b.selected ? 1 : 0;
    } else if (sortCol.value === "owner") {
      va = a.owner.toLowerCase();
      vb = b.owner.toLowerCase();
    } else {
      va = a.name.toLowerCase();
      vb = b.name.toLowerCase();
    }
    const cmp = va < vb ? -1 : va > vb ? 1 : 0;
    return sortDesc.value ? -cmp : cmp;
  });
  return repos;
});

function toggleSort(col: "selected" | "owner" | "repo") {
  if (sortCol.value === col) {
    sortDesc.value = !sortDesc.value;
  } else {
    sortCol.value = col;
    sortDesc.value = false;
  }
}

function sortClass(col: string): string {
  if (sortCol.value !== col) return "sortable";
  return `sortable sort-active ${sortDesc.value ? "sort-desc" : "sort-asc"}`;
}

function toggleRepo(full: string) {
  const s = new Set(selectedRepos.value);
  if (s.has(full)) s.delete(full);
  else s.add(full);
  selectedRepos.value = s;
}

function checkAll() {
  const s = new Set(selectedRepos.value);
  for (const r of repoRows.value) s.add(r.full);
  selectedRepos.value = s;
}

function checkNone() {
  const s = new Set(selectedRepos.value);
  for (const r of repoRows.value) s.delete(r.full);
  selectedRepos.value = s;
}

function checkInverse() {
  const s = new Set(selectedRepos.value);
  for (const r of repoRows.value) {
    if (s.has(r.full)) s.delete(r.full);
    else s.add(r.full);
  }
  selectedRepos.value = s;
}

async function save() {
  const ok = await saveConfig({
    repos: Array.from(selectedRepos.value),
    refreshInterval: refreshInterval.value,
    rateLimitFloor: rateLimitFloor.value,
    rateBudgetPct: rateBudgetPct.value,
    port: port.value,
    hiddenWorkflows: hiddenWorkflows.value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  });
  if (ok) router.push("/");
}
</script>

<template>
  <div class="settings">
    <div class="settings-header">
      <h2>Settings</h2>
      <button
        type="button"
        class="btn btn-primary"
        :disabled="saving"
        @click="save"
      >
        {{ saving ? "Saving..." : "Save" }}
      </button>
    </div>

    <template v-if="loading">
      <p class="hint">Loading settings...</p>
    </template>
    <template v-else-if="config">
      <details v-if="config.availableRepos.length > 0" open>
        <summary>
          <strong>Repos</strong> &mdash; {{ selectedRepos.size }} of
          {{ config.availableRepos.length }} selected
        </summary>
        <div class="settings-section">
          <div class="toolbar">
            <input
              type="text"
              placeholder="Filter repos..."
              aria-label="Filter repos"
              v-model="repoFilter"
            />
            <div class="checkbox-helpers">
              <button type="button" @click="checkAll">All</button>
              <button type="button" @click="checkNone">None</button>
              <button type="button" @click="checkInverse">Invert</button>
            </div>
          </div>
          <table class="settings-table">
            <thead>
              <tr>
                <th
                  scope="col"
                  :class="sortClass('selected')"
                  @click="toggleSort('selected')"
                >
                  &#x2713;
                </th>
                <th
                  scope="col"
                  :class="sortClass('owner')"
                  @click="toggleSort('owner')"
                >
                  Owner
                </th>
                <th
                  scope="col"
                  :class="sortClass('repo')"
                  @click="toggleSort('repo')"
                >
                  Repo
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in repoRows" :key="r.full">
                <td class="check-col">
                  <input
                    type="checkbox"
                    :checked="r.selected"
                    @change="toggleRepo(r.full)"
                  />
                </td>
                <td>{{ r.owner }}</td>
                <td>{{ r.name }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>
      <p v-else class="hint">
        No repos discovered yet &mdash; refresh the dashboard first.
      </p>

      <details open>
        <summary><strong>General</strong></summary>
        <div class="settings-section config-form">
          <div class="form-field">
            <label for="refreshInterval">Refresh interval (seconds)</label>
            <input
              type="number"
              id="refreshInterval"
              v-model.number="refreshInterval"
              min="60"
            />
          </div>
          <div class="form-field">
            <label for="rateLimitFloor">Rate limit floor</label>
            <input
              type="number"
              id="rateLimitFloor"
              v-model.number="rateLimitFloor"
              min="0"
            />
            <small class="field-help"
              >Stop refreshing when remaining API calls drop below this
              number.</small
            >
          </div>
          <div class="form-field">
            <label for="rateBudgetPct">Rate budget per cycle (%)</label>
            <input
              type="number"
              id="rateBudgetPct"
              v-model.number="rateBudgetPct"
              min="1"
              max="100"
            />
            <small class="field-help"
              >Max percentage of rate limit to use per refresh cycle.</small
            >
          </div>
          <div class="form-field">
            <label for="port">Port</label>
            <input
              type="number"
              id="port"
              v-model.number="port"
              min="1"
              max="65535"
            />
            <small class="field-help">Takes effect on next restart.</small>
          </div>
          <div class="form-field">
            <label for="hiddenWorkflows">Hidden workflows</label>
            <input type="text" id="hiddenWorkflows" v-model="hiddenWorkflows" />
            <small class="field-help"
              >Comma-separated. Hides workflows whose name contains any of these
              (case-insensitive).</small
            >
          </div>
        </div>
      </details>
    </template>
  </div>
</template>
