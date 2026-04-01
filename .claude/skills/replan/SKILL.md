---
name: replan
description: Iterative deep planning with critiques and alternatives. Use when facing complex design decisions requiring thorough analysis.
allowed-tools: Read, Glob, Grep, WebSearch
---

# Replan

You are going to **replan** - an iterative process of designing, critiquing, and refining a plan.

## Required Reading First

Before planning, read and internalize the project's documentation:

- **CLAUDE.md** (project root) - coding conventions, project structure, and development workflow
- Any architecture docs in `.claude/` or `docs/` directories
- README.md for project overview and goals

If any of these files don't exist yet, note that and proceed with what's available. As this project grows, revisit this section to ensure new documentation is consulted.

## Process

### 1. Understand & Clarify

- Read relevant code, documentation, and constraints
- State any assumptions you're making
- Ask clarifying questions before proceeding

### 2. Initial Plan

Design your first approach, considering requirements and existing solutions.

### 3. Critique

Generate thorough critiques of your plan:

**General engineering:**
- Does it balance simplicity with good engineering?
- Is it maintainable, testable, DRY, scalable?
- Scrutinize for "hand-wavy" aspects - don't assume how things work, study the code
- For novel libraries/APIs, validate with web searches
- Note uncertainties as risks

**Project-specific concerns (gha-dash):**
- **Dashboard performance**: Will this approach keep the dashboard responsive? Consider data fetching strategies, rendering performance, and caching.
- **GitHub API efficiency**: Are we minimizing API calls? Are we respecting rate limits? Could we batch or cache requests?
- **Data freshness vs. cost**: Are we striking the right balance between up-to-date data and API/compute costs?
- **Security**: Are GitHub tokens and credentials handled safely? Are we following least-privilege for API scopes?
- **User experience**: Is the interface intuitive for developers who use GitHub Actions daily? Does it surface the most important information first?
- **Extensibility**: Can this be extended to support additional GitHub Actions features without major refactoring?

### 4. Alternatives

Brainstorm alternatives based on critiques. Goals:

- Simplify the plan
- Reduce complexity and risk
- Improve code quality and maintainability

### 5. Develop Best Alternative

Select the most promising alternative and develop it fully.

### 6. Iterate

Repeat steps 3-5 at least **three times**, asking for user feedback at each iteration.

### 7. Final Plan

Assemble the best features from all iterations into a robust final plan.

## Output Format

For each iteration, present options with pros/cons:

### Option A: [Name]

[Description]

**Pros:** ...
**Cons:** ...
**Risks:** ...

### Recommendation

[Which option and why]

## Design Principles (TL;DR of `docs/DESIGN-PRINCIPLES.md`)

**Four Rules of Simple Design** (in priority order):
1. **Passes the tests** — working code beats everything
2. **Reveals intention** — clear names, structure matches the problem domain
3. **No duplication** — eliminate repeated logic and knowledge
4. **Fewest elements** — remove anything that doesn't serve rules 1-3
5. **No bogus guardrails** — fail early and visibly; never silently swallow errors or invent defaults

**Tidy First methodology:**
- Small structural changes (guard clauses, explaining variables, extract helper, etc.) that don't alter behavior
- Keep tidyings in **separate commits** from behavior changes
- Tidy only enough to make the next behavior change easier — not a refactoring sprint
- Reduce coupling; prefer explicit dependencies over hidden ones

**When evaluating plans, watch for:**
- Over-engineering and speculative abstractions (Rule 4)
- Missing error handling strategy — should errors propagate or be caught? (Rule 5)
- Hidden coupling between components
- Premature optimization vs. premature abstraction
- Be honest about tradeoffs; ask questions — don't guess
