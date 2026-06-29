# Implementation Plan: Align installers/CI with 0.x default branch + auto-publish to npm

Branch: main
Created: 2026-06-29

## Settings

- Testing: no
- Logging: standard
- Docs: yes

## Context

GitHub `default_branch` is now `0.x`, but CI push triggers and README installer
URLs still reference `main`. As soon as `0.x` moves past `main`:

- `build.yml` and `install-smoke.yml` (both `branches: [main]`) stop firing on
  pushes to `0.x` — CI silently breaks.
- `raw.githubusercontent.com/dealenx/lazyaif/main/scripts/install.*` URLs in
  README start serving a stale installer (silent rot — user installs old code).
- npm registry lags GitHub Releases (`npm: 0.1.12` vs `GitHub: v0.2.1`) because
  there is no `npm publish` step in CI. `bunx lazyaif` / `npx lazyaif` delivers
  the old version even right after a tag release.

All three are silent-failure regressions: nothing throws, users just get stale
artifacts. This plan fixes the drift so the release pipeline matches the new
default branch.

## Tasks

- [x] Task 1: Switch CI push triggers to 0.x
  - Files: `.github/workflows/build.yml`, `.github/workflows/install-smoke.yml`
  - Change `on.push.branches: [main]` → `on.push.branches: [0.x]` in both files
  - Leave `pull_request:` triggers alone (they fire on any target branch when
    no `branches:` filter is set — already correct for PRs against `0.x`)
  - Do NOT touch `release.yml` — it triggers on `tags: v*`, branch-independent
  - Logging: standard (workflow-level; no app logs)
  - Notes: if you later keep `main` as a mirror, switch to `branches: [main, 0.x]`
    instead. For now `0.x` only matches the new default-branch reality.

- [x] Task 2: Update README installer raw URLs to 0.x
  - File: `README.md`
  - Line 32: `.../main/scripts/install.sh` → `.../0.x/scripts/install.sh`
  - Line 40: `.../main/scripts/install.ps1` → `.../0.x/scripts/install.ps1`
  - Keep the surrounding one-liner commands (`curl -fsSL ... | sh` and
    `irm ... | iex`) unchanged — only the branch segment in the URL changes
  - Verify both URLs return HTTP 200 after the edit (they do today — `0.x`
    and `main` point at the same commit; `0.x` keeps working after they diverge)
  - Logging: n/a (docs only)
  - Notes: this is the only place these URLs are referenced. The archived plan
    `feature-ci-release-installers.md` also contains `main` URLs but it is a
    historical record — leave it.

- [x] Task 3: Add npm publish step to release.yml
  - File: `.github/workflows/release.yml`
  - Add a new `publish-npm` job that runs AFTER the `release` job
    (`needs: release`), on `ubuntu-latest`, gated on the `NPM_TOKEN` repo secret
  - Steps:
    1. `actions/checkout@v4`
    2. `oven-sh/setup-bun@v2` with `bun-version: 1.3`
    3. `cd packages/lazyaif && bun install --frozen-lockfile`
    4. `cd packages/lazyaif && bun run prebuild` (builds `dist/` for the npm tarball)
    5. `cd packages/lazyaif && npm publish --access public` with
       `env: { NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }} }` — use the
       `npm` CLI auth via a per-step `.npmrc`:
       ```yaml
       - run: |
           echo "//registry.npmjs.org/:_authToken=${NPM_TOKEN}" > ~/.npmrc
           cd packages/lazyaif && npm publish --access public
         env:
           NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
       ```
       (bun also supports `npm publish`; either works. `npm` is used here so
       the auth token via `.npmrc` is unambiguous.)
    6. Summary step: echo publish result to `$GITHUB_STEP_SUMMARY`
  - Gate the whole job on the secret existing so a missing `NPM_TOKEN` fails
    loudly rather than silently shipping nothing:
    ```yaml
    publish-npm:
      needs: release
      runs-on: ubuntu-latest
      if: ${{ secrets.NPM_TOKEN != '' }}
      ...
    ```
    (GitHub Actions cannot directly compare secrets in `if:`; use a workflow
    env guard if needed: `env: HAS_TOKEN: ${{ secrets.NPM_TOKEN != '' }}`
    then `if: env.HAS_TOKEN == 'true'`.)
  - Logging: standard — each step echoes what it does; publish failure surfaces
    via the job status
  - Depends on: Task 1 (so the release workflow that now builds on `0.x` triggers
    correctly on tags pushed from `0.x`) — strictly, release triggers on tags
    regardless of branch, but keeping ordering avoids confusion
  - Notes:
    - `package.json` version (`0.2.1`) must equal the tag (`v0.2.1`) for a clean
      publish. The current manual flow relies on the committer to bump
      `package.json` before tagging — keep that convention; this task does NOT
      add auto-versioning, just auto-publishing.
    - The npm badge in README already points at the npm registry; once this
      step runs, the badge and `bunx lazyaif` will stay in sync with releases.

- [x] Task 4: Docs checkpoint — verify README reflects auto-publish + 0.x
  - File: `README.md`
  - After Tasks 1–3, re-read README and confirm:
    - Installer one-liners use `0.x` (from Task 2)
    - npm badge still relevant and will now track releases (from Task 3)
    - "Prebuilt binaries are published to GitHub Releases on tag push" line is
      still accurate — no wording change needed, but verify it is there
  - Optional: add a one-line note under `### npm` that releases publish to npm
    automatically on tag (e.g. "Published to npm automatically on tag push")
    so users know `bunx lazyaif` stays current
  - Mandatory checkpoint per `Docs: yes` setting — route via docs policy
  - Logging: n/a (docs)
  - Depends on: Tasks 1, 2, 3

## Commit Plan

Fewer than 5 tasks → single commit at the end:

```
chore(release): align CI and installers with 0.x default branch + add npm publish
```

## Out of Scope

- darwin-x64 friendly error in install.sh (you opted out)
- Extending install-smoke to run installers against a real GitHub Release (out of scope)
- Auto-bumping package.json version from the git tag (keep manual)
- Deleting the `main` branch (kept as-is)