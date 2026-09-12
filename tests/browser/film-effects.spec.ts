import { test, expect } from "@playwright/test";

test("fractional hair confidence never creates dark holes on a uniform background", async ({
  page,
}) => {
  await page.goto("/");
  const range = await page.evaluate(async () => {
    const path = "/src/core/background-blur.ts";
    const { BackgroundBlurEffect } = await import(/* @vite-ignore */ path);
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 360;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#aaaaaa";
    ctx.fillRect(0, 0, 640, 360);
    const values = new Float32Array(160 * 90).fill(0.4);
    const effect = new BackgroundBlurEffect(() => ({
      values,
      width: 160,
      height: 90,
      timestamp: 100,
      revision: 1,
    }));
    effect.render({
      canvas,
      ctx,
      now: 100,
      settings: {
        backgroundBlur: true,
        blurAmount: 45,
        blurFalloff: 65,
        imageMode: "off",
        mirror: false,
      },
    });
    const pixels = ctx.getImageData(0, 0, 640, 360).data;
    let min = 255,
      max = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      min = Math.min(min, pixels[i]);
      max = Math.max(max, pixels[i]);
    }
    effect.dispose();
    return { min, max };
  });
  expect(range.min).toBeGreaterThanOrEqual(169);
  expect(range.max).toBeLessThanOrEqual(171);
});

test("photographic portrait: actual model protects subject and smooths the real background", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const backgroundPath = "/src/core/background-blur.ts",
      grainPath = "/src/core/grain.ts";
    const { BackgroundBlurEffect } = await import(
      /* @vite-ignore */ backgroundPath
    );
    const { FilmGrainEffect } = await import(/* @vite-ignore */ grainPath);
    const image = new Image();
    image.src = "/tests/fixtures/portrait.jpg";
    await image.decode();
    const source = document.createElement("canvas");
    source.width = image.width;
    source.height = image.height;
    const sourceCtx = source.getContext("2d")!;
    sourceCtx.drawImage(image, 0, 0);
    const before = sourceCtx.getImageData(
      0,
      0,
      source.width,
      source.height,
    ).data;
    const input = document.createElement("canvas");
    input.width = 384;
    input.height = Math.round((384 * image.height) / image.width);
    input.getContext("2d")!.drawImage(image, 0, 0, input.width, input.height);
    const worker = new Worker("/segmentation-worker.js");
    const mask = await new Promise<{
      values: Float32Array;
      width: number;
      height: number;
      timestamp: number;
      revision: number;
      ms: number;
    }>((resolve, reject) => {
      worker.onerror = (event) => reject(new Error(event.message));
      worker.onmessage = async ({ data }) => {
        if (data.type === "ready") {
          const frame = await createImageBitmap(input);
          worker.postMessage(
            { type: "frame", frame, timestamp: performance.now() },
            [frame],
          );
        }
        if (data.type === "error") reject(new Error(data.message));
        if (data.type === "mask")
          resolve({ ...data, timestamp: performance.now(), revision: 1 });
      };
      worker.postMessage({ type: "init" });
    });
    worker.postMessage({ type: "close" });
    const mattePath = "/src/core/matte.ts";
    const { stabilizeMatte } = await import(/* @vite-ignore */ mattePath);
    mask.values = stabilizeMatte(mask.values, null, 1000);
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(source, 0, 0);
    const effect = new BackgroundBlurEffect(() => mask);
    const settings = {
      backgroundBlur: true,
      blurAmount: 80,
      blurFalloff: 65,
      mirror: false,
      imageMode: "off",
      grain: true,
      grainAmount: 35,
      grainSize: 30,
    };
    effect.render({ canvas, ctx, settings, now: mask.timestamp });
    const after = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let subjectError = 0,
      subjectCount = 0,
      backgroundDifference = 0,
      backgroundCount = 0;
    for (let y = 2; y < canvas.height - 2; y++)
      for (let x = 2; x < canvas.width - 2; x++) {
        const mx = Math.floor((x / canvas.width) * mask.width),
          my = Math.floor((y / canvas.height) * mask.height);
        const confidence = mask.values[my * mask.width + mx],
          i = (y * canvas.width + x) * 4;
        const difference =
          Math.abs(before[i] - after[i]) +
          Math.abs(before[i + 1] - after[i + 1]) +
          Math.abs(before[i + 2] - after[i + 2]);
        if (confidence > 0.9999) {
          subjectError += difference;
          subjectCount++;
        }
        if (confidence < 0.001) {
          backgroundDifference += difference;
          backgroundCount++;
        }
      }
    source.dataset.test = "portrait-original";
    canvas.dataset.test = "portrait-blur";
    // Keep the photograph at native resolution for visual QA, outside the studio preview.
    source.style.cssText = canvas.style.cssText =
      "position:relative;display:block;opacity:1;width:820px;height:1024px";
    const grainCanvas = document.createElement("canvas");
    grainCanvas.width = canvas.width;
    grainCanvas.height = canvas.height;
    const grainCtx = grainCanvas.getContext("2d")!;
    grainCtx.drawImage(canvas, 0, 0);
    const grain = new FilmGrainEffect();
    grain.render({ canvas: grainCanvas, ctx: grainCtx, settings, now: 100 });
    grainCanvas.dataset.test = "portrait-finished";
    grainCanvas.style.cssText = canvas.style.cssText;
    document.body.replaceChildren(source, canvas, grainCanvas);
    effect.dispose();
    grain.dispose();
    return {
      subjectError: subjectError / Math.max(1, subjectCount) / 3,
      subjectCoverage: subjectCount / (canvas.width * canvas.height),
      backgroundDifference:
        backgroundDifference / Math.max(1, backgroundCount) / 3,
      ms: mask.ms,
    };
  });
  expect(result.subjectCoverage).toBeGreaterThan(0.15);
  expect(result.subjectError).toBeLessThan(1.5);
  expect(result.backgroundDifference).toBeGreaterThan(1);
  await page
    .locator("[data-test=portrait-original]")
    .screenshot({ path: "test-results/portrait-original.png" });
  await page
    .locator("[data-test=portrait-blur]")
    .screenshot({ path: "test-results/portrait-blur.png" });
  await page
    .locator("[data-test=portrait-finished]")
    .screenshot({ path: "test-results/portrait-finished.png" });
});

test("film grain is neutral, fine, adjustable, and stationary on the same frame", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const path = "/src/core/grain.ts";
    const { FilmGrainEffect } = await import(/* @vite-ignore */ path);
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 360;
    const ctx = canvas.getContext("2d")!;
    const grain = new FilmGrainEffect();
    const settings = { grain: true, grainAmount: 100, grainSize: 30 };
    const render = (now: number) => {
      ctx.fillStyle = "#808080";
      ctx.fillRect(0, 0, 640, 360);
      grain.render({ canvas, ctx, settings, now });
      return ctx.getImageData(0, 0, 640, 360).data;
    };
    const a = render(100),
      b = render(100),
      c = render(200);
    let sum = 0,
      sum2 = 0,
      chroma = 0,
      changed = 0,
      stable = 0;
    for (let i = 0; i < a.length; i += 4) {
      sum += a[i];
      sum2 += a[i] * a[i];
      chroma += Math.abs(a[i] - a[i + 1]) + Math.abs(a[i] - a[i + 2]);
      if (a[i] !== c[i]) changed++;
      if (a[i] !== b[i]) stable++;
    }
    const count = a.length / 4,
      mean = sum / count,
      deviation = Math.sqrt(sum2 / count - mean * mean);
    settings.grainAmount = 0;
    const off = render(300);
    grain.dispose();
    return {
      mean,
      deviation,
      chroma,
      changed: changed / count,
      stable,
      off: off.every(
        (value: number, i: number) => value === (i % 4 === 3 ? 255 : 128),
      ),
    };
  });
  expect(Math.abs(result.mean - 128)).toBeLessThan(3);
  expect(result.deviation).toBeGreaterThan(2);
  expect(result.deviation).toBeLessThan(18);
  expect(result.chroma).toBe(0);
  expect(result.changed).toBeGreaterThan(0.7);
  expect(result.stable).toBe(0);
  expect(result.off).toBe(true);
});

test("background blur preserves foreground, frame edges, and excludes foreground color from the background", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const path = "/src/core/background-blur.ts";
    const { BackgroundBlurEffect } = await import(/* @vite-ignore */ path);
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 360;
    const ctx = canvas.getContext("2d")!;
    const values = new Float32Array(160 * 90);
    for (let y = 0; y < 90; y++)
      for (let x = 55; x < 105; x++) values[y * 160 + x] = 1;
    const effect = new BackgroundBlurEffect(() => ({
      values,
      width: 160,
      height: 90,
      timestamp: 100,
      revision: 1,
    }));
    const draw = () => {
      ctx.fillStyle = "#b0b0b0";
      ctx.fillRect(0, 0, 640, 360);
      for (let x = 10; x < 640; x += 20) {
        ctx.fillStyle = "#555555";
        ctx.fillRect(x, 0, 2, 360);
      }
      ctx.fillStyle = "#ff0000";
      ctx.fillRect(220, 0, 200, 360);
      ctx.fillStyle = "#000";
      ctx.fillRect(300, 0, 2, 360);
    };
    const pixel = (x: number) =>
      Array.from(ctx.getImageData(x, 180, 1, 1).data);
    draw();
    const before = pixel(30);
    const settings = {
      backgroundBlur: true,
      blurAmount: 100,
      blurFalloff: 60,
      imageMode: "off",
      mirror: false,
    };
    effect.render({ ctx, canvas, settings, now: 100 });
    const result = {
      foreground: pixel(300),
      skin: pixel(320),
      background: pixel(30),
      border: pixel(0),
      edge: pixel(208),
      before,
    };
    draw();
    settings.blurAmount = 0;
    effect.render({ ctx, canvas, settings, now: 100 });
    const disabled = pixel(30);
    effect.dispose();
    return { ...result, disabled };
  });
  expect(result.foreground).toEqual([0, 0, 0, 255]);
  expect(result.skin).toEqual([255, 0, 0, 255]);
  expect(result.background[0]).toBeGreaterThan(result.before[0] + 30);
  expect(result.border[0]).toBeGreaterThan(130);
  expect(Math.abs(result.edge[0] - result.edge[1])).toBeLessThan(3);
  expect(result.disabled).toEqual(result.before);
});

test("real segmentation worker combines with grain, freeze and reset without extra camera capture", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Start camera", exact: true }).click();
  await expect(page.getByTestId("camera-status")).toHaveAttribute(
    "data-live",
    "true",
  );
  await page.getByRole("switch", { name: "Enable background blur" }).click();
  await page.getByRole("switch", { name: "Enable film grain" }).click();
  await expect(page.getByTestId("segmentation-status")).toContainText("ms", {
    timeout: 30000,
  });
  await page.getByRole("slider", { name: "Blur amount" }).fill("0");
  await expect(page.getByTestId("segmentation-status")).toContainText(
    "Amount is zero",
  );
  await expect.poll(() => page.workers().length).toBe(0);
  await page.getByRole("slider", { name: "Blur amount" }).fill("45");
  await expect(page.getByTestId("segmentation-status")).toContainText("ms", {
    timeout: 30000,
  });
  expect(page.workers().length).toBe(1);
  await page.getByRole("switch", { name: "Enable face pixelation" }).click();
  await expect(page.getByTestId("tracking-status")).toHaveAttribute(
    "data-mode",
    "worker",
    { timeout: 30000 },
  );
  expect(page.workers().length).toBe(2);
  await page.getByRole("combobox", { name: "Hold for" }).selectOption("0");
  await page.getByRole("button", { name: "Freeze frame", exact: true }).click();
  const held = await page
    .locator("canvas")
    .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  await page.getByRole("slider", { name: "Grain amount" }).fill("100");
  await page.getByRole("slider", { name: "Blur amount" }).fill("100");
  await page.waitForTimeout(300);
  expect(
    await page
      .locator("canvas")
      .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL()),
  ).toBe(held);
  await page.getByRole("button", { name: "Reset all effects" }).click();
  await expect(
    page.getByRole("switch", { name: "Enable film grain" }),
  ).toHaveAttribute("aria-checked", "false");
  await expect(
    page.getByRole("switch", { name: "Enable background blur" }),
  ).toHaveAttribute("aria-checked", "false");
  await expect.poll(() => page.workers().length).toBe(0);
  expect(errors).toEqual([]);
});

test("portrait camera stream renders both effects with measured performance and clean output", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    let requests = 0;
    navigator.mediaDevices.getUserMedia = async () => {
      (window as unknown as { cameraRequests: number }).cameraRequests =
        ++requests;
      const image = new Image();
      image.src = "/tests/fixtures/portrait.jpg";
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext("2d")!;
      const draw = () =>
        ctx.drawImage(
          image,
          0,
          0,
          image.width,
          (image.width * 9) / 16,
          0,
          0,
          1280,
          720,
        );
      draw();
      const timer = setInterval(draw, 1000 / 30);
      const stream = canvas.captureStream(30);
      const stop = stream
        .getVideoTracks()[0]
        .stop.bind(stream.getVideoTracks()[0]);
      stream.getVideoTracks()[0].stop = () => {
        clearInterval(timer);
        stop();
      };
      return stream;
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Start camera", exact: true }).click();
  await expect(page.getByTestId("camera-status")).toHaveAttribute(
    "data-live",
    "true",
  );
  await page.getByRole("switch", { name: "Enable background blur" }).click();
  await page.getByRole("switch", { name: "Enable film grain" }).click();
  await expect(page.getByTestId("segmentation-status")).toHaveAttribute(
    "data-state",
    "ready",
    { timeout: 30000 },
  );
  await page.waitForTimeout(2000);
  const fps = Number(await page.locator(".metric b").first().textContent());
  const segmentation = await page
    .getByTestId("segmentation-status")
    .textContent();
  await testInfo.attach("measured-performance", {
    body: JSON.stringify(
      {
        renderFps: fps,
        segmentation,
        environment: "Chromium headless, local portrait stream, 1280x720",
      },
      null,
      2,
    ),
    contentType: "application/json",
  });
  expect(fps).toBeGreaterThan(10);
  await page.screenshot({
    path: "test-results/studio-film-effects.png",
    fullPage: true,
  });
  const opening = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Open clean output" }).click();
  const output = await opening;
  await expect
    .poll(() =>
      output
        .locator("video")
        .evaluate((video: HTMLVideoElement) => video.readyState),
    )
    .toBeGreaterThanOrEqual(2);
  expect(
    await page.evaluate(
      () => (window as unknown as { cameraRequests: number }).cameraRequests,
    ),
  ).toBe(1);
  await output.close();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/studio-film-effects-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect.poll(() => page.workers().length).toBe(0);
});
