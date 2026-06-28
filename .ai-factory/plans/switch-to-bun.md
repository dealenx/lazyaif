# Implementation Plan: Switch lazyaif to Bun runtime

Branch: none
Created: 2026-06-28

## Settings
- Testing: yes
- Logging: verbose
- Docs: no

## Tasks

### Phase 1: Migrate to Bun

- [ ] Task 1: Обновить `package.json` — убрать tsx/vitest, добавить bun

  Убрать tsx/vitest, добавить @types/bun. Обновить скрипты.

  Требования:
  - dependencies: оставить `@opentui/core`, `commander` (убрать `tsx`)
  - devDependencies: `@types/bun`, `typescript` (убрать `vitest`, `@types/node`, `tsx`)
  - scripts: `"tui": "bun bin/lazyaif.ts tui"`, `"plans": "bun bin/lazyaif.ts plans"`, `"status": "bun bin/lazyaif.ts status"`, `"test": "bun test"`, `"build": "bun build --compile bin/lazyaif.ts --outfile lazyaif"`
  - `bin`: `"lazyaif": "bin/lazyaif.ts"` (напрямую .ts, без .js обёртки)

  Файлы: `package.json`

- [ ] Task 2: Обновить `tsconfig.json` — types: ["bun"] вместо ["node"]

  Файлы: `tsconfig.json`

- [ ] Task 3: Удалить `bin/lazyaif.js` обёртку

  Файлы: удалить `bin/lazyaif.js`

- [ ] Task 4: Перевести тесты с vitest на bun:test

  Заменить `import { describe, it, expect } from "vitest"` → `from "bun:test"` во всех тестах.

  Файлы: `tests/modules/plans-viewer/parser.test.ts`, `tests/modules/plans-viewer/scanner.test.ts`, `tests/modules/plans-viewer/status.test.ts`, `tests/modules/status/summary.test.ts`

- [ ] Task 5: Убрать fallback FFI в `tui-dashboard.ts` — bun имеет FFI из коробки

  Убрать try/catch fallback, вернуть прямой вызов createTuiRenderer.

  Файлы: `src/app/tui-dashboard.ts`

- [ ] Task 6: `bun install` + `bun test` + `bun link` — проверить что всё работает

  Установить зависимости через bun, прогнать тесты, сделать bun link, проверить `lazyaif plans` и `lazyaif status` глобально.