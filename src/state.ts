import type { Octokit } from "@octokit/rest";
import type { AppConfig, WorkflowRun } from "./types.js";
import { Cache } from "./services/cache.js";
import {
  createOctokit,
  extractToken,
  fetchActiveWorkflowIds,
  fetchAllRuns,
  fetchDefaultBranch,
  fetchRateLimit,
  fetchUserRepos,
  fetchWorkflowRuns,
} from "./services/github.js";
import { readConfig, writeConfig } from "./services/config.js";

export interface AppState {
  config: AppConfig;
  octokit: Octokit;
  username: string;
  cache: Cache<WorkflowRun[]>;
  rateLimit: { remaining: number; limit: number; checkedAt: Date } | null;
}

let state: AppState | null = null;
let refreshing = false;
let refreshPromise: Promise<void> | null = null;
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

  const loaded = await cache.loadFromDisk();
  if (loaded) {
    // Prune cache to only repos in config (if configured)
    if (config.repos.length > 0) {
      const keep = new Set(config.repos);
      for (const [repo] of cache.entries()) {
        if (!keep.has(repo)) cache.delete(repo);
      }
    }
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

/**
 * Refresh all repos. If a refresh is already in flight, returns the existing
 * promise so callers can await its completion rather than silently no-op.
 */
export function refreshRuns(): Promise<void> {
  if (!state) return Promise.resolve();
  if (refreshPromise) return refreshPromise;
  refreshPromise = doRefresh().finally(() => { refreshPromise = null; });
  return refreshPromise;
}

async function doRefresh(): Promise<void> {
  if (!state) return;
  refreshing = true;

  try {
    // Check rate limit before doing anything
    try {
      state.rateLimit = { ...await fetchRateLimit(state.octokit), checkedAt: new Date() };
    } catch {
      // Can't check rate limit — proceed cautiously
    }

    if (state.rateLimit) {
      const { remaining, limit } = state.rateLimit;
      const floor = state.config.rateLimitFloor;

      if (remaining <= floor) {
        console.log(
          `Rate limit: ${remaining}/${limit} remaining (floor: ${floor}). Skipping refresh.`,
        );
        return;
      }
    }

    // Discover available repos if we haven't yet
    if (state.config.availableRepos.length === 0) {
      const discovered = await fetchUserRepos(state.octokit);
      state.config.availableRepos = discovered;
      // First-run: also select all discovered repos
      if (state.config.repos.length === 0) {
        state.config.repos = discovered;
      }
      await writeConfig(state.config);
      console.log(`Discovered ${discovered.length} repos, saved to config`);
    }

    const repos = state.config.repos;

    // Calculate how many repos we can afford to refresh this cycle
    const maxRepos = computeBudget(state, repos.length);

    const { runs, errors, discoveredBranches } = await fetchAllRuns(
      state.octokit,
      repos,
      state.config.branches,
      maxRepos,
    );

    for (const [repo, repoRuns] of runs) {
      if (repoRuns.length > 0) {
        state.cache.set(repo, repoRuns);
      }
    }

    for (const [repo, message] of errors) {
      state.cache.setError(repo, message);
    }

    // Persist newly discovered branches to config
    if (Object.keys(discoveredBranches).length > 0) {
      state.config.branches = {
        ...state.config.branches,
        ...discoveredBranches,
      };
      await writeConfig(state.config);
    }

    await state.cache.saveToDisk();

    // Update rate limit after the fetch
    try {
      state.rateLimit = { ...await fetchRateLimit(state.octokit), checkedAt: new Date() };
      console.log(
        `Refreshed ${runs.size} repos. API: ${state.rateLimit.remaining}/${state.rateLimit.limit} remaining`,
      );
    } catch {
      // Non-critical
    }
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 401) {
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

/**
 * Compute how many repos we can refresh this cycle based on rate limit budget.
 * Each repo costs 1 API call (runs) + possibly 1 (branch, if not cached).
 * Returns undefined if no budget constraint applies (fetch all).
 */
function computeBudget(state: AppState, totalRepos: number): number | undefined {
  if (!state.rateLimit) return undefined;

  const { remaining, limit } = state.rateLimit;
  const floor = state.config.rateLimitFloor;
  const pct = state.config.rateBudgetPct / 100;

  // Available = what we're willing to spend this cycle
  const budgetFromPct = Math.floor(limit * pct);
  const available = Math.min(remaining - floor, budgetFromPct);

  if (available >= totalRepos) return undefined; // Can afford all repos
  if (available <= 0) return 0;

  return available;
}

export function startBackgroundRefresh(): void {
  if (!state) return;

  // Skip immediate refresh if disk cache is fresh
  const newestEntry = getNewestCacheEntry(state);
  const cacheAgeMs = newestEntry ? Date.now() - newestEntry : Infinity;
  const intervalMs = state.config.refreshInterval * 1000;

  if (cacheAgeMs < intervalMs) {
    const ageMin = Math.round(cacheAgeMs / 60_000);
    console.log(`Cache is fresh (${ageMin}m old), skipping initial refresh`);
  } else {
    refreshRuns();
  }

  refreshInterval = setInterval(() => refreshRuns(), intervalMs);
}

function getNewestCacheEntry(state: AppState): number | null {
  let newest: number | null = null;
  for (const [, entry] of state.cache.entries()) {
    if (newest === null || entry.fetchedAt > newest) {
      newest = entry.fetchedAt;
    }
  }
  return newest;
}

/** Refresh a single repo on demand (e.g. from the refresh button) */
export async function refreshRepo(fullName: string): Promise<void> {
  if (!state) return;

  const [owner, repo] = fullName.split("/");

  // Cache default branch for dispatch if not already cached
  if (!state.config.branches[fullName]) {
    const branch = await fetchDefaultBranch(state.octokit, owner, repo);
    state.config.branches[fullName] = branch;
    await writeConfig(state.config);
  }

  try {
    const activeIds = await fetchActiveWorkflowIds(state.octokit, owner, repo);
    const runs = await fetchWorkflowRuns(state.octokit, owner, repo, activeIds);

    if (runs.length > 0) {
      state.cache.set(fullName, runs);
      await state.cache.saveToDisk();
    }
    // If runs is empty, keep existing cache — don't delete what we had
  } catch (err) {
    state.cache.setError(fullName, (err as Error).message);
  }
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

  // If repos changed, prune cache to only keep selected repos
  if (updates.repos) {
    const keep = new Set(updates.repos);
    for (const [repo] of state.cache.entries()) {
      if (!keep.has(repo)) {
        state.cache.delete(repo);
      }
    }
    await state.cache.saveToDisk();
  }

  state.config = { ...state.config, ...updates };
  await writeConfig(state.config);
}
