import { describe, it, expect, afterEach } from "bun:test";
import { createCliRenderer } from "@opentui/core";
import type { CliRenderer } from "@opentui/core";
import { renderFooter, HOTKEYS_LIST } from "../../../../src/clients/tui/components/footer.js";
import { VERSION } from "../../../../src/shared/version.js";

type Chunk = { text?: string };
type StyledLike = { chunks?: Chunk[] };

function textOf(node: unknown): string {
  const content = (node as { content?: unknown }).content;
  if (typeof content === "string") return content;
  const chunks = (content as StyledLike | undefined)?.chunks ?? (node as StyledLike).chunks;
  if (chunks && chunks.length > 0) return chunks.map((c) => c.text ?? "").join("");
  return String(content ?? node);
}

let renderer: CliRenderer | null = null;

async function getRenderer(): Promise<CliRenderer> {
  renderer = await createCliRenderer({
    remote: true,
    useMouse: false,
    exitOnCtrlC: false,
  });
  return renderer;
}

afterEach(async () => {
  if (renderer) {
    renderer.destroy();
    renderer = null;
  }
});

describe("renderFooter", () => {
  it("returns a footer box with id tui-footer", async () => {
    const r = await getRenderer();
    const box = renderFooter(r);
    expect(box.id).toBe("tui-footer");
  });

  it("places the version text on the left", async () => {
    const r = await getRenderer();
    const box = renderFooter(r);
    const version = box.getRenderable("tui-footer-version");
    expect(version).toBeDefined();
    expect(textOf(version)).toBe(`v${VERSION}`);
  });

  it("places the hotkeys text in the middle", async () => {
    const r = await getRenderer();
    const box = renderFooter(r);
    const hotkeys = box.getRenderable("tui-footer-text");
    expect(hotkeys).toBeDefined();
    expect(textOf(hotkeys)).toBe(HOTKEYS_LIST);
  });

  it("includes spacers to center the hotkeys", async () => {
    const r = await getRenderer();
    const box = renderFooter(r);
    expect(box.getRenderable("tui-footer-left-spacer")).toBeDefined();
    expect(box.getRenderable("tui-footer-right-spacer")).toBeDefined();
  });

  it("renders four children in order: version, left spacer, hotkeys, right spacer", async () => {
    const r = await getRenderer();
    const box = renderFooter(r);
    const children = box.getChildren().map((c) => c.id);
    expect(children).toEqual([
      "tui-footer-version",
      "tui-footer-left-spacer",
      "tui-footer-text",
      "tui-footer-right-spacer",
    ]);
  });
});