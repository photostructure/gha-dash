import { Octokit } from "@octokit/rest";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  __setStateForTests,
  type AppState,
  refreshRepoActive,
} from "../../state.js";
import { defaultConfig, type WorkflowRun } from "../../types.js";
import { Cache } from "../cache.js";
import { EtagCache } from "../etagCache.js";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const testDir = join(tmpdir(), `gha-dash-test-active-${process.pid}`);

beforeEach(() => {
  vi.stubEnv("XDG_CONFIG_HOME", testDir);
  vi.stubEnv("APPDATA", testDir);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  __setStateForTests(null);
  await rm(testDir, { recursive: true, force: true });
});

function makeState(): AppState {
  return {
    config: { ...defaultConfig },
    octokit: new Octokit({
      auth: "test-token",
      baseUrl: "https://api.github.com",
    }),
    etagCache: new EtagCache(),
    username: "test-user",
    cache: new Cache<WorkflowRun[]>(300),
    repoStats: new Map(),
    workflowIds: new Map(),
    rateLimit: null,
  };
}

const now = new Date();

function makeApiRun(
  id: number,
  workflowId: number,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    workflow_id: workflowId,
    name: `Workflow ${workflowId}`,
    head_branch: "main",
    head_sha: "abc1234567890",
    status: "completed",
    conclusion: "success",
    created_at: now.toISOString(),
    updated_at: new Date(now.getTime() + 60_000).toISOString(),
    run_started_at: now.toISOString(),
    html_url: `https://github.com/owner/repo/actions/runs/${id}`,
    display_title: `Run #${id}`,
    path: `.github/workflows/wf-${workflowId}.yml`,
    ...overrides,
  };
}

describe("refreshRepoActive", () => {
  it("only fetches workflow runs (no repo meta, workflow list, or pulls)", async () => {
    const state = makeState();
    state.workflowIds.set("owner/repo", new Set([100]));
    __setStateForTests(state);

    // Only register the runs endpoint. msw is configured with
    // onUnhandledRequest: "error", so any other endpoint hit fails the test.
    server.use(
      http.get(
        "https://api.github.com/repos/owner/repo/actions/runs",
        () =>
          HttpResponse.json({
            total_count: 1,
            workflow_runs: [makeApiRun(1, 100)],
          }),
      ),
    );

    await refreshRepoActive("owner/repo");

    const entry = state.cache.get("owner/repo");
    expect(entry).toBeDefined();
    expect(entry?.data).toHaveLength(1);
    expect(entry?.data[0].workflowId).toBe(100);
  });

  it("uses cached workflow IDs to filter out deleted workflows", async () => {
    const state = makeState();
    // workflow 100 is active, 999 is "deleted" (not in the set)
    state.workflowIds.set("owner/repo", new Set([100]));
    __setStateForTests(state);

    server.use(
      http.get(
        "https://api.github.com/repos/owner/repo/actions/runs",
        () =>
          HttpResponse.json({
            total_count: 2,
            workflow_runs: [makeApiRun(1, 100), makeApiRun(2, 999)],
          }),
      ),
    );

    await refreshRepoActive("owner/repo");

    const entry = state.cache.get("owner/repo");
    expect(entry?.data).toHaveLength(1);
    expect(entry?.data[0].workflowId).toBe(100);
  });

  it("works without cached workflow IDs (no filter applied)", async () => {
    const state = makeState();
    // workflowIds map is empty for this repo
    __setStateForTests(state);

    server.use(
      http.get(
        "https://api.github.com/repos/owner/repo/actions/runs",
        () =>
          HttpResponse.json({
            total_count: 2,
            workflow_runs: [makeApiRun(1, 100), makeApiRun(2, 200)],
          }),
      ),
    );

    await refreshRepoActive("owner/repo");

    const entry = state.cache.get("owner/repo");
    // No filter — both runs kept
    expect(entry?.data).toHaveLength(2);
  });

  it("preserves existing cache when fetch returns empty", async () => {
    const state = makeState();
    const existing: WorkflowRun[] = [
      {
        workflowId: 100,
        workflowName: "wf-100",
        repo: "owner/repo",
        status: "completed",
        conclusion: "success",
        branch: "main",
        commitSha: "abc1234",
        commitMessage: "old",
        duration: 60_000,
        createdAt: now.toISOString(),
        htmlUrl: "https://github.com/owner/repo/actions/runs/1",
        workflowPath: ".github/workflows/wf-100.yml",
        startedAt: now.toISOString(),
      },
    ];
    state.cache.set("owner/repo", existing);
    state.workflowIds.set("owner/repo", new Set([100]));
    __setStateForTests(state);

    server.use(
      http.get(
        "https://api.github.com/repos/owner/repo/actions/runs",
        () =>
          HttpResponse.json({
            total_count: 0,
            workflow_runs: [],
          }),
      ),
    );

    await refreshRepoActive("owner/repo");

    // Existing data preserved (refreshRepoActive only updates on non-empty)
    const entry = state.cache.get("owner/repo");
    expect(entry?.data).toEqual(existing);
  });

  it("records error on fetch failure but keeps existing cache", async () => {
    const state = makeState();
    const existing: WorkflowRun[] = [
      {
        workflowId: 100,
        workflowName: "wf-100",
        repo: "owner/repo",
        status: "completed",
        conclusion: "success",
        branch: "main",
        commitSha: "abc1234",
        commitMessage: "old",
        duration: 60_000,
        createdAt: now.toISOString(),
        htmlUrl: "https://github.com/owner/repo/actions/runs/1",
        workflowPath: ".github/workflows/wf-100.yml",
        startedAt: now.toISOString(),
      },
    ];
    state.cache.set("owner/repo", existing);
    __setStateForTests(state);

    server.use(
      http.get(
        "https://api.github.com/repos/owner/repo/actions/runs",
        () =>
          HttpResponse.json(
            { message: "API rate limit exceeded" },
            { status: 403 },
          ),
      ),
    );

    await refreshRepoActive("owner/repo");

    const entry = state.cache.get("owner/repo");
    expect(entry?.data).toEqual(existing); // stale data preserved
    expect(entry?.error).toContain("rate limit"); // error noted
  });

  it("is a no-op when state is null", async () => {
    __setStateForTests(null);
    // Should not throw, even with no handlers registered
    await expect(refreshRepoActive("owner/repo")).resolves.toBeUndefined();
  });
});
