import type { Octokit } from "@octokit/rest";
import type { AppConfig, WorkflowRun } from "./types.js";
import { Cache } from "./services/cache.js";
import {
  createOctokit,
  extractToken,
  fetchAllRuns,
  fetchUserRepos,
} from "./services/github.js";
import { readConfig, writeConfig } from "./services/config.js";

export interface AppState {
  config: AppConfig;
  octokit: Octokit;
  username: string;
  cache: Cache<WorkflowRun[]>;
  rateLimit: { remaining: number; limit: number } | null;
}

let state: AppState | null = null;
let refreshing = false;
let refreshInterval: ReturnType<typeof setInterval> | null = null;

export function getAppState(): AppState {
  if (!state) throw new Error("App not initialized. Call initAppState() first.");
  return state;
}

export async function initAppState(): Promise<AppState> {
  const token = extractToken();
  const octokit = createOctokit(token);

  const { data: user } = await octokit.users.getAuthenticated();
  const config = await readConfig();

  const cache = new Cache<WorkflowRun[]>(config.refreshInterval);

  // Restore cached data from disk so restarts don't burn API credits
  const loaded = await cache.loadFromDisk();
  if (loaded) {
    console.log(`Restored ${cache.size()} repos from disk cache`);
  }

  state = {
    config,
    octokit,
    username: user.login,
    cache,
    rateLimit: null,
  };

  return state;
}

export async function refreshRuns(): Promise<void> {
  if (!state || refreshing) return;
  refreshing = true;

  try {
    let repos = state.config.repos;

    // First-run: no repos configured — discover all user repos
    if (repos.length === 0) {
      repos = await fetchUserRepos(state.octokit);
      // Persist discovered repos so we don't re-discover on restart
      state.config.repos = repos;
      await writeConfig(state.config);
      console.log(`Discovered ${repos.length} repos, saved to config`);
    }

    const { runs, errors } = await fetchAllRuns(
      state.octokit,
      repos,
      state.config.lookbackDays,
    );

    for (const [repo, repoRuns] of runs) {
      if (repoRuns.length > 0) {
        state.cache.set(repo, repoRuns);
      }
    }

    for (const [repo, message] of errors) {
      state.cache.setError(repo, message);
    }

    // Persist cache to disk
    await state.cache.saveToDisk();

    // Update rate limit info
    try {
      const { data } = await state.octokit.rateLimit.get();
      state.rateLimit = {
        remaining: data.rate.remaining,
        limit: data.rate.limit,
      };
    } catch {
      // Non-critical
    }
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 401) {
      // Token expired — try re-extracting
      try {
        const newToken = extractToken();
        state.octokit = createOctokit(newToken);
        console.log("Re-extracted GitHub token after 401");
      } catch {
        console.error("Token expired and re-extraction failed. Run: gh auth login");
      }
    } else {
      console.error("Refresh failed:", (err as Error).message);
    }
  } finally {
    refreshing = false;
  }
}

export function startBackgroundRefresh(): void {
  refreshRuns();

  refreshInterval = setInterval(
    () => refreshRuns(),
    (state?.config.refreshInterval ?? 60) * 1000,
  );
}

export function stopBackgroundRefresh(): void {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}

export async function updateConfig(
  updates: Partial<AppConfig>,
): Promise<void> {
  if (!state) return;
  state.config = { ...state.config, ...updates };
  await writeConfig(state.config);
}
