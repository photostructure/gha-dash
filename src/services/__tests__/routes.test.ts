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
const mockRefreshRepo = vi.fn();

// Minimal EventEmitter for SSE tests
const { EventEmitter } = await import("node:events");
const mockStateEvents = new EventEmitter();

vi.mock("../../state.js", () => ({
  getAppState: () => ({
    config: { repos: ["owner/repo"], availableRepos: ["owner/repo", "owner/other"], branches: {}, hiddenWorkflows: [], refreshInterval: 60, rateLimitFloor: 500, rateBudgetPct: 50, port: 3131 },
    octokit: {},
    username: "testuser",
    cache,
    repoStats: new Map([["owner/repo", { openPrs: 2, openIssues: 3, canPush: true }]]),
    rateLimit: { remaining: 4999, limit: 5000, checkedAt: new Date() },
  }),
  refreshing: false,
  stateEvents: mockStateEvents,
  updateConfig: (...args: unknown[]) => mockUpdateConfig(...args),
  refreshRuns: (...args: unknown[]) => mockRefreshRuns(...args),
  refreshRepo: (...args: unknown[]) => mockRefreshRepo(...args),
}));

// Must import createApp after the mock is set up
const { createApp } = await import("../../server.js");

describe("API routes", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    mockUpdateConfig.mockReset();
    mockRefreshRuns.mockReset();
    mockRefreshRepo.mockReset();
    app = createApp();
  });

  it("GET /api/workflows returns grouped runs with rate limit", async () => {
    const res = await request(app).get("/api/workflows");
    expect(res.status).toBe(200);
    expect(res.body.groups).toHaveLength(1);
    expect(res.body.groups[0].repo).toBe("owner/repo");
    expect(res.body.groups[0].runs).toHaveLength(1);
    expect(res.body.groups[0].runs[0].workflowName).toBe("CI");
    expect(res.body.rateLimit.remaining).toBe(4999);
    expect(res.body.rateLimit.limit).toBe(5000);
    expect(res.body.errors).toHaveLength(0);
  });

  it("GET /api/config returns current config", async () => {
    const res = await request(app).get("/api/config");
    expect(res.status).toBe(200);
    expect(res.body.repos).toEqual(["owner/repo"]);
    expect(res.body.availableRepos).toEqual(["owner/repo", "owner/other"]);
    expect(res.body.refreshInterval).toBe(60);
  });

  it("PUT /api/config updates config and returns it", async () => {
    const res = await request(app)
      .put("/api/config")
      .send({ repos: ["owner/repo", "owner/other"], refreshInterval: 120 });

    expect(res.status).toBe(200);
    expect(mockUpdateConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        repos: ["owner/repo", "owner/other"],
        refreshInterval: 120,
      }),
    );
    expect(mockRefreshRuns).toHaveBeenCalled();
  });

  it("POST /api/refresh triggers refresh and returns data", async () => {
    const res = await request(app).post("/api/refresh");
    expect(res.status).toBe(200);
    expect(res.body.groups).toHaveLength(1);
    expect(res.body.rateLimit).toBeDefined();
    expect(mockRefreshRuns).toHaveBeenCalled();
  });

  it("POST /api/refresh/:owner/:repo refreshes one repo", async () => {
    const res = await request(app).post("/api/refresh/owner/repo");
    expect(res.status).toBe(200);
    expect(res.body.groups).toHaveLength(1);
    expect(mockRefreshRepo).toHaveBeenCalledWith("owner/repo");
  });

  it("GET /api/events returns SSE stream with initial state", async () => {
    const { get } = await import("node:http");

    const server = app.listen(0);
    const port = (server.address() as { port: number }).port;

    const data = await new Promise<string>((resolve, reject) => {
      const req = get(`http://127.0.0.1:${port}/api/events`, (res) => {
        expect(res.headers["content-type"]).toMatch(/text\/event-stream/);
        expect(res.headers["cache-control"]).toBe("no-cache");

        let buf = "";
        res.on("data", (chunk) => {
          buf += chunk.toString();
          // Got the initial message — done
          req.destroy();
          resolve(buf);
        });
      });
      req.on("error", (err) => {
        if (err.message.includes("socket hang up")) return; // expected after destroy
        reject(err);
      });
    });

    expect(data).toContain('data: {"type":"refreshing","refreshing":false}');
    server.close();
  });

  it("includes security headers", async () => {
    const res = await request(app).get("/api/workflows");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("DENY");
  });
});
