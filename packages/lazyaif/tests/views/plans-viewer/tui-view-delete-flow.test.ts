import { describe, it, expect, afterEach, beforeEach } from "bun:test";
import { createCliRenderer } from "@opentui/core";
import type { CliRenderer, KeyEvent } from "@opentui/core";
import { createPlansTuiApp } from "../../../src/views/plans-viewer/tui-view.js";
import { mkdtemp, mkdir, cp, rm, access } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

let renderer: CliRenderer | null = null;
let tmpRoot: string | null = null;

async function makeTmpRepo(): Promise<string> {
  const base = await mkdtemp(join(tmpdir(), "lazyaif-del-"));
  const aiFactory = join(base, ".ai-factory");
  const plansDir = join(aiFactory, "plans");
  await mkdir(plansDir, { recursive: true });
  const fixture1 = join(import.meta.dir, "../../fixtures/full-plan-partial.md");
  const fixture2 = join(import.meta.dir, "../../fixtures/full-plan-done.md");
  await cp(fixture1, join(plansDir, "feature-test.md"));
  await cp(fixture2, join(plansDir, "feature-done.md"));
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

async function pathExists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

function emitKey(r: CliRenderer, name: string, sequence: string): void {
  r.keyInput.emit("keypress", { name, ctrl: false, meta: false, shift: false, sequence, repeated: false, preventDefault: () => {}, stopPropagation: () => {} } as unknown as KeyEvent);
}

describe("createPlansTuiApp delete flow", () => {
  it("shows delete confirm overlay when d key is pressed", async () => {
    const r = await getRenderer();
    const root = tmpRoot!;
    const app = await createPlansTuiApp(r, root);

    emitKey(r, "d", "d");

    const overlay = r.root.findDescendantById("delete-confirm-overlay");
    expect(overlay).toBeDefined();

    app.destroy();
  });

  it("hides overlay when n key is pressed", async () => {
    const r = await getRenderer();
    const root = tmpRoot!;
    const app = await createPlansTuiApp(r, root);

    emitKey(r, "d", "d");
    expect(r.root.findDescendantById("delete-confirm-overlay")).toBeDefined();

    emitKey(r, "n", "n");
    expect(r.root.findDescendantById("delete-confirm-overlay")).toBeUndefined();

    app.destroy();
  });

  it("deletes the plan file when y key is pressed", async () => {
    const r = await getRenderer();
    const root = tmpRoot!;
    const app = await createPlansTuiApp(r, root);

    const plansDir = join(root, ".ai-factory", "plans");
    const targetFile = join(plansDir, "feature-test.md");
    expect(await pathExists(targetFile)).toBe(true);

    emitKey(r, "d", "d");
    emitKey(r, "y", "y");

    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(await pathExists(targetFile)).toBe(false);

    app.destroy();
  });

  it("hides overlay after delete is confirmed", async () => {
    const r = await getRenderer();
    const root = tmpRoot!;
    const app = await createPlansTuiApp(r, root);

    emitKey(r, "d", "d");
    expect(r.root.findDescendantById("delete-confirm-overlay")).toBeDefined();

    emitKey(r, "y", "y");

    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(r.root.findDescendantById("delete-confirm-overlay")).toBeUndefined();

    app.destroy();
  });

  it("does not delete file when overlay is cancelled with escape", async () => {
    const r = await getRenderer();
    const root = tmpRoot!;
    const app = await createPlansTuiApp(r, root);

    const plansDir = join(root, ".ai-factory", "plans");
    const targetFile = join(plansDir, "feature-test.md");

    emitKey(r, "d", "d");
    emitKey(r, "escape", "\x1b");

    expect(await pathExists(targetFile)).toBe(true);
    expect(r.root.findDescendantById("delete-confirm-overlay")).toBeUndefined();

    app.destroy();
  });
});