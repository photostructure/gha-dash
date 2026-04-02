# TPP: Phase 2 — Workflow Dispatch

## Summary

Add "Run workflow" buttons to dispatchable workflows. Fetch workflow YAML to
discover inputs, render typed forms, and POST to GitHub's dispatch endpoint.

## Current Phase

- [x] Research
- [x] Design
- [x] Implement
- [ ] Test (needs live API verification)
- [ ] Verify
- [ ] Document
- [ ] Review
- [ ] Complete

## Required Reading

- `docs/ARCHITECTURE.md` — types, routes, lore (especially dispatch-related)

## Description

Workflows with `on: workflow_dispatch` can be triggered via API. They may define
typed inputs (string, choice, boolean, environment) with descriptions, defaults,
and required flags.

## Implementation Status

### 1. YAML Fetch + Parse — DONE
- [x] `src/services/dispatch.ts` — fetch YAML via Contents API, decode base64,
      parse with `yaml` package
- [x] `parseWorkflowDispatch()` handles all 4 `on` syntax variants
- [x] Cache parsed definitions (TTL: 5 minutes, separate Cache instance)
- [x] 13 tests: all variants, non-dispatchable, malformed YAML, edge cases

### 2. Dispatch Form UI — DONE
- [x] "Run" button (▶) in Actions column of every workflow row
- [x] `src/views/partials/dispatch-form.ejs` — typed input rendering
- [x] `GET /dispatch/:owner/:repo/:id` route — lazy YAML fetch, render form
- [x] Ref/branch selector defaulting to workflow's branch
- [x] Cancel button removes the form
- [x] Accessibility: labels, required indicators, help text

### 3. Dispatch API Integration — DONE
- [x] `POST /dispatch/:owner/:repo/:id` route
- [x] Boolean checkbox handling (absent = "false")
- [x] `dispatchWorkflow()` calls `octokit.actions.createWorkflowDispatch`
- [x] Success partial with link to GitHub runs page
- [x] Error partial with contextual messages (403, 422, generic)

### 4. Environment-Type Inputs — DEFERRED
- [ ] Environments API integration (stretch goal, 403 is common)
- Environment inputs currently render as text inputs (functional fallback)

## Remaining Work

1. **Live API verification** — blocked on rate limit reset, then test:
   - Clicking Run on a dispatchable workflow shows the form
   - Form renders correct input types from YAML
   - Submit triggers the workflow on GitHub
   - Non-dispatchable workflows handle gracefully (404/400 from route)
2. **Hide Run button for non-dispatchable workflows** — currently every row
   gets a Run button; ideally only dispatchable ones would. Requires either
   background YAML fetching or accepting the lazy approach (button always
   shown, error message if not dispatchable).

## Lore

- `run.path` in the workflow runs API response contains the workflow file path
  (e.g. `.github/workflows/ci.yml`) — used to fetch YAML via Contents API
- YAML `on:` key is parsed as boolean `true` by some YAML parsers — the `yaml`
  package handles this correctly, but we also check `doc.true` as fallback
- Checkbox inputs not present in form body = unchecked. Must explicitly set
  boolean inputs to "false" when absent from POST body.

## Session Log

- **2026-04-01**: Initial planning by intern as Phase 3.
- **2026-04-01**: Reworked as Phase 2. Lazy YAML fetching, testing strategy.
- **2026-04-02**: Implemented all 3 core task groups. 13 YAML parsing tests,
  dispatch route with form rendering and API integration. Detail-row expansion
  via HTMX. Types, CSS, and templates complete. Committed as feat(dispatch).
