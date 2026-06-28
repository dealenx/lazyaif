import { describe, it, expect } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parsePlanFile } from "../../../src/modules/plans-viewer/parser.js";

const fixturesDir = join(import.meta.dirname ?? __dirname, "..", "..", "fixtures");

async function fixture(name: string): Promise<string> {
  return readFile(join(fixturesDir, name), "utf-8");
}

describe("parsePlanFile", () => {
  it("parses fast plan (PLAN.md) as kind=fast with one undone task", async () => {
    const content = await fixture("fast-plan.md");
    const plan = parsePlanFile(content, ".ai-factory/PLAN.md");
    expect(plan.kind).toBe("fast");
    expect(plan.fileName).toBe("PLAN.md");
    expect(plan.title).toBe("sum(a, b) — сложение двух чисел");
    expect(plan.branch).toBe("none");
    expect(plan.created).toBe("2026-06-28");
    expect(plan.settings.testing).toBe(false);
    expect(plan.settings.logging).toBe("verbose");
    expect(plan.tasks.length).toBe(1);
    expect(plan.tasks[0].done).toBe(false);
    expect(plan.tasks[0].id).toBe(1);
  });

  it("parses full-plan-done as kind=full with one done task", async () => {
    const content = await fixture("full-plan-done.md");
    const plan = parsePlanFile(content, ".ai-factory/plans/full-plan-done.md");
    expect(plan.kind).toBe("full");
    expect(plan.tasks.length).toBe(1);
    expect(plan.tasks[0].done).toBe(true);
  });

  it("parses partial plan with correct done flags", async () => {
    const content = await fixture("full-plan-partial.md");
    const plan = parsePlanFile(content, ".ai-factory/plans/full-plan-partial.md");
    expect(plan.tasks.length).toBe(4);
    expect(plan.tasks.map((t) => t.done)).toEqual([true, true, false, false]);
  });

  it("extracts dependsOn from title", async () => {
    const content = await fixture("full-plan-partial.md");
    const plan = parsePlanFile(content, ".ai-factory/plans/full-plan-partial.md");
    expect(plan.tasks[1].dependsOn).toEqual([1]);
    expect(plan.tasks[3].dependsOn).toEqual([1, 2, 3]);
  });

  it("preserves multi-line task description", async () => {
    const content = await fixture("full-plan-partial.md");
    const plan = parsePlanFile(content, ".ai-factory/plans/full-plan-partial.md");
    expect(plan.tasks[0].description).toContain("index.ts");
    expect(plan.tasks[0].description.length).toBeGreaterThan(0);
  });

  it("uses default settings when ## Settings missing", () => {
    const content = "# Implementation Plan: No settings\n\n## Tasks\n\n### Phase 1: Setup\n- [ ] Task 1: Do thing\n\n  Desc.\n";
    const plan = parsePlanFile(content, ".ai-factory/plans/test.md");
    expect(plan.settings.testing).toBe(false);
    expect(plan.settings.logging).toBe("verbose");
    expect(plan.settings.docs).toBe(false);
  });

  it("parses settings values from empty plan", async () => {
    const content = await fixture("full-plan-empty.md");
    const plan = parsePlanFile(content, ".ai-factory/plans/full-plan-empty.md");
    expect(plan.settings.testing).toBe(true);
    expect(plan.settings.logging).toBe("standard");
    expect(plan.settings.docs).toBe(true);
    expect(plan.branch).toBe("main");
  });
});