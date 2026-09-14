import { defaults, type Settings } from "./types";

const STORAGE_KEY = "magic-cam.controls.v1";
const durations = new Set([-1, 0, 3, 5, 10, 30]);

export type SavedControls = {
  settings: Settings;
  duration: number;
  customSeconds: string;
};

const fallback: SavedControls = {
  settings: { ...defaults },
  duration: 5,
  customSeconds: "8",
};

const numberWithin = (
  value: unknown,
  fallbackValue: number,
  min: number,
  max: number,
) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallbackValue;

const booleanOr = (value: unknown, fallbackValue: boolean) =>
  typeof value === "boolean" ? value : fallbackValue;

export function loadControls(storage: Pick<Storage, "getItem"> = localStorage) {
  try {
    const stored = JSON.parse(storage.getItem(STORAGE_KEY) || "null") as {
      version?: unknown;
      settings?: Record<string, unknown>;
      duration?: unknown;
      customSeconds?: unknown;
    } | null;
    if (!stored || stored.version !== 1) return fallback;
    const saved = stored.settings || {};
    const customSeconds = numberWithin(stored.customSeconds, 8, 1, 3600);
    return {
      settings: {
        mirror: booleanOr(saved.mirror, defaults.mirror),
        pixelate: booleanOr(saved.pixelate, defaults.pixelate),
        pixelSize: numberWithin(saved.pixelSize, defaults.pixelSize, 4, 64),
        grain: booleanOr(saved.grain, defaults.grain),
        grainAmount: numberWithin(
          saved.grainAmount,
          defaults.grainAmount,
          0,
          100,
        ),
        grainSize: numberWithin(saved.grainSize, defaults.grainSize, 0, 100),
        backgroundBlur: booleanOr(
          saved.backgroundBlur,
          defaults.backgroundBlur,
        ),
        blurAmount: numberWithin(saved.blurAmount, defaults.blurAmount, 0, 100),
        blurFalloff: numberWithin(
          saved.blurFalloff,
          defaults.blurFalloff,
          0,
          100,
        ),
        // Uploaded pixels are intentionally not persisted, so the layer starts off.
        imageMode: "off",
        imageX: numberWithin(saved.imageX, defaults.imageX, 0, 100),
        imageY: numberWithin(saved.imageY, defaults.imageY, 0, 100),
        imageSize: numberWithin(saved.imageSize, defaults.imageSize, 5, 100),
        imageOpacity: numberWithin(
          saved.imageOpacity,
          defaults.imageOpacity,
          0,
          100,
        ),
      },
      duration:
        typeof stored.duration === "number" && durations.has(stored.duration)
          ? stored.duration
          : fallback.duration,
      customSeconds: String(customSeconds),
    } satisfies SavedControls;
  } catch {
    return fallback;
  }
}

export function saveControls(
  controls: SavedControls,
  storage: Pick<Storage, "setItem"> = localStorage,
) {
  try {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        settings: { ...controls.settings, imageMode: "off" },
        duration: controls.duration,
        customSeconds: numberWithin(Number(controls.customSeconds), 8, 1, 3600),
      }),
    );
  } catch {
    // Private browsing and storage policies may make localStorage unavailable.
  }
}

export { STORAGE_KEY };
