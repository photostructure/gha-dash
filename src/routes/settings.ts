import { Router } from "express";
import { getAppState, updateConfig, refreshRuns } from "../state.js";

export function settingsRoutes(): Router {
  const router = Router();

  router.get("/settings", async (_req, res, next) => {
    try {
      const state = getAppState();
      res.render("settings", {
        page: "settings",
        config: state.config,
        availableRepos: state.config.availableRepos,
        selectedRepos: state.config.repos,
      });
    } catch (err) {
      next(err);
    }
  });

  router.post("/settings/all", async (req, res, next) => {
    try {
      const {
        repos,
        refreshInterval,
        rateLimitFloor,
        rateBudgetPct,
        port,
        hiddenWorkflows,
      } = req.body;

      const repoList = Array.isArray(repos) ? repos : repos ? [repos] : [];

      await updateConfig({
        repos: repoList,
        refreshInterval: parseInt(refreshInterval, 10),
        rateLimitFloor: parseInt(rateLimitFloor, 10),
        rateBudgetPct: parseInt(rateBudgetPct, 10),
        port: parseInt(port, 10),
        hiddenWorkflows: (hiddenWorkflows ?? "")
          .split(",")
          .map((s: string) => s.trim())
          .filter(Boolean),
      });

      refreshRuns();
      res.redirect("/");
    } catch (err) {
      next(err);
    }
  });

  return router;
}
