const RESET = "\x1b[0m";
export const ansi = {
  reset: RESET,
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  muted: "\x1b[90m",
  bold: "\x1b[1m",
};

export function pad(s: string, len: number): string {
  return s.length >= len ? s : s + " ".repeat(len - s.length);
}

export function colorForState(state: "done" | "in-progress" | "not-started"): string {
  switch (state) {
    case "done": return ansi.green;
    case "in-progress": return ansi.yellow;
    case "not-started": return ansi.red;
  }
}