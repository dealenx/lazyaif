import { Command } from "commander";

const program = new Command();

program
  .name("lazyaif")
  .description("Analyze ai-factory plan statuses")
  .version("0.1.0")
  .option("-p, --path <dir>", "Project root to scan", process.cwd())
  .action(async (options: { path: string }) => {
    console.debug(`[bin] mode=tui (default) args=${JSON.stringify(options)}`);
    const { runTuiDashboard } = await import("../src/app/tui-dashboard.js");
    await runTuiDashboard(options.path);
  });

program
  .command("tui")
  .description("Interactive TUI viewer (requires Node >=26.3 --experimental-ffi or bun)")
  .option("-p, --path <dir>", "Project root to scan", process.cwd())
  .action(async (options: { path: string }) => {
    console.debug(`[bin] mode=tui args=${JSON.stringify(options)}`);
    const { runTuiDashboard } = await import("../src/app/tui-dashboard.js");
    await runTuiDashboard(options.path);
  });

program
  .command("plans")
  .alias("p")
  .description("Print plan statuses to stdout as table or JSON")
  .option("--json", "Output as JSON")
  .option("-p, --path <dir>", "Project root to scan", process.cwd())
  .action(async (options: { json: boolean; path: string }) => {
    console.debug(`[bin] mode=plans args=${JSON.stringify(options)}`);
    const { runPlansCli } = await import("../src/app/cli-dispatch.js");
    await runPlansCli(options.path, options.json);
  });

program
  .command("status")
  .description("Show brief summary: total plans, done, in-progress, not-started")
  .option("-p, --path <dir>", "Project root to scan", process.cwd())
  .action(async (options: { path: string }) => {
    console.debug(`[bin] mode=status args=${JSON.stringify(options)}`);
    const { runStatusCli } = await import("../src/app/cli-dispatch.js");
    await runStatusCli(options.path);
  });

program.parseAsync(process.argv).catch((e) => {
  console.error("[bin] fatal:", e);
  process.exit(1);
});