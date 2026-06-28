import { describe, it, expect } from "bun:test";
import { computeSummary } from "../../../src/modules/status/summary.js";
import { join } from "node:path";

const exampleDir = join(import.meta.dirname ?? __dirname, "..", "..", "..", "..", "..", "examples", "ai-factory-hello-world-example");

describe("computeSummary", () => {
  it("returns summary with correct counts for hello-world example", async () => {
    const summary = await computeSummary(exampleDir);
    expect(summary.total).toBe(3);
    expect(summary.done).toBe(1);
    expect(summary.inProgress).toBe(1);
    expect(summary.notStarted).toBe(1);
  });

  it("returns zeroed summary for non-existent directory", async () => {
    const summary = await computeSummary(join(exampleDir, "does-not-exist"));
    expect(summary.total).toBe(0);
    expect(summary.done).toBe(0);
    expect(summary.inProgress).toBe(0);
    expect(summary.notStarted).toBe(0);
  });
});