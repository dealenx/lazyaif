import { readFile, readdir, access, stat } from "node:fs/promises";
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

const FAST_PLAN_FILES = ["PLAN.md", "FIX_PLAN.md"] as const;

export async function scanAiFactory(rootDir: string): Promise<Plan[]> {
  debug(`[scanner] scanning rootDir=${rootDir}`);
  const aiFactoryDir = join(rootDir, ".ai-factory");
  const plans: Plan[] = [];

  if (!(await pathExists(aiFactoryDir))) {
    warn(`[scanner] no .ai-factory directory at ${rootDir}`);
    return [];
  }

  for (const fileName of FAST_PLAN_FILES) {
    const fastPath = join(aiFactoryDir, fileName);
    if (!(await pathExists(fastPath))) continue;
    try {
      const content = await readFile(fastPath, "utf-8");
      const relPath = ["", ".ai-factory", fileName].join(sep);
      const mtime = await readMtimeMs(fastPath);
      debug(`[scanner] mtime=${relPath}=${mtime}`);
      plans.push({ ...parsePlanFile(content, relPath), mtime });
    } catch (e) { warn(`[scanner] failed to read ${fileName}: ${e}`); }
  }

  const plansDir = join(aiFactoryDir, "plans");
  if (await pathExists(plansDir)) {
    try {
      const entries = await readdir(plansDir);
      const mdFiles = entries.filter((f) => f.endsWith(".md"));
      debug(`[scanner] sort removed, caller sorts; files=${mdFiles.length}`);
      for (const f of mdFiles) {
        try {
          const fullPath = join(plansDir, f);
          const content = await readFile(fullPath, "utf-8");
          const relPath = ["", ".ai-factory", "plans", f].join(sep);
          const mtime = await readMtimeMs(fullPath);
          debug(`[scanner] mtime=${relPath}=${mtime}`);
          plans.push({ ...parsePlanFile(content, relPath), mtime });
        } catch (e) { warn(`[scanner] failed to read ${f}: ${e}`); }
      }
    } catch (e) { warn(`[scanner] failed to read plans dir: ${e}`); }
  }

  const fastCount = plans.filter((p) => p.kind === "fast").length;
  const fullCount = plans.filter((p) => p.kind === "full").length;
  debug(`[scanner] found plans: fast=${fastCount} full=${fullCount}`);
  return plans;
}

async function readMtimeMs(p: string): Promise<number> {
  try {
    const s = await stat(p);
    return s.mtimeMs;
  } catch (e) {
    warn(`[scanner] stat failed for ${p}: ${e}`);
    return 0;
  }
}