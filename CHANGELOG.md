# Changelog

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
