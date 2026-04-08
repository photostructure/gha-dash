import { Router } from "express";
import { getAppState, refreshing, refreshRuns, refreshRepo, stateEvents, updateConfig } from "../state.js";
import { groupRunsByRepo } from "../services/workflows.js";
import { getDispatchInfo, dispatchWorkflow } from "../services/dispatch.js";
import type { CacheEntry, WorkflowRun } from "../types.js";

export function apiRoutes(): Router {
  const router = Router();

  // GET /api/workflows — grouped workflow data + errors + rate limit
  router.get("/workflows", (_req, res) => {
    const state = getAppState();
    const groups = groupRunsByRepo(state);
    const errors = groups
      .filter((g) => g.error)
      .map((g) => ({ repo: g.repo, message: g.error! }));

    res.json({
      groups,
      errors,
      rateLimit: state.rateLimit,
    });
  });

  // GET /api/events — SSE stream for real-time updates
  router.get("/events", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    // Send current refresh state immediately
    res.write(`data: ${JSON.stringify({ type: "refreshing", refreshing })}\n\n`);

    const onRefreshed = () => {
      res.write(`data: ${JSON.stringify({ type: "refreshed" })}\n\n`);
    };

    stateEvents.on("refreshed", onRefreshed);
    req.on("close", () => {
      stateEvents.off("refreshed", onRefreshed);
    });
  });

  // GET /api/config — current configuration
  router.get("/config", (_req, res) => {
    const state = getAppState();
    res.json(state.config);
  });

  // PUT /api/config — update configuration
  router.put("/config", async (req, res, next) => {
    try {
      const body = req.body;

      await updateConfig({
        ...(body.repos !== undefined && { repos: body.repos }),
        ...(body.refreshInterval !== undefined && {
          refreshInterval: Number(body.refreshInterval),
        }),
        ...(body.rateLimitFloor !== undefined && {
          rateLimitFloor: Number(body.rateLimitFloor),
        }),
        ...(body.rateBudgetPct !== undefined && {
          rateBudgetPct: Number(body.rateBudgetPct),
        }),
        ...(body.port !== undefined && { port: Number(body.port) }),
        ...(body.hiddenWorkflows !== undefined && {
          hiddenWorkflows: body.hiddenWorkflows,
        }),
      });

      await refreshRuns();
      const state = getAppState();
      res.json(state.config);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/refresh — trigger full refresh
  router.post("/refresh", async (_req, res, next) => {
    try {
      await refreshRuns();
      const state = getAppState();
      const groups = groupRunsByRepo(state);
      const errors = groups
        .filter((g) => g.error)
        .map((g) => ({ repo: g.repo, message: g.error! }));

      res.json({ groups, errors, rateLimit: state.rateLimit });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/refresh/:owner/:repo — refresh a single repo
  router.post("/refresh/:owner/:repo", async (req, res, next) => {
    try {
      const fullName = `${req.params.owner}/${req.params.repo}`;
      await refreshRepo(fullName);

      const state = getAppState();
      const groups = groupRunsByRepo(state);
      const errors = groups
        .filter((g) => g.error)
        .map((g) => ({ repo: g.repo, message: g.error! }));

      res.json({ groups, errors, rateLimit: state.rateLimit });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/dispatch/:owner/:repo/:id — dispatch form metadata
  router.get("/dispatch/:owner/:repo/:id", async (req, res, next) => {
    try {
      const { owner, repo, id } = req.params;
      const workflowId = parseInt(id, 10);
      const state = getAppState();

      const run = findRun(owner, repo, workflowId);
      if (!run) {
        res.status(404).json({ error: "Workflow not found" });
        return;
      }

      const info = await getDispatchInfo(
        state.octokit,
        owner,
        repo,
        workflowId,
        run.workflowPath,
      );

      if (!info) {
        res.status(400).json({ error: "This workflow does not support manual dispatch" });
        return;
      }

      res.json({
        ...info,
        defaultBranch: run.branch,
      });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/dispatch/:owner/:repo/:id — trigger dispatch
  router.post("/dispatch/:owner/:repo/:id", async (req, res, _next) => {
    try {
      const { owner, repo, id } = req.params;
      const workflowId = parseInt(id, 10);
      const state = getAppState();

      const ref = req.body.ref ?? "main";
      const inputs: Record<string, string> = {};

      for (const [key, value] of Object.entries(req.body)) {
        if (key !== "ref" && typeof value === "string") {
          inputs[key] = value;
        }
      }

      // Handle unchecked boolean inputs (absent from body = "false")
      const run = findRun(owner, repo, workflowId);
      if (run) {
        const info = await getDispatchInfo(
          state.octokit,
          owner,
          repo,
          workflowId,
          run.workflowPath,
        );
        if (info) {
          for (const input of info.inputs) {
            if (input.type === "boolean" && !(input.name in inputs)) {
              inputs[input.name] = "false";
            }
          }
        }
      }

      await dispatchWorkflow(state.octokit, owner, repo, workflowId, ref, inputs);

      res.json({
        success: true,
        message: "Workflow dispatched successfully",
        runUrl: `https://github.com/${owner}/${repo}/actions`,
      });
    } catch (err) {
      const status = (err as { status?: number }).status;
      let message = (err as Error).message;

      if (status === 403) {
        message = "You don't have permission to dispatch this workflow";
      } else if (status === 422) {
        message = `Validation error: ${message}`;
      }

      res.status(status ?? 500).json({ success: false, message });
    }
  });

  return router;
}

function findRun(
  owner: string,
  repo: string,
  workflowId: number,
): WorkflowRun | undefined {
  const state = getAppState();
  const fullName = `${owner}/${repo}`;
  const entry = state.cache.get(fullName) as CacheEntry<WorkflowRun[]> | undefined;
  if (!entry) return undefined;
  return entry.data.find((r) => r.workflowId === workflowId);
}
