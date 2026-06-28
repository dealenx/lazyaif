import type { Plan, PlanStatus } from "../../modules/plans-viewer/types.js";
import { statusIcon, formatTaskProgress, formatPercent } from "../../modules/plans-viewer/format.js";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stateBadge(state: PlanStatus["state"]): string {
  const badgeColors: Record<PlanStatus["state"], string> = {
    done: "#3FB950",
    "in-progress": "#D29922",
    "not-started": "#F85149",
  };
  const c = badgeColors[state];
  const icon = statusIcon(state);
  return `<span class="badge" style="background:${c}">${icon} ${state}</span>`;
}

export function renderPlansHtml(plans: Plan[], statuses: PlanStatus[], projectPath: string): string {
  console.debug(`[web:template] rendering report plans=${plans.length} projectPath=${projectPath}`);

  const rows = plans
    .map((plan, i) => {
      const st = statuses[i];
      const progress = formatTaskProgress(st.done, st.total);
      const pct = formatPercent(st.pct);
      const badge = stateBadge(st.state);

      const taskBlocks = plan.phases
        .map(
          (phase) => `
        <div class="phase">
          <div class="phase-name">${escapeHtml(phase.name)}</div>
          ${phase.tasks
            .map((task) => {
              const check = task.done ? "✅" : "⬜";
              const desc = task.description
                ? `<pre class="task-desc">${escapeHtml(task.description)}</pre>`
                : "";
              const deps =
                task.dependsOn.length > 0
                  ? `<div class="task-deps">depends on: ${task.dependsOn.join(", ")}</div>`
                  : "";
              return `<div class="task">
              <div class="task-title">${check} ${escapeHtml(task.title)}</div>
              ${desc}
              ${deps}
            </div>`;
            })
            .join("")}
        </div>`,
        )
        .join("");

      return `<tr>
        <td><details><summary>${escapeHtml(plan.fileName)}</summary>
          <div class="plan-detail">
            <div class="meta">Title: ${escapeHtml(plan.title)} · Branch: ${escapeHtml(plan.branch)} · Created: ${escapeHtml(plan.created)}</div>
            <div class="meta">Settings: testing=${plan.settings.testing}, logging=${plan.settings.logging}, docs=${plan.settings.docs}</div>
            ${taskBlocks}
          </div>
        </details></td>
        <td>${plan.kind}</td>
        <td>${progress}</td>
        <td>${pct}</td>
        <td>${badge}</td>
      </tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>AI-Factory Plans — ${escapeHtml(projectPath)}</title>
<style>
  body { background:#0D1117; color:#E6EDF3; font-family:-apple-system,system-ui,sans-serif; margin:2rem; }
  h1 { color:#58A6FF; font-size:1.4rem; }
  .project { color:#8B949E; margin-bottom:1.5rem; }
  table { border-collapse:collapse; width:100%; }
  th, td { padding:0.5rem 0.75rem; text-align:left; border-bottom:1px solid #30363D; vertical-align:top; }
  th { color:#58A6FF; font-size:0.85rem; text-transform:uppercase; }
  .badge { color:#fff; padding:2px 8px; border-radius:4px; font-size:0.8rem; }
  details summary { cursor:pointer; color:#58A6FF; }
  .plan-detail { padding:0.5rem 0; }
  .meta { color:#8B949E; font-size:0.85rem; margin:2px 0; }
  .phase { margin:0.75rem 0; padding-left:0.5rem; border-left:2px solid #30363D; }
  .phase-name { color:#58A6FF; font-weight:bold; margin-bottom:0.25rem; }
  .task { margin:0.25rem 0; padding:0.25rem 0; }
  .task-title { color:#E6EDF3; }
  .task-desc { color:#8B949E; background:#161B22; padding:0.5rem; border-radius:4px; font-size:0.85rem; white-space:pre-wrap; margin:4px 0; }
  .task-deps { color:#8B949E; font-size:0.8rem; }
</style>
</head>
<body>
  <h1>AI-Factory Plans</h1>
  <div class="project">${escapeHtml(projectPath)}</div>
  <table>
    <thead><tr><th>Plan</th><th>Type</th><th>Done</th><th>Pct</th><th>State</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
}