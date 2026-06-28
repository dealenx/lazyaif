import { BoxRenderable, TextRenderable } from "@opentui/core";
import type { CliRenderer } from "@opentui/core";
import { colors } from "./theme.js";

export function renderHeader(renderer: CliRenderer, projectPath: string): BoxRenderable {
  console.debug(`[tui:header] rendering projectPath=${projectPath}`);
  const box = new BoxRenderable(renderer, {
    id: "tui-header",
    width: "100%",
    height: 3,
    borderStyle: "rounded",
    borderColor: colors.border,
    title: "AI-Factory Plans",
    titleColor: colors.accent,
    flexDirection: "column",
    padding: 0,
  });
  const text = new TextRenderable(renderer, {
    id: "tui-header-path",
    content: projectPath,
    fg: colors.muted,
  });
  box.add(text);
  return box;
}