import { Router } from "express";
import { getAppState, refreshRepo, refreshRuns } from "../state.js";
import { displayStatus, formatDuration, relativeTime } from "../types.js";

export function dashboardRoutes(): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    const state = getAppState();
    const grouped = groupRunsByRepo(state);
    const errors = grouped
      .filter((g) => g.error)
      .map((g) => ({ repo: g.repo, message: g.error! }));

    res.render("dashboard", {
      grouped,
      errors,
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

  // POST /refresh — refresh all repos
  router.post("/refresh", async (_req, res) => {
    await refreshRuns();
    renderRefreshResponse(res);
  });

  // POST /refresh/:owner/:repo — refresh a single repo (no DOM swap)
  router.post("/refresh/:owner/:repo", async (req, res, next) => {
    try {
      const fullName = `${req.params.owner}/${req.params.repo}`;
      await refreshRepo(fullName);
      // Return 204 — data is updated in cache, next HTMX poll will pick it up.
      // This avoids replacing the entire tbody which destroys collapse state.
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}

function renderRefreshResponse(res: import("express").Response): void {
  const state = getAppState();
  const grouped = groupRunsByRepo(state);
  const tableVars = { grouped, displayStatus, formatDuration, relativeTime };

  // Render workflow table + OOB rate limit badge update
  res.app.render("partials/workflow-table", tableVars, (err, tableHtml) => {
    if (err) { res.status(500).send(err.message); return; }

    res.app.render("partials/rate-limit", { rateLimit: state.rateLimit }, (err2, rlHtml) => {
      const rlOob = err2 ? "" : `<span id="rate-limit-badge" hx-swap-oob="innerHTML">${rlHtml}</span>`;
      res.send(tableHtml + rlOob);
    });
  });
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

    groups.push({ repo, runs, error: typed.error });
  }

  groups.sort((a, b) => a.repo.localeCompare(b.repo));
  return groups;
}
