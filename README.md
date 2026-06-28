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