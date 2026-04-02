# Architecture Reference

Shared context for all gha-dash TPPs. This is a reference doc, not a TPP.

## System Overview

```
┌──────────────────────────────────────────┐
│  Browser (HTMX + custom CSS)             │
│  - Auto-polls for status updates         │
│  - Forms for workflow dispatch            │
│  - Org/repo selector for configuration   │
└──────────────┬───────────────────────────┘
               │ HTTP (HTMX partials)
┌──────────────▼───────────────────────────┐
│  Express Server (TypeScript, ESM)        │
│  - EJS templates for HTML + partials     │
│  - In-memory cache (stale-while-revalidate)
│  - Background polling for fresh data     │
└──────────────┬───────────────────────────┘
               │ REST API (via Octokit)
┌──────────────▼───────────────────────────┐
│  GitHub API                              │
│  - Auth via `gh auth token`              │
│  - Workflows, runs, dispatch             │
└──────────────────────────────────────────┘
```

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Runtime | Node.js 24+ | Current LTS, full ESM support |
| Language | TypeScript (strict, ESM) | `"type": "module"` in package.json |
| Server | Express 4 | Mature, well-known |
| Templates | EJS | Simple, JS-native, good for partials |
| Interactivity | HTMX 2.x | Polling, partials, forms — no build step |
| Styling | Custom CSS | Hand-written, no framework |
| GitHub API | @octokit/rest | Official SDK, pagination, rate limits |
| Concurrency | p-limit | Cap parallel API calls (~10) when fetching many repos |
| YAML parsing | yaml | For workflow_dispatch inputs (Phase 2) |
| Config | XDG/APPDATA + fs | No dependency — see Config section |
| Test runner | vitest | Native ESM, fast, TS out of the box |
| API mocking | msw 2.x | Network-level interception, works with Octokit |
| Dev | tsx | Fast TS execution, watch mode |
| Build | tsup | Simple bundling for npm publish |

## Core Types

```typescript
// src/types.ts

export interface AppConfig {
  repos: string[];          // "owner/repo" format; empty = show all
  refreshInterval: number;  // seconds, default 60
  lookbackDays: number;     // skip runs older than this, default 7
  port: number;             // default 3131
}

export interface WorkflowRun {
  workflowId: number;
  workflowName: string;
  repo: string;             // "owner/repo"
  status: RunStatus;
  conclusion: RunConclusion | null;
  branch: string;
  commitSha: string;
  duration: number;         // seconds
  createdAt: string;        // ISO 8601
  htmlUrl: string;
}

export type RunStatus = "completed" | "in_progress" | "queued" | "waiting";
export type RunConclusion =
  | "success"
  | "failure"
  | "cancelled"
  | "skipped"
  | "timed_out";

export interface CacheEntry<T> {
  data: T;
  fetchedAt: number;        // Date.now()
  error: string | null;     // last refresh error, if any
}
```

## Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/` | GET | Dashboard (full page) |
| `/partials/workflows` | GET | HTMX partial: all workflow cards |
| `/settings` | GET | Repo/org selector page |
| `/partials/orgs` | GET | HTMX partial: available orgs |
| `/partials/repos/:owner` | GET | HTMX partial: repos for an owner |
| `/settings/repos` | POST | Save selected repos |
| `/dispatch/:owner/:repo/:id` | GET | Dispatch form partial |
| `/dispatch/:owner/:repo/:id` | POST | Trigger workflow dispatch |

## Config: No `env-paths` Dependency

```typescript
import { homedir } from "node:os";
import { join } from "node:path";

function getConfigDir(): string {
  if (process.platform === "win32") {
    return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "gha-dash");
  }
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "gha-dash");
}
```

Config file: `{configDir}/config.json`. Create directory on first write.

## Security Constraints

- **Localhost only**: Bind Express to `127.0.0.1`, never `0.0.0.0`
- **Token never exposed**: All GitHub API calls are server-side. Token never
  appears in HTML, logs, or error messages sent to the browser.
- **Security headers**: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`

## Accessibility

- Semantic `<table>` with `<th scope="col">` headers for screen readers
- Status badges use **color + icon/text** (not color alone)
- `aria-label` on status badges: e.g. "Workflow CI: success"
- Repo group headers use `aria-expanded` to indicate collapse state
- `aria-live="polite"` on the `<tbody>` for HTMX row updates
- All forms use standard HTML elements (keyboard-navigable by default)

## Lore

Consolidated from all planning sessions. Non-obvious details and gotchas:

- `gh auth token` prints token to stdout with a trailing newline — use
  `execSync("gh auth token", { encoding: "utf-8" }).trim()`
- `GET /repos/{owner}/{repo}/actions/runs` returns runs for ALL workflows in
  one call — deduplicate by taking the first (most recent) run per `workflow_id`
- `branch` filter on the runs endpoint uses the default branch name, which
  varies (main, master, develop) — fetch repo metadata to get `default_branch`
- `GET /user/orgs` returns orgs but NOT the user's personal account — also
  fetch `/user` to get the username for personal repos
- Octokit handles 429 rate-limit retries automatically
- One `runs` call per repo per refresh — with 50 repos at 60s: ~50 calls/min,
  well within 5000/hr limit
- HTMX can be vendored as a single .js file (~14KB gzipped) — no CDN needed
- EJS partials: `<%- include('partials/card', { data }) %>`
- `tsx` supports `--watch` for auto-restart during development
- Contents API returns base64 `content` — decode with
  `Buffer.from(content, "base64").toString()`
- Workflow YAML `on` key can be a string, array, or object — handle all forms
- Dispatch API (`POST .../dispatches`) returns 204 No Content — no run ID.
  Link to the workflow's runs page on GitHub instead.
- Input values in dispatch are always strings, even for booleans (`"true"/"false"`)
- Deduplicate runs by `(workflow_id, branch)` not just `workflow_id` — this shows
  the latest run per branch per workflow, which is more useful for branch-based CI
- Use `p-limit` (tiny dependency) to cap concurrent API calls at ~10 when fetching
  runs for many repos in parallel — prevents hammering the API
- Format durations with smart unit selection: show `"2m 30s"` not `"0h 2m 30s"`.
  Pick format based on magnitude (>1h → `Hh Mm Ss`, >1m → `Mm Ss`, else → `Ss`)
- Guard background refresh with a `_refreshing` flag to prevent overlapping poll
  cycles — the fetch can take longer than the poll interval with many repos
- `lookbackDays` config (default 7) filters out old runs, keeping the table focused
