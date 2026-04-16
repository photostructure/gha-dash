# Changelog

## 0.8.0 (2026-04-15)

### Features

- **Live-updating duration** — the Duration column now ticks every second
  for in-progress runs, so you can see elapsed time grow without waiting
  for the next poll. Completed runs still use the stable server-computed
  value
- **Animated in-progress status** — `in_progress` runs render as a rotating
  spinner (matching GitHub's style) in both status badges and collapsed
  status dots, so activity is visible at a glance
- **Repo link pill in header** — each repo group header now shows a pill
  linking to the repo on GitHub, alongside the existing PR and issues
  pills. Renders immediately, before stats load

### Fixes

- **Stale dashboard when runs transition** — GitHub's runs endpoint was
  observed returning 304 while a run's status actually changed (e.g.
  queued → in_progress), leaving the dashboard frozen on old state.
  Full-refresh now bypasses ETag caching for repos with active runs;
  idle repos keep their 304 quota savings
- **Crash on first run before bundle extracts** — hitting the server
  while `npx gha-dash` was still extracting the Vue bundle produced an
  unhandled `NotFoundError`. Missing SPA files now return a quiet 503
  so the error is recoverable

## 0.7.0 (2026-04-12)

### Features

- **ETag conditional requests** — cache GitHub API ETags so unchanged
  responses return 304 Not Modified, which GitHub doesn't count against
  your rate limit. Steady-state full refreshes now consume near-zero
  quota (100% hit rate observed in production with 17 repos)
- **Lightweight active polling** — when workflows are in progress, the
  15-second active poll now calls only the workflow runs endpoint (1 API
  call per repo) instead of the full 4-call suite (repo metadata,
  workflow list, PR stats, and runs). Cached workflow IDs from the most
  recent full refresh are used to filter deleted workflows
- **ETag health in refresh log** — the post-refresh log line now reports
  `ETag cache: N hits / M misses (K entries)` so operators can monitor
  cache effectiveness. A `(N without etag!)` suffix appears if any
  responses arrive without ETag headers, surfacing silent degradation
  from upstream proxies

### Fixes

- **Stale PR counts from cached Link headers** — `pulls.list` ETag only
  hashes the visible response body, not the full list state, so closing
  PRs not on the first page wouldn't invalidate the cache. PR count
  requests now bypass ETag caching entirely
- **`/rate_limit` false alarm** — GitHub sends `Cache-Control: no-cache`
  and no ETag on `/rate_limit`, which inflated the "without etag" counter.
  Rate limit requests now skip the cache since the endpoint is exempt
  from quota anyway

## 0.6.0 (2026-04-07)

### Features

- **Adaptive refresh scheduling** — when workflows are actively running,
  gha-dash predicts completion times from rolling median duration history
  and refreshes only those repos at the right moment, instead of
  refreshing everything on a fixed interval
- **Server-sent events (SSE)** — the client receives real-time push
  updates via `/api/events` instead of polling, so workflow status
  changes appear immediately
- **All active runs shown** — each workflow now shows all in-progress
  runs, not just the latest one
- **Status dots always visible** — color-coded workflow status dots now
  show in repo headers whether collapsed or expanded

## 0.5.0 (2026-04-07)

### Features

- **PR and issue counts** in repo headers — linked pills show open PRs
  (fork icon) and open issues (circle icon), linking to GitHub
- **Dispatch permission gating** — clicking dispatch on a repo where
  your `gh` token lacks write access shows a clear error with
  instructions to fix (`gh auth refresh -s workflow`)
- **Repo header layout** — flex-aligned header contents for consistent
  vertical alignment

## 0.4.0 (2026-04-03)

### Features

- `--help` and `--version` CLI flags

### Fixes

- Single CSS source of truth — fixes missing footer and status dot
  styles in production builds
- Dev port documentation — README now explains the dual-port dev setup
  (Express :3131 + Vite :5173)

## 0.3.0 (2026-04-03)

### Fixes

- Add `repository` field to package.json for npm OIDC provenance

## 0.2.0 (2026-04-03)

### Features

- **Collapsed status dots** — color-coded dots per workflow when a repo
  group is collapsed, with tooltip showing workflow name and status
- **Footer attribution** — links to GitHub repo and PhotoStructure

### Fixes

- **Deleted workflows filtered out** — uses GitHub's workflow list API
  to exclude runs for removed workflow files
- **Missing workflows fixed** — removed branch filter that hid
  workflows only triggered by pull requests
- **Config save awaits refresh** — adding a repo in settings now shows
  its workflows immediately instead of after the next poll
- Dev startup race condition — Vue app retries API fetch if Express
  hasn't started yet

## 0.1.1 (2026-04-03)

### Features

- **Vue 3 SPA** replaces EJS + HTMX frontend — reactive state survives
  data refreshes (collapse, sort, filter state no longer destroyed)
- Sortable, searchable workflow table grouped by repo
- Collapsible repo groups with localStorage persistence
- Workflow dispatch with typed input forms
- Settings page for repo selection and rate limit tuning
- Rate limit aware: budget caps, rotation, reserve floor
- Dark mode (automatic via OS preference)
- Disk cache — restarts don't refetch
- Initial npm release — `npx gha-dash`
