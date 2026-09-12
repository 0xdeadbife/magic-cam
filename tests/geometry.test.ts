import { describe, expect, it } from "vitest";
import { landmarkBox, mirrorBox, smoothBox } from "../src/core/geometry";
describe("face bounds", () => {
  it("pads facial landmarks and clips to the image boundaries", () => {
    expect(landmarkBox([])).toBeNull();
    const box = landmarkBox([
      { x: 0.01, y: 0.01 },
      { x: 0.9, y: 0.95 },
    ])!;
    expect(box.x).toBe(0);
    expect(box.y).toBe(0);
    expect(box.width).toBeLessThanOrEqual(1);
    expect(box.height).toBeLessThanOrEqual(1);
  });
  it("mirrors around the right edge and is reversible", () => {
    const box = { x: 0.1, y: 0.2, width: 0.3, height: 0.4 };
    expect(mirrorBox(box).x).toBeCloseTo(0.6);
    expect(mirrorBox(mirrorBox(box)).x).toBeCloseTo(box.x);
  });
  it("smooths jitter but snaps to large movements", () => {
    const first = { x: 0.1, y: 0.2, width: 0.3, height: 0.4 };
    const next = { ...first, x: 0.12 };
    expect(smoothBox(first, next, 60).x).toBeGreaterThan(first.x);
    expect(smoothBox(first, next, 60).x).toBeLessThan(next.x);
    expect(smoothBox(first, { ...next, x: 0.7 }, 60).x).toBe(0.7);
  });
});
