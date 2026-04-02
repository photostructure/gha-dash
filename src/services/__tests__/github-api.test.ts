import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { Octokit } from "@octokit/rest";
import { fetchWorkflowRuns, fetchDefaultBranch } from "../github.js";

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

describe("fetchDefaultBranch", () => {
  it("returns the default branch from repo metadata", async () => {
    server.use(
      http.get("https://api.github.com/repos/owner/repo", () => {
        return HttpResponse.json({
          default_branch: "develop",
          // Octokit expects full repo shape but we only need default_branch
          id: 1,
          name: "repo",
          full_name: "owner/repo",
          owner: { login: "owner" },
        });
      }),
    );

    const branch = await fetchDefaultBranch(makeOctokit(), "owner", "repo");
    expect(branch).toBe("develop");
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

  it("deduplicates runs by (workflow_id, branch)", async () => {
    server.use(
      http.get(
        "https://api.github.com/repos/owner/repo/actions/runs",
        () => {
          return HttpResponse.json({
            total_count: 3,
            workflow_runs: [
              // Two runs for same workflow+branch — only newest should be kept
              makeRun(3, 100, "main", now),
              makeRun(2, 100, "main", oneHourAgo),
              // Different branch — should be kept
              makeRun(1, 100, "feature", oneHourAgo),
            ],
          });
        },
      ),
    );

    const runs = await fetchWorkflowRuns(
      makeOctokit(),
      "owner",
      "repo",
      "main",
      7,
    );

    expect(runs).toHaveLength(2);
    expect(runs.map((r) => r.branch).sort()).toEqual(["feature", "main"]);
  });

  it("filters out runs older than lookbackDays", async () => {
    server.use(
      http.get(
        "https://api.github.com/repos/owner/repo/actions/runs",
        () => {
          return HttpResponse.json({
            total_count: 2,
            workflow_runs: [
              makeRun(2, 100, "main", twoDaysAgo),
              makeRun(1, 200, "main", tenDaysAgo),
            ],
          });
        },
      ),
    );

    const runs = await fetchWorkflowRuns(
      makeOctokit(),
      "owner",
      "repo",
      "main",
      7,
    );

    expect(runs).toHaveLength(1);
    expect(runs[0].workflowId).toBe(100);
  });

  it("computes duration for completed runs", async () => {
    const start = new Date("2026-01-01T10:00:00Z");
    const end = new Date("2026-01-01T10:05:00Z"); // 5 minutes later

    server.use(
      http.get(
        "https://api.github.com/repos/owner/repo/actions/runs",
        () => {
          return HttpResponse.json({
            total_count: 1,
            workflow_runs: [
              makeRun(1, 100, "main", start, {
                updated_at: end.toISOString(),
                run_started_at: start.toISOString(),
              }),
            ],
          });
        },
      ),
    );

    const runs = await fetchWorkflowRuns(
      makeOctokit(),
      "owner",
      "repo",
      "main",
      365,
    );

    expect(runs[0].duration).toBe(300_000); // 5 minutes in ms
  });
});
