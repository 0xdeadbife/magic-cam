import { CameraCapture } from "./capture";
import { appUrl } from "./urls";
import { FaceTracker } from "./tracking";
import { PersonSegmenter } from "./segmentation";
import { BackgroundBlurEffect } from "./background-blur";
import { FilmGrainEffect } from "./grain";
import { ImageEffect, PixelateEffect, type Effect } from "./effects";
import {
  defaults,
  initialState,
  type Settings,
  type StudioState,
} from "./types";

export class Studio {
  settings: Settings = { ...defaults };
  state: StudioState = { ...initialState };
  readonly image = new ImageEffect();
  private effects: Effect[] = [
    new BackgroundBlurEffect((now) => this.segmenter.currentMask(now)),
    new PixelateEffect(),
    new FilmGrainEffect(),
    this.image,
  ];
  private ctx: CanvasRenderingContext2D;
  private camera = new CameraCapture(() => {
    this.stop();
    this.patch({
      capture: "disconnected",
      message: "Camera disconnected. Reconnect it and start again.",
    });
  });
  private tracker = new FaceTracker(
    (status, mode, error) => {
      this.patch({
        tracking: status === "ready" ? "searching" : status,
        trackingMode: mode,
        trackingError: error || "",
      });
    },
    (ms, found) => {
      this.state.inferenceMs = ms;
      this.state.tracking = found ? "tracked" : "lost";
      this.dirty = true;
    },
  );
  private segmenter = new PersonSegmenter((status, ms, error) => {
    this.state.segmentation = status;
    if (ms !== undefined) this.state.segmentationMs = ms;
    this.state.segmentationError = error || "";
    this.dirty = true;
    if (status === "loading" || status === "error")
      this.notify({ ...this.state });
  });
  private raf = 0;
  private scheduler: Window = window;
  private lastVideoTime = -1;
  private lastDraw = 0;
  private lastStats = 0;
  private frames = 0;
  private dirty = true;
  private frozenFrame = document.createElement("canvas");
  private freezeUntil: number | null = null;
  private popup: Window | null = null;
  private outputStream: MediaStream | null = null;
  private outputTimer: ReturnType<typeof setInterval> | undefined;
  private generation = 0;
  constructor(
    readonly canvas: HTMLCanvasElement,
    private notify: (state: StudioState) => void,
  ) {
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    canvas.width = 1280;
    canvas.height = 720;
    this.clear();
    window.addEventListener("message", this.outputMessage);
    window.addEventListener("beforeunload", this.dispose);
  }
  private patch(update: Partial<StudioState>) {
    Object.assign(this.state, update);
    this.notify({ ...this.state });
  }
  async start(deviceId: string) {
    this.stop();
    const generation = this.generation;
    this.patch({ capture: "starting", message: "Waiting for camera access…" });
    try {
      if (
        !(await this.camera.start(deviceId)) ||
        generation !== this.generation
      )
        return;
      const video = this.camera.video;
      this.canvas.width = video.videoWidth;
      this.canvas.height = video.videoHeight;
      this.patch({
        capture: "live",
        message: "",
        width: video.videoWidth,
        height: video.videoHeight,
      });
      this.lastVideoTime = -1;
      this.lastStats = performance.now();
      this.frames = 0;
      this.dirty = true;
      this.syncTracking();
      this.syncSegmentation();
      this.schedule();
    } catch (error) {
      if (generation !== this.generation) return;
      this.camera.stop();
      const name = error instanceof DOMException ? error.name : "";
      this.patch({
        capture: name === "NotAllowedError" ? "denied" : "error",
        message:
          name === "NotAllowedError"
            ? "Camera permission denied. Allow camera access in your browser’s site settings, then try again."
            : name === "NotFoundError" || name === "OverconstrainedError"
              ? "That camera is unavailable. Select another camera and retry."
              : name === "NotReadableError"
                ? "Camera is busy or unavailable. Close other apps using it and retry."
                : String(error),
      });
    }
  }
  stop() {
    this.generation++;
    this.scheduler.cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.camera.stop();
    this.tracker.stop();
    this.segmenter.stop();
    for (const effect of this.effects)
      if (effect !== this.image) effect.dispose?.();
    this.freezeUntil = null;
    this.patch({
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
      frozen: false,
      freezeRemaining: null,
    });
    this.clear();
  }
  update(settings: Settings) {
    const trackingChanged =
      settings.pixelate !== this.settings.pixelate ||
      settings.imageMode !== this.settings.imageMode;
    const segmentationChanged =
      settings.backgroundBlur !== this.settings.backgroundBlur ||
      (settings.blurAmount === 0) !== (this.settings.blurAmount === 0) ||
      settings.imageMode !== this.settings.imageMode;
    this.settings = { ...settings };
    this.dirty = true;
    if (trackingChanged) this.syncTracking();
    if (segmentationChanged) this.syncSegmentation();
  }
  private syncSegmentation() {
    if (
      this.state.capture === "live" &&
      this.settings.backgroundBlur &&
      this.settings.blurAmount > 0 &&
      this.settings.imageMode !== "replace"
    ) {
      if (
        this.state.segmentation === "off" ||
        this.state.segmentation === "error"
      )
        this.segmenter.start();
    } else {
      this.segmenter.stop();
      this.patch({
        segmentation: "off",
        segmentationMs: null,
        segmentationError: "",
      });
    }
  }
  private syncTracking() {
    if (
      this.state.capture === "live" &&
      this.settings.pixelate &&
      this.settings.imageMode !== "replace"
    ) {
      if (this.state.tracking === "off" || this.state.tracking === "error")
        void this.tracker.start();
    } else {
      this.tracker.stop();
      this.patch({
        tracking: "off",
        trackingMode: null,
        trackingError: "",
        inferenceMs: null,
      });
    }
  }
  setImage(image: ImageBitmap | null) {
    this.image.setImage(image);
    this.dirty = true;
  }
  freeze(seconds: number) {
    if (this.state.capture !== "live") return;
    // Snapshot exactly what was last presented, including all overlay stages.
    this.frozenFrame.width = this.canvas.width;
    this.frozenFrame.height = this.canvas.height;
    this.frozenFrame.getContext("2d")!.drawImage(this.canvas, 0, 0);
    this.freezeUntil = seconds > 0 ? performance.now() + seconds * 1000 : null;
    this.patch({ frozen: true, freezeRemaining: seconds > 0 ? seconds : null });
  }
  release() {
    this.freezeUntil = null;
    this.patch({ frozen: false, freezeRemaining: null });
    this.dirty = true;
  }
  reset() {
    this.release();
    this.update({ ...defaults });
  }
  private schedule() {
    this.raf = this.scheduler.requestAnimationFrame(this.tick);
  }
  private tick = () => {
    if (this.state.capture !== "live") return;
    const now = performance.now();
    if (this.state.frozen && this.freezeUntil !== null) {
      this.state.freezeRemaining = Math.max(0, (this.freezeUntil - now) / 1000);
      if (now >= this.freezeUntil) this.release();
    }
    const video = this.camera.video;
    const fresh =
      video.readyState >= 2 && video.currentTime !== this.lastVideoTime;
    if (fresh) {
      this.lastVideoTime = video.currentTime;
      if (
        !this.state.frozen &&
        this.settings.pixelate &&
        this.settings.imageMode !== "replace"
      )
        this.tracker.submit(video, now);
      if (
        !this.state.frozen &&
        this.settings.backgroundBlur &&
        this.settings.imageMode !== "replace"
      )
        this.segmenter.submit(video, now);
    }
    if (!this.state.frozen && video.readyState >= 2 && (fresh || this.dirty)) {
      this.compose(now);
      this.frames++;
      this.dirty = false;
      this.requestOutputFrame();
    }
    // A frozen canvas already contains the snapshot. Do not redraw or infer while held.
    if (now - this.lastStats >= 500) {
      this.state.fps = (this.frames * 1000) / (now - this.lastStats);
      if (
        !this.state.frozen &&
        this.state.segmentation === "ready" &&
        !this.segmenter.currentMask(now)
      )
        this.state.segmentation = "lost";
      this.frames = 0;
      this.lastStats = now;
      if (
        !this.state.frozen &&
        this.state.tracking === "tracked" &&
        !this.tracker.currentBox(now)
      )
        this.state.tracking = "lost";
      this.notify({ ...this.state });
    }
    this.schedule();
  };
  private compose(now: number) {
    const { canvas, ctx, settings } = this,
      { width, height } = canvas;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);
    if (settings.imageMode === "replace" && this.image.image) {
      const image = this.image.image,
        scale = Math.min(width / image.width, height / image.height);
      ctx.drawImage(
        image,
        (width - image.width * scale) / 2,
        (height - image.height * scale) / 2,
        image.width * scale,
        image.height * scale,
      );
    } else {
      ctx.save();
      if (settings.mirror) {
        ctx.translate(width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(this.camera.video, 0, 0, width, height);
      ctx.restore();
    }
    const frame = {
      ctx,
      canvas,
      settings,
      face: this.tracker.currentBox(now),
      now,
      delta: now - this.lastDraw,
    };
    for (const stage of ["background", "face", "finish", "overlay"])
      for (const effect of this.effects)
        if (effect.stage === stage) effect.render(frame);
    this.lastDraw = now;
  }
  private clear() {
    this.ctx.fillStyle = "#08090b";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.requestOutputFrame();
  }
  private requestOutputFrame() {
    const track = this.outputStream?.getVideoTracks()[0] as
      CanvasCaptureMediaStreamTrack | undefined;
    track?.requestFrame?.();
  }
  openOutput(): boolean {
    if (this.popup && !this.popup.closed) {
      this.popup.focus();
      return true;
    }
    // Reopening before the close poll fires must not leave its old timer running.
    clearInterval(this.outputTimer);
    this.popup = window.open(
      appUrl("?output=1"),
      "magic-cam-clean-output",
      "popup=yes,width=1280,height=760",
    );
    if (!this.popup) return false;
    this.outputTimer = setInterval(() => {
      if (this.popup?.closed) this.closeOutput();
    }, 500);
    this.patch({ outputOpen: true });
    return true;
  }
  private outputMessage = (event: MessageEvent) => {
    if (
      event.origin !== location.origin ||
      event.source !== this.popup ||
      event.data !== "magic-cam-output-ready"
    )
      return;
    const video = this.popup!.document.querySelector("video");
    if (!video) return;
    this.outputStream ??= this.canvas.captureStream(0);
    video.srcObject = this.outputStream;
    void video.play().catch(() => {
      /* Muted autoplay is allowed in supported browsers. */
    });
    this.scheduler.cancelAnimationFrame(this.raf);
    this.scheduler = this.popup!;
    if (this.state.capture === "live") this.schedule();
    // captureStream(0) emits on a canvas paint, even when requestFrame is used.
    // Repaint the held composition so opening output during a freeze gets a frame.
    this.ctx.drawImage(
      this.state.frozen ? this.frozenFrame : this.canvas,
      0,
      0,
    );
    this.requestOutputFrame();
  };
  closeOutput = () => {
    this.scheduler.cancelAnimationFrame(this.raf);
    this.scheduler = window;
    this.popup?.close();
    this.popup = null;
    clearInterval(this.outputTimer);
    this.outputStream?.getTracks().forEach((track) => track.stop());
    this.outputStream = null;
    this.patch({ outputOpen: false });
    if (this.state.capture === "live") this.schedule();
  };
  dispose = () => {
    this.stop();
    this.closeOutput();
    this.effects.forEach((effect) => effect.dispose?.());
    this.frozenFrame.width = 0;
    this.frozenFrame.height = 0;
    window.removeEventListener("message", this.outputMessage);
    window.removeEventListener("beforeunload", this.dispose);
  };
}
