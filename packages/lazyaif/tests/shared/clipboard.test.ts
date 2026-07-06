import { describe, it, expect } from "bun:test";
import { copyToClipboard } from "../../src/shared/clipboard.js";

describe("copyToClipboard", () => {
  it("returns a boolean (clipboard tool may or may not be available)", () => {
    const result = copyToClipboard("test string");
    expect(typeof result).toBe("boolean");
  });
});