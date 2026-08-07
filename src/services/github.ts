import { Octokit } from "@octokit/rest";
import { execSync } from "node:child_process";
import pLimit from "p-limit";
import type { WorkflowRun } from "../types.js";
import { SKIP_ETAG_CACHE_HEADER } from "./etagCache.js";
import { ACTIVE_STATUSES } from "./scheduler.js";

const API_CONCURRENCY = 10;

export function extractToken(): string {
  try {
    execSync("which gh", { stdio: "ignore" });
  } catch {
    throw new Error(
      "gh CLI not found. Install it from https://cli.github.com/",
    );
  }

  try {
    return execSync("gh auth token", { encoding: "utf-8" }).trim();
  } catch {
    throw new Error("gh CLI not authenticated. Run: gh auth login");
  }
}

export function createOctokit(token: string): Octokit {
  return new Octokit({ auth: token });
}

/**
 * Create the Actions-runs client. Runs are monitoring state, so every request
 * must bypass conditional and intermediary caches; see issue #4.
 */
export function createRunsOctokit(token: string): Octokit {
  const octokit = createOctokit(token);

  octokit.hook.before("request", (options) => {
    const headers = { ...options.headers } as Record<string, string>;
    for (const name of Object.keys(headers)) {
      if (/^(if-none-match|if-modified-since)$/i.test(name)) {
        delete headers[name];
      }
    }
    headers["cache-control"] = "no-cache";
    options.headers = headers as typeof options.headers;
  });

  return octokit;
}

export async function fetchAuthenticatedUser(
  octokit: Octokit,
): Promise<string> {
  const { data } = await octokit.users.getAuthenticated();
  return data.login;
}

export async function fetchUserOrgs(octokit: Octokit): Promise<string[]> {
  const orgs = await octokit.paginate(octokit.orgs.listForAuthenticatedUser, {
    per_page: 100,
  });
  return orgs.map((o) => o.login);
}

export async function fetchUserRepos(octokit: Octokit): Promise<string[]> {
  const repos = await octokit.paginate(octokit.repos.listForAuthenticatedUser, {
    per_page: 100,
    affiliation: "owner,organization_member",
    sort: "pushed",
  });
  return repos.map((r) => r.full_name);
}

export async function fetchOrgRepos(
  octokit: Octokit,
  org: string,
): Promise<Array<{ fullName: string; description: string | null }>> {
  const repos = await octokit.paginate(octokit.repos.listForOrg, {
    org,
    per_page: 100,
    sort: "pushed",
  });
  return repos.map((r) => ({
    fullName: r.full_name,
    description: r.description ?? null,
  }));
}

export interface RepoMeta {
  defaultBranch: string;
  openIssuesAndPrs: number;
  canPush: boolean;
}

export async function fetchRepoMeta(
  octokit: Octokit,
  owner: string,
  repo: string,
): Promise<RepoMeta> {
  const { data } = await octokit.repos.get({ owner, repo });
  return {
    defaultBranch: data.default_branch,
    openIssuesAndPrs: data.open_issues_count,
    canPush: data.permissions?.push ?? false,
  };
}

export interface RepoStats {
  openPrs: number;
  openIssues: number;
  canPush: boolean;
}

export async function fetchRepoStats(
  octokit: Octokit,
  owner: string,
  repo: string,
  openIssuesAndPrs: number,
  canPush: boolean,
): Promise<RepoStats> {
  // GitHub's open_issues_count includes PRs. Fetch open PR count
  // with per_page=1 and read the Link header for the real total.
  //
  // GitHub's ETag for `pulls.list` only hashes the visible body (the
  // newest PR), not the full list state. If we cached the response and
  // closed older PRs, we'd get a 304 and the cached Link header would
  // report the stale total. Skip ETag caching here to keep counts fresh.
  const resp = await octokit.pulls.list({
    owner,
    repo,
    state: "open",
    per_page: 1,
    headers: { [SKIP_ETAG_CACHE_HEADER]: "1" },
  });

  let openPrs = resp.data.length;
  if (openPrs > 0) {
    const link =
      (resp as unknown as { headers: Record<string, string> }).headers.link ??
      "";
    const lastMatch = link.match(/[&?]page=(\d+)[^>]*>;\s*rel="last"/);
    if (lastMatch) openPrs = parseInt(lastMatch[1], 10);
  }

  return {
    openPrs,
    openIssues: Math.max(0, openIssuesAndPrs - openPrs),
    canPush,
  };
}

/**
 * Fetch the set of workflow IDs that currently exist in the repo.
 * Used to filter out runs for deleted workflow files.
 */
export async function fetchActiveWorkflowIds(
  octokit: Octokit,
  owner: string,
  repo: string,
): Promise<Set<number>> {
  const ids = new Set<number>();
  let page = 1;

  // Do not use octokit.paginate here. It mutates response.data while
  // normalizing the workflows collection, which also mutates the ETag hook's
  // cached object and turns later 304 responses into an empty collection.
  while (true) {
    const { data } = await octokit.actions.listRepoWorkflows({
      owner,
      repo,
      per_page: 100,
      page,
    });

    for (const workflow of data.workflows) {
      if (workflow.state === "active") ids.add(workflow.id);
    }

    if (data.workflows.length < 100 || page * 100 >= data.total_count) break;
    page++;
  }

  return ids;
}

/**
 * Fetch workflow runs for a repo. Returns all active runs (queued, in_progress,
 * waiting, pending, requested) plus the latest completed run per workflow. If
 * activeWorkflowIds is provided, filters out runs for deleted/disabled workflows.
 */
export async function fetchWorkflowRuns(
  runsOctokit: Octokit,
  owner: string,
  repo: string,
  activeWorkflowIds?: Set<number>,
): Promise<WorkflowRun[]> {
  // This endpoint has served stale queued/in_progress bodies under conditional
  // requests. Callers pass the dedicated client that has no ETag hook.
  const { data } = await runsOctokit.actions.listWorkflowRunsForRepo({
    owner,
    repo,
    per_page: 100,
  });

  // GitHub's workflow-run aggregate can lag the check suite that drives the
  // web UI. Resolve active runs through the suite so a run whose jobs have
  // started is not left as queued, and a finished run is not left in progress.
  // Fall back to the workflow-run response if suite access fails.
  const suiteLimit = pLimit(API_CONCURRENCY);
  const resolvedRuns = await Promise.all(
    data.workflow_runs.map(async (run) => {
      let status = run.status;
      let conclusion = run.conclusion;
      let updatedAt = run.updated_at;
      const checkSuiteId = run.check_suite_id;

      if (ACTIVE_STATUSES.has(status ?? "") && checkSuiteId) {
        try {
          const { data: suite } = await suiteLimit(() =>
            runsOctokit.checks.getSuite({
              owner,
              repo,
              check_suite_id: checkSuiteId,
            }),
          );
          status = suite.status ?? status;
          conclusion = suite.conclusion ?? conclusion;
          updatedAt = suite.updated_at ?? updatedAt;
        } catch {
          // The Actions read permission may not include check-suite access.
        }
      }

      return { run, status, conclusion, updatedAt };
    }),
  );

  // Keep all active runs + latest completed run per workflow.
  // Runs are sorted newest-first by the API.
  const results: WorkflowRun[] = [];
  const seenCompleted = new Set<number>();

  for (const { run, status, conclusion, updatedAt } of resolvedRuns) {
    // Skip deleted/disabled workflows
    if (activeWorkflowIds && !activeWorkflowIds.has(run.workflow_id)) continue;

    const isActive = ACTIVE_STATUSES.has(status ?? "");

    // For completed runs, keep only the latest per workflow
    if (!isActive) {
      if (seenCompleted.has(run.workflow_id)) continue;
      seenCompleted.add(run.workflow_id);
    }

    const duration =
      status === "completed" && updatedAt
        ? new Date(updatedAt).getTime() -
          new Date(run.run_started_at ?? run.created_at).getTime()
        : Date.now() - new Date(run.run_started_at ?? run.created_at).getTime();

    // Derive workflow name from path: .github/workflows/build.yml → "build"
    const path = run.path ?? "";
    const fileName =
      path
        .split("/")
        .pop()
        ?.replace(/\.(yml|yaml)$/, "") ?? "";
    const workflowName =
      fileName || (run.name ?? `Workflow ${run.workflow_id}`);

    results.push({
      workflowId: run.workflow_id,
      workflowName,
      repo: `${owner}/${repo}`,
      status: status as WorkflowRun["status"],
      conclusion: (conclusion as WorkflowRun["conclusion"]) ?? null,
      branch: run.head_branch ?? "unknown",
      commitSha: run.head_sha.slice(0, 7),
      commitMessage: run.display_title ?? "",
      duration,
      createdAt: run.created_at,
      htmlUrl: run.html_url,
      workflowPath: path,
      startedAt: run.run_started_at ?? run.created_at,
    });
  }

  return results;
}

export interface FetchResult {
  runs: Map<string, WorkflowRun[]>;
  stats: Map<string, RepoStats>;
  errors: Map<string, string>;
  /** Branches discovered during this fetch (to persist to config) */
  discoveredBranches: Record<string, string>;
  /**
   * Active workflow IDs per repo. Captured during the full refresh so that
   * subsequent active polls (refreshRepoActive) can filter out runs for
   * deleted workflows without re-fetching the workflow list.
   */
  workflowIds: Map<string, Set<number>>;
}

/**
 * Fetch runs for repos in parallel, capped at API_CONCURRENCY.
 * In steady state, each repo costs 2 baseline counted API calls: one uncached
 * pulls.list request and one uncached actions/runs request. Each active run
 * adds one uncached check-suite request so status matches GitHub's web UI.
 * Repo metadata and active workflows use conditional requests.
 * If maxRepos is set, only fetches that many repos (for budget throttling).
 */
export async function fetchAllRuns(
  octokit: Octokit,
  runsOctokit: Octokit,
  repos: string[],
  cachedBranches: Record<string, string>,
  maxRepos?: number,
): Promise<FetchResult> {
  const limit = pLimit(API_CONCURRENCY);
  const runs = new Map<string, WorkflowRun[]>();
  const stats = new Map<string, RepoStats>();
  const errors = new Map<string, string>();
  const discoveredBranches: Record<string, string> = {};
  const workflowIds = new Map<string, Set<number>>();

  // If budget-limited, take a subset. Rotate by using a time-based offset
  // so different repos get refreshed each cycle.
  let reposToFetch = repos;
  if (maxRepos !== undefined && maxRepos < repos.length) {
    const offset = Math.floor(Date.now() / 1000) % repos.length;
    reposToFetch = [];
    for (let i = 0; i < maxRepos; i++) {
      reposToFetch.push(repos[(offset + i) % repos.length]);
    }
  }

  await Promise.all(
    reposToFetch.map((fullName) =>
      limit(async () => {
        const [owner, repo] = fullName.split("/");
        try {
          const meta = await fetchRepoMeta(octokit, owner, repo);
          if (!cachedBranches[fullName]) {
            discoveredBranches[fullName] = meta.defaultBranch;
          }

          const [activeIds, repoStats] = await Promise.all([
            fetchActiveWorkflowIds(octokit, owner, repo),
            fetchRepoStats(
              octokit,
              owner,
              repo,
              meta.openIssuesAndPrs,
              meta.canPush,
            ),
          ]);

          const result = await fetchWorkflowRuns(
            runsOctokit,
            owner,
            repo,
            activeIds,
          );
          runs.set(fullName, result);
          stats.set(fullName, repoStats);
          workflowIds.set(fullName, activeIds);
        } catch (err) {
          errors.set(fullName, (err as Error).message);
        }
      }),
    ),
  );

  return { runs, stats, errors, discoveredBranches, workflowIds };
}

export async function fetchRateLimit(
  octokit: Octokit,
): Promise<{ remaining: number; limit: number }> {
  // GitHub sends `Cache-Control: no-cache` and no ETag on /rate_limit (the
  // body is volatile by definition). Skip the ETag cache so this doesn't
  // pollute the noEtagResponses counter or attempt to cache an uncacheable
  // response. /rate_limit is also exempt from quota, so caching would be
  // pointless even if it were possible.
  const { data } = await octokit.rateLimit.get({
    headers: { [SKIP_ETAG_CACHE_HEADER]: "1" },
  });
  return { remaining: data.rate.remaining, limit: data.rate.limit };
}
