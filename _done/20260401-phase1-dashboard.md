# TPP: Phase 1 — Complete Dashboard

## Current Phase

- [x] Complete

## What Was Built

- Express + EJS + HTMX dashboard with grouped table layout
- Column sorting, search filter, failures-only toggle, expand/collapse all
- Per-repo and global refresh buttons
- Settings page: sortable table of all repos with checkboxes, filter, All/None/Invert
- Disk-persisted cache and config (restarts don't refetch)
- Rate limit protection: reserve floor, budget cap, repo rotation, branch caching
- Token re-extraction on 401, error banner with dedup and dismiss
- Auto-open browser, --port flag, --no-open flag
- CI workflow with OIDC npm publishing
- 58 tests (vitest + msw + supertest)

## Lore

- Smoke testing burned 5000 API calls. Fixed by persisting repos to config
  and caching run data to disk.
- EJS `include()` resolves relative to `views/` dir, not current template.
- `run.name` is unreliable — derive workflow names from `run.path` instead.
- lookbackDays was removed — always show latest run per workflow regardless of age.
- Config tests must stub both `XDG_CONFIG_HOME` and `APPDATA` for Windows CI.

## Session Log

- **2026-04-01**: Planning. Reworked intern's 4 TPPs into 2.
- **2026-04-02**: Full implementation in one session. Hit rate limits twice,
  added disk persistence and rate limit protections. Added sorting, filtering,
  auto-open, --port, repo trimming, refresh buttons. Fixed Windows CI.
  Rewrote settings as flat sortable table.
