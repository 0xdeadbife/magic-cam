import {
  mkdir,
  copyFile,
  readdir,
  access,
  readFile,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
const target = "public/vendor/vision";
await mkdir(target, { recursive: true });
for (const name of await readdir("node_modules/@mediapipe/tasks-vision/wasm")) {
  await copyFile(
    join("node_modules/@mediapipe/tasks-vision/wasm", name),
    join(target, name),
  );
}
// The pinned SDK supplies CJS/ESM. Adapt its unmodified CJS exports for the
// classic Workers needed by the WASM importScripts loader (no eval required).
const bundle = await readFile(
  "node_modules/@mediapipe/tasks-vision/vision_bundle.cjs",
  "utf8",
);
await writeFile(
  join(target, "vision_bundle.js"),
  `(function(exports) {\n${bundle.replace(/\/\/# sourceMappingURL=.*$/m, "")}\n})(self.Vision = {});\n`,
);
await mkdir("public/models", { recursive: true });
const model = "public/models/face_landmarker.task";
try {
  await access(model);
} catch {
  console.log("Downloading Face Landmarker model (one-time setup)…");
  const response = await fetch(
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
  );
  if (!response.ok)
    throw new Error(`Model download failed: ${response.status}`);
  await writeFile(model, new Uint8Array(await response.arrayBuffer()));
}
console.log("Local vision assets ready.");
const segmenter = "public/models/selfie_segmenter.tflite";
try {
  await access(segmenter);
} catch {
  console.log("Downloading person segmentation model (one-time setup)…");
  const response = await fetch(
    "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite",
  );
  if (!response.ok)
    throw new Error(`Segmentation model download failed: ${response.status}`);
  await writeFile(segmenter, new Uint8Array(await response.arrayBuffer()));
}
