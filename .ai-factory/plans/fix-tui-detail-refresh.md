# Implementation Plan: Fix TUI plan detail page not refreshing periodically

Branch: 0.x
Created: 2026-07-03

## Settings
- Testing: yes
- Logging: verbose
- Docs: no

## Tasks

### Phase 1: Fix the detail view refresh guard

- [x] Task 1: Create `refreshDetail()` function in `tui-view.ts`

  Add a new function `refreshDetail()` inside `createPlansTuiApp()` that rebuilds the current detail view without requiring a mode transition. It should:

  1. Guard: return early if `viewMode !== "detail"` or `currentDetail` is null
  2. Cancel `pendingMarkdownTimer` if set (clearTimeout + null)
  3. Remove old `currentDetail` from `bodyRow`, call `renderable.destroy()`, set `currentDetail = null`
  4. Re-read `plans[selectedIndex]` and `statuses[selectedIndex]` (already updated by `dataTick`)
  5. Generate a new `detailId` (e.g. `plan-detail-${selectedIndex}-${Date.now()}` to avoid ID collisions with the old renderable)
  6. Call `renderTaskDetail(renderer, plan, statuses[selectedIndex], detailId, "100%")`
  7. `bodyRow.add(detail)`, set `currentDetail = { id: detailId, renderable: detail }`
  8. Schedule `appendMarkdownDeferred(renderer, detail, plan, `${detailId}-md`, () => currentDetail?.id !== detailId)`
  9. Call `renderer.requestRender()`

  LOGGING REQUIREMENTS:
  - Log DEBUG `[tui:refresh] refreshDetail: rebuilding detail for plan=${plan.fileName} index=${selectedIndex}`
  - Log DEBUG `[tui:refresh] refreshDetail: removed old detail id=${oldId}`
  - Log WARN on any remove/destroy failure

  Files: `packages/lazyaif/src/views/plans-viewer/tui-view.ts`

- [x] Task 2: Wire `refreshDetail()` into `dataTick()` (depends on 1)

  In `dataTick()`, replace the `enterDetailMode()` call when already in detail mode with `refreshDetail()`. Change the `selectionChanged` block (lines 914-925) to:

  ```ts
  if (selectionChanged) {
    select.setSelectedIndex(newIndex);
    if (viewMode === "detail") {
      refreshDetail();
    } else {
      if (showTasks) {
        currentTaskListPlanFileName = null;
        rebuildTaskList();
      }
    }
  }
  ```

  Also add a `refreshDetail()` call when `changedCount > 0` but `selectionChanged` is false AND the selected plan's mtime changed — this handles the case where the plan was modified but its sort position didn't change. Specifically, after the `selectionChanged` block, add:

  ```ts
  if (!selectionChanged && viewMode === "detail") {
    const oldPlan = plans.find(p => p.fileName === selectedFileName);
    const newPlan = newPlans.find(p => p.fileName === selectedFileName);
    if (oldPlan && newPlan && oldPlan.mtime !== newPlan.mtime) {
      refreshDetail();
    }
  }
  ```

  Wait — this second block is unreachable because `selectionChanged` already checks mtime. But the mtime check in `selectionChanged` uses the wrong index (see Task 3). After Task 3 fixes the index, the `selectionChanged` block alone will be sufficient. So this task only needs the first change.

  LOGGING REQUIREMENTS:
  - Log DEBUG `[tui:refresh] dataTick: calling refreshDetail (viewMode=detail)`
  - Log DEBUG `[tui:refresh] dataTick: calling rebuildTaskList (viewMode=list)`

  Files: `packages/lazyaif/src/views/plans-viewer/tui-view.ts`

### Phase 2: Fix the mtime index bug

- [x] Task 3: Fix `selectionChanged` mtime comparison in `dataTick()` (depends on 1)

  On line 868, the mtime comparison uses `newPlans[selectedIndex]` instead of `newPlans[newIndex]`. Fix it to compare the same plan (identified by `fileName`) before and after:

  ```ts
  const oldSelectedPlan = plans.find(p => p.fileName === selectedFileName);
  const newSelectedPlan = newPlans[newIndex];
  const selectionChanged = newIndex !== selectedIndex || (oldSelectedPlan && newSelectedPlan && oldSelectedPlan.mtime !== newSelectedPlan.mtime);
  ```

  This ensures:
  - If the plan moved position (`newIndex !== selectedIndex`) → `selectionChanged = true`
  - If the plan stayed in place but its mtime changed → `selectionChanged = true`
  - If nothing changed for the selected plan → `selectionChanged = false`

  LOGGING REQUIREMENTS:
  - Log DEBUG `[tui:refresh] selectionChanged=${selectionChanged} oldIndex=${selectedIndex} newIndex=${newIndex} oldMtime=${oldSelectedPlan?.mtime} newMtime=${newSelectedPlan?.mtime}`

  Files: `packages/lazyaif/src/views/plans-viewer/tui-view.ts`

### Phase 3: Ensure task list panel refreshes in list mode

- [x] Task 4: Fix task list rebuild on data changes in list mode (depends on 3)

  In `dataTick()`, when `viewMode === "list"` and `selectionChanged` is true, the task list is already rebuilt (lines 919-923). But the `selectionChanged` check depends on the mtime bug (fixed in Task 3). After the fix, verify that:

  1. If the selected plan's mtime changed (task checkbox toggled) → `selectionChanged = true` → `rebuildTaskList()` is called
  2. If a non-selected plan changed → `selectionChanged = false` → task list for the selected plan stays unchanged (correct behavior)

  No code changes expected beyond verifying the fix from Task 3 propagates correctly. If edge cases are found, add a direct mtime check for the selected plan in the list-mode branch.

  LOGGING REQUIREMENTS:
  - Log DEBUG `[tui:refresh] dataTick: task list rebuild check (showTasks=${showTasks}, selectionChanged=${selectionChanged})`

  Files: `packages/lazyaif/src/views/plans-viewer/tui-view.ts`

### Phase 4: Tests

- [x] Task 5: Write test for `refreshDetail()` — detail view updates after plan file change (depends on 2, 3)

  Create an integration test in `packages/lazyaif/tests/views/plans-viewer/tui-view-refresh.test.ts` that:

  1. Creates a temp repo with `.ai-factory/plans/` containing a fixture plan file
  2. Calls `createPlansTuiApp(renderer, tmpRoot)` 
  3. Navigates to detail mode (select a plan, press Enter or trigger `ITEM_SELECTED`)
  4. Modifies the plan file on disk (toggle a task checkbox from `[ ]` to `[x]`)
  5. Waits for `dataTick` interval (or call it indirectly by waiting ~2.5s with `setTimeout`)
  6. Asserts that the detail view shows updated task status (checkbox count, progress percentage)
  7. Asserts that `currentDetail` renderable was replaced (new ID)

  Use the existing test patterns:
  - `getRenderer()` with `remote: true`
  - `makeTmpRepo()` helper from existing tests
  - `emitKey()` helper for keypress simulation
  - `afterEach` cleanup with `renderer.destroy()` and `rm(tmpRoot, recursive)`

  LOGGING REQUIREMENTS:
  - Log test steps with `console.debug` prefix `[test:refresh]`

  Files: `packages/lazyaif/tests/views/plans-viewer/tui-view-refresh.test.ts`

- [x] Task 6: Write test for mtime index bug fix (depends on 3)

  Create a test that verifies `selectionChanged` is correctly computed when plan sort order shifts:

  1. Create a temp repo with two plan files (A and B, where A is newer/most-recent)
  2. Call `createPlansTuiApp(renderer, tmpRoot)` — plan A is selected (index 0)
  3. Touch plan B's file to make it newer than A (B moves to index 0, A moves to index 1)
  4. Wait for `dataTick`
  5. Assert that the selection follows plan A (reconciliation by `fileName`) and the detail view is refreshed for plan A (not plan B)

  This tests that the mtime comparison uses `newIndex` (the reconciled position) not `selectedIndex` (the old position).

  Files: `packages/lazyaif/tests/views/plans-viewer/tui-view-mtime-index.test.ts`

### Phase 5: Verification

- [x] Task 7: Run typecheck and tests, verify fix (depends on 5, 6)

  Run:
  ```
  cd packages/lazyaif
  bunx tsc --noEmit -p tsconfig.json
  bun test
  ```

  Fix any type errors or test failures. Ensure all existing tests still pass.

  Files: `packages/lazyaif/`