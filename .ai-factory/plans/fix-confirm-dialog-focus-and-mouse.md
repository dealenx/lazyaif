# Plan: Fix confirm dialog focus and mouse interaction

Branch: none (staying on 0.x)
Created: 2026-07-03

## Settings
- Testing: yes
- Logging: verbose
- Docs: no

## Research Context
Source: `/aif-explore` session — confirm dialog arrow/mouse bugs

**Problem:** After opening and closing the delete confirm dialog:
1. Arrow key navigation breaks — focus is not restored to `planList` after `hideDeleteConfirm()`
2. Mouse clicks on the Delete/Cancel buttons don't work — `confirmSelect` has no `onMouseDown` handler (same issue as planList had before, see RESEARCH.md session "Mouse support в TUI планов")

**Root causes:**
- `hideDeleteConfirm()` destroys the overlay + confirm select but never calls `select.focus()` to restore focus to `planList`
- `confirmSelect` (the `SelectRenderable` inside the dialog) lacks `onMouseDown` — `SelectRenderable` does not handle item clicks natively (confirmed in RESEARCH.md)
- `dataTick` and `labelTick` continue running during overlay active — `labelTick` mutates `select.options` and `dataTick` calls `select.setSelectedIndex()`, either of which can steal focus from `confirmSelect`

**Decisions:**
- Restore focus to `planList` in `hideDeleteConfirm()` via `try { select.focus(); } catch {}`
- Add `onMouseDown` handler on `confirmSelect` with click-to-select + click-to-activate (single click = select + activate, matching dialog UX expectations)
- Guard `dataTick` and `labelTick` with `if (confirmOverlay) return;` early exit
- `linesPerItem = 1` for confirm select (because `showDescription: false`)

Goal: Arrow keys and mouse work correctly before, during, and after the delete confirm dialog.

## Tasks

### Phase 1: Focus restoration + tick guards

- [x] Task 1: Restore focus to planList after hideDeleteConfirm

  В `packages/lazyaif/src/views/plans-viewer/tui-view.ts` в функции `hideDeleteConfirm()` (строка ~602):
  После `confirmSelect = null;` и перед обновлением footer, добавить:
  ```ts
  try { select.focus(); } catch (e) { console.warn(`[tui:delete-confirm] restore focus failed`, e); }
  debug(`[tui:delete-confirm] focus restored to planList`);
  ```

  LOGGING REQUIREMENTS:
  - DEBUG: логировать восстановление фокуса на planList
  - WARN: если `select.focus()` падает

  Файлы: `packages/lazyaif/src/views/plans-viewer/tui-view.ts`

- [x] Task 2: Guard dataTick and labelTick while overlay is active

  В `packages/lazyaif/src/views/plans-viewer/tui-view.ts`:
  1. В начале `dataTick` (строка ~976) добавить ранний возврат:
     ```ts
     if (confirmOverlay) {
       debug(`[tui:refresh] data tick skipped (confirm overlay active)`);
       return;
     }
     ```
  2. В начале `labelTick` (строка ~1110) добавить ранний возврат:
     ```ts
     if (confirmOverlay) {
       debug(`[tui:refresh] label tick skipped (confirm overlay active)`);
       return;
     }
     ```

  LOGGING REQUIREMENTS:
  - DEBUG: логировать пропуск tick'ов пока оверлей активен

  Файлы: `packages/lazyaif/src/views/plans-viewer/tui-view.ts`

### Phase 2: Mouse click on confirm dialog buttons

- [x] Task 3: Add onMouseDown handler to confirmSelect for mouse clicks

  В `packages/lazyaif/src/views/plans-viewer/tui-view.ts` в функции `showDeleteConfirm()` (строка ~573):
  После установки `confirmSelect.on(SelectRenderableEvents.ITEM_SELECTED, ...)` добавить `onMouseDown`:

  ```ts
  confirmSelect.onMouseDown = (event: MouseEvent) => {
    if (event.button !== 0) return;
    const localY = event.y - confirmSelect!.screenY;
    if (localY < 0) return;
    const linesPerItem = 1; // showDescription=false → 1 line per item
    const visibleIndex = Math.floor(localY / linesPerItem);
    if (visibleIndex < 0 || visibleIndex >= 2) return;
    debug(`[tui:delete-confirm] mouse click visibleIndex=${visibleIndex}`);
    event.preventDefault();
    event.stopPropagation();
    confirmSelectIndex = visibleIndex;
    confirmSelect!.setSelectedIndex(visibleIndex);
    // Single click activates immediately (dialog UX)
    if (visibleIndex === 0) {
      debug(`[tui:delete-confirm] mouse click → delete`);
      void confirmDelete();
    } else {
      debug(`[tui:delete-confirm] mouse click → cancel`);
      hideDeleteConfirm();
    }
  };
  ```

  LOGGING REQUIREMENTS:
  - DEBUG: логировать координаты клика, visibleIndex, действие (delete/cancel)

  Файлы: `packages/lazyaif/src/views/plans-viewer/tui-view.ts`

### Phase 3: Tests

- [x] Task 4: Add test for focus restoration after hideDeleteConfirm (depends on 1, 2)

  В `packages/lazyaif/tests/views/plans-viewer/tui-view-delete-flow.test.ts`:
  Добавить тест "restores focus to plan list after dialog is dismissed":
  - Открыть TUI с tmp repo (как в существующих тестах)
  - Нажать `d` → оверлей появился
  - Нажать `escape` → оверлей закрылся
  - Нажать стрелку `down` → проверить что `planList` получает событие (selectedIndex изменился)
  - Альтернативно: проверить `select.focused === true` после закрытия оверлея

  LOGGING REQUIREMENTS:
  - DEBUG: логировать шаги теста

  Файлы: `packages/lazyaif/tests/views/plans-viewer/tui-view-delete-flow.test.ts`

- [x] Task 5: Add test for mouse click on confirm dialog buttons (depends on 3)

  В `packages/lazyaif/tests/views/plans-viewer/tui-view-delete-flow.test.ts`:
  Добавить тест "deletes plan when clicking Delete button with mouse":
  - Открыть TUI с tmp repo
  - Нажать `d` → оверлей появился
  - Симулировать mouse click на координатах Delete кнопки (вычислить screenY confirmSelect + 0)
  - Проверить что файл удалён
  Добавить тест "cancels when clicking Cancel button with mouse":
  - Нажать `d` → оверлей появился
  - Симулировать mouse click на координатах Cancel кнопки (confirmSelect.screenY + 1)
  - Проверить что файл НЕ удалён и оверлей закрыт

  Для симуляции мыши использовать `renderer` mouse event dispatch или `confirmSelect.processMouseEvent()`.
  Если remote mode не поддерживает mouse dispatch, добавить unit-тест на `onMouseDown` handler напрямую.

  LOGGING REQUIREMENTS:
  - DEBUG: логировать шаги теста

  Файлы: `packages/lazyaif/tests/views/plans-viewer/tui-view-delete-flow.test.ts`