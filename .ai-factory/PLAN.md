# Plan: Delete plan with confirmation overlay (Issue #8)

Branch: none
Created: 2026-07-03

## Settings
- Testing: yes
- Logging: verbose
- Docs: no

## Research Context
Source: .ai-factory/RESEARCH.md (Active Summary) + Issue #8 exploration

Goal: Добавить возможность удаления плана из TUI с подтверждением через overlay-модал.
Constraints:
  - `createPlansTuiApp` в `tui-view.ts:328-821` — единая точка управления состоянием TUI
  - Глобальный keypress handler в `tui-view.ts:609-648` — уже обрабатывает `tab`, `escape`, `q`
  - `plan.path` — относительный путь от rootDir (OS-sep-joined), `join(rootDir, plan.path)` даёт абсолютный путь
  - `dataTick` (2s interval) уже детектирует удаление файлов через `stat()` throw → full rescan → reconcile selection
  - opentui поддерживает `position: "absolute"`, `zIndex`, `top/left/width/height` на `BoxRenderable`
  - Footer уже использует `position: "absolute", bottom: 0` — паттерн подтверждён
  - Нет встроенного modal/dialog компонента — собираем из `BoxRenderable` + `TextRenderable`
  - При удалении последнего плана `createPlansTuiApp` не перерисовывает empty state динамически — нужен handle
Decisions:
  - Триггер: клавиша `d` в list mode (где виден список планов)
  - Подтверждение: overlay-модал с `y` (подтвердить) / `n` или `Esc` (отмена)
  - Overlay: `BoxRenderable` с `position: "absolute", zIndex: 100` поверх root
  - Удаление: `await unlink(join(rootDir, plan.path))` — `plan.path` уже корректный относительный путь
  - После удаления — немедленный rescan через `dataTick()` для мгновенного UX (не ждать 2s)
  - `confirmOverlayActive` flag в замыкании `keypressHandler` — пока активен, перехватывает все клавиши
  - `HOTKEYS_LIST` обновить — добавить `· d: delete`
  - Handle edge case: после удаления всех планов — показать empty state, выйти из detail mode
  - Cleanup overlay в `destroy()` функции
  - Экспортировать `renderDeleteConfirm` функцию для unit-тестирования

## Tasks

### Phase 1: Delete confirmation overlay component
- [x] Task 1: Add `renderDeleteConfirm` function in `tui-view.ts`

  Добавить экспортируемую функцию `renderDeleteConfirm(renderer: CliRenderer, plan: Plan): BoxRenderable` в `packages/lazyaif/src/views/plans-viewer/tui-view.ts` (после `renderTaskDetail`, перед `appendMarkdownDeferred`).

  Функция создаёт overlay:
  - `overlay` — `BoxRenderable` с `id: "delete-confirm-overlay"`, `position: "absolute"`, `top: 0`, `left: 0`, `width: "100%"`, `height: "100%"`, `zIndex: 100`, `backgroundColor: colors.bgAlt` (полупрозрачный фон через `rgba` если поддерживается, иначе `colors.bg`)
  - `dialog` — `BoxRenderable` с `id: "delete-confirm-dialog"`, `width: 50`, `height: 7`, `border: true`, `borderStyle: "single"`, `borderColor: colors.notStarted`, `backgroundColor: colors.bgAlt`, `flexDirection: "column"`, `padding: 1`, `justifyContent: "center"`, `alignItems: "center"`
  - `title` — `TextRenderable` с `id: "delete-confirm-title"`, контент `t\`${bold(fg(colors.notStarted)("⚠ Delete plan"))}\``
  - `body` — `TextRenderable` с `id: "delete-confirm-body"`, контент `t\`Delete ${plan.fileName}? This cannot be undone.\``
  - `hint` — `TextRenderable` с `id: "delete-confirm-hint"`, контент `t\`${fg(colors.muted)("y: confirm · Esc/n: cancel")}\``
  - Добавить `title`, `body`, `hint` в `dialog`, `dialog` в `overlay`
  - Вернуть `overlay`

  LOGGING REQUIREMENTS:
  - DEBUG: логировать создание overlay для plan=`${plan.fileName}`
  - Использовать существующий `debug()` helper

  Файлы: `packages/lazyaif/src/views/plans-viewer/tui-view.ts`

- [x] Task 2: Add delete logic with overlay state management in `createPlansTuiApp`

  В `packages/lazyaif/src/views/plans-viewer/tui-view.ts` в функции `createPlansTuiApp`:

  1. Добавить import `unlink` из `node:fs/promises` (дополнить существующий import на line 29)
  2. Добавить замыкание `let confirmOverlay: BoxRenderable | null = null;` (рядом с `currentDetail` на line 381)
  3. Добавить функции `showDeleteConfirm` и `hideDeleteConfirm`:
     - `showDeleteConfirm()`: если `confirmOverlay` не null — return (уже активен). Взять `plans[selectedIndex]`, если нет — return. Создать overlay через `renderDeleteConfirm(renderer, plan)`, `root.add(overlay)`, `confirmOverlay = overlay`, `renderer.requestRender()`
     - `hideDeleteConfirm()`: если `confirmOverlay` — `root.remove(confirmOverlay.id)`, `confirmOverlay.destroyRecursively()`, `confirmOverlay = null`, `renderer.requestRender()`
  4. Добавить функцию `confirmDelete()`:
     - Взять `plans[selectedIndex]`, если нет — `hideDeleteConfirm()`, return
     - Вычислить путь: `const fullPath = join(rootDir, plan.path)`
     - `await unlink(fullPath)`
     - `hideDeleteConfirm()`
     - Если были в detail mode → `enterListMode()`
     - Вызвать `dataTick()` немедленно для мгновенного обновления списка (через `void dataTick()`)
     - Handle edge case: если после rescan `plans.length === 0` → удалить planList из bodyRow, показать empty state (как в init lines 345-366)
  5. Добавить cleanup в `destroy()` (line 801): `if (confirmOverlay) { try { root.remove(confirmOverlay.id); } catch {} }`

  LOGGING REQUIREMENTS:
  - DEBUG: логировать каждый шаг — show overlay, confirm, cancel, unlink path, rescan result
  - WARN: если unlink падает — логировать с путём и ошибкой
  - Использовать существующий `debug()` helper

  Файлы: `packages/lazyaif/src/views/plans-viewer/tui-view.ts`

### Phase 2: Keypress handler integration
- [x] Task 3: Wire `d`, `y`, `n` keys into keypress handler

  В `packages/lazyaif/src/views/plans-viewer/tui-view.ts` в `keypressHandler` (lines 609-648):

  1. **В начале handler'а** (после `event.repeated` check на line 610) — если `confirmOverlay` активен, перехватывать все клавиши:
     ```ts
     if (confirmOverlay) {
       event.preventDefault();
       if (event.name === "y") { void confirmDelete(); return; }
       if (event.name === "n" || event.name === "escape") { hideDeleteConfirm(); return; }
       return; // игнорировать все остальные клавиши пока overlay активен
     }
     ```
  2. **После `escape` блока, перед `q`** — добавить обработку `d`:
     ```ts
     if (event.name === "d") {
       event.preventDefault();
       if (viewMode !== "list" || plans.length === 0) return;
       showDeleteConfirm();
       return;
     }
     ```

  LOGGING REQUIREMENTS:
  - DEBUG: логировать keypress когда overlay активен (name, action: confirm/cancel/ignored)
  - DEBUG: логировать `d` trigger (index, plan filename)

  Файлы: `packages/lazyaif/src/views/plans-viewer/tui-view.ts`

- [x] Task 4: Update HOTKEYS_LIST and footer to show `d: delete`

  В `packages/lazyaif/src/clients/tui/components/footer.ts`:
  - Обновить `HOTKEYS_LIST` (line 6) — добавить `· d: delete` перед `· auto-refresh`:
    `"Arrows/Wheel: navigate · Enter/Tab/Dbl-click: open · Click: select · d: delete · Tasks panel: auto (width≥100) · auto-refresh: 2s · q: quit"`
  - Добавить `export const HOTKEYS_CONFIRM = "y: confirm delete · Esc/n: cancel";`
  - В `index.ts` добавить `HOTKEYS_CONFIRM` в export из `footer.js`

  В `packages/lazyaif/src/views/plans-viewer/tui-view.ts`:
  - Импортировать `HOTKEYS_CONFIRM` (добавить в существующий import на line 27)
  - В `showDeleteConfirm()` — обновить footer: `footerBox.hotkeysText.content = HOTKEYS_CONFIRM`
  - В `hideDeleteConfirm()` — восстановить footer: `footerBox.hotkeysText.content = viewMode === "list" ? HOTKEYS_LIST : HOTKEYS_DETAIL`

  LOGGING REQUIREMENTS:
  - DEBUG: логировать обновление footer hotkeys при show/hide overlay

  Файлы: `packages/lazyaif/src/clients/tui/components/footer.ts`, `packages/lazyaif/src/clients/tui/components/index.ts`, `packages/lazyaif/src/views/plans-viewer/tui-view.ts`

### Phase 3: Edge cases
- [x] Task 5: Handle empty plans state after deleting all plans

  В `packages/lazyaif/src/views/plans-viewer/tui-view.ts` в функции `confirmDelete` (из Task 2):

  После `dataTick()` rescan, если `plans.length === 0`:
  1. Если в detail mode → `enterListMode()`
  2. Удалить `planList` из `bodyRow` (если mounted): `bodyRow.remove(planList.id)`, `listMounted = false`
  3. Удалить `taskList` из `bodyRow` через `removeTaskList()`
  4. Создать empty state box (аналогично lines 345-366):
     - `emptyBox` с `id: "tui-empty"`, `width: "100%"`, `height: "100%"`, `flexDirection: "column"`, `justifyContent: "center"`, `alignItems: "center"`
     - `emptyText` с контентом "All plans deleted.", цвет `colors.notStarted`
     - `emptyBox.add(emptyText)`, `bodyRow.add(emptyBox)`
  5. `renderer.requestRender()`

  Также: в `dataTick` (lines 656-743) добавить проверку — если `plans.length === 0` после rescan и `emptyBox` ещё не показан, показать empty state. Если plans появились (внешне добавили файл) — убрать empty state. Это делает empty state динамическим.

  LOGGING REQUIREMENTS:
  - DEBUG: логировать переход в empty state (plans.length=0)
  - DEBUG: логировать выход из empty state (plans restored)

  Файлы: `packages/lazyaif/src/views/plans-viewer/tui-view.ts`

### Phase 4: Tests
- [x] Task 6: Write tests for `renderDeleteConfirm` overlay component (depends on 1)

  В `packages/lazyaif/tests/views/plans-viewer/` добавить тест `tui-view-delete.test.ts`:
  - Использовать паттерн из `tui-view-detail.test.ts` (createCliRenderer remote mode)
  - Создать mock `Plan` (как `partialPlan` в существующем тесте)
  - Вызвать `renderDeleteConfirm(r, mockPlan)`
  - Проверить что overlay имеет id `delete-confirm-overlay`
  - Проверить наличие `TextRenderable` с id `delete-confirm-title`, `delete-confirm-body`, `delete-confirm-hint`
  - Использовать `findDescendantById` или обход через `getRenderable`

  LOGGING REQUIREMENTS:
  - DEBUG: логировать шаги теста

  Файлы: `packages/lazyaif/tests/views/plans-viewer/tui-view-delete.test.ts`

- [x] Task 7: Write integration test for delete flow with temp repo (depends on 2, 3, 4, 5)

  В `packages/lazyaif/tests/views/plans-viewer/` добавить тест `tui-view-delete-flow.test.ts`:
  - Использовать паттерн из `tui-view-responsive.test.ts` (tmp dir + fixtures + createPlansTuiApp)
  - Создать tmp dir с `.ai-factory/plans/` и 2 fixture `.md` файла
  - Вызвать `createPlansTuiApp(renderer, tmpRoot)`
  - Симулировать нажатие `d` через `renderer.keyInput.processParsedKey({ name: "d", ctrl: false, meta: false, shift: false, sequence: "d", repeated: false })` (или emit "keypress" event)
  - Проверить что overlay появился: `r.root.findDescendantById("delete-confirm-overlay")` определён
  - Симулировать нажатие `y`
  - Проверить что файл удалён: `fs.access(fullPath)` должен throw ENOENT
  - Проверить что overlay исчез: `findDescendantById` вернул undefined
  - Проверить что plans список обновился (остался 1 план)
  - Тест отмены: нажать `d`, затем `n` → файл не удалён, overlay исчез
  - Cleanup tmp dir в afterEach

  LOGGING REQUIREMENTS:
  - DEBUG: логировать шаги теста

  Файлы: `packages/lazyaif/tests/views/plans-viewer/tui-view-delete-flow.test.ts`