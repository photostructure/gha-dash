# UI/UX Feature Specification

Reference for feature parity during frontend rewrites. Every feature listed
here must be present in any new frontend implementation.

## Dashboard Page (`/`)

### Layout
- Header: app name (link to `/`), rate limit badge, Refresh All button, Settings link
- Toolbar: search text field, "Failures only" checkbox, Expand/Collapse buttons
- Workflow table: grouped by repo, sortable columns
- Error banner: collapsible, dismissable, deduplicates identical errors

### Workflow Table
- **Grouped by repo**: each repo has a header row spanning all columns
- **Repo header**: shows `owner/repo`, per-repo refresh button, error badge if applicable
- **Collapsible**: click repo header to collapse/expand its workflow rows
- **Collapse state persisted** to localStorage, survives page reloads and data refreshes
- **Columns**: Workflow, Branch, Status, Commit, Message, Started, Duration, Actions

### Column Details
| Column | Content | Link target |
|--------|---------|-------------|
| Workflow | Filename from workflow path (e.g. "build") | Workflow page on GitHub (`/actions/workflows/{file}`) |
| Branch | `<code>` formatted branch name | — |
| Status | Color-coded badge (green/yellow/red/grey) + text | — |
| Commit | Short SHA in `<code>` | — |
| Message | `display_title` from run, truncated with ellipsis | Specific run on GitHub (`/actions/runs/{id}`) |
| Started | Relative time ("3m ago"), full datetime on hover | — |
| Duration | Smart format: "2m 30s" not "0h 2m 30s" | — |
| Actions | Dispatch (▶) button per workflow row | — |

### Sorting
- Click column headers: Workflow, Branch, Status, Started, Duration
- Sorts within repo groups (repo grouping preserved)
- Active sort shown with ▲/▼ indicator
- Default: Started descending (newest first)
- Dispatch detail rows stay attached to their workflow row

### Filtering
- **Search**: text field filters all visible rows by substring match
- **Failures only**: checkbox hides passing workflows, auto-hides empty repo groups
- Expand/Collapse clears the Failures-only checkbox

### Refresh
- **Global refresh** (header button): fetches all repos, updates table + rate limit
- **Per-repo refresh** (repo header button): fetches single repo, updates cache
- Both show CSS spinner while in flight
- Data refresh must NOT destroy collapse/sort/filter state

### Rate Limit Badge
- Shows `API: remaining/limit` in header
- Color: green (>50%), yellow (20-50%), red (<20%)
- Tooltip shows timestamp of last check

### Error Banner
- Shows at top of dashboard when repos have errors
- Deduplicates: if 100 repos have the same error, shows "100 repos: [error]"
- Dismiss button (×) removes the banner
- Per-repo errors also shown as badge on repo header row

### Auto-Refresh
- Background poll every N seconds (configurable, default 30s client-side poll)
- Must preserve all client-side state (collapse, sort, filter)

## Settings Page (`/settings`)

### Layout
- Header: app name, "← Dashboard" link (NOT settings link on this page)
- Sticky header with Save button
- Two collapsible sections: Repos and General

### Repos Section
- Table of all available repos with columns: ✓ (checkbox), Owner, Repo
- All three columns sortable (click header)
- Search/filter text field above table
- Checkbox helpers: All, None, Invert (operate on visible/filtered rows only)
- Selected repos checked, unselected unchecked

### General Section
- Refresh interval (seconds, number input)
- Rate limit floor (number input, with help text)
- Rate budget per cycle (%, number input, with help text)
- Port (number input, "takes effect on next restart")
- Hidden workflows (comma-separated text, with help text about substring matching)

### Save Behavior
- Single form submission saves both repos and general settings
- Redirects to dashboard after save
- Deselected repos pruned from cache

## Dispatch (from workflow row)

### Trigger
- ▶ button in Actions column of each workflow row
- Clicking loads dispatch form inline (detail row below the workflow row)

### Form
- Branch/tag text input, defaults to repo's default branch
- Typed inputs based on workflow YAML:
  - `string` → text input with default
  - `choice` → select dropdown with options
  - `boolean` → checkbox
- Required fields marked with * and `aria-required`
- Input descriptions shown as help text
- Cancel button removes the form

### Feedback
- Success: green box with message + link to workflow runs page on GitHub
- Error: red box with contextual message (403 = permission, 422 = validation)

## Accessibility
- Semantic `<table>` with `<th scope="col">`
- Status badges: color + text (not color alone)
- `aria-label` on status badges and action buttons
- `aria-expanded` on collapsible repo headers
- Keyboard navigable: repo headers focusable, Enter/Space to toggle
- Form labels associated with inputs, `aria-required` on required fields

## Dark Mode
- Automatic via `prefers-color-scheme: dark`
- CSS custom properties for all colors
- Both light and dark themes fully styled

## CLI
- `npx gha-dash` — start server, auto-open browser
- `--port N` / `-p N` — override port
- `--no-open` — don't auto-open browser
- Graceful shutdown on SIGINT/SIGTERM
- Startup banner: "gha-dash running at http://localhost:PORT"
