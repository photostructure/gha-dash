import { Octokit } from "@octokit/rest";
import { execSync } from "node:child_process";
import pLimit from "p-limit";
import type { WorkflowRun } from "../types.js";

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
  const resp = await octokit.pulls.list({
    owner,
    repo,
    state: "open",
    per_page: 1,
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
  const workflows = await octokit.paginate(octokit.actions.listRepoWorkflows, {
    owner,
    repo,
    per_page: 100,
  });
  return new Set(
    workflows.filter((w) => w.state === "active").map((w) => w.id),
  );
}

/**
 * Fetch workflow runs for a repo. Returns all active runs (queued, in_progress,
 * waiting, pending) plus the latest completed run per workflow. If
 * activeWorkflowIds is provided, filters out runs for deleted/disabled workflows.
 */
export async function fetchWorkflowRuns(
  octokit: Octokit,
  owner: string,
  repo: string,
  activeWorkflowIds?: Set<number>,
): Promise<WorkflowRun[]> {
  const { data } = await octokit.actions.listWorkflowRunsForRepo({
    owner,
    repo,
    per_page: 100,
  });

  // Keep all active runs + latest completed run per workflow.
  // Runs are sorted newest-first by the API.
  const ACTIVE_STATUSES = new Set([
    "queued",
    "in_progress",
    "waiting",
    "pending",
  ]);
  const results: WorkflowRun[] = [];
  const seenCompleted = new Set<number>();

  for (const run of data.workflow_runs) {
    // Skip deleted/disabled workflows
    if (activeWorkflowIds && !activeWorkflowIds.has(run.workflow_id)) continue;

    const isActive = ACTIVE_STATUSES.has(run.status ?? "");

    // For completed runs, keep only the latest per workflow
    if (!isActive) {
      if (seenCompleted.has(run.workflow_id)) continue;
      seenCompleted.add(run.workflow_id);
    }

    const duration =
      run.status === "completed" && run.updated_at
        ? new Date(run.updated_at).getTime() -
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
      status: run.status as WorkflowRun["status"],
      conclusion: (run.conclusion as WorkflowRun["conclusion"]) ?? null,
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
}

/**
 * Fetch runs for repos in parallel, capped at API_CONCURRENCY.
 * Each repo costs 2 API calls: one for active workflows, one for runs.
 * Default branch is also fetched if not cached (for dispatch).
 * If maxRepos is set, only fetches that many repos (for budget throttling).
 */
export async function fetchAllRuns(
  octokit: Octokit,
  repos: string[],
  cachedBranches: Record<string, string>,
  maxRepos?: number,
): Promise<FetchResult> {
  const limit = pLimit(API_CONCURRENCY);
  const runs = new Map<string, WorkflowRun[]>();
  const stats = new Map<string, RepoStats>();
  const errors = new Map<string, string>();
  const discoveredBranches: Record<string, string> = {};

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
            octokit,
            owner,
            repo,
            activeIds,
          );
          runs.set(fullName, result);
          stats.set(fullName, repoStats);
        } catch (err) {
          errors.set(fullName, (err as Error).message);
        }
      }),
    ),
  );

  return { runs, stats, errors, discoveredBranches };
}

export async function fetchRateLimit(
  octokit: Octokit,
): Promise<{ remaining: number; limit: number }> {
  const { data } = await octokit.rateLimit.get();
  return { remaining: data.rate.remaining, limit: data.rate.limit };
}
