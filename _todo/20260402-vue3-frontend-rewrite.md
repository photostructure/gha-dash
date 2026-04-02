# TPP: Vue 3 Frontend Rewrite

## Summary

Replace the EJS + HTMX + vanilla JS frontend with Vue 3 SPA. The backend
(Express, GitHub API, cache, config) stays exactly the same — we add JSON
API endpoints and serve a Vue app instead of EJS templates.

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

| Remove | Add | Why |
|--------|-----|-----|
| EJS | Vue 3 (SFC) | Reactive UI, component model |
| HTMX | fetch / composable | JSON API, no DOM swap fights |
| Vanilla JS (dashboard.ejs) | Vue reactivity | Sort/filter/collapse as data |
| — | Vite | Dev server + build |
| — | vue-router | Dashboard / Settings pages |

Keep: Express 4, @octokit/rest, p-limit, yaml, vitest, msw, supertest, tsup (for server build).

## Tasks

### 1. Add JSON API Endpoints
- [ ] `GET /api/workflows` — returns grouped workflow data as JSON
- [ ] `GET /api/config` — returns current config
- [ ] `POST /api/config` — saves config (repos + general settings)
- [ ] `POST /api/refresh` — triggers full refresh, returns updated data
- [ ] `POST /api/refresh/:owner/:repo` — refreshes one repo, returns updated data
- [ ] `GET /api/dispatch/:owner/:repo/:id` — returns dispatch info as JSON
- [ ] `POST /api/dispatch/:owner/:repo/:id` — triggers dispatch
- [ ] `GET /api/rate-limit` — returns current rate limit info
- [ ] Keep existing EJS routes working during migration (remove later)

### 2. Vue 3 App Setup
- [ ] Add vite + vue 3 + vue-router to package.json
- [ ] `src/client/` directory for Vue SPA
- [ ] Vite config: dev proxy to Express, build output to `dist/client/`
- [ ] Express serves `dist/client/` as static in production
- [ ] Dev workflow: `vite dev` for frontend, `tsx watch` for backend

### 3. Dashboard Component
- [ ] `src/client/views/Dashboard.vue` — main dashboard
- [ ] Reactive state: `collapseMap`, `sortCol`, `sortDir`, `searchQuery`, `failuresOnly`
- [ ] Collapse state persisted to localStorage via `watchEffect`
- [ ] Column sorting as computed property (no DOM manipulation)
- [ ] Search filter as computed property
- [ ] Failures-only as computed property
- [ ] Poll `/api/workflows` on interval — data updates, UI state preserved
- [ ] Per-repo refresh button: POST, then re-fetch workflows
- [ ] Global refresh button in header
- [ ] Rate limit badge in header, updates after refresh

### 4. Settings Component
- [ ] `src/client/views/Settings.vue` — unified settings page
- [ ] Repo table with sortable columns (selected, owner, name)
- [ ] Client-side filter text field
- [ ] All/None/Invert helpers
- [ ] General config form (refresh interval, rate limit, hidden workflows, port)
- [ ] Single save button posts entire config

### 5. Dispatch Component
- [ ] `src/client/components/DispatchForm.vue` — inline form
- [ ] Expands below workflow row (detail row pattern)
- [ ] Typed inputs from JSON dispatch info
- [ ] Submit + success/error feedback

### 6. Cleanup
- [ ] Remove EJS templates (`src/views/`)
- [ ] Remove HTMX (`src/public/htmx.min.js`)
- [ ] Remove EJS dependency
- [ ] Update build script
- [ ] Update tests

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
- **2026-04-02**: Built entire EJS+HTMX dashboard in one session. Both phases
  implemented. Hit rate limits twice, added disk persistence and rate limit
  protections. Added sorting, filtering, collapse, dispatch, settings, CI
  workflow. 58 tests. Hit collapse-state-vs-HTMX wall. User requested Vue 3
  rewrite to solve the fundamental state management problem.
