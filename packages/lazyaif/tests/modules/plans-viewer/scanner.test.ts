import { describe, it, expect } from "bun:test";
import { scanAiFactory } from "../../../src/modules/plans-viewer/scanner.js";
import { join } from "node:path";

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
});