---
name: gitplan
description: "Review and plan focused git commits from tangled changes"
disable-model-invocation: false
allowed-tools: Bash, Read, Glob, Grep, Edit, Write, WebSearch, Skill
---

**Don't invoke this skill if we're just reviewing a couple files. This skill is ONLY applicable when untangling 15+ files with multiple inter-twingled edits.**

# Review and plan git commits

**Never create megacommits.** Each commit should be focused, coherent, and reviewable.

Work through changes in layer order:

1. `src/types.ts` — shared types
2. `src/services/` — backend services (github, cache, config, dispatch, workflows)
3. `src/state.ts`, `src/routes/` — server state and API routes
4. `src/client/composables/` — Vue composables
5. `src/client/components/`, `src/client/views/` — Vue UI components
6. `src/client/public/style.css` — CSS
7. Tests (`src/services/__tests__/`)
8. Docs, config, TPPs

## Workflow

### Phase 1: Identify Themes

1. Scan all current changes with `git status` and `git diff --stat` — use haiku subagents to preserve context and give summaries.
2. For complex diffs, use `git diff -U150` but limit JSON/package-lock to first ~50 lines.
3. Identify logical themes/groupings. Each theme must have a **single coherent purpose** — a unifying "why" that explains every file in the group. If you can't state the purpose in one sentence without using "and", split the theme. **Never create catch-all buckets** like "housekeeping", "misc", "cleanup", or "various fixes". Every file belongs in a theme because of what it _does_, not because it's small or doesn't fit elsewhere. Orphan files that truly don't relate to any theme get their own single-file commit.
4. **Bundle TPPs with their code changes.** Scan `_todo/`, `_soon/`, and `_done/` for TPP files related to each theme. TPPs MUST be committed alongside their corresponding code — never lumped into a separate "docs" commit. If a TPP doesn't correspond to any code changes, it can go in a docs-only commit.
5. Present the themes to the user as a numbered list with brief descriptions. Order by increasing complexity/risk. Show which TPP(s) belong to each theme.
6. Ask: "Which theme should we focus on first?"

### Phase 2: Stage, Review, and Commit (per theme)

1. Stage only files belonging to the selected theme using `git add <files>`.
   - **CRITICAL: Include the theme's TPP file(s)** from `_todo/`, `_soon/`, or `_done/` in the same commit as the code they describe. This was decided in Phase 1 — do not skip it here.
2. Run the `/rgs` skill to review the staged changes. Use Opus (not haiku) for reviews — reviews are important.
3. If issues are found:
   - Present them clearly with priority, problem, and proposed fix.
   - Apply fixes incrementally, re-staging as needed.
   - Re-run `/review` until clean.
4. Present the proposed commit message and ask for approval. When the user approves, commit immediately — no second confirmation.
   - **Commit messages drive the changelog.** The body should describe user-facing behavior changes (what users will see/experience), not just implementation details. Lead with the "what changed for users" — implementation notes are secondary.

### Phase 3: Repeat

1. Check `git status` for remaining changes.
2. If more changes exist, return to Phase 1 and pick the next theme.
3. Continue until all changes are committed or user stops.

## Review Guidelines

Review the mentioned code for potential issues and improvements. Follow all guidelines in the root `CLAUDE.md`.

## Review Focus

### Critical Issues First

- Logic errors, security vulnerabilities, performance problems
- Breaking changes or API compatibility issues
- Resource leaks (memory, file handles, database connections)

### Code Quality

- Adherence to TypeScript rules and error handling patterns (see `CLAUDE.md` in the project root)
- Anti-patterns: hardcoded paths, magic numbers, tight coupling

### Testing & Documentation

- Test coverage for critical paths and edge cases
- Documentation accuracy and completeness

## Response Format

For each issue:

- **Priority**: Critical/High/Medium/Low
- **Code**: Quote specific problematic code
- **Problem**: Clear explanation of the issue
- **Solution**: Concrete fix or improvement suggestion
- **Context**: File/line reference for easy navigation

For documentation or trivial implementation issues, suggest the edit to the user and apply if they accept.

For other issues, provide a unique identifier for each issue (e.g. #A or #B), a summary, location, and proposed solution. Ask the user and apply if they accept.
