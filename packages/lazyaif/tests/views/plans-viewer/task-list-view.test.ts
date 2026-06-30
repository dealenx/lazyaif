import { describe, it, expect, afterEach } from "bun:test";
import { createCliRenderer } from "@opentui/core";
import type { CliRenderer } from "@opentui/core";
import { renderTaskList } from "../../../src/views/plans-viewer/task-list-view.js";
import type { Plan } from "../../../src/modules/plans-viewer/types.js";
import { parsePlanFile } from "../../../src/modules/plans-viewer/parser.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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

function loadFixturePlan(): Plan {
  const fixturePath = join(import.meta.dir, "../../fixtures/full-plan-partial.md");
  const content = readFileSync(fixturePath, "utf-8");
  const parsed = parsePlanFile(content, "plans/full-plan-partial.md");
  return { ...parsed, mtime: Date.now() } as Plan;
}

describe("renderTaskList", () => {
  it("returns a ScrollBoxRenderable with the given id", async () => {
    const r = await getRenderer();
    const plan = loadFixturePlan();
    const scroll = renderTaskList(r, plan, "test-id", 30);
    expect(scroll.id).toBe("test-id");
  });

  it("renders a title with done/total counts", async () => {
    const r = await getRenderer();
    const plan = loadFixturePlan();
    const scroll = renderTaskList(r, plan, "test-id", 30);
    const title = scroll.content.getRenderable("test-id-title");
    expect(title).toBeDefined();
    const done = plan.tasks.filter((t) => t.done).length;
    expect(textOf(title)).toBe(`Tasks (${done}/${plan.tasks.length})`);
  });

  it("renders one line per task", async () => {
    const r = await getRenderer();
    const plan = loadFixturePlan();
    const scroll = renderTaskList(r, plan, "test-id", 30);
    for (const task of plan.tasks) {
      const el = scroll.content.getRenderable(`test-id-task-${task.id}`);
      expect(el).toBeDefined();
    }
  });

  it("prefixes done tasks with ☑ and pending tasks with ☐", async () => {
    const r = await getRenderer();
    const plan = loadFixturePlan();
    const scroll = renderTaskList(r, plan, "test-id", 30);
    for (const task of plan.tasks) {
      const el = scroll.content.getRenderable(`test-id-task-${task.id}`);
      const text = textOf(el);
      if (task.done) {
        expect(text.startsWith("☑")).toBe(true);
      } else {
        expect(text.startsWith("☐")).toBe(true);
      }
    }
  });

  it("renders (no tasks) for a plan with 0 tasks", async () => {
    const r = await getRenderer();
    const plan = loadFixturePlan();
    const emptyPlan: Plan = { ...plan, tasks: [], phases: [] };
    const scroll = renderTaskList(r, emptyPlan, "test-id", 30);
    const empty = scroll.content.getRenderable("test-id-empty");
    expect(empty).toBeDefined();
    expect(textOf(empty)).toBe("(no tasks)");
  });
});