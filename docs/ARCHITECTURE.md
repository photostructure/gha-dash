# Architecture Reference

Shared context for all gha-dash TPPs. This is a reference doc, not a TPP.

## System Overview

```
┌──────────────────────────────────────────┐
│  Browser (Vue 3 SPA)                     │
│  - Reactive state (sort, filter, collapse)
│  - Auto-polls JSON API for updates       │
│  - Forms for workflow dispatch            │
│  - Settings for repo/config management   │
└──────────────┬───────────────────────────┘
               │ JSON API (/api/*)
┌──────────────▼───────────────────────────┐
│  Express Server (TypeScript, ESM)        │
│  - JSON API routes                       │
│  - In-memory cache (stale-while-revalidate)
│  - Background polling for fresh data     │
│  - Serves Vue SPA static assets          │
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
| Runtime | Node.js 20+ | ESM support |
| Language | TypeScript (strict, ESM) | `"type": "module"` in package.json |
| Server | Express 5 | Mature, well-known |
| Frontend | Vue 3 (Composition API) | Reactive UI, component model |
| Routing | vue-router | SPA navigation (dashboard, settings) |
| Build (client) | Vite | Fast dev server + production bundling |
| Styling | Custom CSS | Hand-written, CSS variables, dark mode |
| GitHub API | @octokit/rest | Official SDK, pagination, rate limits |
| Concurrency | p-limit | Cap parallel API calls (~10) |
| YAML parsing | yaml | For workflow_dispatch inputs |
| Config | XDG/APPDATA + fs | No dependency — see Config section |
| Test runner | vitest | Native ESM, fast, TS out of the box |
| API mocking | msw 2.x | Network-level interception |
| Dev | tsx | Fast TS execution, watch mode |
| Build (server) | tsup | Simple bundling for npm publish |

## Core Types

```typescript
// src/types.ts

export interface AppConfig {
  repos: string[];          // "owner/repo" format; empty = show all
  availableRepos: string[];
  branches: Record<string, string>;
  hiddenWorkflows: string[];
  refreshInterval: number;  // seconds, default 3600
  rateLimitFloor: number;
  rateBudgetPct: number;
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
  commitMessage: string;
  duration: number;         // milliseconds
  createdAt: string;        // ISO 8601
  htmlUrl: string;
  workflowPath: string;
}

export type RunStatus = "completed" | "in_progress" | "queued" | "waiting";
export type RunConclusion =
  | "success"
  | "failure"
  | "cancelled"
  | "skipped"
  | "timed_out";
```

## API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/workflows` | GET | Grouped workflow runs + errors + rate limit |
| `/api/config` | GET | Current configuration |
| `/api/config` | PUT | Update configuration, triggers refresh |
| `/api/refresh` | POST | Refresh all repos, returns updated data |
| `/api/refresh/:owner/:repo` | POST | Refresh single repo, returns updated data |
| `/api/dispatch/:owner/:repo/:id` | GET | Dispatch form metadata (inputs, default branch) |
| `/api/dispatch/:owner/:repo/:id` | POST | Trigger workflow dispatch |

## Frontend Architecture

Vue 3 SPA with Composition API (`<script setup lang="ts">`).

### Composables
- `useWorkflows` — fetch/poll groups, refresh all/single repo
- `useConfig` — fetch/save app configuration
- `useDispatch` — load dispatch info, trigger dispatch

### Components
- `AppHeader` — nav, rate limit badge, refresh button
- `DashboardView` — error banner + workflow table
- `WorkflowTable` — sort/filter as computed properties, collapse state
- `RepoGroup` — collapsible repo header + workflow rows
- `WorkflowRow` — single run + inline dispatch form
- `SettingsView` — repo selection table + general config form
- `DispatchForm` — typed inputs, submit, success/error feedback

### Client-side state (reactive, not from API)
- Collapse map — persisted to localStorage
- Sort column/direction — computed sorting within repo groups
- Search query, failures-only filter — computed filtering
- Dispatch form visibility — per-workflow-row toggle

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
- Status badges use **color + text** (not color alone)
- `aria-label` on status badges and action buttons
- Repo group headers use `aria-expanded` to indicate collapse state
- Keyboard navigable: repo headers focusable, Enter/Space to toggle
- Form labels associated with inputs, `aria-required` on required fields

## Lore

Consolidated from all planning and implementation sessions:

- `gh auth token` prints token to stdout with a trailing newline — use
  `execSync("gh auth token", { encoding: "utf-8" }).trim()`
- `GET /repos/{owner}/{repo}/actions/runs` returns runs for ALL workflows in
  one call — deduplicate by taking the first (most recent) run per `workflow_id`
- `branch` filter on the runs endpoint uses the default branch name, which
  varies (main, master, develop) — fetch repo metadata to get `default_branch`
- `GET /user/orgs` returns orgs but NOT the user's personal account — also
  fetch `/user` to get the username for personal repos
- Octokit handles 429 rate-limit retries automatically
- `run.name` is unreliable — derive workflow name from `run.path` filename
- Contents API returns base64 `content` — decode with
  `Buffer.from(content, "base64").toString()`
- Workflow YAML `on` key can be a string, array, or object — handle all forms
- Dispatch API (`POST .../dispatches`) returns 204 No Content — no run ID
- Input values in dispatch are always strings, even for booleans (`"true"/"false"`)
- Checkbox inputs absent from POST body = unchecked
- Use `p-limit` to cap concurrent API calls at ~10
- Format durations with smart unit selection: `"2m 30s"` not `"0h 2m 30s"`
- Guard background refresh with a promise to prevent overlapping poll cycles
- Express 5 uses path-to-regexp v8 — wildcard routes need `/{*path}` not `*`
- `src/types.ts` helpers (displayStatus, formatDuration, relativeTime) are pure
  functions — imported by both server and Vue client
- Vite config `root` is relative to CWD, not the config file — use `__dirname`
