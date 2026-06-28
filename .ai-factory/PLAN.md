# Implementation Plan: Deferred markdown parse + debounce onSelect for responsive plan switching

Branch: main
Created: 2026-06-29

## Settings

- Testing: no
- Logging: verbose
- Docs: no

## Research Context

Topic: TUI detail pane подвисает при переключении планов — рендеринг MarkdownRenderable блокирует event loop
Goal: Сделать переключение планов отзывчивым — стрелки не залипают, markdown рендерится асинхронно
Constraints:
  - `new MarkdownRenderable(renderer, { content })` парсит markdown (marked) + строит renderable-дерево синхронно в constructor'е
  - Файлы планов: 1.7KB–27KB; `aif-plans-viewer.md` = 27KB парсится ощутимо
  - `updateDetail()` вызывается синхронно из `onSelect` → блокирует event loop
Decisions:
  - Подход A (deferred parse): рендерить title/meta/status мгновенно, markdown через `setTimeout(0)`
  - Подход E (debounce): 100ms debounce на `onSelect` — при удержании стрелки рендерить только последний index
Success signals:
  - При быстром переборе стрелок TUI не залипает — подсветка движется плавно
  - После остановки на плане markdown появляется через ~1 кадр
  - При одиночном нажатии стрелки markdown виден почти мгновенно (title/meta/status — мгновенно)

## Tasks

- [x] Task 1: Debounce onSelect to skip intermediate renders during fast scrolling
  - File: `src/views/plans-viewer/tui-view.ts`
  - In `createPlansTuiApp`, wrap the `onSelect` callback logic so that rapid arrow-key presses (held down) only render the final target, not every intermediate index
  - Implementation:
    - Add a `pendingSelectTimer: ReturnType<typeof setTimeout> | null` variable (closed over in `createPlansTuiApp`)
    - In the `onSelect` callback: set `selectedIndex = clamped` immediately (so state is correct), but instead of calling `updateDetail()` directly, schedule it via `setTimeout(updateDetail, 100)` and clear any previous pending timer
    - This means: while user holds ↓ and scrolls through plans 1→2→3→4, only plan #4 gets a `updateDetail()` call 100ms after the last keypress
    - Guard: keep `selectedIndex` updated immediately so if `dataTick` refresh fires mid-scroll, it uses the correct index
  - Logging: `debug("[tui:debounce] scheduled render for index=${clamped} in 100ms")`, `debug("[tui:debounce] cancelled previous pending render")`
  - Notes: 100ms is the debounce window. If user stops for >100ms, render fires. If they keep scrolling, only the last stop triggers render.

- [x] Task 2: Defer MarkdownRenderable creation to next event loop tick
  - File: `src/views/plans-viewer/tui-view.ts`
  - Split `renderTaskDetail` into two phases:
    - Phase 1 (synchronous, instant): create ScrollBox + title TextRenderable + meta TextRenderable + status TextRenderable + separator TextRenderable — return the ScrollBox immediately so the detail pane shows useful content right away
    - Phase 2 (deferred, via `setTimeout(0)`): create `MarkdownRenderable` with `content: bodyMarkdown` and add it to the ScrollBox
  - Implementation:
    - Change `renderTaskDetail` to return `{ scroll: ScrollBoxRenderable, appendMarkdown: () => void }` OR keep it returning ScrollBox and accept an `onReady` callback — pick the cleaner approach
    - Recommended: `renderTaskDetail` returns the ScrollBox (with title/meta/status/sep already added). The caller (`updateDetail`) then calls `setTimeout(0, () => { const md = new MarkdownRenderable(...); scroll.add(md); renderer.requestRender(); })`
    - This frees the event loop between the synchronous part and the markdown parse — arrow keys stay responsive
    - Guard against stale renders: capture `detailId` in closure; before adding markdown, check that `currentDetail?.id === detailId` — if user already switched to another plan, skip adding markdown for the stale one
  - Logging: `debug("[tui:detail] sync phase done for ${plan.fileName}, scheduling markdown parse")`, `debug("[tui:detail] deferred markdown ready for ${detailId}")`, `debug("[tui:detail] skipping stale markdown for ${detailId} (current=${currentDetailId})")`
  - Notes: `setTimeout(0)` is preferred over `queueMicrotask` because it guarantees yielding to the event loop (microtasks run in the same iteration after I/O). This ensures the renderer can process pending keypresses between sync phase and markdown parse.
  - Depends on: Task 1 (debounce must be in place first, otherwise deferred parse fires for every intermediate plan)

- [x] Task 3: Clean up pending timers on shutdown
  - File: `src/views/plans-viewer/tui-view.ts`
  - In the `destroy()` function returned by `createPlansTuiApp`, also clear the debounce timer (`pendingSelectTimer`) and any pending markdown-defer timers
  - Track deferred markdown timers in a `Set<ReturnType<typeof setTimeout>>` or a single `pendingMarkdownTimer` variable; clear them all in `destroy()`
  - Logging: `debug("[tui:shutdown] clearing pending select + markdown timers")`
  - Depends on: Tasks 1, 2

- [x] Task 4: Detect new/deleted .ai-factory/PLAN.md (fast plan) in dataTick
  - File: `src/views/plans-viewer/tui-view.ts`
  - Bug: `dataTick` checks `readdir(plansDir)` for new files in `plans/`, but `PLAN.md` (fast plan) lives at `.ai-factory/PLAN.md` — outside `plans/`. A newly created `PLAN.md` is invisible to the refresh loop.
  - Fix: in `dataTick`, after the existing `readdir(plansDir)` block, add an explicit check for `fastPath`:
    ```ts
    const fastExists = await pathExists(fastPath);
    const hasFastPlan = plans.some((p) => p.kind === "fast");
    if (fastExists !== hasFastPlan) changedCount++;
    ```
  - This catches both: new `PLAN.md` appearing (fastExists=true, hasFastPlan=false) and `PLAN.md` deleted (fastExists=false, hasFastPlan=true). The mtime-change case for existing `PLAN.md` is already handled by the `for plan in plans` stat loop.
  - Logging: `debug("[tui:refresh] fast plan check: fastExists=${fastExists} hasFastPlan=${hasFastPlan}")`
  - Depends on: nothing (independent of Tasks 1-3)