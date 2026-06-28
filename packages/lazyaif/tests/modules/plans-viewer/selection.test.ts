import { describe, it, expect } from "bun:test";
import { clampSelection } from "../../../src/modules/plans-viewer/selection.js";

describe("clampSelection", () => {
  it("returns the index when in range", () => {
    expect(clampSelection(0, 3)).toBe(0);
    expect(clampSelection(1, 3)).toBe(1);
    expect(clampSelection(2, 3)).toBe(2);
  });

  it("returns null for negative index", () => {
    expect(clampSelection(-1, 3)).toBeNull();
  });

  it("returns null for index >= length", () => {
    expect(clampSelection(3, 3)).toBeNull();
    expect(clampSelection(5, 3)).toBeNull();
  });

  it("returns null for non-integer index", () => {
    expect(clampSelection(1.5, 3)).toBeNull();
    expect(clampSelection(NaN, 3)).toBeNull();
    expect(clampSelection(Infinity, 3)).toBeNull();
  });

  it("returns null when length is 0", () => {
    expect(clampSelection(0, 0)).toBeNull();
  });
});