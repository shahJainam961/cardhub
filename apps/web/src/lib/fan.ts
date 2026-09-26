export interface FanLayout {
  /** Card indices per row, top row first. */
  rows: number[][];
  /** How far each card overlaps the one before it, in pixels. */
  overlap: number;
}

/**
 * Lays out `count` cards of `cardWidth` in `width` pixels without scrolling: they overlap just
 * enough to fit, and when even a thin strip per card wouldn't fit (`minVisible` pixels), the hand
 * splits into more rows. With no width yet (not measured), everything is one lightly overlapped row.
 */
export function fanLayout(
  count: number,
  width: number,
  cardWidth: number,
  minVisible: number,
  { minOverlap = 12, maxRows = 3 } = {},
): FanLayout {
  const all = Array.from({ length: count }, (_, i) => i);
  if (count === 0) return { rows: [], overlap: 0 };
  if (width <= 0) return { rows: [all], overlap: minOverlap };

  const overlapFor = (n: number) =>
    n > 1 ? Math.max(minOverlap, (cardWidth * n - width) / (n - 1)) : 0;
  let rowCount = 1;
  while (rowCount < maxRows && cardWidth - overlapFor(Math.ceil(count / rowCount)) < minVisible) {
    rowCount++;
  }
  const perRow = Math.ceil(count / rowCount);
  const rows: number[][] = [];
  for (let i = 0; i < count; i += perRow) rows.push(all.slice(i, i + perRow));
  return { rows, overlap: Math.min(cardWidth - 4, overlapFor(perRow)) };
}
