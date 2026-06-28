import { BoxRenderable, TextRenderable } from "@opentui/core";
import type { CliRenderer } from "@opentui/core";
import { colors } from "./theme.js";
import { VERSION } from "../../../shared/version.js";

export function renderFooter(renderer: CliRenderer): BoxRenderable {
  console.debug(`[tui:footer] rendering version=${VERSION} hotkeys hint`);
  const box = new BoxRenderable(renderer, {
    id: "tui-footer",
    position: "absolute",
    bottom: 0,
    width: "100%",
    height: 1,
    backgroundColor: colors.bgAlt,
    flexDirection: "row",
    alignItems: "center",
  });

  const versionText = new TextRenderable(renderer, {
    id: "tui-footer-version",
    content: `v${VERSION}`,
    fg: colors.muted,
  });

  const leftSpacer = new BoxRenderable(renderer, {
    id: "tui-footer-left-spacer",
    flexGrow: 1,
    height: 1,
  });

  const hotkeysText = new TextRenderable(renderer, {
    id: "tui-footer-text",
    content: "Arrows/Enter: select · Mouse click: select · auto-refresh: 2s · q: quit",
    fg: colors.muted,
  });

  const rightSpacer = new BoxRenderable(renderer, {
    id: "tui-footer-right-spacer",
    flexGrow: 1,
    height: 1,
  });

  box.add(versionText);
  box.add(leftSpacer);
  box.add(hotkeysText);
  box.add(rightSpacer);
  return box;
}