import type { Plan, PlanSettings, Phase, Task } from "./types.js";

const DEFAULT_SETTINGS: PlanSettings = {
  testing: false,
  logging: "verbose",
  docs: false,
};

function shouldLog(level: "debug" | "warn"): boolean {
  if (level === "debug") {
    return process.env.DEBUG != null || process.env.LOG_LEVEL === "debug";
  }
  return true;
}

function debug(msg: string): void {
  if (shouldLog("debug")) console.debug(msg);
}

function warn(msg: string): void {
  console.warn(msg);
}

const PHASE_RE = /^###\s+Phase\s+\d+:\s*(.+)$/;
const TASK_RE = /^-\s+\[([ xX])\]\s+Task\s+(\d+):\s*(.+)$/;
const TASK_BOLD_RE = /^-\s+\[([ xX])\]\s+\*\*Task\s+(\d+):\s*(.+)\*\*$/;
const TASK_BOLD_COLON_RE = /^-\s+\[([ xX])\]\s+\*\*Task\s+(\d+)\*\*:\s*(.+)$/;
const TASK_T_PREFIX_RE = /^-\s+\[([ xX])\]\s+\*\*T(\d+):\s*(.+)\*\*$/;
const TASK_T_PREFIX_COLON_RE = /^-\s+\[([ xX])\]\s+\*\*T(\d+)\*\*:\s*(.+)$/;
const TASK_HEADING_RE = /^#{4,6}\s+\[([ xX])\]\s+Task\s+(\d+):\s*(.+)$/;
const TASK_HEADING_BOLD_RE = /^#{4,6}\s+\[([ xX])\]\s+\*\*Task\s+(\d+):\s*(.+)\*\*$/;
const TASK_HEADING_BOLD_COLON_RE = /^#{4,6}\s+\[([ xX])\]\s+\*\*Task\s+(\d+)\*\*:\s*(.+)$/;
const TASK_HEADING_NOBOX_RE = /^#{4,6}\s+Task\s+(\d+):\s*(.+)$/;
const DEPENDS_RE = /\(depends\s+on\s+([\d\s,]+)\)/i;
const SETTINGS_TESTING_RE = /^-\s*Testing:\s*(yes|no)/i;
const SETTINGS_LOGGING_RE = /^-\s*Logging:\s*(verbose|standard|minimal)/i;
const SETTINGS_DOCS_RE = /^-\s*Docs:\s*(yes|no)/i;
const SETTINGS_TESTING_BOLD_RE = /^-\s*\*\*Testing:\*\*\s*(yes|no)/i;
const SETTINGS_LOGGING_BOLD_RE = /^-\s*\*\*Logging:\*\*\s*(verbose|standard|minimal)/i;
const SETTINGS_DOCS_BOLD_RE = /^-\s*\*\*Docs:\*\*\s*(yes|no|warn-only)/i;
const STATUS_BOLD_RE = /^-\s*\*\*Status:\*\*\s*(.+)$/i;
const MODE_BOLD_RE = /^\*\*Mode:\*\*\s*(.+)$/i;
const SEPARATOR_RE = /^-{3,}$/;

function parseDependsOn(title: string): number[] {
  const m = title.match(DEPENDS_RE);
  if (!m) return [];
  return m[1].split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n));
}

function stripTrailingDesc(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("—") || trimmed.startsWith("--")) return trimmed;
  return trimmed.split(/\s+—\s+|\s+--\s+/)[0].trim();
}

function stripDependsFromTitle(title: string): string {
  return title.replace(DEPENDS_RE, "").trim();
}

function isHeading(line: string): boolean {
  return /^#{1,6}\s/.test(line);
}

export function parsePlanFile(content: string, relativePath: string): Omit<Plan, "mtime"> {
  const kind = relativePath.endsWith("PLAN.md") ? "fast" : "full";
  const fileName = relativePath.split(/[/\\]/).pop() ?? relativePath;
  debug(`[parser] parsing file=${relativePath} kind=${kind}`);

  const lines = content.split(/\r?\n/);
  let title = "";
  let branch = "none";
  let created = "";
  let status: string | undefined;
  let mode: string | undefined;
  const settings: PlanSettings = { ...DEFAULT_SETTINGS };
  const phases: Phase[] = [];
  const allTasks: Task[] = [];

  let currentPhase: Phase | null = null;
  let currentTask: Task | null = null;
  let inSettings = false;
  let inTaskBody = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/^#\s+Implementation Plan:\s*(.+)$/i.test(line)) {
      title = line.replace(/^#\s+Implementation Plan:\s*/i, "").trim();
      inSettings = false;
      inTaskBody = false;
      continue;
    }
    if (/^#\s+Plan:\s*(.+)$/i.test(line)) {
      title = line.replace(/^#\s+Plan:\s*/i, "").trim();
      inSettings = false;
      inTaskBody = false;
      continue;
    }
    const branchMatch = line.match(/^Branch:\s*(.+)$/i) ?? line.match(/^-\s*\*\*Branch:\*\*\s*(.+)$/i) ?? line.match(/^\*\*Branch:\*\*\s*(.+)$/i);
    if (branchMatch) {
      branch = stripTrailingDesc(branchMatch[1]);
      continue;
    }
    const createdMatch = line.match(/^Created:\s*(.+)$/i) ?? line.match(/^-\s*\*\*Created:\*\*\s*(.+)$/i) ?? line.match(/^\*\*Created:\*\*\s*(.+)$/i);
    if (createdMatch) {
      created = stripTrailingDesc(createdMatch[1]);
      continue;
    }
    const statusMatch = line.match(STATUS_BOLD_RE);
    if (statusMatch) {
      status = statusMatch[1].trim();
      continue;
    }
    const modeMatch = line.match(MODE_BOLD_RE);
    if (modeMatch) {
      mode = modeMatch[1].trim();
      continue;
    }
    if (SEPARATOR_RE.test(line.trim())) {
      continue;
    }
    if (/^##\s+Settings/i.test(line)) {
      inSettings = true;
      inTaskBody = false;
      continue;
    }
    if (inSettings) {
      let m: RegExpMatchArray | null;
      if ((m = line.match(SETTINGS_TESTING_BOLD_RE) ?? line.match(SETTINGS_TESTING_RE))) {
        settings.testing = m[1].toLowerCase() === "yes";
        continue;
      }
      if ((m = line.match(SETTINGS_LOGGING_BOLD_RE) ?? line.match(SETTINGS_LOGGING_RE))) {
        settings.logging = m[1].toLowerCase() as PlanSettings["logging"];
        continue;
      }
      if ((m = line.match(SETTINGS_DOCS_BOLD_RE) ?? line.match(SETTINGS_DOCS_RE))) {
        const raw = m[1].toLowerCase();
        if (raw === "warn-only") {
          settings.docs = false;
          settings.docsMode = "warn-only";
        } else {
          settings.docs = raw === "yes";
        }
        continue;
      }
      if (/^##\s/.test(line) || /^###\s/.test(line)) inSettings = false;
    }

    const phaseMatch = line.match(PHASE_RE);
    if (phaseMatch) {
      if (currentTask) {
        allTasks.push(currentTask);
        if (currentPhase) currentPhase.tasks.push(currentTask);
        currentTask = null;
      }
      currentPhase = { name: phaseMatch[1].trim(), tasks: [] };
      phases.push(currentPhase);
      inTaskBody = false;
      continue;
    }

    const taskMatch = line.match(TASK_BOLD_RE) ?? line.match(TASK_BOLD_COLON_RE) ?? line.match(TASK_T_PREFIX_RE) ?? line.match(TASK_T_PREFIX_COLON_RE) ?? line.match(TASK_RE) ?? line.match(TASK_HEADING_BOLD_RE) ?? line.match(TASK_HEADING_BOLD_COLON_RE) ?? line.match(TASK_HEADING_RE);
    if (taskMatch) {
      if (currentTask) {
        allTasks.push(currentTask);
        if (currentPhase) currentPhase.tasks.push(currentTask);
      }
      const id = parseInt(taskMatch[2], 10);
      const dependsOn = parseDependsOn(taskMatch[3]);
      const taskTitle = stripDependsFromTitle(taskMatch[3]);
      currentTask = {
        id,
        title: taskTitle,
        done: taskMatch[1].toLowerCase() === "x",
        phase: currentPhase?.name ?? "",
        description: "",
        dependsOn,
      };
      inTaskBody = true;
      continue;
    }

    const taskHeadingNoBox = line.match(TASK_HEADING_NOBOX_RE);
    if (taskHeadingNoBox) {
      if (currentTask) {
        allTasks.push(currentTask);
        if (currentPhase) currentPhase.tasks.push(currentTask);
      }
      const id = parseInt(taskHeadingNoBox[1], 10);
      const dependsOn = parseDependsOn(taskHeadingNoBox[2]);
      const taskTitle = stripDependsFromTitle(taskHeadingNoBox[2]);
      currentTask = {
        id,
        title: taskTitle,
        done: false,
        phase: currentPhase?.name ?? "",
        description: "",
        dependsOn,
      };
      inTaskBody = true;
      continue;
    }

    if (inTaskBody && currentTask && !isHeading(line)) {
      if (line.trim() === "" && currentTask.description === "") continue;
      currentTask.description += (currentTask.description ? "\n" : "") + line;
      continue;
    }

    if (line.trim() && !isHeading(line) && !line.startsWith("-")) {
      if (i < 5 && !title) warn(`[parser] unrecognized line ${i + 1}: ${line}`);
    }
  }

  if (currentTask) {
    allTasks.push(currentTask);
    if (currentPhase) currentPhase.tasks.push(currentTask);
  }
  for (const t of allTasks) t.description = t.description.trimEnd();

  debug(`[parser] found phases=${phases.length} tasks=${allTasks.length} status=${status ?? "none"}`);

  return { kind, path: relativePath, fileName, title, branch, created, status, mode, settings, phases, tasks: allTasks, rawMarkdown: content };
}