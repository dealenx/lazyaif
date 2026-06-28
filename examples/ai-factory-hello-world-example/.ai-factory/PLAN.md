# Implementation Plan: sum(a, b) — сложение двух чисел

Branch: none
Created: 2026-06-28

## Settings
- Testing: no
- Logging: verbose
- Docs: no  # yes => mandatory docs checkpoint in /aif-implement, no/unset => WARN [docs] only

## Tasks

### Phase 1: Implementation
- [ ] Task 1: Реализовать функцию `sum(a, b)` в `index.ts`

  Добавить в файл `index.ts` функцию сложения двух чисел. Функция должна:
  - Принимать два аргумента `a: number` и `b: number`
  - Возвращать их сумму: `number`
  - Быть экспортируемой (`export function sum`)
  - Обрабатывать `NaN`/`Infinity` стандартным образом JavaScript (без дополнительной валидации — оставляем нативную семантику)

  Сигнатура:
  ```ts
  export function sum(a: number, b: number): number {
    return a + b;
  }
  ```

  LOGGING REQUIREMENTS:
  - Логировать входные аргументы на DEBUG уровне: `[sum] a=<a>, b=<b>` (использовать существующую `debug()` из `index.ts`)
  - Логировать результат на DEBUG уровне: `[sum] result=<result>`
  - Логирование должно подчиняться `LOG_LEVEL`/`DEBUG` через уже существующий механизм `shouldLog("debug")`

  Интеграция:
  - Сохранить существующую функцию `main()` и вызов `main()` без изменений
  - Разместить `sum` выше `main()`, рядом с вспомогательными функциями логирования
  - Добавить короткий JSDoc-комментарий над функцией: `/** Складывает два числа и возвращает сумму. */`

  Файлы: `index.ts`