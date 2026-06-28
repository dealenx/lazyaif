import { Box, Text } from "@opentui/core";
import { colors } from "./theme.js";

export function renderFooter() {
  console.debug("[tui:footer] rendering hotkeys hint");
  return Box(
    {
      position: "absolute",
      bottom: 0,
      width: "100%",
      height: 1,
      backgroundColor: colors.bgAlt,
      flexDirection: "row",
      justifyContent: "center",
    },
    Text({ content: "↑↓ select · Enter expand · q quit", fg: colors.muted }),
  );
}