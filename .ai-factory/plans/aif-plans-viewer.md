# Implementation Plan: AI-Factory Plans Viewer (aif-plans)

Branch: none
Created: 2026-06-28

## Settings
- Testing: yes
- Logging: verbose
- Docs: no  # yes => mandatory docs checkpoint in /aif-implement, no/unset => WARN [docs] only

## Architecture

Цель: инструмент для анализа состояния планов ai-factory. Два клиента (TUI/CLI)
поверх общего ядра. Каждый клиент — отдельный entrypoint, ядро не зависит ни от одного
клиента и не зависит от OpenTUI. Web-клиент отложен на потом (код уже реализован, но
не включается в scope и не тестируется).

```
packages/aif-plans/
├── package.json                 # bun project, workspaces-friendly
├── tsconfig.json
├── README.md
├── src/
│   ├── core/                     # ЯДРО — без рантайм-зависимостей
│   │   ├── types.ts              # PlanKind, Plan, Phase, Task, PlanStatus, PlanState
│   │   ├── parser.ts             # parsePlanFile(content, path) → Plan
│   │   ├── scanner.ts            # scanAiFactory(rootDir) → Plan[]
│   │   ├── status.ts             # computeStatus(plan) → PlanStatus
│   │   ├── format.ts             # formatPercent, formatState, statusIcon
│   │   └── index.ts              # barrel re-export
│   ├── tui/                      # TUI клиент на OpenTUI
│   │   ├── index.ts              # entrypoint: createCliRenderer + layout
│   │   ├── app.ts                # App component (state, wiring)
│   │   ├── views/
│   │   │   ├── plan-list.ts      # Select со списком планов
│   │   │   ├── task-detail.ts    # ScrollBox с деталями задач
│   │   │   ├── header.ts         # Box: title + project path
│   │   │   └── footer.ts         # Box: hotkeys hint
│   │   └── theme.ts              # цвета/стили
│   ├── cli/                      # CLI клиент (plain stdout, без OpenTUI)
│   │   ├── index.ts              # entrypoint: arg parse, dispatch
│   │   ├── table.ts              # renderTable(plans) → string
│   │   └── json.ts               # renderJson(plans) → string
│   └── web/                      # Web клиент (ОТЛОЖЕН — не в scope)
│       ├── index.ts              # entrypoint: generate report
│       └── template.ts           # HTML template + render
├── tests/
│   ├── parser.test.ts            # парсинг PLAN.md и plans/*.md
│   ├── scanner.test.ts           # сканирование директории
│   ├── status.test.ts            # расчёт статусов
│   └── fixtures/
│       ├── fast-plan.md           # пример fast-плана (из hello-world-example)
│       ├── full-plan-done.md      # полностью выполненный full-план
│       ├── full-plan-partial.md  # частично выполненный full-план
│       └── full-plan-empty.md     # ни одной задачи не выполнено
└── bin/
    └── aif-plans.ts               # unified entrypoint: cli|tui|web dispatch
```

### Зависимости

| Слой | Зависимости | Рантайм |
|---|---|---|
| core | только TypeScript + `node:fs/promises`, `node:path` | Node ≥20 (npm + tsx) |
| tui | `@opentui/core` | Node ≥26.3 + `--experimental-ffi` ИЛИ bun (FFI из коробки) |
| cli | только stdlib (`process.stdout`) | Node ≥20 (npm + tsx) |
| web | (ОТЛОЖЕН) | — |

**Тест-раннер:** `vitest` (npm-совместимый, запускается через `npm test`).
**TS-раннер:** `tsx` (npm + tsx) — запускает TS-файлы напрямую без отдельного build-шага.

**TUI runtime note:** `createCliRenderer()` требует FFI. На Node <26.3 без `--experimental-ffi`
TUI-режим не запустится — CLI и Web работают на любом Node ≥20. Это задокументировано в README.

### Поток данных

```
                    ┌─────────────────────────────────────────┐
                    │               CORE                       │
                    │                                         │
   .ai-factory/ ──► scanner.scanAiFactory(rootDir)            │
   PLAN.md            │                                      │
   plans/*.md          ▼                                      │
                    parser.parsePlanFile(content, path)       │
                         │                                   │
                         ▼                                   │
                    Plan { kind, path, title, branch,         │
                           created, settings, phases, tasks } │
                         │                                   │
                         ▼                                   │
                    status.computeStatus(plan)                │
                         │                                   │
                         ▼                                   │
                    PlanStatus { done, total, pct, state }    │
                    └──────────────┬──────────────────────────┘
                                   │
                       ┌───────────┴───────────┐
                       ▼                        ▼
                    TUI                     CLI
                 OpenTUI                 console.log
                 Select+ScrollBox        table / --json

                 (web — отложен, не в scope)
```

### Типы (контракт между слоями)

```ts
// core/types.ts

type PlanKind = "fast" | "full";
type PlanState = "done" | "in-progress" | "not-started";

interface Task {
  id: number;            // Task N
  title: string;
  done: boolean;
  phase: string;         // "Phase 1: Setup"
  description: string;   // полное описание под заголовком
  dependsOn: number[];   // [1, 2]
}

interface Phase {
  name: string;          // "Phase 1: Setup"
  tasks: Task[];
}

interface PlanSettings {
  testing: boolean;
  logging: "verbose" | "standard" | "minimal";
  docs: boolean;
}

interface Plan {
  kind: PlanKind;
  path: string;          // относительный путь от rootDir
  fileName: string;      // "PLAN.md" | "rectangle-area.md"
  title: string;         // из "# Implementation Plan: ..."
  branch: string;        // из "Branch: ..."
  created: string;       // из "Created: ..."
  settings: PlanSettings;
  phases: Phase[];
  tasks: Task[];         // все задачи подряд (для удобства)
}

interface PlanStatus {
  done: number;
  total: number;
  pct: number;           // 0..100, округлённое
  state: PlanState;
}
```

### Парсер — формат ai-factory

Парсер читает markdown построчно, распознаёт:

```
# Implementation Plan: <title>        → plan.title
Branch: <branch>                     → plan.branch
Created: <date>                       → plan.created
## Settings
- Testing: yes/no                    → settings.testing
- Logging: verbose/standard/minimal  → settings.logging
- Docs: yes/no                       → settings.docs
### Phase N: <name>                   → phase.name
- [ ] Task N: <title> ...             → task { done:false }
- [x] Task N: <title> ...             → task { done:true }
  (depends on 1, 2)                  → task.dependsOn
  <multi-line description>            → task.description
```

Тип плана определяется по пути:
- `PLAN.md` → `kind: "fast"`
- `plans/<name>.md` → `kind: "full"`

## Commit Plan

- **Commit 1** (after tasks 1-4): "feat(core): scaffold project + types + parser + status"
- **Commit 2** (after tasks 5-8): "feat(tui): OpenTUI viewer with plan list and task detail"
- **Commit 3** (after tasks 9-13): "feat(cli): stdout table and json output + unified entrypoint"
<!-- Commit checkpoint: tasks 1-13 -->

## Tasks

### Phase 1: Project Scaffold & Core

- [x] Task 1: Создать структуру проекта `packages/aif-plans/` с `package.json`, `tsconfig.json`

  Инициализировать npm-проект внутри монорепо `lazyaif` как отдельный пакет (без bun).

  Требования:
  - `package.json` с полями: `name: "aif-plans"`, `type: "module"`, `version: "0.1.0"`, `"engines": { "node": ">=20" }`
  - `tsconfig.json` с `target: "ESNext"`, `module: "ESNext"`, `moduleResolution: "bundler"`, `strict: true`
  - Скрипты в `package.json`: `"tui": "tsx src/tui/index.ts"`, `"cli": "tsx src/cli/index.ts"`, `"web": "tsx src/web/index.ts"`, `"test": "vitest run"`, `"aif-plans": "tsx bin/aif-plans.ts"`
  - Зависимость `@opentui/core` (latest) — только для TUI-слоя, ставится в deps
  - Зависимость `commander` (^13) — для CLI-аргументов и subcommands в bin/
  - Dev-зависимости: `tsx`, `typescript`, `vitest`, `@types/node` (НЕ `@types/bun` — bun не используется)
  - Папки `src/core/`, `src/tui/views/`, `src/cli/`, `src/web/`, `tests/`, `tests/fixtures/`, `bin/`

  Файлы: `packages/aif-plans/package.json`, `packages/aif-plans/tsconfig.json`

  LOGGING REQUIREMENTS:
  - `[scaffold] creating npm project at packages/aif-plans/`
  - `[scaffold] installed devDeps: tsx, typescript, vitest, @types/node`
  - `[scaffold] installed deps: @opentui/core`

- [x] Task 2: Реализовать `core/types.ts` — все интерфейсы и типы

  Создать файл типов, общий для всех клиентов. Без рантайм-логики.

  Требования:
  - Типы: `PlanKind`, `PlanState`, `Task`, `Phase`, `PlanSettings`, `Plan`, `PlanStatus`
  - Структура соответствует разделу "Типы" в архитектуре выше
  - Все поля задокументированы JSDoc-комментариями (краткими)
  - Экспорт через `export type` / `export interface`

  Файлы: `packages/aif-plans/src/core/types.ts`

  LOGGING REQUIREMENTS:
  - Файл типов не логирует (нет рантайма)

- [x] Task 3: Реализовать `core/parser.ts` — парсинг markdown плана в `Plan` (depends on 2)

  Построчный парсер markdown-файлов ai-factory.

  Требования:
  - `parsePlanFile(content: string, relativePath: string): Plan`
  - Определение `kind`: если `relativePath` заканчивается на `PLAN.md` → `"fast"`, иначе `"full"`
  - Извлечение `title` из строки `# Implementation Plan: <title>`
  - Извлечение `branch` из `Branch: <value>`
  - Извлечение `created` из `Created: <value>`
  - Парсинг `## Settings` блока: `Testing`, `Logging`, `Docs` (yes/no, verbose/standard/minimal)
  - Парсинг `### Phase N: <name>` → начало новой фазы
  - Парсинг `- [ ] Task N: <title>` и `- [x] Task N: <title>` → задачи
  - Извлечение `(depends on 1, 2)` из заголовка задачи → `dependsOn: number[]`
  - Многострочное описание задачи: все строки после заголовка до следующего `- [ ]`/`- [x]`/`### `/EOF
  - `task.id` — число после слова "Task"
  - Все задачи собираются и в `phase.tasks`, и в плоский `plan.tasks`
  - Толерантность к отсутствующим полям (если нет Settings — дефолты)
  - Не падать на неизвестных строках — игнорировать

  Файлы: `packages/aif-plans/src/core/parser.ts`

  LOGGING REQUIREMENTS:
  - Логировать на DEBUG: `[parser] parsing file=<relativePath> kind=<fast|full>`
  - Логировать на DEBUG: `[parser] found phases=<N> tasks=<N>`
  - Логировать на WARN: пропущенные/нераспознанные строки заголовков
  - Логирование через `console.debug` / `console.warn` (ядро не тянет логгер-библиотеку)
  - Подчиняется `LOG_LEVEL` / `DEBUG` через простую проверку `process.env`

- [x] Task 4: Реализовать `core/status.ts` и `core/format.ts`, собрать `core/index.ts` (depends on 3)

  Расчёт статуса плана и форматирование для отображения.

  Требования к `status.ts`:
  - `computeStatus(plan: Plan): PlanStatus`
  - `done` = количество `task.done === true`
  - `total` = `plan.tasks.length`
  - `pct` = `total > 0 ? Math.round((done/total)*100) : 0`
  - `state`: `"done"` если `done === total && total > 0`, `"not-started"` если `done === 0`, иначе `"in-progress"`

  Требования к `format.ts`:
  - `statusIcon(state: PlanState): string` → `"✅"` | `"⏳"` | `"❌"`
  - `formatPercent(pct: number): string` → `"100%"`, `"50%"`, `"0%"`
  - `formatTaskProgress(done: number, total: number): string` → `"2/4"`, `"1/1"`, `"0/1"`

  Требования к `scanner.ts`:
  - `scanAiFactory(rootDir: string): Promise<Plan[]>` (async — использует `node:fs/promises`)
  - Проверяет существование `<rootDir>/.ai-factory/PLAN.md` → парсит как fast
  - Читает `<rootDir>/.ai-factory/plans/` через `readdir`, фильтрует `.md` (без внешних glob-пакетов)
  - Возвращает массив планов, отсортированных: fast первым, затем full по алфавиту
  - Не падает если `.ai-factory/` не существует → возвращает `[]`
  - Не падает если `plans/` не существует → только fast (или пусто)
  - Использует `node:fs/promises` (`readFile`, `readdir`, `access`) и `node:path` (НЕ Bun.* API)

  Требования к `index.ts`:
  - Barrel re-export: `types`, `parser`, `scanner`, `status`, `format`

  Файлы: `packages/aif-plans/src/core/status.ts`, `packages/aif-plans/src/core/format.ts`, `packages/aif-plans/src/core/scanner.ts`, `packages/aif-plans/src/core/index.ts`

  LOGGING REQUIREMENTS:
  - `[scanner] scanning rootDir=<path>`
  - `[scanner] found plans: fast=<0|1> full=<N>`
  - `[scanner] no .ai-factory directory at <path>` (WARN)
<!-- Commit checkpoint: tasks 1-4 -->

### Phase 2: Core Tests

- [x] Task 5: Создать тестовые fixtures и тесты для parser, scanner, status (depends on 4)

  Тесты на vitest (`npm test` / `npx vitest run`).

  Требования к fixtures:
  - `tests/fixtures/fast-plan.md` — копия `PLAN.md` из hello-world-example (1 задача, невыполнена)
  - `tests/fixtures/full-plan-done.md` — копия `hello-world-index.md` (1 задача, выполнена)
  - `tests/fixtures/full-plan-partial.md` — копия `rectangle-area.md` (4 задачи, 2 выполнены)
  - `tests/fixtures/full-plan-empty.md` — 3 задачи, 0 выполнено

  Требования к `parser.test.ts`:
  - Импорты: `import { describe, it, expect } from "vitest"`
  - Тест: парсинг fast-плана → `kind === "fast"`, `title`, `tasks.length`, `tasks[0].done === false`
  - Тест: парсинг full-плана (done) → `kind === "full"`, `tasks[0].done === true`
  - Тест: парсинг partial-плана → 4 задачи, `done: [true, true, false, false]`
  - Тест: извлечение `dependsOn` → `[1, 2]` из `(depends on 1, 2)`
  - Тест: многострочное описание задачи сохраняется
  - Тест: отсутствующий `## Settings` → дефолтные значения

  Требования к `scanner.test.ts`:
  - Импорты: `import { describe, it, expect } from "vitest"`
  - Тест: сканирование директории с fixtures → правильное количество планов
  - Тест: fast-план идёт первым в массиве
  - Тест: несуществующая директория → `[]`

  Требования к `status.test.ts`:
  - Импорты: `import { describe, it, expect } from "vitest"`
  - Тест: `computeStatus` для done-плана → `{ done: 1, total: 1, pct: 100, state: "done" }`
  - Тест: `computeStatus` для partial → `{ done: 2, total: 4, pct: 50, state: "in-progress" }`
  - Тест: `computeStatus` для empty → `{ done: 0, total: 3, pct: 0, state: "not-started" }`
  - Тест: `statusIcon` и `formatPercent` возвращают корректные строки

  Файлы: `tests/fixtures/*.md`, `tests/parser.test.ts`, `tests/scanner.test.ts`, `tests/status.test.ts`

  LOGGING REQUIREMENTS:
  - Тесты не логируют (assertions только)

### Phase 3: TUI Client (OpenTUI)

- [x] Task 6: Реализовать `tui/theme.ts` и `tui/views/header.ts` + `tui/views/footer.ts` (depends on 4)

  Базовые визуальные компоненты TUI.

  Требования к `theme.ts`:
  - Цветовая палитра: `colors.bg`, `colors.fg`, `colors.done` (зелёный), `colors.progress` (жёлтый), `colors.notStarted` (красный), `colors.border`, `colors.muted`
  - Импорт не тянет рантайм-зависимости кроме `@opentui/core`

  Требования к `header.ts`:
  - Функция `renderHeader(projectPath: string)` → `Box` с `borderStyle: "rounded"`, `title: "AI-Factory Plans"`
  - Внутри `Text` с путём проекта (цвет `muted`)
  - Высота 3 строки, ширина `100%`

  Требования к `footer.ts`:
  - Функция `renderFooter()` → `Box` с `backgroundColor`, `position: "absolute"`, `bottom: 0`
  - `Text`: `"↑↓ select · Enter expand · q quit"`
  - Высота 1 строка, ширина `100%`

  Файлы: `packages/aif-plans/src/tui/theme.ts`, `packages/aif-plans/src/tui/views/header.ts`, `packages/aif-plans/src/tui/views/footer.ts`

  LOGGING REQUIREMENTS:
  - `[tui:header] rendering projectPath=<path>`
  - `[tui:footer] rendering hotkeys hint`

- [x] Task 7: Реализовать `tui/views/plan-list.ts` — Select со списком планов (depends on 6)

  Список планов с навигацией.

  Требования:
  - Функция `renderPlanList(plans: Plan[], statuses: PlanStatus[], onSelect: (index: number) => void)` → `Select`
  - Каждая опция: `name` = `<fileName>`, `description` = `<done/total> <pct> <icon>`
  - Пример: `name: "PLAN.md"`, `description: "0/1   0%  ❌"`
  - Пример: `name: "rectangle-area.md"`, `description: "2/4  50%  ⏳"`
  - `width: "40%"`, `height: "100%"`
  - Событие `SelectRenderableEvents.SELECTION_CHANGED` → вызывает `onSelect(index)`
  - Начальный фокус на первом плане

  Файлы: `packages/aif-plans/src/tui/views/plan-list.ts`

  LOGGING REQUIREMENTS:
  - `[tui:plan-list] rendering plans count=<N>`
  - `[tui:plan-list] selection changed index=<N>`

- [x] Task 8: Реализовать `tui/views/task-detail.ts` и собрать `tui/app.ts` + `tui/index.ts` (depends on 7)

  Детали выбранного плана и сборка всего TUI.

  Требования к `task-detail.ts`:
  - Функция `renderTaskDetail(plan: Plan, status: PlanStatus)` → `ScrollBox`
  - `ScrollBox` с `width: "60%"`, `height: "100%"`, `viewportCulling: true`
  - Заголовок: `Text` с `plan.title` (bold)
  - Метаданные: branch, created, settings (компактно, цвет muted)
  - Прогресс-бар: `Text` — `<icon> <done>/<total> (<pct>%)`
  - Для каждой фазы: `Text` с именем фазы (bold, цвет accent)
  - Для каждой задачи: `Box` с `[x]`/`[ ]` маркером (зелёный/серый) + заголовок задачи
  - Описание задачи: `Text` (цвет muted, переносы строк сохранены)
  - Зависимости: `Text` "depends on: 1, 2" если есть

  Требования к `app.ts`:
  - Функция `createApp(renderer, rootDir)` → настраивает layout
  - Сканирует `.ai-factory/` через `scanner.scanAiFactory(rootDir)`
  - Состояние: `selectedIndex`, `plans`, `statuses`
  - Layout: `Box` (column) → header / `Box` (row) → plan-list | task-detail / footer
  - При `SELECTION_CHANGED` → обновляет task-detail
  - Обновление: пересоздание task-detail при смене индекса

  Требования к `index.ts`:
  - `createCliRenderer({ exitOnCtrlC: true })`
  - Определение `rootDir`: `process.argv[2] || process.cwd()`
  - Вызов `createApp(renderer, rootDir)`
  - Обработка `q` и `Esc` → `renderer.destroy()`

  Файлы: `packages/aif-plans/src/tui/views/task-detail.ts`, `packages/aif-plans/src/tui/app.ts`, `packages/aif-plans/src/tui/index.ts`

  LOGGING REQUIREMENTS:
  - `[tui:task-detail] rendering plan=<fileName> tasks=<N>`
  - `[tui:app] initialized plans=<N>`
  - `[tui:app] selection changed index=<N>`
  - `[tui:index] starting renderer rootDir=<path>`
  - `[tui:index] shutting down`
<!-- Commit checkpoint: tasks 5-8 -->

### Phase 4: CLI Client

- [x] Task 9: Реализовать `cli/table.ts` — вывод таблицы планов в stdout (depends on 4)

  Простой CLI-вывод без OpenTUI.

  Требования:
  - Функция `renderTable(plans: Plan[], statuses: PlanStatus[]): string`
  - Заголовок: `PLAN                         TYPE   DONE  TOTAL  PCT    STATE`
  - Строка на план: `<fileName> <kind> <done> <total> <pct>% <icon>`
  - Выравнивание колонок (padEnd)
  - fast-план первым
  - Цвет через ANSI-коды (опционально, если `process.stdout.isTTY`)
  - Возвращает строку (не пишет в stdout напрямую — entrypoint решает)

  Файлы: `packages/aif-plans/src/cli/table.ts`

  LOGGING REQUIREMENTS:
  - `[cli:table] rendering plans count=<N>`

- [x] Task 10: Реализовать `cli/json.ts` и собрать `cli/index.ts` (depends on 9)

  JSON-вывод и точка входа CLI.

  Требования к `json.ts`:
  - Функция `renderJson(plans: Plan[], statuses: PlanStatus[]): string`
  - `JSON.stringify` с `indent: 2`
  - Структура: массив `{ plan: Plan, status: PlanStatus }`

  Требования к `index.ts`:
  - Использовать `commander` (`import { Command } from "commander"`)
  - Опции: `--json` (boolean), `-p, --path <dir>` (default: `process.cwd()`), `-h, --help` (авто)
  - `--json` → вывод JSON
  - без флагов → вывод таблицы
  - Помощь генерируется commander автоматически
  - Пишет в `process.stdout.write`
  - action handler async: сканирование + вывод

  Файлы: `packages/aif-plans/src/cli/json.ts`, `packages/aif-plans/src/cli/index.ts`

  LOGGING REQUIREMENTS:
  - `[cli:json] rendering plans count=<N>`
  - `[cli:index] args: <parsed args>`
  - `[cli:index] rootDir=<path>`
<!-- Commit checkpoint: tasks 9-11 -->

### Phase 5: Web Client (ОТЛОЖЕН — не в scope)

<!-- Web-клиент (tasks 11-12) уже реализован, но вынесен из scope по решению пользователя.
     Код в src/web/ остаётся, но не включается в bin-диспетчер и не тестируется.
     В bin/aif-plans.ts режим "web" не добавляется. -->

### Phase 6: Unified Entrypoint

- [x] Task 13: Реализовать `bin/aif-plans.ts` — единая точка входа с диспетчером режимов (depends on 8, 10)

  Единая команда `aif-plans` с подкомандами (только tui/cli — web отложен).

  Требования:
  - Использовать `commander` с subcommands: `program.command("tui")`, `program.command("cli")`
  - Default action (без аргумента) → tui (через `.addCommand(tuiCmd, { isDefault: true })` или аналогично)
  - `aif-plans tui [--path <dir>]` → динамический импорт `../src/tui/index.js`
  - `aif-plans cli [--json] [--path <dir>]` → динамический импорт `../src/cli/index.js`
  - Помощь — через commander автоматически (`-h, --help`)
  - Динамический импорт (`await import(...)`) — не тащит TUI/OpenTUI в CLI режимы
  - Обработка ошибок: commander автоматически показывает ошибку + помощь при неизвестной подкоманде

  Файлы: `packages/aif-plans/bin/aif-plans.ts`

  LOGGING REQUIREMENTS:
  - `[bin] mode=<tui|cli> args=<...>`
  - `[bin] unknown mode: <value>` (ERROR)

- [x] Task 14: Обновить `package.json` с `bin` полем и финальными скриптами (depends on 13)

  Финальная конфигурация пакета (web-скрипты не добавляются — отложен).

  Требования:
  - `package.json` → `"bin": { "aif-plans": "bin/aif-plans.ts" }`
  - Скрипты: `"aif-plans": "tsx bin/aif-plans.ts"`, `"tui": "tsx bin/aif-plans.ts tui"`, `"cli": "tsx bin/aif-plans.ts cli"`, `"test": "vitest run"` (без `"web"`)
  - Проверка: `npm run tui` запускается, `npm run cli` выводит таблицу
  - README.md с кратким описанием и примерами запуска + секция "TUI runtime requirements" (Node ≥26.3 + --experimental-ffi, или bun)

  Файлы: `packages/aif-plans/package.json`, `packages/aif-plans/README.md`
<!-- Commit checkpoint: tasks 12-14 -->