import { describe, it, expect, afterEach, beforeEach } from "bun:test";
import { createCliRenderer } from "@opentui/core";
import type { CliRenderer, KeyEvent } from "@opentui/core";
import { createPlansTuiApp } from "../../../src/views/plans-viewer/tui-view.js";
import { mkdtemp, mkdir, cp, rm, readFile, writeFile, utimes } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

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
let tmpRoot: string | null = null;

async function makeTmpRepo(): Promise<string> {
  const base = await mkdtemp(join(tmpdir(), "lazyaif-refresh-"));
  const aiFactory = join(base, ".ai-factory");
  const plansDir = join(aiFactory, "plans");
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

function debug(msg: string): void {
  if (process.env.DEBUG != null || process.env.LOG_LEVEL === "debug") console.debug(msg);
}

describe("createPlansTuiApp detail refresh", () => {
  it("refreshes detail view when plan file is modified on disk", async () => {
    const r = await getRenderer();
    const root = tmpRoot!;
    const app = await createPlansTuiApp(r, root);

    emitKey(r, "return", "\r");
    await new Promise((resolve) => setTimeout(resolve, 200));

    const statusBefore = r.root.findDescendantById("plan-detail-0-status");
    expect(statusBefore).toBeDefined();
    const statusTextBefore = textOf(statusBefore);
    debug(`[test:refresh] status text before: ${statusTextBefore}`);
    expect(statusTextBefore).toContain("2/4");

    const planFile = join(root, ".ai-factory", "plans", "feature-test.md");
    const content = await readFile(planFile, "utf-8");
    const updated = content.replace("- [ ] Task 3:", "- [x] Task 3:");
    await writeFile(planFile, updated);
    const now = new Date();
    await utimes(planFile, now, now);

    await new Promise((resolve) => setTimeout(resolve, 3000));

    const statusAfter = r.root.findDescendantById("plan-detail-0-r1-status");
    expect(statusAfter).toBeDefined();
    const statusTextAfter = textOf(statusAfter);
    debug(`[test:refresh] status text after: ${statusTextAfter}`);
    expect(statusTextAfter).toContain("3/4");

    app.destroy();
  });

  it("replaces old detail renderable with a new one after file change", async () => {
    const r = await getRenderer();
    const root = tmpRoot!;
    const app = await createPlansTuiApp(r, root);

    emitKey(r, "return", "\r");
    await new Promise((resolve) => setTimeout(resolve, 200));

    const detailBefore = r.root.findDescendantById("plan-detail-0");
    expect(detailBefore).toBeDefined();
    const oldDetailAfterRefresh = r.root.findDescendantById("plan-detail-0");
    expect(oldDetailAfterRefresh).toBeDefined();

    const planFile = join(root, ".ai-factory", "plans", "feature-test.md");
    const content = await readFile(planFile, "utf-8");
    const updated = content.replace("- [ ] Task 4:", "- [x] Task 4:");
    await writeFile(planFile, updated);
    const now = new Date();
    await utimes(planFile, now, now);

    await new Promise((resolve) => setTimeout(resolve, 3000));

    const oldGone = r.root.findDescendantById("plan-detail-0");
    expect(oldGone).toBeUndefined();

    const newDetail = r.root.findDescendantById("plan-detail-0-r1");
    expect(newDetail).toBeDefined();

    app.destroy();
  });
});