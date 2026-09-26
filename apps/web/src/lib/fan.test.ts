import { describe, expect, it } from "vitest";
import { fanLayout } from "./fan";

const widthOf = (n: number, card: number, overlap: number) => card * n - overlap * (n - 1);

describe("fanLayout", () => {
  it("keeps a small hand in one row with the minimum overlap", () => {
    const { rows, overlap } = fanLayout(5, 800, 80, 26);
    expect(rows).toEqual([[0, 1, 2, 3, 4]]);
    expect(overlap).toBe(12);
  });

  it("overlaps more to fit the width exactly", () => {
    const { rows, overlap } = fanLayout(10, 400, 80, 26);
    expect(rows).toHaveLength(1);
    expect(widthOf(10, 80, overlap)).toBeCloseTo(400);
    expect(80 - overlap).toBeGreaterThanOrEqual(26);
  });

  it("splits into rows instead of scrolling when strips would get too thin", () => {
    const { rows, overlap } = fanLayout(24, 360, 80, 26);
    expect(rows.length).toBeGreaterThan(1);
    expect(rows.flat()).toEqual(Array.from({ length: 24 }, (_, i) => i));
    for (const row of rows) expect(widthOf(row.length, 80, overlap)).toBeLessThanOrEqual(360.01);
  });

  it("never goes past the row limit and still fits", () => {
    const { rows, overlap } = fanLayout(60, 360, 80, 26, { maxRows: 2 });
    expect(rows).toHaveLength(2);
    expect(widthOf(30, 80, overlap)).toBeLessThanOrEqual(360.01);
  });

  it("handles an empty or unmeasured hand", () => {
    expect(fanLayout(0, 300, 80, 26).rows).toEqual([]);
    expect(fanLayout(3, 0, 80, 26)).toEqual({ rows: [[0, 1, 2]], overlap: 12 });
  });
});
