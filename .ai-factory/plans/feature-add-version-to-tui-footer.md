# Implementation Plan: Add app version to TUI footer

Branch: none (no-git-switch)
Created: 2026-06-28

## Settings
- Testing: yes
- Logging: verbose
- Docs: no  # WARN [docs] only

## Research Context

Source: explore session (aif-explore) — TUI footer version display

Goal: показать версию приложения в footer TUI (plans-viewer).
Constraints:
- Версия берётся из `packages/lazyaif/package.json` (поле `version`, текущее значение `0.1.7`).
- Источник версии — `import pkg from "../../package.json"` (Bun + `resolveJsonModule: true`).
- Только footer, header и cli-view не трогаем.
Decisions:
- Layout: `flexDirection: "row"`, `justifyContent: "space-between"` — версия слева, hotkeys по центру (вариант A).
- Версия рендерится через отдельный `TextRenderable` слева; hotkeys остаются центрированным `TextRenderable`.
- Цвет версии: `colors.muted` (как у hotkeys) — единый визуальный стиль статус-бара.
Open questions: нет.

## Tasks

### Phase 1: Version source
- [x] Task 1: Создать `packages/lazyaif/src/shared/version.ts`, экспортирующий `VERSION` из `package.json`.

### Phase 2: Footer refactor
- [x] Task 2: Переработать `footer.ts` — добавить левый блок с версией, центрировать hotkeys. (depends on 1)

### Phase 3: Tests
- [x] Task 3: Добавить тест `tests/clients/tui/components/footer.test.ts` — проверка рендера версии и hotkeys. (depends on 2)