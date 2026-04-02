# TPP: Phase 1 — Complete Dashboard

## Summary

Build a fully usable GitHub Actions dashboard. By the end of this phase:
`npx gha-dash` starts a server, discovers the user's repos, shows live
workflow status in a table, and lets the user filter repos via a settings page.
No hardcoded repo lists — it works immediately out of the box.

## Current Phase

- [x] Research
- [x] Design
- [x] Implement
- [ ] Test (route integration tests with supertest still TODO)
- [ ] Verify
- [ ] Document
- [ ] Review
- [ ] Complete

## Required Reading

- `docs/ARCHITECTURE.md` — tech stack, types, routes, security, lore
- `docs/DESIGN-PRINCIPLES.md` — simple design rules and tidying practices

## Description

The dashboard is a table grouped by repo. Each repo has a collapsible header
row (`owner/repo`) spanning all columns, with workflow rows nested below it.
Columns: Workflow, Branch, Status (color badge + icon), Commit (linked SHA),
Message, Started (relative time, full date on hover), Duration, and an action
column (dispatch button in Phase 2). A search box above the table filters
rows client-side.

Repo header rows are clickable to collapse/expand that repo's workflows.
All repos start expanded. Collapse state is persisted in `localStorage`.

**First-run behavior**: No config → discover repos via API, show all that have
workflows. Discovered repos saved to config so restart doesn't re-discover.
Settings page exists for *filtering down*, not as a gate.

**Data flow**: Background poll fetches workflow runs for all repos every 60s.
HTMX polls `/partials/workflows` every 30s for fresh HTML. Cache uses
stale-while-revalidate with disk persistence (restart doesn't burn API credits).

## Key Decisions

### ESM
- `"type": "module"` in package.json
- tsconfig: `"module": "ESNext"`, `"moduleResolution": "bundler"`

### Cache: Stale-While-Revalidate + Disk Persistence
- `Map<string, CacheEntry<T>>` — see types in `docs/ARCHITECTURE.md`
- Cold start: load from `~/.config/gha-dash/cache.json`, show immediately
- Refresh failure: keep stale data, record error for UI banner
- Re-entrancy guard: skip refresh if one is already in flight
- Cache saved to disk after each successful refresh
- Discovered repos persisted to config on first run

### Error Handling
- **Startup** (gh missing, not authed): fail fast, exit 1, clear stderr message
- **API errors**: keep stale data, show banner "Last updated X ago. Error: [reason]"
- **Per-repo errors** (404, deleted): error card replaces that repo's workflows
- **Token expiry**: re-extract on any 401, banner if re-extraction also fails

## Tasks

### 1. Scaffolding — DONE
- [x] `package.json` with bin field, ESM, scripts (dev, build, test, lint)
- [x] `tsconfig.json` — strict, ESM
- [x] eslint config (flat config), vitest config
- [x] Directory structure, vendor HTMX 2.x
- [x] `npm run dev` works (tsx --watch)

### 2. Core Types + Config — DONE
- [x] `src/types.ts` — AppConfig, WorkflowRun, CacheEntry, helper functions
- [x] `src/services/config.ts` — XDG/APPDATA config dir, read/write JSON,
      cache persistence (readCacheFromDisk/writeCacheToDisk)
- [x] Tests: config round-trip, corrupt JSON, missing dir creation

### 3. GitHub API Client — DONE
- [x] `src/services/github.ts` — token extraction, Octokit init
- [x] `fetchWorkflowRuns` — dedup by (workflow_id, branch), lookbackDays filter
- [x] `fetchDefaultBranch`, `fetchUserRepos`, `fetchUserOrgs`, `fetchOrgRepos`
- [x] `fetchAllRuns` — p-limit capped at 10 concurrent calls
- [x] Tests: extractToken mock (3 paths), msw API tests (dedup, lookback, duration)

### 4. Cache Layer — DONE
- [x] `src/services/cache.ts` — generic Map with TTL, stale-while-revalidate
- [x] Disk persistence (loadFromDisk/saveToDisk)
- [x] Tests: TTL, stale data, error recording, iteration, clear

### 5. Express Server + Dashboard — DONE
- [x] `src/server.ts` — Express, security headers, EJS, static files
- [x] `src/routes/dashboard.ts` — GET / and GET /partials/workflows
- [x] `src/views/dashboard.ejs` — table with HTMX polling, search, collapse
- [x] `src/views/partials/workflow-table.ejs` — repo groups + workflow rows
- [x] `src/public/style.css` — dark mode, responsive, status badges
- [x] Repos with no workflow runs are filtered out of the display
- [ ] Route tests with supertest — TODO

### 6. Settings Routes — DONE (untested)
- [x] `src/routes/settings.ts` — GET /settings, POST /settings/repos
- [x] Org/repo partials for HTMX loading
- [x] `src/views/settings.ejs`, partials/orgs.ejs, partials/repos.ejs
- [ ] Route tests with supertest — TODO

### 7. CLI Entry Point — DONE
- [x] `src/cli.ts` — shebang, startup checks, server start, banner
- [x] Graceful shutdown on SIGINT/SIGTERM
- [x] `tsup.config.ts` — builds to dist/cli.js with shebang
- [x] `npm run build` verified working

### 8. Error UI — PARTIAL
- [x] Per-repo error badge in workflow table (inline with repo header)
- [x] Rate limit display in footer
- [ ] `src/views/partials/error-banner.ejs` — stale data warning banner — TODO
- [ ] Token re-extraction on 401 — TODO

## Remaining Work

1. **Route integration tests** — supertest tests for dashboard and settings routes
2. **Error banner** — stale data warning partial
3. **Token re-extraction on 401** — currently tokens are only extracted at startup
4. **Verify settings flow end-to-end** — blocked on API rate limit reset

## Lore

- Smoke testing burned 5000 API calls discovering all user repos. Fixed by
  persisting discovered repos to config and caching run data to disk.
- EJS `include()` resolves relative to the `views` directory, not the
  current template — use `include('head')` not `include('../head')` from
  subdirectories.
- Express 5 changed `app.listen` — still works on Express 4 pattern.

## Session Log

- **2026-04-01**: Initial planning session by intern. Created 4 TPPs.
- **2026-04-01**: Reworked TPPs. Merged phases 1+2. Added testing, error
  handling, security, accessibility. Extracted shared content to ARCHITECTURE.md.
- **2026-04-02**: Implemented all 8 task groups. 31 tests passing (types, config,
  cache, token extraction, API with msw). Server starts, renders dashboard,
  HTMX polling works. Added disk persistence for cache and config after hitting
  rate limits from smoke testing. Committed as feat(phase1).
