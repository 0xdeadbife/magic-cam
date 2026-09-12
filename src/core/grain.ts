import type { Effect, EffectContext } from "./effects";

/** Fine monochrome density variation, blended in luminance rather than RGB specks. */
export class FilmGrainEffect implements Effect {
  id = "film-grain";
  stage = "finish" as const;
  private tiles: HTMLCanvasElement[] = [];
  private patterns: CanvasPattern[] = [];
  private seed = 0x6d2b79f5;
  private frame = -1;
  private tile = 0;
  private offsetX = 0;
  private offsetY = 0;
  private random() {
    this.seed ^= this.seed << 13;
    this.seed ^= this.seed >>> 17;
    this.seed ^= this.seed << 5;
    return (this.seed >>> 0) / 4294967296;
  }
  private prepare(ctx: CanvasRenderingContext2D) {
    for (let n = 0; n < 3; n++) {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 512;
      const target = canvas.getContext("2d")!;
      const pixels = target.createImageData(512, 512);
      const noise = new Float32Array(512 * 512);
      for (let i = 0; i < noise.length; i++)
        noise[i] =
          (this.random() + this.random() + this.random() + this.random() - 2) *
          62;
      for (let y = 0; y < 512; y++)
        for (let x = 0; x < 512; x++) {
          const i = y * 512 + x;
          // A little local correlation produces tiny irregular grain clusters.
          const value =
            128 +
            noise[i] * 0.84 +
            noise[y * 512 + ((x + 511) % 512)] * 0.08 +
            noise[((y + 511) % 512) * 512 + x] * 0.08;
          const p = i * 4;
          pixels.data[p] = pixels.data[p + 1] = pixels.data[p + 2] = value;
          pixels.data[p + 3] = 255;
        }
      target.putImageData(pixels, 0, 0);
      this.tiles.push(canvas);
      this.patterns.push(ctx.createPattern(canvas, "repeat")!);
    }
  }
  render({ ctx, canvas, settings, now }: EffectContext) {
    if (!settings.grain || settings.grainAmount <= 0) return;
    if (!this.tiles.length) this.prepare(ctx);
    const frame = Math.floor(now / (1000 / 24));
    if (frame !== this.frame) {
      this.frame = frame;
      this.tile = (this.tile + 1 + Math.floor(this.random() * 2)) % 3;
      this.offsetX = Math.floor(this.random() * 512);
      this.offsetY = Math.floor(this.random() * 512);
    }
    const scale =
      Math.max(0.6, canvas.height / 720) *
      (0.75 + (settings.grainSize / 100) * 1.35);
    const pattern = this.patterns[this.tile];
    pattern.setTransform(
      new DOMMatrix().translate(this.offsetX, this.offsetY).scale(scale),
    );
    ctx.save();
    ctx.globalCompositeOperation = "soft-light";
    ctx.globalAlpha = (settings.grainAmount / 100) * 0.8;
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }
  dispose() {
    this.patterns = [];
    for (const tile of this.tiles) {
      tile.width = tile.height = 0;
    }
    this.tiles = [];
    this.frame = -1;
  }
}
