import { readFile, readdir, access } from "node:fs/promises";
import { join, sep } from "node:path";
import { parsePlanFile } from "./parser.js";
import type { Plan } from "./types.js";

function shouldLog(level: "debug" | "warn"): boolean {
  if (level === "debug") return process.env.DEBUG != null || process.env.LOG_LEVEL === "debug";
  return true;
}

function debug(msg: string): void { if (shouldLog("debug")) console.debug(msg); }
function warn(msg: string): void { console.warn(msg); }

async function pathExists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

export async function scanAiFactory(rootDir: string): Promise<Plan[]> {
  debug(`[scanner] scanning rootDir=${rootDir}`);
  const aiFactoryDir = join(rootDir, ".ai-factory");
  const plans: Plan[] = [];

  if (!(await pathExists(aiFactoryDir))) {
    warn(`[scanner] no .ai-factory directory at ${rootDir}`);
    return [];
  }

  const fastPath = join(aiFactoryDir, "PLAN.md");
  if (await pathExists(fastPath)) {
    try {
      const content = await readFile(fastPath, "utf-8");
      const relPath = ["", ".ai-factory", "PLAN.md"].join(sep);
      plans.push(parsePlanFile(content, relPath));
    } catch (e) { warn(`[scanner] failed to read PLAN.md: ${e}`); }
  }

  const plansDir = join(aiFactoryDir, "plans");
  if (await pathExists(plansDir)) {
    try {
      const entries = await readdir(plansDir);
      const mdFiles = entries.filter((f) => f.endsWith(".md")).sort();
      for (const f of mdFiles) {
        try {
          const fullPath = join(plansDir, f);
          const content = await readFile(fullPath, "utf-8");
          const relPath = ["", ".ai-factory", "plans", f].join(sep);
          plans.push(parsePlanFile(content, relPath));
        } catch (e) { warn(`[scanner] failed to read ${f}: ${e}`); }
      }
    } catch (e) { warn(`[scanner] failed to read plans dir: ${e}`); }
  }

  const fastCount = plans.filter((p) => p.kind === "fast").length;
  const fullCount = plans.filter((p) => p.kind === "full").length;
  debug(`[scanner] found plans: fast=${fastCount} full=${fullCount}`);
  return plans;
}