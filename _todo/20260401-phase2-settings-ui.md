# TPP: Phase 2 — Settings UI & Configuration

## Summary

Build the settings page where users select which orgs and repos to monitor.
First-time users with no config get redirected here automatically.

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
- `src/services/config.ts` — config read/write (created in Phase 1a)
- `src/services/github.ts` — Octokit wrapper (created in Phase 1a)

## Tasks

### GitHub API: Org & Repo Discovery
- [ ] List user's orgs: `GET /user/orgs` (paginated)
- [ ] List user's own repos: `GET /user/repos?affiliation=owner` (paginated)
- [ ] List org repos: `GET /orgs/{org}/repos` (paginated)
- [ ] Include authenticated user as an "org" (personal repos)

### Settings Page UI
- [ ] Full page: `/settings` with org list, repo list, save button
- [ ] Org list as clickable items
- [ ] Clicking org loads repos via HTMX: `hx-get="/partials/repos/{owner}"`
- [ ] Repo list with checkboxes, pre-checked for already-selected repos
- [ ] Repo description shown as secondary text
- [ ] Save button: POST /settings/repos with selected repo list
- [ ] After save: redirect to `/`

### First-Run Experience
- [ ] Middleware: if no repos configured and path is `/`, redirect to `/settings`
- [ ] "Back to dashboard" link (hidden if no repos yet)

### Navigation
- [ ] Settings link in dashboard header
- [ ] "Back to dashboard" link on settings page

## Lore

- `GET /user/orgs` returns orgs, but the user's own account isn't an "org" —
  also fetch `/user` for username to list personal repos
- Rate limit consideration: listing all repos for a large org can be expensive.
  Show first 100 repos per org, add "load more" if needed.

## Session Log

- **2026-04-01**: Created during planning session.
- **2026-04-01**: Simplified during review. Dropped env-paths (use platform
  check instead), removed select-all/search/filter/flash messages as
  speculative features.
