import { describe, it, expect } from "vitest";
import type { WorkflowRun } from "../../types.js";
import {
  computeNextRefresh,
  median,
  updateDurationHistory,
  MIN_REFRESH_INTERVAL_MS,
  MAX_DURATION_SAMPLES,
} from "../scheduler.js";

function makeRun(overrides: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
    workflowId: 1,
    workflowName: "ci",
    repo: "owner/repo",
    status: "completed",
    conclusion: "success",
    branch: "main",
    commitSha: "abc1234",
    commitMessage: "test",
    duration: 300_000,
    createdAt: new Date().toISOString(),
    htmlUrl: "https://github.com/owner/repo/actions/runs/1",
    workflowPath: ".github/workflows/ci.yml",
    startedAt: new Date().toISOString(),
    ...overrides,
  };
}

/** Helper: wrap runs as a single-repo entry for computeNextRefresh */
function entries(repo: string, runs: WorkflowRun[]): [string, WorkflowRun[]][] {
  return [[repo, runs]];
}

describe("median", () => {
  it("returns undefined for empty array", () => {
    expect(median([])).toBeUndefined();
  });

  it("returns the single element", () => {
    expect(median([42])).toBe(42);
  });

  it("returns the middle value for odd-length arrays", () => {
    expect(median([1, 3, 5])).toBe(3);
    expect(median([10, 20, 30, 40, 50])).toBe(30);
  });

  it("returns the average of two middle values for even-length arrays", () => {
    expect(median([1, 3])).toBe(2);
    expect(median([10, 20, 30, 40])).toBe(25);
  });

  it("handles unsorted input", () => {
    expect(median([5, 1, 3])).toBe(3);
  });
});

describe("computeNextRefresh", () => {
  const configuredInterval = 3_600_000; // 1 hour

  it("returns configured interval with no active repos when idle", () => {
    const runs = [makeRun({ status: "completed" })];
    const result = computeNextRefresh(entries("owner/repo", runs), {}, configuredInterval);
    expect(result.delayMs).toBe(configuredInterval);
    expect(result.activeRepos).toEqual([]);
  });

  it("returns configured interval when run list is empty", () => {
    const result = computeNextRefresh([], {}, configuredInterval);
    expect(result.delayMs).toBe(configuredInterval);
    expect(result.activeRepos).toEqual([]);
  });

  it("uses duration history to compute expected completion", () => {
    const now = Date.now();
    const startedAt = new Date(now - 200_000).toISOString(); // started 200s ago
    const runs = [makeRun({
      status: "in_progress",
      conclusion: null,
      startedAt,
      workflowPath: ".github/workflows/ci.yml",
    })];
    const durations = { ".github/workflows/ci.yml": [300_000] }; // typically 300s

    const result = computeNextRefresh(entries("owner/repo", runs), durations, configuredInterval, now);

    // Expected completion in ~100s
    expect(result.delayMs).toBeGreaterThan(90_000);
    expect(result.delayMs).toBeLessThan(110_000);
    expect(result.activeRepos).toEqual(["owner/repo"]);
  });

  it("uses default duration when no history exists", () => {
    const now = Date.now();
    const startedAt = new Date(now - 100_000).toISOString(); // started 100s ago
    const runs = [makeRun({
      status: "queued",
      conclusion: null,
      startedAt,
    })];

    const result = computeNextRefresh(entries("owner/repo", runs), {}, configuredInterval, now);

    // Default 300s - 100s elapsed = 200s
    expect(result.delayMs).toBeGreaterThan(190_000);
    expect(result.delayMs).toBeLessThan(210_000);
    expect(result.activeRepos).toEqual(["owner/repo"]);
  });

  it("returns minimum interval when past expected completion", () => {
    const now = Date.now();
    const startedAt = new Date(now - 600_000).toISOString(); // started 10min ago
    const runs = [makeRun({
      status: "in_progress",
      conclusion: null,
      startedAt,
      workflowPath: ".github/workflows/ci.yml",
    })];
    const durations = { ".github/workflows/ci.yml": [300_000] }; // typically 5min

    const result = computeNextRefresh(entries("owner/repo", runs), durations, configuredInterval, now);

    expect(result.delayMs).toBe(MIN_REFRESH_INTERVAL_MS);
    expect(result.activeRepos).toEqual(["owner/repo"]);
  });

  it("picks the earliest expected completion across multiple active runs", () => {
    const now = Date.now();
    const runs = [
      makeRun({
        status: "in_progress",
        conclusion: null,
        startedAt: new Date(now - 250_000).toISOString(), // 250s ago → 50s left
        workflowPath: ".github/workflows/ci.yml",
      }),
      makeRun({
        status: "queued",
        conclusion: null,
        startedAt: new Date(now - 100_000).toISOString(), // 100s ago → 200s left
        workflowPath: ".github/workflows/deploy.yml",
      }),
    ];
    const durations = {
      ".github/workflows/ci.yml": [300_000],
      ".github/workflows/deploy.yml": [300_000],
    };

    const result = computeNextRefresh(entries("owner/repo", runs), durations, configuredInterval, now);

    // Should pick the closer one (~50s), but clamped to minimum
    expect(result.delayMs).toBeGreaterThanOrEqual(MIN_REFRESH_INTERVAL_MS);
    expect(result.delayMs).toBeLessThan(60_000);
    expect(result.activeRepos).toEqual(["owner/repo"]);
  });

  it("ignores completed runs when computing next refresh", () => {
    const now = Date.now();
    const runs = [
      makeRun({ status: "completed", conclusion: "success" }),
      makeRun({
        status: "in_progress",
        conclusion: null,
        startedAt: new Date(now - 100_000).toISOString(),
        workflowPath: ".github/workflows/ci.yml",
      }),
    ];
    const durations = { ".github/workflows/ci.yml": [300_000] };

    const result = computeNextRefresh(entries("owner/repo", runs), durations, configuredInterval, now);

    // 300s - 100s = 200s
    expect(result.delayMs).toBeGreaterThan(190_000);
    expect(result.delayMs).toBeLessThan(210_000);
    expect(result.activeRepos).toEqual(["owner/repo"]);
  });

  it("clamps to configured interval even if expected completion is far away", () => {
    const now = Date.now();
    const runs = [makeRun({
      status: "queued",
      conclusion: null,
      startedAt: new Date(now).toISOString(), // just started
      workflowPath: ".github/workflows/ci.yml",
    })];
    const durations = { ".github/workflows/ci.yml": [7_200_000] }; // 2 hours

    const result = computeNextRefresh(entries("owner/repo", runs), durations, configuredInterval, now);

    expect(result.delayMs).toBe(configuredInterval);
    expect(result.activeRepos).toEqual(["owner/repo"]);
  });

  it("returns only repos with active runs across multiple groups", () => {
    const now = Date.now();
    const result = computeNextRefresh(
      [
        ["owner/idle-repo", [makeRun({ status: "completed" })]],
        ["owner/active-repo", [makeRun({
          status: "in_progress",
          conclusion: null,
          startedAt: new Date(now - 280_000).toISOString(),
          workflowPath: ".github/workflows/ci.yml",
        })]],
      ],
      { ".github/workflows/ci.yml": [300_000] },
      configuredInterval,
      now,
    );

    // 300s - 280s = 20s, above minimum
    expect(result.delayMs).toBeGreaterThanOrEqual(MIN_REFRESH_INTERVAL_MS);
    expect(result.delayMs).toBeLessThan(30_000);
    expect(result.activeRepos).toEqual(["owner/active-repo"]);
  });
});

describe("updateDurationHistory", () => {
  it("creates entry for a new workflow", () => {
    const result = updateDurationHistory({}, [
      makeRun({ workflowPath: ".github/workflows/ci.yml", duration: 300_000 }),
    ]);

    expect(result).toEqual({ ".github/workflows/ci.yml": [300_000] });
  });

  it("appends to existing history", () => {
    const current = { ".github/workflows/ci.yml": [200_000] };
    const result = updateDurationHistory(current, [
      makeRun({ workflowPath: ".github/workflows/ci.yml", duration: 300_000 }),
    ]);

    expect(result).toEqual({ ".github/workflows/ci.yml": [200_000, 300_000] });
  });

  it("skips duplicate duration (same run re-fetched)", () => {
    const current = { ".github/workflows/ci.yml": [300_000] };
    const result = updateDurationHistory(current, [
      makeRun({ workflowPath: ".github/workflows/ci.yml", duration: 300_000 }),
    ]);

    expect(result).toBeNull();
  });

  it("caps history at MAX_DURATION_SAMPLES", () => {
    const current = { ".github/workflows/ci.yml": [100, 200, 300, 400, 500] };
    expect(current[".github/workflows/ci.yml"]).toHaveLength(MAX_DURATION_SAMPLES);

    const result = updateDurationHistory(current, [
      makeRun({ workflowPath: ".github/workflows/ci.yml", duration: 600 }),
    ]);

    expect(result![".github/workflows/ci.yml"]).toHaveLength(MAX_DURATION_SAMPLES);
    expect(result![".github/workflows/ci.yml"]).toEqual([200, 300, 400, 500, 600]);
  });

  it("ignores runs with zero or negative duration", () => {
    const result = updateDurationHistory({}, [
      makeRun({ duration: 0 }),
      makeRun({ duration: -1 }),
    ]);

    expect(result).toBeNull();
  });

  it("ignores non-completed runs", () => {
    const result = updateDurationHistory({}, [
      makeRun({ status: "in_progress", conclusion: null, duration: 300_000 }),
    ]);

    expect(result).toBeNull();
  });

  it("returns null when nothing changed", () => {
    expect(updateDurationHistory({}, [])).toBeNull();
  });

  it("does not mutate the original map", () => {
    const current = { ".github/workflows/ci.yml": [200_000] };
    const result = updateDurationHistory(current, [
      makeRun({ workflowPath: ".github/workflows/ci.yml", duration: 300_000 }),
    ]);

    expect(current[".github/workflows/ci.yml"]).toEqual([200_000]);
    expect(result![".github/workflows/ci.yml"]).toEqual([200_000, 300_000]);
  });
});
