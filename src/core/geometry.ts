import type { Box } from "./types";
export function landmarkBox(points: { x: number; y: number }[]): Box | null {
  if (!points.length) return null;
  const xs = points.map((p) => p.x),
    ys = points.map((p) => p.y);
  const left = Math.min(...xs),
    top = Math.min(...ys);
  const width = Math.max(...xs) - left,
    height = Math.max(...ys) - top;
  const x = Math.max(0, left - width * 0.16),
    y = Math.max(0, top - height * 0.22);
  return {
    x,
    y,
    width: Math.min(1, left + width * 1.16) - x,
    height: Math.min(1, top + height * 1.12) - y,
  };
}
export function smoothBox(
  previous: Box | null,
  next: Box,
  elapsed: number,
): Box {
  if (!previous) return next;
  const jump = Math.hypot(previous.x - next.x, previous.y - next.y);
  const alpha = jump > 0.16 ? 1 : 1 - Math.exp(-Math.max(1, elapsed) / 65);
  return Object.fromEntries(
    (["x", "y", "width", "height"] as const).map((k) => [
      k,
      previous[k] + (next[k] - previous[k]) * alpha,
    ]),
  ) as Box;
}
export function mirrorBox(box: Box): Box {
  return { ...box, x: 1 - box.x - box.width };
}
