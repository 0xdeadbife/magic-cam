import type { Effect, EffectContext } from "./effects";
import type { PersonMask } from "./segmentation";
import { backgroundDistance, smoothstep } from "./matte";

function buffer(read = false) {
  const canvas = document.createElement("canvas");
  return {
    canvas,
    ctx: canvas.getContext("2d", { willReadFrequently: read })!,
  };
}
type Buffer = ReturnType<typeof buffer>;
function size(buffer: Buffer, width: number, height: number) {
  if (buffer.canvas.width !== width) buffer.canvas.width = width;
  if (buffer.canvas.height !== height) buffer.canvas.height = height;
  buffer.ctx.clearRect(0, 0, width, height);
}

export class BackgroundBlurEffect implements Effect {
  id = "background-blur";
  stage = "background" as const;
  private rawMask = buffer();
  private matte = buffer();
  private exclusion = buffer();
  private farMask = buffer();
  private source = buffer();
  private background = buffer();
  private padded = buffer();
  private near = buffer(true);
  private far = buffer(true);
  private blend = buffer();
  private foreground = buffer();
  private revision = -1;
  private falloff = -1;
  private mirrored = false;
  constructor(private getMask: (now: number) => PersonMask | null) {}

  private prepareMasks(mask: PersonMask, mirror: boolean, falloff: number) {
    const { width, height, values } = mask;
    const distance = backgroundDistance(values, width, height);
    const personPixels = this.rawMask.ctx.createImageData(width, height);
    const excludePixels = this.rawMask.ctx.createImageData(width, height);
    const farPixels = this.rawMask.ctx.createImageData(width, height);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const p = (y * width + (mirror ? width - 1 - x : x)) * 4;
        personPixels.data[p] =
          personPixels.data[p + 1] =
          personPixels.data[p + 2] =
            255;
        excludePixels.data[p] =
          excludePixels.data[p + 1] =
          excludePixels.data[p + 2] =
            255;
        farPixels.data[p] = farPixels.data[p + 1] = farPixels.data[p + 2] = 255;
        personPixels.data[p + 3] = values[i] * 255;
        excludePixels.data[p + 3] = values[i] * 255;
        farPixels.data[p + 3] =
          (falloff === 0
            ? 1
            : smoothstep(0, 0.025 + (falloff / 100) * 0.28, distance[i])) * 255;
      }
    size(this.rawMask, width, height);
    this.rawMask.ctx.putImageData(personPixels, 0, 0);
    size(this.matte, width, height);
    this.matte.ctx.save();
    this.matte.ctx.filter = "blur(0.55px)";
    this.matte.ctx.drawImage(
      this.rawMask.canvas,
      -1,
      -1,
      width + 2,
      height + 2,
    );
    this.matte.ctx.restore();
    size(this.exclusion, width, height);
    this.exclusion.ctx.putImageData(excludePixels, 0, 0);
    size(this.farMask, width, height);
    this.farMask.ctx.putImageData(farPixels, 0, 0);
    this.revision = mask.revision;
    this.falloff = falloff;
    this.mirrored = mirror;
  }

  private blurInto(
    target: Buffer,
    radius: number,
    width: number,
    height: number,
  ) {
    const pad = Math.max(2, Math.ceil(radius * 3));
    size(this.padded, width + pad * 2, height + pad * 2);
    const p = this.padded.ctx,
      image = this.background.canvas;
    p.drawImage(image, pad, pad);
    p.drawImage(image, 0, 0, width, 1, pad, 0, width, pad);
    p.drawImage(image, 0, height - 1, width, 1, pad, pad + height, width, pad);
    p.drawImage(image, 0, 0, 1, height, 0, pad, pad, height);
    p.drawImage(image, width - 1, 0, 1, height, width + pad, pad, pad, height);
    for (const [sx, sy, dx, dy] of [
      [0, 0, 0, 0],
      [width - 1, 0, width + pad, 0],
      [0, height - 1, 0, height + pad],
      [width - 1, height - 1, width + pad, height + pad],
    ])
      p.drawImage(image, sx, sy, 1, 1, dx, dy, pad, pad);
    size(target, width, height);
    target.ctx.save();
    target.ctx.filter = `blur(${radius}px)`;
    target.ctx.drawImage(this.padded.canvas, -pad, -pad);
    target.ctx.restore();
    const pixels = target.ctx.getImageData(0, 0, width, height);
    for (let i = 3; i < pixels.data.length; i += 4) pixels.data[i] = 255;
    target.ctx.putImageData(pixels, 0, 0);
  }

  render({ canvas, ctx, settings, now }: EffectContext) {
    if (
      !settings.backgroundBlur ||
      settings.blurAmount <= 0 ||
      settings.imageMode === "replace"
    )
      return;
    const mask = this.getMask(now);
    if (!mask) return;
    const width = Math.min(480, canvas.width);
    const height = Math.max(
      1,
      Math.round((width * canvas.height) / canvas.width),
    );
    if (
      mask.revision !== this.revision ||
      settings.blurFalloff !== this.falloff ||
      settings.mirror !== this.mirrored
    )
      this.prepareMasks(mask, settings.mirror, settings.blurFalloff);
    size(this.source, width, height);
    this.source.ctx.drawImage(canvas, 0, 0, width, height);
    size(this.background, width, height);
    this.background.ctx.drawImage(this.source.canvas, 0, 0);
    // Keep the source opaque while filtering. Cutting the person out before a
    // canvas blur leaves transparent kernels; browsers unpremultiply those
    // kernels as black, producing the hard dark patches seen around chairs and
    // headphones. The original subject is composited back below, so a small
    // amount of color bleed is hidden by the soft matte edge.
    const radius =
      ((0.8 + Math.pow(settings.blurAmount / 100, 1.35) * 18) * height) / 720;
    this.blurInto(this.far, radius, width, height);
    this.blurInto(this.near, Math.max(0.35, radius * 0.3), width, height);
    size(this.blend, width, height);
    this.blend.ctx.drawImage(this.far.canvas, 0, 0);
    this.blend.ctx.save();
    this.blend.ctx.globalCompositeOperation = "destination-in";
    this.blend.ctx.drawImage(this.farMask.canvas, 0, 0, width, height);
    this.blend.ctx.restore();
    this.near.ctx.drawImage(this.blend.canvas, 0, 0);
    size(this.foreground, canvas.width, canvas.height);
    this.foreground.ctx.drawImage(canvas, 0, 0);
    this.foreground.ctx.save();
    this.foreground.ctx.globalCompositeOperation = "destination-in";
    this.foreground.ctx.drawImage(
      this.matte.canvas,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    this.foreground.ctx.restore();
    const freshness = Math.min(
      1,
      Math.max(0, (250 - (now - mask.timestamp)) / 100),
    );
    ctx.save();
    ctx.globalAlpha = freshness;
    ctx.drawImage(this.near.canvas, 0, 0, canvas.width, canvas.height);
    ctx.restore();
    ctx.drawImage(this.foreground.canvas, 0, 0);
  }
  dispose() {
    for (const value of [
      this.rawMask,
      this.matte,
      this.exclusion,
      this.farMask,
      this.source,
      this.background,
      this.padded,
      this.near,
      this.far,
      this.blend,
      this.foreground,
    ])
      value.canvas.width = value.canvas.height = 0;
    this.revision = -1;
  }
}
