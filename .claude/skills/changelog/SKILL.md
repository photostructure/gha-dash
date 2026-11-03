---
name: changelog
description: Write CHANGELOG.md entries from conventional commits since the last release tag under the `## [Unreleased (patch|minor|major)]` heading, raising the heading's bump when the entries need a bigger one (e.g., /changelog minor).
argument-hint: "[patch|minor|major]"
allowed-tools: Bash(git *), Read, Edit, Glob, Grep
---

# Changelog

Write CHANGELOG.md entries from conventional commits since the last release
tag under the `## [Unreleased (patch|minor|major)]` heading. The heading names
the version bump: on dispatch, `Build & Prepare Release` reads it, bumps the
version, and renames the heading to `## [X.Y.Z] - YYYY-MM-DD` (see
`docs/RELEASING.md`).

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

Read the Unreleased section of `CHANGELOG.md` (the lines between its
`## [Unreleased...]` heading and the next `## ` heading), if it has one.
Commits its bullets already describe are not added again.

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
| `chore(deps)`, `build`, `ci` with a user-visible effect | Maintenance | patch |
| `BREAKING CHANGE` in body or `!` after type | Features (note breaking) | major |

A commit is "user-facing" if it changes behavior observable by someone
running `gha-dash`. When in doubt, skip — the changelog should be useful,
not exhaustive.

### 4. Determine the heading's bump

1. The commits need:
   - `$ARGUMENTS`, if it is `patch`, `minor`, or `major`;
   - otherwise, judged from every commit step 2 collects, including those the
     Unreleased section already describes (they all ship in this release):
     `major` for any breaking change, `minor` for any `feat`, and `patch` for
     everything else.
2. **Pre-1.0 rule**: while the major version is `0`, a breaking change needs
   `minor` instead of `major`.
3. The heading's bump is the larger of the bump the existing
   `## [Unreleased (...)]` heading names and the bump the commits need
   (`patch` < `minor` < `major`). Never lower it: if the heading names `minor`
   and the commits need `patch`, it stays `minor`. A bare
   `## [Unreleased]` names no bump.

Compute `NEW_VERSION` by applying the heading's bump to `CURRENT_VERSION`.
That is the version the next release will get.

### 5. Draft the entries

Match the existing CHANGELOG.md format exactly:

```markdown
## [Unreleased (minor)]

### Features

- **Bold title** — terse, user-facing description

### Fixes

- **Bold title** — terse, user-facing description

### Maintenance

- Terse description
```

Rules:
- The heading has no version or date; the release workflow adds both
- Only include a `###` subsection if it has entries, in the order Features,
  Fixes, Maintenance
- Each Features or Fixes entry: `- **Bold title** — description`
- User-facing language: "Dashboard now shows X", not "refactored Y to call Z"
- Terse — one to three lines per entry, no padding
- Group related commits into one entry when they serve the same purpose
- If a fix has a `Reported-by:` trailer, append `(reported by @handle)`

### 6. Present for review

Show the user:
1. Heading: `## [Unreleased (BUMP)]`, saying whether it is new, raised (from
   which bump), or unchanged, and the release it implies:
   `CURRENT_VERSION → NEW_VERSION`
2. Included commits (one-line each)
3. Skipped commits and why (if any)
4. The draft entries

Ask: "Does this look right? I'll add it to CHANGELOG.md when you approve."

### 7. Write (after approval only)

1. Read `CHANGELOG.md`
2. If it has no Unreleased heading, insert `## [Unreleased (BUMP)]` after
   `# Changelog\n` and above the newest `## [X.Y.Z] - ` heading. Otherwise
   rewrite the existing Unreleased heading as `## [Unreleased (BUMP)]`
3. Add each entry to its `###` subsection under that heading, creating the
   subsection in Features, Fixes, Maintenance order if it is missing
4. Do NOT update `package.json`, create tags, or add a version heading — CI
   stamps the version and date when it releases

## Edge cases

- **No commits since last tag**: report "No changes since vX.Y.Z" and stop.
- **No conventional prefix**: treat as `chore` (skip). Mention in review.
- **All commits skipped**: report this and ask if the user wants to force
  a changelog entry anyway.
