import { Box, Text, t, bold, fg } from "@opentui/core";
import type { StatusSummary } from "../../modules/status/types.js";
import { colors } from "../../clients/tui/components/index.js";

export function renderStatusTui(summary: StatusSummary) {
  console.debug("[status:tui] rendering summary");
  return Box(
    {
      width: "100%",
      height: 5,
      borderStyle: "rounded",
      borderColor: colors.border,
      title: "Status",
      titleColor: colors.accent,
      flexDirection: "column",
      padding: 1,
      gap: 0,
    },
    Text({ content: t`${bold(fg(colors.accent)("Plans:"))} ${fg(colors.fg)(String(summary.total))}` }),
    Text({ content: t`${bold(fg(colors.done)("Done:"))} ${fg(colors.done)(String(summary.done))}` }),
    Text({ content: t`${bold(fg(colors.progress)("In progress:"))} ${fg(colors.progress)(String(summary.inProgress))}` }),
    Text({ content: t`${bold(fg(colors.notStarted)("Not started:"))} ${fg(colors.notStarted)(String(summary.notStarted))}` }),
  );
}