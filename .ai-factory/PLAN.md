# Implementation Plan: list item task summary + Enter to open + Esc never quits

Branch: 0.x
Created: 2026-06-30

## Settings

- Testing: no
- Logging: standard
- Docs: no

## Context

Post-release refinement of v0.2.4 (TUI list-only default + full-page
markdown on Tab, issue #4). Three small UX tweaks requested by the
user after using v0.2.4:

1. **Per-plan task summary in the list.** While paging through plans in
   Mode A the user wants a one-liner saying how many tasks are done /
   in-progress / not-started, in addition to the existing progress bar,
   percent, status icon, and relative mtime.

2. **Enter opens the full-page detail, same as Tab.** Today `Enter` is
   wired to the `ITEM_SELECTED` event from `SelectRenderable` but the
   debounced `onSelect` callback short-circuits to a no-op in Mode A
   (`if (viewMode === "detail") enterDetailMode()` guard from the v0.2.4
   Task 2). Result: pressing `Enter` in Mode A does nothing. `Tab` works
   because the keypress handler calls `enterDetailMode()` directly.

3. **`Esc` does not quit the program.** This is **already true** in
   v0.2.4 — the keypress handler in `tui-view.ts` only routes `Esc` to
   `enterListMode()` in Mode B and no-ops in Mode A; `process.exit(0)`
   is wired only to `q` / `Q`. The plan captures this as an explicit
   invariant so a future refactor cannot quietly change it.

Existing v0.2.4 tasks (Tasks 1-3 in the prior plan, all completed and
shipped in release `f923e1a` / `00383c3` / `v0.2.4`) are not modified —
they are the foundation. The four new tasks below build on top.

## Tasks

- [x] Task 4: Extend `PlanStatus` with `inProgress` and `notStarted`
  - File: `packages/lazyaif/src/modules/plans-viewer/status.ts`
  - Currently `computeStatus(plan)` returns
    `{ done, total, pct, state }`. The `in-progress` and `not-started`
    counts are not surfaced — only the aggregate `state`. The new
    `buildOptions` description (Task 5) needs per-category counts, so we
    extend the return type.
  - Add two **optional** fields so existing callers and tests don't
    break: `inProgress?: number` and `notStarted?: number`. Mark them
    optional in `types.ts`:
    ```ts
    export interface PlanStatus {
      done: number;
      total: number;
      pct: number;
      state: PlanState;
      inProgress?: number;
      notStarted?: number;
    }
    ```
  - In `computeStatus`:
    - `const inProgress = plan.tasks.filter((t) => !t.done && /* not
      "in-progress" in parser sense */ ...)` — see note below.
    - `const notStarted = total - done - inProgress;`
    - Return them in the object.
  - **Caveat — what counts as "in-progress":** the parser does not tag
    tasks with state; only `done: boolean`. To avoid a parser change,
    define "in-progress" as: **any task that has a non-empty
    `description` and is not `done`**. Empty-description undone tasks
    are "not-started"; undone tasks with description are "in-progress".
    This matches how `aif` plans naturally get written in practice
    (description is filled in as work begins) and avoids a false sense
    of progress for plans where nothing is written yet.
  - Update the existing parser/scanner tests only if they assert on
    `PlanStatus` fields — they do not (the parser test is about
    `parsePlanFile`, the status test is about `computeStatus` totals,
    neither inspects `inProgress` / `notStarted`). Verify with
    `bun test` after the change.
  - Logging: standard — debug line at the end of `computeStatus`
    logs the new counts: `done=${done} inProgress=${inProgress}
    notStarted=${notStarted} total=${total}`.
  - Notes:
    - "in-progress" via description is a heuristic — explicitly
      documented in the function's JSDoc so future readers know
      it is not parser-derived state. If the user later wants
      real state, add a `state: "todo" | "doing" | "done"` field
      in `parser.ts`.

- [x] Task 5: Show `done/inProgress/notStarted` in `buildOptions` description
  - File: `packages/lazyaif/src/views/plans-viewer/tui-view.ts`
  - `buildOptions()` (tui-view.ts:41-56) builds each list item's
    `description` string. Today:
    ```ts
    description: `${progress}  ${pct}  ${icon}  ·  ${relativeTime}`,
    ```
  - Add a compact task-counts segment to the description. New
    `description` shape:
    ```ts
    description: `${progress}  ${pct}  ${icon}  ·  ${counts}  ·  ${relativeTime}`,
    ```
    where `counts` is built as:
    ```ts
    const counts = `${status.done}/${status.total} done · ${status.inProgress ?? 0} in prog · ${status.notStarted ?? 0} todo`;
    ```
  - Glyphs and ordering:
    - `done` (numeric, e.g. `5/12`)
    - ` in prog` (count of undone with non-empty description)
    - ` todo` (count of undone with empty description)
  - Width budget: the description line in a typical 100-col terminal
    has ~80 cols. With the existing `progress  pct  icon  relativeTime`
    (≈30 cols) plus the new `counts` segment (≈40 cols) it fits.
    At 80-col terminals the rightmost `relativeTime` may wrap; that is
    acceptable (existing `labelTick` already mutates only `description`,
    not the layout).
  - The new field depends on Task 4 (PlanStatus extension). If
    `status.inProgress` is `undefined` (older callers), the
    `?? 0` keeps output stable.
  - Logging: standard — the existing `debug` line in `buildOptions`
    already logs `relativeTime for ${plan.fileName}`; extend it to
    log `counts=${counts}` so we can spot bad values in the field.
  - Depends on: Task 4.

- [x] Task 6: Make `Enter` open the detail immediately
  - File: `packages/lazyaif/src/views/plans-viewer/tui-view.ts`
  - Today `renderPlanList()` registers two SelectRenderable listeners
    on the same `onSelect` callback (tui-view.ts:82-90):
    ```ts
    select.on(SelectRenderableEvents.SELECTION_CHANGED, (index) => onSelect(index));
    select.on(SelectRenderableEvents.ITEM_SELECTED,  (index) => onSelect(index));
    ```
  - The `onSelect` callback debounces by 100ms and only mounts the
    detail when `viewMode === "detail"` — so `Enter` (which fires
    `ITEM_SELECTED`) is effectively a no-op in Mode A.
  - Split the wiring so `Enter` skips the debounce and switches
    mode synchronously:
    - Pass a second callback `onOpen: (index: number) => void` into
      `renderPlanList()` and wire it to `ITEM_SELECTED` only.
    - `onSelect` stays wired to `SELECTION_CHANGED` (and mouse hover
      events).
    - In `createPlansTuiApp` the `onOpen` callback:
      1. Calls `clampSelection(index, plans.length)`; if null, return.
      2. Sets `selectedIndex = clamped`.
      3. Cancels any `pendingSelectTimer` (we are about to open,
         intermediate renders are pointless).
      4. Calls `enterDetailMode()` directly — no debounce, no wait
         for `viewMode === "detail"` (the guard inside `enterDetailMode`
         will no-op if already in detail, which is the right
         behaviour for double-Enter).
  - Esc semantics remain unchanged:
    - Mode A → no-op (Esc does not quit, does not toggle).
    - Mode B → `enterListMode()` (back to list).
    This is the v0.2.4 invariant the user explicitly confirmed
    ("Esc только в detail → back, ничего не менять"). Add a comment
    above the `if (event.name === "escape")` block in the keypress
    handler: `// Esc NEVER quits the program — it only navigates the
    Mode B → Mode A transition. process.exit(0) is wired to q only.`
  - Logging: standard — log `[tui:open] via=enter index=…` on Enter
    so a future regression is easy to spot.
  - Depends on: Task 5 (only because the file already changes there
    — both touch `tui-view.ts`, but the order matters for `git diff`
    readability, not for correctness).

- [x] Task 7: Update `HOTKEYS_LIST` to advertise `Enter: open`
  - File: `packages/lazyaif/src/clients/tui/components/footer.ts`
  - Current:
    `Arrows/Enter: select · Mouse click: select · auto-refresh: 2s · Tab: open · q: quit`
  - New (Enter promoted from "select" to "open", to reflect that it
    opens detail, not just moves highlight):
    `Arrows: navigate · Enter/Tab: open · Mouse click: select · auto-refresh: 2s · q: quit`
  - Note: this is **mode A** only. Mode B (detail) footer stays:
    `Arrows/PageUp/PageDown: scroll · Tab/Esc: back · auto-refresh: 2s · q: quit`
    (no change — Enter is not used in Mode B, and Esc already means
    "back" there).
  - Logging: no change (`renderFooter` debug line already includes
    `mode=${mode}`).
  - Depends on: Task 6 (Enter is the new "open" hotkey; the footer
    text should match what the handler does).

## Commit Plan

Two commits — Task 4 alone (small, isolated types change) for clean
diff and easy backport; Tasks 5-7 together (all touch TUI rendering
and are visually one UX bundle).

```
chore(status): surface inProgress and notStarted counts in PlanStatus
feat(tui): show per-plan task counts, Enter opens detail, footer updated
```

## Post-v0.2.5 bugfix (TUI shutdown + Esc hardening)

After v0.2.5 was tagged, the user reported two related issues from
running the binary in a real terminal (Windows Terminal, alternate
screen buffer):

1. **Esc appears to quit the program.** The user's screenshot shows
   the shell prompt after pressing Esc, with TUI fragments still
   painted on the right side of the prompt line. There is no
   `process.exit(0)` on the Esc branch in our code, so the most
   likely cause is that Esc is leaking to opentui's `KeyHandler` /
   alternate-screen handler or to the terminal itself, which then
   treats the subsequent input as "leave alternate screen".

2. **`q` leaves the screen dirty.** The shell prompt is rendered
   on top of the still-active alternate screen buffer because
   `process.exit(0)` is called directly from the keypress handler,
   bypassing `renderer.destroy()`. opentui normally restores the
   main screen on `destroy()` (its `clearOnShutdown` flag is
   `true` by default — see
   `node_modules/@opentui/core/index-6xr3rbbe.js:9506`), but
   `process.exit(0)` skips that teardown entirely.

Both bugs are the same root cause: **`q` quit path does not call
`renderer.destroy()` before `process.exit(0)`.** Task 9 fixes this.
Task 8 hardens Esc to make sure the early-out branch in the
keypress handler cannot leak the keystroke to opentui / the
terminal.

- [x] Task 8: Harden Esc in the keypress handler
  - File: `packages/lazyaif/src/views/plans-viewer/tui-view.ts`
  - Current Esc handling (tui-view.ts:407-413):
    ```ts
    if (event.name === "escape") {
      if (viewMode !== "detail") return;     // ← no preventDefault
      event.preventDefault();
      enterListMode();
      return;
    }
    ```
  - Add `event.preventDefault()` in the early-out path too:
    ```ts
    if (event.name === "escape") {
      event.preventDefault();             // ← swallow always
      if (viewMode !== "detail") {
        debug("[tui:keypress] escape: no-op in list mode (prevented default)");
        return;
      }
      enterListMode();
      return;
    }
    ```
  - Why: `preventDefault()` stops opentui from dispatching the
    keystroke further down its handler chain, and stops the
    terminal from interpreting a stray `\x1B` as the start of
    an escape sequence (e.g. `?1049l` leave-alternate-screen).
    Today the early-out branch in Mode A let Esc fall through
    unblocked, which is the most likely explanation for "Esc
    quits the program" — the keystroke leaked to opentui /
    terminal level, not to our handler.
  - Logging: standard — add a debug line in the early-out path
    so a future regression of "Esc quit" leaves a breadcrumb.
  - Notes:
    - Mode B Esc continues to call `enterListMode()` as before;
      only the order of `preventDefault()` vs the mode check
      changes.
    - This task does NOT change what Esc *does* (still
      back-only). It only ensures Esc is always swallowed by
      our handler, never leaks.

- [x] Task 9: Orderly teardown on `q` (renderer.destroy() before exit)
  - File: `packages/lazyaif/src/views/plans-viewer/tui-view.ts`
  - Current `q` handling (tui-view.ts:419-421):
    ```ts
    if (event.name === "q") {
      event.preventDefault();
      console.debug(`[tui:quit] exiting via q keypress`);
      process.exit(0);
    }
    ```
  - The screenshot shows that `process.exit(0)` is taken
    *without* calling `renderer.destroy()`. opentui would have
    restored the main screen buffer if `destroy()` had been
    called — `clearOnShutdown: true` is the default
    (see `node_modules/@opentui/core/index-6xr3rbbe.js:9506`).
  - Replace the body with a `quitTui()` helper that:
    1. Calls the existing `destroy()` callback returned by
       `createPlansTuiApp` — it already removes the keypress
       listener and clears refresh intervals + pending timers
       (tui-view.ts:507-520).
    2. Calls `renderer.destroy()` — opentui's official teardown.
       This restores the main screen, leaves the alternate
       buffer, and stops internal timers.
    3. `process.exit(0)`.
  - Wrap in an idempotency guard so a second `q` while we're
    already tearing down doesn't re-enter (mirrors the
    `enterListMode` / `enterDetailMode` pattern from
    v0.2.4).
  - Also bind the same teardown path to `Ctrl+C` for symmetry
    and to cover the case where the user uses `Ctrl+C` instead
    of `q` (opntui's `exitOnCtrlC: true` already triggers its
    own destroy, but the renderer's teardown does not cancel
    our intervals/handlers — running our `destroy()` first is
    safer and idempotent).
  - Logging: standard — log the sequence
    `[tui:quit] phase=…` so a future regression is easy to
    trace (e.g. `[tui:quit] phase=destroy-cb`,
    `[tui:quit] phase=renderer-destroy`,
    `[tui:quit] phase=process-exit`).
  - Depends on: Task 8 (the `q` branch already calls
    `preventDefault`; the new teardown reuses the same flow).

## Post-v0.2.6 bugfix (mouse sequences leak on exit)

After v0.2.6 was tagged, the user's screenshot still showed
garbled `35;86;...;1M` text painted on the shell prompt after
exiting via `q`. Web research against the opentui issue tracker
turned up the exact match:

- anomalyco/opentui#904 "mouse escape sequences garbled after
  renderer destroy — cleanupBeforeDestroy() disables raw mode
  before mouse tracking"
  (https://github.com/anomalyco/opentui/issues/904)

The issue is that `cleanupBeforeDestroy()` in opentui's renderer
sets `_useMouse = false` and only **then** calls
`stdin.setRawMode(false)`. The flag flip stops our JS handlers
from receiving mouse events, but it does **not** send the
terminal-level disable sequences (`\x1b[?1000l`, `\x1b[?1003l`,
`\x1b[?1006l`). The terminal therefore keeps SGR mouse tracking
on after the process exits, and any mouse movement in the shell
is echoed as `35;86;…;1M`-style fragments — exactly what the
screenshot shows.

opentui 0.4.2 (our version) ships a partial fix: `_useMouse =
false` is set inside `cleanupBeforeDestroy()` (see
`node_modules/@opentui/core/index-6xr3rbbe.js:9448`), but the
public `disableMouse()` method (line 8614) — which additionally
calls `this.lib.disableMouse(this.rendererPtr)` to actually emit
the disable sequences to the terminal — is **not** called from
the destroy path. The related PR #905 is still open as of
2026-06-30.

The user-visible fix is to call `renderer.disableMouse()` (and
symmetrically `renderer.disableKittyKeyboard()`) **before**
`renderer.destroy()` in our `quitTui()`. Both methods are safe
to call when the renderer is still alive; they emit the disable
sequences while raw mode is still on, so the terminal receives
them cleanly.

- [x] Task 10: Disable mouse + kitty keyboard before `renderer.destroy()`
  - File: `packages/lazyaif/src/views/plans-viewer/tui-view.ts`
  - In `quitTui()` (currently defined between the
    `setInterval(...)` initialisation and the `const destroy =
    () => { ... }` block), insert two cleanup calls **before**
    `renderer.destroy()`:
    ```ts
    quitTui = () => {
      if (quitInProgress) { ... return; }
      quitInProgress = true;
      console.debug(`[tui:quit] phase=destroy-cb`);
      try { destroy(); } catch (e) { ... }
      // NEW: emit mouse-disable + kitty-keyboard-disable
      // sequences while raw mode is still on, so the terminal
      // receives them cleanly. Without this, opentui's
      // cleanupBeforeDestroy() flips _useMouse = false but
      // does not send \x1b[?1006l / \x1b[?1000l / \x1b[?1003l,
      // and the shell keeps SGR mouse tracking on after exit
      // (opentui issue #904, still open in 0.4.2).
      console.debug(`[tui:quit] phase=disable-mouse`);
      try { (renderer as any).disableMouse?.(); } catch (e) { console.warn(`[tui:quit] disableMouse failed`, e); }
      console.debug(`[tui:quit] phase=disable-kitty-keyboard`);
      try { (renderer as any).disableKittyKeyboard?.(); } catch (e) { console.warn(`[tui:quit] disableKittyKeyboard failed`, e); }
      console.debug(`[tui:quit] phase=renderer-destroy`);
      try { renderer.destroy(); } catch (e) { ... }
      console.debug(`[tui:quit] phase=process-exit`);
      process.exit(0);
    };
    ```
  - The `?.()` + `as any` cast keeps the call safe if a
    future opentui version removes either method (the types
    in `@opentui/core@0.4.2` expose `disableMouse()` on the
    public renderer API, but `disableKittyKeyboard()` is not
    on the `CliRenderer` interface — only on the internal
    class). A `try/catch` around each is belt-and-suspenders.
  - Logging: standard — two new `[tui:quit] phase=…` debug
    lines so we can verify the order in any future regression
    report.
  - Depends on: Task 9 (`quitTui` exists).
  - Notes:
    - This is a **workaround** for an upstream opentui bug.
      When opentui merges PR #905 and we bump the dep, we
      can drop these two lines — `renderer.destroy()` will
      do the right thing on its own. A comment in the code
      says so explicitly.
    - We are NOT patching opentui source (the opencode PR
      #19520 approach patches `StdinParser`); we only call
      public-ish methods on the renderer from our own quit
      path. Lower risk, easier to reason about.

## Post-v0.2.7 bugfix (duplicate Esc-quit listener)

After v0.2.7 was tagged, the user reported Esc still quits the
program. Re-reading the opentui skill docs
(`.agents/skills/opentui/docs/core-concepts/keyboard.mdx`)
confirmed that `renderer.keyInput.on('keypress', ...)` is an
EventEmitter — `event.preventDefault()` does NOT stop other
listeners on the same emitter; it only suppresses the event's
default action. Any second listener still receives the event.

Grepping for `key.name === "escape"` across the codebase then
turned up a **second** keypress listener in
`packages/lazyaif/src/app/tui-dashboard.ts:10-16`:

```ts
renderer.keyInput.on("keypress", (key: { name: string }) => {
  if (key.name === "q" || key.name === "escape") {
    console.debug("[app:tui] shutting down");
    appHandle.destroy();
    renderer.destroy();
  }
});
```

This is the real root cause. It is a legacy handler from before
the v0.2.4 `viewMode` refactor and it runs in parallel with the
handler in `tui-view.ts`. Every keystroke is delivered to both
listeners; `preventDefault()` in the `tui-view.ts` handler does
nothing to stop the `tui-dashboard.ts` handler from also firing.
So pressing Esc in Mode A went:

1. `tui-view.ts` handler: `event.preventDefault()` + no-op (good).
2. `tui-dashboard.ts` handler: `key.name === "escape"` is true →
   `appHandle.destroy()` + `renderer.destroy()` → program exits.

This also explains why the v0.2.6 / v0.2.7 `quitTui()` work did
not fully fix the screen-clear symptoms: the `tui-dashboard.ts`
listener bypassed `quitTui()` entirely (no `disableMouse()`, no
`disableKittyKeyboard()`, no `quitInProgress` guard).

- [x] Task 11: Remove the duplicate Esc-quit listener from tui-dashboard.ts
  - File: `packages/lazyaif/src/app/tui-dashboard.ts`
  - The whole `renderer.keyInput.on("keypress", ...)` block at
    lines 10-16 is redundant with the handler inside
    `createPlansTuiApp` (tui-view.ts), which already:
    - handles `q` via `quitTui()` (with `disableMouse`,
      `disableKittyKeyboard`, `renderer.destroy()`, and an
      idempotency guard),
    - handles `escape` as a Mode B → Mode A toggle (never exits),
    - handles `tab` as the mode toggle,
    - handles `enter` (via SelectRenderable's ITEM_SELECTED) to
      open the detail view.
  - Replace the whole `runTuiDashboard` body with just the
    renderer + `createPlansTuiApp` calls; the app owns its own
    keypress handling from there. Concretely:
    ```ts
    export async function runTuiDashboard(rootDir: string) {
      console.debug(`[app:tui] starting dashboard rootDir=${rootDir}`);
      const renderer = await createTuiRenderer();
      await createPlansTuiApp(renderer, rootDir);
    }
    ```
  - `createPlansTuiApp` already returns `{ destroy }` and wires
    its own keypress listener internally (registered with
    `renderer.keyInput.on("keypress", keypressHandler)` and
    removed in `destroy()`). Keeping a second listener in the
    caller was always wrong — it duplicated the quit path and
    created the Esc-exit bug we are fixing now.
  - Logging: standard — the `[app:tui] shutting down` debug
    line is removed (it was only ever reached from this buggy
    listener; the canonical quit log is `[tui:quit]` in
    `tui-view.ts`).
  - Depends on: Task 10 (we want `quitTui()` to be the only
    exit path before deleting the duplicate).

## Out of Scope

- Anything beyond the four asks above. Notably:
  - Replacing the `description: string` per SelectRenderable option
    with a multi-line custom renderable — that would require
    owning the option's render and breaks `SelectRenderable`'s
    keyboard navigation contract. Out.
  - Changing the heuristic for "in-progress" (description-based) to
    a real parser tag — orthogonal feature, not a UX tweak. Out.
  - Removing the `q: quit` hotkey — the user confirmed `q` stays
    as the only way to exit besides Ctrl+C / closing the terminal.
  - Adding `Ctrl+C` as a visibly advertised exit hotkey in the
    footer — the user did not ask for this; current behavior
    (Ctrl+C is handled by Bun/Node's default SIGINT handler) is
    correct and "honest enough". If a future task wants it,
    register `renderer.keyInput.on('keypress', e => e.ctrl && e.name === 'c' && process.exit(0))`.
  - A new `Enter: open` indicator on the highlight bar itself —
    the footer already advertises it; the highlight bar in
    `SelectRenderable` is a fixed widget we don't control.
