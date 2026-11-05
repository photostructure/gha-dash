# Releasing gha-dash

This repository uses signed Git tags, npm staged publishing, and automatic
GitHub release creation. One manual `Build & Prepare Release` dispatch creates
the signed release commit and tag and stages the npm package. Publishing the
staged package on npm still requires a maintainer's 2FA approval; once npm
serves the version, the workflow creates the immutable GitHub release with the
version's `CHANGELOG.md` section at the top of its notes.

Do not run `npm publish`, create a version tag manually, or move an existing
version tag.

Until the first patch-release drill passes, treat releases as frozen.

## Required settings

- npm trusts `photostructure/gha-dash` workflow `publish.yaml` for
  `npm stage publish` only.
- npm direct publishing is disabled. Publishing requires 2FA and disallows
  tokens.
- GitHub Actions defaults to read-only and cannot approve pull requests.
- GitHub requires approval for workflows from every external contributor.
- GitHub releases are immutable, and the PhotoStructure organization requires
  2FA.
- This repository receives only `SSH_SIGNING_KEY`, `GIT_USER_NAME`, and
  `GIT_USER_EMAIL` organization secrets. It receives no npm token.

## Create a release

Inspect the npm stage within one day because its comparison artifact expires
after one day.

1. Land the release notes in `CHANGELOG.md` on `main`, under a heading that
   names the version bump: `## [Unreleased (patch)]`,
   `## [Unreleased (minor)]`, or `## [Unreleased (major)]`. The release
   workflow renames it to `## [X.Y.Z] - YYYY-MM-DD`, and those notes become the
   GitHub release notes.
2. Wait for both `Build & Prepare Release` and `Lint CI workflows` to pass on
   the current `main` commit.
3. Open `Build & Prepare Release`, select **Run workflow**, and keep the ref on
   `main`.
4. Wait for `Build & Prepare Release` to create the signed release commit and
   annotated tag. It dispatches `Stage npm Release` at that tag.
5. In the tag-bound `Stage npm Release` workflow, wait for the
   `Stage package on npm` job to finish. Leave the workflow running: its
   `Create immutable GitHub release` job waits for your npm approval.
6. Open **Staged Packages** on npmjs.com. Verify the package name, version,
   files, metadata, provenance, and tarball against the `Stage npm Release`
   artifact.
7. Approve the npm stage with 2FA. Wait until
   `npm view gha-dash@VERSION version` returns the new version.
8. Verify `npm view gha-dash@VERSION version gitHead dist.integrity --json`.
   If npm reports `gitHead`, it must equal the release tag's commit.
9. Wait for the `Create immutable GitHub release` job to finish, then verify
   that the GitHub release exists, is immutable, and has the version's
   `CHANGELOG.md` section at the top of its notes.

The npm CLI equivalents for stage review are:

```sh
npm stage list gha-dash@VERSION
npm stage view STAGE_ID
npm stage download STAGE_ID
npm stage approve STAGE_ID
```

## How the release works

- `build.yml` (`Build & Prepare Release`) reads the version bump from the
  `## [Unreleased (patch|minor|major)]` heading in `CHANGELOG.md` while the
  test matrix runs, and fails with instructions if that heading is missing,
  names no bump, or has no notes under it. Once both pass, it bumps the
  version, renames the heading to `## [X.Y.Z] - YYYY-MM-DD` with a new empty
  `## [Unreleased]` above it, adds the version's `[X.Y.Z]: <url>` link
  definition, pushes a signed release commit and annotated tag, and starts
  `publish.yaml` at that tag.
  [`photostructure/changelog-release-action`](https://github.com/photostructure/changelog-release-action)
  does the `CHANGELOG.md` work and the npm wait below.
- `publish.yaml` (`Stage npm Release`) validates the signed tag, packs and
  verifies the exact source tarball, and stages it with `npm stage publish`.
  npm trusts only this workflow file, by name, to stage the package, so
  renaming it means changing the package's trusted-publisher settings on
  npmjs.com.
- npm validates a staged package, which takes 5 to 20 minutes, then holds
  it until a maintainer approves it with 2FA.
- The `Create immutable GitHub release` job checks npm every 5 minutes, for up to
  5 hours 45 minutes.
  Any npm error other than "not found" (E404) ends the job early. Once npm
  serves the version, it re-verifies the signed tag and creates the immutable
  GitHub release. Its notes are the version's `CHANGELOG.md` section, followed
  by GitHub's generated notes. GitHub emails the release to the repository's
  watchers at that moment, so the email always announces a version they can
  install. If the npm stage is
  rejected, the job runs out of checks without creating a release; preserve
  the tag and use a new version for the correction.

## Recover from a failure

| Failure                                                                     | Response                                                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Validation or tests fail before tagging                                     | Fix `main` and dispatch a new release run.                                                                                                                                                                                                                               |
| `main` moves during the run                                                 | Dispatch again from the new `main` commit.                                                                                                                                                                                                                               |
| The tag push succeeds but staging dispatch fails                            | Dispatch `publish.yaml` at the existing signed tag. Do not bump again.                                                                                                                                                                                                   |
| Packing fails after tagging                                                 | Fix the workflow on `main` and release a new version. Do not move the tag.                                                                                                                                                                                               |
| Staging fails before npm accepts the package                                | Retry the same tag only for transient infrastructure failures. Release a new version for a workflow defect.                                                                                                                                                              |
| The staged contents are wrong                                               | Reject the stage with `npm stage reject STAGE_ID`. Preserve the tag and use a new version.                                                                                                                                                                               |
| The `Create immutable GitHub release` job fails before creating the release | Its checks ran out before you approved the stage, or `npm view` failed with an error other than E404. Approve the stage if you have not, then use **Re-run failed jobs** on that `Stage npm Release` run; GitHub allows re-runs for 30 days. Do not start a new release. |
| npm staging succeeds but GitHub release creation fails                      | Use **Re-run failed jobs** on the same `publish.yaml` run. Do not dispatch another npm staging run.                                                                                                                                                                      |
| The GitHub release exists but the workflow reports failure                  | Verify that the release uses the signed tag and is immutable. Do not delete or recreate an immutable release.                                                                                                                                                            |
| The GitHub release published but is not immutable                           | Stop and investigate the repository release settings. Never delete a published release; correct it with a new version.                                                                                                                                                   |
| The one-day artifact expired                                                | Stop. Do not rebuild the package artifact independently; review the tagged workflow and choose a recovery that preserves package identity.                                                                                                                               |
| A published package is bad                                                  | Deprecate it or publish a corrected version. Never overwrite it.                                                                                                                                                                                                         |

Do not weaken branch or tag rules to repair a failed release. The pilot uses
the repository `GITHUB_TOKEN` for signed direct pushes. A future tag-creation
ruleset requires a narrowly scoped GitHub App or a separately approved release
design.

## Record the patch-release drill

Record the following evidence in the active publishing plan:

- the build and tag-bound publishing workflow URLs;
- the signed tag and target commit;
- the npm approval time;
- the npm and GitHub release URLs;
- the artifact SHA-256 and npm integrity value; and
- the npm provenance repository, workflow, ref, and commit.
