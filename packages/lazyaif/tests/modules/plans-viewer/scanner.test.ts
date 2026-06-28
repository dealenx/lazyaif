import { describe, it, expect } from "bun:test";
import { scanAiFactory } from "../../../src/modules/plans-viewer/scanner.js";
import { join } from "node:path";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

const fixturesRoot = join(import.meta.dirname ?? __dirname, "..", "..", "..", "..", ".ai-factory-scanner-test");

describe("scanAiFactory", () => {
  it("returns [] for non-existent directory", async () => {
    const plans = await scanAiFactory(join(fixturesRoot, "does-not-exist-xyz"));
    expect(plans).toEqual([]);
  });

  it("returns [] when .ai-factory directory missing", async () => {
    const plans = await scanAiFactory(fixturesRoot);
    expect(plans).toEqual([]);
  });

  it("populates mtime for scanned plans", async () => {
    const tempRoot = join(tmpdir(), `lazyaif-scanner-test-${Date.now()}`);
    const plansDir = join(tempRoot, ".ai-factory", "plans");
    await mkdir(plansDir, { recursive: true });
    const planContent = "# Implementation Plan: mtime test\n\n## Tasks\n\n### Phase 1: Setup\n- [ ] Task 1: Do thing\n";
    const planPath = join(plansDir, "test-plan.md");
    await writeFile(planPath, planContent, "utf-8");

    try {
      const before = Date.now();
      const plans = await scanAiFactory(tempRoot);
      expect(plans).toHaveLength(1);
      expect(plans[0].mtime).toBeGreaterThan(0);
      const after = Date.now();
      expect(plans[0].mtime).toBeGreaterThanOrEqual(before - 5000);
      expect(plans[0].mtime).toBeLessThanOrEqual(after + 5000);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});