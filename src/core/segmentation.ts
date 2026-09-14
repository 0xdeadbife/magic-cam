import { stabilizeMatte } from "./matte";
import { appUrl } from "./urls";
export type PersonMask = {
  values: Float32Array;
  width: number;
  height: number;
  timestamp: number;
  revision: number;
};

export class PersonSegmenter {
  private worker: Worker | null = null;
  private input = document.createElement("canvas");
  private ctx = this.input.getContext("2d")!;
  private generation = 0;
  private watchdog: ReturnType<typeof setTimeout> | undefined;
  private ready = false;
  private busy = false;
  private lastSubmitted = 0;
  private mask: PersonMask | null = null;
  private revision = 0;
  constructor(
    private onStatus: (
      status: "loading" | "ready" | "lost" | "error",
      ms?: number,
      error?: string,
    ) => void,
  ) {}
  start() {
    this.stop();
    const generation = this.generation;
    this.onStatus("loading");
    try {
      if (!("OffscreenCanvas" in window))
        throw new Error(
          "Backdrop Blur needs a browser with Worker canvas support. Try Chrome or Edge.",
        );
      const worker = (this.worker = new Worker(
        appUrl("segmentation-worker.js"),
      ));
      worker.onmessage = ({ data }) => {
        if (generation !== this.generation) return;
        clearTimeout(this.watchdog);
        if (data.type === "ready") {
          this.ready = true;
          return;
        }
        if (data.type === "error") {
          this.fail(data.message);
          return;
        }
        if (data.type === "mask") {
          this.busy = false;
          if (performance.now() - data.timestamp > 250) {
            this.mask = null;
            this.onStatus("lost", data.ms);
            return;
          }
          const previous = this.mask;
          const sameSize =
            previous &&
            previous.width === data.width &&
            previous.height === data.height;
          const values = stabilizeMatte(
            data.values,
            sameSize ? previous.values : null,
            previous ? data.timestamp - previous.timestamp : 1000,
          );
          this.mask = {
            values,
            width: data.width,
            height: data.height,
            timestamp: data.timestamp,
            revision: ++this.revision,
          };
          let coverage = 0;
          for (const value of values) if (value > 0.5) coverage++;
          this.onStatus(
            coverage / values.length > 0.003 ? "ready" : "lost",
            data.ms,
          );
        }
      };
      worker.onerror = (event) => {
        if (generation === this.generation) this.fail(event.message);
      };
      this.watchdog = setTimeout(
        () => this.fail("Background model did not load. Toggle blur to retry."),
        20000,
      );
      worker.postMessage({ type: "init" });
    } catch (error) {
      this.fail(String(error));
    }
  }
  submit(video: HTMLVideoElement, now: number) {
    if (!this.ready || this.busy || now - this.lastSubmitted < 66.7) return;
    this.busy = true;
    this.lastSubmitted = now;
    const generation = this.generation;
    const width = 384,
      height = Math.max(
        1,
        Math.round((width * video.videoHeight) / video.videoWidth),
      );
    if (this.input.width !== width) this.input.width = width;
    if (this.input.height !== height) this.input.height = height;
    this.ctx.drawImage(video, 0, 0, width, height);
    createImageBitmap(this.input)
      .then((frame) => {
        if (generation !== this.generation || !this.worker) {
          frame.close();
          return;
        }
        this.watchdog = setTimeout(
          () =>
            this.fail(
              "Background tracker stopped responding. Toggle blur to retry.",
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
  }
  currentMask(now: number): PersonMask | null {
    return this.mask && now - this.mask.timestamp < 250 ? this.mask : null;
  }
  private fail(error: string) {
    this.stop();
    this.onStatus("error", undefined, error);
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
    this.ready = false;
    this.busy = false;
    this.mask = null;
    this.lastSubmitted = 0;
  }
}
