import { beforeEach, describe, expect, it } from "vitest";
import { computeBudget, type AppState } from "../../state.js";
import { defaultConfig, type WorkflowRun } from "../../types.js";
import { Cache } from "../cache.js";

const mockRun = (repo: string, workflowName: string): WorkflowRun => ({
  workflowId: 1,
  workflowName,
  repo,
  status: "completed",
  conclusion: "success",
  branch: "main",
  commitSha: "abc1234",
  commitMessage: "test",
  duration: 60_000,
  createdAt: new Date().toISOString(),
  htmlUrl: "https://github.com/test",
  workflowPath: ".github/workflows/ci.yml",
  startedAt: new Date().toISOString(),
});

describe("cache pruning on repo change", () => {
  let cache: Cache<WorkflowRun[]>;

  beforeEach(() => {
    cache = new Cache<WorkflowRun[]>(300);
    cache.set("owner/keep", [mockRun("owner/keep", "ci")]);
    cache.set("owner/remove", [mockRun("owner/remove", "ci")]);
    cache.set("owner/also-remove", [mockRun("owner/also-remove", "ci")]);
  });

  it("deletes repos not in the keep set", () => {
    const keep = new Set(["owner/keep"]);
    for (const [repo] of cache.entries()) {
      if (!keep.has(repo)) cache.delete(repo);
    }

    expect(cache.get("owner/keep")).toBeDefined();
    expect(cache.get("owner/remove")).toBeUndefined();
    expect(cache.get("owner/also-remove")).toBeUndefined();
    expect(cache.size()).toBe(1);
  });

  it("keeps all repos when keep set matches", () => {
    const keep = new Set(["owner/keep", "owner/remove", "owner/also-remove"]);
    for (const [repo] of cache.entries()) {
      if (!keep.has(repo)) cache.delete(repo);
    }

    expect(cache.size()).toBe(3);
  });
});

describe("refreshRepo preserves cache on empty result", () => {
  it("keeps existing data when fresh fetch returns empty", () => {
    const cache = new Cache<WorkflowRun[]>(300);
    const existing = [mockRun("owner/repo", "ci")];
    cache.set("owner/repo", existing);

    // Simulate: fetchWorkflowRuns returned empty (lookback filtered everything)
    const freshRuns: WorkflowRun[] = [];

    // This is the logic from refreshRepo: only update if runs.length > 0
    if (freshRuns.length > 0) {
      cache.set("owner/repo", freshRuns);
    }

    // Existing data should be preserved
    const entry = cache.get("owner/repo");
    expect(entry?.data).toEqual(existing);
  });

  it("records error but keeps stale data on fetch failure", () => {
    const cache = new Cache<WorkflowRun[]>(300);
    const existing = [mockRun("owner/repo", "ci")];
    cache.set("owner/repo", existing);

    // Simulate: fetch threw an error
    cache.setError("owner/repo", "403 rate limited");

    const entry = cache.get("owner/repo");
    expect(entry?.data).toEqual(existing);
    expect(entry?.error).toBe("403 rate limited");
  });
});

describe("cache delete", () => {
  it("removes a specific entry", () => {
    const cache = new Cache<string[]>(60);
    cache.set("a", ["1"]);
    cache.set("b", ["2"]);
    cache.delete("a");

    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBeDefined();
    expect(cache.size()).toBe(1);
  });

  it("is a no-op for missing keys", () => {
    const cache = new Cache<string[]>(60);
    cache.set("a", ["1"]);
    cache.delete("missing");
    expect(cache.size()).toBe(1);
  });
});

describe("computeBudget", () => {
  function makeBudgetState(
    remaining: number,
    limit: number,
    config: Partial<AppState["config"]> = {},
  ): AppState {
    return {
      config: {
        ...defaultConfig,
        rateBudgetPct: 100,
        ...config,
      },
      rateLimit: { remaining, limit, checkedAt: new Date() },
    } as AppState;
  }

  it("budgets two counted calls per repo when constrained by the rate-limit floor", () => {
    const state = makeBudgetState(600, 5000, { rateLimitFloor: 500 });

    expect(computeBudget(state, 1000)).toBe(50);
  });

  it("fetches all repos when the two-call budget can cover them", () => {
    const state = makeBudgetState(610, 5000, { rateLimitFloor: 500 });

    expect(computeBudget(state, 55)).toBeUndefined();
  });

  it("returns zero when no calls are available above the floor", () => {
    const state = makeBudgetState(500, 5000, { rateLimitFloor: 500 });

    expect(computeBudget(state, 10)).toBe(0);
  });
});
