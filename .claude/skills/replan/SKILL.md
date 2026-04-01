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

## Design Principles

Follow `docs/DESIGN-PRINCIPLES.md` — Simple Design & Tidy First. Key points:

- Four Rules: passes tests, reveals intention, no duplication, fewest elements
- Fail early and visibly — no bogus guardrails or silent defaults
- Keep tidyings in separate commits from behavior changes
- Reduce coupling; prefer explicit dependencies over hidden ones
- Be honest about tradeoffs
- Ask questions — don't guess
- Prefer well-established libraries and patterns over custom solutions
- Optimize for developer experience — this is a tool for developers
