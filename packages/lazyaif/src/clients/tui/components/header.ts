import { Box, Text } from "@opentui/core";
import { colors } from "./theme.js";

export function renderHeader(projectPath: string) {
  console.debug(`[tui:header] rendering projectPath=${projectPath}`);
  return Box(
    {
      width: "100%",
      height: 3,
      borderStyle: "rounded",
      borderColor: colors.border,
      title: "AI-Factory Plans",
      titleColor: colors.accent,
      flexDirection: "column",
      padding: 0,
    },
    Text({ content: projectPath, fg: colors.muted }),
  );
}