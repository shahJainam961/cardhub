import { describe, expect, it } from "vitest";
import { seatAngles } from "./RoundTable";

describe("seatAngles", () => {
  it("seats one opponent straight across the table", () => {
    expect(seatAngles(1)).toEqual([270]);
  });

  it("goes clockwise from the left, symmetric around the top", () => {
    const angles = seatAngles(4);
    expect(angles).toHaveLength(4);
    for (let i = 1; i < angles.length; i++) expect(angles[i]!).toBeGreaterThan(angles[i - 1]!);
    expect(angles[0]! + angles[3]!).toBeCloseTo(540);
  });

  it("wraps big tables a little way down the sides", () => {
    const angles = seatAngles(9);
    expect(angles[0]!).toBeLessThan(180);
    expect(angles[8]!).toBeGreaterThan(360);
  });

  it("has no seats for no opponents", () => {
    expect(seatAngles(0)).toEqual([]);
  });
});
