# Plan: Визуальный редактор темпо (Tempo Builder)

**Branch:** — (full mode, no git switch)
**Created:** 2026-06-10
**Mode:** full, no git branch

## Settings

- **Testing:** No tests (implementation first, tests later)
- **Logging:** Standard — INFO level, key events only
- **Docs:** No mandatory docs checkpoint

## Research Context

Текущий флоу создания темпо требует написания Lua-скрипта вручную и загрузки файла (.lua или .zip) через drag-and-drop диалог. Это неудобно для простых последовательностей. Цель — визуальный конструктор, который генерирует Lua-скрипт из формы.

## Tasks

### Phase 1: Компонент TempoBuilder (UI)

---

#### [x] Task 1: Создать компонент TempoBuilder

Создать новый React-компонент `packages/ui/src/components/tempo-builder.tsx` — визуальный конструктор темпо.

**Форма включает:**
- Название (Input, обязательно)
- Описание (Textarea, опционально)
- Cron-расписание (Input с placeholder `"*/5 * * * *"`, опционально)
- Часовой пояс (Select из списка популярных IANA-зон, опционально)

---

#### Task 2: Создать отдельную страницу создания темпо (вместо диалога)

Заменить текущий диалог создания в `list.tsx` на полноценную отдельную страницу `/tempos/create` с вкладками.

### Phase 2: Редактирование существующего темпо

---

#### [x] Task 3: Добавить вкладку «Редактор» в TemposShowLayout

Добавить новый таб «Редактор» в массив `tabItems` в `packages/ui/src/pages/tempos/show/layout.tsx`.

#### [x] Task 4: Добавить роут для страницы редактора темпо

Добавить роут для `/tempos/show/:id/editor` в роутинг приложения.

### Phase 3: Полировка

---

#### [x] Task 5: UX-улучшения — предпросмотр Lua в TempoBuilder

Добавить переключатель «Предпросмотр Lua» в TempoBuilder.

#### [x] Task 6: Обновить диалог редактирования в настройках темпо

В `packages/ui/src/pages/tempos/show/settings.tsx` — расширить диалог редактирования темпо.