import { describe, it, expect, afterEach, beforeEach } from "bun:test";
import { createCliRenderer } from "@opentui/core";
import type { CliRenderer, KeyEvent } from "@opentui/core";
import { createPlansTuiApp } from "../../../src/views/plans-viewer/tui-view.js";
import { mkdtemp, mkdir, cp, rm, writeFile, utimes, readFile } from "node:fs/promises";
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
  const base = await mkdtemp(join(tmpdir(), "lazyaif-mtime-"));
  const aiFactory = join(base, ".ai-factory");
  const plansDir = join(aiFactory, "plans");
  await mkdir(plansDir, { recursive: true });
  const fixtureA = join(import.meta.dir, "../../fixtures/full-plan-partial.md");
  const fixtureB = join(import.meta.dir, "../../fixtures/full-plan-done.md");
  await cp(fixtureA, join(plansDir, "plan-a.md"));
  await cp(fixtureB, join(plansDir, "plan-b.md"));
  const now = new Date();
  await utimes(join(plansDir, "plan-a.md"), now, now);
  const earlier = new Date(now.getTime() - 5000);
  await utimes(join(plansDir, "plan-b.md"), earlier, earlier);
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

describe("createPlansTuiApp mtime index reconciliation", () => {
  it("follows selected plan when sort order shifts due to mtime change", async () => {
    const r = await getRenderer();
    const root = tmpRoot!;
    const app = await createPlansTuiApp(r, root);

    emitKey(r, "return", "\r");
    await new Promise((resolve) => setTimeout(resolve, 200));

    const titleBefore = r.root.findDescendantById("plan-detail-0-title");
    expect(titleBefore).toBeDefined();
    debug(`[test:mtime] title before: ${textOf(titleBefore)}`);

    const statusBefore = r.root.findDescendantById("plan-detail-0-status");
    expect(statusBefore).toBeDefined();
    expect(textOf(statusBefore)).toContain("2/4");

    const planBFile = join(root, ".ai-factory", "plans", "plan-b.md");
    const now = new Date();
    await utimes(planBFile, now, now);

    const planAFile = join(root, ".ai-factory", "plans", "plan-a.md");
    const content = await readFile(planAFile, "utf-8");
    const updated = content.replace("- [ ] Task 3:", "- [x] Task 3:");
    await writeFile(planAFile, updated);
    const later = new Date(now.getTime() + 2000);
    await utimes(planAFile, later, later);

    await new Promise((resolve) => setTimeout(resolve, 3000));

    const oldGone = r.root.findDescendantById("plan-detail-0");
    expect(oldGone).toBeUndefined();

    const refreshedDetail = r.root.findDescendantById("plan-detail-0-r1");
    expect(refreshedDetail).toBeDefined();

    const statusAfter = r.root.findDescendantById("plan-detail-0-r1-status");
    expect(statusAfter).toBeDefined();
    const statusTextAfter = textOf(statusAfter);
    debug(`[test:mtime] status after: ${statusTextAfter}`);
    expect(statusTextAfter).toContain("3/4");

    app.destroy();
  });
});