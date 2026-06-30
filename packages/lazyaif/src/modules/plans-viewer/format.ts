import type { PlanState } from "./types.js";

export function statusIcon(state: PlanState): string {
  switch (state) {
    case "done": return "✅";
    case "in-progress": return "⏳";
    case "not-started": return "❌";
  }
}

export function formatPercent(pct: number): string {
  return `${pct}%`;
}

export function formatTaskProgress(done: number, total: number): string {
  return `${done}/${total}`;
}

export function formatRelativeTime(fromMs: number, nowMs: number = Date.now()): string {
  const delta = nowMs - fromMs;
  if (delta < 1000) return "just now";
  if (delta < 60_000) {
    const s = Math.round(delta / 1000);
    return s === 1 ? "1 second ago" : `${s} seconds ago`;
  }
  if (delta < 3_600_000) {
    const m = Math.round(delta / 60_000);
    return m === 1 ? "1 minute ago" : `${m} minutes ago`;
  }
  if (delta < 86_400_000) {
    const h = Math.round(delta / 3_600_000);
    return h === 1 ? "1 hour ago" : `${h} hours ago`;
  }
  const d = Math.round(delta / 86_400_000);
  return d === 1 ? "1 day ago" : `${d} days ago`;
}

const TIME_UNITS: Array<[number, string]> = [
  [86_400_000, "d"],
  [3_600_000, "h"],
  [60_000, "m"],
  [1000, "s"],
];

export function formatRelativeTimeShort(fromMs: number, nowMs: number = Date.now()): string {
  const delta = nowMs - fromMs;
  if (delta < 1000) return "now";
  for (const [ms, suffix] of TIME_UNITS) {
    if (delta >= ms) {
      const v = Math.round(delta / ms);
      return `${v}${suffix}`;
    }
  }
  return "now";
}