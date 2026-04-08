import type { WorkflowRun, CacheEntry } from "../types.js";
import type { AppState } from "../state.js";
import type { RepoStats } from "./github.js";

export interface RepoGroup {
  repo: string;
  runs: WorkflowRun[];
  error: string | null;
  stats: RepoStats | null;
}

export function groupRunsByRepo(state: AppState): RepoGroup[] {
  const groups: RepoGroup[] = [];
  const hidden = state.config.hiddenWorkflows.map((s: string) => s.toLowerCase());

  for (const [repo, entry] of state.cache.entries()) {
    const typed = entry as CacheEntry<WorkflowRun[]>;
    if (typed.data.length === 0 && !typed.error) continue;

    // Filter out hidden workflows
    const runs = hidden.length > 0
      ? typed.data.filter((run) => {
          const name = run.workflowName.toLowerCase();
          return !hidden.some((h: string) => name.includes(h));
        })
      : typed.data;

    // Skip repo entirely if all its runs were hidden
    if (runs.length === 0 && !typed.error) continue;

    groups.push({ repo, runs, error: typed.error, stats: state.repoStats.get(repo) ?? null });
  }

  groups.sort((a, b) => a.repo.localeCompare(b.repo));
  return groups;
}
