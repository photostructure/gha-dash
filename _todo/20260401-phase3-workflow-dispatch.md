# TPP: Phase 3 — Workflow Dispatch

## Summary

Add a "Run workflow" button to dispatchable workflows. When clicked, fetch the
workflow YAML to discover inputs, render a form, and POST to GitHub's dispatch
endpoint. This mirrors the "Run workflow" button on GitHub's Actions tab.

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
- `src/services/github.ts` — Octokit wrapper
- `src/views/partials/workflow-card.ejs` — card template to add button to

## Description

GitHub workflows with `on: workflow_dispatch` can be triggered via API. These
workflows may define typed inputs (string, choice, boolean, environment) with
descriptions, defaults, and required flags. We need to:

1. Identify which workflows support dispatch
2. Fetch and parse the workflow YAML to extract input definitions
3. Render a form matching the input types
4. Submit the dispatch request and show feedback

## Tasks

### Detect Dispatchable Workflows
- [ ] When fetching workflow runs, we don't directly know if a workflow supports
      `workflow_dispatch`. Options:
  - Fetch the workflow YAML and check (expensive for many workflows)
  - Check if the workflow has any runs with `event: workflow_dispatch`
  - Fetch YAML lazily: only when user clicks a "Run" affordance
  - **Chosen approach**: Fetch workflow YAML for all workflows in background,
    cache the parsed inputs. Show "Run" button only for dispatchable ones.
- [ ] Add `workflow_dispatch` detection to the background refresh

### Fetch & Parse Workflow YAML
- [ ] GitHub Contents API: `GET /repos/{owner}/{repo}/contents/{path}`
  - `path` comes from workflow object's `path` field (e.g. `.github/workflows/ci.yml`)
  - Response includes `content` (base64-encoded)
  - Decode base64, parse YAML
- [ ] Extract `on.workflow_dispatch.inputs` from parsed YAML
- [ ] Handle edge cases:
  - `on: workflow_dispatch` with no inputs (just a trigger button)
  - `on: [push, workflow_dispatch]` (shorthand array syntax)
  - `on: { workflow_dispatch: {} }` (empty object)
  - `on: { workflow_dispatch: { inputs: { ... } } }` (with inputs)
- [ ] Cache parsed workflow definitions (TTL: 5 minutes)

### Input Types & Form Rendering
- [ ] `string` → `<input type="text">` with optional default value
- [ ] `choice` → `<select>` with options from `options` array
- [ ] `boolean` → `<input type="checkbox">` with default
- [ ] `environment` → `<select>` populated from repo's environments
  - Requires `GET /repos/{owner}/{repo}/environments` API call
  - Fallback to text input if environments can't be fetched
- [ ] Required inputs: mark with asterisk, add `required` attribute
- [ ] Input descriptions: show as help text below each field
- [ ] Default values: pre-fill from workflow definition

### Dispatch Form UI
- [ ] "Run workflow" button on workflow cards (only for dispatchable workflows)
- [ ] Clicking button loads form via HTMX partial:
      `hx-get="/dispatch/{owner}/{repo}/{workflow_id}"`
- [ ] Form renders inline (expand below card) or as a modal/popover
- [ ] Ref/branch selector: default to repo's default branch, allow override
- [ ] Submit button: POST to `/dispatch/{owner}/{repo}/{workflow_id}`
- [ ] Loading state while dispatch is in progress
- [ ] Success feedback: "Workflow dispatched" with link to the run
- [ ] Error feedback: show API error message

### API Integration
- [ ] POST endpoint: `/dispatch/:owner/:repo/:workflow_id`
- [ ] Validate inputs server-side (required fields present)
- [ ] Call Octokit: `actions.createWorkflowDispatch({owner, repo, workflow_id, ref, inputs})`
- [ ] Return success/error as HTMX partial (swap into the form area)

## Lore

- GitHub's workflow dispatch API is `POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches`
- The `ref` parameter is required — it's the branch/tag to run on
- Input values are always strings, even for booleans ("true"/"false")
- The API returns 204 No Content on success (no run ID in response)
- To link to the triggered run: poll `GET /repos/{owner}/{repo}/actions/runs`
  filtered by workflow and look for the newest run, or just link to the
  workflow's runs page on GitHub
- `on` key in workflow YAML can be a string, array, or object — handle all forms
- Contents API returns base64 `content` — use `Buffer.from(content, 'base64')`
- Environment-type inputs are rare — OK to defer or simplify initially

## Session Log

- **2026-04-01**: Created during planning session. No implementation yet.
