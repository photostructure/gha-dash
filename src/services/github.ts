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
  lookbackDays: number,
): Promise<WorkflowRun[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - lookbackDays);

  const { data } = await octokit.actions.listWorkflowRunsForRepo({
    owner,
    repo,
    branch,
    per_page: 100,
  });

  // Deduplicate by (workflow_id, branch) — keep the most recent run
  const seen = new Map<string, WorkflowRun>();

  for (const run of data.workflow_runs) {
    if (new Date(run.created_at) < cutoff) continue;

    const key = `${run.workflow_id}:${run.head_branch}`;
    if (seen.has(key)) continue; // runs are sorted newest-first

    const duration =
      run.status === "completed" && run.updated_at
        ? new Date(run.updated_at).getTime() -
          new Date(run.run_started_at ?? run.created_at).getTime()
        : Date.now() -
          new Date(run.run_started_at ?? run.created_at).getTime();

    seen.set(key, {
      workflowId: run.workflow_id,
      workflowName: run.name ?? `Workflow ${run.workflow_id}`,
      repo: `${owner}/${repo}`,
      status: run.status as WorkflowRun["status"],
      conclusion: (run.conclusion as WorkflowRun["conclusion"]) ?? null,
      branch: run.head_branch ?? branch,
      commitSha: run.head_sha.slice(0, 7),
      commitMessage: run.display_title ?? "",
      duration,
      createdAt: run.created_at,
      htmlUrl: run.html_url,
    });
  }

  return [...seen.values()];
}

/** Fetch runs for many repos in parallel, capped at API_CONCURRENCY */
export async function fetchAllRuns(
  octokit: Octokit,
  repos: string[],
  lookbackDays: number,
): Promise<Map<string, WorkflowRun[]>> {
  const limit = pLimit(API_CONCURRENCY);
  const results = new Map<string, WorkflowRun[]>();

  await Promise.all(
    repos.map((fullName) =>
      limit(async () => {
        const [owner, repo] = fullName.split("/");
        try {
          const branch = await fetchDefaultBranch(octokit, owner, repo);
          const runs = await fetchWorkflowRuns(
            octokit,
            owner,
            repo,
            branch,
            lookbackDays,
          );
          results.set(fullName, runs);
        } catch (err) {
          // Store error as empty runs — the cache layer records the error
          results.set(fullName, []);
          throw err;
        }
      }),
    ).map((p) => p.catch(() => {})), // Don't let one repo failure abort all
  );

  return results;
}
