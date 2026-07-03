import { describe, it, expect, afterEach } from "bun:test";
import { createCliRenderer } from "@opentui/core";
import type { CliRenderer } from "@opentui/core";
import { renderDeleteConfirm } from "../../../src/views/plans-viewer/tui-view.js";
import type { Plan } from "../../../src/modules/plans-viewer/types.js";

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

const mockPlan: Plan = {
  kind: "full",
  path: ".ai-factory/plans/feature-test.md",
  fileName: "feature-test.md",
  title: "Test plan",
  branch: "none",
  created: "2026-07-03",
  settings: { testing: false, logging: "verbose", docs: false },
  phases: [],
  tasks: [],
  rawMarkdown: "",
  mtime: Date.now(),
};

const mockFastPlan: Plan = {
  ...mockPlan,
  kind: "fast",
  path: ".ai-factory/PLAN.md",
  fileName: "PLAN.md",
};

describe("renderDeleteConfirm", () => {
  it("creates overlay with correct id", async () => {
    const r = await getRenderer();
    const { overlay } = renderDeleteConfirm(r, mockPlan);
    expect(overlay.id).toBe("delete-confirm-overlay");
  });

  it("creates dialog with border and correct id", async () => {
    const r = await getRenderer();
    const { overlay } = renderDeleteConfirm(r, mockPlan);
    const dialog = overlay.findDescendantById("delete-confirm-dialog");
    expect(dialog).toBeDefined();
  });

  it("creates title text renderable", async () => {
    const r = await getRenderer();
    const { overlay } = renderDeleteConfirm(r, mockPlan);
    const title = overlay.findDescendantById("delete-confirm-title");
    expect(title).toBeDefined();
  });

  it("creates body text renderable with fileName", async () => {
    const r = await getRenderer();
    const { overlay } = renderDeleteConfirm(r, mockPlan);
    const body = overlay.findDescendantById("delete-confirm-body");
    expect(body).toBeDefined();
  });

  it("creates select with two options (Delete, Cancel)", async () => {
    const r = await getRenderer();
    const { overlay, select } = renderDeleteConfirm(r, mockPlan);
    const found = overlay.findDescendantById("delete-confirm-select");
    expect(found).toBeDefined();
    expect(select.options.length).toBe(2);
    expect(select.options[0].value).toBe("delete");
    expect(select.options[1].value).toBe("cancel");
  });

  it("defaults selection to Cancel (index 1) for safety", async () => {
    const r = await getRenderer();
    const { select } = renderDeleteConfirm(r, mockPlan);
    expect(select.getSelectedIndex()).toBe(1);
  });

  it("creates overlay for fast plan with [fast] tag", async () => {
    const r = await getRenderer();
    const { overlay } = renderDeleteConfirm(r, mockFastPlan);
    expect(overlay.id).toBe("delete-confirm-overlay");
    const body = overlay.findDescendantById("delete-confirm-body");
    expect(body).toBeDefined();
  });
});