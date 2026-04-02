# gha-dash — GitHub Actions Dashboard

## Project Overview

Local web dashboard for GitHub Actions. Shows workflow status across multiple
orgs/accounts in a sortable, searchable table. Supports workflow dispatch with
typed input forms. Only prerequisite: an authenticated `gh` CLI.

Licensed under Apache 2.0.

## Quick Start

```bash
npm install
npm run dev       # tsx watch — auto-restarts on changes
npm test          # vitest (58 tests)
npm run build     # tsup → dist/ (includes views + static assets)
```

The server binds to `127.0.0.1:3131` and auto-opens a browser.

## Tech Stack

- **Runtime**: Node.js 20+, TypeScript (strict, ESM — `"type": "module"`)
- **Server**: Express 4, EJS templates, HTMX 2.x (vendored, no CDN)
- **GitHub API**: @octokit/rest, auth via `gh auth token`
- **Tests**: vitest + msw (network-level API mocking) + supertest (routes)
- **Build**: tsup → `dist/cli.js` with shebang for `npx gha-dash`

## Project Structure

```
src/
  cli.ts                  — Entry point (--port, --no-open, graceful shutdown)
  server.ts               — Express app, security headers, static files
  state.ts                — App state, background refresh, rate limit logic
  types.ts                — Core types (AppConfig, WorkflowRun, helpers)
  routes/
    dashboard.ts          — GET /, /partials/workflows, /refresh
    settings.ts           — GET /settings, POST /settings/repos
    dispatch.ts           — GET/POST /dispatch/:owner/:repo/:id
  services/
    github.ts             — Token extraction, Octokit, all API calls
    cache.ts              — Generic stale-while-revalidate cache with disk persistence
    config.ts             — XDG/APPDATA config read/write, cache persistence
    dispatch.ts           — Workflow YAML fetch/parse, dispatch API
    __tests__/            — All test files (colocated)
  views/
    head.ejs, foot.ejs    — Shared HTML head/foot
    dashboard.ejs         — Main dashboard (table, search, sort, filter, JS)
    settings.ejs          — Repo selection table
    partials/
      workflow-table.ejs  — Repo groups + workflow rows (HTMX target)
      dispatch-form.ejs   — Typed input form for workflow dispatch
      dispatch-result.ejs — Success/error feedback
      error-banner.ejs    — Collapsed error display with dismiss
  public/
    style.css             — All CSS (dark mode, responsive)
    htmx.min.js           — Vendored HTMX 2.x
```

## Architecture

See `docs/ARCHITECTURE.md` for the full reference (types, routes, security,
lore). Key points:

- **Auth**: `gh auth token` extracts OAuth token at startup. Re-extracted on 401.
- **Data flow**: Background poll fetches runs for all configured repos. HTMX
  polls `/partials/workflows` every 30s. Cache is stale-while-revalidate.
- **Config**: `~/.config/gha-dash/config.json` stores selected repos, available
  repos, cached branch names, and rate limit settings.
- **Disk cache**: `~/.config/gha-dash/cache.json` — restarts don't refetch.
- **Security**: localhost-only, token never exposed to browser, security headers.

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
- **API tests**: msw intercepts Octokit requests (github-api.test.ts)
- **Token tests**: mock `execSync` for gh CLI (github.test.ts)
- **Route tests**: supertest against Express app (routes.test.ts)
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
- EJS `include()` resolves relative to the `views/` directory, not the current
  template file. Use `include('head')` not `include('../head')`.
- The `tsup` build bundles TS but not EJS/CSS. The build script copies
  `src/views` and `src/public` into `dist/` separately.
- Checkbox inputs absent from POST body = unchecked. Dispatch route explicitly
  sets boolean inputs to `"false"` when missing.
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
