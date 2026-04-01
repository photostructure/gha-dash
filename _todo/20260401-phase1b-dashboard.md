# TPP: Phase 1b — Dashboard Rendering

## Summary

Build the read-only dashboard UI on top of Phase 1a's server and API client.
By the end: the dashboard shows workflow status cards for configured repos,
auto-refreshing via HTMX polling.

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

- `_todo/20260401-master-plan.md` — architecture decisions
- `_todo/20260401-phase1a-scaffolding.md` — must be complete first
- `src/services/github.ts` — Octokit wrapper (created in Phase 1a)
- `src/services/cache.ts` — cache layer (created in Phase 1a)

## Tasks

### Template Functions
- [ ] `layout(title, body)` — HTML shell: viewport meta, CSS link, HTMX script
- [ ] `dashboardPage(repos)` — full dashboard page with header and card container
- [ ] `workflowCards(repos)` — HTMX partial: all cards grouped by repo
- [ ] `workflowCard(run)` — single workflow card

### Dashboard Content
- [ ] Cards grouped by repo
- [ ] Each card shows:
  - Status badge (color-coded: green/red/yellow/grey)
  - Workflow name
  - Branch name
  - Commit SHA (short, linked to GitHub)
  - Run duration
  - Relative timestamp ("2 minutes ago")
  - Link to the run on GitHub
- [ ] Footer with rate limit info

### HTMX Integration
- [ ] `hx-get="/partials/workflows"` with `hx-trigger="every 30s"`
- [ ] Loading state while first fetch completes

### CSS
- [ ] Status colors: green (success), red (failure), yellow (in_progress),
      grey (queued/waiting/other)
- [ ] Responsive layout (cards reflow on narrow screens)
- [ ] Dark mode via `prefers-color-scheme`
- [ ] No CSS framework — hand-written, minimal

## Lore

- Tagged template literals: use a helper function that handles HTML escaping
  to prevent XSS. Don't concatenate raw user data into HTML strings.
- HTMX can be vendored as a single .js file (~14KB gzipped) — no CDN needed
- `hx-trigger="every 30s"` handles polling automatically
- Relative timestamps: can use simple math or a lightweight lib. Keep it
  server-rendered so it updates on each poll.

## Session Log

- **2026-04-01**: Split from original Phase 1 TPP. Scope: rendering only.
