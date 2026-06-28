# Implementation Plan: Площадь прямоугольника (area)

Branch: none
Created: 2026-06-28

## Settings
- Testing: no
- Logging: verbose
- Docs: no  # yes => mandatory docs checkpoint in /aif-implement, no/unset => WARN [docs] only

## Tasks

### Phase 1: Implementation
- [x] Task 1: Добавить сигнатуру функции `area(width, height)` с JSDoc и основной логикой в `index.ts`

  Добавить в файл `index.ts` экспортируемую функцию расчёта площади прямоугольника. Функция должна:
  - Принимать два аргумента `width: number` и `height: number`
  - Возвращать их произведение: `number`
  - Быть экспортируемой (`export function area`)
  - Обрабатывать `NaN`/`Infinity` стандартным образом JavaScript (без дополнительной валидации — оставляем нативную семантику)
  - Добавить короткий JSDoc-комментарий над функцией: `/** Считает площадь прямоугольника по ширине и высоте. */`

  Сигнатура:
  ```ts
  /**
   * Считает площадь прямоугольника по ширине и высоте.
   */
  export function area(width: number, height: number): number {
    return width * height;
  }
  ```

  На этом этапе логирование и размещение в файле НЕ затрагиваются — только сигнатура, JSDoc и логика функции.

  Файлы: `index.ts`

- [x] Task 2: Добавить логирование входных аргументов в функции `area` (DEBUG) (depends on 1)

  Добавить в тело функции `area` логирование входных аргументов на DEBUG уровне, используя существующую функцию `debug()` из `index.ts`.

  Требования:
  - Логировать входные аргументы на DEBUG уровне: `[area] width=<width>, height=<height>`
  - Использовать существующую `debug()` из `index.ts`
  - Логирование должно подчиняться `LOG_LEVEL`/`DEBUG` через уже существующий механизм `shouldLog("debug")`
  - Логирование разместить в начале тела функции, до вычисления результата

  Ожидаемый фрагмент:
  ```ts
  debug(`[area] width=${width}, height=${height}`);
  ```

  Файлы: `index.ts`

- [ ] Task 3: Добавить логирование результата в функции `area` (DEBUG) (depends on 1)

  Добавить в тело функции `area` логирование результата на DEBUG уровне, используя существующую функцию `debug()` из `index.ts`.

  Требования:
  - Логировать результат на DEBUG уровне: `[area] result=<result>`
  - Использовать существующую `debug()` из `index.ts`
  - Логирование должно подчиняться `LOG_LEVEL`/`DEBUG` через уже существующий механизм `shouldLog("debug")`
  - Логирование разместить после вычисления результата, до возврата значения

  Ожидаемый фрагмент:
  ```ts
  const result = width * height;
  debug(`[area] result=${result}`);
  return result;
  ```

  Файлы: `index.ts`

- [ ] Task 4: Интегрировать `area` в файл — разместить выше `main()`, сохранить `main()` без изменений (depends on 1, 2, 3)

  Финальная интеграция функции `area` в файл `index.ts`.

  Требования:
  - Разместить `area` выше `main()`, рядом с вспомогательными функциями логирования
  - Сохранить существующую функцию `main()` и вызов `main()` без изменений
  - Убедиться, что итоговая функция `area` содержит все элементы из задач 1-3: сигнатура, JSDoc, логика, логирование аргументов, логирование результата
  - Проверить, что файл компилируется без ошибок (tsc --noEmit или аналогичный механизм проекта)

  Финальный вид функции:
  ```ts
  /**
   * Считает площадь прямоугольника по ширине и высоте.
   */
  export function area(width: number, height: number): number {
    debug(`[area] width=${width}, height=${height}`);
    const result = width * height;
    debug(`[area] result=${result}`);
    return result;
  }
  ```

  Файлы: `index.ts`