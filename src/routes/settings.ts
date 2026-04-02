import { Router } from "express";
import { getAppState, updateConfig, refreshRuns } from "../state.js";
import {
  fetchUserOrgs,
  fetchOrgRepos,
  fetchUserRepos,
} from "../services/github.js";

export function settingsRoutes(): Router {
  const router = Router();

  router.get("/settings", async (_req, res, next) => {
    try {
      const state = getAppState();
      res.render("settings", {
        selectedRepos: state.config.repos,
        username: state.username,
      });
    } catch (err) {
      next(err);
    }
  });

  router.get("/partials/orgs", async (_req, res, next) => {
    try {
      const state = getAppState();
      const orgs = await fetchUserOrgs(state.octokit);
      res.render("partials/orgs", {
        orgs,
        username: state.username,
      });
    } catch (err) {
      next(err);
    }
  });

  router.get("/partials/repos/:owner", async (req, res, next) => {
    try {
      const state = getAppState();
      const owner = req.params.owner;

      let repos: Array<{ fullName: string; description: string | null }>;

      if (owner === state.username) {
        // Personal repos
        const names = await fetchUserRepos(state.octokit);
        repos = names.map((n) => ({ fullName: n, description: null }));
      } else {
        repos = await fetchOrgRepos(state.octokit, owner);
      }

      res.render("partials/repos", {
        repos,
        selectedRepos: state.config.repos,
      });
    } catch (err) {
      next(err);
    }
  });

  router.post("/settings/repos", async (req, res, next) => {
    try {
      const repos = req.body.repos;
      // Normalize: could be string (single) or string[] (multiple)
      const repoList = Array.isArray(repos) ? repos : repos ? [repos] : [];

      await updateConfig({ repos: repoList });
      // Trigger a fresh data load with new repo list
      refreshRuns();
      res.redirect("/");
    } catch (err) {
      next(err);
    }
  });

  return router;
}
