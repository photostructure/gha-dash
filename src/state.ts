import type { Octokit } from "@octokit/rest";
import { EventEmitter } from "node:events";
import { Cache } from "./services/cache.js";
import { readConfig, writeConfig } from "./services/config.js";
import { EtagCache, installEtagHook } from "./services/etagCache.js";
import type { RepoStats } from "./services/github.js";
import {
  createOctokit,
  extractToken,
  fetchActiveWorkflowIds,
  fetchAllRuns,
  fetchRateLimit,
  fetchRepoMeta,
  fetchRepoStats,
  fetchUserRepos,
  fetchWorkflowRuns,
} from "./services/github.js";
import {
  computeNextRefresh,
  updateDurationHistory,
} from "./services/scheduler.js";
import type { AppConfig, WorkflowRun } from "./types.js";

export interface AppState {
  config: AppConfig;
  octokit: Octokit;
  etagCache: EtagCache;
  username: string;
  cache: Cache<WorkflowRun[]>;
  repoStats: Map<string, RepoStats>;
  /**
   * Active (non-deleted) workflow IDs per repo, captured during the most
   * recent full refresh. Used by refreshRepoActive() to filter out runs for
   * deleted workflows without re-fetching the workflow list every poll.
   */
  workflowIds: Map<string, Set<number>>;
  rateLimit: { remaining: number; limit: number; checkedAt: Date } | null;
}

let state: AppState | null = null;
export let refreshing = false;

/** Emits "refreshed" when a background refresh cycle completes. */
export const stateEvents = new EventEmitter();
let refreshPromise: Promise<void> | null = null;
let refreshTimeout: ReturnType<typeof setTimeout> | null = null;
let fullRefreshTimeout: ReturnType<typeof setTimeout> | null = null;
const FULL_REFRESH_COUNTED_CALLS_PER_REPO = 2;

export function getAppState(): AppState {
  if (!state)
    throw new Error("App not initialized. Call initAppState() first.");
  return state;
}

export async function initAppState(): Promise<AppState> {
  const token = extractToken();
  const octokit = createOctokit(token);
  const etagCache = new EtagCache();
  installEtagHook(octokit, etagCache);

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
    etagCache,
    username: user.login,
    cache,
    repoStats: new Map(),
    workflowIds: new Map(),
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
  refreshPromise = doRefresh().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

async function doRefresh(): Promise<void> {
  if (!state) return;
  refreshing = true;

  // Cancel any in-flight active refresh to prevent concurrent config writes
  if (refreshTimeout) {
    clearTimeout(refreshTimeout);
    refreshTimeout = null;
  }

  try {
    // Check rate limit before doing anything
    try {
      state.rateLimit = {
        ...(await fetchRateLimit(state.octokit)),
        checkedAt: new Date(),
      };
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

    const { runs, stats, errors, discoveredBranches, workflowIds } =
      await fetchAllRuns(state.octokit, repos, state.config.branches, maxRepos);

    for (const [repo, repoRuns] of runs) {
      if (repoRuns.length > 0) {
        state.cache.set(repo, repoRuns);
      }
    }

    for (const [repo, repoStats] of stats) {
      state.repoStats.set(repo, repoStats);
    }

    // Capture active workflow IDs so refreshRepoActive can filter deleted
    // workflows without re-fetching the workflow list every active poll.
    for (const [repo, ids] of workflowIds) {
      state.workflowIds.set(repo, ids);
    }

    for (const [repo, message] of errors) {
      state.cache.setError(repo, message);
    }

    // Persist newly discovered branches and workflow durations to config
    let configDirty = false;

    if (Object.keys(discoveredBranches).length > 0) {
      state.config.branches = {
        ...state.config.branches,
        ...discoveredBranches,
      };
      configDirty = true;
    }

    const allCompleted: WorkflowRun[] = [];
    for (const [, repoRuns] of runs) {
      for (const run of repoRuns) {
        if (run.status === "completed" && run.duration > 0) {
          allCompleted.push(run);
        }
      }
    }
    const updatedDurations = updateDurationHistory(
      state.config.workflowDurations,
      allCompleted,
    );
    if (updatedDurations) {
      state.config.workflowDurations = updatedDurations;
      configDirty = true;
    }

    if (configDirty) {
      await writeConfig(state.config);
    }

    await state.cache.saveToDisk();

    // Update rate limit after the fetch
    try {
      state.rateLimit = {
        ...(await fetchRateLimit(state.octokit)),
        checkedAt: new Date(),
      };
      const noEtag = state.etagCache.noEtagResponses();
      const noEtagSuffix = noEtag > 0 ? ` (${noEtag} without etag!)` : "";
      console.log(
        `Refreshed ${runs.size} repos. API: ${state.rateLimit.remaining}/${state.rateLimit.limit} remaining. ETag cache: ${state.etagCache.hits()} hits / ${state.etagCache.misses()} misses${noEtagSuffix} (${state.etagCache.size()} entries)`,
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
        installEtagHook(state.octokit, state.etagCache);
        console.log("Re-extracted GitHub token after 401");
      } catch {
        console.error(
          "Token expired and re-extraction failed. Run: gh auth login",
        );
      }
    } else {
      console.error("Refresh failed:", (err as Error).message);
    }
  } finally {
    refreshing = false;
    stateEvents.emit("refreshed");
    scheduleFullRefresh();
    scheduleActiveRefresh();
  }
}

/**
 * Compute how many repos we can refresh this cycle based on rate limit budget.
 * Full refresh always spends two counted calls per repo: PR stats and runs.
 * Other repo/workflow requests are conditional and only count on ETag misses.
 * Returns undefined if no budget constraint applies (fetch all).
 */
export function computeBudget(
  state: AppState,
  totalRepos: number,
): number | undefined {
  if (!state.rateLimit) return undefined;

  const { remaining, limit } = state.rateLimit;
  const floor = state.config.rateLimitFloor;
  const pct = state.config.rateBudgetPct / 100;

  // Available = what we're willing to spend this cycle
  const budgetFromPct = Math.floor(limit * pct);
  const available = Math.min(remaining - floor, budgetFromPct);

  const affordableRepos = Math.floor(
    available / FULL_REFRESH_COUNTED_CALLS_PER_REPO,
  );

  if (affordableRepos >= totalRepos) return undefined; // Can afford all repos
  if (available <= 0) return 0;

  return affordableRepos;
}

export function startBackgroundRefresh(): void {
  if (!state) return;

  // Skip immediate refresh if disk cache is fresh
  const newestEntry = getNewestCacheEntry(state);
  const cacheAgeMs = newestEntry ? Date.now() - newestEntry : Infinity;
  const configuredIntervalMs = state.config.refreshInterval * 1000;

  if (cacheAgeMs < configuredIntervalMs) {
    const ageMin = Math.round(cacheAgeMs / 60_000);
    console.log(`Cache is fresh (${ageMin}m old), skipping initial refresh`);
  } else {
    refreshRuns();
  }

  scheduleFullRefresh();
  scheduleActiveRefresh();
}

/** Schedule the next full refresh (all repos) on the configured interval. */
function scheduleFullRefresh(): void {
  if (!state) return;
  if (fullRefreshTimeout) clearTimeout(fullRefreshTimeout);

  const configuredIntervalMs = state.config.refreshInterval * 1000;

  fullRefreshTimeout = setTimeout(() => {
    refreshRuns(); // reschedules via doRefresh's finally block
  }, configuredIntervalMs);
}

/**
 * Schedule a targeted refresh for only repos with active runs. If no repos
 * have active runs, no timer is set (the full refresh handles idle mode).
 */
function scheduleActiveRefresh(): void {
  if (!state) return;
  if (refreshTimeout) clearTimeout(refreshTimeout);
  refreshTimeout = null;

  const configuredIntervalMs = state.config.refreshInterval * 1000;
  const cachedEntries = getCachedRunEntries(state);
  const { delayMs, activeRepos } = computeNextRefresh(
    cachedEntries,
    state.config.workflowDurations,
    configuredIntervalMs,
  );

  if (activeRepos.length === 0) return; // idle — full refresh timer handles it

  console.log(
    `Active runs in ${activeRepos.length} repo(s), targeted refresh in ${Math.round(delayMs / 1000)}s`,
  );

  refreshTimeout = setTimeout(async () => {
    for (const repo of activeRepos) {
      if (refreshing) break; // full refresh took over — bail out
      await refreshRepoActive(repo);
    }
    if (!refreshing) {
      stateEvents.emit("refreshed");
      scheduleActiveRefresh(); // reschedule for next check
    }
  }, delayMs);
}

function getCachedRunEntries(state: AppState): [string, WorkflowRun[]][] {
  const result: [string, WorkflowRun[]][] = [];
  for (const [repo, entry] of state.cache.entries()) {
    result.push([repo, entry.data]);
  }
  return result;
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

  // Fetch repo metadata (branch + issue count)
  const meta = await fetchRepoMeta(state.octokit, owner, repo);
  if (!state.config.branches[fullName]) {
    state.config.branches[fullName] = meta.defaultBranch;
    await writeConfig(state.config);
  }

  try {
    const [activeIds, repoStats] = await Promise.all([
      fetchActiveWorkflowIds(state.octokit, owner, repo),
      fetchRepoStats(
        state.octokit,
        owner,
        repo,
        meta.openIssuesAndPrs,
        meta.canPush,
      ),
    ]);
    state.repoStats.set(fullName, repoStats);
    state.workflowIds.set(fullName, activeIds);

    const runs = await fetchWorkflowRuns(state.octokit, owner, repo, activeIds);

    if (runs.length > 0) {
      state.cache.set(fullName, runs);
      await state.cache.saveToDisk();

      // Update duration history from completed runs
      const completed = runs.filter(
        (r) => r.status === "completed" && r.duration > 0,
      );
      const updatedDurations = updateDurationHistory(
        state.config.workflowDurations,
        completed,
      );
      if (updatedDurations) {
        state.config.workflowDurations = updatedDurations;
        await writeConfig(state.config);
      }
    }
    // If runs is empty, keep existing cache — don't delete what we had
  } catch (err) {
    state.cache.setError(fullName, (err as Error).message);
  }
}

/**
 * Targeted active-poll refresh for a single repo. Only fetches workflow runs
 * — skips repo metadata, workflow list, and PR/issue stats since none of
 * those change at the active-poll cadence (every ~15s while a run is in
 * flight). Drops 4 API calls per repo to 1 vs. refreshRepo().
 *
 * Uses state.workflowIds (captured during the most recent full refresh) to
 * filter out runs for deleted workflows. If a repo has no cached workflowIds
 * yet (e.g. process restart before first full refresh completed), the filter
 * is skipped — deleted workflows could appear in the result for one cycle.
 */
export async function refreshRepoActive(fullName: string): Promise<void> {
  if (!state) return;

  const [owner, repo] = fullName.split("/");
  const cachedIds = state.workflowIds.get(fullName);

  try {
    const runs = await fetchWorkflowRuns(state.octokit, owner, repo, cachedIds);

    if (runs.length > 0) {
      state.cache.set(fullName, runs);
      await state.cache.saveToDisk();

      const completed = runs.filter(
        (r) => r.status === "completed" && r.duration > 0,
      );
      const updatedDurations = updateDurationHistory(
        state.config.workflowDurations,
        completed,
      );
      if (updatedDurations) {
        state.config.workflowDurations = updatedDurations;
        await writeConfig(state.config);
      }
    }
  } catch (err) {
    state.cache.setError(fullName, (err as Error).message);
  }
}

export function stopBackgroundRefresh(): void {
  if (refreshTimeout) {
    clearTimeout(refreshTimeout);
    refreshTimeout = null;
  }
  if (fullRefreshTimeout) {
    clearTimeout(fullRefreshTimeout);
    fullRefreshTimeout = null;
  }
}

/**
 * TEST ONLY — replace the module-private state. Lets tests construct an
 * AppState directly and exercise refresh functions without going through the
 * full initAppState flow (which requires a real `gh` CLI). Pass null to clear.
 */
export function __setStateForTests(s: AppState | null): void {
  state = s;
}

export async function updateConfig(updates: Partial<AppConfig>): Promise<void> {
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
