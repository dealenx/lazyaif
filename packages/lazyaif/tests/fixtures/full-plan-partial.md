# Implementation Plan: Площадь прямоугольника (area)

Branch: none
Created: 2026-06-28

## Settings
- Testing: no
- Logging: verbose
- Docs: no

## Tasks

### Phase 1: Implementation
- [x] Task 1: Добавить сигнатуру функции `area(width, height)` с JSDoc и основной логикой в `index.ts`

  Добавить в файл `index.ts` экспортируемую функцию расчёта площади прямоугольника.

  Файлы: `index.ts`

- [x] Task 2: Добавить логирование входных аргументов в функции `area` (DEBUG) (depends on 1)

  Добавить в тело функции `area` логирование входных аргументов на DEBUG уровне.

  Файлы: `index.ts`

- [ ] Task 3: Добавить логирование результата в функции `area` (DEBUG) (depends on 1)

  Добавить логирование результата.

  Файлы: `index.ts`

- [ ] Task 4: Интегрировать `area` в файл — разместить выше `main()` (depends on 1, 2, 3)

  Финальная интеграция функции `area`.

  Файлы: `index.ts`