# TPP: gha-dash Master Plan

## Summary

Design and build a GitHub Actions dashboard that shows workflow status across
multiple orgs/accounts with trivial onboarding. The only prerequisite is an
authenticated `gh` CLI. Supports viewing status for default branches and
triggering manual workflow dispatches with input forms.

## Current Phase

- [x] Research
- [x] Design
- [ ] Implement (see sub-TPPs)
- [ ] Test
- [ ] Verify
- [ ] Document
- [ ] Review
- [ ] Complete

## Required Reading

- `_todo/20260401-phase1-core-server.md` — Phase 1: server + dashboard
- `_todo/20260401-phase2-settings-ui.md` — Phase 2: org/repo picker
- `_todo/20260401-phase3-workflow-dispatch.md` — Phase 3: dispatch forms

## Architecture

```
┌──────────────────────────────────────────┐
│  Browser (HTMX + custom CSS)             │
│  - Auto-polls for status updates         │
│  - Forms for workflow dispatch            │
│  - Org/repo selector for configuration   │
└──────────────┬───────────────────────────┘
               │ HTTP (HTMX partials)
┌──────────────▼───────────────────────────┐
│  Express Server (TypeScript)             │
│  - EJS templates for HTML + partials     │
│  - In-memory cache with TTL              │
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
| Runtime | Node.js 20+ | Ubiquitous, LTS |
| Language | TypeScript (strict) | Type safety, DX |
| Server | Express 4 | Mature, well-known |
| Templates | EJS | Simple, JS-native, good for partials |
| Interactivity | HTMX 2.x | Polling, partials, forms — no build step |
| Styling | Custom CSS | Hand-written, no framework |
| GitHub API | @octokit/rest | Official SDK, pagination, rate limits |
| YAML parsing | yaml | For workflow_dispatch inputs |
| Config | env-paths + fs | Cross-platform ~/.config/gha-dash/ |
| Dev | tsx | Fast TS execution, no build step |
| Build | tsup | Simple bundling for npm publish |

## Key Design Decisions

### Auth: `gh auth token`
- Extract OAuth token at startup via `child_process.execSync`
- Pass to Octokit constructor
- Re-extract periodically (token refresh)
- Fail fast with helpful error if `gh` not found or not authenticated

### Multi-org support
- The `gh` token has access to all orgs the user belongs to
- Query `/user/orgs` to list available organizations
- Query `/users/{username}/repos` and `/orgs/{org}/repos` for repo lists
- Config stores flat list of `owner/repo` strings

### Config: `~/.config/gha-dash/config.json`
- Cross-platform via `env-paths` (handles Linux, macOS, Windows)
- Stores: selected repos, refresh interval, port
- Editable via settings UI or by hand

### Data refresh
- Background poll every 60s (configurable) for all selected repos
- For each repo: `GET /repos/{owner}/{repo}/actions/runs?branch={default}&per_page=100`
- One API call per repo returns runs for all workflows — efficient
- In-memory cache, no persistence needed
- HTMX polls `/partials/workflows` every 30s for fresh HTML

### Workflow dispatch inputs
- GitHub API doesn't expose parsed inputs — must fetch workflow YAML
- Use Contents API: `GET /repos/{owner}/{repo}/contents/{workflow_path}`
- Parse YAML, extract `on.workflow_dispatch.inputs`
- Render form with appropriate input types
- Cache parsed inputs (workflow files change rarely)

### Rate limiting
- Octokit handles 429 retries automatically
- One `runs` call per repo per refresh (not per workflow) — efficient
- Show remaining rate limit in UI footer
- With 50 repos at 60s refresh: ~50 calls/min, well within 5000/hr limit

## Onboarding Flow

```
$ npx gha-dash
→ Checks for `gh` CLI (helpful error if missing)
→ Extracts token via `gh auth token`
→ Starts Express server on port 3131
→ Opens browser to http://localhost:3131
→ No config yet? Redirects to /settings
→ User picks orgs → repos → saves
→ Dashboard renders with workflow statuses
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

## Phasing

**Phase 1 — Core Server & Dashboard (read-only)**
Project scaffolding, Express server, GitHub API integration, dashboard
rendering with workflow status cards, auto-refresh via HTMX polling.

**Phase 2 — Settings UI**
Org/repo picker, config persistence, first-run redirect, settings page.

**Phase 3 — Workflow Dispatch**
Dispatch button, YAML parsing for inputs, dynamic form rendering,
POST to GitHub API, success/error feedback.

## Lore

- `gh auth token` prints token to stdout — use `execSync` with
  `encoding: 'utf-8'` and `.trim()`
- GitHub API `GET /repos/{owner}/{repo}/actions/runs` returns runs for ALL
  workflows in one call — no need to query per-workflow
- `branch` filter on runs endpoint uses the default branch name, which
  varies (main, master, develop) — fetch repo metadata to get it
- Workflow YAML `on.workflow_dispatch.inputs` supports types: string, choice,
  boolean, environment — each needs different form rendering
- Express 5 is released but Express 4 is safer for stability
- HTMX `hx-trigger="every 30s"` handles polling automatically

## Session Log

- **2026-04-01**: Initial planning session. Researched gh CLI capabilities,
  GitHub Actions API endpoints, reference project (chriskinsman/github-action-dashboard).
  Iterated through 4 architecture options. Settled on Express + EJS + HTMX
  with custom CSS. Created master plan and 3 phase TPPs.
