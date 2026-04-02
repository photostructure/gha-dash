import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import type { WorkflowRun } from "../../types.js";
import { Cache } from "../cache.js";

const mockRun: WorkflowRun = {
  workflowId: 1,
  workflowName: "CI",
  repo: "owner/repo",
  status: "completed",
  conclusion: "success",
  branch: "main",
  commitSha: "abc1234",
  commitMessage: "Fix tests",
  duration: 120_000,
  createdAt: new Date().toISOString(),
  htmlUrl: "https://github.com/owner/repo/actions/runs/1",
  workflowPath: ".github/workflows/ci.yml",
};

const cache = new Cache<WorkflowRun[]>(60);
cache.set("owner/repo", [mockRun]);

const mockUpdateConfig = vi.fn();
const mockRefreshRuns = vi.fn();

vi.mock("../../state.js", () => ({
  getAppState: () => ({
    config: { repos: ["owner/repo"], availableRepos: ["owner/repo", "owner/other"], branches: {}, refreshInterval: 60, lookbackDays: 7, rateLimitFloor: 500, rateBudgetPct: 50, port: 3131 },
    octokit: {},
    username: "testuser",
    cache,
    rateLimit: { remaining: 4999, limit: 5000 },
  }),
  updateConfig: (...args: unknown[]) => mockUpdateConfig(...args),
  refreshRuns: (...args: unknown[]) => mockRefreshRuns(...args),
}));

// Must import createApp after the mock is set up
const { createApp } = await import("../../server.js");

describe("dashboard routes", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = createApp();
  });

  it("GET / returns HTML with the workflow table", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.text).toContain("gha-dash");
    expect(res.text).toContain("workflow-table");
    expect(res.text).toContain("owner/repo");
    expect(res.text).toContain("CI");
  });

  it("GET / includes rate limit in footer", async () => {
    const res = await request(app).get("/");
    expect(res.text).toContain("4999");
    expect(res.text).toContain("5000");
  });

  it("GET / includes security headers", async () => {
    const res = await request(app).get("/");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("DENY");
  });

  it("GET /partials/workflows returns table rows", async () => {
    const res = await request(app).get("/partials/workflows");
    expect(res.status).toBe(200);
    expect(res.text).toContain("repo-header");
    expect(res.text).toContain("owner/repo");
    expect(res.text).toContain("status-success");
    expect(res.text).toContain("abc1234");
  });

  it("GET /partials/workflows excludes repos with no runs", async () => {
    const res = await request(app).get("/partials/workflows");
    expect(res.text).not.toContain("Loading workflow data");
  });
});

describe("settings routes", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    mockUpdateConfig.mockReset();
    mockRefreshRuns.mockReset();
    app = createApp();
  });

  it("GET /settings returns the settings page", async () => {
    const res = await request(app).get("/settings");
    expect(res.status).toBe(200);
    expect(res.text).toContain("Settings");
    expect(res.text).toContain("repo-form");
  });

  it("POST /settings/repos redirects to dashboard", async () => {
    const res = await request(app)
      .post("/settings/repos")
      .type("form")
      .send("repos=owner/repo&repos=owner/repo2");

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/");
    expect(mockUpdateConfig).toHaveBeenCalledWith({
      repos: ["owner/repo", "owner/repo2"],
    });
    expect(mockRefreshRuns).toHaveBeenCalled();
  });

  it("POST /settings/repos handles single repo", async () => {
    await request(app)
      .post("/settings/repos")
      .type("form")
      .send("repos=owner/single");

    expect(mockUpdateConfig).toHaveBeenCalledWith({
      repos: ["owner/single"],
    });
  });
});
