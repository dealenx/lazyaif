import { describe, it, expect, afterEach, beforeEach } from "bun:test";
import { createCliRenderer } from "@opentui/core";
import type { CliRenderer } from "@opentui/core";
import { createPlansTuiApp } from "../../../src/views/plans-viewer/tui-view.js";
import { mkdtemp, mkdir, cp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

let renderer: CliRenderer | null = null;
let tmpRoot: string | null = null;

async function makeTmpRepo(): Promise<string> {
  const base = await mkdtemp(join(tmpdir(), "lazyaif-resp-"));
  const aiFactory = join(base, ".ai-factory");
  const plansDir = join(aiFactory, "plans");
  await mkdir(plansDir, { recursive: true });
  const fixture = join(import.meta.dir, "../../fixtures/full-plan-partial.md");
  await cp(fixture, join(plansDir, "feature-test.md"));
  tmpRoot = base;
  return base;
}

async function getRenderer(width: number, height: number): Promise<CliRenderer> {
  renderer = await createCliRenderer({
    remote: true,
    useMouse: false,
    exitOnCtrlC: false,
    width,
    height,
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

describe("createPlansTuiApp (responsive)", () => {
  it("hides task-list panel when width < 100", async () => {
    const r = await getRenderer(80, 24);
    const root = tmpRoot!;
    const app = await createPlansTuiApp(r, root);
    const bodyRow = r.root.getRenderable("tui-root")?.getRenderable("tui-body-row");
    expect(bodyRow).toBeDefined();
    const taskList = bodyRow!.getRenderable("task-list-0");
    expect(taskList).toBeUndefined();
    app.destroy();
  });

  it("shows task-list panel when width >= 100", async () => {
    const r = await getRenderer(120, 24);
    const root = tmpRoot!;
    const app = await createPlansTuiApp(r, root);
    const bodyRow = r.root.getRenderable("tui-root")?.getRenderable("tui-body-row");
    expect(bodyRow).toBeDefined();
    const taskList = bodyRow!.getRenderable("task-list-0");
    expect(taskList).toBeDefined();
    app.destroy();
  });

  it("task-list panel contains tasks from the selected plan", async () => {
    const r = await getRenderer(120, 24);
    const root = tmpRoot!;
    const app = await createPlansTuiApp(r, root);
    const bodyRow = r.root.getRenderable("tui-root")?.getRenderable("tui-body-row");
    const taskList = bodyRow!.getRenderable("task-list-0");
    expect(taskList).toBeDefined();
    const title = (taskList as { content?: { getRenderable: (id: string) => unknown } }).content?.getRenderable("task-list-0-title");
    expect(title).toBeDefined();
    app.destroy();
  });
});