# Design Principles: Simple Design & Tidy First

**Author:** Kent Beck | **Core Philosophy:** Software design is an exercise in human relationships

---

## Overview

This document combines Kent Beck's **Four Rules of Simple Design** with his **Tidy First** methodology. Together, they provide objective criteria for evaluating code design and a practical approach to improving code through small, safe structural changes.

**Key Formula:** Cost(software) ~ coupling

---

## Part 1: Four Rules of Simple Design

These rules provide objective criteria for evaluating code design. They're in priority order -- higher rules take precedence over lower ones when they conflict.

### Rule 1: Passes the Tests

**The code must work as intended.**

- All functionality proven through automated tests
- Nothing else matters if the system behaves incorrectly
- Tests provide confidence to refactor and improve design
- Avoid tests that only verify implementation details -- tests should assert correct behavior

**Example**: Before optimizing the cache refresh logic, ensure tests prove correctness across concurrent refresh scenarios and rate limit edge cases.

**Pitfall**: Don't skip tests for "simple" changes -- GitHub API responses have many edge cases (pagination, rate limits, missing fields).

### Rule 2: Reveals Intention

**Code should clearly express what it does and why.**

- Use descriptive names for variables, functions, and types
- Structure code to match the problem domain
- Prioritize readability for future maintainers

**Example**:

```typescript
// Poor intention
async function proc(d: any[]): Promise<any[]> { ... }

// Clear intention
async function fetchLatestRunPerWorkflow(repos: RepoConfig[]): Promise<WorkflowRun[]> { ... }
```

**Pitfall**: Don't sacrifice clarity for brevity -- `fetchLatestRunPerWorkflow` is better than `fetchRuns`.

### Rule 3: No Duplication

**Eliminate repeated logic and knowledge.**

- Look for both obvious code duplication and hidden duplication
- Hidden duplication includes parallel data structures and repeated concepts

**Example**: If multiple route handlers extract `owner` and `repo` from params and validate them, extract that into shared middleware rather than repeating it in every handler.

**Pitfall**: Don't create premature abstractions -- sometimes temporary duplication is acceptable while understanding emerges.

### Rule 4: Fewest Elements

**Remove anything that doesn't serve the first three rules.**

- Avoid classes, methods, and abstractions added for speculative future needs
- Prefer simple solutions over architecturally complex ones
- Delete unused code ruthlessly

**Example**: Don't build a plugin system for data providers until you have concrete evidence you need sources beyond the GitHub API.

**Pitfall**: Don't over-apply this rule -- necessary complexity is still necessary.

### Rule 5: No Bogus Guardrails or Defaults

When key assumptions that your code relies upon to work appear to be broken, fail early and visibly, rather than attempting to patch things up. In particular:

- Lean towards propagating errors up to callers, instead of silently "warning" about them inside of try/catch blocks.
- If you are fairly certain data should always exist, assume it does, rather than producing code with unnecessary guardrails or existence checks (esp. if such checks might mislead other programmers)
- Never use 'defaults' as a result of errors, either for users, or downstream callers.

### Priority and Conflicts

**When rules conflict, higher numbers win:**

- Working code (Rule 1) beats everything
- Clear names (Rule 2) and no duplication (Rule 3) often reinforce each other
- The "duplication vs clarity" debate misses the point -- both improve together over time

**Common conflict**: During refactoring, you might temporarily duplicate code to pass tests, then eliminate duplication while improving names.

**Exception**: In test code, empathy for readers sometimes trumps technical purity.

---

## Part 2: The Tidyings

Small structural changes that don't alter behavior but improve readability and maintainability.

### Guard Clauses

Move error handling to function tops, return early. Flattens nesting, clarifies happy path.

```
if not valid: return error
if not authorized: return error
# main logic here (not nested)
```

### Dead Code

Delete unused code: commented code, unreachable branches, unused functions. Trust version control.

### Normalize Symmetries

Make similar code look similar. Differences should signal behavioral differences, not arbitrary style.

### New Interface, Old Implementation

Create cleaner interfaces while keeping old implementation. Enables gradual migration.

### Reading Order

Arrange code top-to-bottom in execution order. Helper functions after callers when possible.

### Cohesion Order

Group related code together. Code that changes together should live together.

### Move Declaration and Initialization Together

Declare variables near first use, initialize immediately. Reduces mental scope tracking.

### Explaining Variables

Extract complex expressions into named variables. Names explain meaning, not just computation.

```typescript
const hasActiveRuns = runs.some(r => r.status === "in_progress" || r.status === "queued");
if (hasActiveRuns) {
  // use shorter poll interval
}
```

### Explaining Constants

Replace magic numbers with named constants. `POLL_INTERVAL_MS = 30_000` beats `30000`.

### Explicit Parameters

Pass dependencies as parameters rather than using globals. Makes dependencies visible and testable.

### Chunk Statements

Use blank lines to group related statements. Simplest tidying, often underused.

### Extract Helper

Move obvious, limited-purpose code into named functions. Name is often more valuable than reuse.

### One Pile

Sometimes inline code to understand it before reorganizing. Separation can obscure understanding.

### Explaining Comments

Add comments explaining _why_, not _what_. Explain intent, constraints, non-obvious reasons.

**Especially valuable:**

- **Architectural decisions**: Why this approach was chosen over alternatives
- **Historical notes**: What was tried and why it failed (prevents repeating mistakes)
- **Non-obvious constraints**: Requirements that aren't clear from the code alone
- **Performance trade-offs**: Why we chose X over Y for speed/memory/correctness
- **Lessons learned**: "We used to do X but it caused Y, so now we do Z"

**Examples of good explaining comments:**

```typescript
// We fetch all runs in a single API call per repo rather than per-workflow.
// The /actions/runs endpoint returns runs across all workflows, and we
// deduplicate by workflow_id client-side. This keeps us well within rate
// limits even with 50+ repos.
```

```typescript
// IMPORTANT: gh auth token can return tokens that expire. We re-extract
// every 30 minutes. Don't cache the Octokit instance across refreshes --
// create a new one each time with the fresh token.
```

These comments save future engineers from re-discovering problems through painful experience.

### Delete Redundant Comments

Remove comments that restate code. They add noise and go stale.

**Examples of redundant comments to delete:**

```typescript
// Bad: Restates the obvious
const total = a + b; // Add a and b
items.push(item); // Push item to array
return undefined; // Return undefined
```

**When in doubt:** If the comment explains reasoning, constraints, or lessons learned -- keep it. If it just describes what the code literally does -- delete it.

---

## Part 3: Managing Tidyings

### When to Tidy: The Decision Framework

**Tidy First** when tidying makes behavior change significantly easier (minutes to hours of work).

**Tidy After** when the behavior change clarifies what structure is needed.

**Tidy Later** when code changes infrequently or tidying needs dedicated time.

**Tidy Never** for legacy code that rarely changes or is scheduled for replacement.

**Economic Reality:** You can't tidy everything. Choose based on ROI.

### Separate Tidying

**Critical Rule:** Keep tidyings in separate commits/PRs from behavior changes.

**Benefits:**

- Easier review (focus on one type of change)
- Easier to understand and revert
- Reduces cognitive load

### Batch Sizes

Tidy in small batches, frequently. Not refactoring sprints.

**Time limit:** >1 hour tidying before behavior changes means you've lost focus on minimum necessary.

### Getting Untangled

When tidying reveals more mess:

1. Stop
2. Commit what you have
3. Assess minimum tidying needed
4. Do only that
5. Save rest for later

**Self-care:** You don't have to fix everything you see.

---

## Part 4: Theory

### Structure vs. Behavior

**Behavior changes:** What software does (features, fixes)
**Structure changes:** How code is organized (tidyings)

Structure changes today make behavior changes tomorrow cheaper.

### Coupling

Elements are coupled when changes to one require changes to another.

**Types:**

- Direct (A calls B)
- Indirect (A and B depend on C)
- Temporal (A must run before B)
- Conceptual (understanding A requires understanding B)

**To reduce software cost, reduce coupling.** But only focus on coupling for changes that actually happen.

**Prefer explicit coupling over hidden coupling.** Direct method calls are better than EventEmitter patterns:

- EventEmitter subscriptions create invisible dependencies that break silently when refactored
- Direct calls are compile-time checked and traceable
- When components are designed to work together, tight coupling is expected and appropriate

**Exception:** Broadcast events (e.g., cache invalidation) where multiple independent components need notification without knowing about each other.

### Cohesion

Elements are cohesive when they belong together. High cohesion = strongly related pieces.

Sometimes better cohesion helps you live with coupling. Don't break cohesive units just to reduce coupling.

### Reversibility

Most design decisions are reversible. Therefore:

- Cost of mistakes is low
- Don't over-invest in avoiding mistakes
- Experimentation is cheap

**Exceptions:** Public APIs, data formats, config file schemas (sometimes).

### Chesterton's Fence

**Understand prior decisions before changing them -- but don't be paralyzed.**

- If something seems odd/complex: understand WHY before removing
- If you find a better approach that handles all known edge cases: use it
- Prior analysis shows what was tried and why it failed -- learn from it, then improve
- Document your reasoning when you deviate from prior plans

_"Each line of code was (probably) written for a reason -- understand the context, then make it better."_

---

## Part 5: Practical Application

### Daily Practice

**Before a task:**

1. Read code to modify
2. Note tidyings that would ease your change
3. Do minimum tidyings (5-30 min)
4. Make behavior change

**After task:** Do quick tidyings that change enabled; note others for later.

**Commit strategy:** Separate tidying commits from behavior commits.

### Economic Decision Making

**Frequency:** High change frequency -> tidy it | Low -> maybe skip
**Impact:** Significant improvement -> do it | Marginal -> maybe skip
**Cost:** Minutes -> probably do it | Hours -> consider | Days -> plan separately
**Risk:** Very confident -> proceed | Uncertain -> tidy after instead

**Formula:** Tidy First If: (Value of easier change) > (Cost of tidying now)

---

## For Claude Code

### Transparency: Always Tell the User

**When applying any tidying, explicitly state which one and why.** The user should be able to validate and agree or disagree with each structural change.

Example: "I'm applying the **Guard Clauses Tidying** here to flatten the nesting and clarify the happy path. Does this look right?"

**Collaborate, don't dictate.** Tidyings are suggestions based on these principles -- the user has final say. If they prefer the original structure, respect that.

### When to Propose Tidyings

- **Before behavior changes:** "I notice this function could benefit from **Explaining Variables** -- want me to extract that complex condition first?"
- **During code review:** "This would be cleaner with **Extract Helper**. Should I refactor?"
- **After completing a task:** "Now that the feature works, I could apply **Cohesion Order** to group these related functions. Worth doing?"

### Generating New Code

When writing new code, apply these by default (no need to ask):

- **Guard Clauses**
- **Explaining Variables** and **Explaining Constants**
- **Chunk Statements**
- Meaningful names that reveal intent

### Refactoring Existing Code

Always ask before applying:

- **Extract Helper**
- **One Pile** -- inlining to understand
- **Reading Order** and **Cohesion Order**
- **Dead Code** and **Delete Redundant Comments**

**Think about readers:**

- Future developers
- Code reviewers
- The person debugging at 2 AM

---

## Quick Reference

Use this checklist during code review:

- **Tests pass**: All functionality verified
- **Clear intent**: Names and structure express purpose
- **No duplication**: Logic appears in exactly one place
- **Minimal elements**: No unused or speculative code
- **Fail visibly**: No bogus guardrails or silent defaults

---

## Key Quotes

- "Software design is an exercise in human relationships."
- "Coupling, like the Lego piece in the night, often isn't obvious until you step on it."
- "You can't be your best self if you're always rushing, always changing painful code."
- "Cost(software) ~ coupling"
- "Make decisions reversible."
- "Tidy first? Likely yes. Just enough. You're worth it."
