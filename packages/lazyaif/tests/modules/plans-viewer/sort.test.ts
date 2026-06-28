import { describe, it, expect } from "bun:test";
import { sortByMtimeDesc } from "../../../src/modules/plans-viewer/sort.js";
import type { Plan } from "../../../src/modules/plans-viewer/types.js";

function stub(fileName: string, mtime: number): Plan {
  return {
    kind: "full",
    path: `.ai-factory/plans/${fileName}`,
    fileName,
    title: "",
    branch: "none",
    created: "",
    settings: { testing: false, logging: "verbose", docs: false },
    phases: [],
    tasks: [],
    rawMarkdown: "",
    mtime,
  };
}

describe("sortByMtimeDesc", () => {
  it("returns empty array for empty input", () => {
    expect(sortByMtimeDesc([])).toEqual([]);
  });

  it("returns single plan unchanged (by value)", () => {
    const p = stub("a.md", 100);
    const result = sortByMtimeDesc([p]);
    expect(result).toHaveLength(1);
    expect(result[0].fileName).toBe("a.md");
  });

  it("sorts two plans with distinct mtime — newer first", () => {
    const a = stub("a.md", 100);
    const b = stub("b.md", 200);
    const result = sortByMtimeDesc([a, b]);
    expect(result.map((p) => p.fileName)).toEqual(["b.md", "a.md"]);
  });

  it("uses fileName ASC as tiebreak for equal mtime", () => {
    const b = stub("b.md", 100);
    const a = stub("a.md", 100);
    const result = sortByMtimeDesc([b, a]);
    expect(result.map((p) => p.fileName)).toEqual(["a.md", "b.md"]);
  });

  it("sorts three plans with mixed mtimes", () => {
    const a = stub("a.md", 300);
    const b = stub("b.md", 100);
    const c = stub("c.md", 200);
    const result = sortByMtimeDesc([a, b, c]);
    expect(result.map((p) => p.fileName)).toEqual(["a.md", "c.md", "b.md"]);
  });

  it("does not mutate input array", () => {
    const a = stub("a.md", 100);
    const b = stub("b.md", 200);
    const input = [a, b];
    sortByMtimeDesc(input);
    expect(input.map((p) => p.fileName)).toEqual(["a.md", "b.md"]);
  });
});