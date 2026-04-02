import { Router } from "express";
import { getAppState, updateConfig, refreshRuns } from "../state.js";

export function settingsRoutes(): Router {
  const router = Router();

  router.get("/settings", async (_req, res, next) => {
    try {
      const state = getAppState();
      res.render("settings", {
        page: "settings",
        availableRepos: state.config.availableRepos,
        selectedRepos: state.config.repos,
      });
    } catch (err) {
      next(err);
    }
  });

  router.post("/settings/repos", async (req, res, next) => {
    try {
      const repos = req.body.repos;
      const repoList = Array.isArray(repos) ? repos : repos ? [repos] : [];

      await updateConfig({ repos: repoList });
      refreshRuns();
      res.redirect("/");
    } catch (err) {
      next(err);
    }
  });

  return router;
}
