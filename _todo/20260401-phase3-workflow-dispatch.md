# TPP: Phase 3 — Workflow Dispatch

## Summary

Add a "Run workflow" button to dispatchable workflows. Fetch workflow YAML
lazily on click to discover inputs, render a form, and POST to GitHub's
dispatch endpoint.

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
- `src/services/github.ts` — Octokit wrapper
- `src/views/` — template functions to add dispatch button to

## Tasks

### Lazy YAML Fetch (on button click, not background)
- [ ] When user clicks "Run" on a workflow card, fetch the workflow YAML:
  `GET /repos/{owner}/{repo}/contents/{path}`
  - Decode base64 content, parse YAML
  - Extract `on.workflow_dispatch.inputs`
  - Cache parsed result (TTL: 5 minutes)
- [ ] Handle `on` key variants: string, array, object, empty object
- [ ] If workflow doesn't support dispatch, show error message

### Input Types & Form Rendering
- [ ] `string` → `<input type="text">` with optional default
- [ ] `choice` → `<select>` with options array
- [ ] `boolean` → `<input type="checkbox">` with default
- [ ] Required inputs: `required` attribute + asterisk
- [ ] Input descriptions as help text
- [ ] Default values pre-filled

### Dispatch Form UI
- [ ] "Run workflow" button on every workflow card (fetch determines if dispatchable)
- [ ] Clicking button loads form via HTMX: `hx-get="/dispatch/{owner}/{repo}/{id}"`
- [ ] Form renders inline below card
- [ ] Ref/branch selector: default to repo's default branch
- [ ] Submit: POST to `/dispatch/{owner}/{repo}/{id}`
- [ ] Success/error feedback as HTMX partial

### API Integration
- [ ] POST endpoint: `/dispatch/:owner/:repo/:workflow_id`
- [ ] Validate required inputs server-side
- [ ] Call `actions.createWorkflowDispatch({owner, repo, workflow_id, ref, inputs})`
- [ ] Return success/error partial

## Deferred
- [ ] `environment` input type (rare — requires extra API call for repo environments)
- [ ] Link to triggered run (API returns 204, no run ID — would need polling)

## Lore

- GitHub dispatch API: `POST /repos/{owner}/{repo}/actions/workflows/{id}/dispatches`
- `ref` parameter is required — it's the branch/tag to run on
- Input values are always strings, even for booleans ("true"/"false")
- API returns 204 No Content on success (no run ID)
- `on` key in workflow YAML can be string, array, or object — handle all
- Contents API returns base64 `content` — `Buffer.from(content, 'base64')`

## Session Log

- **2026-04-01**: Created during planning session.
- **2026-04-01**: Switched from background YAML fetch to lazy fetch on click.
  Deferred environment input type and run linking.
