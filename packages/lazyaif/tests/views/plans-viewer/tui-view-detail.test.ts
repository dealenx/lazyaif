import { describe, it, expect, afterEach } from "bun:test";
import { createCliRenderer } from "@opentui/core";
import type { CliRenderer } from "@opentui/core";
import { renderTaskDetail } from "../../../src/views/plans-viewer/tui-view.js";
import type { Plan, PlanStatus } from "../../../src/modules/plans-viewer/types.js";
import { computeStatus } from "../../../src/modules/plans-viewer/index.js";

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

function getContent(scroll: unknown): { getRenderable: (id: string) => unknown } | undefined {
  return (scroll as { content?: { getRenderable: (id: string) => unknown } }).content;
}

const partialPlan: Plan = {
  kind: "full",
  path: ".ai-factory/plans/feature-test.md",
  fileName: "feature-test.md",
  title: "Площадь прямоугольника (area)",
  branch: "none",
  created: "2026-06-28",
  settings: { testing: false, logging: "verbose", docs: false },
  phases: [
    {
      name: "Phase 1: Implementation",
      tasks: [
        { id: 1, title: "Добавить сигнатуру функции area(width, height)", done: true, phase: "Phase 1: Implementation", description: "", dependsOn: [] },
        { id: 2, title: "Добавить логирование входных аргументов (DEBUG)", done: true, phase: "Phase 1: Implementation", description: "", dependsOn: [1] },
        { id: 3, title: "Добавить логирование результата (DEBUG)", done: false, phase: "Phase 1: Implementation", description: "", dependsOn: [1] },
        { id: 4, title: "Интегрировать area в файл", done: false, phase: "Phase 1: Implementation", description: "", dependsOn: [1, 2, 3] },
      ],
    },
  ],
  tasks: [
    { id: 1, title: "Добавить сигнатуру функции area(width, height)", done: true, phase: "Phase 1: Implementation", description: "", dependsOn: [] },
    { id: 2, title: "Добавить логирование входных аргументов (DEBUG)", done: true, phase: "Phase 1: Implementation", description: "", dependsOn: [1] },
    { id: 3, title: "Добавить логирование результата (DEBUG)", done: false, phase: "Phase 1: Implementation", description: "", dependsOn: [1] },
    { id: 4, title: "Интегрировать area в файл", done: false, phase: "Phase 1: Implementation", description: "", dependsOn: [1, 2, 3] },
  ],
  rawMarkdown: "",
  mtime: Date.now(),
};

const noPhasesPlan: Plan = {
  kind: "fast",
  path: ".ai-factory/PLAN.md",
  fileName: "PLAN.md",
  title: "Quick task",
  branch: "none",
  created: "2026-07-03",
  settings: { testing: false, logging: "minimal", docs: false },
  phases: [],
  tasks: [
    { id: 1, title: "Do something", done: true, phase: "", description: "", dependsOn: [] },
    { id: 2, title: "Do another thing", done: false, phase: "", description: "", dependsOn: [] },
  ],
  rawMarkdown: "",
  mtime: Date.now(),
};

describe("renderTaskDetail", () => {
  it("renders fileName and path TextRenderables after title", async () => {
    const r = await getRenderer();
    const status: PlanStatus = computeStatus(partialPlan);
    const scroll = renderTaskDetail(r, partialPlan, status, "test-detail");
    const content = getContent(scroll);
    expect(content).toBeDefined();

    const fileName = content!.getRenderable("test-detail-filename");
    expect(fileName).toBeDefined();

    const filePath = content!.getRenderable("test-detail-filepath");
    expect(filePath).toBeDefined();
  });

  it("renders task summary with phase header when phases exist", async () => {
    const r = await getRenderer();
    const status: PlanStatus = computeStatus(partialPlan);
    const scroll = renderTaskDetail(r, partialPlan, status, "test-detail");
    const content = getContent(scroll);
    expect(content).toBeDefined();

    const phase0 = content!.getRenderable("test-detail-phase-0");
    expect(phase0).toBeDefined();

    const task1 = content!.getRenderable("test-detail-task-1");
    expect(task1).toBeDefined();

    const task2 = content!.getRenderable("test-detail-task-2");
    expect(task2).toBeDefined();

    const task3 = content!.getRenderable("test-detail-task-3");
    expect(task3).toBeDefined();

    const task4 = content!.getRenderable("test-detail-task-4");
    expect(task4).toBeDefined();
  });

  it("renders flat task summary when phases are empty", async () => {
    const r = await getRenderer();
    const status: PlanStatus = computeStatus(noPhasesPlan);
    const scroll = renderTaskDetail(r, noPhasesPlan, status, "test-detail");
    const content = getContent(scroll);
    expect(content).toBeDefined();

    const tasksHeader = content!.getRenderable("test-detail-tasks-header");
    expect(tasksHeader).toBeDefined();

    const task1 = content!.getRenderable("test-detail-task-1");
    expect(task1).toBeDefined();

    const task2 = content!.getRenderable("test-detail-task-2");
    expect(task2).toBeDefined();
  });

  it("renders second separator after task summary", async () => {
    const r = await getRenderer();
    const status: PlanStatus = computeStatus(partialPlan);
    const scroll = renderTaskDetail(r, partialPlan, status, "test-detail");
    const content = getContent(scroll);
    expect(content).toBeDefined();

    const sep2 = content!.getRenderable("test-detail-sep2");
    expect(sep2).toBeDefined();
  });

  it("renders first separator before task summary", async () => {
    const r = await getRenderer();
    const status: PlanStatus = computeStatus(partialPlan);
    const scroll = renderTaskDetail(r, partialPlan, status, "test-detail");
    const content = getContent(scroll);
    expect(content).toBeDefined();

    const sep1 = content!.getRenderable("test-detail-sep");
    expect(sep1).toBeDefined();
  });
});