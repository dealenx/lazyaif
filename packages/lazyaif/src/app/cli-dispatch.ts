import { scanAiFactory, computeStatus } from "../modules/plans-viewer/index.js";
import { renderPlansTable, renderPlansJson } from "../views/plans-viewer/cli-view.js";
import { computeSummary } from "../modules/status/index.js";
import { renderStatusCli } from "../views/status/cli-view.js";

export async function runPlansCli(rootDir: string, json: boolean) {
  console.debug(`[app:cli] plans rootDir=${rootDir} json=${json}`);
  const plans = await scanAiFactory(rootDir);
  const statuses = plans.map((p) => computeStatus(p));
  const out = json ? renderPlansJson(plans, statuses) : renderPlansTable(plans, statuses);
  process.stdout.write(out + "\n");
}

export async function runStatusCli(rootDir: string) {
  console.debug(`[app:cli] status rootDir=${rootDir}`);
  const summary = await computeSummary(rootDir);
  const out = renderStatusCli(summary);
  process.stdout.write(out + "\n");
}