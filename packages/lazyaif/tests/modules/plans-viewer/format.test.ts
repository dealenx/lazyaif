import { describe, it, expect } from "bun:test";
import { formatRelativeTime } from "../../../src/modules/plans-viewer/format.js";

const NOW = 1_000_000_000_000;

describe("formatRelativeTime", () => {
  it("returns 'just now' for delta < 1s", () => {
    expect(formatRelativeTime(NOW, NOW)).toBe("just now");
    expect(formatRelativeTime(NOW - 500, NOW)).toBe("just now");
  });

  it("returns 'just now' for negative delta (clock skew)", () => {
    expect(formatRelativeTime(NOW + 5000, NOW)).toBe("just now");
  });

  it("formats seconds", () => {
    expect(formatRelativeTime(NOW - 15_000, NOW)).toBe("15 seconds ago");
    expect(formatRelativeTime(NOW - 59_000, NOW)).toBe("59 seconds ago");
  });

  it("uses singular for 1 second", () => {
    expect(formatRelativeTime(NOW - 1000, NOW)).toBe("1 second ago");
  });

  it("formats minutes", () => {
    expect(formatRelativeTime(NOW - 60_000, NOW)).toBe("1 minute ago");
    expect(formatRelativeTime(NOW - 125_000, NOW)).toBe("2 minutes ago");
  });

  it("formats hours", () => {
    expect(formatRelativeTime(NOW - 3_600_000, NOW)).toBe("1 hour ago");
    expect(formatRelativeTime(NOW - 7_200_000, NOW)).toBe("2 hours ago");
  });

  it("formats days", () => {
    expect(formatRelativeTime(NOW - 86_400_000, NOW)).toBe("1 day ago");
    expect(formatRelativeTime(NOW - 172_800_000, NOW)).toBe("2 days ago");
  });

  it("uses singular for 1 minute, 1 hour, 1 day", () => {
    expect(formatRelativeTime(NOW - 60_000, NOW)).toBe("1 minute ago");
    expect(formatRelativeTime(NOW - 3_600_000, NOW)).toBe("1 hour ago");
    expect(formatRelativeTime(NOW - 86_400_000, NOW)).toBe("1 day ago");
  });
});