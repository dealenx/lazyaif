import { createTuiRenderer } from "../clients/tui/index.js";
import { createPlansTuiApp } from "../views/plans-viewer/tui-view.js";

export async function runTuiDashboard(rootDir: string) {
  console.debug(`[app:tui] starting dashboard rootDir=${rootDir}`);
  const renderer = await createTuiRenderer();

  const appHandle = await createPlansTuiApp(renderer, rootDir);

  renderer.keyInput.on("keypress", (key: { name: string }) => {
    if (key.name === "q" || key.name === "escape") {
      console.debug("[app:tui] shutting down");
      appHandle.destroy();
      renderer.destroy();
    }
  });
}