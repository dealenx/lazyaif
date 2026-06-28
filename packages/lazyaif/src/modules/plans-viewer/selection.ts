export function clampSelection(index: number, length: number): number | null {
  if (!Number.isInteger(index)) return null;
  if (index < 0 || index >= length) return null;
  return index;
}