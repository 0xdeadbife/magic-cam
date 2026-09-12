import type { Box, Settings } from "./types";
import { mirrorBox } from "./geometry";
export type EffectContext = {
  ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  settings: Settings;
  face: Box | null;
  now: number;
  delta: number;
};
// Future transient effects can keep their own lifetime and use face as an optional anchor.
export interface Effect {
  id: string;
  stage: "background" | "face" | "finish" | "overlay";
  render(frame: EffectContext): void;
  dispose?(): void;
}
export class PixelateEffect implements Effect {
  id = "pixelate";
  stage = "face" as const;
  private buffer = document.createElement("canvas");
  private ctx = this.buffer.getContext("2d")!;
  render({ ctx, canvas, settings, face }: EffectContext) {
    if (!settings.pixelate || !face || settings.imageMode === "replace") return;
    const box = settings.mirror ? mirrorBox(face) : face;
    const x = Math.floor(box.x * canvas.width),
      y = Math.floor(box.y * canvas.height);
    const w = Math.min(canvas.width - x, Math.ceil(box.width * canvas.width)),
      h = Math.min(canvas.height - y, Math.ceil(box.height * canvas.height));
    if (w <= 0 || h <= 0) return;
    const bufferWidth = Math.max(1, Math.ceil(w / settings.pixelSize));
    const bufferHeight = Math.max(1, Math.ceil(h / settings.pixelSize));
    if (this.buffer.width !== bufferWidth) this.buffer.width = bufferWidth;
    if (this.buffer.height !== bufferHeight) this.buffer.height = bufferHeight;
    this.ctx.drawImage(
      canvas,
      x,
      y,
      w,
      h,
      0,
      0,
      this.buffer.width,
      this.buffer.height,
    );
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      this.buffer,
      0,
      0,
      this.buffer.width,
      this.buffer.height,
      x,
      y,
      w,
      h,
    );
    ctx.restore();
  }
}
export class ImageEffect implements Effect {
  id = "image";
  stage = "overlay" as const;
  image: ImageBitmap | null = null;
  setImage(image: ImageBitmap | null) {
    this.image?.close();
    this.image = image;
  }
  render({ ctx, canvas, settings }: EffectContext) {
    if (!this.image || settings.imageMode !== "overlay") return;
    // Size is relative to the contained image, keeping portrait uploads on-screen.
    const scale =
      (Math.min(
        canvas.width / this.image.width,
        canvas.height / this.image.height,
      ) *
        settings.imageSize) /
      100;
    const w = this.image.width * scale,
      h = this.image.height * scale;
    ctx.save();
    ctx.globalAlpha = settings.imageOpacity / 100;
    ctx.drawImage(
      this.image,
      ((canvas.width - w) * settings.imageX) / 100,
      ((canvas.height - h) * settings.imageY) / 100,
      w,
      h,
    );
    ctx.restore();
  }
  dispose() {
    this.setImage(null);
  }
}
