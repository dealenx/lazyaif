# Plan: Back arrow button on plan detail page (Issue #9)

Branch: none
Created: 2026-07-03

## Settings
- Testing: yes
- Logging: verbose
- Docs: no

## Research Context
Source: .ai-factory/RESEARCH.md (Active Summary) + Issue #9 exploration

Goal: Добавить кнопку-стрелку "← Back" на странице просмотра плана (detail mode). Двойной клик по кнопке возвращает в список планов.
Constraints:
  - `createPlansTuiApp` в `tui-view.ts:389-1060` — единая точка управления состоянием TUI
  - Текущая навигация detail→list: `Tab` (toggle), `Esc` (detail→list only) — `tui-view.ts:790-818`
  - `enterDetailMode()` (`tui-view.ts:562-610`) монтирует detail ScrollBox в `bodyRow`
  - `enterListMode()` (`tui-view.ts:612-641`) удаляет detail и монтирует planList обратно
  - `bodyRow` имеет `flexDirection: "row"` — для вертикальной композиции (backBar сверху, detail снизу) нужен column-контейнер
  - Существующий double-click паттерн в `renderPlanList` (`tui-view.ts:117-144`): `lastClickTime`/`lastClickIndex`, `DOUBLE_CLICK_MS = 300`
  - `BoxRenderable` поддерживает `onMouseDown` setter (наследуется от `Renderable`)
  - `MouseEvent` содержит `button` (0=LEFT), `x`, `y`, `type` ("down"/"up")
  - Footer уже обновляется динамически через `footerBox.hotkeysText.content` (`tui-view.ts:743-746`)
  - `HOTKEYS_DETAIL` в `footer.ts:7` — нужно обновить для упоминания back button
Decisions:
  - Кнопка "← Back (double-click)" — отдельная полоса (`BoxRenderable`, height: 1) над detail контентом
  - Composition: создать `detailContainer` (`BoxRenderable`, `flexDirection: "column"`, width: "100%", height: "100%") как обёртку для backBar + detail в detail mode
  - `bodyRow.remove(detailContainer.id)` заменяет `bodyRow.remove(currentDetail.id)` в `enterListMode`/`refreshDetail`
  - Double-click detection: переиспользовать паттерн `lastClickTime`/`DOUBLE_CLICK_MS = 300` из `renderPlanList`
  - Single click — no-op (просто визуальный feedback через cursor/цвет); double-click → `enterListMode()`
  - Back bar: `BoxRenderable` с `id: "detail-back-bar"`, `height: 1`, `width: "100%"`, `backgroundColor: colors.bgAlt`
  - Back bar text: `TextRenderable` с `id: "detail-back-bar-text"`, контент `t\`${fg(colors.accent)("← Back")}  ${fg(colors.muted)("(double-click to return to list)")}\``
  - `onMouseDown` на back bar: `if (event.button !== 0) return;` → double-click detection → вызов callback `onBack()`
  - `renderTaskDetail` остаётся без изменений — back bar добавляется на уровне `createPlansTuiApp`
  - `HOTKEYS_DETAIL` обновить: `"Arrows/PageUp/PageDown: scroll · Tab/Esc/Dbl-click ←: back · auto-refresh: 2s · q: quit"`
  - Cleanup: `detailContainer` уничтожается вместе с detail в `enterListMode` и `refreshDetail`
  - В `destroy()` cleanup не нужен дополнительно — `detailContainer` уничтожается через `currentDetail.renderable.destroy()` (scroll внутри container)

## Tasks

### Phase 1: Back bar component
- [x] Task 1: Add `renderBackBar` function in `tui-view.ts`

  Добавить экспортируемую функцию `renderBackBar(renderer: CliRenderer, onBack: () => void): BoxRenderable` в `packages/lazyaif/src/views/plans-viewer/tui-view.ts` (после `renderTaskDetail`, перед `renderDeleteConfirm`).

  Функция создаёт полосу "← Back":
  - `bar` — `BoxRenderable` с `id: "detail-back-bar"`, `width: "100%"`, `height: 1`, `backgroundColor: colors.bgAlt`, `flexDirection: "row"`, `alignItems: "center"`, `padding: 0`
  - `text` — `TextRenderable` с `id: "detail-back-bar-text"`, контент `t\`${fg(colors.accent)("\u2190 Back")}  ${fg(colors.muted)("(double-click to return to list)")}\``
  - `bar.add(text)`
  - Double-click detection (переиспользовать паттерн из `renderPlanList`):
    ```ts
    let lastClickTime = 0;
    const DOUBLE_CLICK_MS = 300;
    bar.onMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const now = Date.now();
      if (now - lastClickTime < DOUBLE_CLICK_MS) {
        debug(`[tui:back-bar] double click -> back to list`);
        lastClickTime = 0;
        onBack();
      } else {
        lastClickTime = now;
      }
    };
    ```
  - Вернуть `bar`

  LOGGING REQUIREMENTS:
  - DEBUG: логировать каждый mousedown (button, time since last click)
  - DEBUG: логировать double-click detected → calling onBack()
  - Использовать существующий `debug()` helper

  Файлы: `packages/lazyaif/src/views/plans-viewer/tui-view.ts`

- [x] Task 2: Integrate back bar into `enterDetailMode` and `enterListMode` via detail container

  В `packages/lazyaif/src/views/plans-viewer/tui-view.ts` в функции `createPlansTuiApp`:

  1. Изменить тип `currentDetail` на `{ id: string; renderable: BoxRenderable }` (был `ScrollBoxRenderable`), поскольку теперь это `detailContainer` (column-Box), а не голый ScrollBox
  2. В `enterDetailMode()` (lines 562-610):
     - После создания `detail` (ScrollBox) — создать `detailContainer`:
       ```ts
       const containerId = `detail-container-${selectedIndex}`;
       const detailContainer = new BoxRenderable(renderer, {
         id: containerId,
         flexDirection: "column",
         width: "100%",
         height: "100%",
       });
       const backBar = renderBackBar(renderer, () => {
         debug(`[tui:back-bar] onBack callback -> enterListMode`);
         enterListMode();
       });
       detailContainer.add(backBar);
       detailContainer.add(detail);
       bodyRow.add(detailContainer);
       currentDetail = { id: containerId, renderable: detailContainer };
       ```
     - Заменить `bodyRow.add(detail)` на `bodyRow.add(detailContainer)`
     - `detail.focus()` вызывать на исходном `detail` (ScrollBox), не на container
  3. В `enterListMode()` (lines 612-641):
     - Заменить `bodyRow.remove(currentDetail.id)` и `currentDetail.renderable.destroy()` — теперь `currentDetail.id` = containerId, `currentDetail.renderable` = BoxRenderable (container). `destroy()` на container уничтожит backBar и detail recursively
  4. В `refreshDetail()` (lines 643-682):
     - Та же замена: `bodyRow.remove(currentDetail.id)` → удаляет container
     - Пересоздание: создать новый `detailContainer` + `backBar` + `detail` по тому же паттерну что в `enterDetailMode`
  5. `pendingMarkdownTimer` и `appendMarkdownDeferred` — `scroll` параметр остаётся исходным `detail` (ScrollBox), не container

  LOGGING REQUIREMENTS:
  - DEBUG: логировать создание detailContainer (id, selectedIndex)
  - DEBUG: логировать добавление backBar в container
  - DEBUG: логировать удаление container в enterListMode/refreshDetail

  Файлы: `packages/lazyaif/src/views/plans-viewer/tui-view.ts`

### Phase 2: Footer update
- [x] Task 3: Update `HOTKEYS_DETAIL` to mention double-click back

  В `packages/lazyaif/src/clients/tui/components/footer.ts`:
  - Обновить `HOTKEYS_DETAIL` (line 7):
    `"Arrows/PageUp/PageDown: scroll · Tab/Esc/Dbl-click \u2190: back · auto-refresh: 2s · q: quit"`

  Файлы: `packages/lazyaif/src/clients/tui/components/footer.ts`

### Phase 3: Tests
- [x] Task 4: Write unit tests for `renderBackBar` component (depends on 1)

  В `packages/lazyaif/tests/views/plans-viewer/` добавить тест `tui-view-back-bar.test.ts`:
  - Использовать паттерн из `tui-view-delete.test.ts` (createCliRenderer remote mode, afterEach cleanup)
  - Вызвать `renderBackBar(r, () => {})` — передать no-op callback
  - Проверить что bar имеет id `detail-back-bar`
  - Проверить наличие `TextRenderable` с id `detail-back-bar-text` через `bar.findDescendantById("detail-back-bar-text")`
  - Проверить что callback вызывается при double-click: передать callback с флагом, симулировать два `onMouseDown` события с `button: 0` в пределах 300ms, проверить что флаг установлен
  - Проверить что single click НЕ вызывает callback: один `onMouseDown`, проверить что флаг не установлен
  - Для симуляции mouse events: вызвать `(bar as any).onMouseDown({ button: 0, preventDefault: () => {}, stopPropagation: () => {} } as any)` дважды

  LOGGING REQUIREMENTS:
  - DEBUG: логировать шаги теста

  Файлы: `packages/lazyaif/tests/views/plans-viewer/tui-view-back-bar.test.ts`

- [x] Task 5: Write integration test for back button double-click flow (depends on 2, 3)

  В `packages/lazyaif/tests/views/plans-viewer/` добавить тест `tui-view-back-flow.test.ts`:
  - Использовать паттерн из `tui-view-delete-flow.test.ts` (tmp dir + fixtures + createPlansTuiApp + emitKey)
  - Создать tmp dir с `.ai-factory/plans/` и 1 fixture `.md` файлом
  - Вызвать `createPlansTuiApp(renderer, tmpRoot)`
  - Войти в detail mode: `emitKey(r, "return", "\r")` (Enter)
  - Проверить что `detail-back-bar` появился: `r.root.findDescendantById("detail-back-bar")` определён
  - Проверить что `detail-back-bar-text` появился: `r.root.findDescendantById("detail-back-bar-text")` определён
  - Достать back bar renderable и симулировать double-click:
    - Найти back bar через `r.root.findDescendantById("detail-back-bar")`
    - Вызвать `(backBar as any).onMouseDown({ button: 0, preventDefault: () => {}, stopPropagation: () => {} })` дважды быстро
  - Проверить что вернулись в list mode: `r.root.findDescendantById("plan-list")` определён, `r.root.findDescendantById("detail-back-bar")` не определён
  - Cleanup: `app.destroy()` + `rm(tmpRoot)` в afterEach

  LOGGING REQUIREMENTS:
  - DEBUG: логировать шаги теста

  Файлы: `packages/lazyaif/tests/views/plans-viewer/tui-view-back-flow.test.ts`