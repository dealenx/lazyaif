#!/usr/bin/env bun
import { Command } from "commander";
import { existsSync, readFileSync, unlinkSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, basename } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

function resolveVersion(): string {
  if (process.env.LAZYAIF_VERSION) return process.env.LAZYAIF_VERSION;
  const candidates = [
    join(__dirname, "package.json"),
    join(__dirname, "..", "package.json"),
    join(__dirname, "..", "..", "package.json"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        const pkg = JSON.parse(readFileSync(p, "utf-8")) as { version?: string };
        if (pkg.version) return pkg.version;
      } catch {
        continue;
      }
    }
  }
  return "0.0.0-unknown";
}

const program = new Command();

program
  .name("lazyaif")
  .description("Analyze ai-factory plan statuses")
  .version(resolveVersion())
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

program
  .command("uninstall")
  .description("Remove the installed lazyaif binary")
  .action(async () => {
    console.debug("[bin] mode=uninstall");
    const execPath = process.execPath;
    const execName = basename(execPath);
    const isWindows = process.platform === "win32";
    const expectedName = isWindows ? "lazyaif.exe" : "lazyaif";

    console.debug(`[uninstall] execPath=${execPath}`);
    console.debug(`[uninstall] execName=${execName}`);
    console.debug(`[uninstall] platform=${process.platform}`);

    if (execName.toLowerCase() !== expectedName.toLowerCase()) {
      console.error(`[uninstall:error] not running from an installed binary.`);
      console.error(`[uninstall:error] current exec: ${execPath}`);
      console.error(`[uninstall:error] expected name: ${expectedName}`);
      console.error(`[uninstall:error] run this command from the installed lazyaif binary.`);
      process.exit(1);
    }

    if (!existsSync(execPath)) {
      console.error(`[uninstall:error] binary not found at ${execPath}`);
      process.exit(1);
    }

    console.log(`[uninstall] removing ${execPath}`);
    try {
      if (isWindows) {
        // On Windows, the running exe file is locked and cannot be deleted
        // while the process is alive. Use `start` (fire-and-forget) via cmd.exe
        // to launch a detached PowerShell that waits, then deletes.
        const { spawn } = await import("node:child_process");
        console.log("[uninstall] scheduling deletion (Windows locks running exe)...");
        console.log("[uninstall] the file will be removed shortly after this process exits.");
        const psScript = `Start-Sleep -Seconds 3; Remove-Item -LiteralPath '${execPath}' -Force -ErrorAction SilentlyContinue`;
        spawn("cmd.exe", ["/c", "start", "", "/b", "powershell", "-NoProfile", "-Command", psScript], {
          detached: true,
          stdio: "ignore",
          shell: false,
        }).unref();
        console.log(`[uninstall] scheduled. You may also delete manually: Remove-Item "${execPath}"`);
      } else {
        unlinkSync(execPath);
        console.log("[uninstall] removed.");
      }
    } catch (e) {
      console.error(`[uninstall:error] failed to remove binary: ${e}`);
      process.exit(1);
    }

    const installDir = dirname(execPath);
    console.log("");
    console.log("[uninstall] lazyaif has been uninstalled.");
    console.log(`[uninstall] install dir was: ${installDir}`);
    console.log("");
    console.log("[uninstall] if you added the install dir to PATH, remove it:");
    if (isWindows) {
      console.log(`  [Environment]::SetEnvironmentVariable('PATH', `);
      console.log(`    ($([Environment]::GetEnvironmentVariable('PATH','User') -split ';' | Where-Object { $_ -ne '${installDir}' }) -join ';'), 'User')`);
    } else {
      console.log(`  Remove '${installDir}' from your ~/.bashrc or ~/.zshrc PATH line.`);
    }
  });

program.parseAsync(process.argv).catch((e) => {
  console.error("[bin] fatal:", e);
  process.exit(1);
});