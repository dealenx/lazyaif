import { createTuiRenderer } from "../clients/tui/index.js";
import { createPlansTuiApp } from "../views/plans-viewer/tui-view.js";

export async function runTuiDashboard(rootDir: string) {
  console.debug(`[app:tui] starting dashboard rootDir=${rootDir}`);
  const renderer = await createTuiRenderer();
  await createPlansTuiApp(renderer, rootDir);
}