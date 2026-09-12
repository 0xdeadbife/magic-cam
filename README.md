# Magic Cam — local webcam effects studio

A working Vite + React + TypeScript studio using Canvas 2D and MediaPipe Tasks Vision FaceLandmarker and ImageSegmenter. Camera frames and uploaded images stay in browser memory. There is no video backend, analytics, or cloud inference.

## Run

Requires Node 22.12+ (developed on Node 24) and a current desktop Chrome or Edge browser.

```sh
npm install
npm run dev
```

Open **http://127.0.0.1:5173/**. The first run downloads Google's version 1 Face Landmarker and SelfieSegmenter models and copies the installed package's matching WASM files into `public/`. Subsequent runs use these local assets, including the production build. An internet connection is required only for dependency installation and those initial model downloads.

```sh
npm run build       # local asset setup, TypeScript checks, production bundle
npm run preview     # serve the built bundle
npm test            # geometry and smoothing checks
npx playwright install chromium
npm run test:e2e    # browser integration tests against the running dev server
```

`package-lock.json` locks dependency versions. Generated model/WASM assets and browser-test screenshots are ignored by git. `npm run build` includes the local assets in `dist/`.

## GitHub Pages

Repository: [0xdeadbife/magic-cam](https://github.com/0xdeadbife/magic-cam). The expected Pages address after deployment is **https://0xdeadbife.github.io/magic-cam/**.

1. In repository **Settings → Pages → Build and deployment**, set **Source** to **GitHub Actions**.
2. Push the project to the repository's default branch. The included `.github/workflows/pages.yml` installs dependencies, runs unit tests, builds the app (including local model/WASM files), tests the compiled output under a repository subpath, and deploys only `dist/`.
3. Follow **Actions → Deploy Magic Cam to GitHub Pages**. The deployment job reports the published URL. You can also launch it with **Run workflow** on the default branch.
4. Open the HTTPS URL in Chrome/Edge, grant camera permission and allow the Output popup. OBS still uses **Window Capture** on the clean-output window. No local Node server is needed for the published app.

Paths are relative to the deployed application, so the same build supports `/magic-cam/`, another repository name, or a root-domain site. Workers, their WASM/model dependencies, the main-thread fallback, icons, and the clean-output popup all stay within that base path. The workflow uses the repository's default branch automatically and requires no personal access token in the source code.

To reproduce the publication checks locally:

```sh
npx playwright install chromium
npm run test:pages
```

This builds the real production bundle and serves it at `/pages-check/` on a strict static test server. The checks cover camera capture, both model Workers, main-thread fallback, freeze/release, the shared clean-output window, and absence of external network requests in the tested pipeline. The server is shut down when tests end; the usual development server on port 5173 is unaffected.

MediaPipe Tasks Vision is pinned to **0.10.32**: the previously installed 1.0.1 emitted SDK usage logs to an external endpoint. The pinned version passes the local-only network check. Its CJS bundle is wrapped for the classic Workers during asset setup, and the matching WASM files are copied from the same package. Camera frames and uploaded images remain in memory; only app files and models are downloaded from the Pages site. Loading/reloading the hosted app requires internet access; offline installation is not implemented.

Deployment references: [Vite's Pages guide](https://vite.dev/guide/static-deploy.html#github-pages) and [GitHub Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## Use the studio

- Select your video source and start the camera. Browser camera permission is required. Changing the source restarts capture and releases the previous device.
- **Background blur** keeps the segmented person sharp. **Blur amount** controls the radius; **Falloff** graduates from a gentle blur near the person to stronger blur further into the background. Zero falloff gives uniform background blur. This is a silhouette-distance gradient, not a measured depth map. Defaults: amount 45%, falloff 65%. A separate status and measured segmentation duration appear while enabled. Amount zero suspends segmentation; image replacement pauses it too.
- **Film grain** adds fine, moving monochrome texture using soft-light density blending. **Grain amount** controls intensity; **Grain size** moves from fine to coarser texture. Defaults: amount 28%, size 30%. This is a procedural photographic simulation, not a scan of physical film. It uses locally correlated, approximately Gaussian noise, with no colored specks, scratches, exposure flicker, or color grading. Texture updates at most 24 times per second and is held exactly during freeze. Amount zero is a true bypass.
- Enable Pixelate and adjust pixel size (in output pixels). It tracks one face, with padded rectangular bounds, time-based smoothing, and a 250 ms grace period for brief detection gaps. The face-lost state is shown when detection fails; after the grace period, the old region is no longer pixelated. This visual effect does not guarantee anonymity.
- Mirror applies to the webcam and its tracked face region; uploaded graphics keep their original orientation.
- Press **Space** in the studio to hold/release the frame using the selected duration (holding the key does not repeat). The shortcut is inactive while editing fields, using a selector or switch, or viewing the help dialog. The Hold frame button also exposes the shortcut in its tooltip.
- Freeze holds the exact final composition, including overlays, for a preset, a custom 1–3600 second duration, or until released. Effect adjustments during a hold apply when live output resumes. Inference pauses during the hold; the camera stays open for immediate release. Stop clears the frame and releases the camera.
- Upload a local raster image (up to 20 MB / 32 megapixels). Overlay mode has size, opacity, and horizontal/vertical placement controls. Size is relative to the contained image, so portrait images fit inside the frame at 100%. Toggling the layer preserves Overlay or Replace mode. Replacement mode fits the full image within the output aspect ratio with black letterboxing and suspends face tracking. Animated uploads use the decoded still frame.
- Reset releases freeze, turns off all effects and mirroring, and resumes the unmodified camera if capture is running. The uploaded asset is retained for reuse; Remove image releases it. Reset cancels pending uploads.

## OBS Virtual Camera

1. Start the camera and configure your effects in Magic Cam.
2. Click **Output** in the top bar. Allow the popup if the browser blocks it.
3. In OBS, add **Window Capture** and select **Magic Cam — Clean Output**. Use client-area capture and crop any browser chrome as needed. Fit the source to your OBS scene without stretching it.
4. Keep the output window visible and unminimized, with the studio open for controls. The output has no controls, guides, labels, or watermarks; its video uses `object-fit: contain` on black.
5. Start **OBS Virtual Camera** and select it in your meeting/streaming app. Configure audio separately in OBS.

The clean window receives the existing compositor's `canvas.captureStream(0)` through a same-origin opener handshake. Each completed composition requests a stream frame. It never requests a webcam or runs a model. The render scheduler moves to the output window while it is open so controls can remain in the studio. Closing it restores the studio scheduler. The output route opened independently does not start capture and explains how to connect.

OBS Browser Source is not used for webcam access. This app does not install or implement a virtual-camera driver. Browser/OS throttling can still reduce output FPS when windows are hidden or minimized. Keep both windows open; closing or refreshing the studio ends the session.

## Pipeline and module boundaries

| Module                                                       | Responsibility                                                                                                            |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `src/core/capture.ts`                                        | Camera acquisition, source changes, cancellation races, track-ended events, cleanup                                       |
| `src/core/tracking.ts`                                       | Reduced input frames, one job in flight, Worker lifecycle, fallback, time-based face smoothing                            |
| `public/tracking-worker.js`                                  | Classic Worker, local MediaPipe CPU/WASM initialization and synchronous inference                                         |
| `src/core/effects.ts`                                        | Extensible effect contract, face pixelation, image overlay and asset disposal                                             |
| `src/core/segmentation.ts` / `public/segmentation-worker.js` | Single-flight person segmentation and mask lifecycle                                                                      |
| `src/core/matte.ts` / `src/core/background-blur.ts`          | Temporal matte smoothing, distance falloff, background-only blur and full-resolution subject compositing                  |
| `src/core/grain.ts`                                          | Cached monochrome grain tiles, bounded texture refresh, photographic density blending                                     |
| `src/core/studio.ts`                                         | Background → background blur → face effects → grain → image overlays → freeze, scheduling, stream sharing, measured stats |
| `src/ui/`                                                    | React controls and responsive studio; no per-frame pixel or landmark data in React state                                  |

Capture requests up to 1280×720 at 30 FPS and honors the actual returned dimensions. Rendering checks `video.currentTime` and only redraws fresh frames or changed effects. Tracking is independent, capped at 15 Hz in the Worker and 8 Hz in the main-thread fallback. Input is 320 pixels wide with its aspect ratio preserved. Frame conversion and inference share a busy flag, so no stale jobs accumulate. `ImageBitmap` transfers avoid copying a large video frame, and every bitmap is closed after use. A 5-second inference watchdog prevents a hung worker from blocking future work indefinitely.

The classic Workers are intentional: MediaPipe's WASM loader uses `importScripts`. CPU inference with OffscreenCanvas works in the automated Chromium tests. Face tracking has a reduced-rate main-thread fallback. Background segmentation requires Worker/OffscreenCanvas support and shows a recoverable error if unavailable; the camera and other effects keep working. Each model loads only when its effect needs it. Disabling its effect or stopping releases its model/Worker. Stop/unmount cancels rendering and camera tracks and frees grain/blur buffers; closing output releases its stream; removing an image or unmounting releases decoded image memory.

Person segmentation uses a 384-pixel-wide, aspect-preserving input at up to 15 Hz with one bitmap/inference in flight. Small confidence fluctuations receive time-based smoothing, while larger changes follow motion immediately. Stale masks fade out between 150 and 250 ms; results older than 250 ms are discarded. The blur is computed in reduced buffers up to 480 pixels wide. The source stays opaque while it is filtered, which keeps browser canvas blur kernels from turning transparent matte pixels into dark holes; the original full-resolution subject is then composited back with a soft confidence edge. Two blur radii are smoothly blended according to distance from the subject, with a moderated maximum radius to avoid color halos. Mirroring applies to both the video and mask. The image overlay is composited afterwards and stays clean.

Render FPS counts actual compositing draws over a measured interval. During freeze it reads zero because the held frame needs no redraw. Face inference duration measures `detectForVideo` execution; the blur panel measures person segmentation and mask transfer preparation separately. These are last samples, not end-to-end latency.

`Effect` exposes an id, render stage, `render(frame)`, and optional `dispose()`. The frame contains time, delta, dimensions, and an optional normalized face anchor. A future one-shot meme effect can maintain its own start time/lifetime and register in the overlay stage. No explosion effect is implemented.

## Verification and manual checks

Automated browser checks use Chromium's synthetic webcam and locally generated image fixtures, covering camera startup, real Worker/model initialization and inference, the main-thread fallback, pixelation bounds and mirrored placement, final-frame freeze/release, timed holds, image layering/replacement/reset, a shared clean-output stream without extra camera requests, permission-denied state, simulated disconnect, cancellation cleanup, pending-upload reset, image-mode restoration, portrait image fitting, keyboard dialog navigation, fullscreen fallback, and mobile overflow. Screenshots are written to `test-results/` for visual inspection.

Before broadcasting, manually check a physical webcam's permissions, device selection/unplugging, face alignment during fast motion and challenging lighting, and sustained performance on your hardware. Verify OBS Window Capture, browser-chrome cropping, aspect ratio, background-window behavior, and OBS Virtual Camera in the destination app. Automated camera frames are not a substitute for these hardware/OBS checks.

The film-effects tests additionally check grain brightness neutrality and monochrome output, zero-strength bypass, frozen texture stability, foreground sharpness, background smoothing, fractional-confidence hair edges, real person-model execution on a photograph, resource cleanup, and combined effects in the clean output. A local portrait stream exercises the full pipeline at 1280×720 and records measured render FPS; screenshots include desktop/mobile controls and before/after photographs. Fine hair, fast hand movement, translucent objects, and weak lighting still need manual webcam checks: person segmentation is an estimate, not a studio chroma key.

Person segmentation reference: [official Image Segmenter web guide](https://developers.google.com/edge/mediapipe/solutions/vision/image_segmenter/web_js). Model: [Google-hosted version 1 SelfieSegmenter](https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite).

MediaPipe setup and synchronous inference behavior: [official Face Landmarker web guide](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js). Model: [Google-hosted version 1 task asset](https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task).
