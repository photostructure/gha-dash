export interface AppConfig {
  repos: string[]; // "owner/repo" format; empty = show all
  availableRepos: string[]; // full set discovered from GitHub
  branches: Record<string, string>; // "owner/repo" → default branch name
  hiddenWorkflows: string[]; // hide workflows whose name contains any of these (case-insensitive)
  workflowDurations: Record<string, number[]>; // workflowPath → last N completed durations (ms)
  refreshInterval: number; // seconds, default 300
  rateLimitFloor: number; // stop refreshing below this many remaining calls
  rateBudgetPct: number; // use at most this % of remaining rate limit per cycle
  port: number; // default 3131
}

export const defaultConfig: AppConfig = {
  repos: [],
  availableRepos: [],
  branches: {},
  hiddenWorkflows: ["dependabot"],
  workflowDurations: {},
  refreshInterval: 3600,
  rateLimitFloor: 500,
  rateBudgetPct: 50,
  port: 3131,
};

export interface WorkflowRun {
  workflowId: number;
  workflowName: string;
  repo: string; // "owner/repo"
  status: RunStatus;
  conclusion: RunConclusion | null;
  branch: string;
  commitSha: string;
  commitMessage: string;
  duration: number; // milliseconds
  createdAt: string; // ISO 8601
  htmlUrl: string;
  workflowPath: string; // e.g. ".github/workflows/ci.yml"
  startedAt: string; // ISO 8601 — run_started_at ?? created_at
}

export type RunStatus =
  | "completed"
  | "in_progress"
  | "queued"
  | "waiting"
  | "pending";
export type RunConclusion =
  | "success"
  | "failure"
  | "cancelled"
  | "skipped"
  | "timed_out";

export interface CacheEntry<T> {
  data: T;
  fetchedAt: number; // Date.now()
  error: string | null; // last refresh error, if any
}

export interface DispatchInput {
  name: string;
  type: "string" | "choice" | "boolean" | "environment";
  description: string;
  required: boolean;
  default: string;
  options: string[]; // for choice type
}

export interface WorkflowDispatchInfo {
  workflowId: number;
  workflowName: string;
  inputs: DispatchInput[];
}

/** Effective status for display: merges status + conclusion */
export function displayStatus(run: WorkflowRun): string {
  if (run.status === "completed" && run.conclusion) {
    return run.conclusion;
  }
  return run.status;
}

/** Format duration with smart unit selection */
export function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);

  if (h > 0) return `${h}h ${m % 60}m ${s % 60}s`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

/** Format a date as relative time ("3m ago", "2h ago", "5d ago") */
export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);

  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  if (m > 0) return `${m}m ago`;
  return `${s}s ago`;
}
