# TPP: Phase 1 — Core Server & Dashboard

## Summary

Scaffold the project and build the read-only dashboard. By the end of this
phase: `npm run dev` starts a server that shows workflow status cards for a
hardcoded list of repos (config UI comes in Phase 2).

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

- `_todo/20260401-master-plan.md` — architecture and tech stack decisions

## Description

This phase establishes the foundation: project scaffolding (package.json,
tsconfig, eslint), Express server, GitHub API client (Octokit), EJS templates,
HTMX integration, custom CSS, and the main dashboard view.

The dashboard shows a card for each workflow in each selected repo. Each card
displays: repo name, workflow name, status badge (success/failure/pending/etc),
branch, commit SHA, duration, and timestamp. Cards are grouped by repo.

## Tasks

### Scaffolding
- [ ] Initialize package.json with project metadata
- [ ] Configure tsconfig.json (strict, ESM or CJS — decide)
- [ ] Add eslint + prettier config
- [ ] Set up directory structure:
  ```
  src/
    server.ts          — Express app setup
    routes/
      dashboard.ts     — GET / and partials
    services/
      github.ts        — Octokit wrapper, token extraction
      cache.ts         — In-memory cache with TTL
      config.ts        — Config file read/write
    views/
      layout.ejs       — HTML shell (head, body, scripts)
      dashboard.ejs    — Full dashboard page
      partials/
        workflows.ejs  — All workflow cards (HTMX target)
        workflow-card.ejs — Single workflow card
    public/
      style.css        — Custom styles
      htmx.min.js      — HTMX (vendored, no CDN dependency)
  ```
- [ ] Add `tsx` for dev, `tsup` for build — `npm run dev` and `npm run build`

### GitHub API Integration
- [ ] `gh auth token` extraction with error handling
  - Check `gh` exists (which gh / command -v gh)
  - Run `gh auth token`, capture stdout
  - Fail with clear message: "gh CLI not found" or "gh not authenticated"
  - Re-extract token every 30 minutes (tokens can rotate)
- [ ] Initialize `@octokit/rest` with extracted token
- [ ] Fetch workflow runs: `GET /repos/{owner}/{repo}/actions/runs`
  - Filter by `branch` (default branch)
  - `per_page=100` to get all workflows in one call
  - Deduplicate: keep only latest run per workflow_id
- [ ] Fetch repo metadata: need default branch name per repo
  - `GET /repos/{owner}/{repo}` → `default_branch` field
  - Cache this — it almost never changes
- [ ] Handle pagination if >100 workflows (unlikely but be safe)

### In-Memory Cache
- [ ] Simple Map-based cache with TTL
- [ ] Keys: `runs:{owner}/{repo}`, `repo:{owner}/{repo}`
- [ ] Background refresh: setInterval fetches fresh data for all repos
- [ ] Configurable refresh interval (default 60s)
- [ ] Expose cache stats (hit/miss) for debugging

### Dashboard Rendering
- [ ] EJS layout with HTML shell: viewport meta, CSS link, HTMX script
- [ ] Dashboard page: header, workflow cards container, footer with rate limit
- [ ] Workflow cards grouped by repo
- [ ] Each card shows:
  - Status icon/badge (color-coded: green=success, red=failure, yellow=pending)
  - Workflow name
  - Repo name (in group header)
  - Branch name
  - Commit SHA (short, linked to GitHub)
  - Run duration
  - Relative timestamp ("2 minutes ago")
  - Link to the run on GitHub
- [ ] HTMX: `hx-get="/partials/workflows"` `hx-trigger="every 30s"`
- [ ] Loading state while first fetch completes

### CSS
- [ ] Clean, minimal dashboard styling
- [ ] Status colors: green (success), red (failure), yellow (in_progress),
      grey (queued/waiting/other)
- [ ] Responsive layout (cards reflow on narrow screens)
- [ ] Dark mode support via `prefers-color-scheme`
- [ ] No CSS framework — hand-written

### Dev Experience
- [ ] `npm run dev` — starts with tsx, auto-restarts on file changes
- [ ] Helpful startup banner: "Dashboard: http://localhost:3131"
- [ ] Graceful shutdown (close server, clear intervals)

## Lore

- `GET /repos/{owner}/{repo}/actions/runs?branch=main&per_page=100` returns
  runs across ALL workflows — deduplicate by taking the first (most recent)
  run per `workflow_id`
- Repo `default_branch` field is in the repo metadata endpoint — don't assume
  "main", it could be "master", "develop", etc.
- `gh auth token` returns just the token string with a newline — `.trim()` it
- HTMX can be vendored as a single .js file (~14KB gzipped) — no CDN needed
- EJS partials use `<%- include('partials/card', { data }) %>` syntax
- `tsx` supports `--watch` flag for auto-restart

## Session Log

- **2026-04-01**: Created during planning session. No implementation yet.
