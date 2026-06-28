# lazyaif

Platform of tools for analyzing ai-factory project artifacts.

## Quick start (dev)

```bash
cd packages/lazyaif
bun install
```

## Commands

| Task | Command |
|------|---------|
| Run TUI | `bun run tui` |
| List plans | `bun run plans` |
| Brief status | `bun run status` |
| Tests | `bun test` |
| Typecheck | `bunx tsc --noEmit -p tsconfig.json` |
| Build binary | `bun run build` |

## Link locally (like `npm link`)

In the package dir:

```bash
cd packages/lazyaif
bun link
```

In another project:

```bash
cd /path/to/other/project
bun link lazyaif
lazyaif tui
```

## Usage

### From source (GitHub)

```bash
git clone https://github.com/dealenx/lazyaif.git
cd lazyaif/packages/lazyaif
bun install
bun run tui
```

### As a linked package (in another project)

```bash
cd packages/lazyaif
bun link

# in another project
bun link lazyaif
lazyaif tui
```

### Requirements

- **Node.js >= 26.3** (with `--experimental-ffi`) or **Bun >= 1.3** — required for the TUI command
- **Node.js >= 20** — sufficient for `plans` and `status` CLI commands

### Commands

```bash
lazyaif tui      # interactive TUI dashboard (Node >=26.3 or Bun)
lazyaif plans    # list ai-factory plans (Node >=20)
lazyaif status   # brief status report (Node >=20)
```

### Build standalone binary

```bash
cd packages/lazyaif
bun run build
./lazyaif tui
```

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