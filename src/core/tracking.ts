import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import { landmarkBox, smoothBox } from "./geometry";
import type { Box } from "./types";
import { appUrl } from "./urls";
export class FaceTracker {
  box: Box | null = null;
  lastSeen = 0;
  private lastResult = 0;
  private worker: Worker | null = null;
  private model: FaceLandmarker | null = null;
  private busy = false;
  private lastSubmitted = 0;
  private generation = 0;
  private watchdog: ReturnType<typeof setTimeout> | undefined;
  private input = document.createElement("canvas");
  private ctx = this.input.getContext("2d")!;
  ready = false;
  mode: "worker" | "main" | null = null;
  constructor(
    private onStatus: (
      status: "loading" | "ready" | "error",
      mode: "worker" | "main" | null,
      error?: string,
    ) => void,
    private onResult: (ms: number, found: boolean) => void,
  ) {}
  async start() {
    this.stop();
    const generation = this.generation;
    this.onStatus("loading", null);
    try {
      await new Promise<void>((resolve, reject) => {
        if (!("OffscreenCanvas" in window))
          return reject(new Error("OffscreenCanvas unavailable"));
        const worker = (this.worker = new Worker(appUrl("tracking-worker.js")));
        this.watchdog = setTimeout(
          () => reject(new Error("Worker initialization timed out")),
          20000,
        );
        worker.onerror = (event) => reject(new Error(event.message));
        worker.onmessage = ({ data }) => {
          if (generation !== this.generation) return;
          if (data.type === "ready") {
            clearTimeout(this.watchdog);
            resolve();
          }
          if (data.type === "error") {
            if (!this.ready) reject(new Error(data.message));
            else this.fail(data.message);
          }
          if (data.type === "result") {
            clearTimeout(this.watchdog);
            this.busy = false;
            this.accept(data.points, data.ms);
          }
        };
        worker.postMessage({ type: "init" });
      });
      if (generation !== this.generation) return;
      this.mode = "worker";
      this.worker!.onerror = (event) => this.fail(event.message);
    } catch {
      if (generation !== this.generation) return;
      clearTimeout(this.watchdog);
      this.worker?.terminate();
      this.worker = null;
      try {
        const { FilesetResolver, FaceLandmarker } =
          await import("@mediapipe/tasks-vision");
        const files = await FilesetResolver.forVisionTasks(
          appUrl("vendor/vision"),
        );
        const model = await FaceLandmarker.createFromOptions(files, {
          baseOptions: {
            modelAssetPath: appUrl("models/face_landmarker.task"),
            delegate: "CPU",
          },
          runningMode: "VIDEO",
          numFaces: 1,
        });
        if (generation !== this.generation) {
          model.close();
          return;
        }
        this.model = model;
        this.mode = "main";
      } catch (error) {
        if (generation === this.generation) this.fail(String(error));
        return;
      }
    }
    this.ready = true;
    this.onStatus("ready", this.mode);
  }
  submit(video: HTMLVideoElement, now: number) {
    if (
      !this.ready ||
      this.busy ||
      now - this.lastSubmitted < (this.mode === "worker" ? 66.7 : 125)
    )
      return;
    this.lastSubmitted = now;
    this.busy = true;
    const generation = this.generation;
    const height = Math.round((320 * video.videoHeight) / video.videoWidth);
    if (this.input.width !== 320) this.input.width = 320;
    if (this.input.height !== height) this.input.height = height;
    this.ctx.drawImage(video, 0, 0, this.input.width, this.input.height);
    if (this.worker) {
      createImageBitmap(this.input)
        .then((frame) => {
          if (generation !== this.generation || !this.worker) {
            frame.close();
            return;
          }
          this.watchdog = setTimeout(
            () =>
              this.fail(
                "Face tracker stopped responding. Toggle Face Mosaic to retry.",
              ),
            5000,
          );
          this.worker.postMessage({ type: "frame", frame, timestamp: now }, [
            frame,
          ]);
        })
        .catch((error) => {
          if (generation === this.generation) this.fail(String(error));
        });
    } else {
      try {
        const start = performance.now();
        const result = this.model!.detectForVideo(this.input, now);
        this.accept(result.faceLandmarks[0] || [], performance.now() - start);
      } catch (error) {
        this.fail(String(error));
      } finally {
        this.busy = false;
      }
    }
  }
  private accept(points: { x: number; y: number }[], ms: number) {
    const now = performance.now(),
      next = landmarkBox(points);
    if (next) {
      this.box = smoothBox(
        now - this.lastSeen < 250 ? this.box : null,
        next,
        now - this.lastResult,
      );
      this.lastSeen = now;
    } else if (now - this.lastSeen > 250) this.box = null;
    this.lastResult = now;
    this.onResult(ms, Boolean(next));
  }
  currentBox(now: number) {
    return now - this.lastSeen < 250 ? this.box : null;
  }
  private fail(error: string) {
    this.stop();
    this.onStatus("error", null, error);
  }
  stop() {
    this.generation++;
    clearTimeout(this.watchdog);
    if (this.worker) {
      const worker = this.worker;
      worker.postMessage({ type: "close" });
      setTimeout(() => worker.terminate(), 100);
    }
    this.worker = null;
    this.model?.close();
    this.model = null;
    this.ready = false;
    this.busy = false;
    this.mode = null;
    this.box = null;
    this.lastSeen = 0;
    this.lastSubmitted = 0;
  }
}
