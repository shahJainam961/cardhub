import { describe, expect, it } from "vitest";
import { createRng } from "./rng";

describe("createRng", () => {
  it("produces the same sequence for the same seed", () => {
    const a = createRng(42);
    const b = createRng(42);
    expect(Array.from({ length: 10 }, () => a.next())).toEqual(
      Array.from({ length: 10 }, () => b.next()),
    );
  });

  it("continues the sequence when recreated from its state", () => {
    const original = createRng(7);
    original.next();
    const resumed = createRng(original.state);
    expect(resumed.next()).toBe(original.next());
  });

  it("keeps values in range", () => {
    const rng = createRng(1);
    for (let i = 0; i < 1000; i++) {
      const f = rng.next();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const n = rng.int(6);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(6);
    }
  });

  it("rejects invalid int bounds", () => {
    expect(() => createRng(1).int(0)).toThrow(RangeError);
    expect(() => createRng(1).int(2.5)).toThrow(RangeError);
  });

  it("shuffles into a permutation of the input", () => {
    const items = Array.from({ length: 50 }, (_, i) => i);
    const shuffled = createRng(3).shuffle([...items]);
    expect(shuffled).not.toEqual(items);
    expect([...shuffled].sort((x, y) => x - y)).toEqual(items);
  });
});
