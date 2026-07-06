import { describe, it, expect, afterEach } from "bun:test";
import { createCliRenderer } from "@opentui/core";
import type { CliRenderer } from "@opentui/core";
import { renderBackBar } from "../../../src/views/plans-viewer/tui-view.js";

let renderer: CliRenderer | null = null;

async function getRenderer(): Promise<CliRenderer> {
  renderer = await createCliRenderer({
    remote: true,
    useMouse: false,
    exitOnCtrlC: false,
    width: 120,
    height: 24,
  });
  return renderer;
}

afterEach(async () => {
  if (renderer) {
    try { renderer.destroy(); } catch { /* noop */ }
    renderer = null;
  }
});

describe("renderBackBar", () => {
  it("creates bar with correct id", async () => {
    const r = await getRenderer();
    const bar = renderBackBar(r, () => {}, () => {});
    expect(bar.id).toBe("detail-back-bar");
  });

  it("creates text renderable with correct id", async () => {
    const r = await getRenderer();
    const bar = renderBackBar(r, () => {}, () => {});
    const text = bar.findDescendantById("detail-back-bar-text");
    expect(text).toBeDefined();
  });

  it("returns a BoxRenderable", async () => {
    const r = await getRenderer();
    const bar = renderBackBar(r, () => {}, () => {});
    expect(bar).toBeDefined();
    expect(bar.id).toBe("detail-back-bar");
  });
});