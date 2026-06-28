import type { PlanState } from "./types.js";

export function statusIcon(state: PlanState): string {
  switch (state) {
    case "done": return "✅";
    case "in-progress": return "⏳";
    case "not-started": return "❌";
  }
}

export function formatPercent(pct: number): string {
  return `${pct}%`;
}

export function formatTaskProgress(done: number, total: number): string {
  return `${done}/${total}`;
}