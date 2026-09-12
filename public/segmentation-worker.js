/* Classic worker for the MediaPipe WASM loader. No camera acquisition here. */
const assetUrl = (path) => new URL(path, self.location.href).href;
importScripts(assetUrl("vendor/vision/vision_bundle.js"));
let model;
self.onmessage = async ({ data }) => {
  try {
    if (data.type === "init") {
      const files = await Vision.FilesetResolver.forVisionTasks(
        assetUrl("vendor/vision"),
      );
      model = await Vision.ImageSegmenter.createFromOptions(files, {
        baseOptions: {
          modelAssetPath: assetUrl("models/selfie_segmenter.tflite"),
          delegate: "CPU",
        },
        runningMode: "VIDEO",
        outputCategoryMask: false,
        outputConfidenceMasks: true,
      });
      self.postMessage({ type: "ready" });
    } else if (data.type === "frame") {
      const start = performance.now();
      let result;
      try {
        result = model.segmentForVideo(data.frame, data.timestamp);
        const masks = result.confidenceMasks;
        // Binary SelfieSegmenter exposes one foreground confidence mask; models
        // with explicit background/person channels put the person at index 1.
        const mask = masks[masks.length === 1 ? 0 : 1];
        const values = new Float32Array(mask.getAsFloat32Array());
        self.postMessage(
          {
            type: "mask",
            values,
            width: mask.width,
            height: mask.height,
            timestamp: data.timestamp,
            ms: performance.now() - start,
          },
          [values.buffer],
        );
      } finally {
        result?.close();
        data.frame.close();
      }
    } else if (data.type === "close") {
      model?.close();
      model = null;
      self.close();
    }
  } catch (error) {
    self.postMessage({ type: "error", message: String(error) });
  }
};
