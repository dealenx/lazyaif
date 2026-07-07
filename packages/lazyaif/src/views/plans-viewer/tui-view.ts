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
  formatRelativeTimeShort,
  clampSelection,
  sortByMtimeDesc,
} from "../../modules/plans-viewer/index.js";
import type { Plan, PlanStatus } from "../../modules/plans-viewer/types.js";
import { colors, markdownSyntaxStyle, extractPlanBody, renderHeader, renderFooter, HOTKEYS_LIST, HOTKEYS_DETAIL, HOTKEYS_CONFIRM, HOTKEYS_CHEAT } from "../../clients/tui/components/index.js";
import { renderTaskList } from "./task-list-view.js";
import { stat, readdir, access, unlink } from "node:fs/promises";
import { join } from "node:path";
import { copyToClipboard } from "../../shared/clipboard.js";

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

const WIDTH_FULL = 80;
const WIDTH_COMPACT = 50;
const WIDTH_TINY = 30;

function buildOptions(plans: Plan[], statuses: PlanStatus[], nowMs: number, width = 100) {
  return plans.map((plan, i) => {
    const st = statuses[i];
    const icon = statusIcon(st.state);
    const progress = formatTaskProgress(st.done, st.total);
    const pct = formatPercent(st.pct).padStart(4, " ");
    const kindTag = plan.kind === "fast" ? "[fast]" : "[full]";
    const relativeTime = formatRelativeTime(plan.mtime, nowMs);
    const shortTime = formatRelativeTimeShort(plan.mtime, nowMs);
    const counts = `${st.done}/${st.total} done · ${st.inProgress ?? 0} in prog · ${st.notStarted ?? 0} todo`;
    const countsShort = `${st.done}/${st.total} · ${st.inProgress ?? 0}p · ${st.notStarted ?? 0}t`;

    let description: string;
    if (width >= WIDTH_FULL) {
      description = `${progress}  ${pct}  ${icon}  ·  ${counts}  ·  ${relativeTime}`;
    } else if (width >= WIDTH_COMPACT) {
      description = `${progress}  ${pct}  ${icon}  ·  ${countsShort}  ·  ${relativeTime}`;
    } else if (width >= WIDTH_TINY) {
      description = `${progress}  ${pct}  ${icon}  ·  ${countsShort}  ·  ${shortTime}`;
    } else {
      description = `${progress}  ${pct}  ${icon}  ${shortTime}`;
    }
    debug(`[tui:list] relative time for ${plan.fileName} = ${relativeTime} counts=${counts} width=${width}`);
    return {
      name: `${kindTag} ${plan.fileName}`,
      description,
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
  listPixelWidth: number = 100,
): SelectRenderable {
  console.debug(`[tui:plan-list] rendering plans count=${plans.length} width=${width} listPixelWidth=${listPixelWidth}`);
  const options = buildOptions(plans, statuses, Date.now(), listPixelWidth);

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

  let lastClickTime = 0;
  let lastClickIndex = -1;
  const DOUBLE_CLICK_MS = 300;

  select.onMouseDown = (event: MouseEvent) => {
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

    const now = Date.now();
    if (now - lastClickTime < DOUBLE_CLICK_MS && lastClickIndex === actualIndex) {
      console.debug(`[tui:plan-list] double click -> open index=${actualIndex}`);
      lastClickTime = 0;
      lastClickIndex = -1;
      onOpen(actualIndex);
    } else {
      lastClickTime = now;
      lastClickIndex = actualIndex;
    }
  };

  select.onMouseScroll = (event: MouseEvent) => {
    if (!event.scroll) return;
    const dir = event.scroll.direction;
    console.debug(`[tui:plan-list] mouse scroll dir=${dir} delta=${event.scroll.delta}`);
    event.preventDefault();
    event.stopPropagation();
    if (dir === "up") select.moveUp();
    else if (dir === "down") select.moveDown();
  };

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

  const fileNameText = new TextRenderable(renderer, {
    id: `${id}-filename`,
    content: t`${fg(colors.accent)(`\u{1F4C4} ${plan.fileName}`)}`,
    fg: colors.fg,
  });
  scroll.add(fileNameText);

  const filePathText = new TextRenderable(renderer, {
    id: `${id}-filepath`,
    content: plan.path,
    fg: colors.muted,
  });
  scroll.add(filePathText);
  debug(`[tui:detail] added fileName=${plan.fileName} path=${plan.path} for ${plan.fileName}`);

  const meta = `Branch: ${plan.branch}  ·  Created: ${plan.created}${plan.mode ? `  ·  Mode: ${plan.mode}` : ""}  ·  Testing: ${plan.settings.testing ? "yes" : "no"}  ·  Logging: ${plan.settings.logging}  ·  Docs: ${plan.settings.docs ? "yes" : (plan.settings.docsMode ?? "no")}${plan.status ? `  ·  Status: ${plan.status}` : ""}`;
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

  const BOX_DONE = "\u2611";
  const BOX_TODO = "\u2610";

  if (plan.phases.length > 0) {
    debug(`[tui:detail] rendering task summary by phases: ${plan.phases.length} phases, ${plan.tasks.length} tasks for ${plan.fileName}`);
    for (let pi = 0; pi < plan.phases.length; pi++) {
      const phase = plan.phases[pi];
      const phaseDone = phase.tasks.filter((t) => t.done).length;
      const phaseTotal = phase.tasks.length;
      const phaseHeaderText = new TextRenderable(renderer, {
        id: `${id}-phase-${pi}`,
        content: t`${bold(fg(colors.muted)(`${phase.name} (${phaseDone}/${phaseTotal})`))}`,
        fg: colors.fg,
      });
      scroll.add(phaseHeaderText);
      for (const task of phase.tasks) {
        const box = task.done ? BOX_DONE : BOX_TODO;
        const taskColor = task.done ? colors.done : colors.fg;
        const line = `  ${box} ${task.id}: ${task.title}`;
        const taskText = new TextRenderable(renderer, {
          id: `${id}-task-${task.id}`,
          content: t`${fg(taskColor)(line)}`,
          fg: colors.fg,
        });
        scroll.add(taskText);
      }
    }
  } else {
    debug(`[tui:detail] rendering flat task summary: ${plan.tasks.length} tasks for ${plan.fileName}`);
    const tasksHeaderText = new TextRenderable(renderer, {
      id: `${id}-tasks-header`,
      content: t`${bold(fg(colors.muted)(`Tasks (${status.done}/${status.total}):`))}`,
      fg: colors.fg,
    });
    scroll.add(tasksHeaderText);
    for (const task of plan.tasks) {
      const box = task.done ? BOX_DONE : BOX_TODO;
      const taskColor = task.done ? colors.done : colors.fg;
      const line = `  ${box} ${task.id}: ${task.title}`;
      const taskText = new TextRenderable(renderer, {
        id: `${id}-task-${task.id}`,
        content: t`${fg(taskColor)(line)}`,
        fg: colors.fg,
      });
      scroll.add(taskText);
    }
  }

  const sep2Text = new TextRenderable(renderer, {
    id: `${id}-sep2`,
    content: "\u2500".repeat(40),
    fg: colors.border,
  });
  scroll.add(sep2Text);
  debug(`[tui:detail] added second separator after task summary for ${plan.fileName}`);

  debug(`[tui:detail] sync phase done for ${plan.fileName}, scheduling markdown parse`);
  return scroll;
}

export function renderBackBar(
  renderer: CliRenderer,
  onBack: () => void,
  onCheatSheet: () => void,
): BoxRenderable {
  debug(`[tui:back-bar] creating back bar`);

  const bar = new BoxRenderable(renderer, {
    id: "detail-back-bar",
    width: "100%",
    height: 1,
    backgroundColor: colors.bgAlt,
    flexDirection: "row",
    alignItems: "center",
    padding: 0,
  });

  const text = new TextRenderable(renderer, {
    id: "detail-back-bar-text",
    content: t`${fg(colors.accent)("\u2190 Back")}  ${fg(colors.muted)("(double-click to return to list)")}`,
    fg: colors.fg,
  });
  bar.add(text);

  const spacer = new BoxRenderable(renderer, {
    id: "detail-back-bar-spacer",
    flexGrow: 1,
    height: 1,
  });
  bar.add(spacer);

  const cheatBtn = new TextRenderable(renderer, {
    id: "detail-back-bar-cheat",
    content: t`${fg(colors.accent)("[Cheat Sheet]")}`,
    fg: colors.fg,
  });
  bar.add(cheatBtn);

  let lastClickTime = 0;
  const DOUBLE_CLICK_MS = 300;

  bar.onMouseDown = (event: MouseEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const cheatBtnX = (cheatBtn as unknown as { screenX?: number }).screenX ?? 0;
    const cheatBtnW = (cheatBtn as unknown as { width?: number }).width ?? 14;
    const eventX = (event as unknown as { x?: number }).x ?? 0;
    if (eventX >= cheatBtnX && eventX < cheatBtnX + cheatBtnW) {
      debug(`[tui:back-bar] cheat sheet button clicked`);
      onCheatSheet();
      return;
    }

    const now = Date.now();
    const elapsed = now - lastClickTime;
    debug(`[tui:back-bar] mouse down button=${event.button} elapsed=${elapsed}ms`);
    if (elapsed < DOUBLE_CLICK_MS) {
      debug(`[tui:back-bar] double click detected -> calling onBack`);
      lastClickTime = 0;
      onBack();
    } else {
      lastClickTime = now;
    }
  };

  debug(`[tui:back-bar] created id=detail-back-bar`);
  return bar;
}

export function renderDeleteConfirm(
  renderer: CliRenderer,
  plan: Plan,
): { overlay: BoxRenderable; select: SelectRenderable } {
  debug(`[tui:delete-confirm] creating overlay for plan=${plan.fileName}`);

  const overlay = new BoxRenderable(renderer, {
    id: "delete-confirm-overlay",
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    zIndex: 100,
    backgroundColor: colors.bg,
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
  });

  const dialog = new BoxRenderable(renderer, {
    id: "delete-confirm-dialog",
    width: 50,
    height: 9,
    border: true,
    borderStyle: "single",
    borderColor: colors.notStarted,
    backgroundColor: colors.bgAlt,
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    padding: 1,
  });

  const titleText = new TextRenderable(renderer, {
    id: "delete-confirm-title",
    content: t`${bold(fg(colors.notStarted)("\u26A0 Delete plan"))}`,
    fg: colors.fg,
  });
  dialog.add(titleText);

  const kindTag = plan.kind === "fast" ? "[fast]" : "[full]";
  const bodyText = new TextRenderable(renderer, {
    id: "delete-confirm-body",
    content: t`Delete ${kindTag} ${plan.fileName}? This cannot be undone.`,
    fg: colors.muted,
  });
  dialog.add(bodyText);

  const spacerText = new TextRenderable(renderer, {
    id: "delete-confirm-spacer",
    content: " ",
    fg: colors.muted,
  });
  dialog.add(spacerText);

  const select = new SelectRenderable(renderer, {
    id: "delete-confirm-select",
    width: 30,
    height: 3,
    options: [
      { name: "\u2716  Delete", description: "Permanently remove the plan file", value: "delete" },
      { name: "\u2714  Cancel", description: "Keep the plan, dismiss this dialog", value: "cancel" },
    ],
    selectedIndex: 1,
    backgroundColor: colors.bgAlt,
    textColor: colors.fg,
    selectedBackgroundColor: colors.selected,
    selectedTextColor: "#FFFFFF",
    descriptionColor: colors.muted,
    showDescription: false,
    wrapSelection: true,
    itemSpacing: 0,
  });
  dialog.add(select);

  overlay.add(dialog);
  debug(`[tui:delete-confirm] overlay created id=delete-confirm-overlay plan=${plan.fileName}`);
  select.focus();
  return { overlay, select };
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

export function renderCheatSheet(
  renderer: CliRenderer,
  plan: Plan,
): { overlay: BoxRenderable; select: SelectRenderable; statusText: TextRenderable } {
  debug(`[tui:cheat-sheet] creating overlay for plan=${plan.fileName}`);

  const planPath = plan.path.startsWith("/") ? `.${plan.path}` : plan.path;
  const commands = [
    `/aif-implement ${planPath}`,
    `aif-implement ${planPath}`,
    `/aif-verify ${planPath}`,
    `aif-verify ${planPath}`,
    `/aif-improve ${planPath}`,
    `aif-improve ${planPath}`,
  ];

  const overlay = new BoxRenderable(renderer, {
    id: "cheat-sheet-overlay",
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    zIndex: 100,
    backgroundColor: colors.bg,
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
  });

  const dialog = new BoxRenderable(renderer, {
    id: "cheat-sheet-dialog",
    width: 80,
    height: "70%",
    border: true,
    borderStyle: "single",
    borderColor: colors.accent,
    backgroundColor: colors.bgAlt,
    flexDirection: "column",
    padding: 1,
  });

  const titleText = new TextRenderable(renderer, {
    id: "cheat-sheet-title",
    content: t`${bold(fg(colors.accent)("\u2139 Cheat Sheet"))}`,
    fg: colors.fg,
  });
  dialog.add(titleText);

  const subtitleText = new TextRenderable(renderer, {
    id: "cheat-sheet-subtitle",
    content: "Arrows: navigate · Enter: copy · Esc: close",
    fg: colors.muted,
  });
  dialog.add(subtitleText);

  const spacerText = new TextRenderable(renderer, {
    id: "cheat-sheet-spacer",
    content: " ",
    fg: colors.muted,
  });
  dialog.add(spacerText);

  const selectWrapper = new BoxRenderable(renderer, {
    id: "cheat-sheet-select-wrapper",
    width: 76,
    height: commands.length * 2 + 2,
    flexDirection: "column",
  });

  const select = new SelectRenderable(renderer, {
    id: "cheat-sheet-select",
    width: "100%",
    height: "100%",
    options: commands.map((cmd, i) => ({
      name: cmd,
      description: i < 2 ? "implement" : i < 4 ? "verify" : "improve",
      value: i,
    })),
    backgroundColor: colors.bgAlt,
    textColor: colors.fg,
    selectedBackgroundColor: colors.selected,
    selectedTextColor: "#FFFFFF",
    descriptionColor: colors.muted,
    showDescription: true,
    wrapSelection: false,
  });
  selectWrapper.add(select);
  dialog.add(selectWrapper);

  const statusSpacer = new TextRenderable(renderer, {
    id: "cheat-sheet-status-spacer",
    content: " ",
    fg: colors.muted,
  });
  dialog.add(statusSpacer);

  const statusText = new TextRenderable(renderer, {
    id: "cheat-sheet-status",
    content: " ",
    fg: colors.done,
  });
  dialog.add(statusText);

  const hintSpacer = new TextRenderable(renderer, {
    id: "cheat-sheet-hint-spacer",
    content: "\u2500".repeat(40),
    fg: colors.border,
  });
  dialog.add(hintSpacer);

  const hintText = new TextRenderable(renderer, {
    id: "cheat-sheet-hint",
    content: "Arrows: navigate · Enter: copy · Esc: close",
    fg: colors.muted,
  });
  dialog.add(hintText);

  overlay.add(dialog);
  debug(`[tui:cheat-sheet] overlay created id=cheat-sheet-overlay plan=${plan.fileName}`);
  select.focus();
  return { overlay, select, statusText };
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
  const planListPixelWidth = () => Math.floor(renderer.width * (showTasks ? 0.4 : 1.0));

  let viewMode: "list" | "detail" = "list";
  let currentDetail: { id: string; renderable: BoxRenderable; detailId: string; detailScroll: ScrollBoxRenderable } | null = null;
  let currentTaskList: { id: string; renderable: ScrollBoxRenderable } | null = null;
  let currentTaskListPlanFileName: string | null = null;
  let pendingMarkdownTimer: ReturnType<typeof setTimeout> | null = null;
  let listMounted = false;
  let taskListMounted = false;
  let confirmOverlay: BoxRenderable | null = null;
  let confirmSelect: SelectRenderable | null = null;
  let confirmSelectIndex = 1;
  let cheatOverlay: BoxRenderable | null = null;
  let cheatSelect: SelectRenderable | null = null;
  let cheatSelectIndex = 0;
  let cheatStatusText: TextRenderable | null = null;
  let cheatFeedbackTimer: ReturnType<typeof setTimeout> | null = null;
  let emptyStateMounted = false;
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

  const showDeleteConfirm = () => {
    if (confirmOverlay) {
      debug(`[tui:delete-confirm] showDeleteConfirm: overlay already active, no-op`);
      return;
    }
    const plan = plans[selectedIndex];
    if (!plan) {
      debug(`[tui:delete-confirm] showDeleteConfirm: no plan at index=${selectedIndex}, aborting`);
      return;
    }
    debug(`[tui:delete-confirm] showing confirm overlay for plan=${plan.fileName} index=${selectedIndex}`);
    const result = renderDeleteConfirm(renderer, plan);
    confirmOverlay = result.overlay;
    confirmSelect = result.select;
    confirmSelectIndex = 1;
    root.add(confirmOverlay);
    confirmSelect.on(SelectRenderableEvents.ITEM_SELECTED, (index: number) => {
      debug(`[tui:delete-confirm] select item selected index=${index}`);
      if (index === 0) {
        void confirmDelete();
      } else {
        hideDeleteConfirm();
      }
    });
    confirmSelect.onMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) return;
      const localY = event.y - confirmSelect!.screenY;
      if (localY < 0) return;
      const linesPerItem = 1;
      const visibleIndex = Math.floor(localY / linesPerItem);
      if (visibleIndex < 0 || visibleIndex >= 2) return;
      debug(`[tui:delete-confirm] mouse click visibleIndex=${visibleIndex} localY=${localY} screenY=${confirmSelect!.screenY}`);
      event.preventDefault();
      event.stopPropagation();
      confirmSelectIndex = visibleIndex;
      confirmSelect!.setSelectedIndex(visibleIndex);
      if (visibleIndex === 0) {
        debug(`[tui:delete-confirm] mouse click → delete`);
        void confirmDelete();
      } else {
        debug(`[tui:delete-confirm] mouse click → cancel`);
        hideDeleteConfirm();
      }
    };
    footerBox.hotkeysText.content = HOTKEYS_CONFIRM;
    debug(`[tui:footer] hotkeys updated to confirm mode`);
    renderer.requestRender();
  };

  const hideDeleteConfirm = () => {
    if (!confirmOverlay) {
      debug(`[tui:delete-confirm] hideDeleteConfirm: no overlay active, no-op`);
      return;
    }
    debug(`[tui:delete-confirm] hiding confirm overlay`);
    try { root.remove(confirmOverlay.id); } catch (e) { console.warn(`[tui:delete-confirm] root.remove failed`, e); }
    try { confirmOverlay.destroyRecursively(); } catch { /* noop */ }
    confirmOverlay = null;
    confirmSelect = null;
    try { select.focus(); } catch (e) { console.warn(`[tui:delete-confirm] restore focus failed`, e); }
    debug(`[tui:delete-confirm] focus restored to planList`);
    footerBox.hotkeysText.content = viewMode === "list" ? HOTKEYS_LIST : HOTKEYS_DETAIL;
    debug(`[tui:footer] hotkeys restored to ${viewMode} mode`);
    renderer.requestRender();
  };

  const confirmDelete = async () => {
    const plan = plans[selectedIndex];
    if (!plan) {
      debug(`[tui:delete-confirm] confirmDelete: no plan at index=${selectedIndex}, aborting`);
      hideDeleteConfirm();
      return;
    }
    const fullPath = join(rootDir, plan.path);
    debug(`[tui:delete-confirm] confirmDelete: unlinking plan=${plan.fileName} path=${fullPath}`);
    try {
      await unlink(fullPath);
      debug(`[tui:delete-confirm] confirmDelete: unlink succeeded for ${plan.fileName}`);
    } catch (e) {
      console.warn(`[tui:delete-confirm] confirmDelete: unlink failed for ${fullPath}: ${e}`);
      hideDeleteConfirm();
      return;
    }
    hideDeleteConfirm();
    if (viewMode === "detail") {
      debug(`[tui:delete-confirm] confirmDelete: returning to list mode after delete`);
      enterListMode();
    }
    debug(`[tui:delete-confirm] confirmDelete: triggering immediate dataTick for rescan`);
    void dataTick();
  };

  const showCheatSheet = () => {
    if (cheatOverlay) {
      debug(`[tui:cheat-sheet] showCheatSheet: overlay already active, no-op`);
      return;
    }
    if (viewMode !== "detail") {
      debug(`[tui:cheat-sheet] showCheatSheet: ignored (not in detail mode)`);
      return;
    }
    const plan = plans[selectedIndex];
    if (!plan) {
      debug(`[tui:cheat-sheet] showCheatSheet: no plan at index=${selectedIndex}, aborting`);
      return;
    }
    debug(`[tui:cheat-sheet] showing cheat sheet for plan=${plan.fileName} index=${selectedIndex}`);
    const result = renderCheatSheet(renderer, plan);
    cheatOverlay = result.overlay;
    cheatSelect = result.select;
    cheatSelectIndex = 0;
    cheatStatusText = result.statusText;
    root.add(cheatOverlay);

    const copyCommand = (index: number) => {
      const opts = cheatSelect!.options as Array<{ name: string }>;
      const cmd = opts[index]?.name;
      if (!cmd) return;
      debug(`[tui:cheat-sheet] copying command index=${index}: ${cmd}`);
      const ok = copyToClipboard(cmd);
      if (ok) {
        debug(`[tui:cheat-sheet] copied "${cmd}" to clipboard`);
        if (cheatStatusText) cheatStatusText.content = `\u2714 Copied: ${cmd}`;
      } else {
        console.warn(`[tui:cheat-sheet] clipboard copy failed for "${cmd}"`);
        if (cheatStatusText) cheatStatusText.content = `\u2716 Copy failed: ${cmd}`;
      }
      renderer.requestRender();
      if (cheatFeedbackTimer) clearTimeout(cheatFeedbackTimer);
      cheatFeedbackTimer = setTimeout(() => {
        renderer.requestRender();
        cheatFeedbackTimer = setTimeout(() => {
          cheatFeedbackTimer = null;
          debug(`[tui:cheat-sheet] auto-closing after copy feedback`);
          hideCheatSheet();
        }, 250);
      }, 50);
    };

    cheatSelect.on(SelectRenderableEvents.SELECTION_CHANGED, (index: number) => {
      cheatSelectIndex = index;
      debug(`[tui:cheat-sheet] selection changed index=${index}`);
    });

    cheatSelect.on(SelectRenderableEvents.ITEM_SELECTED, (index: number) => {
      debug(`[tui:cheat-sheet] item selected (enter/click) index=${index}`);
      copyCommand(index);
    });
    cheatSelect.onMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) return;
      const localY = event.y - cheatSelect!.screenY;
      if (localY < 0) return;
      const linesPerItem = 2;
      const visibleIndex = Math.floor(localY / linesPerItem);
      if (visibleIndex < 0 || visibleIndex >= (cheatSelect!.options as Array<{ name: string }>).length) return;
      debug(`[tui:cheat-sheet] mouse click visibleIndex=${visibleIndex} localY=${localY}`);
      event.preventDefault();
      event.stopPropagation();
      cheatSelect!.setSelectedIndex(visibleIndex);
      copyCommand(visibleIndex);
    };
    cheatSelect.onMouseScroll = (event: MouseEvent) => {
      if (!event.scroll) return;
      const dir = event.scroll.direction;
      debug(`[tui:cheat-sheet] mouse scroll dir=${dir}`);
      event.preventDefault();
      event.stopPropagation();
      if (dir === "up") cheatSelect?.moveUp();
      else if (dir === "down") cheatSelect?.moveDown();
    };
    footerBox.hotkeysText.content = HOTKEYS_CHEAT;
    debug(`[tui:footer] hotkeys updated to cheat mode`);
    renderer.requestRender();
  };

  const hideCheatSheet = () => {
    if (!cheatOverlay) {
      debug(`[tui:cheat-sheet] hideCheatSheet: no overlay active, no-op`);
      return;
    }
    debug(`[tui:cheat-sheet] hiding cheat sheet overlay`);
    if (cheatFeedbackTimer) {
      clearTimeout(cheatFeedbackTimer);
      cheatFeedbackTimer = null;
    }
    try { root.remove(cheatOverlay.id); } catch (e) { console.warn(`[tui:cheat-sheet] root.remove failed`, e); }
    try { cheatOverlay.destroyRecursively(); } catch { /* noop */ }
    cheatOverlay = null;
    cheatSelect = null;
    cheatStatusText = null;
    try { select.focus(); } catch { /* noop */ }
    footerBox.hotkeysText.content = viewMode === "list" ? HOTKEYS_LIST : HOTKEYS_DETAIL;
    debug(`[tui:footer] hotkeys restored to ${viewMode} mode`);
    renderer.requestRender();
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
      console.debug(`[tui:mode] removing previous detail container id=${currentDetail.id}`);
      try { bodyRow.remove(currentDetail.id); } catch (e) { console.warn(`[tui:mode] bodyRow.remove(detail) failed`, e); }
      try { currentDetail.renderable.destroy(); } catch { /* noop */ }
      currentDetail = null;
    }
    const detailId = `plan-detail-${selectedIndex}`;
    const detail = renderTaskDetail(renderer, plan, statuses[selectedIndex], detailId, "100%");
    const containerId = `detail-container-${selectedIndex}`;
    debug(`[tui:mode] creating detailContainer id=${containerId} for plan=${plan.fileName}`);
    const detailContainer = new BoxRenderable(renderer, {
      id: containerId,
      flexDirection: "column",
      width: "100%",
      height: "100%",
    });
    const backBar = renderBackBar(renderer, () => {
      debug(`[tui:back-bar] onBack callback -> enterListMode`);
      enterListMode();
    }, () => {
      debug(`[tui:back-bar] onCheatSheet callback -> showCheatSheet`);
      showCheatSheet();
    });
    detailContainer.add(backBar);
    debug(`[tui:mode] added backBar to detailContainer id=${containerId}`);
    detailContainer.add(detail);
    debug(`[tui:mode] added detail (scroll) to detailContainer id=${containerId}`);
    bodyRow.add(detailContainer);
    currentDetail = { id: containerId, renderable: detailContainer, detailId, detailScroll: detail };
    console.debug(`[tui:mode] mounted detailContainer id=${containerId} detailId=${detailId} plan=${plan.fileName}`);

    pendingMarkdownTimer = appendMarkdownDeferred(
      renderer,
      detail,
      plan,
      `${detailId}-md`,
      () => currentDetail?.detailId !== detailId,
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
      debug(`[tui:mode] enterListMode: removing detailContainer id=${currentDetail.id}`);
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

  let detailRefreshCounter = 0;

  const refreshDetail = () => {
    if (viewMode !== "detail") {
      debug(`[tui:refresh] refreshDetail: skipped (viewMode=${viewMode})`);
      return;
    }
    if (!currentDetail) {
      debug(`[tui:refresh] refreshDetail: skipped (currentDetail is null)`);
      return;
    }
    const plan = plans[selectedIndex];
    if (!plan) {
      debug(`[tui:refresh] refreshDetail: no plan at index=${selectedIndex}, aborting`);
      return;
    }
    debug(`[tui:refresh] refreshDetail: rebuilding detail for plan=${plan.fileName} index=${selectedIndex}`);
    const oldId = currentDetail.id;
    if (pendingMarkdownTimer) {
      debug(`[tui:refresh] refreshDetail: cancelling pending markdown timer`);
      clearTimeout(pendingMarkdownTimer);
      pendingMarkdownTimer = null;
    }
    try { bodyRow.remove(currentDetail.id); } catch (e) { console.warn(`[tui:refresh] refreshDetail: bodyRow.remove(oldDetail) failed`, e); }
    try { currentDetail.renderable.destroy(); } catch { /* noop */ }
    currentDetail = null;
    debug(`[tui:refresh] refreshDetail: removed old detailContainer id=${oldId}`);
    detailRefreshCounter++;
    const detailId = `plan-detail-${selectedIndex}-r${detailRefreshCounter}`;
    const detail = renderTaskDetail(renderer, plan, statuses[selectedIndex], detailId, "100%");
    const containerId = `detail-container-${selectedIndex}-r${detailRefreshCounter}`;
    debug(`[tui:refresh] refreshDetail: creating detailContainer id=${containerId}`);
    const detailContainer = new BoxRenderable(renderer, {
      id: containerId,
      flexDirection: "column",
      width: "100%",
      height: "100%",
    });
    const backBar = renderBackBar(renderer, () => {
      debug(`[tui:back-bar] onBack callback (refresh) -> enterListMode`);
      enterListMode();
    }, () => {
      debug(`[tui:back-bar] onCheatSheet callback (refresh) -> showCheatSheet`);
      showCheatSheet();
    });
    detailContainer.add(backBar);
    detailContainer.add(detail);
    debug(`[tui:refresh] refreshDetail: added backBar + detail to detailContainer id=${containerId}`);
    bodyRow.add(detailContainer);
    currentDetail = { id: containerId, renderable: detailContainer, detailId, detailScroll: detail };
    debug(`[tui:refresh] refreshDetail: mounted new detailContainer id=${containerId} detailId=${detailId} plan=${plan.fileName}`);
    pendingMarkdownTimer = appendMarkdownDeferred(
      renderer,
      detail,
      plan,
      `${detailId}-md`,
      () => currentDetail?.detailId !== detailId,
    );
    try { detail.focus(); } catch (e) { console.warn(`[tui:refresh] refreshDetail: detail.focus() failed`, e); }
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
    planListPixelWidth(),
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
    const widthChanged = newShowTasks !== showTasks;
    showTasks = newShowTasks;
    planListWidth = showTasks ? "40%" : "100%";
    console.debug(`[tui:resize] showTasks=${showTasks} width=${renderer.width} threshold=${RESPONSIVE_THRESHOLD}`);
    if (widthChanged) {
      try { planList.width = planListWidth; } catch (e) { console.warn(`[tui:resize] planList.width set failed`, e); }
      if (showTasks) {
        currentTaskListPlanFileName = null;
        if (viewMode === "list") rebuildTaskList();
      } else {
        removeTaskList();
        currentTaskListPlanFileName = null;
      }
    }
    select.options = buildOptions(plans, statuses, Date.now(), planListPixelWidth());
    renderer.requestRender();
  };
  renderer.on("resize", resizeHandler);

  const keypressHandler = (event: KeyEvent) => {
    if (event.repeated) return;
    console.debug(`[tui:keypress] name=${event.name} ctrl=${event.ctrl} meta=${event.meta} mode=${viewMode}`);
    if (cheatOverlay) {
      if (event.name === "escape") {
        event.preventDefault();
        debug(`[tui:keypress] escape: closing cheat sheet`);
        hideCheatSheet();
        return;
      }
      if (event.name === "return" || event.name === "enter") {
        event.preventDefault();
        debug(`[tui:keypress] enter: copying selected command index=${cheatSelectIndex}`);
        if (cheatSelect) {
          const opts = cheatSelect.options as Array<{ name: string }>;
          const cmd = opts[cheatSelectIndex]?.name;
          if (cmd) {
            const ok = copyToClipboard(cmd);
            if (ok) {
              debug(`[tui:cheat-sheet] copied "${cmd}" to clipboard`);
              if (cheatStatusText) cheatStatusText.content = `\u2714 Copied: ${cmd}`;
            } else {
              if (cheatStatusText) cheatStatusText.content = `\u2716 Copy failed: ${cmd}`;
            }
            renderer.requestRender();
            if (cheatFeedbackTimer) clearTimeout(cheatFeedbackTimer);
            cheatFeedbackTimer = setTimeout(() => {
              renderer.requestRender();
              cheatFeedbackTimer = setTimeout(() => {
                cheatFeedbackTimer = null;
                debug(`[tui:cheat-sheet] auto-closing after copy feedback`);
                hideCheatSheet();
              }, 350);
            }, 50);
          }
        }
        return;
      }
      if (event.name === "up" || event.name === "down" || event.name === "pageup" || event.name === "pagedown") {
        if (event.name === "up") { event.preventDefault(); cheatSelect?.moveUp(); }
        else if (event.name === "down") { event.preventDefault(); cheatSelect?.moveDown(); }
        debug(`[tui:keypress] cheat: arrow ${event.name} -> select`);
        return;
      }
      debug(`[tui:keypress] cheat overlay active, ignoring key=${event.name}`);
      event.preventDefault();
      return;
    }
    if (confirmOverlay) {
      event.preventDefault();
      debug(`[tui:keypress] overlay active, intercepting key=${event.name}`);
      if (event.name === "escape") {
        debug(`[tui:keypress] escape: cancelling delete`);
        hideDeleteConfirm();
        return;
      }
      if (event.name === "return" || event.name === "enter") {
        debug(`[tui:keypress] enter: confirming selection index=${confirmSelectIndex}`);
        if (confirmSelectIndex === 0) {
          void confirmDelete();
        } else {
          hideDeleteConfirm();
        }
        return;
      }
      if (event.name === "up" || event.name === "left") {
        debug(`[tui:keypress] ${event.name}: moving selection up`);
        confirmSelectIndex = confirmSelectIndex === 0 ? 1 : 0;
        if (confirmSelect) confirmSelect.setSelectedIndex(confirmSelectIndex);
        return;
      }
      if (event.name === "down" || event.name === "right") {
        debug(`[tui:keypress] ${event.name}: moving selection down`);
        confirmSelectIndex = confirmSelectIndex === 0 ? 1 : 0;
        if (confirmSelect) confirmSelect.setSelectedIndex(confirmSelectIndex);
        return;
      }
      debug(`[tui:keypress] overlay active, ignoring key=${event.name}`);
      return;
    }
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
    if (event.name === "d") {
      event.preventDefault();
      if (viewMode !== "list" || plans.length === 0) {
        debug(`[tui:keypress] d ignored: viewMode=${viewMode} plans=${plans.length}`);
        return;
      }
      debug(`[tui:keypress] d: triggering delete confirm for index=${selectedIndex}`);
      showDeleteConfirm();
      return;
    }
    if (event.name === "c") {
      event.preventDefault();
      if (viewMode !== "detail" || plans.length === 0) {
        debug(`[tui:keypress] c ignored: viewMode=${viewMode} plans=${plans.length}`);
        return;
      }
      debug(`[tui:keypress] c: opening cheat sheet for index=${selectedIndex}`);
      showCheatSheet();
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
    if (confirmOverlay) {
      debug(`[tui:refresh] data tick skipped (confirm overlay active)`);
      return;
    }
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

      const oldSelectedPlan = plans.find(p => p.fileName === selectedFileName);
      const newSelectedPlan = newPlans[newIndex];
      const selectionChanged = newIndex !== selectedIndex || (oldSelectedPlan != null && newSelectedPlan != null && oldSelectedPlan.mtime !== newSelectedPlan.mtime);
      debug(`[tui:refresh] selectionChanged=${selectionChanged} oldIndex=${selectedIndex} newIndex=${newIndex} oldMtime=${oldSelectedPlan?.mtime} newMtime=${newSelectedPlan?.mtime}`);
      plans = newPlans;
      statuses = newStatuses;
      selectedIndex = newIndex;

      select.options = buildOptions(plans, statuses, Date.now(), planListPixelWidth());

      if (plans.length === 0 && !emptyStateMounted) {
        debug(`[tui:refresh] data tick: plans empty, showing empty state`);
        if (viewMode === "detail") enterListMode();
        if (listMounted) {
          try { bodyRow.remove(planList.id); } catch (e) { console.warn(`[tui:refresh] bodyRow.remove(planList) failed`, e); }
          listMounted = false;
        }
        removeTaskList();
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
          content: "All plans deleted.",
          fg: colors.notStarted,
        });
        emptyBox.add(emptyText);
        bodyRow.add(emptyBox);
        emptyStateMounted = true;
        renderer.requestRender();
        return;
      }

      if (plans.length > 0 && emptyStateMounted) {
        debug(`[tui:refresh] data tick: plans restored, removing empty state`);
        try { bodyRow.remove("tui-empty"); } catch (e) { console.warn(`[tui:refresh] bodyRow.remove(tui-empty) failed`, e); }
        emptyStateMounted = false;
        if (!listMounted) {
          bodyRow.add(planList);
          listMounted = true;
        }
      }

      if (selectionChanged) {
        select.setSelectedIndex(newIndex);
        if (viewMode === "detail") {
          debug(`[tui:refresh] dataTick: calling refreshDetail (viewMode=detail)`);
          refreshDetail();
        } else {
          debug(`[tui:refresh] dataTick: calling rebuildTaskList (viewMode=list)`);
          if (showTasks) {
            currentTaskListPlanFileName = null;
            rebuildTaskList();
            debug(`[tui:refresh] dataTick: task list rebuilt for plan=${plans[selectedIndex]?.fileName}`);
          }
        }
      }
      renderer.requestRender();
    } catch (e) {
      console.warn(`[tui:refresh] data tick error: ${e}`);
    }
  };

  const labelTick = () => {
    if (confirmOverlay) {
      debug(`[tui:refresh] label tick skipped (confirm overlay active)`);
      return;
    }
    try {
      const now = Date.now();
      const oldOptions = select.options;
      const newOptions = buildOptions(plans, statuses, now, planListPixelWidth());
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
    if (confirmOverlay) {
      debug("[tui:shutdown] removing confirm overlay");
      try { root.remove(confirmOverlay.id); } catch { /* noop */ }
      try { confirmOverlay.destroyRecursively(); } catch { /* noop */ }
      confirmOverlay = null;
      confirmSelect = null;
    }
    if (cheatOverlay) {
      debug("[tui:shutdown] removing cheat sheet overlay");
      try { root.remove(cheatOverlay.id); } catch { /* noop */ }
      try { cheatOverlay.destroyRecursively(); } catch { /* noop */ }
      cheatOverlay = null;
      cheatSelect = null;
      cheatStatusText = null;
    }
    if (cheatFeedbackTimer) {
      clearTimeout(cheatFeedbackTimer);
      cheatFeedbackTimer = null;
    }
    try { renderer.off("resize", resizeHandler); } catch (e) { console.warn(`[tui:shutdown] renderer.off(resize) failed`, e); }
    try { renderer.keyInput.off("keypress", keypressHandler); } catch (e) { console.warn(`[tui:shutdown] keyInput.off failed`, e); }
  };

  return { destroy };
}