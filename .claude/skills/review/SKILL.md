---
name: review
description: Review code for potential issues and improvements. Use when asked to review specific files, functions, or code sections.
allowed-tools: Bash, Read, Glob, Grep, Edit, Write, WebSearch
---

# Code Review

Review the mentioned code for potential issues and improvements.

## Before you start

Study these project resources before reviewing:

- `CLAUDE.md` (project conventions and guidelines)
- `docs/DESIGN-PRINCIPLES.md` (Simple Design & Tidy First)
- `.claude/settings.json` (project tool and permission settings)

**Only report verified bugs, things that are actually wrong.** Do NOT report:

- Style, organization, or naming preferences
- Speculative future risks ("if someone later removes this guard...")
- Feature requests or suggestions disguised as issues
- Things you haven't proven with concrete evidence from the codebase

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

**GitHub Actions specific**

- Workflow YAML syntax errors or deprecated action versions
- Missing or incorrect permissions blocks
- Secrets or tokens exposed in logs or outputs
- Race conditions in concurrent workflow runs
- Inefficient caching or unnecessary workflow triggers

**Code quality (per `docs/DESIGN-PRINCIPLES.md`)**

- **Rule 2 — Reveals intention**: Unclear names, structure that obscures the problem domain
- **Rule 3 — No duplication**: Repeated logic or knowledge across files
- **Rule 4 — Fewest elements**: Speculative abstractions, unused code (suggest deleting)
- **Rule 5 — No bogus guardrails**: Silent error swallowing, invented defaults on failure, unnecessary existence checks
- **Tidyings**: Comments that restate code (delete), missing guard clauses, magic numbers without named constants

**Security**

- Injection vulnerabilities (command injection, script injection in workflows)
- Improper handling of untrusted input (especially from PRs/forks)
- Overly broad permissions or token scopes

**Testing gaps**

- Missing coverage for critical paths or edge cases

## Response format

1. Completely omit any issues that are irrelevant after research and analysis.
2. Sort remaining issues by severity (Critical > High > Medium > Low).

For each issue use a short ID (e.g. `#A`, `#B`) and include:

- **Priority**: Critical / High / Medium / Low
- **Problem**: What's wrong, why, and the concrete scenario where it fails
- **Proof**: The specific code path or test that demonstrates the bug
- **Solution**: A concrete fix
- **Location**: File and line reference

Emit detailed findings, and then use `AskUserQuestion` with checkboxes for each item so the user can
accept, veto, or comment on each one individually.
