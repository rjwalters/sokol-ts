# Release

Create a new release of sokol-ts. Bumps the version in package.json, commits, tags, pushes, and creates a GitHub release. The `publish.yml` workflow handles npm publishing automatically when the tag lands.

## Usage

```
/release <version>
```

Where `<version>` is one of:
- A semver bump type: `patch`, `minor`, `major`
- An explicit version: `0.2.0`, `1.0.0`, etc.

## Steps

1. **Preflight checks**:
   - Verify you are on the `main` branch
   - Verify the working tree is clean (no uncommitted changes)
   - Verify you are up to date with `origin/main`
   - Run `npm run check:ci` to ensure lint and build pass
   - Run `npm test` to ensure all tests pass

2. **Determine version**:
   - Read the current version from `package.json`
   - If the argument is `patch`, `minor`, or `major`, compute the next version by bumping the appropriate semver component
   - If the argument is an explicit version string (e.g. `0.2.0`), use it directly
   - If no argument is provided, ask the user what version they want

3. **Generate changelog context**:
   - Run `git log --oneline $(git describe --tags --abbrev=0 2>/dev/null || git rev-list --max-parents=0 HEAD)..HEAD` to get commits since the last tag (or all commits if no tags exist)
   - Summarize the changes into release notes grouped by category (features, fixes, docs, refactors)

4. **Show the user a summary and ask for confirmation**:
   - Current version -> new version
   - Release notes preview
   - Wait for explicit "yes" before proceeding

5. **Execute the release**:
   - Update `version` in `package.json` using Edit (do NOT use `npm version` as it may have side effects)
   - Commit with message: `release: v<version>`
   - Create an annotated git tag: `git tag -a v<version> -m "v<version>"`
   - Push commit and tag: `git push && git push origin v<version>`
   - Create a GitHub release: `gh release create v<version> --title "v<version>" --notes "<release notes>"`

6. **Post-release verification**:
   - Confirm the tag exists on remote
   - Confirm the GitHub release was created
   - Check that the publish workflow was triggered: `gh run list --workflow=publish.yml --limit 1`
   - Report the npm publish workflow URL so the user can monitor it

## Important

- NEVER proceed past step 4 without explicit user confirmation
- If any preflight check fails, stop and report the issue
- If the tag already exists, stop and report the conflict
- The npm publish is handled by CI (`.github/workflows/publish.yml`), not by this command
