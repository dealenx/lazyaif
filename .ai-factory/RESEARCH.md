# Research: TUI plans-viewer list switching не работает

Updated: 2026-06-28 18:46
Status: active

## Active Summary (input for /aif-plan)
Topic: TUI plans-viewer — правая детальная панель не обновляется при переключении плана в левом списке
Goal: Понять корневую причину; подготовить план фикса
Constraints:
  - opentui `Box()`/`ScrollBox()`/`Select()` возвращают **VNode Proxy**, не реальный Renderable
  - Реальный Renderable создаётся только при `parent.add(vnode)` через `instantiate()`
  - Первый detail для плана #0 отображается корректно при старте, но **никогда не заменяется**
Decisions:
  - Скриншоты однозначно показывают: подсветка в Select двигается стрелками, но `updateDetail` не вызывается → `bodyRow.remove(currentDetail.id)` либо падает (try/catch глотает), либо не находит ребёнка по переданному id
  - Root cause: `currentDetail` хранит VNode Proxy, у которого `.id` через Proxy-геттер возвращает **функцию** (или undefined), а не строку. `bodyRow.remove(<function>)` молча не находит ребёнка, удаления не происходит, второй detail добавляется поверх — перекрытие двух `ScrollBox` шириной 60%
Open questions:
  - Почему `select.on(SELECTION_CHANGED, ...)` через VNode-прокси вообще срабатывает, если `instantiate` применяет `__pendingCalls` к `delegatedInstance` (Proxy вокруг instance)? Возможно `delegateMap` не задан для Select → `delegatedInstance === instance` → `instance.on(...)` действительно работает
  - Тот же вопрос для `select.focus()`: метод накапливается в `__pendingCalls` и применяется к instance при `add()` — фокус должен сработать. Если стрелки подсвечивают список — значит focus работает
  - Возможно `select.on()` через прокси действительно подписывается, но `SELECTION_CHANGED` event аргументы передаются по-другому? Или `console.debug` логи в TUI просто не пишутся в stderr (terminal control sequences перехватывают)? Нужна проверка
Success signals:
  - При нажатии стрелок в TUI правая панель обновляется: показывает title/branch/created выбранного плана
  - Enter тоже работает (для UX-ожидания)
  - При quit (`q`/`escape`) нет warning'ов в логах
Next step: Применить `/aif-fix` с двумя правками: (1) задать явный `id` каждому detail, (2) получать реальный Renderable через `bodyRow.getRenderable(id)` после `add()`, использовать его `id` (или саму ссылку) для удаления

## Mouse support в TUI планов

Подтверждено из исходников `@opentui/core`:

1. **`SelectRenderable` не переопределяет `onMouseEvent`** (index-6xr3rbbe.js:10687 → extends Renderable → onMouseEvent no-op). Это значит **Select не обрабатывает клики по элементам сам** — мы должны реализовать через `onMouseDown`/`onMouseUp` опции.
2. **Mouse input уже включён**: `createCliRenderer({ useMouse: true })` (по умолчанию, см. renderer docs).
3. **Auto-focus на клике**: `createCliRenderer({ autoFocus: true })` — клик по renderable автоматически фокусирует ближайший focusable ancestor. Select focusable, так что клик → focus → Select получает keypress events.
4. **`onMouseDown` etc. — это setter'ы** на `Renderable` (Renderable.d.ts:293-306: `set onMouseDown(handler)`, `set onMouseUp(handler)`, и т.д.). VNode-прокси корректно их накапливает через `__pendingCalls` с `isProperty: true`, и `instantiate()` применяет `delegatedInstance[call.method] = call.args[0]`.
5. **Геометрия Select для клика** (index.js:10770-10786):
   - `visibleOptions = options.slice(scrollOffset, scrollOffset + maxVisibleItems)`
   - Каждый item: `itemY = i * linesPerItem` (i — позиция в visible)
   - `linesPerItem`: 2 если showDescription, 1 без, плюс `itemSpacing`
   - `maxVisibleItems = Math.max(1, Math.floor(height / linesPerItem))`
6. **`Renderable.screenX/screenY`** (Renderable.d.ts:198-199) — глобальные координаты. Можно получить `localY = event.y - select.screenY`.
7. **MouseEvent** (index-6xr3rbbe.js:6823-6851): содержит `type` ("down"/"up"/"move"/etc), `button` (0=LEFT, 2=RIGHT, 4=WHEEL_UP, 5=WHEEL_DOWN), `x`, `y` (глобальные), `target`. Методы `stopPropagation()`, `preventDefault()`.

## Реализация

```typescript
// В renderPlanList:
const select = Select({
  ...opts,
  onMouseDown: (event: { button: number; y: number }) => {
    if (event.button !== 0) return; // только ЛКМ
    const localY = event.y - (select as any).screenY;
    if (localY < 0) return;
    const linesPerItem = (select as any).linesPerItem;
    const visibleIndex = Math.floor(localY / linesPerItem);
    const actualIndex = (select as any).scrollOffset + visibleIndex;
    if (actualIndex < 0 || actualIndex >= plans.length) return;
    onSelect(actualIndex);
  },
});
```

## Риски

1. **linesPerItem/scrollOffset через VNode-прокси**: `select.linesPerItem` — это getter на prototype. Прокси вернёт **функцию** (см. поведение Proxy get выше), не значение. Решение: сохранить прямой typed-каст `as any` или обращаться через `Object.getPrototypeOf(select).linesPerItem.call(select)`. Альтернатива — захватить `linesPerItem` локально (мы знаем: 2 + itemSpacing при showDescription=true).
2. **screenY обновляется после layout pass**: после первого `add()` в дерево screenY может быть 0 пока не отработает layout. На момент клика обычно уже корректен.
3. **scrollOffset/screenY недоступны через VNode-прокси как геттеры**: лучше получать реальный Renderable через `bodyRow.getRenderable(id)` после `add()` (как мы уже делаем для detail). Или сохранять наш собственный planList state (`scrollOffset` обычно не меняется без явных действий).
4. **Scroll wheel не обработан**: можно добавить `onMouseDown` уже достаточно, wheel — отдельная задача.

## Sessions

### 2026-06-28 19:11 — Все официальные примеры opentui используют new *Renderable, не *() VNode Proxy

Анализ `C:\Users\dealenx\Downloads\opentui-main\opentui-main\packages\examples\src`:
- `select-demo.ts`: `new SelectRenderable(renderer, {...})` + `renderer.root.add(selectElement)`
- `input-select-layout-demo.ts`: `new SelectRenderable(renderer, {...})` + `parentBox.add(select)`
- `tab-select-demo.ts`: `new TabSelectRenderable(renderer, {...})` + `renderer.root.add(tabSelect)`
- `focus-restore-demo.ts` (не смотрел, но судя по naming — тот же паттерн)
- `mouse-interaction-demo.ts`: единственный использует `Box({...})` (VNode) + `onMouse` catch-all handler через props

Все интерактивные компоненты (Select, TabSelect, Input) в примерах создаются через `new Renderable(renderer, {...})` — **прямой инстанс**, не `Renderable({...})` (VNode Proxy). Это даёт:
- Прямой доступ к методам (`select.focus()`, `select.on(...)`, `select.setSelectedIndex()`, `select.screenY`, `select.linesPerItem`, `select.scrollOffset`)
- `renderer.root.findDescendantById(id)` / `parentBox.getRenderable(id)` работает корректно
- Никакой магии `__pendingCalls` на VNode-прокси, которая и ломала наш TUI

### План исправления tui-view.ts

**Цель:** переключиться с VNode-Proxy API (`Box()`, `Select()`, `ScrollBox()`, `Text()`) на прямой `new *Renderable(renderer, {...})` — как в официальных примерах.

**Конкретные шаги:**

1. **Импорт классов** вместо функций:
   ```ts
   import { BoxRenderable, TextRenderable, SelectRenderable, ScrollBoxRenderable, SelectRenderableEvents, t, bold, fg } from "@opentui/core";
   ```
   Убрать `Box`, `Text`, `Select`, `ScrollBox`.

2. **`renderPlanList`** — переписать на `new SelectRenderable(renderer, {...})`:
   - Принимать `renderer: CliRenderer` как параметр (или доставать из контекста)
   - `const select = new SelectRenderable(renderer, { id: "plan-list", width: "40%", height: "100%", options, ... })`
   - `select.on(SelectRenderableEvents.SELECTION_CHANGED, ...)` — прямой подписчик, без VNode proxy
   - `select.on(SelectRenderableEvents.ITEM_SELECTED, ...)` — для Enter
   - `select.focus()` — прямой вызов, без pendingCalls
   - Добавить `onMouse` catch-all handler для кликов (как в mouse-interaction-demo):
     ```ts
     // либо в options:
     onMouse: (event) => {
       if (event.type !== "down" || event.button !== 0) return;
       const localY = event.y - select.screenY;
       if (localY < 0) return;
       const visibleIndex = Math.floor(localY / select.linesPerItem);
       const actualIndex = select.scrollOffset + visibleIndex;
       if (actualIndex < 0 || actualIndex >= plans.length) return;
       select.setSelectedIndex(actualIndex); // → SELECTION_CHANGED → onSelect
     }
     ```
   - Возвращает реальный `SelectRenderable` (не VNode)

3. **`renderTaskDetail`** — переписать на `new ScrollBoxRenderable(renderer, {...})` + `new TextRenderable(renderer, {...})` + `new BoxRenderable(renderer, {...})`:
   - Принимает `renderer` параметр
   - Принимает `id: string` параметр (для удаления через `parent.remove(id)`)
   - Возвращает реальный `ScrollBoxRenderable`

4. **`createPlansTuiApp`** — переписать с `new BoxRenderable(renderer, {...})`:
   - `const headerBox = new BoxRenderable(renderer, {...})` + `headerBox.add(...)` для header
   - `const bodyRow = new BoxRenderable(renderer, { id: "body-row", flexDirection: "row", flexGrow: 1, width: "100%" })`
   - `const planList = renderPlanList(renderer, plans, statuses, onSelect)` — теперь возвращает реальный SelectRenderable
   - `bodyRow.add(planList)` — добавляет реальный instance (не VNode)
   - `const initialDetail = renderTaskDetail(renderer, plan, status, "plan-detail-0")` — реальный ScrollBox
   - `bodyRow.add(initialDetail)` — корректная регистрация в `renderableMapById`
   - `renderer.root.add(headerBox)` — прямой instance
   - `currentDetail` хранит `{ id: string, renderable: ScrollBoxRenderable }`
   - В `updateDetail`: `bodyRow.remove(currentDetail.id)` — работает корректно, потому что id строковый и renderable зарегистрирован в `renderableMapById`

5. **Убрать `renderer.root.findDescendantById("plan-list")` хак** — он больше не нужен, потому что `renderPlanList` возвращает реальный `SelectRenderable`.

6. **Убрать хак с `as unknown as { remove: (id: string) => void }`** — `bodyRow` теперь реальный `BoxRenderable` с правильным `.remove(id: string)` API.

### Почему это решит обе проблемы

| Проблема | Причина (VNode Proxy) | Решение (new *Renderable) |
|---|---|---|
| Клавиши не переключают detail | `select.on(...)` через `__pendingCalls` работает, но `bodyRow.remove(currentDetail.id)` ломается — `currentDetail.id` через Proxy возвращает функцию, не строку | `bodyRow.remove(detail.id)` на реальном instance корректно находит и удаляет child |
| Мышь не работает | `Select` через VNode не обрабатывает клики по элементам; `onMouseDown` setter через `__pendingCalls` может не применяться корректно к делегированному instance | `new SelectRenderable` + `onMouse` в options — прямой catch-all handler, как в `mouse-interaction-demo.ts` |

### Риски

1. **`ScrollBoxRenderable` API**: в примерах не нашёл использования `new ScrollBoxRenderable`. Но .d.ts подтверждает, что это класс. Возможно у него другой constructor signature. Нужно проверить в `node_modules/@opentui/core/renderables/ScrollBox.d.ts`.
2. **`t`-tagged template для TextRenderable content**: в примерах `content: t\`...\`` — это `StyledText`, работает с `new TextRenderable`. Проверить.
3. **`onMouse` catch-all vs `onMouseDown`**: в `mouse-interaction-demo` используется `onMouse` (catch-all) внутри `Box({...})` props. Неясно, работает ли `onMouse` на `SelectRenderable` через `new` так же. Если нет — попробовать `onMouseDown` setter на реальном instance (он должен работать, потому что это setter на prototype).

- `MarkdownRenderable` API: `new MarkdownRenderable(renderer, { content: string, syntaxStyle: SyntaxStyle, fg, bg, conceal: true, internalBlockMode: "top-level", tableOptions: {...}, width: "100%" })` — рендерит markdown с заголовками, таблицами, код-блоками, списками, ссылками, цитатами. Скрывает markdown-маркеры когда `conceal: true`.
- `SyntaxStyle.fromStyles({ "markup.heading": { fg: "#58A6FF", bold: true }, "markup.bold": { fg: "#F0F6FC", bold: true }, "markup.raw": { fg: "#A5D6FF", bg: "#161B22" }, ... })` — создаёт стиль из объекта. Примеры тем в `markdown-demo.ts` (githubLight, github dark, monokai, nord).
- `MarkdownRenderable` можно добавлять в `ScrollBoxRenderable` через `scrollBox.add(markdownDisplay)` — работает скролл.
- `content` можно обновлять: `markdownDisplay.content = newMarkdownString`.
- `conceal: true` — скрывает `**`, `###`, `|`, ` ``` ` и т.д., оставляя только форматированный вывод.
- `internalBlockMode: "top-level"` — каждый блок (heading, paragraph, table, code fence) — отдельный ребёнок. Удобно для streaming/обновления.
- `tableOptions: { style: "grid", widthMode: "content", cellPaddingX: 1 }` — рендеринг таблиц с границами.
- Поддержка code highlighting через Tree-sitter (`treeSitterClient`), но это опционально — без него код-блоки просто отображаются как моноширинный текст.
- `fg`, `bg` — цвета текста/фона по умолчанию.

### План: Markdown-рендеринг вместо плоского текста в detail-панели

Текущая `renderTaskDetail` строит detail из отдельных `TextRenderable`/`BoxRenderable` — вручную рендерит заголовок, мета, статус, разделитель, фазы, задачи. Это работает, но не отображает markdown-содержимое планов (фазы/задачи хранятся как markdown в `.ai-factory/plans/*.md`).

**Альтернатива A — полностью заменить detail на MarkdownRenderable:**
- Прочитать **сырой markdown** файла плана (не распарсенный `Plan`-объект, а исходный `.md`)
- Передать его как `content` в `new MarkdownRenderable(renderer, { content: rawMarkdown, syntaxStyle, ... })`
- Положить MarkdownRenderable в ScrollBox (60% ширина, 100% высота)
- Плюсы: заголовки, таблицы, code-блоки, ссылки рендерятся нативно
- Минусы: теряется наш кастомный UI (мета-строка, цветной статус, `[x]`/`[ ]` чекбоксы фаз). Markdown покажет чекбоксы как обычный текст `- [x]`.

**Альтернатива B — гибрид: верхняя панель с мета/статусом + MarkdownRenderable для тела плана:**
- Верхняя часть: `TextRenderable` для title/branch/created/status (как сейчас)
- Нижняя часть: `MarkdownRenderable` для остального содержимого плана — фазы, задачи, описания, код-блоки. Берём `rawMarkdown` плана (без заголовка `# Implementation Plan:` / `Branch:` / `Created:` / `## Settings` — обрезаем верх).
- Плюсы: сохраняется наш цветной статус, но тело плана рендерится как markdown
- Минусы: сложнее — нужно резать markdown, склеивать ScrollBox с двумя детьми

**Альтернатива C — минимальная: MarkdownRenderable для task descriptions:**
- `task.description` часто содержит markdown (backticks, списки, ссылки). Сейчас рендерится как плоский текст.
- Заменить `TextRenderable` для `task.description` на `MarkdownRenderable` (внутри `Box` строки задачи).
- Плюсы: минимальное изменение, решает "показывает чистое содержимое"
- Минусы: заголовки фаз всё ещё плоский текст

**Рекомендация:** Альтернатива B (гибрид). Она сохраняет наш красивый status-бар, но рендерит содержимое плана (фазы, задачи, описания) как markdown. Если хочется совсем просто — Альтернатива A (просто весь файл плана как markdown, без нашего кастомного status-бара).

### Что нужно для реализации (B):

1. В `parser.ts` или `scanner.ts` добавить поле `rawMarkdown: string` в `Plan`-тип — хранить исходный markdown файла.
2. В `renderTaskDetail`:
   - Создать `ScrollBoxRenderable` (как сейчас)
   - Добавить `TextRenderable` для title/branch/status/separator (как сейчас)
   - Вырезать из `rawMarkdown` секции `# Implementation Plan:`, `Branch:`, `Created:`, `## Settings` (оставить только `## Architecture`, `## Phase N`, `- [x] Task N: ...`)
   - Создать `MarkdownRenderable(renderer, { content: remainingMarkdown, syntaxStyle, fg: colors.fg, bg: colors.bg, conceal: true, width: "100%" })`
   - Добавить его в ScrollBox
3. Создать `SyntaxStyle.fromStyles({...})` с markdown-стилями, базирующимися на `colors` из `theme.ts` (accent, done, progress, muted, etc.).

### Что нужно для реализации (A — проще):

1. В `Plan` добавить `rawMarkdown: string`.
2. В `renderTaskDetail` просто:
   ```ts
   const md = new MarkdownRenderable(renderer, {
     content: plan.rawMarkdown,
     syntaxStyle,
     fg: colors.fg,
     bg: colors.bg,
     conceal: true,
     width: "100%",
     height: "100%",
   });
   return md; // или обернуть в ScrollBox
   ```
3. Потеряем наш status-бар (done/total/pct), но получим красивый markdown целиком.

### Риски

- `MarkdownRenderable` — сложный компонент, зависит от `marked` (есть в deps), `tree-sitter` (опционально).
- `conceal: true` может скрыть чекбоксы `- [x]` → пользователь не увидит, что сделано. Нужно проверить.
- `SyntaxStyle.fromStyles` — статический метод, должен работать без tree-sitter.
- Размер бандла: `bun build --compile` может вырасти из-за `marked` (уже в deps @opentui/core).

### 2026-06-28 18:46 — VNode Proxy ломает currentDetail.id
What changed:
  - Подтверждено из исходников `@opentui/core/index-6xr3rbbe.js:3072`: `Box(props, ...)` возвращает `h(BoxRenderable, ...)` → VNode Proxy
  - VNode Proxy через `__pendingCalls` накапливает вызовы методов и применяет их к реальному instance при `add()` через `instantiate()`
  - Реальный instance регистрируется в `parent.renderableMapById` и доступен через `parent.getRenderable(id)`
  - У VNode Proxy `currentDetail.id` через геттер-обработчик возвращает **функцию**, не строку → `bodyRow.remove(<function>)` ничего не удаляет
  - Старый detail остаётся в дереве, новый добавляется → две ScrollBox перекрываются. Визуально виден первый (старший по добавлению / z-order)
Key notes:
  - `Box()`/`Select()`/`ScrollBox()` ВСЕ возвращают VNode Proxy. Это нужно помнить при работе с opentui
  - Правильный паттерн: задать явный `id` в props → после `add()` использовать `parent.getRenderable(id)` для получения реального instance
  - Альтернатива: использовать `new BoxRenderable(renderer, props)` напрямую — но это менее idiomatic, требует renderer context
Links (paths):
  - packages/lazyaif/src/views/plans-viewer/tui-view.ts:131 — `currentDetail` хранит VNode
  - packages/lazyaif/src/views/plans-viewer/tui-view.ts:140-144 — `bodyRow.remove(currentDetail.id)` ломается
  - node_modules/@opentui/core/index-6xr3rbbe.js:3072 — `function Box(props, ...children)` → VNode
  - node_modules/@opentui/core/index-6xr3rbbe.js:1607 — `instantiate()` создаёт реальный instance
  - node_modules/@opentui/core/index-6xr3rbbe.js:1013 — instance регистрируется в `renderableMapById`