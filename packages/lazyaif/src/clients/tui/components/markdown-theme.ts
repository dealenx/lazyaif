import { SyntaxStyle } from "@opentui/core";
import { colors } from "./theme.js";

export const markdownSyntaxStyle = SyntaxStyle.fromStyles({
  keyword: { fg: colors.accent, bold: true },
  string: { fg: "#A5D6FF" },
  comment: { fg: colors.muted, italic: true },
  number: { fg: "#79C0FF" },
  function: { fg: "#D2A8FF" },
  type: { fg: "#FFA657" },
  operator: { fg: colors.accent },
  variable: { fg: colors.fg },
  property: { fg: "#79C0FF" },
  "punctuation.bracket": { fg: colors.fg },
  "punctuation.delimiter": { fg: colors.muted },
  "markup.heading": { fg: colors.accent, bold: true },
  "markup.heading.1": { fg: "#00FF88", bold: true, italic: true, underline: true },
  "markup.heading.2": { fg: colors.accent, bold: true },
  "markup.heading.3": { fg: "#FF69B4" },
  "markup.heading.4": { fg: "#FF69B4" },
  "markup.heading.5": { fg: "#FF69B4" },
  "markup.heading.6": { fg: "#FF69B4" },
  "markup.bold": { fg: colors.fg, bold: true },
  "markup.strong": { fg: colors.fg, bold: true },
  "markup.italic": { fg: colors.fg, italic: true },
  "markup.strikethrough": { fg: colors.muted, dim: true },
  "markup.list": { fg: colors.progress },
  "markup.list.unchecked": { fg: colors.notStarted },
  "markup.list.checked": { fg: colors.done },
  "markup.quote": { fg: colors.muted, italic: true },
  "markup.raw": { fg: "#A5D6FF", bg: colors.bgAlt },
  "markup.raw.block": { fg: "#A5D6FF", bg: colors.bgAlt },
  "markup.raw.inline": { fg: "#A5D6FF", bg: colors.bgAlt },
  "markup.link": { fg: colors.accent, underline: true },
  "markup.link.label": { fg: "#A5D6FF", underline: true },
  "markup.link.url": { fg: colors.accent, underline: true },
  "markup.link.bracket.close": { fg: colors.muted },
  "diff.plus": { fg: colors.done },
  "diff.minus": { fg: colors.notStarted },
  label: { fg: colors.done },
  conceal: { fg: colors.muted },
  "punctuation.special": { fg: colors.muted },
  "string.escape": { fg: colors.muted },
  "character.special": { fg: colors.muted },
  "keyword.directive": { fg: colors.accent },
  "spell": { fg: colors.fg },
  "nospell": { fg: colors.fg },
  default: { fg: colors.fg },
});

export function extractPlanBody(rawMarkdown: string): string {
  const lines = rawMarkdown.split(/\r?\n/);
  const bodyStarts: number[] = [];
  const headerEndings: number[] = [];
  let inSettings = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^#\s+Implementation Plan:/i.test(line)) headerEndings.push(i);
    if (/^Branch:\s/i.test(line)) headerEndings.push(i);
    if (/^Created:\s/i.test(line)) headerEndings.push(i);
    if (/^##\s+Settings/i.test(line)) inSettings = true;
    else if (/^##\s/.test(line) || /^###\s+Phase\s/i.test(line)) {
      inSettings = false;
      bodyStarts.push(i);
    }
  }

  if (bodyStarts.length === 0) return rawMarkdown;
  const startIdx = bodyStarts[0];
  return lines.slice(startIdx).join("\n");
}