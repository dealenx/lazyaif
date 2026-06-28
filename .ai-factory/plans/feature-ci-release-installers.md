# Implementation Plan: GitHub Actions CI matrix build + GitHub Releases + cross-platform installers

Branch: main (no-git-switch — full plan saved without branch checkout)
Created: 2026-06-29

## Settings
- Testing: no
- Logging: verbose — installer scripts log DEBUG steps (OS/arch detection, URL resolution, download, checksum verify, install path); CI workflow steps use `set -x` / `pwsh -Verbose` and print asset paths/sizes
- Docs: no (WARN [docs] only — update README install section manually if desired)

## Roadmap Linkage
Milestone: none
Rationale: Skipped — no `.ai-factory/ROADMAP.md` exists in the project.

## Research Context
Source: project reconnaissance (no RESEARCH.md topic for this feature)

Goal:
  Automate cross-platform builds of `lazyaif` (Windows, macOS, Linux × x64/arm64), publish binaries to GitHub Releases on tag push, and provide installers that fetch and install the correct release asset from GitHub Releases.

Constraints:
  - Runtime is Bun; binary produced via `bun build --compile bin/lazyaif.ts --outfile <out>` — native Bun compiler, no separate toolchain.
  - `@opentui/core` is a native addon; `bun build --compile` embeds it. Per-platform builds must run on matching OS runners (no reliable cross-compile of native deps).
  - Repo is a monorepo: package lives at `packages/lazyaif/`; CI must `cd` there before building.
  - Windows runner cannot build `lazyaif` (no extension) and `lazyaif.exe` — the same `bun build --compile` command produces the right artifact; the `--outfile` name differs per OS.
  - Release trigger: git tag `v*` push.
  - Assets naming must encode OS + arch for installer auto-detection.
  - Installers must resolve "latest release" via GitHub API (`https://api.github.com/repos/dealenx/lazyaif/releases/latest`) and download the matching asset.

Decisions:
  - CI uses a build matrix of `{ os, arch, suffix }` tuples (6 cells) rather than one job per OS, to keep it DRY.
  - Each matrix job uploads its binary to the workflow `actions/upload-artifact` and a separate `release` job (triggered only on tag) collects artifacts and creates a GitHub Release via `softprops/action-gh-release` (or `gh release create`), attaching `checksums.txt`.
  - Asset naming: `lazyaif-<tag>-<os>-<arch><ext>` where `<os>` ∈ {windows,darwin,linux}, `<arch>` ∈ {x64,arm64}, `<ext>` ∈ {"", ".exe"}. Example: `lazyaif-v0.2.0-darwin-arm64`, `lazyaif-v0.2.0-windows-x64.exe`.
  - `checksums.txt` (SHA-256 per line, `<hash>  <asset-name>`) generated in the release job.
  - Installers: `scripts/install.sh` (curl|sh for darwin/linux) and `scripts/install.ps1` (iex for windows). Both:
      1. Detect OS + arch (uname / [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture).
      2. Fetch latest release JSON from GitHub API.
      3. Find the asset matching `lazyaif-<tag>-<os>-<arch><ext>`.
      4. Download to a temp dir, verify SHA-256 against the `checksums.txt` asset.
      5. Install to `~/.local/bin/lazyaif` (unix) or `$env:LOCALAPPDATA\lazyaif\lazyaif.exe` (windows) and instruct on PATH.
  - Verbose logging controlled by `LAZYAIF_INSTALL_DEBUG=1` (unix) / `$env:LAZYAIF_INSTALL_DEBUG=1` (windows) — default INFO, set for DEBUG.
  - No tests required (user preference).

Open questions:
  - Should we sign macOS binaries / notarize? Out of scope for v1 — installer warns if signature missing. (Defer.)
  - Homebrew tap? Deferred — user chose shell script only for unix.
  - Do we need a `latest` symlink or channel? No — installer always fetches `releases/latest`.

## Commit Plan
- **Commit 1** (after tasks 1-2): "ci: add cross-platform build matrix workflow"
- **Commit 2** (after tasks 3-4): "ci: add release job with tag trigger and checksums"
- **Commit 3** (after tasks 5-6): "feat: add install.sh for darwin/linux"
- **Commit 4** (after task 7): "feat: add install.ps1 for windows"
- **Commit 5** (after task 8): "docs: document install commands in README" (WARN [docs] — optional)

## Tasks

### Phase 1: Build matrix workflow

- [x] Task 1: Create `.github/workflows/build.yml` with a build matrix job
  - Trigger: `push` to `main` and `pull_request` (CI gate); release trigger lives in a separate workflow (Task 3) — keep concerns separated.
  - Define matrix:
      ```
      os-arch:
        - { os: windows-latest, arch: x64,   target: bun-windows-x64,   outfile: lazyaif-windows-x64.exe,   shell: pwsh }
        - { os: windows-latest, arch: arm64, target: bun-windows-arm64, outfile: lazyaif-windows-arm64.exe, shell: pwsh }
        - { os: macos-latest,   arch: x64,   target: bun-darwin-x64,   outfile: lazyaif-darwin-x64,         shell: bash }
        - { os: macos-latest,   arch: arm64, target: bun-darwin-arm64, outfile: lazyaif-darwin-arm64,       shell: bash }
        - { os: ubuntu-latest,  arch: x64,   target: bun-linux-x64,    outfile: lazyaif-linux-x64,          shell: bash }
        - { os: ubuntu-latest,  arch: arm64, target: bun-linux-arm64,  outfile: lazyaif-linux-arm64,        shell: bash }
      ```
    - NOTE: `windows-latest`/`macos-latest` runners are x64+arm64 capable; verify `--target` flag works for cross-arch compile on same-OS runners. If `bun build --compile --target` does not support arch override on the host, fall back to explicit arch-matched runners (`macos-13` for x64, `macos-14` for arm64, `windows-2022` for x64). Document the fallback in a comment in the workflow.
  - Steps per job:
      1. `actions/checkout@v4`
      2. `oven-sh/setup-bun@v2` with `bun-version: 1.3` (match README requirement)
      3. `cd packages/lazyaif && bun install --frozen-lockfile`
      4. `cd packages/lazyaif && bun run typecheck`
      5. Build: `cd packages/lazyaif && bun build --compile bin/lazyaif.ts --outfile ../../out/<outfile> --target <target>` (set `--target` only if cross-arch compile is supported; otherwise omit `--target` for native builds and rely on runner arch).
      6. `cd packages/lazyaif && sha256sum ../../out/<outfile> > ../../out/<outfile>.sha256` (unix) / PowerShell `Get-FileHash -Algorithm SHA256` → write `.sha256` (windows).
      7. `actions/upload-artifact@v4` with `name: build-<target>`, `path: out/<outfile>`, `retention-days: 7`.
  - Verbose: prefix build step with `set -x` (bash) / `$ErrorActionPreference='Continue'; Set-PSDebug -Trace 1` (pwsh). Print `ls -la out/` / `Get-ChildItem out/` after build.
  - Logging: each step echoes `[ci:build:<target>] starting/finished`, file size in bytes.
  - File: `.github/workflows/build.yml`

- [x] Task 2: Verify build matrix locally for at least the host platform
  - Run `cd packages/lazyaif && bun build --compile bin/lazyaif.ts --outfile ../../out/lazyaif-<host>-<arch>` on the current Windows host and confirm the binary launches (`./out/lazyaif-windows-x64.exe --version`).
  - This is a sanity check, not a committed test — capture the exact `--target` value that works and use it in Task 1. If `--target` is rejected by the installed Bun version, document the native-build fallback and adjust Task 1's matrix comments.
  - Logging: print `bun --version`, the exact build command, output path, file size, and `--version` output.
  - No file changes expected unless Task 1 needs adjustment.

### Phase 2: Release workflow

- [x] Task 3: Create `.github/workflows/release.yml`
  - Trigger: `push: tags: ['v*']` only.
  - Single `release` job on `ubuntu-latest`, `permissions: { contents: write }`.
  - Steps:
      1. `actions/checkout@v4`
      2. `actions/download-artifact@v4` with `path: out`, `merge-multiple: false` — download all `build-*` artifacts produced by the build workflow. NOTE: artifacts from a *different* workflow run are NOT available to `download-artifact` by default. Two strategies:
         - **Strategy A (recommended):** Re-run the build matrix inside the release workflow as a `needs:` job, then have the `release` job download the artifacts via `actions/download-artifact@v4` (artifacts from `needs:` jobs are visible).
         - **Strategy B:** Use `softprops/action-gh-release` `files:` with the artifacts downloaded via `dawidd6/action-download-artifact@v6` (pulls artifacts by run-id / workflow name) — more fragile.
         - Pick Strategy A: the release workflow has its own `build` matrix job (reuse the same matrix from Task 1, ideally via a reusable workflow `workflow_call`) plus a `release` job with `needs: build`.
      3. Refactor Task 1's build job into a **reusable workflow** `.github/workflows/build-matrix.yml` with `on: workflow_call` + `on: push/pull_request`. Both `build.yml` (CI) and `release.yml` call it via `uses: ./.github/workflows/build-matrix.yml`.
      4. In `release.yml`:
         - `jobs.build` → `uses: ./.github/workflows/build-matrix.yml`
         - `jobs.release` → `needs: build`, runs on `ubuntu-latest`, downloads all `build-*` artifacts into `out/`, builds `checksums.txt`:
             ```bash
             cd out
             sha256sum * > checksums.txt
             ```
           (skip the per-file `.sha256` here, or consolidate).
         - `softprops/action-gh-release@v2` with:
             `tag_name: ${{ github.ref_name }}`
             `generate_release_notes: true`
             `files: |`
               out/*
               out/checksums.txt
         - Asset naming: the reusable workflow uploads `lazyaif-<ref_name>-<os>-<arch><ext>`. Pass `ref_name` via input or compute from `github.ref_name` inside the build job (fallback to `commit-sha` when triggered by `push` without a tag).
  - Verbose: print `ls -la out/` and each artifact path/size before upload. Print the GitHub Release URL at the end.
  - Logging: `[ci:release] tag=<tag> assets=<count> uploaded=<names>`.
  - Files: `.github/workflows/build-matrix.yml` (new reusable), `.github/workflows/build.yml` (simplify to just call reusable), `.github/workflows/release.yml` (new).

- [x] Task 4: Wire `checksums.txt` generation and verify asset naming
  - Ensure each asset name follows `lazyaif-<tag>-<os>-<arch><ext>` exactly (the installer relies on this pattern). If the reusable workflow runs on `push` (no tag), substitute `dev-<short-sha>` for the tag portion to keep artifact names stable.
  - `checksums.txt` format: one line per asset: `<sha256>  <asset-name>` (two-space separation, GNU coreutils default). This is the file the installers fetch and parse.
  - Add a workflow step that prints `cat out/checksums.txt` for verification in the Actions log.
  - File: `.github/workflows/release.yml` (the `release` job's checksum step).

### Phase 3: Unix installer (shell)

- [x] Task 5: Create `scripts/install.sh`
  - Idiomatic curl|sh installer. Shebang `#!/usr/bin/env sh` (POSIX sh, not bash) for portability.
  - Behaviour:
      1. Print banner: "lazyaif installer (unix)" + version of the script.
      2. Detect OS via `uname -s` → `Darwin`/`Linux`; arch via `uname -m` → `x86_64`→`x64`, `aarch64`/`arm64`→`arm64`. Reject unsupported combos with a clear message and exit 2.
      3. Resolve install dir: `${LAZYAIF_INSTALL_DIR:-$HOME/.local/bin}`. Create it (`mkdir -p`) if missing. Add a PATH hint at the end if the dir is not on `$PATH`.
      4. Fetch latest release metadata: `curl -fsSL https://api.github.com/repos/dealenx/lazyaif/releases/latest` ( Honour `GITHUB_API_TOKEN` if set for rate limits, pass `-H "Authorization: Bearer $GITHUB_API_TOKEN"` when present).
      5. Parse JSON with `grep`/`sed` (no `jq` dependency) OR ship a minimal `awk`/`sed` parser. Extract `tag_name` and the `browser_download_url` whose `name` matches `lazyaif-<tag>-<os>-<arch>` AND `checksums.txt`. (Two downloads.)
         - Fallback: if `jq` is detected, use it; otherwise fall back to `sed`. Keep it simple — a `sed -n`/`grep` on the `name`/`browser_download_url` pairs.
      6. Download the binary to a temp file (`mktemp`) and `checksums.txt` alongside.
      7. Verify SHA-256:
         - Compute `sha256sum "$tmp_bin"` (Linux) or `shasum -a 256 "$tmp_bin"` (macOS). Compare to the line in `checksums.txt` matching the asset name. Mismatch → remove temp files, exit 3.
      8. Move binary to `$INSTALL_DIR/lazyaif`, `chmod +x`.
      9. Print: installed version path, "Add to PATH: export PATH=\"$INSTALL_DIR:\$PATH\"" if needed, and `lazyaif --version` to confirm.
  - Verbose logging: every step guarded by `if [ -n "$LAZYAIF_INSTALL_DEBUG" ]; then set -x; fi` at the top; also explicit `echo "[install] <step>"` messages at INFO level.
  - Logging levels: INFO = `echo "[install] ..."`; DEBUG = `set -x` + extra `echo "[install:debug] ..."`. Errors → `echo "[install:error] ..." >&2` and `exit N` with documented codes (2 unsupported, 3 checksum, 4 download, 5 api).
  - File: `scripts/install.sh` (repo root, not under `packages/`).
  - Make it executable in the repo (`git update-index --chmod=+x scripts/install.sh` — do this in Task 5).

- [x] Task 6: Add curl|sh one-liner to README and wire `install.sh` into CI smoke test
  - README install section (append to `## Quick start`):
      ```
      ### Unix (macOS / Linux)
      curl -fsSL https://raw.githubusercontent.com/dealenx/lazyaif/main/scripts/install.sh | sh
      ```
  - Add a CI smoke job (in `build.yml` or a new `.github/workflows/install-smoke.yml`) that runs on `ubuntu-latest` and `macos-latest`:
      ```yaml
      - run: curl -fsSL https://raw.githubusercontent.com/dealenx/lazyaif/${{ github.sha }}/scripts/install.sh | sh
      - run: $HOME/.local/bin/lazyaif --version
      ```
    Run this only on `pull_request` to avoid running against the pre-release HEAD when the binary isn't published yet — OR guard with `if: github.event_name == 'push' && github.ref == 'refs/heads/main'` and fetch from a *released* tag. Simplest: run the installer logic against the local working tree (`sh ./scripts/install.sh` with a `LAZYAIF_BUILD_DIR` override pointing at a just-built binary) rather than against GitHub. Document the chosen approach in the workflow comments.
  - Files: `README.md`, `.github/workflows/install-smoke.yml` (optional — can fold into `build.yml`).

### Phase 4: Windows installer (PowerShell)

- [x] Task 7: Create `scripts/install.ps1`
  - Idiomatic `iex` installer. `#requires -Version 5.1`.
  - Behaviour:
      1. Print banner: "lazyaif installer (windows)".
      2. Detect arch via `[System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture` → `X64`→`x64`, `Arm64`→`arm64`. OS is assumed Windows.
      3. Resolve install dir: `${env:LAZYAIF_INSTALL_DIR}` or `$env:LOCALAPPDATA\lazyaif`. Create with `New-Item -ItemType Directory -Force`.
      4. Fetch latest release JSON via `Invoke-RestMethod -Uri https://api.github.com/repos/dealenx/lazyaif/releases/latest -Headers $headers` (add `Authorization: Bearer $env:GITHUB_API_TOKEN` when present; `-Headers @{ "User-Agent" = "lazyaif-installer" }` always).
      5. Find the asset whose `name` matches `lazyaif-<tag>-windows-<arch>.exe` and the `checksums.txt` asset. Download both via `Invoke-WebRequest` to a temp dir (`$env:TEMP`).
      6. Verify SHA-256: `(Get-FileHash -Algorithm SHA256 $tmpExe).Hash -eq $expectedHash`. Parse `checksums.txt` to get `$expectedHash` for the asset name. Mismatch → `Remove-Item $tmp*; throw "checksum mismatch"`.
      7. Move exe to `$InstallDir\lazyaif.exe`.
      8. Print: installed path, "Add to PATH: `$InstallDir`" instructions (either `[Environment]::SetEnvironmentVariable('PATH', ... , 'User')` optionally, or just print the instruction — prefer printing to avoid mutating the user's environment silently).
      9. Run `& $InstallDir\lazyaif.exe --version` to confirm.
  - Verbose logging: `param([switch]$Verbose)` → `if ($Verbose) { $VerbosePreference = 'Continue' }`; use `Write-Verbose`/`Write-Host` per step. Honour `$env:LAZYAIF_INSTALL_DEBUG = '1'` to force verbose.
  - Logging levels: `Write-Host "[install] ..."` (INFO), `Write-Verbose "[install:debug] ..."` (DEBUG), `Write-Error "[install:error] ..."` (ERROR). Documented exit codes via `exit N` (2 unsupported arch, 3 checksum, 4 download, 5 api).
  - File: `scripts/install.ps1` (repo root).
  - One-liner for README:
      ```powershell
      irm https://raw.githubusercontent.com/dealenx/lazyaif/main/scripts/install.ps1 | iex
      ```

### Phase 5: Documentation (WARN [docs] — optional)

- [x] Task 8: Update README install section (warn-only checkpoint)
  - Add a `## Installation` section with both one-liners (unix + windows) and a note that binaries are published to GitHub Releases on tag push.
  - Add a `### Build from source` subsection linking to the CI workflow for transparency.
  - This task is WARN-only per the `Docs: no` setting — implementer MAY skip it; if skipped, `/aif-implement` emits `WARN [docs]`.
  - File: `README.md`