# Implementation Plan: Restructure lazyaif to module-based architecture

Branch: none
Created: 2026-06-28

## Settings
- Testing: yes
- Logging: verbose
- Docs: no  # yes => mandatory docs checkpoint in /aif-implement, no/unset => WARN [docs] only

## Current State

Реструктуризация частично выполнена. Текущее состояние:

**Уже в новой структуре:**
- `src/modules/plans-viewer/` — types, parser, scanner, status, format, index (✅ complete)
- `src/shared/index.ts` — пустой barrel (✅ placeholder)
- `src/clients/tui/components/` — theme, header, footer, index (✅ complete)
- `src/clients/cli/table.ts` — generic ansi/pad/colorForState helpers (✅ partial)

**Ещё в старой структуре (нужно удалить после миграции):**
- `src/core/` — types, parser, scanner, status, format, index
- `src/tui/` — app, index, theme, views/*
- `src/cli/` — index, json, table
- `src/web/` — index, template
- `tests/parser.test.ts`, `tests/scanner.test.ts`, `tests/status.test.ts`

**Ещё не создано:**
- `src/views/plans-viewer/` — tui-view, cli-view, web-view stub
- `src/views/status/` — tui-view, cli-view
- `src/modules/status/` — types, summary, index
- `src/app/` — tui-dashboard, cli-dispatch
- `src/clients/tui/index.ts` — TUI framework entry
- `src/clients/cli/index.ts` — CLI framework entry
- `src/clients/web/template.ts` — generic HTML template (stub)
- `tests/modules/plans-viewer/` — moved tests
- `tests/modules/status/` — new tests
- `bin/lazyaif.ts` — обновить импорты под новую структуру

## Target Architecture

```
packages/aif-plans/
├── package.json
├── tsconfig.json
├── README.md
├── bin/
│   └── lazyaif.ts                  # commander router: tui | plans | status
├── src/
│   ├── shared/                     # общие утилиты (пока пусто)
│   │   └── index.ts
│   ├── modules/                    # доменная логика (без UI)
│   │   ├── plans-viewer/
│   │   │   ├── types.ts
│   │   │   ├── parser.ts
│   │   │   ├── scanner.ts
│   │   │   ├── status.ts
│   │   │   ├── format.ts
│   │   │   └── index.ts
│   │   └── status/
│   │       ├── types.ts
│   │       ├── summary.ts
│   │       └── index.ts
│   ├── clients/                    # generic фреймворки отображения
│   │   ├── tui/
│   │   │   ├── index.ts            # createCliRenderer + setup helpers
│   │   │   └── components/
│   │   │       ├── header.ts
│   │   │       ├── footer.ts
│   │   │       ├── theme.ts
│   │   │       └── index.ts
│   │   ├── cli/
│   │   │   ├── index.ts            # CLI helpers barrel
│   │   │   └── table.ts            # ansi, pad, colorForState
│   │   └── web/
│   │       └── template.ts        # generic HTML shell (stub)
│   ├── views/                      # UI пер module (связка модуля + клиента)
│   │   ├── plans-viewer/
│   │   │   ├── tui-view.ts         # renderPlanList, renderTaskDetail, createPlansTuiApp
│   │   │   ├── cli-view.ts         # renderPlansTable, renderPlansJson
│   │   │   └── web-view.ts         # renderPlansHtml (stub, отложен)
│   │   └── status/
│   │       ├── tui-view.ts         # renderStatusSummary (TUI)
│   │       └── cli-view.ts         # renderStatusSummary (CLI string)
│   └── app/                        # оркестрация
│       ├── tui-dashboard.ts       # главный TUI экран (default = plans-viewer)
│       └── cli-dispatch.ts         # роутинг CLI команд к views
├── tests/
│   ├── modules/
│   │   ├── plans-viewer/
│   │   │   ├── parser.test.ts
│   │   │   ├── scanner.test.ts
│   │   │   └── status.test.ts
│   │   └── status/
│   │       └── summary.test.ts
│   └── fixtures/
│       ├── fast-plan.md
│       ├── full-plan-done.md
│       ├── full-plan-empty.md
│       └── full-plan-partial.md
└── (удалить: src/core/, src/tui/, src/cli/, src/web/)
```

### Rule of dependencies

```
bin/ → app/ → views/ → clients/ + modules/
                          │           │
                          └───────┐   │
                                  ▼   ▼
                               shared/  (общие утилиты)

  modules/     НЕ зависит от clients/ (чистая логика)
  clients/     НЕ зависит от modules/ (generic фреймворки)
  views/       зависит от обоих (связка модуля + клиента)
  app/         зависит от views/ (оркестрация)
  shared/      зависит от ничего (базовый слой)
```

### Commands

```
lazyaif              → TUI (default = plans-viewer screen)
lazyaif tui          → TUI (explicit)
lazyaif plans        → CLI: plans table/json
lazyaif plans --json → JSON
lazyaif p            → alias for plans
lazyaif status        → CLI: brief summary
lazyaif --help        → commander auto-help
lazyaif --version     → 0.1.0
```

## Commit Plan

- **Commit 1** (after tasks 1-5): "refactor: restructure to module-based architecture (plans-viewer + clients)"
- **Commit 2** (after tasks 6-9): "feat: add status module + views + app orchestration"
- **Commit 3** (after tasks 10-12): "chore: cleanup old files, update tests, verify all passes"
<!-- Commit checkpoint: tasks 1-12 -->

## Tasks

### Phase 1: Clients & Views for plans-viewer

- [x] Task 1: Дополнить `clients/cli/` — `index.ts` barrel + `table.ts` уже есть, добавить `json.ts` generic

  `src/clients/cli/table.ts` уже создан с `ansi`, `pad`, `colorForState`. Нужно добавить `index.ts` barrel и `json.ts` с generic `renderJson(data: unknown): string`.

  Требования:
  - `src/clients/cli/json.ts`: `export function renderJson(data: unknown): string` → `JSON.stringify(data, null, 2)`
  - `src/clients/cli/index.ts`: barrel re-export `table.ts` + `json.ts`
  - Не зависит от modules/ (generic)

  Файлы: `src/clients/cli/json.ts`, `src/clients/cli/index.ts`

  LOGGING REQUIREMENTS:
  - `[cli:json] rendering data type=<typeof data>`

- [x] Task 2: Создать `views/plans-viewer/tui-view.ts` — TUI view для plans-viewer (depends on existing modules/plans-viewer + clients/tui/components)

  Перенести логику из старых `src/tui/views/plan-list.ts`, `src/tui/views/task-detail.ts`, `src/tui/app.ts` в один файл `tui-view.ts`. Импорты из новых путей.

  Требования:
  - `renderPlanList(plans, statuses, onSelect)` → `Select` (из modules/plans-viewer types + format, clients/tui/components theme)
  - `renderTaskDetail(plan, status)` → `ScrollBox` (из modules/plans-viewer types + format, clients/tui/components theme)
  - `createPlansTuiApp(renderer, rootDir)` → сканирует plans, строит layout (header / [plan-list | task-detail] / footer)
  - Все импорты из `../../modules/plans-viewer/index.js` и `../../clients/tui/components/index.js`
  - Никаких импортов из `../../core/` или `../../tui/` (старых путей)

  Файлы: `src/views/plans-viewer/tui-view.ts`

  LOGGING REQUIREMENTS:
  - `[tui:plan-list] rendering plans count=<N>`
  - `[tui:plan-list] selection changed index=<N>`
  - `[tui:task-detail] rendering plan=<fileName> tasks=<N>`
  - `[tui:app] initialized plans=<N>`
  - `[tui:app] selection changed index=<N>`

- [x] Task 3: Создать `views/plans-viewer/cli-view.ts` — CLI view для plans-viewer (depends on 1)

  Перенести логику из старых `src/cli/table.ts` и `src/cli/json.ts` в `cli-view.ts`. Использует generic helpers из `clients/cli/`.

  Требования:
  - `renderPlansTable(plans: Plan[], statuses: PlanStatus[]): string` — таблица (использует `pad`, `ansi`, `colorForState` из clients/cli/table, `statusIcon`/`formatTaskProgress`/`formatPercent` из modules/plans-viewer)
  - `renderPlansJson(plans: Plan[], statuses: PlanStatus[]): string` — JSON (использует `renderJson` из clients/cli/json)
  - Возвращает строки (не пишет в stdout)

  Файлы: `src/views/plans-viewer/cli-view.ts`

  LOGGING REQUIREMENTS:
  - `[cli:table] rendering plans count=<N>`
  - `[cli:json] rendering plans count=<N>`

- [x] Task 4: Создать `views/plans-viewer/web-view.ts` — stub (отложен, depends on 1)

  Заглушка для web-view. Не реализуется полностью, но структура готова.

  Требования:
  - `renderPlansHtml(plans: Plan[], statuses: PlanStatus[], projectPath: string): string` — перенос из старого `src/web/template.ts` (уже написан)
  - Помечен как отложенный в README

  Файлы: `src/views/plans-viewer/web-view.ts`

  LOGGING REQUIREMENTS:
  - `[web:template] rendering report plans=<N> projectPath=<path>`

- [x] Task 5: Создать `clients/tui/index.ts` — TUI framework entry point (depends on existing components)

  Обёртка над `createCliRenderer` с настройками по умолчанию.

  Требования:
  - `createTuiRenderer()` → `createCliRenderer({ exitOnCtrlC: true, backgroundColor: colors.bg })`
  - Экспортирует `createTuiRenderer` и re-export компонентов из `./components/index.js`
  - Не зависит от modules/

  Файлы: `src/clients/tui/index.ts`

  LOGGING REQUIREMENTS:
  - `[tui] renderer created`
<!-- Commit checkpoint: tasks 1-5 -->

### Phase 2: Status Module + Views + App

- [x] Task 6: Создать `modules/status/types.ts` и `modules/status/summary.ts` и `modules/status/index.ts` (depends on existing modules/plans-viewer)

  Модуль status — агрегирует статусы всех планов в краткую сводку.

  Требования к `types.ts`:
  - `interface StatusSummary { total: number; done: number; inProgress: number; notStarted: number }`

  Требования к `summary.ts`:
  - `computeSummary(rootDir: string): Promise<StatusSummary>`
  - Вызывает `scanAiFactory(rootDir)` из `../plans-viewer/index.js`
  - Для каждого плана вызывает `computeStatus(plan)` из `../plans-viewer/index.js`
  - Агрегирует: total = plans.length, done/inProgress/notStarted = count by state

  Требования к `index.ts`:
  - Barrel: `export * from "./types.js"; export { computeSummary } from "./summary.js"`

  Файлы: `src/modules/status/types.ts`, `src/modules/status/summary.ts`, `src/modules/status/index.ts`

  LOGGING REQUIREMENTS:
  - `[status:summary] computing for rootDir=<path>`
  - `[status:summary] total=<N> done=<N> inProgress=<N> notStarted=<N>`

- [x] Task 7: Создать `views/status/cli-view.ts` — CLI view для status (depends on 6)

  Краткий вывод статуса одной строкой.

  Требования:
  - `renderStatusCli(summary: StatusSummary): string` → `"Plans: 3  Done: 1  In progress: 1  Not started: 1"`
  - Импортирует `StatusSummary` из `../../modules/status/index.js`

  Файлы: `src/views/status/cli-view.ts`

  LOGGING REQUIREMENTS:
  - `[status:cli] rendering summary`

- [x] Task 8: Создать `views/status/tui-view.ts` — TUI view для status (depends on 6)

  TUI-панель со сводкой.

  Требования:
  - `renderStatusTui(summary: StatusSummary)` → `Box` с текстом сводки
  - Использует colors из `../../clients/tui/components/index.js`

  Файлы: `src/views/status/tui-view.ts`

  LOGGING REQUIREMENTS:
  - `[status:tui] rendering summary`

- [x] Task 9: Создать `app/tui-dashboard.ts` и `app/cli-dispatch.ts` (depends on 2, 3, 5, 7)

  Оркестрация: TUI dashboard (default = plans-viewer) и CLI dispatch (роутинг к views).

  Требования к `tui-dashboard.ts`:
  - `runTuiDashboard(rootDir: string)` → создаёт renderer через `createTuiRenderer()`, вызывает `createPlansTuiApp(renderer, rootDir)` из `../views/plans-viewer/tui-view.js`
  - Обработка `q`/`Esc` → `renderer.destroy()`

  Требования к `cli-dispatch.ts`:
  - `runPlansCli(rootDir: string, json: boolean)` → сканирует, рендерит table/json, пишет в stdout
  - `runStatusCli(rootDir: string)` → вычисляет summary, рендерит, пишет в stdout

  Файлы: `src/app/tui-dashboard.ts`, `src/app/cli-dispatch.ts`

  LOGGING REQUIREMENTS:
  - `[app:tui] starting dashboard rootDir=<path>`
  - `[app:tui] shutting down`
  - `[app:cli] plans rootDir=<path> json=<bool>`
  - `[app:cli] status rootDir=<path>`
<!-- Commit checkpoint: tasks 6-9 -->

### Phase 3: Bin, Tests, Cleanup

- [x] Task 10: Обновить `bin/lazyaif.ts` — импорты из новой структуры (depends on 9)

  Обновить commander-роутер для использования `app/` вместо прямых импортов.

  Требования:
  - `program.command("tui", { isDefault: true })` → `await import("../src/app/tui-dashboard.js")` → `runTuiDashboard(path)`
  - `program.command("plans").alias("p")` → `await import("../src/app/cli-dispatch.js")` → `runPlansCli(path, json)`
  - `program.command("status")` → `await import("../src/app/cli-dispatch.js")` → `runStatusCli(path)`
  - Динамические импорты — не тащит TUI в CLI режимы

  Файлы: `bin/lazyaif.ts`

  LOGGING REQUIREMENTS:
  - `[bin] mode=<tui|plans|status> args=<...>`

- [x] Task 11: Перенести тесты в `tests/modules/` с обновлёнными импортами + добавить тест status (depends on 6)

  Тесты переезжают из `tests/` в `tests/modules/<module>/`.

  Требования:
  - `tests/modules/plans-viewer/parser.test.ts` — импорты из `../../../src/modules/plans-viewer/parser.js`
  - `tests/modules/plans-viewer/scanner.test.ts` — импорты из `../../../src/modules/plans-viewer/scanner.js`
  - `tests/modules/plans-viewer/status.test.ts` — импорты из `../../../src/modules/plans-viewer/status.js` и `format.js`
  - `tests/modules/status/summary.test.ts` — тест `computeSummary`: mock scanAiFactory или использовать fixtures
  - `tests/fixtures/` остаётся на месте
  - Все тесты должны проходить через `vitest run`

  Файлы: `tests/modules/plans-viewer/parser.test.ts`, `tests/modules/plans-viewer/scanner.test.ts`, `tests/modules/plans-viewer/status.test.ts`, `tests/modules/status/summary.test.ts`

  LOGGING REQUIREMENTS:
  - Тесты не логируют

- [x] Task 12: Удалить старые файлы + обновить README + финальная проверка (depends on 10, 11)

  Удалить все файлы старой структуры и проверить, что всё работает.

  Требования:
  - Удалить: `src/core/`, `src/tui/`, `src/cli/`, `src/web/`
  - Удалить старые тесты: `tests/parser.test.ts`, `tests/scanner.test.ts`, `tests/status.test.ts`
  - Обновить `README.md`: новая структура, команды, архитектура
  - Проверка: `npm test` — все тесты проходят
  - Проверка: `npx tsx bin/lazyaif.ts plans --path <example>` — выводит таблицу
  - Проверка: `npx tsx bin/lazyaif.ts status --path <example>` — выводит сводку
  - Проверка: `npx tsx bin/lazyaif.ts --help` — показывает команды

  Файлы: удалить `src/core/`, `src/tui/`, `src/cli/`, `src/web/`, старые тесты; обновить `README.md`
<!-- Commit checkpoint: tasks 10-12 -->