---
name: review
description: Review code for potential issues and improvements. Use when asked to review specific files, functions, or code sections.
allowed-tools: Bash, Read, Glob, Grep, Edit, Write, WebSearch
---

# Code Review

Review the mentioned code for potential issues and improvements.

## Before you start

Study these project resources before reviewing:

- [CLAUDE.md](../../../CLAUDE.md) — project conventions, rate limit lore, gotchas
- [docs/DESIGN-PRINCIPLES.md](../../../docs/DESIGN-PRINCIPLES.md) — Four Rules of Simple Design + Tidy First
- [docs/ARCHITECTURE.md](../../../docs/ARCHITECTURE.md) — system overview, types, routes, security model
- [docs/TPP-GUIDE.md](../../../docs/TPP-GUIDE.md) — planning workflow; active TPPs in `_todo/`, completed in `_done/`
- Any relevant TPP in `_todo/` or `_done/` that explains the rationale for the code under review

**Only report verified bugs and design-principle violations grounded in concrete evidence.** Do NOT report:

- Subjective style or naming preferences not tied to DESIGN-PRINCIPLES.md
- Speculative future risks ("if someone later removes this guard...")
- Feature requests or suggestions disguised as issues
- Things you haven't proven with concrete evidence from the codebase
- Formatting issues — Prettier handles whitespace

For EVERY potential issue, you MUST complete these steps before reporting:

1. **Read the actual code** (not just the diff). Follow the full call chain
2. **Search for all callers/usages** to understand context
3. **Read any design docs or TPPs** that explain the rationale
4. **Construct a concrete failing scenario.** If you can't describe
   exactly how the bug manifests, it's not an issue
5. **Discard it** if your research shows it's intentional or already handled

**Use subagents liberally:**

- **Exploration**: When more than three files need review, or the code is
  complex, launch Explore subagents (one per file/area) to gather findings
- **Validation**: Before reporting ANY issue, launch a subagent to verify
  it. Have it trace the full call chain, search for guards/handlers you
  might have missed, and read relevant design docs. If the subagent can't
  confirm the bug, discard the issue
- **Iteration**: After your initial analysis, launch a second round of
  subagents to dig deeper into the most promising findings. Check edge
  cases, race conditions, and interaction effects between changed files

If you find zero real issues after thorough research, say "No issues found."
Do not pad the list.

## What to look for

**Correctness**

- Logic or implementation errors
- If correct but surprising, suggest a clearer equivalent or a comment
- Don't trust docs or implementation as authoritative. If they disagree,
  flag it, consider what you think is correct (it may be neither!), and
  explain your reasoning

### Project-specific priorities (always check)

These are the load-bearing concerns for gha-dash. Review any change touching
server, state, services, or routes against all four.

**1. Rate limit safety** (the most important operational concern)

GitHub allows 5000 requests/hour. Any new API call must be justified against
that budget.

- New Octokit calls: Is branch caching used? Is the call gated by
  `rateLimitFloor` (hard reserve floor) and `rateBudgetPct` (per-cycle soft
  cap)? See `src/state.ts` and `src/services/github.ts`
- Fresh cache skip: If disk cache is younger than the refresh interval,
  startup must skip the initial API fetch entirely
- Repo rotation: When budget-limited, different repos should refresh each
  cycle — not the same subset every time
- Pagination: `@octokit/rest` paginates unbounded by default. Cap explicitly
  for `/actions/runs` and similar high-cardinality endpoints

**2. Token exposure & localhost binding**

- `gh auth token` output must NEVER reach the browser. Grep for token leakage
  in API responses, error messages, logs, and exception stacks
- Server must bind to `127.0.0.1` only — never `0.0.0.0`
- Security headers (CSP, X-Frame-Options, etc.) must remain intact in
  `src/server.ts`
- Re-extraction on 401 must not cache stale Octokit instances across refreshes
  (see CLAUDE.md lore)

**3. Error propagation (no bogus guardrails)**

Per DESIGN-PRINCIPLES.md Rule 5:

- Silent `catch` blocks that only warn — errors should propagate unless there's
  a documented reason to swallow
- Invented defaults on failure ("if fetch fails, return empty array") that
  mislead callers into thinking data is authoritative
- Existence checks for data that should always exist by invariant — these
  hide bugs and mislead other programmers
- User-facing "friendly" fallbacks that mask actual failures

**4. Cache/state consistency**

- Stale-while-revalidate correctness in `src/services/cache.ts` — stale reads
  must not race with in-flight revalidation
- `refresh-preserves-data` invariant in `src/state.ts` — polls must not destroy
  cached data on transient API failures (there's a dedicated test for this)
- Vue reactive state: client polls must never destroy user UI state (collapse,
  sort, filter). The Vue reactive merge pattern is load-bearing — changes to
  `useWorkflows.ts` that replace-instead-of-merge are bugs
- Disk cache persistence: `~/.config/gha-dash/cache.json` schema changes need a
  migration story or invalidation

### GitHub API integration gotchas

- `run.name` from the API is unreliable — derive workflow names from `run.path`
  (e.g. `.github/workflows/build.yml` → "build"). `display_title` is shown as
  tooltip only. See CLAUDE.md "Gotchas / Lore"
- Octokit error handling: 401 triggers token re-extraction; 403 with
  `x-ratelimit-remaining: 0` means rate-limited (distinct from auth failure);
  404 on a repo usually means visibility change, not a bug
- `workflow_dispatch` YAML parsing: all `on:` syntax variants must be handled
  (string, array, object with dispatch key). See
  `src/services/__tests__/dispatch.test.ts`
- Checkbox inputs absent from POST body = unchecked. Dispatch route must
  explicitly set boolean inputs to `"false"` when missing

**Code quality (grounded in DESIGN-PRINCIPLES.md)**

Allowed, but only when grounded in a specific rule and backed by concrete
evidence. Cite the rule or tidying by name.

- **Rule 2 — Reveals intention**: Unclear names, structure that obscures the
  problem domain
- **Rule 3 — No duplication**: Repeated logic or knowledge across files (not
  incidental similarity)
- **Rule 4 — Fewest elements**: Speculative abstractions, dead code, unused
  exports (suggest deleting)
- **Rule 5 — No bogus guardrails**: see "Error propagation" above
- **Tidyings**: Comments that merely restate code (delete), missing guard
  clauses, magic numbers that want named constants, opportunities for
  Explaining Variables

Per CLAUDE.md: tidyings should be proposed as suggestions with their name and
rationale, not applied silently. Keep them separate from behavior changes.

**TypeScript / ESM conventions (from CLAUDE.md)**

- `??` (not `||`) for nullish coalescing
- `node:` prefix on all Node built-in imports
- Static imports at top of file — no dynamic `await import(...)` for built-ins
- Relative imports use `.js` extension (ESM requirement)

**Security**

- Injection vulnerabilities (command injection via `execSync`, path traversal
  in config/cache file handling)
- Improper handling of untrusted input from GitHub API responses (commit
  messages, branch names, workflow names — treat as untrusted)
- CSP or security header regressions in `src/server.ts`

**Testing gaps**

- New Octokit calls without corresponding msw intercepts in
  `github-api.test.ts`
- New API routes without supertest coverage in `routes.test.ts`
- Changes to `src/state.ts` without coverage in `state.test.ts` — especially
  anything touching refresh, cache prune, delete, or the
  `refresh-preserves-data` invariant
- New YAML parsing paths without coverage in `dispatch.test.ts`
- Cross-platform config tests must stub both `XDG_CONFIG_HOME` and `APPDATA`

## Response format

1. Completely omit any issues that are irrelevant after research and analysis.
2. Sort remaining issues by severity (Critical > High > Medium > Low).

For each issue use a short ID (e.g. `#A`, `#B`) and include:

- **Priority**: Critical / High / Medium / Low
- **Problem**: What's wrong, why, and the concrete scenario where it fails
- **Proof**: The specific code path or test that demonstrates the bug
- **Solution**: A concrete fix
- **Location**: File and line reference (use `path/to/file.ts:42` format)

Emit detailed findings, and then use `AskUserQuestion` with checkboxes for each
item so the user can accept, veto, or comment on each one individually.
