import {
  type CliRenderer,
  TextRenderable,
  ScrollBoxRenderable,
  t,
  bold,
  fg,
} from "@opentui/core";
import type { Plan } from "../../modules/plans-viewer/types.js";
import { colors } from "../../clients/tui/components/theme.js";

function shouldLog(): boolean {
  return process.env.DEBUG != null || process.env.LOG_LEVEL === "debug";
}
function debug(msg: string): void { if (shouldLog()) console.debug(msg); }

const BOX_DONE = "☑";
const BOX_TODO = "☐";

export function renderTaskList(
  renderer: CliRenderer,
  plan: Plan,
  id: string,
  width: number | "auto" | `${number}%` = "100%",
): ScrollBoxRenderable {
  debug(`[tui:task-list] rendering plan=${plan.fileName} tasks=${plan.tasks.length} id=${id} width=${width}`);

  const scroll = new ScrollBoxRenderable(renderer, {
    id,
    width,
    height: "100%",
    viewportCulling: true,
    rootOptions: { backgroundColor: colors.bg },
  });

  const titleText = new TextRenderable(renderer, {
    id: `${id}-title`,
    content: t`${bold(fg(colors.muted)(`Tasks (${plan.tasks.filter((t) => t.done).length}/${plan.tasks.length})`))}`,
    fg: colors.fg,
  });
  scroll.add(titleText);

  if (plan.tasks.length === 0) {
    debug(`[tui:task-list] empty plan=${plan.fileName} tasks=0`);
    const emptyText = new TextRenderable(renderer, {
      id: `${id}-empty`,
      content: "(no tasks)",
      fg: colors.muted,
    });
    scroll.add(emptyText);
    return scroll;
  }

  for (const task of plan.tasks) {
    const box = task.done ? BOX_DONE : BOX_TODO;
    const taskColor = task.done ? colors.done : colors.fg;
    const line = `${box} ${task.id}: ${task.title}`;
    const taskText = new TextRenderable(renderer, {
      id: `${id}-task-${task.id}`,
      content: t`${fg(taskColor)(line)}`,
      fg: colors.fg,
    });
    scroll.add(taskText);
  }

  return scroll;
}
