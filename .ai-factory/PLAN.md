# Plan: Add fileName, path and task summary to plan detail view (Issue #6)

Branch: none
Created: 2026-07-03

## Settings
- Testing: yes
- Logging: verbose
- Docs: no

## Research Context
Source: .ai-factory/RESEARCH.md (Active Summary)

Goal: На страницу плана (когда открывается отдельный план через Enter) выводить коротко задачи плана, а потом содержимое markdown. Также выводить название файла плана и путь к нему.
Constraints:
  - `renderTaskDetail` в `tui-view.ts:161-216` — единственная функция для рендера detail view
  - `appendMarkdownDeferred` добавляет MarkdownRenderable после синхронных элементов — не трогаем
  - `Plan` type уже имеет `fileName`, `path`, `phases`, `tasks` — данные готовы
  - Паттерн рендера задач уже есть в `task-list-view.ts:54-64` (TextRenderable с ☑/☐)
  - `plan.phases` может быть пустым для старых планов — fallback на плоский список
Decisions:
  - fileName — отдельной строкой после title, цвет `accent`
  - path — отдельной строкой после fileName, цвет `muted`
  - Task summary — после первого сепаратора, по фазам если есть, иначе плоский список
  - Второй сепаратор после task summary, перед deferred markdown
  - Синхронный рендер (TextRenderable) — дёшево, не блокирует event loop
  - `appendMarkdownDeferred` не трогаем — он добавит markdown после всех sync элементов

## Tasks

### Phase 1: Add file info and task summary to renderTaskDetail
- [x] Task 1: Add fileName and path TextRenderable lines after title in `renderTaskDetail`

  В `packages/lazyaif/src/views/plans-viewer/tui-view.ts` в функции `renderTaskDetail` (после `scroll.add(titleText)` на line 183, перед meta на line 185) добавить два новых `TextRenderable`:
  - fileName: `t`📄 ${plan.fileName}`` с цветом `colors.accent`
  - path: `plan.path` с цветом `colors.muted`
  ID'ы: `${id}-filename` и `${id}-filepath`.

  LOGGING REQUIREMENTS:
  - DEBUG: логировать что добавлены fileName и path для plan=`${plan.fileName}`
  - Использовать существующий `debug()` helper

  Файлы: `packages/lazyaif/src/views/plans-viewer/tui-view.ts`

- [x] Task 2: Add task summary section with phase grouping in `renderTaskDetail`

  После первого сепаратора (line 212 `scroll.add(sepText)`), перед `return scroll` (line 215), добавить блок задач:
  - Если `plan.phases.length > 0`: для каждой фазы — заголовок `Phase N: Name (done/total)` цветом `colors.muted` bold, затем задачи `☑/☐ N: title` цветом `colors.done`/`colors.fg`
  - Иначе: заголовок `Tasks (done/total):` цветом `colors.muted` bold, затем задачи `☑/☐ N: title`
  - Использовать паттерн из `task-list-view.ts:54-64` (TextRenderable + `t` tagged template)
  - Символы: `BOX_DONE = "☑"`, `BOX_TODO = "☐"`
  - ID'ы: `${id}-tasks-header`, `${id}-phase-${phaseIndex}`, `${id}-task-${task.id}`

  LOGGING REQUIREMENTS:
  - DEBUG: логировать количество фаз и задач для plan=`${plan.fileName}`
  - Использовать существующий `debug()` helper

  Файлы: `packages/lazyaif/src/views/plans-viewer/tui-view.ts`

- [x] Task 3: Add second separator after task summary before deferred markdown

  После блока задач (из Task 2), перед `return scroll`, добавить второй сепаратор — такой же `TextRenderable` с `"─".repeat(40)` и цветом `colors.border`.
  ID: `${id}-sep2`.

  LOGGING REQUIREMENTS:
  - DEBUG: логировать что добавлен второй сепаратор

  Файлы: `packages/lazyaif/src/views/plans-viewer/tui-view.ts`

### Phase 2: Tests
- [x] Task 4: Write tests for fileName, path and task summary in detail view (depends on 1, 2, 3)

  В `packages/lazyaif/tests/views/plans-viewer/` добавить тест `tui-view-detail.test.ts`:
  - Создать tmp repo с fixture `full-plan-partial.md` (как в существующем `tui-view-responsive.test.ts`)
  - Открыть TUI, переключиться в detail mode (через `enterDetailMode` или симуляцией Enter)
  - Проверить наличие `TextRenderable` с ID `plan-detail-0-filename` и `plan-detail-0-filepath`
  - Проверить наличие `TextRenderable` с ID `plan-detail-0-tasks-header`
  - Проверить наличие `TextRenderable` с ID `plan-detail-0-task-1`, `plan-detail-0-task-2`, etc.
  - Проверить наличие второго сепаратора с ID `plan-detail-0-sep2`
  - Использовать паттерн из `tui-view-responsive.test.ts` (createCliRenderer remote mode, getRenderable)

  LOGGING REQUIREMENTS:
  - DEBUG: логировать шаги теста

  Файлы: `packages/lazyaif/tests/views/plans-viewer/tui-view-detail.test.ts`