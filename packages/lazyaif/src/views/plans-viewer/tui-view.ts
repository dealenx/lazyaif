import {
  type CliRenderer,
  type MouseEvent,
  BoxRenderable,
  TextRenderable,
  ScrollBoxRenderable,
  SelectRenderable,
  SelectRenderableEvents,
  MarkdownRenderable,
  KeyEvent,
  t,
  bold,
  fg,
} from "@opentui/core";
import {
  scanAiFactory,
  computeStatus,
  statusIcon,
  formatTaskProgress,
  formatPercent,
  formatRelativeTime,
  clampSelection,
  sortByMtimeDesc,
} from "../../modules/plans-viewer/index.js";
import type { Plan, PlanStatus } from "../../modules/plans-viewer/types.js";
import { colors, markdownSyntaxStyle, extractPlanBody, renderHeader, renderFooter, HOTKEYS_LIST, HOTKEYS_DETAIL } from "../../clients/tui/components/index.js";
import { renderTaskList } from "./task-list-view.js";
import { stat, readdir, access } from "node:fs/promises";
import { join } from "node:path";

function shouldLog(): boolean {
  return process.env.DEBUG != null || process.env.LOG_LEVEL === "debug";
}
function debug(msg: string): void { if (shouldLog()) console.debug(msg); }

const DATA_REFRESH_MS = 2000;
const LABEL_REFRESH_MS = 1000;
const RESPONSIVE_THRESHOLD = 100;

async function pathExists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

function buildOptions(plans: Plan[], statuses: PlanStatus[], nowMs: number) {
  return plans.map((plan, i) => {
    const st = statuses[i];
    const icon = statusIcon(st.state);
    const progress = formatTaskProgress(st.done, st.total);
    const pct = formatPercent(st.pct).padStart(4, " ");
    const kindTag = plan.kind === "fast" ? "[fast]" : "[full]";
    const relativeTime = formatRelativeTime(plan.mtime, nowMs);
    const counts = `${st.done}/${st.total} done · ${st.inProgress ?? 0} in prog · ${st.notStarted ?? 0} todo`;
    debug(`[tui:list] relative time for ${plan.fileName} = ${relativeTime} counts=${counts}`);
    return {
      name: `${kindTag} ${plan.fileName}`,
      description: `${progress}  ${pct}  ${icon}  ·  ${counts}  ·  ${relativeTime}`,
      value: i,
    };
  });
}

export function renderPlanList(
  renderer: CliRenderer,
  plans: Plan[],
  statuses: PlanStatus[],
  onSelect: (index: number) => void,
  onOpen: (index: number) => void,
  width: number | "auto" | `${number}%` = "40%",
): SelectRenderable {
  console.debug(`[tui:plan-list] rendering plans count=${plans.length} width=${width}`);
  const options = buildOptions(plans, statuses, Date.now());

  const select = new SelectRenderable(renderer, {
    id: "plan-list",
    width,
    height: "100%",
    options,
    backgroundColor: colors.bg,
    textColor: colors.fg,
    selectedBackgroundColor: colors.selected,
    selectedTextColor: "#FFFFFF",
    descriptionColor: colors.muted,
    showDescription: true,
    showScrollIndicator: true,
    wrapSelection: false,
  });

  select.on(SelectRenderableEvents.SELECTION_CHANGED, (index: number) => {
    console.debug(`[tui:plan-list] selection changed index=${index}`);
    onSelect(index);
  });

  select.on(SelectRenderableEvents.ITEM_SELECTED, (index: number) => {
    console.debug(`[tui:plan-list] item selected (enter) index=${index}`);
    onOpen(index);
  });

  select.on("mouse", (event: MouseEvent) => {
    if (event.type !== "down") return;
    if (event.button !== 0) return;
    const localY = event.y - select.screenY;
    if (localY < 0) return;
    const linesPerItem = 2;
    const visibleIndex = Math.floor(localY / linesPerItem);
    const scrollOffset = (select as unknown as { scrollOffset: number }).scrollOffset;
    const actualIndex = scrollOffset + visibleIndex;
    if (actualIndex < 0 || actualIndex >= plans.length) return;
    console.debug(`[tui:plan-list] mouse click -> visibleIndex=${visibleIndex} scrollOffset=${scrollOffset} actualIndex=${actualIndex}`);
    event.preventDefault();
    event.stopPropagation();
    select.setSelectedIndex(actualIndex);
  });

  select.focus();
  return select;
}

export function renderTaskDetail(
  renderer: CliRenderer,
  plan: Plan,
  status: PlanStatus,
  id: string,
  width: number | "auto" | `${number}%` = "100%",
): ScrollBoxRenderable {
  console.debug(`[tui:task-detail] sync phase: plan=${plan.fileName} tasks=${plan.tasks.length} id=${id} width=${width}`);

  const scroll = new ScrollBoxRenderable(renderer, {
    id,
    width,
    height: "100%",
    viewportCulling: true,
    rootOptions: { backgroundColor: colors.bg },
  });

  const titleText = new TextRenderable(renderer, {
    id: `${id}-title`,
    content: t`${bold(fg(colors.accent)(plan.title))}`,
    fg: colors.fg,
  });
  scroll.add(titleText);

  const meta = `Branch: ${plan.branch}  ·  Created: ${plan.created}  ·  Testing: ${plan.settings.testing ? "yes" : "no"}  ·  Logging: ${plan.settings.logging}  ·  Docs: ${plan.settings.docs ? "yes" : "no"}`;
  const metaText = new TextRenderable(renderer, {
    id: `${id}-meta`,
    content: meta,
    fg: colors.muted,
  });
  scroll.add(metaText);

  const icon = statusIcon(status.state);
  const progress = formatTaskProgress(status.done, status.total);
  const pct = formatPercent(status.pct);
  const stateColor =
    status.state === "done" ? colors.done
    : status.state === "in-progress" ? colors.progress
    : colors.notStarted;
  const statusText = new TextRenderable(renderer, {
    id: `${id}-status`,
    content: t`${fg(stateColor)(`${icon} ${progress} (${pct})`)}`,
    fg: colors.fg,
  });
  scroll.add(statusText);

  const sepText = new TextRenderable(renderer, {
    id: `${id}-sep`,
    content: "─".repeat(40),
    fg: colors.border,
  });
  scroll.add(sepText);

  debug(`[tui:detail] sync phase done for ${plan.fileName}, scheduling markdown parse`);
  return scroll;
}

function appendMarkdownDeferred(
  renderer: CliRenderer,
  scroll: ScrollBoxRenderable,
  plan: Plan,
  id: string,
  isStale: () => boolean,
): ReturnType<typeof setTimeout> {
  return setTimeout(() => {
    if (isStale()) {
      debug(`[tui:detail] skipping stale markdown for ${id} (current detail changed)`);
      return;
    }
    debug(`[tui:detail] deferred markdown ready for ${id} plan=${plan.fileName}`);
    try {
      const bodyMarkdown = extractPlanBody(plan.rawMarkdown);
      const md = new MarkdownRenderable(renderer, {
        id: `${id}-md`,
        content: bodyMarkdown,
        syntaxStyle: markdownSyntaxStyle,
        fg: colors.fg,
        bg: colors.bg,
        conceal: true,
        internalBlockMode: "top-level",
        tableOptions: { style: "grid", widthMode: "content", cellPaddingX: 1 },
        width: "100%",
      });
      if (isStale()) {
        debug(`[tui:detail] skipping stale markdown after create for ${id}`);
        try { md.destroy(); } catch { /* noop */ }
        return;
      }
      scroll.add(md);
      renderer.requestRender();
    } catch (e) {
      console.warn(`[tui:detail] deferred markdown error for ${id}: ${e}`);
    }
  }, 0);
}

export async function createPlansTuiApp(renderer: CliRenderer, rootDir: string): Promise<{ destroy: () => void }> {
  console.debug(`[tui:app] initializing rootDir=${rootDir}`);

  let plans: Plan[] = sortByMtimeDesc(await scanAiFactory(rootDir));
  let statuses: PlanStatus[] = plans.map((p) => computeStatus(p));
  let selectedIndex = 0;

  console.debug(`[tui:app] initialized plans=${plans.length}`);

  const root = new BoxRenderable(renderer, {
    id: "tui-root",
    width: "100%",
    height: "100%",
    flexDirection: "column",
    backgroundColor: colors.bg,
  });

  if (plans.length === 0) {
    const emptyBox = new BoxRenderable(renderer, {
      id: "tui-empty",
      width: "100%",
      height: "100%",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: colors.bg,
    });
    const emptyText = new TextRenderable(renderer, {
      id: "tui-empty-text",
      content: "No .ai-factory plans found in this directory.",
      fg: colors.notStarted,
    });
    emptyBox.add(emptyText);
    root.add(renderHeader(renderer, rootDir));
    root.add(emptyBox);
    root.add(renderFooter(renderer, "list"));
    renderer.root.add(root);
    return { destroy: () => {} };
  }

  const bodyRow = new BoxRenderable(renderer, {
    id: "tui-body-row",
    flexDirection: "row",
    flexGrow: 1,
    width: "100%",
  });

  let showTasks = renderer.width >= RESPONSIVE_THRESHOLD;
  console.debug(`[tui:responsive] showTasks=${showTasks} width=${renderer.width} threshold=${RESPONSIVE_THRESHOLD}`);
  let planListWidth: number | "auto" | `${number}%` = showTasks ? "40%" : "100%";

  let viewMode: "list" | "detail" = "list";
  let currentDetail: { id: string; renderable: ScrollBoxRenderable } | null = null;
  let currentTaskList: { id: string; renderable: ScrollBoxRenderable } | null = null;
  let currentTaskListPlanFileName: string | null = null;
  let pendingMarkdownTimer: ReturnType<typeof setTimeout> | null = null;
  let listMounted = false;
  let taskListMounted = false;
  let onModeChange: ((mode: "list" | "detail") => void) | null = null;
  // Forward declaration — the real `quitTui` is assigned below
  // after the `destroy` callback has been defined. The placeholder
  // is a no-op so the `q` keypress path is safe even if it ever
  // fires before the assignment (it cannot in practice — the
  // assignment happens synchronously before `renderer.keyInput.on`).
  let quitTui: () => void = () => {
    console.debug(`[tui:quit] phase=early-noop (destroy not yet assigned)`);
  };
  let quitInProgress = false;

  const rebuildTaskList = () => {
    if (!showTasks) {
      debug(`[tui:task-list] rebuild skipped (showTasks=false)`);
      return;
    }
    if (viewMode !== "list") {
      debug(`[tui:task-list] rebuild skipped (viewMode=${viewMode})`);
      return;
    }
    const plan = plans[selectedIndex];
    if (!plan) {
      debug(`[tui:task-list] rebuild skipped (no plan at index=${selectedIndex})`);
      return;
    }
    if (currentTaskListPlanFileName === plan.fileName && taskListMounted) {
      debug(`[tui:task-list] rebuild skipped (same plan=${plan.fileName})`);
      return;
    }
    if (currentTaskList && taskListMounted) {
      try { bodyRow.remove(currentTaskList.id); } catch (e) { console.warn(`[tui:task-list] bodyRow.remove failed`, e); }
      try { currentTaskList.renderable.destroy(); } catch { /* noop */ }
      currentTaskList = null;
      taskListMounted = false;
    }
    const taskListId = `task-list-${selectedIndex}`;
    console.debug(`[tui:task-list] rebuild plan=${plan.fileName} index=${selectedIndex} id=${taskListId}`);
    const taskList = renderTaskList(renderer, plan, taskListId, "60%");
    bodyRow.add(taskList);
    currentTaskList = { id: taskListId, renderable: taskList };
    currentTaskListPlanFileName = plan.fileName;
    taskListMounted = true;
    renderer.requestRender();
  };

  const removeTaskList = () => {
    if (currentTaskList && taskListMounted) {
      try { bodyRow.remove(currentTaskList.id); } catch (e) { console.warn(`[tui:task-list] removeTaskList bodyRow.remove failed`, e); }
      try { currentTaskList.renderable.destroy(); } catch { /* noop */ }
      currentTaskList = null;
      taskListMounted = false;
    }
  };

  const enterDetailMode = () => {
    if (viewMode === "detail") {
      console.debug(`[tui:mode] enterDetailMode: already in detail, no-op`);
      return;
    }
    viewMode = "detail";
    const plan = plans[selectedIndex];
    if (!plan) {
      console.warn(`[tui:mode] enterDetailMode: no plan at index=${selectedIndex}, aborting`);
      viewMode = "list";
      return;
    }
    console.debug(`[tui:mode] enterDetailMode: list->detail plan=${plan.fileName} index=${selectedIndex}`);
    if (showTasks) {
      console.debug(`[tui:mode] enterDetailMode: hiding task list (showTasks=${showTasks})`);
      removeTaskList();
    }
    if (listMounted) {
      try { bodyRow.remove(planList.id); } catch (e) { console.warn(`[tui:mode] bodyRow.remove(planList) failed`, e); }
      listMounted = false;
    }
    if (pendingMarkdownTimer) {
      debug(`[tui:detail] cancelling pending markdown timer from previous render`);
      clearTimeout(pendingMarkdownTimer);
      pendingMarkdownTimer = null;
    }
    if (currentDetail) {
      console.debug(`[tui:mode] removing previous detail id=${currentDetail.id}`);
      try { bodyRow.remove(currentDetail.id); } catch (e) { console.warn(`[tui:mode] bodyRow.remove(detail) failed`, e); }
      try { currentDetail.renderable.destroy(); } catch { /* noop */ }
      currentDetail = null;
    }
    const detailId = `plan-detail-${selectedIndex}`;
    const detail = renderTaskDetail(renderer, plan, statuses[selectedIndex], detailId, "100%");
    bodyRow.add(detail);
    currentDetail = { id: detailId, renderable: detail };
    console.debug(`[tui:mode] mounted detail id=${detailId} plan=${plan.fileName}`);

    pendingMarkdownTimer = appendMarkdownDeferred(
      renderer,
      detail,
      plan,
      `${detailId}-md`,
      () => currentDetail?.id !== detailId,
    );
    try { detail.focus(); } catch (e) { console.warn(`[tui:mode] detail.focus() failed`, e); }
    if (onModeChange) onModeChange(viewMode);
    renderer.requestRender();
  };

  const enterListMode = () => {
    if (viewMode === "list") {
      console.debug(`[tui:mode] enterListMode: already in list, no-op`);
      return;
    }
    viewMode = "list";
    console.debug(`[tui:mode] enterListMode: detail->list index=${selectedIndex}`);
    if (pendingMarkdownTimer) {
      debug(`[tui:detail] cancelling pending markdown timer on mode exit`);
      clearTimeout(pendingMarkdownTimer);
      pendingMarkdownTimer = null;
    }
    if (currentDetail) {
      try { bodyRow.remove(currentDetail.id); } catch (e) { console.warn(`[tui:mode] bodyRow.remove(detail) failed`, e); }
      try { currentDetail.renderable.destroy(); } catch { /* noop */ }
      currentDetail = null;
    }
    if (!listMounted) {
      bodyRow.add(planList);
      listMounted = true;
    }
    if (showTasks) {
      currentTaskListPlanFileName = null;
      rebuildTaskList();
      console.debug(`[tui:mode] enterListMode: restoring task list for plan=${plans[selectedIndex]?.fileName}`);
    }
    try { select.focus(); } catch (e) { console.warn(`[tui:mode] select.focus() failed`, e); }
    if (onModeChange) onModeChange(viewMode);
    renderer.requestRender();
  };

  let pendingSelectTimer: ReturnType<typeof setTimeout> | null = null;
  const DEBOUNCE_MS = 100;

  let select: SelectRenderable;
  const planList = renderPlanList(
    renderer,
    plans,
    statuses,
    (index: number) => {
      console.debug(`[tui:app] onSelect index=${index}`);
      const clamped = clampSelection(index, plans.length);
      if (clamped === null) {
        console.warn(`[tui:app] selection index out of bounds: ${index}`);
        return;
      }
      selectedIndex = clamped;
      if (showTasks && viewMode === "list") {
        rebuildTaskList();
      }
      if (pendingSelectTimer) {
        debug(`[tui:debounce] cancelled previous pending render`);
        clearTimeout(pendingSelectTimer);
      }
      debug(`[tui:debounce] scheduled render for index=${clamped} in ${DEBOUNCE_MS}ms (mode=${viewMode})`);
      pendingSelectTimer = setTimeout(() => {
        pendingSelectTimer = null;
        if (viewMode === "detail") enterDetailMode();
        else console.debug(`[tui:debounce] skipping detail render in list mode for index=${clamped}`);
      }, DEBOUNCE_MS);
    },
    (index: number) => {
      console.debug(`[tui:open] via=enter index=${index}`);
      const clamped = clampSelection(index, plans.length);
      if (clamped === null) {
        console.warn(`[tui:open] selection index out of bounds: ${index}`);
        return;
      }
      selectedIndex = clamped;
      if (pendingSelectTimer) {
        debug(`[tui:open] cancelled pending select timer (about to open)`);
        clearTimeout(pendingSelectTimer);
        pendingSelectTimer = null;
      }
      enterDetailMode();
    },
    planListWidth,
  );
  select = planList;

  bodyRow.add(planList);
  listMounted = true;
  if (showTasks) {
    rebuildTaskList();
  }

  root.add(renderHeader(renderer, rootDir));
  root.add(bodyRow);
  const footerBox = renderFooter(renderer, viewMode);
  onModeChange = (mode) => {
    footerBox.hotkeysText.content = mode === "list" ? HOTKEYS_LIST : HOTKEYS_DETAIL;
    console.debug(`[tui:footer] hotkeys updated mode=${mode}`);
  };
  root.add(footerBox);
  renderer.root.add(root);

  const resizeHandler = () => {
    const newShowTasks = renderer.width >= RESPONSIVE_THRESHOLD;
    if (newShowTasks === showTasks) {
      debug(`[tui:resize] width=${renderer.width} showTasks=${showTasks} (unchanged)`);
      return;
    }
    showTasks = newShowTasks;
    planListWidth = showTasks ? "40%" : "100%";
    console.debug(`[tui:resize] showTasks=${showTasks} width=${renderer.width} threshold=${RESPONSIVE_THRESHOLD}`);
    try { planList.width = planListWidth; } catch (e) { console.warn(`[tui:resize] planList.width set failed`, e); }
    if (showTasks) {
      currentTaskListPlanFileName = null;
      if (viewMode === "list") rebuildTaskList();
    } else {
      removeTaskList();
      currentTaskListPlanFileName = null;
    }
    renderer.requestRender();
  };
  renderer.on("resize", resizeHandler);

  const keypressHandler = (event: KeyEvent) => {
    if (event.repeated) return;
    console.debug(`[tui:keypress] name=${event.name} ctrl=${event.ctrl} meta=${event.meta} mode=${viewMode}`);
    if (event.name === "tab") {
      event.preventDefault();
      if (plans.length === 0) {
        console.debug(`[tui:mode] tab ignored: no plans`);
        return;
      }
      if (viewMode === "list") enterDetailMode();
      else enterListMode();
      return;
    }
    if (event.name === "escape") {
      // Esc NEVER quits the program — it only navigates the
      // Mode B → Mode A transition. process.exit(0) is wired
      // to `q` only. Mode A Esc is a deliberate no-op so the
      // user does not lose the focused list by accident.
      //
      // We always preventDefault() — even in the Mode A no-op
      // branch — to keep the keystroke from leaking to opentui's
      // KeyHandler / terminal. A bare `\x1B` is otherwise free to
      // be interpreted as the start of an escape sequence
      // (e.g. `?1049l` leave-alternate-screen) by some terminals,
      // which would cause the program to look like it quit on Esc.
      event.preventDefault();
      if (viewMode !== "detail") {
        debug(`[tui:keypress] escape: no-op in list mode (prevented default)`);
        return;
      }
      enterListMode();
      return;
    }
    if (event.name === "q") {
      event.preventDefault();
      console.debug(`[tui:quit] exiting via q keypress`);
      quitTui();
    }
  };
  renderer.keyInput.on("keypress", keypressHandler);
  console.debug(`[tui:keypress] global handler registered`);

  const refreshState: { dataInterval: ReturnType<typeof setInterval> | null; labelInterval: ReturnType<typeof setInterval> | null } = {
    dataInterval: null,
    labelInterval: null,
  };

  const dataTick = async () => {
    try {
      const aiFactoryDir = join(rootDir, ".ai-factory");
      const plansDir = join(aiFactoryDir, "plans");
      const fastFileNames = new Set(plans.filter((p) => p.kind === "fast").map((p) => p.fileName));
      const fastPathFor = (fileName: string) => join(aiFactoryDir, fileName);

      const currentPaths = new Set(plans.map((p) => p.fileName));
      const newMtimes = new Map<string, number>();
      let changedCount = 0;

      for (const plan of plans) {
        const fullPath = plan.kind === "fast" ? fastPathFor(plan.fileName) : join(plansDir, plan.fileName);
        try {
          const s = await stat(fullPath);
          newMtimes.set(plan.fileName, s.mtimeMs);
          if (s.mtimeMs !== plan.mtime) changedCount++;
        } catch {
          changedCount++;
        }
      }

      if (await pathExists(plansDir)) {
        try {
          const entries = await readdir(plansDir);
          const mdFiles = entries.filter((f) => f.endsWith(".md"));
          for (const f of mdFiles) {
            if (!currentPaths.has(f)) {
              changedCount++;
              break;
            }
          }
          for (const p of currentPaths) {
            if (!fastFileNames.has(p) && !mdFiles.includes(p)) {
              changedCount++;
              break;
            }
          }
        } catch { /* ignore */ }
      }

      for (const fileName of fastFileNames) {
        const exists = await pathExists(fastPathFor(fileName));
        const inMemory = plans.some((p) => p.kind === "fast" && p.fileName === fileName);
        debug(`[tui:refresh] fast plan check: file=${fileName} exists=${exists} inMemory=${inMemory}`);
        if (exists !== inMemory) {
          changedCount++;
          break;
        }
      }

      if (changedCount === 0) return;

      debug(`[tui:refresh] data tick: ${changedCount} files changed`);
      const newPlans = sortByMtimeDesc(await scanAiFactory(rootDir));
      const newStatuses = newPlans.map((p) => computeStatus(p));

      const selectedFileName = plans[selectedIndex]?.fileName;
      let newIndex = 0;
      if (selectedFileName) {
        const foundIndex = newPlans.findIndex((p) => p.fileName === selectedFileName);
        if (foundIndex >= 0) newIndex = foundIndex;
      }
      debug(`[tui:refresh] reconciled selection: ${selectedFileName} -> ${newIndex}`);

      const selectionChanged = newIndex !== selectedIndex || newPlans[selectedIndex]?.mtime !== plans[selectedIndex]?.mtime;
      plans = newPlans;
      statuses = newStatuses;
      selectedIndex = newIndex;

      select.options = buildOptions(plans, statuses, Date.now());
      if (selectionChanged) {
        select.setSelectedIndex(newIndex);
        if (viewMode === "detail") enterDetailMode();
        else {
          console.debug(`[tui:refresh] data tick: skipping detail re-mount in list mode`);
          if (showTasks) {
            currentTaskListPlanFileName = null;
            rebuildTaskList();
            console.debug(`[tui:refresh] data tick: task list rebuilt for plan=${plans[selectedIndex]?.fileName}`);
          }
        }
      }
      renderer.requestRender();
    } catch (e) {
      console.warn(`[tui:refresh] data tick error: ${e}`);
    }
  };

  const labelTick = () => {
    try {
      const now = Date.now();
      const oldOptions = select.options;
      const newOptions = buildOptions(plans, statuses, now);
      let changed = 0;
      for (let i = 0; i < oldOptions.length && i < newOptions.length; i++) {
        if (oldOptions[i].description !== newOptions[i].description) changed++;
      }
      if (changed === 0) return;
      debug(`[tui:refresh] label tick: updated ${changed} labels`);
      select.options = newOptions;
      renderer.requestRender();
    } catch (e) {
      console.warn(`[tui:refresh] label tick error: ${e}`);
    }
  };

  refreshState.dataInterval = setInterval(dataTick, DATA_REFRESH_MS);
  refreshState.labelInterval = setInterval(labelTick, LABEL_REFRESH_MS);

  // Assign the real quitTui now that `destroy` is defined.
  // The keypress handler (registered above) calls this for `q`.
  // Idempotent: a second `q` while we are already tearing down
  // is a no-op (the early return below).
  quitTui = () => {
    if (quitInProgress) {
      console.debug(`[tui:quit] phase=already-in-progress, ignoring re-entry`);
      return;
    }
    quitInProgress = true;
    console.debug(`[tui:quit] phase=destroy-cb`);
    try { destroy(); } catch (e) { console.warn(`[tui:quit] destroy-cb failed`, e); }
    // Emit mouse-disable + kitty-keyboard-disable sequences while
    // raw mode is still on, so the terminal receives them cleanly.
    // Without this, opentui's cleanupBeforeDestroy() flips
    // _useMouse = false but does NOT send \x1b[?1006l /
    // \x1b[?1000l / \x1b[?1003l, and the shell keeps SGR mouse
    // tracking on after exit — which shows up as garbled
    // `35;86;…;1M` fragments on the prompt line (opentui
    // issue #904, still open in @opentui/core@0.4.2).
    //
    // Workaround for an upstream opentui bug. When opentui
    // merges PR #905 and we bump the dep, these two calls can
    // be removed — renderer.destroy() will do the right thing
    // on its own.
    console.debug(`[tui:quit] phase=disable-mouse`);
    try { (renderer as unknown as { disableMouse?: () => void }).disableMouse?.(); } catch (e) { console.warn(`[tui:quit] disableMouse failed`, e); }
    console.debug(`[tui:quit] phase=disable-kitty-keyboard`);
    try { (renderer as unknown as { disableKittyKeyboard?: () => void }).disableKittyKeyboard?.(); } catch (e) { console.warn(`[tui:quit] disableKittyKeyboard failed`, e); }
    console.debug(`[tui:quit] phase=renderer-destroy`);
    try { renderer.destroy(); } catch (e) { console.warn(`[tui:quit] renderer.destroy failed`, e); }
    console.debug(`[tui:quit] phase=process-exit`);
    process.exit(0);
  };

  const destroy = () => {
    debug("[tui:shutdown] clearing refresh intervals + pending timers + keypress listener");
    if (refreshState.dataInterval) clearInterval(refreshState.dataInterval);
    if (refreshState.labelInterval) clearInterval(refreshState.labelInterval);
    refreshState.dataInterval = null;
    refreshState.labelInterval = null;
    if (pendingSelectTimer) {
      clearTimeout(pendingSelectTimer);
      pendingSelectTimer = null;
    }
    if (pendingMarkdownTimer) {
      clearTimeout(pendingMarkdownTimer);
      pendingMarkdownTimer = null;
    }
    removeTaskList();
    try { renderer.off("resize", resizeHandler); } catch (e) { console.warn(`[tui:shutdown] renderer.off(resize) failed`, e); }
    try { renderer.keyInput.off("keypress", keypressHandler); } catch (e) { console.warn(`[tui:shutdown] keyInput.off failed`, e); }
  };

  return { destroy };
}