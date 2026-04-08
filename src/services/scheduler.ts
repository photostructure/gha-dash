import type { WorkflowRun } from "../types.js";

export const ACTIVE_STATUSES = new Set([
  "queued",
  "in_progress",
  "waiting",
  "pending",
]);
export const MIN_REFRESH_INTERVAL_MS = 15_000;
export const DEFAULT_EXPECTED_DURATION_MS = 300_000; // 5 minutes
export const MAX_DURATION_SAMPLES = 5;

export interface AdaptiveRefreshResult {
  delayMs: number;
  /** Repos with active runs that should be refreshed. Empty = no active runs (idle). */
  activeRepos: string[];
}

/**
 * Compute the delay until the next targeted refresh based on active workflow
 * runs and their historical durations. Returns configuredIntervalMs with no
 * active repos when idle. When active runs exist, returns the time until the
 * earliest expected completion (clamped to [MIN_REFRESH_INTERVAL_MS,
 * configuredIntervalMs]) and the set of repos that have active runs.
 */
export function computeNextRefresh(
  cachedRuns: Iterable<[string, WorkflowRun[]]>,
  workflowDurations: Record<string, number[]>,
  configuredIntervalMs: number,
  now: number = Date.now(),
): AdaptiveRefreshResult {
  let earliestTimeUntilDone = Infinity;
  const activeRepoSet = new Set<string>();

  for (const [repo, runs] of cachedRuns) {
    for (const run of runs) {
      if (!ACTIVE_STATUSES.has(run.status)) continue;

      activeRepoSet.add(repo);

      const history = workflowDurations[run.workflowPath];
      const expectedDuration =
        median(history ?? []) ?? DEFAULT_EXPECTED_DURATION_MS;
      const startedAtMs = new Date(run.startedAt).getTime();
      const expectedDone = startedAtMs + expectedDuration;
      const timeUntilDone = expectedDone - now;

      earliestTimeUntilDone = Math.min(earliestTimeUntilDone, timeUntilDone);
    }
  }

  if (activeRepoSet.size === 0) {
    return { delayMs: configuredIntervalMs, activeRepos: [] };
  }

  const delayMs = Math.max(
    MIN_REFRESH_INTERVAL_MS,
    Math.min(earliestTimeUntilDone, configuredIntervalMs),
  );
  return { delayMs, activeRepos: [...activeRepoSet] };
}

/** Returns the median of a number array, or undefined if empty. */
export function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Update workflow duration history with newly completed runs. Returns a new
 * map if any updates were made, or null if nothing changed.
 */
export function updateDurationHistory(
  current: Record<string, number[]>,
  completedRuns: WorkflowRun[],
): Record<string, number[]> | null {
  let changed = false;
  const result = { ...current };

  for (const run of completedRuns) {
    if (run.status !== "completed" || run.duration <= 0) continue;

    const key = run.workflowPath;
    const existing = result[key] ?? [];

    // Skip if the last recorded duration matches — catches the common case of the
    // same completed run appearing in consecutive fetches. Can also skip a genuinely
    // different run with an identical duration, but losing one sample out of 5 is fine.
    if (existing.length > 0 && existing[existing.length - 1] === run.duration)
      continue;

    const updated = [...existing, run.duration];
    if (updated.length > MAX_DURATION_SAMPLES) {
      updated.splice(0, updated.length - MAX_DURATION_SAMPLES);
    }
    result[key] = updated;
    changed = true;
  }

  return changed ? result : null;
}
