# Implementation Plan: TUI Tasks Side Panel (responsive)

Branch: none (no-git-switch)
Created: 2026-06-30

## Settings
- Testing: yes
- Logging: verbose
- Docs: yes  # mandatory docs checkpoint in /aif-implement, /aif-docs step required

## Goal

Добавить в TUI plans-viewer правую панель со списком Tasks выбранного плана.
Видеть список задач рядом со списком планов — чтобы быстро понимать, какие
задачи внутри плана (например, в `aif-explore`, `aif-fix`, `aif-implement`),
без необходимости открывать детальный режим.

## Requirements

### Функциональные
1. В TUI dashboard по умолчанию — две колонки:
   - левая (40%): список планов (текущий `renderPlanList`)
   - правая (60%): плоский список Tasks выбранного плана
2. В каждой строке Tasks: чекбокс (`[x]` / `[ ]`), `id`, `title` плана
3. При навигации по списку планов (стрелки) — правая панель обновляется
4. Список задач НЕ интерактивный (только просмотр, фокус остаётся на планах)
5. При входе в detail-mode (Enter/Tab) — правая панель Tasks СКРЫВАЕТСЯ,
   занимает 100% ширины как сейчас
6. Возврат из detail → list — Tasks-панель восстанавливается

### Responsive (маленький экран)
- Если `renderer.width < 100` — Tasks-панель скрывается, plan-list занимает 100%
- При ресайзе окна (если поддерживается renderer.onResize) — пересчитывать
- Без ресайз-подписки достаточно проверки на момент инициализации; для
  текущей версии @opentui/core@0.4.2 хватит одноразовой проверки + фоллбэка
  через перезапуск

## Architecture

### Layout (двухпанельный)

```
┌──────────────────────────────────────────────────┐
│ Header: AI-Factory Plans                         │
├────────────────────┬─────────────────────────────┤
│ [fast] PLAN.md     │  ☑ 1: Parse plan file       │
│ 0/3    0%   ⏳ …   │  ☐ 2: Compute status        │
│ [full] feature-... │  ☑ 3: Render list           │
│ 5/8   63%   ⏳ …   │  ☐ 4: Build TUI app         │
│ [full] tui-auto... │  ☐ 5: Add tests             │
│ 7/7  100%   ✅ …   │                             │
│ …                  │                             │
├────────────────────┴─────────────────────────────┤
│ Footer: hotkeys                                   │
└──────────────────────────────────────────────────┘
```

### Responsive (однопанельный, width < 100)

```
┌──────────────────────────────────────────────────┐
│ Header: AI-Factory Plans                         │
├──────────────────────────────────────────────────┤
│ [fast] PLAN.md                                    │
│ 0/3    0%   ⏳ …                                  │
│ [full] feature-...                                │
│ 5/8   63%   ⏳ …                                  │
│ …                                                 │
├──────────────────────────────────────────────────┤
│ Footer: hotkeys                                   │
└──────────────────────────────────────────────────┘
```

### File Changes

| File | Change |
|---|---|
| `src/views/plans-viewer/task-list-view.ts` | **NEW** — `renderTaskList(plan, id, width)` returns `BoxRenderable` (header + scrollable list) |
| `src/views/plans-viewer/tui-view.ts` | Modify `createPlansTuiApp`: responsive layout, manage task-list lifecycle, integrate with `enterDetailMode` / `enterListMode`, update `dataTick` on selection change |
| `src/clients/tui/components/footer.ts` | Update `HOTKEYS_LIST` — add hint about the side panel |
| `README.md` | Document the two-pane mode + responsive behavior |
| `tests/views/plans-viewer/task-list-view.test.ts` | **NEW** — render test (createCliRenderer), check id, structure, content |
| `tests/views/plans-viewer/tui-view-responsive.test.ts` | **NEW** — verify width>=100 mounts tasks panel, width<100 does not |

### Algorithm: Responsive decision

```ts
const RESPONSIVE_THRESHOLD = 100; // cols
function shouldShowTasksPanel(renderer: CliRenderer): boolean {
  return renderer.width >= RESPONSIVE_THRESHOLD;
}
```

At `createPlansTuiApp`:
- Compute `showTasks = shouldShowTasksPanel(renderer)`
- If `showTasks`: `bodyRow` is a `flexDirection: "row"` containing `planList` (40%) + `taskList` (60%)
- If not: `bodyRow` is `flexDirection: "column"` containing only `planList` (100%)

### Algorithm: taskList update on selection change

The existing `onSelect(index)` callback already fires on arrow navigation.
It currently debounces a re-mount of the detail view. We extend it so the
task-list panel is also re-rendered whenever `showTasks === true` and we are
in `list` mode.

```ts
onSelect(index) {
  selectedIndex = clampSelection(index, plans.length);
  if (showTasks && viewMode === "list") {
    rebuildTaskList(); // remove old taskList from bodyRow, create new with plans[selectedIndex]
  }
  if (viewMode === "detail") {
    pendingSelectTimer = setTimeout(() => enterDetailMode(), DEBOUNCE_MS);
  }
}
```

`rebuildTaskList()`:
1. If `currentTaskList` is mounted, `bodyRow.remove(currentTaskList.id)` and `destroy()` it
2. Create new `renderTaskList(plans[selectedIndex], id, "100%")` (within the column)
3. `bodyRow.add(taskList)` after `planList` in the row
4. `currentTaskList = { id, renderable }`

### Algorithm: detail mode hides tasks

In `enterDetailMode()`:
- If `showTasks` and `currentTaskList` mounted → remove + destroy it
- Mount detail as `width: "100%"` of `bodyRow`

In `enterListMode()`:
- Mount `planList` back
- If `showTasks` → re-mount `taskList` for `plans[selectedIndex]`

### Logging conventions

- `[tui:task-list] rendering plan=<fileName> tasks=<N>`
- `[tui:task-list] rebuilt for plan=<fileName> index=<N>`
- `[tui:task-list] hidden (responsive width=<N> <threshold=<N>>)`
- `[tui:responsive] showTasks=<bool> width=<N> threshold=<N>`
- `[tui:mode] enterDetailMode: hiding task list (showTasks=<bool>)`
- `[tui:mode] enterListMode: restoring task list for plan=<fileName>`

## Tasks

### Phase 1: Task list view (component)
- [x] Task 1: Создать `src/views/plans-viewer/task-list-view.ts` (depends on nothing)

  Новый компонент, рендерит плоский список задач выбранного плана.
  Не интерактивный — только отображение.

  Требования:
  - Экспортировать `renderTaskList(renderer, plan, id, width)` → `ScrollBoxRenderable`
  - Внутри `ScrollBox`:
    - Title: `Tasks (done/total)` — например `Tasks (3/7)` цветом `colors.muted`
    - Для каждой задачи: line с префиксом `☑`/`☐` (Unicode U+2611/U+2610),
      затем `id: title`
    - Цвет строки: `colors.done` (зелёный) если `task.done === true`,
      иначе `colors.fg` (default)
    - Если `plan.tasks.length === 0` — показать `"(no tasks)"` цветом `colors.muted`
  - `viewportCulling: true` для производительности на длинных планах
  - Использовать только `BoxRenderable`, `TextRenderable`, `ScrollBoxRenderable` из `@opentui/core`
  - Импортировать цвета из `../../clients/tui/components/theme.js`
  - НЕ использовать модули из `plans-viewer/types.js` в type-импортах — типы берутся из parameter `plan: Plan`

  Файлы: `src/views/plans-viewer/task-list-view.ts`

  LOGGING REQUIREMENTS:
  - `[tui:task-list] rendering plan=<fileName> tasks=<N> id=<id> width=<width>`
  - `[tui:task-list] empty plan=<fileName> tasks=0`

### Phase 2: Integration into tui-view

- [x] Task 2: Модифицировать `src/views/plans-viewer/tui-view.ts` — добавить responsive layout (depends on 1)

  Интегрировать task-list-view в основной TUI app.

  Требования:
  - Импортировать `renderTaskList` из `./task-list-view.js`
  - Добавить константу `RESPONSIVE_THRESHOLD = 100` (рядом с DATA_REFRESH_MS)
  - В `createPlansTuiApp`:
    - Вычислить `showTasks = renderer.width >= RESPONSIVE_THRESHOLD` (использовать `renderer.width` getter)
    - Залогировать `[tui:responsive] showTasks=<bool> width=<N> threshold=<N>`
    - Если `showTasks`:
      - `planList.width = "40%"`, `taskList.width = "60%"`, `bodyRow` = row
    - Иначе:
      - `planList.width = "100%"`, `bodyRow` = column
  - Ввести `let currentTaskList: { id: string; renderable: ScrollBoxRenderable } | null = null`
  - Ввести `let currentTaskListPlanFileName: string | null = null` — guard на
    re-render, чтобы не дёргать `rebuildTaskList` если план не сменился
  - Создать helper `rebuildTaskList()`:
    1. `const plan = plans[selectedIndex]`
    2. Если `currentTaskListPlanFileName === plan.fileName` → no-op
    3. Удалить старый `currentTaskList` из `bodyRow` (если mounted), destroy()
    4. Создать новый `renderTaskList(renderer, plan, "task-list-${selectedIndex}", "100%")`
    5. `bodyRow.add(taskList)` — после `planList`
    6. Сохранить в `currentTaskList`
  - В `onSelect` callback (после `clamped` вычисления):
    - Если `showTasks && viewMode === "list"` → вызвать `rebuildTaskList()`
  - В `enterDetailMode()`:
    - Если `currentTaskList` mounted → удалить из `bodyRow`, destroy(), `currentTaskList = null`
  - В `enterListMode()`:
    - После монтирования `planList`, если `showTasks` → вызвать `rebuildTaskList()`
  - В `dataTick` (refresh):
    - После обновления `plans`/`statuses`/`selectedIndex`:
      - Если `showTasks && viewMode === "list"` → `rebuildTaskList()`
      - Иначе `currentTaskListPlanFileName = null` (чтобы следующий `rebuildTaskList` перерисовал)
    - При смене `selectedIndex` ИЛИ при изменении `mtime` текущего плана — сбросить guard и перерисовать
  - В `destroy` callback — если `currentTaskList` mounted → destroy()

  Файлы: `src/views/plans-viewer/tui-view.ts`

  LOGGING REQUIREMENTS:
  - `[tui:responsive] showTasks=<bool> width=<N> threshold=<N>` (на init)
  - `[tui:task-list] rebuild plan=<fileName> index=<N>` (на onSelect)
  - `[tui:task-list] rebuild skipped (same plan=<fileName>)` (на guard hit)
  - `[tui:mode] enterDetailMode: hiding task list (showTasks=<bool>)`
  - `[tui:mode] enterListMode: restoring task list for plan=<fileName>`
  - `[tui:refresh] data tick: task list rebuilt for plan=<fileName>`

### Phase 3: Footer hotkeys hint

- [x] Task 3: Обновить `src/clients/tui/components/footer.ts` — расширить `HOTKEYS_LIST` (depends on 2)

  Добавить упоминание tasks-панели в подсказку hotkeys.

  Требования:
  - `HOTKEYS_LIST` сейчас: `"Arrows: navigate · Enter/Tab: open · Mouse click: select · auto-refresh: 2s · q: quit"`
  - Новая: `"Arrows: navigate · Enter/Tab: open · Mouse click: select · Tasks panel: auto · auto-refresh: 2s · q: quit"`
  - Конкретный текст — на усмотрение implementer, главное чтобы было упомянуто `Tasks panel`
  - Никаких изменений в `HOTKEYS_DETAIL` — он не относится к list-mode

  Файлы: `src/clients/tui/components/footer.ts`

  LOGGING REQUIREMENTS:
  - Никаких новых логов (компонент и так логирует в renderFooter)

### Phase 4: Tests

- [x] Task 4: Создать `tests/views/plans-viewer/task-list-view.test.ts` (depends on 1)

  Unit-тест для нового компонента.

  Требования:
  - Использовать `bun:test` + `createCliRenderer({ remote: true, useMouse: false, exitOnCtrlC: false })`
  - Импортировать `renderTaskList` из `../../../src/views/plans-viewer/task-list-view.js`
  - Импортировать тип `Plan` из `../../../src/modules/plans-viewer/types.js`
  - Создать mock `Plan` с 5 tasks (2 done, 3 not done)
  - Проверить:
    1. `renderTaskList(renderer, mockPlan, "test-id", 30)` возвращает `ScrollBoxRenderable` с id `test-id`
    2. Внутри есть child с id `test-id-title` (заголовок `Tasks (2/5)`)
    3. Внутри есть 5 task-renderable элементов
    4. Каждый task-элемент содержит либо `☑` либо `☐` (по `done`)
  - Использовать `afterEach` для `renderer.destroy()`

  Файлы: `tests/views/plans-viewer/task-list-view.test.ts`

  LOGGING REQUIREMENTS:
  - Тесты не логируют

- [x] Task 5: Создать `tests/views/plans-viewer/tui-view-responsive.test.ts` (depends on 2)

  Тест responsive-логики `createPlansTuiApp`.

  Требования:
  - Использовать `bun:test` + `createCliRenderer({ remote: true, useMouse: false, exitOnCtrlC: false, width: 80, height: 24 })`
  - Использовать `createCliRenderer({ ... width: 120, height: 24 })` для второго случая
  - Использовать fixture `tests/fixtures/full-plan-partial.md` для тестовых планов
  - Использовать `scanAiFactory` из `../../../src/modules/plans-viewer/scanner.js` для получения планов
  - Создать временную директорию с `.ai-factory/plans/<fixture>.md` через `fs.cp`
  - Проверить:
    1. При `width=80` (< 100) — bodyRow содержит только planList, без task-list
    2. При `width=120` (>= 100) — bodyRow содержит planList + task-list
    3. Task-list рендерится с правильным количеством tasks (из fixture)
  - Cleanup: удалить временную директорию, `renderer.destroy()`

  Файлы: `tests/views/plans-viewer/tui-view-responsive.test.ts`

  LOGGING REQUIREMENTS:
  - Тесты не логируют

### Phase 5: Docs

- [x] Task 6: Обновить `README.md` — описать tasks panel + responsive (depends on 2, 3)

  Документация для нового поведения.

  Требования:
  - В секции про TUI — добавить описание: "По умолчанию TUI показывает две панели:
    список планов слева (40%) и список задач выбранного плана справа (60%)"
  - Добавить: "На маленьких экранах (ширина < 100 колонок) Tasks-панель скрывается
    автоматически, plan-list занимает всю ширину"
  - Обновить hotkeys hint если он дублируется в README
  - Если есть секция про responsive/layout — упомянуть новую панель
  - Никаких новых фич — только документирование существующего поведения

  Файлы: `README.md`

  LOGGING REQUIREMENTS:
  - Никаких (документация)

## Commit Plan

- **Commit 1** (after task 1): "feat(tui): add TaskListView component for side panel"
- **Commit 2** (after tasks 2-3): "feat(tui): integrate responsive tasks side panel with threshold 100 cols"
- **Commit 3** (after tasks 4-5): "test(tui): cover task-list view and responsive layout"
- **Commit 4** (after task 6): "docs: document TUI tasks side panel and responsive behavior"
<!-- Commit checkpoint: tasks 1-6 -->
