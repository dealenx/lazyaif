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

  it("parses new-format plan with bold metadata", async () => {
    const content = await fixture("new-format-plan.md");
    const plan = parsePlanFile(content, ".ai-factory/plans/new-format-plan.md");
    expect(plan.kind).toBe("full");
    expect(plan.title).toBe("Add `mim.entry` field — sample data rows for mim.lua");
    expect(plan.branch).toBe("current (no-git-switch, feature/add-mim-entry-field)");
    expect(plan.created).toBe("2026-07-02");
    expect(plan.status).toBe("planning");
    expect(plan.settings.testing).toBe(true);
    expect(plan.settings.logging).toBe("verbose");
    expect(plan.settings.docs).toBe(false);
    expect(plan.settings.docsMode).toBe("warn-only");
  });

  it("parses bold task names in new-format plan", async () => {
    const content = await fixture("new-format-plan.md");
    const plan = parsePlanFile(content, ".ai-factory/plans/new-format-plan.md");
    expect(plan.tasks.length).toBe(3);
    expect(plan.tasks[0].id).toBe(1);
    expect(plan.tasks[0].done).toBe(false);
    expect(plan.tasks[0].title).toBe("Update openspec spec — add `mim.entry` requirement");
    expect(plan.tasks[1].id).toBe(3);
    expect(plan.tasks[1].done).toBe(true);
    expect(plan.tasks[1].title).toBe("Update `lua-mim-lua` skill — add entry to format spec");
    expect(plan.tasks[2].id).toBe(4);
    expect(plan.tasks[2].done).toBe(true);
    expect(plan.tasks[2].title).toBe("Update `lua-validation` skill — add entry validation rules");
  });

  it("parses phases in new-format plan", async () => {
    const content = await fixture("new-format-plan.md");
    const plan = parsePlanFile(content, ".ai-factory/plans/new-format-plan.md");
    expect(plan.phases.length).toBe(2);
    expect(plan.phases[0].name).toBe("Core format specification (docs first)");
    expect(plan.phases[1].name).toBe("Skills documentation");
  });

  it("strips trailing dash descriptions from bold settings", () => {
    const content = [
      "# Plan: Test plan",
      "- **Branch:** current — feature branch",
      "- **Created:** 2026-07-02 — today",
      "",
      "## Settings",
      "",
      "- **Testing:** yes — with description",
      "- **Logging:** standard — minimal info",
      "",
      "## Tasks",
      "",
      "### Phase 1: Setup",
      "- [x] **Task 1: Do something**",
    ].join("\n");
    const plan = parsePlanFile(content, ".ai-factory/plans/test.md");
    expect(plan.branch).toBe("current");
    expect(plan.created).toBe("2026-07-02");
    expect(plan.settings.testing).toBe(true);
    expect(plan.settings.logging).toBe("standard");
  });

  it("parses bold-colon format: **Task N**: title (title outside bold)", async () => {
    const content = await fixture("bold-colon-plan.md");
    const plan = parsePlanFile(content, ".ai-factory/plans/bold-colon-plan.md");
    expect(plan.title).toBe("Reset LiteLLM Key Spend on Tariff Change");
    expect(plan.branch).toBe("ai-1780453589");
    expect(plan.created).toBe("2026-06-17");
    expect(plan.settings.testing).toBe(true);
    expect(plan.settings.logging).toBe("verbose");
    expect(plan.settings.docs).toBe(false);
    expect(plan.tasks.length).toBe(4);
    expect(plan.tasks[0].id).toBe(1);
    expect(plan.tasks[0].done).toBe(true);
    expect(plan.tasks[0].title).toBe("Add `resetKeySpend()` call in `LitellmKeyService::updateExistingKey()`");
    expect(plan.phases.length).toBe(3);
    expect(plan.phases[0].name).toBe("Core Fix");
  });

  it("parses heading-task format: #### [x] Task N: title", async () => {
    const content = await fixture("heading-tasks-plan.md");
    const plan = parsePlanFile(content, ".ai-factory/plans/heading-tasks-plan.md");
    expect(plan.title).toBe("Визуальный редактор темпо (Tempo Builder)");
    expect(plan.branch).toBe("— (full mode, no git switch)");
    expect(plan.created).toBe("2026-06-10");
    expect(plan.mode).toBe("full, no git branch");
    expect(plan.tasks.length).toBe(6);
    expect(plan.tasks[0].id).toBe(1);
    expect(plan.tasks[0].done).toBe(true);
    expect(plan.tasks[0].title).toBe("Создать компонент TempoBuilder");
    expect(plan.tasks[1].id).toBe(2);
    expect(plan.tasks[1].done).toBe(false);
    expect(plan.tasks[1].title).toBe("Создать отдельную страницу создания темпо (вместо диалога)");
    expect(plan.phases.length).toBe(3);
    expect(plan.phases[0].name).toBe("Компонент TempoBuilder (UI)");
    expect(plan.phases[1].name).toBe("Редактирование существующего темпо");
    expect(plan.phases[2].name).toBe("Полировка");
  });

  it("parses **Branch:** without leading dash", () => {
    const content = [
      "# Plan: Test plan",
      "**Branch:** my-branch",
      "**Created:** 2026-07-03",
      "**Mode:** full, no git branch",
      "",
      "## Settings",
      "",
      "- **Testing:** yes",
      "- **Logging:** standard",
      "",
      "## Tasks",
      "",
      "### Phase 1: Setup",
      "#### [x] Task 1: Do thing",
    ].join("\n");
    const plan = parsePlanFile(content, ".ai-factory/plans/test.md");
    expect(plan.branch).toBe("my-branch");
    expect(plan.created).toBe("2026-07-03");
    expect(plan.mode).toBe("full, no git branch");
    expect(plan.tasks.length).toBe(1);
    expect(plan.tasks[0].title).toBe("Do thing");
  });

  it("parses T-prefix tasks: **T1: title** (abbreviated Task)", async () => {
    const content = await fixture("t-prefix-plan.md");
    const plan = parsePlanFile(content, ".ai-factory/plans/t-prefix-plan.md");
    expect(plan.title).toBe("Add clientName to monitoring pages");
    expect(plan.branch).toBe("feature/monitoring-client-name");
    expect(plan.tasks.length).toBe(6);
    expect(plan.tasks[0].id).toBe(1);
    expect(plan.tasks[0].done).toBe(false);
    expect(plan.tasks[0].title).toBe("Add `clientName` to all MonitoringClient/SessionDetail interfaces");
    expect(plan.tasks[1].id).toBe(2);
    expect(plan.tasks[1].done).toBe(false);
    expect(plan.tasks[1].title).toBe("Update `show.tsx` — show clientName in session header");
    expect(plan.phases.length).toBe(3);
    expect(plan.phases[0].name).toBe("TypeScript Types");
    expect(plan.phases[1].name).toBe("UI Display Changes");
    expect(plan.phases[2].name).toBe("Verification");
  });

  it("parses fast-heading format: ### Task N: heading with - [x] inline checkbox", async () => {
    const content = await fixture("fast-heading-plan.md");
    const plan = parsePlanFile(content, ".ai-factory/PLAN.md");
    expect(plan.kind).toBe("fast");
    expect(plan.created).toBe("2026-07-06");
    expect(plan.mode).toBe("fast");
    expect(plan.branch).toBe("(current — no branch switching)");
    expect(plan.settings.testing).toBe(false);
    expect(plan.settings.logging).toBe("minimal");
    expect(plan.settings.docs).toBe(false);
    expect(plan.tasks.length).toBe(2);
    expect(plan.tasks[0].id).toBe(1);
    expect(plan.tasks[0].done).toBe(true);
    expect(plan.tasks[0].title).toBe("Replace video source in MimPlatformSection.astro");
    expect(plan.tasks[0].description).toContain("src=\"/videos/0705.mp4\"");
    expect(plan.tasks[1].id).toBe(2);
    expect(plan.tasks[1].done).toBe(false);
    expect(plan.tasks[1].title).toBe("Another video change");
  });
});