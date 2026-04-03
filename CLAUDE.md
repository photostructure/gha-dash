# gha-dash — GitHub Actions Dashboard

## Project Overview

Local web dashboard for GitHub Actions. Shows workflow status across multiple
orgs/accounts in a sortable, searchable table. Supports workflow dispatch with
typed input forms. Only prerequisite: an authenticated `gh` CLI.

Licensed under Apache 2.0.

## Quick Start

```bash
npm install
npm run dev       # Express (tsx watch) + Vite dev server
npm test          # vitest (56 tests)
npm run build     # tsup (server) + vite (client) → dist/
```

Dev: open `http://localhost:5173` (Vite proxies API to Express on :3131).
Production: `node dist/cli.js` serves Vue SPA + API on :3131.

## Tech Stack

- **Runtime**: Node.js 20+, TypeScript (strict, ESM — `"type": "module"`)
- **Server**: Express 5, JSON API routes
- **Frontend**: Vue 3 (Composition API, `<script setup>`), vue-router, Vite
- **GitHub API**: @octokit/rest, auth via `gh auth token`
- **Tests**: vitest + msw (network-level API mocking) + supertest (routes)
- **Build**: tsup (server) + Vite (client) → `dist/`

## Project Structure

```
src/
  cli.ts                  — Entry point (--port, --no-open, graceful shutdown)
  server.ts               — Express app, security headers, API routes, SPA serving
  state.ts                — App state, background refresh, rate limit logic
  types.ts                — Core types (AppConfig, WorkflowRun, helpers)
  routes/
    api.ts                — All JSON API endpoints (/api/*)
  services/
    github.ts             — Token extraction, Octokit, all API calls
    cache.ts              — Generic stale-while-revalidate cache with disk persistence
    config.ts             — XDG/APPDATA config read/write, cache persistence
    dispatch.ts           — Workflow YAML fetch/parse, dispatch API
    workflows.ts          — groupRunsByRepo, RepoGroup type
    __tests__/            — All test files (colocated)
  client/
    index.html            — Vite entry point
    main.ts               — Vue app creation + router
    App.vue               — Root component (header + router-view)
    router.ts             — / → Dashboard, /settings → Settings
    vite.config.ts        — Vite build config + dev proxy
    composables/
      useWorkflows.ts     — Fetch/poll workflows, refresh
      useConfig.ts        — Fetch/save configuration
      useDispatch.ts      — Load dispatch info, trigger dispatch
    views/
      DashboardView.vue   — Error banner + workflow table
      SettingsView.vue    — Repo selection + general config form
    components/
      AppHeader.vue       — Nav, rate limit badge, refresh button
      WorkflowTable.vue   — Sortable/filterable grouped table
      RepoGroup.vue       — Collapsible repo header + rows
      WorkflowRow.vue     — Single run row + inline dispatch
      DispatchForm.vue    — Typed inputs, submit, feedback
      SearchToolbar.vue   — Search, failures-only, expand/collapse
      StatusBadge.vue     — Color-coded status pill
      ErrorBanner.vue     — Grouped error display
      RateLimitBadge.vue  — Color-coded remaining/limit
  public/
    style.css             — All CSS (dark mode, responsive)
```

## Architecture

See `docs/ARCHITECTURE.md` for the full reference (types, routes, security,
lore). Key points:

- **Auth**: `gh auth token` extracts OAuth token at startup. Re-extracted on 401.
- **Data flow**: Server background-polls GitHub, caches runs. Vue client polls
  `GET /api/workflows` every 30s. Reactive state means polls never destroy
  collapse/sort/filter state.
- **Config**: `~/.config/gha-dash/config.json` stores selected repos, available
  repos, cached branch names, and rate limit settings.
- **Disk cache**: `~/.config/gha-dash/cache.json` — restarts don't refetch.
- **Security**: localhost-only, token never exposed to browser, security headers.
- **Dev**: `npm run dev:all` runs Express (tsx watch) + Vite dev server concurrently.
  Open `http://localhost:5173` for Vue (proxies API to :3131).

## Rate Limiting

This is the most important operational concern. GitHub allows 5000 requests/hour.

- **Branch caching**: Default branch fetched once per repo, stored in config.
- **Reserve floor** (`rateLimitFloor: 500`): Hard stop — no refresh below this.
- **Budget cap** (`rateBudgetPct: 50`): Soft throttle per cycle.
- **Repo rotation**: When budget-limited, different repos refresh each cycle.
- **Fresh cache skip**: If disk cache is younger than refresh interval, skip
  initial API fetch entirely on startup.

**If you hit rate limits during development**: stop the server, wait for reset
(`gh api /rate_limit --jq '.rate'`), then restart. Use `--no-open` to prevent
the browser from triggering extra requests.

## Workflow

- **Always ask the user to verify changes work before committing.** Don't
  jump straight to `git commit` after making changes — ask "does this work?"
  first. UI changes especially need manual verification.
- Never commit or push without asking first.

## Conventions

- TypeScript strict mode, ESM (`import` with `.js` extensions)
- `node:` prefix for all Node built-in imports
- `??` for nullish coalescing, never `||`
- Tests colocated in `__tests__/` directories
- Conventional Commits for commit messages
- No Co-Authored-By trailers

## Testing

```bash
npm test              # all tests
npm run test:watch    # watch mode
```

- **Unit tests**: types, config, cache (pure logic)
- **GitHub API tests**: msw intercepts Octokit requests (github-api.test.ts)
- **Token tests**: mock `execSync` for gh CLI (github.test.ts)
- **API route tests**: supertest against Express JSON API (routes.test.ts)
- **YAML parsing**: all `on:` syntax variants for dispatch (dispatch.test.ts)
- **State tests**: cache prune, delete, refresh-preserves-data (state.test.ts)

Config tests stub both `XDG_CONFIG_HOME` and `APPDATA` for cross-platform.

## CI & Publishing

`.github/workflows/build.yml`:
- **Push/PR**: Build matrix (ubuntu/macos/windows × node 20/22/24)
- **Manual dispatch**: Version bump, SSH-signed tag, GitHub release, npm publish
  with OIDC provenance. Requires secrets: `SSH_SIGNING_KEY`, `GIT_USER_NAME`,
  `GIT_USER_EMAIL`.

## Gotchas / Lore

- `run.name` in the GitHub API is unreliable (sometimes includes commit
  message). We derive workflow names from `run.path` instead (e.g.
  `.github/workflows/build.yml` → "build"). `display_title` is shown as tooltip.
- `src/types.ts` helpers (`displayStatus`, `formatDuration`, `relativeTime`) are
  pure functions — imported by both server and Vue client. No Node.js deps.
- Server build (tsup) bundles TS but not CSS. Build script copies `src/public`
  into `dist/`. Client build (Vite) outputs to `dist/client/`.
- Checkbox inputs absent from POST body = unchecked. Dispatch route explicitly
  sets boolean inputs to `"false"` when missing.
- Express 5 uses path-to-regexp v8 — wildcard routes need `/{*path}` not `*`.
- Vite config `root` is relative to CWD, not the config file — use `__dirname`.
- `npm pack --dry-run` is useful to verify the tarball contents before publish.

## Design Principles

Follow `docs/DESIGN-PRINCIPLES.md` — Simple Design & Tidy First.

- Four Rules: passes tests, reveals intention, no duplication, fewest elements
- Fail early and visibly — no bogus guardrails or silent defaults
- Keep tidyings in separate commits from behavior changes
- Reduce coupling; prefer explicit dependencies over hidden ones

## TPP Workflow

Active TPPs in `_todo/*.md`, completed in `_done/*.md`.
See `docs/TPP-GUIDE.md` for the full guide.
