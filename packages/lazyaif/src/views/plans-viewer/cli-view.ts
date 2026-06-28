import type { Plan, PlanStatus } from "../../modules/plans-viewer/types.js";
import { statusIcon, formatTaskProgress, formatPercent } from "../../modules/plans-viewer/format.js";
import { ansi, pad, colorForState, renderJson } from "../../clients/cli/index.js";

export function renderPlansTable(plans: Plan[], statuses: PlanStatus[]): string {
  console.debug(`[cli:table] rendering plans count=${plans.length}`);
  const useColor = process.stdout.isTTY;

  const header = `${ansi.bold}${pad("PLAN", 28)} ${pad("TYPE", 6)} ${pad("DONE", 5)} ${pad("TOTAL", 6)} ${pad("PCT", 5)}  STATE${ansi.reset}`;
  const separator = "─".repeat(70);
  const lines: string[] = [header, separator];

  for (let i = 0; i < plans.length; i++) {
    const plan = plans[i];
    const st = statuses[i];
    const icon = statusIcon(st.state);
    const progress = formatTaskProgress(st.done, st.total);
    const pct = formatPercent(st.pct).padStart(4, " ");
    const fileName = pad(plan.fileName, 28);
    const kind = pad(plan.kind, 6);
    const doneStr = pad(String(st.done), 5);
    const totalStr = pad(String(st.total), 6);

    if (useColor) {
      const c = colorForState(st.state);
      lines.push(`${fileName} ${ansi.cyan}${kind}${ansi.reset} ${doneStr} ${totalStr} ${pct}  ${c}${icon}${ansi.reset}`);
    } else {
      lines.push(`${fileName} ${kind} ${doneStr} ${totalStr} ${pct}  ${icon}`);
    }
  }

  return lines.join("\n");
}

export function renderPlansJson(plans: Plan[], statuses: PlanStatus[]): string {
  console.debug(`[cli:json] rendering plans count=${plans.length}`);
  const data = plans.map((plan, i) => ({ plan, status: statuses[i] }));
  return renderJson(data);
}