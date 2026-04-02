import { Router } from "express";
import { getAppState } from "../state.js";
import {
  getDispatchInfo,
  dispatchWorkflow,
} from "../services/dispatch.js";
import type { CacheEntry, WorkflowRun } from "../types.js";

export function dispatchRoutes(): Router {
  const router = Router();

  // GET /dispatch/:owner/:repo/:id — render dispatch form
  router.get("/dispatch/:owner/:repo/:id", async (req, res, next) => {
    try {
      const { owner, repo, id } = req.params;
      const workflowId = parseInt(id, 10);
      const state = getAppState();

      // Find the workflow run to get its path and branch
      const run = findRun(owner, repo, workflowId);
      if (!run) {
        res.status(404).send("Workflow not found");
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
        res.status(400).send("This workflow does not support manual dispatch");
        return;
      }

      res.render("partials/dispatch-form", {
        owner,
        repo,
        workflowId,
        workflowName: info.workflowName,
        inputs: info.inputs,
        defaultBranch: run.branch,
      });
    } catch (err) {
      next(err);
    }
  });

  // POST /dispatch/:owner/:repo/:id — trigger dispatch
  router.post("/dispatch/:owner/:repo/:id", async (req, res, _next) => {
    try {
      const { owner, repo, id } = req.params;
      const workflowId = parseInt(id, 10);
      const state = getAppState();

      const ref = req.body.ref ?? "main";
      // Collect inputs — everything except "ref" from the form
      const inputs: Record<string, string> = {};
      for (const [key, value] of Object.entries(req.body)) {
        if (key !== "ref" && typeof value === "string") {
          inputs[key] = value;
        }
      }

      // Checkboxes: absent = "false", present = "true"
      // We need to handle booleans that weren't checked (not in body)
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

      res.render("partials/dispatch-result", {
        success: true,
        owner,
        repo,
        message: "Workflow dispatched successfully",
      });
    } catch (err) {
      const status = (err as { status?: number }).status;
      let message = (err as Error).message;

      if (status === 403) {
        message = "You don't have permission to dispatch this workflow";
      } else if (status === 422) {
        message = `Validation error: ${message}`;
      }

      res.render("partials/dispatch-result", {
        success: false,
        owner: req.params.owner,
        repo: req.params.repo,
        message,
      });
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
