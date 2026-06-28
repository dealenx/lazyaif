import {
  type CliRenderer,
  type MouseEvent,
  BoxRenderable,
  TextRenderable,
  ScrollBoxRenderable,
  SelectRenderable,
  SelectRenderableEvents,
  MarkdownRenderable,
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
import { colors, markdownSyntaxStyle, extractPlanBody, renderHeader, renderFooter } from "../../clients/tui/components/index.js";
import { stat, readdir, access } from "node:fs/promises";
import { join } from "node:path";

function shouldLog(): boolean {
  return process.env.DEBUG != null || process.env.LOG_LEVEL === "debug";
}
function debug(msg: string): void { if (shouldLog()) console.debug(msg); }

const DATA_REFRESH_MS = 2000;
const LABEL_REFRESH_MS = 1000;

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
    debug(`[tui:list] relative time for ${plan.fileName} = ${relativeTime}`);
    return {
      name: `${kindTag} ${plan.fileName}`,
      description: `${progress}  ${pct}  ${icon}  ·  ${relativeTime}`,
      value: i,
    };
  });
}

export function renderPlanList(
  renderer: CliRenderer,
  plans: Plan[],
  statuses: PlanStatus[],
  onSelect: (index: number) => void,
): SelectRenderable {
  console.debug(`[tui:plan-list] rendering plans count=${plans.length}`);
  const options = buildOptions(plans, statuses, Date.now());

  const select = new SelectRenderable(renderer, {
    id: "plan-list",
    width: "40%",
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
    onSelect(index);
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
): ScrollBoxRenderable {
  console.debug(`[tui:task-detail] rendering plan=${plan.fileName} tasks=${plan.tasks.length} id=${id}`);

  const scroll = new ScrollBoxRenderable(renderer, {
    id,
    width: "60%",
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

  const bodyMarkdown = extractPlanBody(plan.rawMarkdown);
  const md = new MarkdownRenderable(renderer, {
    id: `${id}-md`,
    content: bodyMarkdown,
    syntaxStyle: markdownSyntaxStyle,
    fg: colors.fg,
    bg: colors.bg,
    conceal: false,
    internalBlockMode: "top-level",
    tableOptions: { style: "grid", widthMode: "content", cellPaddingX: 1 },
    width: "100%",
  });
  scroll.add(md);

  return scroll;
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
    root.add(renderFooter(renderer));
    renderer.root.add(root);
    return { destroy: () => {} };
  }

  const bodyRow = new BoxRenderable(renderer, {
    id: "tui-body-row",
    flexDirection: "row",
    flexGrow: 1,
    width: "100%",
  });

  let currentDetail: { id: string; renderable: ScrollBoxRenderable } | null = null;

  const updateDetail = () => {
    console.debug(`[tui:app] updateDetail index=${selectedIndex} plan=${plans[selectedIndex]?.fileName ?? "<none>"}`);
    const plan = plans[selectedIndex];
    if (!plan) {
      console.warn(`[tui:app] no plan at index=${selectedIndex}, keeping current detail`);
      return;
    }
    if (currentDetail) {
      console.debug(`[tui:app] removing previous detail id=${currentDetail.id}`);
      try { bodyRow.remove(currentDetail.id); } catch (e) { console.warn(`[tui:app] bodyRow.remove failed`, e); }
      try { currentDetail.renderable.destroy(); } catch { /* noop */ }
    }
    const detailId = `plan-detail-${selectedIndex}`;
    const detail = renderTaskDetail(renderer, plan, statuses[selectedIndex], detailId);
    bodyRow.add(detail);
    currentDetail = { id: detailId, renderable: detail };
    console.debug(`[tui:app] mounted new detail id=${detailId} plan=${plan.fileName}`);
  };

  let select: SelectRenderable;
  const planList = renderPlanList(renderer, plans, statuses, (index: number) => {
    console.debug(`[tui:app] onSelect index=${index}`);
    const clamped = clampSelection(index, plans.length);
    if (clamped === null) {
      console.warn(`[tui:app] selection index out of bounds: ${index}`);
      return;
    }
    selectedIndex = clamped;
    updateDetail();
  });
  select = planList;

  bodyRow.add(planList);
  updateDetail();

  root.add(renderHeader(renderer, rootDir));
  root.add(bodyRow);
  root.add(renderFooter(renderer));
  renderer.root.add(root);

  const refreshState: { dataInterval: ReturnType<typeof setInterval> | null; labelInterval: ReturnType<typeof setInterval> | null } = {
    dataInterval: null,
    labelInterval: null,
  };

  const dataTick = async () => {
    try {
      const aiFactoryDir = join(rootDir, ".ai-factory");
      const plansDir = join(aiFactoryDir, "plans");
      const fastPath = join(aiFactoryDir, "PLAN.md");

      const currentPaths = new Set(plans.map((p) => p.fileName));
      const newMtimes = new Map<string, number>();
      let changedCount = 0;

      for (const plan of plans) {
        const fullPath = plan.kind === "fast" ? fastPath : join(plansDir, plan.fileName);
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
            if (p !== "PLAN.md" && !mdFiles.includes(p)) {
              changedCount++;
              break;
            }
          }
        } catch { /* ignore */ }
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
        updateDetail();
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

  const destroy = () => {
    debug("[tui:shutdown] clearing refresh intervals");
    if (refreshState.dataInterval) clearInterval(refreshState.dataInterval);
    if (refreshState.labelInterval) clearInterval(refreshState.labelInterval);
    refreshState.dataInterval = null;
    refreshState.labelInterval = null;
  };

  return { destroy };
}