import { Router } from "express";
import { getAppState } from "../state.js";
import { displayStatus, formatDuration, relativeTime } from "../types.js";

export function dashboardRoutes(): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    const state = getAppState();
    const grouped = groupRunsByRepo(state);
    res.render("dashboard", {
      grouped,
      displayStatus,
      formatDuration,
      relativeTime,
      rateLimit: state.rateLimit,
    });
  });

  router.get("/partials/workflows", (_req, res) => {
    const state = getAppState();
    const grouped = groupRunsByRepo(state);
    res.render("partials/workflow-table", {
      grouped,
      displayStatus,
      formatDuration,
      relativeTime,
    });
  });

  return router;
}

import type { WorkflowRun, CacheEntry } from "../types.js";
import type { AppState } from "../state.js";

interface RepoGroup {
  repo: string;
  runs: WorkflowRun[];
  error: string | null;
}

function groupRunsByRepo(state: AppState): RepoGroup[] {
  const groups: RepoGroup[] = [];

  for (const [repo, entry] of state.cache.entries()) {
    const typed = entry as CacheEntry<WorkflowRun[]>;
    // Skip repos with no runs and no error — they have no workflows
    if (typed.data.length === 0 && !typed.error) continue;

    groups.push({
      repo,
      runs: typed.data,
      error: typed.error,
    });
  }

  // Sort repos alphabetically
  groups.sort((a, b) => a.repo.localeCompare(b.repo));
  return groups;
}
