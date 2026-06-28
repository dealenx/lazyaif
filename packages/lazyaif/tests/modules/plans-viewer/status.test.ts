import { describe, it, expect } from "bun:test";
import { computeStatus } from "../../../src/modules/plans-viewer/status.js";
import { statusIcon, formatPercent, formatTaskProgress } from "../../../src/modules/plans-viewer/format.js";
import { parsePlanFile } from "../../../src/modules/plans-viewer/parser.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const fixturesDir = join(import.meta.dirname ?? __dirname, "..", "..", "fixtures");

async function fixture(name: string): Promise<string> {
  return readFile(join(fixturesDir, name), "utf-8");
}

describe("computeStatus", () => {
  it("returns done state for fully completed plan", async () => {
    const content = await fixture("full-plan-done.md");
    const plan = parsePlanFile(content, "plans/full-plan-done.md");
    const s = computeStatus(plan);
    expect(s).toEqual({ done: 1, total: 1, pct: 100, state: "done" });
  });

  it("returns in-progress for partial plan", async () => {
    const content = await fixture("full-plan-partial.md");
    const plan = parsePlanFile(content, "plans/full-plan-partial.md");
    const s = computeStatus(plan);
    expect(s).toEqual({ done: 2, total: 4, pct: 50, state: "in-progress" });
  });

  it("returns not-started for empty plan", async () => {
    const content = await fixture("full-plan-empty.md");
    const plan = parsePlanFile(content, "plans/full-plan-empty.md");
    const s = computeStatus(plan);
    expect(s).toEqual({ done: 0, total: 3, pct: 0, state: "not-started" });
  });
});

describe("format helpers", () => {
  it("statusIcon returns correct emoji per state", () => {
    expect(statusIcon("done")).toBe("✅");
    expect(statusIcon("in-progress")).toBe("⏳");
    expect(statusIcon("not-started")).toBe("❌");
  });

  it("formatPercent formats numbers", () => {
    expect(formatPercent(100)).toBe("100%");
    expect(formatPercent(50)).toBe("50%");
    expect(formatPercent(0)).toBe("0%");
  });

  it("formatTaskProgress formats ratio", () => {
    expect(formatTaskProgress(2, 4)).toBe("2/4");
    expect(formatTaskProgress(1, 1)).toBe("1/1");
    expect(formatTaskProgress(0, 1)).toBe("0/1");
  });
});