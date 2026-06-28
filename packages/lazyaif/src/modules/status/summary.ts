import { scanAiFactory, computeStatus } from "../plans-viewer/index.js";
import type { StatusSummary } from "./types.js";

export async function computeSummary(rootDir: string): Promise<StatusSummary> {
  console.debug(`[status:summary] computing for rootDir=${rootDir}`);
  const plans = await scanAiFactory(rootDir);
  const statuses = plans.map((p) => computeStatus(p));

  const summary: StatusSummary = {
    total: plans.length,
    done: statuses.filter((s) => s.state === "done").length,
    inProgress: statuses.filter((s) => s.state === "in-progress").length,
    notStarted: statuses.filter((s) => s.state === "not-started").length,
  };

  console.debug(`[status:summary] total=${summary.total} done=${summary.done} inProgress=${summary.inProgress} notStarted=${summary.notStarted}`);
  return summary;
}