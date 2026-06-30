# lazyaif

Platform of tools for analyzing ai-factory project artifacts.

## Commands

```
lazyaif              → TUI dashboard (default = plans-viewer)
lazyaif tui          → TUI (explicit)
lazyaif plans        → CLI: plans table
lazyaif plans --json → JSON
lazyaif p            → alias for plans
lazyaif status        → CLI: brief summary
lazyaif --help        → commander auto-help
lazyaif --version     → 0.1.0
```

## Install

```bash
cd packages/aif-plans
npm install
```

## Usage

### CLI

```bash
npm run plans                          # scan .ai-factory/ in cwd
npm run plans -- --path ../other-proj  # scan a different project
npm run plans -- --json                # output JSON
npm run status                         # brief summary
```

### TUI

```bash
npm run tui                            # interactive viewer on cwd
npm run tui -- --path ../other-proj    # scan a different project
```

#### Layout

By default the TUI shows two panes side by side:

- **Left (40%)** — list of plans (kind, filename, progress, counts, age)
- **Right (60%)** — flat list of Tasks of the currently selected plan
  (`☑`/`☐` checkbox, `id: title`), updates as you navigate with arrows

On small terminals (width < 100 columns) the Tasks pane is hidden
automatically and the plan list takes the full width. Enter/Tab switches
to the detail view (full-width markdown of the selected plan), Esc/Tab
returns to the list view and restores the Tasks pane.

## TUI Runtime Requirements

The TUI uses OpenTUI which requires FFI:

- **bun** — FFI out of the box, recommended
- **Node >=26.3** — run with `node --experimental-ffi`

CLI mode works on any Node >=20 without FFI.

## Architecture

```
bin/lazyaif.ts           → commander router (tui | plans | status)
src/app/                 → orchestration (tui-dashboard, cli-dispatch)
src/views/               → UI per module (plans-viewer, status)
  plans-viewer/           → tui-view, cli-view, web-view (stub)
  status/                 → tui-view, cli-view
src/clients/             → generic display frameworks
  tui/                    → createTuiRenderer + components (header, footer, theme)
  cli/                    → table helpers, json renderer
  web/                    → (stub, отложен)
src/modules/             → domain logic (no UI deps)
  plans-viewer/           → types, parser, scanner, status, format
  status/                 → types, summary (depends on plans-viewer)
src/shared/              → common utilities (placeholder)
tests/modules/           → tests per module
tests/fixtures/          → test data
```

### Dependency rule

```
modules/     → no client deps (pure logic)
clients/     → no module deps (generic frameworks)
views/       → depends on modules + clients (binding layer)
app/         → depends on views (orchestration)
shared/      → depends on nothing (base layer)
```

## Tests

```bash
npm test
```