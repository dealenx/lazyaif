# lazyaif

[![npm version](https://img.shields.io/npm/v/lazyaif.svg)](https://www.npmjs.com/package/lazyaif)

![lazyaif](https://github.com/user-attachments/assets/f83eb55c-f55f-419e-b1d0-8b3517f9a34d)

Tools for analyzing ai-factory project artifacts.

## Quick start

```bash
bunx lazyaif
```

Commands:

```bash
lazyaif tui      # interactive TUI dashboard
lazyaif plans    # list ai-factory plans
lazyaif status   # brief status report
```

Requirements: **Bun >= 1.3** or **Node >= 26.3** (with `NODE_OPTIONS=--experimental-ffi`) for TUI; **Node >= 20** for CLI commands.

## Installation

Prebuilt binaries are published to [GitHub Releases](https://github.com/dealenx/lazyaif/releases) for Windows, macOS, and Linux (x64 + arm64).

### Unix (macOS / Linux)

```bash
curl -fsSL https://raw.githubusercontent.com/dealenx/lazyaif/main/scripts/install.sh | sh
```

Installs to `~/.local/bin/lazyaif` (override with `LAZYAIF_INSTALL_DIR=/path`).

### Windows (PowerShell)

```powershell
irm https://raw.githubusercontent.com/dealenx/lazyaif/main/scripts/install.ps1 | iex
```

Installs to `%LOCALAPPDATA%\lazyaif\lazyaif.exe` (override with `$env:LAZYAIF_INSTALL_DIR = "C:\path"`).

### npm

```bash
bunx lazyaif
# or
npx lazyaif
```

## Development

```bash
git clone https://github.com/dealenx/lazyaif.git
cd lazyaif/packages/lazyaif
bun install
bun run tui
```

| Task | Command |
|------|---------|
| Run TUI | `bun run tui` |
| List plans | `bun run plans` |
| Brief status | `bun run status` |
| Tests | `bun test` |
| Typecheck | `bunx tsc --noEmit -p tsconfig.json` |
| Build binary | `bun run build` |

## Structure

```
packages/lazyaif/
  bin/lazyaif.ts          # CLI entry (commander)
  src/
    app/                  # orchestration (tui-dashboard, cli-dispatch)
    clients/              # tui/, cli/, web/ display frameworks
    modules/              # domain logic (plans-viewer, status)
    shared/               # common utils
    views/                # UI per module
  tests/                  # bun:test
```