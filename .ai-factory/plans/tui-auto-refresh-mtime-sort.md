# Implementation Plan: TUI auto-refresh with mtime-based sort and relative-time labels

Branch: main
Created: 2026-06-29

## Settings

- Testing: yes
- Logging: verbose
- Docs: no

## Research Context

Topic: TUI plans-viewer должен периодически обновляться и показывать релевантную информацию, так как ИИ-агент обновляет plan-файлы. Планы должны сортироваться по времени последнего обновления (самые свежие сверху). В списке показывать relative time ("15 seconds ago", "1 minute ago").
Goal: Live TUI, который отражает актуальное состояние `.ai-factory/plans/*.md` без ручного перезапуска.
Constraints:
  - opentui `SelectRenderable` имеет `set options()` setter — можно обновлять список in-place без пересоздания (без flicker)
  - `set selectedIndex()` setter — можно сохранить выбор после refresh
  - `Renderable.requestRender()` — триггерит перерисовку
  - Текущий `scanAiFactory` делает single-shot scan; `scanner.ts:41` сортирует по имени файла alphabetically
  - `Plan` type не хранит mtime; `Plan.created` — это дата из markdown, не disk modification time
Decisions:
  - Источник "updated": `fs.stat().mtime` — реальное время модификации файла на диске. Агент правит файл → mtime обновляется автоматически. Дёшево через `stat()` без чтения контента для polling.
  - Механизм refresh: `setInterval` polling. Data refresh каждые 2s (stat-проверка mtimes; если изменились — full rescan + re-render). Relative-time label тикает каждые 1s (отдельно от data refresh, чтобы "15 seconds ago" не прыгал).
  - Reconciliation: сохраняем `selectedFileName` перед refresh → после refresh находим новый index по fileName → `select.setSelectedIndex(newIndex)`. Если выбранный план удалился → auto-select index 0 (самый свежий по mtime). Новые планы автоматически всплывают в топ (mtime sort).
  - Sort: по mtime DESC (свежие сверху). Secondary sort по fileName ASC для стабильности при равных mtime.
  - `SelectRenderable.options` setter использyется для in-place update без пересоздания (избегаем flicker и потери scroll position).
Success signals:
  - При правке plan-файла внешним агентом TUI обновляет список в пределах ≤2s
  - Самый свежий план вверху списка
  - Relative time "X seconds/minutes/hours ago" обновляется каждую секунду
  - Выбранный план остаётся выбранным после refresh (если не удалён)
  - Нет flicker при refresh (options mutate in-place)
  - `q`/`escape` корректно завершает TUI, intervals очищаются

## Architecture

```
+----------------------------------------------------------+
|                  REFRESH ARCHITECTURE                     |
+----------------------------------------------------------+
|                                                          |
|  setInterval(dataTick, 2000ms)                           |
|     │                                                    |
|     v                                                    |
|  ┌─────────────────────────────────────┐                 |
|  │ 1. stat() all plan file paths       │  cheap, no read |
|  │ 2. compare mtimes to last snapshot  │                 |
|  │ 3. changed? ── no ──► noop          │                 |
|  │    └── yes ──► scanAiFactory()      │  full re-read   |
|  │                + computeStatus()    │                 |
|  │                + sortByMtimeDesc()  │                 |
|  │                + reconcile selection│                 |
|  │                + select.options = … │  in-place       |
|  │                + recreate detail    │                 |
|  └─────────────────────────────────────┘                 |
|                                                          |
|  setInterval(labelTick, 1000ms)                          |
|     │                                                    |
|     v                                                    |
|  ┌─────────────────────────────────────┐                 |
|  │ recompute relativeTime for all items│                 |
|  │ select.options = same plans, new    │                 |
|  │   descriptions with fresh "X ago"   │                 |
|  └─────────────────────────────────────┘                 |
|                                                          |
+----------------------------------------------------------+
```

### File touch map

| File | Change |
|------|--------|
| `src/modules/plans-viewer/types.ts` | Add `mtime: number` to `Plan` |
| `src/modules/plans-viewer/scanner.ts` | `stat()` each file, populate `mtime`; remove alphabetical `.sort()` (sort moves to caller) |
| `src/modules/plans-viewer/format.ts` | Add `formatRelativeTime(fromMs: number, nowMs: number): string` |
| `src/modules/plans-viewer/sort.ts` (NEW) | `sortByMtimeDesc(plans): Plan[]` — mtime DESC, fileName ASC tiebreak |
| `src/modules/plans-viewer/index.ts` | Re-export `sortByMtimeDesc`, `formatRelativeTime` |
| `src/views/plans-viewer/tui-view.ts` | Dual intervals, in-place `select.options` update, fileName-based reconciliation, relative time in option descriptions, recreate detail on data change, cleanup intervals on destroy |
| `src/app/tui-dashboard.ts` | Pass renderer destroy hook so intervals clear on `q`/`escape` |
| `tests/modules/plans-viewer/format.test.ts` (NEW) | `formatRelativeTime` unit tests |
| `tests/modules/plans-viewer/sort.test.ts` (NEW) | `sortByMtimeDesc` unit tests |
| `tests/modules/plans-viewer/scanner.test.ts` | Add test that `mtime` is populated |

## Tasks

### Phase 1: Domain layer — mtime, relative time, sort

- [x] Task 1: Add `mtime` to `Plan` type and populate it in scanner
  - File: `src/modules/plans-viewer/types.ts`
    - Add `mtime: number` field to `Plan` interface (ms epoch, from `fs.stat().mtimeMs`)
  - File: `src/modules/plans-viewer/scanner.ts`
    - For each plan file (PLAN.md and `plans/*.md`), call `stat(fullPath)` to get `mtimeMs`
    - Pass `mtime` into `parsePlanFile` result or attach after parse
    - Remove the existing `.sort()` on filenames at `scanner.ts:41` — sort responsibility moves to caller (view layer sorts via `sortByMtimeDesc`)
    - Keep reading + parsing behaviour identical otherwise
  - Logging: `debug("[scanner] mtime=${path}=${mtimeMs}")` per file; `debug("[scanner] sort removed, caller sorts")`
  - Notes: `parsePlanFile` signature stays the same (it doesn't touch disk). Attach `mtime` in scanner after parse: `plans.push({ ...parsePlanFile(...), mtime })`. Update `Plan` type so the spread is type-safe.

- [x] Task 2: Add `formatRelativeTime` helper
  - File: `src/modules/plans-viewer/format.ts`
    - Add `formatRelativeTime(fromMs: number, nowMs: number = Date.now()): string`
    - Rules:
      - `delta = nowMs - fromMs`
      - `delta < 0` → "just now" (clock skew safety)
      - `delta < 60_000` → `${Math.round(delta / 1000)} seconds ago` (use "1 second ago" for < 1.5s)
      - `delta < 3_600_000` → `${Math.round(delta / 60_000)} minutes ago`
      - `delta < 86_400_000` → `${Math.round(delta / 3_600_000)} hours ago`
      - else → `${Math.round(delta / 86_400_000)} days ago`
    - Singular/plural: "1 second ago" vs "2 seconds ago" (handle 1 explicitly)
  - File: `src/modules/plans-viewer/index.ts`
    - Re-export `formatRelativeTime`
  - Logging: none (pure function)
  - Depends on: nothing

- [x] Task 3: Add `sortByMtimeDesc` sort function
  - File: `src/modules/plans-viewer/sort.ts` (NEW)
    - `export function sortByMtimeDesc(plans: Plan[]): Plan[]` — returns new array
    - Primary: `mtime` DESC (largest/newest first)
    - Secondary: `fileName` ASC (stable tiebreak for equal mtimes)
    - Do not mutate input
  - File: `src/modules/plans-viewer/index.ts`
    - Re-export `sortByMtimeDesc`
  - Logging: `debug("[sort] sorted ${plans.length} plans by mtime desc")` (in caller, not here)
  - Depends on: Task 1 (needs `mtime` field on `Plan`)

### Phase 2: TUI live refresh

- [x] Task 4: Add relative time + mtime-sort to TUI list rendering
  - File: `src/views/plans-viewer/tui-view.ts`
    - In `renderPlanList`: include `formatRelativeTime(plan.mtime)` in the option `description` field, alongside progress/pct/icon
    - Format: `description: \`${progress}  ${pct}  ${icon}  ·  ${relativeTime}\``
    - In `createPlansTuiApp`: after `scanAiFactory`, apply `sortByMtimeDesc(plans)` before computing statuses and rendering
  - Logging: `debug("[tui:list] relative time for ${fileName} = ${relativeTime}")`
  - Depends on: Tasks 1, 2, 3

- [x] Task 5: Implement data refresh interval (2s polling)
  - File: `src/views/plans-viewer/tui-view.ts`
    - In `createPlansTuiApp`, after initial render, start `setInterval(dataTick, 2000)`
    - `dataTick` logic:
      1. For each plan path, `stat()` and compare `mtimeMs` to stored `plan.mtime`
      2. Also check if any file in `plans/` dir appeared or disappeared (readdir diff)
      3. If nothing changed → return early (no re-render)
      4. If changed → `const newPlans = sortByMtimeDesc(await scanAiFactory(rootDir))`; `const newStatuses = newPlans.map(computeStatus)`
      5. Reconcile selection: find `selectedFileName` in `newPlans`; if found → `newIndex = foundIndex`; if not found → `newIndex = 0`
      6. Update `plans` and `statuses` references (mutate the closed-over `let` bindings)
      7. `select.options = newOptionsArray` (in-place via setter — no recreate, no flicker)
      8. `select.setSelectedIndex(newIndex)` (only if index changed)
      9. Recreate detail pane (remove old, render new) — only if selected plan's mtime or content changed
  - Store interval handle in a `refreshState` object for cleanup
  - Logging: `debug("[tui:refresh] data tick: ${changedCount} files changed")`, `debug("[tui:refresh] reconciled selection: ${oldFileName} -> ${newIndex}")`
  - Depends on: Task 4

- [x] Task 6: Implement relative-time label interval (1s tick)
  - File: `src/views/plans-viewer/tui-view.ts`
    - In `createPlansTuiApp`, start `setInterval(labelTick, 1000)`
    - `labelTick` logic:
      1. Recompute `formatRelativeTime(plan.mtime)` for each plan
      2. If no label changed (rare, e.g. same second) → skip
      3. `select.options = updatedOptions` (in-place; cheap because opentui re-renders only dirty frame buffer)
    - This tick does NOT rescan files or touch disk — only updates the "X ago" strings from existing `plan.mtime` values
  - Store interval handle alongside data interval
  - Logging: `debug("[tui:refresh] label tick: updated ${count} labels")`
  - Depends on: Task 5

- [x] Task 7: Cleanup intervals on TUI shutdown
  - File: `src/views/plans-viewer/tui-view.ts`
    - Expose a `destroy()` function from `createPlansTuiApp` that clears both intervals
  - File: `src/app/tui-dashboard.ts`
    - Capture the return value of `createPlansTuiApp` (a `{ destroy: () => void }` handle or a Promise thereof)
    - In the existing `keypress` handler for `q`/`escape`, call `destroy()` BEFORE `renderer.destroy()`
  - Logging: `debug("[tui:shutdown] clearing refresh intervals")`
  - Depends on: Tasks 5, 6

### Phase 3: Tests

- [x] Task 8: Tests for `formatRelativeTime`
  - File: `tests/modules/plans-viewer/format.test.ts` (NEW)
    - Use `bun:test`
    - Cases:
      - 0s delta → "just now" (or "1 second ago" depending on impl)
      - 15s delta → "15 seconds ago"
      - 59s delta → "59 seconds ago"
      - 60s delta → "1 minute ago"
      - 125s delta → "2 minutes ago"
      - 3599s → "60 minutes ago" OR "1 hour ago" (depends on boundary; fix boundary in impl to match test)
      - 3600s → "1 hour ago"
      - 7200s → "2 hours ago"
      - 86400s → "1 day ago"
      - 172800s → "2 days ago"
      - negative delta (clock skew) → "just now"
      - singular vs plural for 1 unit
  - Depends on: Task 2

- [x] Task 9: Tests for `sortByMtimeDesc`
  - File: `tests/modules/plans-viewer/sort.test.ts` (NEW)
    - Cases:
      - Empty array → empty array
      - Single plan → same array
      - Two plans with distinct mtime → newer first
      - Two plans with equal mtime → fileName ASC tiebreak
      - Does not mutate input array
      - Three plans, mixed mtimes → correct DESC order
  - Build minimal `Plan` stubs (only `fileName` + `mtime` matter; other fields can be zeroed/empty)
  - Depends on: Task 3

- [x] Task 10: Test that scanner populates `mtime`
  - File: `tests/modules/plans-viewer/scanner.test.ts` (modify existing)
    - Add a test that creates a temp `.ai-factory/plans/test-plan.md` fixture in a temp dir, scans it, and asserts `plan.mtime > 0` and is approximately `Date.now()` (within a few seconds tolerance)
    - Clean up temp dir after test
  - Depends on: Task 1

## Commit Plan

Since there are 10 tasks (≥5), commit checkpoints:

- **Commit 1** (after Task 3): `feat(plans-viewer): add mtime, relative-time formatter, mtime-desc sort`
  - Domain layer complete; no UI changes yet; all unit tests for domain pass
- **Commit 2** (after Task 7): `feat(tui): live auto-refresh with mtime-based sort and relative-time labels`
  - TUI refresh intervals, reconciliation, cleanup; feature functional end-to-end
- **Commit 3** (after Task 10): `test(plans-viewer): cover formatRelativeTime, sortByMtimeDesc, scanner mtime`
  - Full test coverage for new domain logic

## Notes for implementation

- **opentui `SelectRenderable.set options`** (Select.d.ts:86) — setter exists, use it for in-place updates. Do NOT destroy/recreate the Select on every refresh — that would reset scroll position and cause flicker.
- **`select.selectedIndex`** setter (Select.d.ts:115) — use to preserve selection after sort change.
- **`select.scrollOffset`** is private — we cannot restore it manually, but `setSelectedIndex` calls `updateScrollOffset` internally, so selecting the same logical plan keeps scroll stable.
- **Race condition on file read**: agent may write a plan file while we read it. `readFile` could return partial content. Mitigation: wrap `parsePlanFile` in try/catch per file (already done in scanner). If a file fails to parse, skip it this tick; next tick (2s later) it will likely be complete.
- **`renderer.requestRender()`** — after mutating `select.options`, opentui should auto-request render via the setter, but call `renderer.requestRender()` explicitly to be safe.
- **Footer hotkey hint**: update `footer.ts` hotkeys text to mention auto-refresh, e.g. `"Arrows/Enter: select · Mouse: select · auto-refresh: 2s · q: quit"`.