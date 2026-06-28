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
import { scanAiFactory, computeStatus, statusIcon, formatTaskProgress, formatPercent, clampSelection } from "../../modules/plans-viewer/index.js";
import type { Plan, PlanStatus } from "../../modules/plans-viewer/types.js";
import { colors, markdownSyntaxStyle, extractPlanBody, renderHeader, renderFooter } from "../../clients/tui/components/index.js";

export function renderPlanList(
  renderer: CliRenderer,
  plans: Plan[],
  statuses: PlanStatus[],
  onSelect: (index: number) => void,
): SelectRenderable {
  console.debug(`[tui:plan-list] rendering plans count=${plans.length}`);
  const options = plans.map((plan, i) => {
    const st = statuses[i];
    const icon = statusIcon(st.state);
    const progress = formatTaskProgress(st.done, st.total);
    const pct = formatPercent(st.pct).padStart(4, " ");
    const kindTag = plan.kind === "fast" ? "[fast]" : "[full]";
    return {
      name: `${kindTag} ${plan.fileName}`,
      description: `${progress}  ${pct}  ${icon}`,
      value: i,
    };
  });

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

export async function createPlansTuiApp(renderer: CliRenderer, rootDir: string) {
  console.debug(`[tui:app] initializing rootDir=${rootDir}`);

  const plans: Plan[] = await scanAiFactory(rootDir);
  const statuses: PlanStatus[] = plans.map((p) => computeStatus(p));
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
    return;
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

  bodyRow.add(planList);
  updateDetail();

  root.add(renderHeader(renderer, rootDir));
  root.add(bodyRow);
  root.add(renderFooter(renderer));
  renderer.root.add(root);
}