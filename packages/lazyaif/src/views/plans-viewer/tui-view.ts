import type { CliRenderer } from "@opentui/core";
import { Box, ScrollBox, Select, SelectRenderableEvents, Text, t, bold, fg } from "@opentui/core";
import { scanAiFactory, computeStatus, statusIcon, formatTaskProgress, formatPercent } from "../../modules/plans-viewer/index.js";
import type { Plan, PlanStatus } from "../../modules/plans-viewer/types.js";
import { colors } from "../../clients/tui/components/index.js";
import { renderHeader, renderFooter } from "../../clients/tui/components/index.js";

export function renderPlanList(
  plans: Plan[],
  statuses: PlanStatus[],
  onSelect: (index: number) => void,
) {
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

  const select = Select({
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

  select.focus();
  return select;
}

export function renderTaskDetail(plan: Plan, status: PlanStatus) {
  console.debug(`[tui:task-detail] rendering plan=${plan.fileName} tasks=${plan.tasks.length}`);

  const children: ReturnType<typeof Box | typeof Text>[] = [];

  children.push(Text({ content: t`${bold(fg(colors.accent)(plan.title))}`, fg: colors.fg }));

  const meta = `Branch: ${plan.branch}  ·  Created: ${plan.created}  ·  Testing: ${plan.settings.testing ? "yes" : "no"}  ·  Logging: ${plan.settings.logging}  ·  Docs: ${plan.settings.docs ? "yes" : "no"}`;
  children.push(Text({ content: meta, fg: colors.muted }));

  const icon = statusIcon(status.state);
  const progress = formatTaskProgress(status.done, status.total);
  const pct = formatPercent(status.pct);
  const stateColor =
    status.state === "done" ? colors.done
    : status.state === "in-progress" ? colors.progress
    : colors.notStarted;
  children.push(Text({ content: t`${fg(stateColor)(`${icon} ${progress} (${pct})`)}`, fg: colors.fg }));

  children.push(Text({ content: "─".repeat(40), fg: colors.border }));

  for (const phase of plan.phases) {
    children.push(Text({ content: t`${bold(fg(colors.accent)(phase.name))}` }));
    for (const task of phase.tasks) {
      const mark = task.done ? "[x]" : "[ ]";
      const markColor = task.done ? colors.done : colors.muted;
      children.push(
        Box(
          { flexDirection: "row", gap: 1 },
          Text({ content: mark, fg: markColor }),
          Text({ content: task.title, fg: task.done ? colors.done : colors.fg }),
        ),
      );
      if (task.description) children.push(Text({ content: task.description, fg: colors.muted }));
      if (task.dependsOn.length > 0)
        children.push(Text({ content: `  depends on: ${task.dependsOn.join(", ")}`, fg: colors.muted }));
    }
  }

  return ScrollBox(
    {
      width: "60%",
      height: "100%",
      viewportCulling: true,
      rootOptions: { backgroundColor: colors.bg },
    },
    ...children,
  );
}

export async function createPlansTuiApp(renderer: CliRenderer, rootDir: string) {
  console.debug(`[tui:app] initializing rootDir=${rootDir}`);

  const plans: Plan[] = await scanAiFactory(rootDir);
  const statuses: PlanStatus[] = plans.map((p) => computeStatus(p));
  let selectedIndex = 0;

  console.debug(`[tui:app] initialized plans=${plans.length}`);

  if (plans.length === 0) {
    renderer.root.add(
      Box(
        { width: "100%", height: "100%", flexDirection: "column", justifyContent: "center", alignItems: "center", backgroundColor: colors.bg },
        renderHeader(rootDir),
        Box(
          { flexDirection: "column", alignItems: "center", padding: 2 },
          Text({ content: "No .ai-factory plans found in this directory.", fg: colors.notStarted }),
        ),
        renderFooter(),
      ),
    );
    return;
  }

  const bodyRow = Box({ flexDirection: "row", flexGrow: 1, width: "100%" });

  let currentDetail: ReturnType<typeof renderTaskDetail> | null = null;

  const updateDetail = () => {
    console.debug(`[tui:app] selection changed index=${selectedIndex}`);
    const plan = plans[selectedIndex];
    if (!plan) return;
    if (currentDetail) {
      try { (currentDetail as unknown as { dispose?: () => void }).dispose?.(); } catch { /* noop */ }
    }
    currentDetail = renderTaskDetail(plan, statuses[selectedIndex]);
    bodyRow.add(currentDetail);
  };

  const planList = renderPlanList(plans, statuses, (index: number) => {
    selectedIndex = index;
    updateDetail();
  });

  bodyRow.add(planList);
  bodyRow.add(renderTaskDetail(plans[selectedIndex], statuses[selectedIndex]));

  renderer.root.add(
    Box(
      { width: "100%", height: "100%", flexDirection: "column", backgroundColor: colors.bg },
      renderHeader(rootDir),
      bodyRow,
      renderFooter(),
    ),
  );
}