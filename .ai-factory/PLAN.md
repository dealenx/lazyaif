# Implementation Plan: Detect `.ai-factory/FIX_PLAN.md` as a second fast plan

Branch: 0.x
Created: 2026-06-30

## Settings

- Testing: no
- Logging: standard
- Docs: no

## Context

Issue [dealenx/lazyaif#3](https://github.com/dealenx/lazyaif/issues/3) — make
`lazyaif plans` (CLI and TUI) discover and render `.ai-factory/FIX_PLAN.md`
in addition to the existing `.ai-factory/PLAN.md`.

Today, `scanAiFactory()` in
`packages/lazyaif/src/modules/plans-viewer/scanner.ts` reads only two
locations:

- `.ai-factory/PLAN.md` (fast plan)
- every `*.md` under `.ai-factory/plans/` (full plans)

`FIX_PLAN.md` at the `.ai-factory/` root is **not read at all** — there is no
allowlist to add it to, and `plans/*.md` is a separate directory. Result:
the `aif-fix` skill writes a fix plan that `lazyaif` cannot see, so users
have to leave the TUI to inspect it.

The fix is minimal:

- `parser.ts:46` already classifies any file whose name ends in `PLAN.md`
  as `kind: "fast"` — `FIX_PLAN.md` will be classified correctly with zero
  parser changes.
- `renderTaskDetail()` (`tui-view.ts:112-205`) renders fast plans
  generically (title / meta / status / markdown body) — no rendering change
  is needed once the file is in the `plans` array.
- The TUI refresh loop `dataTick()` (`tui-view.ts:326-398`) currently
  hardcodes the fast-plan path as `PLAN.md`. With `FIX_PLAN.md` added at
  scan time, the same loop would (a) stat both fast files against the same
  `fastPath`, masking changes, and (b) treat `FIX_PLAN.md` as a "removed
  full plan" on the first refresh tick. Both must be fixed.

## Tasks

- [x] Task 1: Extend scanner to read both PLAN.md and FIX_PLAN.md as fast plans
  - File: `packages/lazyaif/src/modules/plans-viewer/scanner.ts`
  - Replace the single `fastPath` branch (`scanner.ts:28-37`) with a loop
    over `FAST_PLAN_FILES = ["PLAN.md", "FIX_PLAN.md"]`:
    - Build `relPath` as `["", ".ai-factory", fileName].join(sep)` (same
      shape used today) so the parser sees a consistent relative path.
    - Keep the existing `pathExists` / `readFile` / `mtime` / `debug` /
      `warn` error handling per file; one missing file is not an error
      (the other one can still exist).
  - Leave the `plans/` directory scan (`scanner.ts:39-56`) untouched.
  - Logging: standard — `debug` lines already emit `mtime=<rel>=<mtime>`
    and the final summary `fast=<n> full=<n>` continues to work without
    edits; verify the summary count goes to 2 when both files are present.
  - Notes:
    - If a `FIX_PLAN.md` already lives under `.ai-factory/plans/` (it does
      not today — verified via `Get-ChildItem .ai-factory/plans`), it will
      continue to be picked up as a full plan via the existing `plans/`
      scan. The new fast-plan scan only matches the root-level file. This
      matches the `aif-fix` skill's documented layout.

- [x] Task 2: Make TUI refresh loop track all fast-plan files by name
  - File: `packages/lazyaif/src/views/plans-viewer/tui-view.ts`
  - In `dataTick()` (`tui-view.ts:326-398`):
    1. Drop the assumption `fastPath = join(aiFactoryDir, "PLAN.md")` is
       the **only** fast path. Build `fastPathFor(plan)` that returns
       `join(aiFactoryDir, plan.fileName)` for any `plan.kind === "fast"`
       plan. The "fileName" already comes from the parser/scanner and is
       `PLAN.md` or `FIX_PLAN.md`.
    2. In the per-plan mtime loop (`tui-view.ts:336-345`), replace
       `plan.kind === "fast" ? fastPath : join(plansDir, plan.fileName)`
       with `plan.kind === "fast" ? fastPathFor(plan) : join(plansDir, plan.fileName)`.
    3. After the per-plan mtime loop, check **each** fast plan separately
       for added/removed: for every `plan` with `kind === "fast"`,
       `await pathExists(fastPathFor(plan))`; if the actual disk state
       differs from the in-memory `hasFastPlanByName.get(plan.fileName)`,
       bump `changedCount`. Equivalently: keep a `fastExists` map keyed
       by `fileName`. Remove the current single-file
       `fastExists !== hasFastPlan` check (`tui-view.ts:366-369`) — it
       only watched `PLAN.md`.
    4. In the `plans/` directory reconciliation block
       (`tui-view.ts:347-364`), the `if (p !== "PLAN.md" && !mdFiles.includes(p))`
       guard must also allow `FIX_PLAN.md` through — change it to
       `if (p !== "PLAN.md" && p !== "FIX_PLAN.md" && !mdFiles.includes(p))`
       (or, cleaner: derive the fast-plan filenames from the in-memory
       `plans` array: `const fastFileNames = new Set(plans.filter(p => p.kind === "fast").map(p => p.fileName))`).
  - Logging: standard — keep `debug` on the new `fastPathFor` resolution
    and on the per-name existence diff. The existing
    `fast plan check: fastExists=... hasFastPlan=...` debug line is
    removed/replaced by per-name output.
  - Depends on: Task 1
  - Notes:
    - The reconciliation that follows (`tui-view.ts:374-394`) already calls
      `scanAiFactory(rootDir)` and reconciles `selectedIndex` by
      `fileName`, so once Task 1 is in place the refresh will pick up
      `FIX_PLAN.md` automatically. The per-tick work in this task is
      only about **detecting** that a change happened so we trigger the
      re-scan at all.

## Commit Plan

Fewer than 5 tasks → single commit at the end:

```
feat(scanner): detect .ai-factory/FIX_PLAN.md as a second fast plan
```

## Out of Scope

- Introducing a `paths.fix_plan` config layer (none exists today in
  `packages/lazyaif/src/`; the `aif` skill's
  `config-template.yaml:79` defines it but the runtime does not load
  YAML). Adding a config subsystem for one extra filename is overkill
  while the file list stays small.
- Detecting other `.ai-factory/*.md` artifacts (RESEARCH, ROADMAP, RULES,
  DESCRIPTION, ARCHITECTURE). They are not plans by the parser's schema
  and would need a separate concept.
- TUI affordances for "open the matching `aif-fix` plan" — purely a
  scanner+refresh fix.
- Renaming/moving an existing `FIX_PLAN.md` from `plans/` to the root
  (none exist; verified).
