# Technical Project Plans (TPPs)

TPPs are structured handoff documents that preserve context between Claude Code
sessions. Every session is temporary — without a TPP, discoveries, design
decisions, and rejected approaches are lost when the session ends.

## Why TPPs exist

Claude Code's built-in context features have documented failure modes:

- **`/compact`** loses important details, subtleties, and pivotal design decisions
- **`MEMORY.md`** is write-only documentation that Claude rarely references meaningfully; only the first ~200 lines load into the system prompt
- **Plan files** capture conclusions but lack handoff information like success criteria, prerequisite files, and gotchas

TPPs solve these by providing a human-curated, structured format that the next
session reads in full before starting work.

## File format

TPPs live in `_todo/` with date-prefixed filenames:

```
_todo/20260401-add-workflow-dashboard.md
```

When complete, they move to `_done/`:

```
_done/20260401-add-workflow-dashboard.md
```

## TPP template

```markdown
# TPP: [Short descriptive title]

## Summary

[Problem description — what needs to be done and why. Under 10 lines.]

## Current Phase

- [ ] Research
- [ ] Design
- [ ] Implement
- [ ] Test
- [ ] Verify
- [ ] Document
- [ ] Review
- [x] Complete

## Required Reading

[Files that MUST be read before starting work on this TPP.]

- `path/to/critical-file.ts` — why this file matters
- `path/to/another-file.ts` — what to look for here

## Description

[Detailed context about the problem and constraints. Under 20 lines.]

## Lore

[Non-obvious details, gotchas, and important discoveries.]

- [Discovery or gotcha with specific file:line references]
- [Important behavior that isn't documented elsewhere]

## Solutions

### Option A: [Name]

[Description, pros, cons]

### Option B: [Name]

[Description, pros, cons]

**Chosen:** [Which option and why]

## Tasks

- [ ] Task 1 — `verification command if applicable`
- [ ] Task 2
- [ ] Task 3

## Failed Approaches

[What was tried and didn't work, with specific details about why.]

## Session Log

[Brief notes from each session that worked on this TPP.]

- **YYYY-MM-DD**: [What was accomplished, what was discovered]
```

## Rules

1. **Keep TPPs under 400 lines** — Claude's Read tool quietly truncates files
   over 500 lines. Maintain a buffer.
2. **One TPP per feature/bug** — don't combine unrelated work.
3. **Update before ending** — run `/handoff` before your session ends.
4. **Be specific** — include file paths, line numbers, error messages.
   "Fix the bug" is useless. "The validation in `src/auth.ts:42` rejects
   valid tokens when the issuer has a trailing slash" is useful.
5. **Document failures** — save the next session from repeating mistakes.
6. **Move to `_done/` when complete** — don't delete TPPs. They provide
   institutional memory for future work on related features.

## Workflow

1. **Starting a new task**: Create a TPP in `_todo/` using the template above
2. **Working on a task**: Run `/tpp _todo/YYYY-MM-DD-feature-name.md`
3. **Ending a session**: Run `/handoff` to update the TPP for the next session
4. **Completing a task**: Move the TPP to `_done/`

## Validation

For complex TPPs, run a validation pass with a different model than the one
that created it. Frame it as reviewing work from a junior engineer to encourage
critical evaluation rather than rubber-stamping.
