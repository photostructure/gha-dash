---
name: tpp
description: Work on a Technical Project Plan. Use when starting work on a TPP from _todo/, resuming a TPP, or when the user references a TPP file.
argument-hint: "[path-to-tpp]"
disable-model-invocation: false
allowed-tools: Bash, Read, Glob, Grep, Edit, Write, WebSearch, Skill
---

# Work on TPP

Make progress on the referenced Technical Project Plan.
Determine the current phase and take appropriate action.

## Required Reading First

Before any work, you MUST read these files (in order):

1. [CLAUDE.md](../../../CLAUDE.md) — project conventions and rules
2. [TPP-GUIDE.md](../../../docs/TPP-GUIDE.md) — how TPPs work, format, and lifecycle
3. [DESIGN-PRINCIPLES.md](../../../docs/DESIGN-PRINCIPLES.md) — Simple Design & Tidy First

**Design Principles TL;DR:**

- Four Rules (priority order): passes tests, reveals intention, no duplication, fewest elements
- Fail early and visibly — no bogus guardrails or silent defaults
- Keep tidyings in separate commits from behavior changes
- Reduce coupling; prefer explicit dependencies over hidden ones

## Process

1. **Read the TPP** from `_todo/` (path provided as `$ARGUMENTS`, or list available TPPs if none specified)
2. **Identify the current phase** from the checklist in the TPP
3. **Do the work** for that phase:
   - If in Research phase: read required files, explore the codebase, document findings in the TPP
   - If in Design phase: evaluate solutions, document tradeoffs, update the TPP
   - If in Implementation phase: write code, run tests, update task checklist
   - If in Verification phase: run all verification commands listed in the TPP
4. **Update the TPP** with:
   - Progress on tasks (check completed items)
   - New discoveries and gotchas added to the Lore section
   - Failed approaches documented (what you tried and why it didn't work)
   - Phase advancement if all items in current phase are complete
5. **Run verification** after implementation work (tests, linting, type checks as applicable)

## Phase Definitions

- [ ] **Research**: Read all required files, understand the problem space
- [ ] **Design**: Evaluate competing approaches, document tradeoffs
- [ ] **Implement**: Write the code, following the chosen solution
- [ ] **Test**: Write and run tests for the new code
- [ ] **Verify**: Run all project verification commands
- [ ] **Document**: Update relevant documentation
- [ ] **Review**: Self-review changes for quality and correctness
- [ ] **Complete**: All tasks done, move TPP to `_done/`

## Rules

- **Never skip the Required Reading step** — every session starts fresh
- **Update the TPP before ending** — your discoveries die with this session if you don't write them down
- **Document failed approaches** — save the next session from repeating your mistakes
- **Keep TPPs under 400 lines** — the Read tool truncates files over 500 lines
- When all tasks are complete, move the TPP from `_todo/` to `_done/` with `mv`
