# TPP: gha-dash Master Plan

## Summary

Design and build a GitHub Actions dashboard that shows workflow status across
multiple orgs/accounts with trivial onboarding. Supports viewing status for
default branches and triggering manual workflow dispatches with input forms.

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

- `docs/DESIGN-PRINCIPLES.md` — Simple Design & Tidy First
- `_todo/20260401-phase1a-scaffolding.md` — Phase 1a: project setup + API
- `_todo/20260401-phase1b-dashboard.md` — Phase 1b: dashboard rendering
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
               │ HTTP (HTML partials)
┌──────────────▼───────────────────────────┐
│  Express Server (TypeScript)             │
│  - Tagged template literals (no EJS)     │
│  - In-memory cache with TTL              │
│  - Background polling for fresh data     │
│  - Binds to 127.0.0.1 ONLY              │
└──────────────┬───────────────────────────┘
               │ REST API (via Octokit)
┌──────────────▼───────────────────────────┐
│  GitHub API                              │
│  - Auth: gh auth token OR GITHUB_TOKEN   │
│  - Workflows, runs, dispatch             │
└──────────────────────────────────────────┘
```

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Runtime | Node.js 20+ | Ubiquitous, LTS |
| Language | TypeScript (strict) | Type safety, DX |
| Server | Express 4 | Mature, well-known |
| Templates | Tagged template literals | Type-safe, zero deps, no build step |
| Interactivity | HTMX 2.x | Polling, partials, forms — no build step |
| Styling | Custom CSS | Hand-written, no framework |
| GitHub API | @octokit/rest | Official SDK, pagination, rate limits |
| YAML parsing | yaml | For workflow_dispatch inputs (Phase 3) |
| Config | XDG_CONFIG_HOME / ~/.config | Mac + Linux, no extra deps |
| Dev | tsx | Fast TS execution, no build step |
| Build | tsup | Simple bundling for npm publish |

## Key Design Decisions

### Auth: `gh auth token` with env var fallback
- Try `gh auth token` first (zero-config for gh users)
- Fall back to `GITHUB_TOKEN` env var (works in containers, CI)
- Pass token to Octokit constructor
- Re-extract periodically (token refresh)
- Fail fast with helpful error if neither source available

### Security: Local-only by default
- Express binds to `127.0.0.1`, NOT `0.0.0.0`
- The extracted token gives full API access — exposing it to the network
  would be a security hole
- README must document this clearly
- No OAuth dance needed for local use

### Multi-org support
- The token has access to all orgs the user belongs to
- Query `/user/orgs` to list available organizations
- Config stores flat list of `owner/repo` strings

### Config: `~/.config/gha-dash/config.json`
- Use `XDG_CONFIG_HOME` if set, else `~/.config` (Linux/Mac)
- Stores: selected repos, refresh interval, port
- Editable via settings UI or by hand
- If config is corrupt, fail with a clear error — don't silently fix it

### Data refresh
- Background poll every 60s (configurable) for all selected repos
- One API call per repo returns runs for all workflows — efficient
- In-memory cache, no persistence needed
- HTMX polls for fresh HTML every 30s

### Rate limiting
- Octokit handles 429 retries automatically
- One `runs` call per repo per refresh (not per workflow) — efficient
- Show remaining rate limit in UI footer
- With 50 repos at 60s refresh: ~50 calls/min, well within 5000/hr limit

## Onboarding Flow

```
$ npx gha-dash
→ Checks for gh CLI or GITHUB_TOKEN
→ Extracts token
→ Starts Express on 127.0.0.1:3131
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
| `/partials/repos/:owner` | GET | HTMX partial: repos for an owner |
| `/settings/repos` | POST | Save selected repos |
| `/dispatch/:owner/:repo/:id` | GET | Dispatch form partial (Phase 3) |
| `/dispatch/:owner/:repo/:id` | POST | Trigger workflow dispatch (Phase 3) |

## Phasing

**Phase 1a — Scaffolding & API Client**
Project setup, Express server, GitHub auth (gh + env var fallback),
Octokit wrapper, config read/write, basic route structure.

**Phase 1b — Dashboard Rendering**
Workflow status cards, HTMX polling, CSS, tagged template functions.

**Phase 2 — Settings UI**
Org/repo picker, first-run redirect, settings page.

**Phase 3 — Workflow Dispatch**
Dispatch button, lazy YAML fetch for inputs, dynamic form rendering.

## Open Tasks

- [ ] Write README with setup instructions and local-only security note

## Lore

- `gh auth token` prints token to stdout — use `execSync` with
  `encoding: 'utf-8'` and `.trim()`
- GitHub API `GET /repos/{owner}/{repo}/actions/runs` returns runs for ALL
  workflows in one call — no need to query per-workflow
- `branch` filter on runs endpoint uses the default branch name, which
  varies (main, master, develop) — fetch repo metadata to get it
- Workflow YAML `on.workflow_dispatch.inputs` supports types: string, choice,
  boolean, environment — each needs different form rendering
- HTMX `hx-trigger="every 30s"` handles polling automatically
- All user-based tokens (PAT, OAuth, gh) share the same 5,000/hr rate limit

## Session Log

- **2026-04-01**: Initial planning session. Researched gh CLI capabilities,
  GitHub Actions API endpoints, reference project (chriskinsman/github-action-dashboard).
  Settled on Express + HTMX with custom CSS.
- **2026-04-01**: Review session. Switched from EJS to tagged template
  literals. Added GITHUB_TOKEN fallback. Dropped env-paths dependency.
  Added 127.0.0.1 security requirement. Split Phase 1 into 1a/1b.
