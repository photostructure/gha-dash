# TPP: Phase 2 — Workflow Dispatch

## Current Phase

- [x] Complete

## What Was Built

- YAML parsing for all `on:` syntax variants (string, array, empty object, with inputs)
- Typed input forms: string → text, choice → select, boolean → checkbox
- Detail-row expansion via HTMX (form appears below workflow row)
- POST dispatch with boolean checkbox handling (absent = "false")
- Success/error feedback inline
- 13 YAML parsing tests covering all edge cases + malformed YAML

## Known Limitations

- Run button shows on all workflows (not just dispatchable ones). Lazy approach:
  clicking Run on a non-dispatchable workflow returns an error message.
- Environment-type inputs render as text inputs (environments API deferred).

## Lore

- `run.path` contains the workflow file path — used to fetch YAML via Contents API.
- YAML `on:` parsed as boolean `true` by some parsers — `yaml` package handles
  it, but we also check `doc.true` as fallback.
- Dispatch API returns 204 No Content — no run ID. Link to workflow runs page.

## Session Log

- **2026-04-01**: Planning. Reworked as Phase 2 with lazy YAML fetching.
- **2026-04-02**: Implemented. YAML parsing, dispatch route, form templates, CSS.
