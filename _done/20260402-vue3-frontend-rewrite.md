# TPP: Vue 3 Frontend Rewrite

## Summary

Replace the EJS + HTMX + vanilla JS frontend with Vue 3 SPA. The backend
(Express, GitHub API, cache, config) stays exactly the same — we add JSON
API endpoints and serve a Vue app instead of EJS templates.

## Current Phase

- [x] Research
- [x] Design
- [x] Implement
- [x] Test
- [x] Verify
- [x] Document
- [ ] Review
- [x] Complete

## Required Reading

- `CLAUDE.md` — project conventions (always ask user to verify before committing)
- `docs/ARCHITECTURE.md` — backend architecture, types, routes, lore
- `docs/UI-SPEC.md` — **complete UI/UX feature spec** — the Vue rewrite must be
  feature-equivalent to everything listed here
- `_done/20260401-phase1-dashboard.md` — what was built and why
- `_done/20260401-phase2-dispatch.md` — dispatch implementation details

## Why Rewrite

The HTMX approach hit a wall with interactive client-side state:

- **Collapse state**: HTMX replaces the entire `<tbody>`, destroying collapse
  state. Attempted fixes: localStorage + afterSwap restore, afterSettle,
  MutationObserver, requestAnimationFrame, setTimeout. None reliably work
  because HTMX's DOM replacement is fundamentally at odds with client-managed
  state.
- **Sort + filter**: ~200 lines of vanilla JS in dashboard.ejs for column
  sorting, search filtering, failures-only toggle, expand/collapse all. Fragile
  and hard to reason about.
- **Two state systems**: Server renders HTML, client manipulates DOM. State
  lives in both places. Race conditions and lost state on every swap.

Vue 3 solves this: reactive state survives re-renders, sort/filter/collapse
are just data bindings, and JSON API gives clean separation.

## Architecture

```
Browser (Vue 3 SPA)              Express Server (unchanged)
┌─────────────────────┐          ┌──────────────────────────┐
│ Dashboard.vue       │  JSON    │ GET /api/workflows       │
│ Settings.vue        │◄────────►│ GET /api/config          │
│ DispatchForm.vue    │          │ POST /api/config         │
│                     │          │ POST /api/refresh        │
│ Reactive state:     │          │ POST /api/refresh/:repo  │
│ - collapse map      │          │ GET /api/dispatch/:id    │
│ - sort col/dir      │          │ POST /api/dispatch/:id   │
│ - search query      │          │ GET /api/rate-limit      │
│ - failures filter   │          └──────────────────────────┘
└─────────────────────┘
```

## Tech Stack Changes

| Remove                     | Add                | Why                          |
| -------------------------- | ------------------ | ---------------------------- |
| EJS                        | Vue 3 (SFC)        | Reactive UI, component model |
| HTMX                       | fetch / composable | JSON API, no DOM swap fights |
| Vanilla JS (dashboard.ejs) | Vue reactivity     | Sort/filter/collapse as data |
| —                          | Vite               | Dev server + build           |
| —                          | vue-router         | Dashboard / Settings pages   |

Keep: Express 4, @octokit/rest, p-limit, yaml, vitest, msw, supertest, tsup (for server build).

## Tasks

### 1. Add JSON API Endpoints

- [x] `GET /api/workflows` — returns grouped workflow data as JSON
- [x] `GET /api/config` — returns current config
- [x] `PUT /api/config` — saves config (repos + general settings)
- [x] `POST /api/refresh` — triggers full refresh, returns updated data
- [x] `POST /api/refresh/:owner/:repo` — refreshes one repo, returns updated data
- [x] `GET /api/dispatch/:owner/:repo/:id` — returns dispatch info as JSON
- [x] `POST /api/dispatch/:owner/:repo/:id` — triggers dispatch
- [x] Rate limit bundled into /api/workflows response (no separate endpoint needed)
- [x] Existing EJS routes still work during migration
- [x] 6 API route tests added (64 total tests, all passing)

### 2. Vue 3 App Setup

- [x] Add vite + vue 3 + vue-router + concurrently to package.json
- [x] `src/client/` directory for Vue SPA
- [x] Vite config: dev proxy to Express, build output to `dist/client/`
- [x] Express serves `dist/client/` as static in production (SPA fallback)
- [x] Dev workflow: `npm run dev:all` (concurrent Vite + Express)
- [x] Client tsconfig separate from server tsconfig
- [x] Vite + server builds both work (`npm run build`)

### 3. Dashboard Components

- [x] `src/client/views/DashboardView.vue` — main dashboard
- [x] `src/client/components/WorkflowTable.vue` — sort/filter as computed
- [x] `src/client/components/RepoGroup.vue` — collapsible repo header
- [x] `src/client/components/WorkflowRow.vue` — workflow + inline dispatch
- [x] `src/client/components/StatusBadge.vue` — color-coded status
- [x] `src/client/components/ErrorBanner.vue` — deduplicated errors
- [x] `src/client/components/RateLimitBadge.vue` — color-coded rate limit
- [x] `src/client/components/SearchToolbar.vue` — search, failures-only, expand/collapse
- [x] `src/client/components/AppHeader.vue` — header with nav
- [x] Collapse state persisted to localStorage via `watch`
- [x] Column sorting as computed property
- [x] Search/failures-only filter as computed property
- [x] Poll via `useWorkflows` composable with `setInterval`
- [x] Per-repo + global refresh, state preserved

### 4. Settings Component

- [x] `src/client/views/SettingsView.vue` — unified settings page
- [x] Repo table with sortable columns (selected, owner, name)
- [x] Client-side filter text field
- [x] All/None/Invert helpers (operate on filtered rows)
- [x] General config form (refresh interval, rate limit, hidden workflows, port)
- [x] Single save button posts JSON to PUT /api/config

### 5. Dispatch Component

- [x] `src/client/components/DispatchForm.vue` — inline form
- [x] Expands below workflow row (detail row pattern)
- [x] Typed inputs from JSON dispatch info (string, choice, boolean)
- [x] Submit + success/error feedback

### 6. Cleanup

- [x] Remove EJS templates (`src/views/`)
- [x] Remove HTMX (`src/public/htmx.min.js`)
- [x] Remove EJS dependency
- [x] Remove EJS route files (dashboard.ts, settings.ts, dispatch.ts)
- [x] Move `groupRunsByRepo` to `src/services/workflows.ts`
- [x] Rewrite `server.ts` (no EJS, JSON-only + SPA serving)
- [x] Update build script (remove views copy)
- [x] Update tests (remove EJS tests, 56 tests passing)
- [x] Update docs (ARCHITECTURE.md, CLAUDE.md)

## Key Design Decisions

### Client-Side Polling (not WebSocket)

Keep simple `setInterval` + `fetch('/api/workflows')` polling. The backend
already caches data — the client just re-fetches the JSON. No WebSocket
complexity needed for a local dashboard.

### CSS

Keep the existing `style.css` — it's already well-structured with CSS variables
for dark mode. Vue components can import it globally. No need for Tailwind or
CSS-in-JS.

### Build

- **Dev**: Vite dev server proxies API requests to Express on :3131
- **Prod**: `vite build` → `dist/client/`, Express serves as static files
- Server still builds with `tsup` → `dist/cli.js`

## Lore (from EJS+HTMX session)

- `run.name` is unreliable — derive workflow name from `run.path` filename
- `run.path` contains the workflow file path for Contents API fetch
- Checkbox inputs absent from POST body = unchecked (dispatch booleans)
- Config tests must stub both `XDG_CONFIG_HOME` and `APPDATA` for Windows
- `fetchAllRuns` returns `{ runs, errors, discoveredBranches }` — all three
  need to be handled by the caller
- `refreshRepo` must keep existing cache data if fresh fetch returns empty
- Cache prune on startup: filter disk cache to only repos in config
- `availableRepos` in config = full discovered list; `repos` = selected subset
- `hiddenWorkflows` filters by substring match (case-insensitive) server-side
- Rate limit has `checkedAt` timestamp for display
- Per-repo refresh that replaces DOM destroys collapse state — the whole reason
  for this rewrite
- Express 5 uses path-to-regexp v8 — wildcard routes need `/{*path}` not `*`
- Vite config `root` is relative to CWD, not config file — use `__dirname`
- `src/types.ts` helpers (displayStatus, formatDuration, relativeTime) are pure
  functions with no Node deps — import directly into Vue client code
- Vue provide/inject used to share `useWorkflows` state from App.vue to both
  AppHeader (rate limit badge) and DashboardView (table data)

## Failed Approaches (from EJS+HTMX session)

- **localStorage + htmx:afterSwap**: afterSwap fires but DOM elements aren't
  stable yet. Collapse state read from localStorage but `querySelectorAll` finds
  no matching rows.
- **htmx:afterSettle**: More reliable than afterSwap but still fails for
  per-repo refresh where the triggering element is inside the replaced DOM.
- **MutationObserver on tbody**: Fires correctly but setting `display:none` on
  rows triggers another mutation → infinite loop. Guard flag helps but adds
  complexity.
- **requestAnimationFrame + setTimeout(0)**: Neither reliably fires after HTMX
  has finished its DOM work.
- **hx-swap="none" + 204 response**: Works for per-repo refresh (no DOM swap)
  but user has to wait for the next poll to see updates. Feels unresponsive.

## Uncommitted Changes

There are 8 files with uncommitted changes from the end of the HTMX session:

- Unified settings form (single POST /settings/all)
- Rate limit partial with OOB swap attempt
- Per-repo refresh changed to 204/hx-swap="none"
- afterSettle → setTimeout collapse restore attempt

These should be committed as-is (they're functional, just not perfect) or
reverted before starting the Vue rewrite. The Vue rewrite replaces all of them.

## Session Log

- **2026-04-01**: Planning. Reworked intern's TPPs. Designed architecture.
- **2026-04-02 (session 1)**: Built entire EJS+HTMX dashboard in one session.
  Both phases implemented. 58 tests. Hit collapse-state-vs-HTMX wall.
- **2026-04-02 (session 2)**: Vue 3 rewrite complete. All 3 phases done.
  JSON API (7 endpoints), Vue SPA (10 components, 3 composables), cleanup
  (removed EJS/HTMX/views). Fixed existing bug: config save now awaits refresh
  so newly added repos appear immediately. 56 tests, full build works.
  Also moved `groupRunsByRepo` to `src/services/workflows.ts`.
