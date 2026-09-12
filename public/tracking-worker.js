/* Classic worker: the MediaPipe WASM loader uses importScripts. */
const assetUrl = (path) => new URL(path, self.location.href).href;
importScripts(assetUrl("vendor/vision/vision_bundle.js"));
let model = null;
self.onmessage = async ({ data }) => {
  try {
    if (data.type === "init") {
      const files = await Vision.FilesetResolver.forVisionTasks(
        assetUrl("vendor/vision"),
      );
      model = await Vision.FaceLandmarker.createFromOptions(files, {
        baseOptions: {
          modelAssetPath: assetUrl("models/face_landmarker.task"),
          delegate: "CPU",
        },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false,
      });
      self.postMessage({ type: "ready" });
    } else if (data.type === "frame") {
      const start = performance.now();
      try {
        const result = model.detectForVideo(data.frame, data.timestamp);
        self.postMessage({
          type: "result",
          points: result.faceLandmarks[0] || [],
          ms: performance.now() - start,
        });
      } finally {
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
