import type { Plan } from "./types.js";

export function sortByMtimeDesc(plans: Plan[]): Plan[] {
  return [...plans].sort((a, b) => {
    if (b.mtime !== a.mtime) return b.mtime - a.mtime;
    return a.fileName < b.fileName ? -1 : a.fileName > b.fileName ? 1 : 0;
  });
}