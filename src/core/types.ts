export type Box = { x: number; y: number; width: number; height: number };
export type Settings = {
  mirror: boolean;
  pixelate: boolean;
  pixelSize: number;
  grain: boolean;
  grainAmount: number;
  grainSize: number;
  backgroundBlur: boolean;
  blurAmount: number;
  blurFalloff: number;
  imageMode: "off" | "replace" | "overlay";
  imageX: number;
  imageY: number;
  imageSize: number;
  imageOpacity: number;
};
export const defaults: Settings = {
  mirror: false,
  pixelate: false,
  pixelSize: 18,
  grain: false,
  grainAmount: 28,
  grainSize: 30,
  backgroundBlur: false,
  blurAmount: 45,
  blurFalloff: 65,
  imageMode: "off",
  imageX: 50,
  imageY: 50,
  imageSize: 40,
  imageOpacity: 100,
};
export type StudioState = {
  capture: "idle" | "starting" | "live" | "denied" | "disconnected" | "error";
  message: string;
  tracking: "off" | "loading" | "searching" | "tracked" | "lost" | "error";
  trackingMode: "worker" | "main" | null;
  trackingError: string;
  fps: number;
  inferenceMs: number | null;
  segmentation: "off" | "loading" | "ready" | "lost" | "error";
  segmentationMs: number | null;
  segmentationError: string;
  width: number;
  height: number;
  frozen: boolean;
  freezeRemaining: number | null;
  outputOpen: boolean;
};
export const initialState: StudioState = {
  capture: "idle",
  message: "",
  tracking: "off",
  trackingMode: null,
  trackingError: "",
  fps: 0,
  inferenceMs: null,
  segmentation: "off",
  segmentationMs: null,
  segmentationError: "",
  width: 1280,
  height: 720,
  frozen: false,
  freezeRemaining: null,
  outputOpen: false,
};
