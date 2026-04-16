---
name: changelog
description: Generate a changelog entry from conventional commits since the last release tag. Determines semver bump automatically or accepts an override (e.g., /changelog minor).
argument-hint: "[patch|minor|major]"
allowed-tools: Bash(git *), Read, Edit, Glob, Grep
---

# Changelog

Generate a new CHANGELOG.md entry from conventional commits since the last
release tag.

## Required Reading

Read [CLAUDE.md](../../../CLAUDE.md) before writing — especially the
Conventions and Workflow sections.

## Live context

- Latest tag: !`git describe --tags --abbrev=0`
- Recent commits: !`git log -20 --oneline`

## Workflow

### 1. Find the last release

```bash
git tag --sort=-v:refname | head -1
```

Strip the `v` prefix to get `CURRENT_VERSION`.

### 2. Collect commits

Get full commit bodies (needed for `BREAKING CHANGE` and `Reported-by:`):

```bash
git log <tag>..HEAD --format='---COMMIT---%n%H%n%s%n%b' --reverse
```

### 3. Parse and classify

Parse each subject as `type(scope): description`.

**Skip entirely:**
- `chore(release)` — release automation
- Merge commits
- `docs`-only, `style`-only, `ci`-only, `test`-only, `build`-only,
  `chore`-only — unless the change is user-facing

**Changelog sections:**

| Type | Section | Bump |
|---|---|---|
| `feat` | Features | minor |
| `fix`, `perf` | Fixes | patch |
| `BREAKING CHANGE` in body or `!` after type | Features (note breaking) | major |

A commit is "user-facing" if it changes behavior observable by someone
running `gha-dash`. When in doubt, skip — the changelog should be useful,
not exhaustive.

### 4. Determine bump level

1. If `$ARGUMENTS` is `patch`, `minor`, or `major` — use that override.
2. Otherwise compute from commits:
   - Any breaking change → `major`
   - Any `feat` → `minor`
   - Otherwise → `patch`
3. **Pre-1.0 rule**: while major version is `0`, a breaking change bumps
   `minor` instead of `major`.

Compute `NEW_VERSION` by bumping `CURRENT_VERSION`.

### 5. Draft the entry

Match the existing CHANGELOG.md format exactly:

```markdown
## X.Y.Z (YYYY-MM-DD)

### Features

- **Bold title** — terse, user-facing description

### Fixes

- **Bold title** — terse, user-facing description
```

Rules:
- Today's date, version without `v` prefix
- Only include `### Features` or `### Fixes` if that section has entries
- Each entry: `- **Bold title** — description`
- User-facing language: "Dashboard now shows X", not "refactored Y to call Z"
- Terse — one to three lines per entry, no padding
- Group related commits into one entry when they serve the same purpose
- Wrap at ~72 chars, 2-space continuation indent (match existing entries)
- If a fix has a `Reported-by:` trailer, append `(reported by @handle)`

### 6. Present for review

Show the user:
1. Bump: `CURRENT_VERSION → NEW_VERSION (type)`
2. Included commits (one-line each)
3. Skipped commits and why (if any)
4. The draft changelog entry

Ask: "Does this look right? I'll prepend it to CHANGELOG.md when you approve."

### 7. Write (after approval only)

1. Read `CHANGELOG.md`
2. Insert the new entry after `# Changelog\n` and before the first
   `## X.Y.Z` line
3. Do NOT update `package.json` or create tags — CI handles versioning

## Edge cases

- **No commits since last tag**: report "No changes since vX.Y.Z" and stop.
- **No conventional prefix**: treat as `chore` (skip). Mention in review.
- **All commits skipped**: report this and ask if the user wants to force
  a changelog entry anyway.
