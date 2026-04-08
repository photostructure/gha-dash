import { onMounted, onUnmounted, ref } from "vue";
import type { WorkflowRun } from "../../types.js";

export interface RepoStats {
  openPrs: number;
  openIssues: number;
  canPush: boolean;
}

export interface RepoGroup {
  repo: string;
  runs: WorkflowRun[];
  error: string | null;
  stats: RepoStats | null;
}

export interface RateLimitInfo {
  remaining: number;
  limit: number;
  checkedAt: string;
}

export interface WorkflowsData {
  groups: RepoGroup[];
  errors: { repo: string; message: string }[];
  rateLimit: RateLimitInfo | null;
}

export function useWorkflows(pollIntervalMs = 30_000) {
  const groups = ref<RepoGroup[]>([]);
  const errors = ref<{ repo: string; message: string }[]>([]);
  const rateLimit = ref<RateLimitInfo | null>(null);
  const loading = ref(false);
  const refreshing = ref(false);
  const refreshingRepo = ref<string | null>(null);

  let timer: ReturnType<typeof setInterval> | null = null;
  let eventSource: EventSource | null = null;

  async function fetchWorkflows(): Promise<boolean> {
    try {
      const res = await fetch("/api/workflows");
      const data: WorkflowsData = await res.json();
      groups.value = data.groups;
      errors.value = data.errors;
      rateLimit.value = data.rateLimit;
      return true;
    } catch {
      return false;
    }
  }

  async function refreshAll() {
    refreshing.value = true;
    try {
      const res = await fetch("/api/refresh", { method: "POST" });
      const data: WorkflowsData = await res.json();
      groups.value = data.groups;
      errors.value = data.errors;
      rateLimit.value = data.rateLimit;
    } catch (err) {
      console.error("Failed to refresh:", err);
    } finally {
      refreshing.value = false;
    }
  }

  async function refreshRepo(fullName: string) {
    refreshingRepo.value = fullName;
    try {
      const res = await fetch(`/api/refresh/${fullName}`, { method: "POST" });
      const data: WorkflowsData = await res.json();
      groups.value = data.groups;
      errors.value = data.errors;
      rateLimit.value = data.rateLimit;
    } catch (err) {
      console.error(`Failed to refresh ${fullName}:`, err);
    } finally {
      refreshingRepo.value = null;
    }
  }

  onMounted(async () => {
    loading.value = true;
    // Retry initial fetch — Express may still be starting (dev race condition)
    for (let i = 0; i < 10; i++) {
      if (await fetchWorkflows()) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    loading.value = false;
    timer = setInterval(fetchWorkflows, pollIntervalMs);

    // SSE: server pushes when background refresh completes
    eventSource = new EventSource("/api/events");
    eventSource.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "refreshed") {
          fetchWorkflows();
        }
      } catch {
        // ignore malformed messages
      }
    };
  });

  onUnmounted(() => {
    if (timer) clearInterval(timer);
    if (eventSource) eventSource.close();
  });

  return {
    groups,
    errors,
    rateLimit,
    loading,
    refreshing,
    refreshingRepo,
    refreshAll,
    refreshRepo,
  };
}
