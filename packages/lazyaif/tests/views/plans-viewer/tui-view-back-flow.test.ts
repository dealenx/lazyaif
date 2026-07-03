import { describe, it, expect, afterEach, beforeEach } from "bun:test";
import { createCliRenderer } from "@opentui/core";
import type { CliRenderer, KeyEvent } from "@opentui/core";
import { createPlansTuiApp } from "../../../src/views/plans-viewer/tui-view.js";
import { mkdtemp, mkdir, cp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

let renderer: CliRenderer | null = null;
let tmpRoot: string | null = null;

async function makeTmpRepo(): Promise<string> {
  const base = await mkdtemp(join(tmpdir(), "lazyaif-back-"));
  const plansDir = join(base, ".ai-factory", "plans");
  await mkdir(plansDir, { recursive: true });
  const fixture = join(import.meta.dir, "../../fixtures/full-plan-partial.md");
  await cp(fixture, join(plansDir, "feature-test.md"));
  tmpRoot = base;
  return base;
}

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

beforeEach(async () => {
  await makeTmpRepo();
});

afterEach(async () => {
  if (renderer) {
    try { renderer.destroy(); } catch { /* noop */ }
    renderer = null;
  }
  if (tmpRoot) {
    try { await rm(tmpRoot, { recursive: true, force: true }); } catch { /* noop */ }
    tmpRoot = null;
  }
});

function emitKey(r: CliRenderer, name: string, sequence: string): void {
  r.keyInput.emit("keypress", { name, ctrl: false, meta: false, shift: false, sequence, repeated: false, preventDefault: () => {}, stopPropagation: () => {} } as unknown as KeyEvent);
}

describe("createPlansTuiApp back bar flow", () => {
  it("shows back bar in detail mode", async () => {
    const r = await getRenderer();
    const root = tmpRoot!;
    const app = await createPlansTuiApp(r, root);

    emitKey(r, "return", "\r");
    await new Promise((resolve) => setTimeout(resolve, 200));

    const backBar = r.root.findDescendantById("detail-back-bar");
    expect(backBar).toBeDefined();

    const backBarText = r.root.findDescendantById("detail-back-bar-text");
    expect(backBarText).toBeDefined();

    app.destroy();
  });

  it("hides back bar when returning to list mode via escape", async () => {
    const r = await getRenderer();
    const root = tmpRoot!;
    const app = await createPlansTuiApp(r, root);

    emitKey(r, "return", "\r");
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(r.root.findDescendantById("detail-back-bar")).toBeDefined();

    emitKey(r, "escape", "\x1b");
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(r.root.findDescendantById("detail-back-bar")).toBeUndefined();
    expect(r.root.findDescendantById("plan-list")).toBeDefined();

    app.destroy();
  });

  it("hides back bar when returning to list mode via tab", async () => {
    const r = await getRenderer();
    const root = tmpRoot!;
    const app = await createPlansTuiApp(r, root);

    emitKey(r, "return", "\r");
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(r.root.findDescendantById("detail-back-bar")).toBeDefined();

    emitKey(r, "tab", "\t");
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(r.root.findDescendantById("detail-back-bar")).toBeUndefined();
    expect(r.root.findDescendantById("plan-list")).toBeDefined();

    app.destroy();
  });

  it("does not show back bar in list mode", async () => {
    const r = await getRenderer();
    const root = tmpRoot!;
    const app = await createPlansTuiApp(r, root);

    expect(r.root.findDescendantById("detail-back-bar")).toBeUndefined();
    expect(r.root.findDescendantById("plan-list")).toBeDefined();

    app.destroy();
  });
});