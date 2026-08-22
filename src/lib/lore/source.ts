import type { SourceRange } from "./types";

export function lineStartsFor(text: string): number[] {
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) starts.push(index + 1);
  }
  return starts;
}

export function sourceRange(
  start: number,
  end: number,
  lineStarts: readonly number[],
): SourceRange {
  let low = 0;
  let high = lineStarts.length;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if ((lineStarts[middle] ?? 0) <= start) low = middle;
    else high = middle;
  }
  return {
    start,
    end,
    line: low + 1,
    column: start - (lineStarts[low] ?? 0) + 1,
  };
}
