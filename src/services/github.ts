import { execSync } from "node:child_process";
import { Octokit } from "@octokit/rest";
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
    throw new Error(
      "gh CLI not authenticated. Run: gh auth login",
    );
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

export async function fetchUserOrgs(
  octokit: Octokit,
): Promise<string[]> {
  const orgs = await octokit.paginate(octokit.orgs.listForAuthenticatedUser, {
    per_page: 100,
  });
  return orgs.map((o) => o.login);
}

export async function fetchUserRepos(
  octokit: Octokit,
): Promise<string[]> {
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

export async function fetchDefaultBranch(
  octokit: Octokit,
  owner: string,
  repo: string,
): Promise<string> {
  const { data } = await octokit.repos.get({ owner, repo });
  return data.default_branch;
}

export async function fetchWorkflowRuns(
  octokit: Octokit,
  owner: string,
  repo: string,
  branch: string,
): Promise<WorkflowRun[]> {
  const { data } = await octokit.actions.listWorkflowRunsForRepo({
    owner,
    repo,
    branch,
    per_page: 100,
  });

  // Deduplicate by (workflow_id, branch) — keep the most recent run
  // No lookback filter: we always show the latest run per workflow,
  // even if it's old. This prevents repos from disappearing.
  const seen = new Map<string, WorkflowRun>();

  for (const run of data.workflow_runs) {
    const key = `${run.workflow_id}:${run.head_branch}`;
    if (seen.has(key)) continue; // runs are sorted newest-first

    const duration =
      run.status === "completed" && run.updated_at
        ? new Date(run.updated_at).getTime() -
          new Date(run.run_started_at ?? run.created_at).getTime()
        : Date.now() -
          new Date(run.run_started_at ?? run.created_at).getTime();

    // Derive workflow name from path: .github/workflows/build.yml → "build"
    const path = run.path ?? "";
    const fileName = path.split("/").pop()?.replace(/\.(yml|yaml)$/, "") ?? "";
    const workflowName = fileName || (run.name ?? `Workflow ${run.workflow_id}`);

    seen.set(key, {
      workflowId: run.workflow_id,
      workflowName,
      repo: `${owner}/${repo}`,
      status: run.status as WorkflowRun["status"],
      conclusion: (run.conclusion as WorkflowRun["conclusion"]) ?? null,
      branch: run.head_branch ?? branch,
      commitSha: run.head_sha.slice(0, 7),
      commitMessage: run.display_title ?? "",
      duration,
      createdAt: run.created_at,
      htmlUrl: run.html_url,
      workflowPath: path,
    });
  }

  return [...seen.values()];
}

export interface FetchResult {
  runs: Map<string, WorkflowRun[]>;
  errors: Map<string, string>;
  /** Branches discovered during this fetch (to persist to config) */
  discoveredBranches: Record<string, string>;
}

/**
 * Fetch runs for repos in parallel, capped at API_CONCURRENCY.
 * Uses cached branches to avoid per-repo GET /repos/{o}/{r} calls.
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
          // Use cached branch if available, otherwise fetch (1 API call)
          let branch = cachedBranches[fullName];
          if (!branch) {
            branch = await fetchDefaultBranch(octokit, owner, repo);
            discoveredBranches[fullName] = branch;
          }

          const result = await fetchWorkflowRuns(
            octokit,
            owner,
            repo,
            branch,
          );
          runs.set(fullName, result);
        } catch (err) {
          errors.set(fullName, (err as Error).message);
        }
      }),
    ),
  );

  return { runs, errors, discoveredBranches };
}

export async function fetchRateLimit(
  octokit: Octokit,
): Promise<{ remaining: number; limit: number }> {
  const { data } = await octokit.rateLimit.get();
  return { remaining: data.rate.remaining, limit: data.rate.limit };
}
