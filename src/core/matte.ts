export const smoothstep = (low: number, high: number, value: number) => {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
};

// Keep uncertain edges stable, but follow unambiguous motion immediately.
export function stabilizeMatte(
  values: Float32Array,
  previous: Float32Array | null,
  elapsed: number,
): Float32Array {
  const alpha = 1 - Math.exp(-Math.max(1, elapsed) / 38);
  for (let i = 0; i < values.length; i++) {
    const value = smoothstep(0.06, 0.9, values[i]);
    const old = previous?.[i] ?? value;
    values[i] =
      Math.abs(value - old) > 0.18 ? value : old + (value - old) * alpha;
  }
  return values;
}

// Two-pass chamfer distance in normalized image space. Used for a smooth blur
// gradient away from the subject, never as a claimed physical depth map.
export function backgroundDistance(
  matte: Float32Array,
  width: number,
  height: number,
): Float32Array {
  const distances = new Float32Array(matte.length);
  for (let i = 0; i < matte.length; i++)
    distances[i] = matte[i] > 0.35 ? 0 : 1e4;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (x) distances[i] = Math.min(distances[i], distances[i - 1] + 1);
      if (y) distances[i] = Math.min(distances[i], distances[i - width] + 1);
      if (x && y)
        distances[i] = Math.min(
          distances[i],
          distances[i - width - 1] + Math.SQRT2,
        );
      if (x + 1 < width && y)
        distances[i] = Math.min(
          distances[i],
          distances[i - width + 1] + Math.SQRT2,
        );
    }
  for (let y = height - 1; y >= 0; y--)
    for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x;
      if (x + 1 < width)
        distances[i] = Math.min(distances[i], distances[i + 1] + 1);
      if (y + 1 < height)
        distances[i] = Math.min(distances[i], distances[i + width] + 1);
      if (x + 1 < width && y + 1 < height)
        distances[i] = Math.min(
          distances[i],
          distances[i + width + 1] + Math.SQRT2,
        );
      if (x && y + 1 < height)
        distances[i] = Math.min(
          distances[i],
          distances[i + width - 1] + Math.SQRT2,
        );
    }
  const scale = Math.min(width, height);
  for (let i = 0; i < distances.length; i++) distances[i] /= scale;
  return distances;
}
