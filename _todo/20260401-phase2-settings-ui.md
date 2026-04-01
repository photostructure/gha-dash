# TPP: Phase 2 — Settings UI & Configuration

## Summary

Build the settings page where users select which orgs and repos to monitor.
This is critical for onboarding — first-time users with no config should be
redirected here automatically. Config persists to `~/.config/gha-dash/config.json`.

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
- `_todo/20260401-phase1-core-server.md` — must be complete first
- `src/services/config.ts` — config read/write (created in Phase 1)
- `src/services/github.ts` — Octokit wrapper (created in Phase 1)

## Description

The settings page is an interactive org/repo picker built with HTMX. Flow:

1. Page loads showing available orgs (fetched from GitHub API)
2. User clicks an org → repos for that org load via HTMX partial
3. User checks/unchecks repos with checkboxes
4. User clicks Save → config persists, redirect to dashboard

Also: first-run detection. If config has no repos selected, redirect `/` to
`/settings` with a welcome message.

## Tasks

### GitHub API: Org & Repo Discovery
- [ ] List user's orgs: `GET /user/orgs` (paginated)
- [ ] List user's own repos: `GET /user/repos?affiliation=owner` (paginated)
- [ ] List org repos: `GET /orgs/{org}/repos` (paginated)
- [ ] For each repo, we need: full_name, description, default_branch,
      has_actions (check if `.github/workflows` exists or if workflows API
      returns results — or just list all and let user pick)
- [ ] Cache org/repo lists (refresh on settings page visit)

### Config Persistence
- [ ] Use `env-paths` for cross-platform config directory
- [ ] Config schema:
  ```json
  {
    "repos": ["owner/repo", ...],
    "refreshInterval": 60,
    "port": 3131
  }
  ```
- [ ] Read config on startup, create default if missing
- [ ] Write config on settings save
- [ ] Validate config on read (handle corrupt/missing fields gracefully)

### Settings Page UI
- [ ] Full page: `/settings` — header, org list, repo list, save button
- [ ] Org list as clickable items (buttons or links)
- [ ] Clicking org loads repos via HTMX: `hx-get="/partials/repos/{owner}"`
- [ ] Repo list with checkboxes, pre-checked for already-selected repos
- [ ] "Select all" / "Deselect all" per org
- [ ] Repo description shown as secondary text
- [ ] Search/filter within repo list (client-side, plain JS)
- [ ] Save button: POST /settings/repos with selected repo list
- [ ] After save: redirect to `/` with success flash message
- [ ] Include the authenticated user as an "org" (personal repos)

### First-Run Experience
- [ ] Middleware: if no repos configured and path is `/`, redirect to `/settings`
- [ ] Welcome message on settings page for first-time users
- [ ] "Back to dashboard" link on settings page (hidden if no repos yet)

### Navigation
- [ ] Add settings gear icon/link to dashboard header
- [ ] Add "back to dashboard" link on settings page

## Lore

- `GET /user/orgs` returns orgs, but the user's own account isn't an "org" —
  need to also fetch `/user` to get the username for personal repos
- `env-paths` returns platform-specific dirs:
  - Linux: `~/.config/gha-dash/`
  - macOS: `~/Library/Preferences/gha-dash/`
  - Windows: `%APPDATA%/gha-dash/Config/`
- HTMX form submission: use `hx-post` with `hx-vals` or standard form POST
- For the repo checkbox list, use a standard `<form>` — HTMX handles the POST
- Rate limit consideration: listing all repos for a large org can be expensive.
  Use pagination and consider showing first 100 repos with a "load more" button.

## Session Log

- **2026-04-01**: Created during planning session. No implementation yet.
