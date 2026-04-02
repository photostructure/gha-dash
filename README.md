# gha-dash

Local web dashboard for GitHub Actions. See workflow status across all your repos at a glance.

**Only prerequisite:** an authenticated [`gh` CLI](https://cli.github.com/).

```
npx gha-dash
```

## What it does

- Shows workflow runs in a sortable, searchable table grouped by repo
- Auto-refreshes every 5 minutes via background polling
- Filter to failures only with one click
- Trigger `workflow_dispatch` workflows with typed input forms
- Works immediately — discovers your repos on first run, no config needed

## Screenshot

*(coming soon)*

## CLI options

```
npx gha-dash              # start on default port (3131)
npx gha-dash --port 8080  # custom port
npx gha-dash --no-open    # don't auto-open browser
```

## Configuration

Config lives at `~/.config/gha-dash/config.json` (Linux/macOS) or `%APPDATA%/gha-dash/config.json` (Windows).

```json
{
  "repos": ["owner/repo", "org/other-repo"],
  "refreshInterval": 300,
  "lookbackDays": 7,
  "rateLimitFloor": 500,
  "rateBudgetPct": 50,
  "port": 3131
}
```

| Field | Default | Description |
|-------|---------|-------------|
| `repos` | `[]` | Repos to monitor. Empty = discover all your repos. |
| `refreshInterval` | `300` | Seconds between API refreshes. |
| `lookbackDays` | `7` | Ignore workflow runs older than this. |
| `rateLimitFloor` | `500` | Stop refreshing when API calls remaining drops below this. |
| `rateBudgetPct` | `50` | Max percentage of rate limit to use per refresh cycle. |
| `port` | `3131` | Server port. |

Use the Settings page to add/remove repos interactively.

## Rate limiting

gha-dash caches aggressively to stay within GitHub's 5,000 requests/hour limit:

- Default branch names are cached permanently (fetched once per repo)
- Workflow data is cached to disk — restarts don't refetch
- Refreshes skip entirely when remaining calls are below the floor
- When budget is tight, repos are refreshed in rotating batches

## Development

```
git clone https://github.com/photostructure/gha-dash
cd gha-dash
npm install
npm run dev       # starts with hot reload
npm test          # 52 tests (vitest + msw)
npm run build     # bundle to dist/
```

## License

Apache-2.0
