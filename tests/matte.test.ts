import { describe, it, expect } from "vitest";
import { stabilizeMatte, backgroundDistance } from "../src/core/matte";
describe("person matte refinement", () => {
  it("stabilizes small confidence fluctuations but follows abrupt motion without trailing", () => {
    const still = stabilizeMatte(
      new Float32Array([0.55]),
      new Float32Array([0.56]),
      16,
    );
    expect(still[0]).toBeGreaterThan(0.56);
    expect(still[0]).toBeLessThan(0.67);
    const moved = stabilizeMatte(
      new Float32Array([0, 1]),
      new Float32Array([1, 0]),
      16,
    );
    expect(Array.from(moved)).toEqual([0, 1]);
  });
  it("increases blur distance continuously outside the subject", () => {
    const matte = new Float32Array(9 * 5);
    for (let y = 0; y < 5; y++) matte[y * 9 + 4] = 1;
    const distance = backgroundDistance(matte, 9, 5);
    expect(distance[2 * 9 + 4]).toBe(0);
    expect(distance[2 * 9 + 3]).toBeCloseTo(0.2);
    expect(distance[2 * 9]).toBeCloseTo(0.8);
    expect(distance[2 * 9]).toBe(distance[2 * 9 + 8]);
  });
});
