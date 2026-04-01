# TPP: Phase 1a — Scaffolding & API Client

## Summary

Set up the project and build the server + GitHub API integration. By the end:
`npm run dev` starts an Express server that can fetch workflow runs from GitHub
and return JSON. No UI yet — that's Phase 1b.

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
- `docs/DESIGN-PRINCIPLES.md` — Simple Design & Tidy First

## Tasks

### Scaffolding
- [ ] Initialize package.json with project metadata
- [ ] Configure tsconfig.json (strict mode)
- [ ] Set up directory structure:
  ```
  src/
    server.ts          — Express app setup, binds 127.0.0.1
    routes/
      dashboard.ts     — GET / and partials
    services/
      github.ts        — Auth + Octokit wrapper
      cache.ts         — In-memory cache with TTL
      config.ts        — Config file read/write
    views/
      layout.ts        — HTML shell function
    public/
      style.css        — Custom styles
      htmx.min.js      — HTMX (vendored)
  ```
- [ ] Add `tsx --watch` for dev, `tsup` for build
- [ ] Write README with setup instructions and local-only security note

### Auth & GitHub API
- [ ] Token extraction: try `gh auth token`, fall back to `GITHUB_TOKEN` env var
  - Fail fast with clear message if neither available
  - Re-extract gh token every 30 minutes (tokens can rotate)
- [ ] Initialize `@octokit/rest` with extracted token
- [ ] Fetch workflow runs: `GET /repos/{owner}/{repo}/actions/runs`
  - Filter by `branch` (default branch)
  - `per_page=100` to get all workflows in one call
  - Deduplicate: keep only latest run per workflow_id
- [ ] Fetch repo default branch: `GET /repos/{owner}/{repo}` → `default_branch`

### Config
- [ ] Config path: `$XDG_CONFIG_HOME/gha-dash/config.json` or `~/.config/gha-dash/config.json`
  - Platform check for Mac (`~/Library/Application Support/gha-dash/`) vs Linux
- [ ] Config schema:
  ```json
  {
    "repos": ["owner/repo"],
    "refreshInterval": 60,
    "port": 3131
  }
  ```
- [ ] Read config on startup — fail with clear error if corrupt
- [ ] Write config on save

### In-Memory Cache
- [ ] Simple Map-based cache with TTL
- [ ] Keys: `runs:{owner}/{repo}`, `repo:{owner}/{repo}`
- [ ] Background refresh: setInterval fetches fresh data for all repos
- [ ] Configurable refresh interval (default 60s)

### Express Server
- [ ] Bind to `127.0.0.1` (NOT `0.0.0.0`) — security critical
- [ ] Startup banner: `Dashboard: http://localhost:3131`
- [ ] Basic route structure (GET / returns placeholder for now)

## Lore

- `gh auth token` returns just the token string with a newline — `.trim()` it
- `GET /repos/{owner}/{repo}/actions/runs?branch=main&per_page=100` returns
  runs across ALL workflows — deduplicate by taking first run per `workflow_id`
- Repo `default_branch` field is in the repo metadata — don't assume "main"
- Mac config path convention is `~/Library/Application Support/`, Linux is
  `~/.config/` — check `process.platform === 'darwin'`

## Session Log

- **2026-04-01**: Split from original Phase 1 TPP. Scope: scaffolding + API only.
