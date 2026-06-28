import type { StatusSummary } from "../../modules/status/types.js";

export function renderStatusCli(summary: StatusSummary): string {
  console.debug("[status:cli] rendering summary");
  return `Plans: ${summary.total}  Done: ${summary.done}  In progress: ${summary.inProgress}  Not started: ${summary.notStarted}`;
}