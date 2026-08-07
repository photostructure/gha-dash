import { Octokit } from "@octokit/rest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { EtagCache, installEtagHook } from "../etagCache.js";
import {
  createRunsOctokit,
  fetchActiveWorkflowIds,
  fetchRepoMeta,
  fetchUserRepos,
  fetchWorkflowRuns,
} from "../github.js";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function makeOctokit(): Octokit {
  return new Octokit({
    auth: "test-token",
    baseUrl: "https://api.github.com",
  });
}

describe("createRunsOctokit", () => {
  it("strips caller-supplied conditional validators", async () => {
    const seenHeaders: Array<{
      ifNoneMatch: string | null;
      ifModifiedSince: string | null;
      cacheControl: string | null;
    }> = [];
    server.use(
      http.get(
        "https://api.github.com/repos/owner/repo/actions/runs",
        ({ request }) => {
          seenHeaders.push({
            ifNoneMatch: request.headers.get("if-none-match"),
            ifModifiedSince: request.headers.get("if-modified-since"),
            cacheControl: request.headers.get("cache-control"),
          });
          return HttpResponse.json({ total_count: 0, workflow_runs: [] });
        },
      ),
    );

    await createRunsOctokit("test-token").actions.listWorkflowRunsForRepo({
      owner: "owner",
      repo: "repo",
      headers: {
        "if-none-match": '"stale-runs"',
        "if-modified-since": "Wed, 21 Oct 2015 07:28:00 GMT",
      },
    });

    expect(seenHeaders).toEqual([
      {
        ifNoneMatch: null,
        ifModifiedSince: null,
        cacheControl: "no-cache",
      },
    ]);
  });
});

describe("fetchRepoMeta", () => {
  it("returns default branch and open issues count", async () => {
    server.use(
      http.get("https://api.github.com/repos/owner/repo", () => {
        return HttpResponse.json({
          default_branch: "develop",
          open_issues_count: 7,
          id: 1,
          name: "repo",
          full_name: "owner/repo",
          owner: { login: "owner" },
        });
      }),
    );

    const meta = await fetchRepoMeta(makeOctokit(), "owner", "repo");
    expect(meta.defaultBranch).toBe("develop");
    expect(meta.openIssuesAndPrs).toBe(7);
  });
});

describe("fetchUserRepos", () => {
  it("bypasses cached metadata during an explicit repo-list refresh", async () => {
    const seenIfNoneMatch: (string | null)[] = [];
    server.use(
      http.get("https://api.github.com/user/repos", ({ request }) => {
        seenIfNoneMatch.push(request.headers.get("if-none-match"));
        return HttpResponse.json([{ id: 1, full_name: "owner/repo" }], {
          headers: { etag: '"repos-v1"' },
        });
      }),
    );

    const octokit = makeOctokit();
    installEtagHook(octokit, new EtagCache());

    expect(await fetchUserRepos(octokit, true)).toEqual(["owner/repo"]);
    expect(await fetchUserRepos(octokit, true)).toEqual(["owner/repo"]);
    expect(seenIfNoneMatch).toEqual([null, null]);
  });
});

describe("fetchWorkflowRuns", () => {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 3_600_000);
  const twoDaysAgo = new Date(now.getTime() - 2 * 86_400_000);
  const tenDaysAgo = new Date(now.getTime() - 10 * 86_400_000);

  function makeRun(
    id: number,
    workflowId: number,
    branch: string,
    createdAt: Date,
    overrides: Record<string, unknown> = {},
  ) {
    return {
      id,
      workflow_id: workflowId,
      name: `Workflow ${workflowId}`,
      head_branch: branch,
      head_sha: "abc1234567890",
      status: "completed",
      conclusion: "success",
      created_at: createdAt.toISOString(),
      updated_at: new Date(createdAt.getTime() + 300_000).toISOString(),
      run_started_at: createdAt.toISOString(),
      html_url: `https://github.com/owner/repo/actions/runs/${id}`,
      display_title: `Run #${id}`,
      path: `.github/workflows/workflow-${workflowId}.yml`,
      ...overrides,
    };
  }

  it("deduplicates completed runs by workflow_id (keeps latest per workflow)", async () => {
    server.use(
      http.get("https://api.github.com/repos/owner/repo/actions/runs", () => {
        return HttpResponse.json({
          total_count: 3,
          workflow_runs: [
            // Two runs for same workflow — only newest should be kept
            makeRun(3, 100, "main", now),
            makeRun(2, 100, "feature", oneHourAgo),
            // Different workflow — should be kept
            makeRun(1, 200, "main", oneHourAgo),
          ],
        });
      }),
    );

    const runs = await fetchWorkflowRuns(makeOctokit(), "owner", "repo");

    expect(runs).toHaveLength(2);
    expect(runs.map((r) => r.workflowId).sort()).toEqual([100, 200]);
    // Workflow 100: latest run is on main (run 3)
    expect(runs.find((r) => r.workflowId === 100)?.branch).toBe("main");
  });

  it("filters out deleted workflows when activeWorkflowIds provided", async () => {
    server.use(
      http.get("https://api.github.com/repos/owner/repo/actions/runs", () => {
        return HttpResponse.json({
          total_count: 2,
          workflow_runs: [
            makeRun(2, 100, "main", now),
            makeRun(1, 999, "main", oneHourAgo), // deleted workflow
          ],
        });
      }),
    );

    const activeIds = new Set([100]); // 999 is deleted
    const runs = await fetchWorkflowRuns(
      makeOctokit(),
      "owner",
      "repo",
      activeIds,
    );

    expect(runs).toHaveLength(1);
    expect(runs[0].workflowId).toBe(100);
  });

  it("keeps old runs (no lookback filter — latest per workflow)", async () => {
    server.use(
      http.get("https://api.github.com/repos/owner/repo/actions/runs", () => {
        return HttpResponse.json({
          total_count: 2,
          workflow_runs: [
            makeRun(2, 100, "main", twoDaysAgo),
            makeRun(1, 200, "main", tenDaysAgo),
          ],
        });
      }),
    );

    const runs = await fetchWorkflowRuns(makeOctokit(), "owner", "repo");

    // Both kept — different workflow_ids, each is the latest for its workflow
    expect(runs).toHaveLength(2);
  });

  it("keeps all active runs even for the same workflow", async () => {
    server.use(
      http.get("https://api.github.com/repos/owner/repo/actions/runs", () => {
        return HttpResponse.json({
          total_count: 4,
          workflow_runs: [
            makeRun(4, 100, "feature-b", now, {
              status: "in_progress",
              conclusion: null,
            }),
            makeRun(3, 100, "feature-a", oneHourAgo, {
              status: "queued",
              conclusion: null,
            }),
            makeRun(2, 100, "main", twoDaysAgo), // completed — kept (latest)
            makeRun(1, 100, "main", tenDaysAgo), // completed — dropped (already have one)
          ],
        });
      }),
    );

    const runs = await fetchWorkflowRuns(makeOctokit(), "owner", "repo");

    expect(runs).toHaveLength(3);
    expect(runs.map((r) => r.branch).sort()).toEqual([
      "feature-a",
      "feature-b",
      "main",
    ]);
  });

  it("keeps runs with pending status", async () => {
    server.use(
      http.get("https://api.github.com/repos/owner/repo/actions/runs", () => {
        return HttpResponse.json({
          total_count: 2,
          workflow_runs: [
            makeRun(2, 100, "main", now, {
              status: "pending",
              conclusion: null,
            }),
            makeRun(1, 100, "main", oneHourAgo), // completed
          ],
        });
      }),
    );

    const runs = await fetchWorkflowRuns(makeOctokit(), "owner", "repo");

    expect(runs).toHaveLength(2);
    expect(runs[0].status).toBe("pending");
    expect(runs[1].status).toBe("completed");
  });

  it("keeps requested runs active alongside the latest completed run", async () => {
    server.use(
      http.get("https://api.github.com/repos/owner/repo/actions/runs", () => {
        return HttpResponse.json({
          total_count: 2,
          workflow_runs: [
            makeRun(2, 100, "main", now, {
              status: "requested",
              conclusion: null,
            }),
            makeRun(1, 100, "main", oneHourAgo),
          ],
        });
      }),
    );

    const runs = await fetchWorkflowRuns(makeOctokit(), "owner", "repo");

    expect(runs).toHaveLength(2);
    expect(runs[0].status).toBe("requested");
    expect(runs[1].status).toBe("completed");
  });

  it("uses check-suite state when the workflow run is still queued", async () => {
    const seenCacheControl: (string | null)[] = [];
    server.use(
      http.get("https://api.github.com/repos/owner/repo/actions/runs", () =>
        HttpResponse.json({
          total_count: 1,
          workflow_runs: [
            makeRun(2, 100, "main", now, {
              status: "queued",
              conclusion: null,
              check_suite_id: 42,
            }),
          ],
        }),
      ),
      http.get(
        "https://api.github.com/repos/owner/repo/check-suites/42",
        ({ request }) => {
          seenCacheControl.push(request.headers.get("cache-control"));
          return HttpResponse.json({
            id: 42,
            status: "in_progress",
            conclusion: null,
            updated_at: now.toISOString(),
          });
        },
      ),
    );

    const runs = await fetchWorkflowRuns(
      createRunsOctokit("test-token"),
      "owner",
      "repo",
    );

    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe("in_progress");
    expect(seenCacheControl).toEqual(["no-cache"]);
  });

  it("uses a completed check suite before deduplicating workflow runs", async () => {
    server.use(
      http.get("https://api.github.com/repos/owner/repo/actions/runs", () =>
        HttpResponse.json({
          total_count: 2,
          workflow_runs: [
            makeRun(2, 100, "main", now, {
              status: "in_progress",
              conclusion: null,
              check_suite_id: 43,
            }),
            makeRun(1, 100, "main", oneHourAgo),
          ],
        }),
      ),
      http.get("https://api.github.com/repos/owner/repo/check-suites/43", () =>
        HttpResponse.json({
          id: 43,
          status: "completed",
          conclusion: "failure",
          updated_at: new Date(now.getTime() + 60_000).toISOString(),
        }),
      ),
    );

    const runs = await fetchWorkflowRuns(
      createRunsOctokit("test-token"),
      "owner",
      "repo",
    );

    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe("completed");
    expect(runs[0].conclusion).toBe("failure");
  });

  it("keeps all active runs across multiple workflows plus latest completed", async () => {
    server.use(
      http.get("https://api.github.com/repos/owner/repo/actions/runs", () => {
        return HttpResponse.json({
          total_count: 5,
          workflow_runs: [
            makeRun(5, 100, "main", now, {
              status: "in_progress",
              conclusion: null,
            }),
            makeRun(4, 200, "main", now, {
              status: "waiting",
              conclusion: null,
            }),
            makeRun(3, 100, "main", oneHourAgo), // completed — kept (latest for wf 100)
            makeRun(2, 200, "main", oneHourAgo), // completed — kept (latest for wf 200)
            makeRun(1, 100, "develop", twoDaysAgo), // completed — dropped (wf 100 already has one)
          ],
        });
      }),
    );

    const runs = await fetchWorkflowRuns(makeOctokit(), "owner", "repo");

    expect(runs).toHaveLength(4);
  });

  it("does not send conditional headers from the uncached runs client", async () => {
    const seenIfNoneMatch: (string | null)[] = [];
    const seenIfModifiedSince: (string | null)[] = [];
    const seenCacheControl: (string | null)[] = [];
    server.use(
      http.get(
        "https://api.github.com/repos/owner/repo/actions/runs",
        ({ request }) => {
          seenIfNoneMatch.push(request.headers.get("if-none-match"));
          seenIfModifiedSince.push(request.headers.get("if-modified-since"));
          seenCacheControl.push(request.headers.get("cache-control"));
          return HttpResponse.json(
            {
              total_count: 1,
              workflow_runs: [
                makeRun(1, 100, "main", now, {
                  status: "in_progress",
                  conclusion: null,
                }),
              ],
            },
            { headers: { etag: '"runs-v2"' } },
          );
        },
      ),
    );

    const runs = await fetchWorkflowRuns(
      createRunsOctokit("test-token"),
      "owner",
      "repo",
    );

    expect(seenIfNoneMatch).toEqual([null]);
    expect(seenIfModifiedSince).toEqual([null]);
    expect(seenCacheControl).toEqual(["no-cache"]);
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe("in_progress");
  });

  it("computes duration for completed runs", async () => {
    const start = new Date("2026-01-01T10:00:00Z");
    const end = new Date("2026-01-01T10:05:00Z"); // 5 minutes later

    server.use(
      http.get("https://api.github.com/repos/owner/repo/actions/runs", () => {
        return HttpResponse.json({
          total_count: 1,
          workflow_runs: [
            makeRun(1, 100, "main", start, {
              updated_at: end.toISOString(),
              run_started_at: start.toISOString(),
            }),
          ],
        });
      }),
    );

    const runs = await fetchWorkflowRuns(makeOctokit(), "owner", "repo");

    expect(runs[0].duration).toBe(300_000); // 5 minutes in ms
  });
});

describe("fetchActiveWorkflowIds", () => {
  it("returns only active workflow IDs", async () => {
    server.use(
      http.get(
        "https://api.github.com/repos/owner/repo/actions/workflows",
        () => {
          return HttpResponse.json({
            total_count: 3,
            workflows: [
              {
                id: 100,
                name: "CI",
                path: ".github/workflows/ci.yml",
                state: "active",
              },
              {
                id: 200,
                name: "Deploy",
                path: ".github/workflows/deploy.yml",
                state: "active",
              },
              {
                id: 300,
                name: "Old Security",
                path: ".github/workflows/security.yml",
                state: "deleted",
              },
            ],
          });
        },
      ),
    );

    const ids = await fetchActiveWorkflowIds(makeOctokit(), "owner", "repo");
    expect(ids).toEqual(new Set([100, 200]));
    expect(ids.has(300)).toBe(false);
  });

  it("collects active workflow IDs across multiple pages", async () => {
    server.use(
      http.get(
        "https://api.github.com/repos/owner/repo/actions/workflows",
        ({ request }) => {
          const page = new URL(request.url).searchParams.get("page");
          const workflows =
            page === "2"
              ? [{ id: 101, state: "active" }]
              : Array.from({ length: 100 }, (_, index) => ({
                  id: index + 1,
                  state: index === 50 ? "disabled_manually" : "active",
                }));
          return HttpResponse.json({ total_count: 101, workflows });
        },
      ),
    );

    const ids = await fetchActiveWorkflowIds(makeOctokit(), "owner", "repo");

    expect(ids).toHaveLength(100);
    expect(ids.has(51)).toBe(false);
    expect(ids.has(101)).toBe(true);
  });

  it("preserves workflow IDs across repeated ETag-backed 304 responses", async () => {
    const etag = '"workflows-v1"';
    let requests = 0;
    server.use(
      http.get(
        "https://api.github.com/repos/owner/repo/actions/workflows",
        ({ request }) => {
          requests++;
          if (request.headers.get("if-none-match") === etag) {
            return new HttpResponse(null, { status: 304 });
          }
          return HttpResponse.json(
            {
              total_count: 2,
              workflows: [
                { id: 100, state: "active" },
                { id: 200, state: "active" },
              ],
            },
            { headers: { etag } },
          );
        },
      ),
    );

    const octokit = makeOctokit();
    const cache = new EtagCache();
    installEtagHook(octokit, cache);

    for (let i = 0; i < 3; i++) {
      expect(await fetchActiveWorkflowIds(octokit, "owner", "repo")).toEqual(
        new Set([100, 200]),
      );
    }
    expect(requests).toBe(3);
    expect(cache.hits()).toBe(2);
  });
});
