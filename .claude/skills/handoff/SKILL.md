---
name: handoff
description: Update TPP for engineer handoff when context is running low or session is ending.
disable-model-invocation: false
allowed-tools: Read, Edit, Write, Glob
---

# TPP Handoff

We're running low on context or ending this session. Time to hand off cleanly.

## Required Reading First

Before any work, you MUST read these files (in order):

1. [CLAUDE.md](../../../CLAUDE.md) — project conventions and rules
2. [TPP-GUIDE.md](../../../docs/TPP-GUIDE.md) — how TPPs work, format, and lifecycle

## Your Task

Find the active TPP in `_todo/` and update it so the next session can pick up
exactly where we left off. This is critical — anything not written down is lost.

### Steps

1. **Re-read the TPP** to understand what was planned
2. **Update the phase checklist** — mark completed phases, set the current one
3. **Check off completed tasks** in the Tasks section
4. **Add to the Lore section** with anything discovered this session:
   - Non-obvious behaviors or gotchas
   - Relevant functions, files, or code patterns found
   - Environment or configuration details that matter
5. **Document failed approaches** — what was tried, why it failed, and what to do instead
6. **Clarify what remains** — be specific about the next concrete step
7. **Note any blockers** — open questions, missing information, external dependencies

### What Good Handoff Looks Like

The next session should be able to:
- Understand the current state without re-reading the entire codebase
- Know exactly which step to start on
- Avoid repeating any failed approaches
- Find all relevant files and functions without searching

### Rules

- **Be specific, not vague** — "Fix the auth bug" is bad; "The JWT validation in src/auth.ts:42 rejects valid tokens when the clock skew exceeds 30s — see issue #123" is good
- **Keep TPPs under 400 lines** — summarize if needed, but don't lose critical details
- **Don't mark tasks complete unless they actually are** — partial progress should be noted as such
