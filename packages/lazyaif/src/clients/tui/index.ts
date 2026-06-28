import { createCliRenderer } from "@opentui/core";
import type { CliRenderer } from "@opentui/core";
import { colors } from "./components/theme.js";

export { renderHeader, renderFooter, colors } from "./components/index.js";

export async function createTuiRenderer(): Promise<CliRenderer> {
  console.debug("[tui] renderer created");
  return createCliRenderer({
    exitOnCtrlC: true,
    backgroundColor: colors.bg,
  });
}