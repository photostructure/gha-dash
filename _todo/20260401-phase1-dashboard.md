# TPP: Phase 1 — Complete Dashboard

## Summary

Build a fully usable GitHub Actions dashboard. By the end of this phase:
`npx gha-dash` starts a server, discovers the user's repos, shows live
workflow status cards, and lets the user filter repos via a settings page.
No hardcoded repo lists — it works immediately out of the box.

## Current Phase

- [x] Research
- [x] Design
- [ ] Implement
- [ ] Test
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
column (↻ dispatch button in Phase 2). A search box above the table filters
rows client-side. This is denser and more scannable than cards, and uses
semantic `<table>` HTML for accessibility.

Repo header rows are clickable to collapse/expand that repo's workflows.
All repos start expanded. Collapse state is persisted in `localStorage`.

**First-run behavior**: No config file yet? Fetch the user's repos via API and
show all of them. The settings page exists for *filtering down*, not as a gate.
This means the dashboard is immediately useful without any configuration.

**Data flow**: Background poll fetches workflow runs for all repos every 60s.
HTMX polls `/partials/workflows` every 30s for fresh HTML. Cache uses
stale-while-revalidate — always serve cached data, refresh in background.

## Key Decisions

### ESM
- `"type": "module"` in package.json
- tsconfig: `"module": "ESNext"`, `"moduleResolution": "bundler"`
- tsup generates CJS output for npm compatibility if needed

### First-Run: Show All Repos
- No repos in config → call `GET /user/repos` (paginated) to discover repos
- Show all repos with workflow runs on the dashboard
- Settings page lets user filter to a subset and save
- Saved config persists the filtered list for future startups

### bin Entry for npx
- `"bin": { "gha-dash": "./dist/cli.js" }` in package.json
- `src/cli.ts` has `#!/usr/bin/env node` shebang
- CLI checks for `gh`, extracts token, starts server, opens browser

### Cache: Stale-While-Revalidate
- `Map<string, CacheEntry<T>>` — see types in `docs/ARCHITECTURE.md`
- Cold cache: dashboard renders "Loading..." state; first HTMX poll picks up data
- Refresh failure: keep stale data, record error for UI banner
- Re-entrancy guard: skip refresh if one is already in flight (flag-based)
- No persistence — in-memory is fine for a local tool

### Error Handling
- **Startup** (gh missing, not authed): fail fast, exit 1, clear stderr message
- **API errors**: keep stale data, show banner "Last updated X ago. Error: [reason]"
- **Per-repo errors** (404, deleted): error card replaces that repo's workflows
- **Token expiry**: re-extract on any 401, banner if re-extraction also fails

## Testing Strategy

**Runner**: vitest (native ESM, TypeScript, fast)
**API mocking**: msw 2.x (network-level interception — Octokit works unmodified)
**HTTP testing**: supertest (Express route testing)

What to test:
- `gh auth token` extraction: mock `execSync` for success, gh-not-found,
  not-authenticated paths
- API response parsing: msw fixtures for runs, repos, orgs. Test deduplication
  by `(workflow_id, branch)`. Test pagination. Test error responses (401, 403, 404, 500).
  Test `lookbackDays` filtering.
- Cache: TTL expiry, stale-while-revalidate, cold cache, refresh failure
- Config: write/read round-trip, corrupt JSON, missing directory creation
- Routes: supertest against Express app. `/` renders dashboard table. HTMX
  partial returns workflow table rows. `/settings` shows org/repo picker.
  `POST /settings/repos` saves config and redirects.

What NOT to test (fewest elements):
- Browser-level HTMX behavior (no Playwright — too heavy for this project)
- CSS rendering
- Express middleware wiring (covered implicitly by route tests)

Test convention: `src/services/__tests__/github.test.ts` (colocated `__tests__/`)

## Tasks

Ordered as testable increments. Each group produces something verifiable.

### 1. Scaffolding
- [ ] `package.json` with name, version, `"type": "module"`, bin field, scripts
      (`dev`, `build`, `test`, `lint`)
- [ ] `tsconfig.json` — strict, ESM, paths for src/
- [ ] eslint config (flat config format)
- [ ] vitest config
- [ ] Directory structure: `src/{routes,services,views,public}/`
- [ ] Vendor HTMX 2.x into `src/public/htmx.min.js`
- [ ] `npm run dev` works (tsx --watch src/cli.ts)

### 2. Core Types + Config
- [ ] `src/types.ts` — types from `docs/ARCHITECTURE.md`
- [ ] `src/services/config.ts` — XDG/APPDATA config dir, read/write JSON,
      create dir on first write
- [ ] Tests: config round-trip, corrupt JSON handling, missing dir creation

### 3. GitHub API Client
- [ ] `src/services/github.ts` — `gh auth token` extraction with error handling
- [ ] Octokit initialization with extracted token
- [ ] `fetchWorkflowRuns(owner, repo, branch)` — fetch runs, deduplicate by
      `(workflow_id, branch)` composite key (keep most recent per branch)
- [ ] Use `p-limit` to cap concurrent API calls at 10 when fetching many repos
- [ ] `fetchRepoMetadata(owner, repo)` — get `default_branch`
- [ ] `fetchUserRepos()` — paginated, for first-run discovery
- [ ] `fetchUserOrgs()` — paginated, for settings page
- [ ] `fetchOrgRepos(org)` — paginated, for settings page
- [ ] Token re-extraction on 401 response
- [ ] Tests: msw fixtures for all endpoints, error cases, pagination

### 4. Cache Layer
- [ ] `src/services/cache.ts` — generic `Map<string, CacheEntry<T>>`
- [ ] TTL-based expiry check
- [ ] Background refresh via `setInterval` for all repos
- [ ] Stale-while-revalidate: serve stale on refresh failure, record error
- [ ] Re-entrancy guard: `_refreshing` flag, skip if already in flight
- [ ] Tests: TTL, stale data retention, refresh failure, re-entrancy guard

### 5. Express Server + Dashboard
- [ ] `src/server.ts` — Express app, middleware (security headers), static files
- [ ] `src/routes/dashboard.ts` — `GET /` and `GET /partials/workflows`
- [ ] `src/views/layout.ejs` — HTML shell (viewport, CSS, HTMX script)
- [ ] `src/views/dashboard.ejs` — header, search box, workflow table, rate limit footer
- [ ] `src/views/partials/workflow-table.ejs` — `<tbody>` with repo group headers
      and workflow rows, for HTMX swap
- [ ] Repo group headers: `<tr>` spanning all columns with `owner/repo`, clickable
      to collapse/expand that repo's workflow rows
- [ ] Table columns: Workflow, Branch, Status, Commit, Message, Started, Duration,
      Actions (empty in Phase 1, dispatch button added in Phase 2)
- [ ] Search box above table — filters rows client-side (plain JS, no library)
- [ ] Collapse state persisted in `localStorage`
- [ ] `src/public/style.css` — clean minimal CSS, dark mode, responsive table
- [ ] HTMX: `hx-get="/partials/workflows"` `hx-trigger="every 30s"`
      targeting the `<tbody>` for seamless row replacement. Preserve collapse
      state across HTMX swaps (read `localStorage` after swap via `htmx:afterSwap`)
- [ ] Loading state for cold cache (placeholder rows or spinner)
- [ ] Route tests with supertest

### 6. Settings Routes
- [ ] `src/routes/settings.ts` — `GET /settings`, `POST /settings/repos`
- [ ] `GET /partials/orgs` — list user + orgs
- [ ] `GET /partials/repos/:owner` — repos for an owner with checkboxes
- [ ] `src/views/settings.ejs` — org list, repo picker, save button
- [ ] Pre-check currently selected repos; check all if no config
- [ ] After save: redirect to `/` 
- [ ] Settings gear link in dashboard header
- [ ] Route tests with supertest

### 7. CLI Entry Point
- [ ] `src/cli.ts` — shebang, check for `gh`, extract token, start server,
      print banner ("Dashboard: http://localhost:3131"), open browser
- [ ] Graceful shutdown (close server, clear intervals) on SIGINT/SIGTERM
- [ ] `tsup.config.ts` — bundle for npm, preserve shebang
- [ ] Verify `npm run build && node dist/cli.js` works

### 8. Error UI
- [ ] `src/views/partials/error-banner.ejs` — stale data warning with timestamp
- [ ] Per-repo error card in workflows partial
- [ ] Rate limit display in footer
- [ ] Token re-extraction integration (re-extract on 401, show banner on failure)

## Session Log

- **2026-04-01**: Initial planning session by intern. Created 4 TPPs (master +
  3 phases). Researched gh CLI, GitHub API, reference projects.
- **2026-04-01**: Reworked TPPs. Merged phases 1+2. Added testing strategy,
  error handling, security, accessibility. Changed first-run to show all repos
  by default. Dropped env-paths. Decided ESM. Extracted shared content to
  `docs/ARCHITECTURE.md`.
