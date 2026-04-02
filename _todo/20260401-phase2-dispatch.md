# TPP: Phase 2 — Workflow Dispatch

## Summary

Add "Run workflow" buttons to dispatchable workflows. Fetch workflow YAML to
discover inputs, render typed forms, and POST to GitHub's dispatch endpoint.
Mirrors the "Run workflow" button on GitHub's Actions tab.

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

- `docs/ARCHITECTURE.md` — types, routes, lore (especially dispatch-related)
- Phase 1 must be complete before starting this phase

## Description

Workflows with `on: workflow_dispatch` can be triggered via API. They may define
typed inputs (string, choice, boolean, environment) with descriptions, defaults,
and required flags. We need to:

1. Identify which workflows support dispatch (fetch + parse YAML)
2. Render a form matching the input types
3. Submit the dispatch request and show feedback

## Key Decisions

### Lazy YAML Fetching
Fetch workflow YAML only when user clicks "Run" on a workflow card — not in
the background refresh. Rationale: most workflows aren't dispatchable, and
parsing YAML for all of them is wasteful. Cache the result after first fetch
(TTL: 5 minutes).

### Input Type → HTML Element

| YAML type | HTML element | Notes |
|-----------|-------------|-------|
| `string` | `<input type="text">` | Pre-fill from `default` |
| `choice` | `<select>` | Options from `options` array |
| `boolean` | `<input type="checkbox">` | Check if `default` is `"true"` |
| `environment` | `<select>` or `<input type="text">` | Populate from environments API; fall back to text input |

### Dispatch Form Placement
Detail row expansion: clicking "Run" inserts a new `<tr>` below the workflow
row containing a `<td colspan="...">` with the input form. HTMX loads the
form partial into this detail row. Submit replaces the form with success/error
feedback. Clicking "Run" again or pressing Escape collapses the detail row.
Same pattern GitHub uses for expandable check suite details.

## YAML Parsing Edge Cases

The `on` key in workflow YAML has multiple valid forms — all must be handled:

```yaml
# 1. Simple trigger, no inputs
on: workflow_dispatch

# 2. Array syntax
on: [push, workflow_dispatch]

# 3. Empty object
on:
  workflow_dispatch: {}

# 4. With inputs
on:
  workflow_dispatch:
    inputs:
      environment:
        type: choice
        description: Deploy target
        required: true
        options: [staging, production]
      dry_run:
        type: boolean
        default: "false"
```

## Error Handling

- **403 Permission Denied**: Show inline "You don't have permission to dispatch
  this workflow" in the form area
- **422 Validation Error**: Show the API error message inline (usually missing
  required inputs)
- **Network error / 500**: Show "Dispatch failed. Try again." with retry button
- **Workflow not dispatchable** (YAML has no `workflow_dispatch`): Don't show
  the Run button at all

## Accessibility

- Form labels associated with inputs via `for`/`id`
- Required fields marked with `aria-required="true"` and visual indicator
- Error messages linked to fields via `aria-describedby`
- Focus moves to the form when it expands, and to the feedback after submit
- Input descriptions shown as `<small>` help text below each field

## Testing Strategy

**YAML parsing** (most important — many edge cases):
- Fixture files for each of the 4 `on` syntax variants above
- Test extraction of inputs with all 4 types (string, choice, boolean, environment)
- Test required flag, default values, descriptions
- Test malformed YAML (graceful error, not crash)

**Dispatch endpoint**:
- msw mock for `POST .../dispatches` returning 204
- Test with inputs, without inputs (just trigger)
- Test error responses (403, 422)

**Form rendering** (via supertest):
- `GET /dispatch/:owner/:repo/:id` returns form HTML with correct input elements
- Pre-filled defaults present in rendered HTML
- Required attributes present

## Tasks

### 1. YAML Fetch + Parse
- [ ] `src/services/dispatch.ts` — fetch workflow YAML via Contents API,
      decode base64, parse with `yaml` package
- [ ] Extract `on.workflow_dispatch.inputs` handling all 4 syntax variants
- [ ] Cache parsed definitions (TTL: 5 minutes, reuse Phase 1 cache)
- [ ] Tests: fixture files for each variant, malformed YAML

### 2. Dispatch Form UI
- [ ] Add "Run" button in Actions column of workflow table rows — only shown
      when workflow has `workflow_dispatch` trigger
- [ ] `src/views/partials/dispatch-form.ejs` — renders inputs based on type,
      wrapped in a `<tr><td colspan="...">` for detail-row expansion
- [ ] `GET /dispatch/:owner/:repo/:id` route — fetch YAML, render form partial
- [ ] Ref/branch selector defaulting to `default_branch`
- [ ] Click "Run" again or Escape to collapse the detail row
- [ ] Accessibility: labels, required indicators, help text, focus management
- [ ] Tests: supertest for form rendering, correct input types in HTML

### 3. Dispatch API Integration
- [ ] `POST /dispatch/:owner/:repo/:id` route
- [ ] Server-side validation (required fields present)
- [ ] Call `octokit.actions.createWorkflowDispatch({ owner, repo, workflow_id, ref, inputs })`
- [ ] Success partial: "Workflow dispatched" + link to workflow runs page
- [ ] Error partial: inline error message
- [ ] Tests: msw mock for dispatch, 204 success, 403/422 errors

### 4. Environment-Type Inputs (stretch)
- [ ] `GET /repos/{owner}/{repo}/environments` to populate environment selects
- [ ] Fall back to text input if environments API fails (403 is common)
- [ ] Cache environments per repo (TTL: 5 minutes)

## Session Log

- **2026-04-01**: Initial planning by intern as Phase 3.
- **2026-04-01**: Reworked as Phase 2. Changed from background YAML fetching to
  lazy fetch. Added testing strategy, error handling, accessibility. Trimmed
  verbose descriptions. Kept input type mapping and edge case list.
