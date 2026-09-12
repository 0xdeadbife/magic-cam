import { expect, test } from "@playwright/test";

test("image mode survives toggling, reset cancels pending uploads, and help supports keyboard", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 8;
    canvas.height = 8;
    return canvas.toDataURL().split(",")[1];
  });
  const file = {
    name: "layer.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  };
  await page.locator("input[type=file]").setInputFiles(file);
  await page
    .getByRole("button", { name: "Replace camera", exact: true })
    .click();
  const toggle = page.getByRole("switch", { name: "Enable image layer" });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await toggle.click();
  await expect(
    page.getByRole("button", { name: "Replace camera", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Remove image" }).click();
  await page.evaluate(() => {
    const decode = window.createImageBitmap.bind(window);
    window.createImageBitmap = ((blob: Blob) =>
      new Promise<ImageBitmap>((resolve, reject) => {
        (window as unknown as { finishDecode: () => void }).finishDecode =
          () => {
            decode(blob).then(resolve, reject);
          };
      })) as typeof createImageBitmap;
  });
  await page.locator("input[type=file]").setInputFiles(file);
  await expect(page.getByText("Opening…")).toBeVisible();
  await page.getByRole("button", { name: "Reset all effects" }).click();
  await page.evaluate(() =>
    (window as unknown as { finishDecode: () => void }).finishDecode(),
  );
  await expect(page.getByRole("button", { name: "Add image" })).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await page.getByRole("button", { name: "OBS setup guide" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Close setup guide" }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    page.getByRole("button", { name: "Done", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "OBS setup guide" }),
  ).toBeFocused();
  await page.evaluate(() =>
    Object.defineProperty(HTMLCanvasElement.prototype, "requestFullscreen", {
      value: undefined,
      configurable: true,
    }),
  );
  await page.getByRole("button", { name: "Fullscreen preview" }).click();
  await expect(page.getByRole("alert")).toContainText("Fullscreen unavailable");
  expect(errors).toEqual([]);
});

test("portrait overlays fit inside the frame at full size", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const path = "/src/core/effects.ts";
    const { ImageEffect } = await import(/* @vite-ignore */ path);
    const canvas = document.createElement("canvas");
    canvas.width = 160;
    canvas.height = 90;
    const source = document.createElement("canvas");
    source.width = 20;
    source.height = 200;
    const sourceContext = source.getContext("2d")!;
    sourceContext.fillStyle = "#ff0000";
    sourceContext.fillRect(0, 0, 20, 100);
    sourceContext.fillStyle = "#0000ff";
    sourceContext.fillRect(0, 100, 20, 100);
    const effect = new ImageEffect();
    effect.setImage(await createImageBitmap(source));
    const ctx = canvas.getContext("2d")!;
    effect.render({
      canvas,
      ctx,
      settings: {
        imageMode: "overlay",
        imageSize: 100,
        imageOpacity: 100,
        imageX: 50,
        imageY: 50,
      },
    });
    const pixel = (x: number, y: number) =>
      Array.from(ctx.getImageData(x, y, 1, 1).data);
    const result = [pixel(80, 1), pixel(80, 88), pixel(0, 45)];
    effect.dispose();
    return result;
  });
  expect(result).toEqual([
    [255, 0, 0, 255],
    [0, 0, 255, 255],
    [0, 0, 0, 0],
  ]);
});
test("camera, worker tracking, final-frame freeze, shared output and cleanup", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let cameraRequests = 0;
  await context.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    Object.defineProperty(window, "__cameraCalls", {
      value: 0,
      writable: true,
    });
    navigator.mediaDevices.getUserMedia = async (...args) => {
      (window as unknown as { __cameraCalls: number }).__cameraCalls++;
      const stream = await original(...args);
      (window as unknown as { __cameraStream: MediaStream }).__cameraStream =
        stream;
      return stream;
    };
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Magic Cam", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/studio-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Start camera", exact: true }).click();
  await expect(
    page.locator('[data-testid="camera-status"][data-live="true"]'),
  ).toBeVisible();
  await page.getByRole("switch", { name: "Enable face pixelation" }).click();
  await expect(
    page.locator('[data-testid="tracking-status"][data-mode="worker"]'),
  ).toBeVisible({
    timeout: 30000,
  });
  await expect(
    page.getByText("Face lost", { exact: true }).first(),
  ).toBeVisible({ timeout: 10000 });
  await expect(
    page.locator(".telemetry").getByText("ms", { exact: true }),
  ).toBeVisible();
  await page.getByRole("combobox", { name: "Hold for" }).selectOption("0");
  await page.getByRole("button", { name: "Freeze frame", exact: true }).click();
  const frozen = await page
    .locator("canvas")
    .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  await page.getByRole("button", { name: "Mirror webcam" }).click();
  await page.waitForTimeout(500);
  expect(
    await page
      .locator("canvas")
      .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL()),
  ).toBe(frozen);
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Open clean output" }).click();
  const popup = await popupPromise;
  await expect(popup.locator("video")).toBeVisible();
  await expect
    .poll(() =>
      popup
        .locator("video")
        .evaluate((video: HTMLVideoElement) => video.readyState),
    )
    .toBeGreaterThanOrEqual(2);
  expect(await popup.locator("button").count()).toBe(0);
  cameraRequests = await page.evaluate(
    () => (window as unknown as { __cameraCalls: number }).__cameraCalls,
  );
  expect(cameraRequests).toBe(1);
  expect(
    await popup.evaluate(
      () => (window as unknown as { __cameraCalls: number }).__cameraCalls,
    ),
  ).toBe(0);
  await page
    .getByRole("button", { name: "Release frame", exact: true })
    .click();
  await expect
    .poll(() =>
      page
        .locator("canvas")
        .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL()),
    )
    .not.toBe(frozen);
  await page.getByRole("combobox", { name: "Hold for" }).selectOption("-1");
  await page.locator("#custom-seconds").fill("1");
  await page.getByRole("button", { name: "Freeze frame", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Release frame" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Freeze frame", exact: true }),
  ).toBeVisible({ timeout: 4000 });
  await popup.close();
  await expect(
    page.getByRole("button", { name: "Open clean output" }),
  ).toBeVisible();
  await page.evaluate(() =>
    (window as unknown as { __cameraStream: MediaStream }).__cameraStream
      .getVideoTracks()[0]
      .dispatchEvent(new Event("ended")),
  );
  await expect(
    page.getByRole("heading", { name: "Camera disconnected" }),
  ).toBeVisible();
  await expect.poll(() => page.workers().length).toBe(0);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(
    page.locator('[data-testid="camera-status"][data-live="true"]'),
  ).toBeVisible();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  expect(
    await page.evaluate(() =>
      (window as unknown as { __cameraStream: MediaStream }).__cameraStream
        .getTracks()
        .every((track) => track.readyState === "ended"),
    ),
  ).toBe(true);
  await expect(page.getByText("Tracking off", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("image replacement, overlay controls, freeze and reset compose correctly", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start camera", exact: true }).click();
  await expect(
    page.locator('[data-testid="camera-status"][data-live="true"]'),
  ).toBeVisible();
  // Generate an opaque red PNG in the test browser; never leaves the machine.
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 100;
    canvas.height = 100;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ff0000";
    ctx.fillRect(0, 0, 100, 100);
    return canvas.toDataURL().split(",")[1];
  });
  await page.locator("input[type=file]").setInputFiles({
    name: "red.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await expect(page.getByText("red.png")).toBeVisible();
  const center = () =>
    page
      .locator("canvas")
      .evaluate((canvas: HTMLCanvasElement) =>
        Array.from(
          canvas
            .getContext("2d")!
            .getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data,
        ),
      );
  await expect.poll(center).toEqual([255, 0, 0, 255]);
  await page.getByRole("slider", { name: "Opacity" }).fill("0");
  await expect.poll(center).not.toEqual([255, 0, 0, 255]);
  await page
    .getByRole("button", { name: "Replace camera", exact: true })
    .click();
  await expect.poll(center).toEqual([255, 0, 0, 255]);
  expect(
    await page
      .locator("canvas")
      .evaluate((canvas: HTMLCanvasElement) =>
        Array.from(canvas.getContext("2d")!.getImageData(0, 0, 1, 1).data),
      ),
  ).toEqual([0, 0, 0, 255]);
  await page.getByRole("combobox", { name: "Hold for" }).selectOption("0");
  await page.getByRole("button", { name: "Freeze frame", exact: true }).click();
  await page.getByRole("button", { name: "Remove image" }).click();
  await page.waitForTimeout(200);
  expect(await center()).toEqual([255, 0, 0, 255]);
  await page.getByRole("button", { name: "Reset all effects" }).click();
  await expect.poll(center).not.toEqual([255, 0, 0, 255]);
  await expect(
    page.getByRole("button", { name: "Mirror webcam" }),
  ).toHaveAttribute("aria-pressed", "false");
  await page.screenshot({
    path: "test-results/studio-live.png",
    fullPage: true,
  });
});

test("permission denied, cancel pending capture, disconnect and small screen", async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("Denied", "NotAllowedError");
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Start camera", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Camera access denied" }),
  ).toBeVisible();
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = () =>
      new Promise((resolve) => {
        (
          window as unknown as { resolveCamera: (s: MediaStream) => void }
        ).resolveCamera = resolve;
      });
  });
  await page.getByRole("button", { name: "Try again" }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(
    await page.evaluate(async () => {
      const c = document.createElement("canvas");
      const stream = c.captureStream();
      (
        window as unknown as { resolveCamera: (s: MediaStream) => void }
      ).resolveCamera(stream);
      await new Promise((resolve) => setTimeout(resolve, 100));
      return stream.getTracks()[0].readyState;
    }),
  ).toBe("ended");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/studio-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("reduced-rate main-thread fallback works when Workers are unavailable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.Worker = class {
      constructor() {
        throw new Error("Worker disabled in this test");
      }
    } as unknown as typeof Worker;
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Start camera", exact: true }).click();
  await expect(
    page.locator('[data-testid="camera-status"][data-live="true"]'),
  ).toBeVisible();
  await page.getByRole("switch", { name: "Enable face pixelation" }).click();
  await expect(
    page.locator('[data-testid="tracking-status"][data-mode="main"]'),
  ).toBeVisible({
    timeout: 30000,
  });
  await expect(
    page.getByText("Face lost", { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reset all effects" }).click();
  await expect(page.getByText("Tracking off", { exact: true })).toBeVisible();
});

test("pixelation changes only the face region and respects mirroring", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    // Import the actual effect, then compare against a deterministic high-detail frame.
    const path = "/src/core/effects.ts";
    const { PixelateEffect } = await import(/* @vite-ignore */ path);
    const canvas = document.createElement("canvas");
    canvas.width = 100;
    canvas.height = 100;
    const ctx = canvas.getContext("2d")!;
    for (let y = 0; y < 100; y++)
      for (let x = 0; x < 100; x++) {
        ctx.fillStyle = (x + y) % 2 ? "#fff" : "#000";
        ctx.fillRect(x, y, 1, 1);
      }
    const original = ctx.getImageData(0, 0, 100, 100);
    const effect = new PixelateEffect();
    const settings = {
      mirror: false,
      pixelate: true,
      pixelSize: 10,
      imageMode: "off",
    };
    const frame = {
      canvas,
      ctx,
      settings,
      face: { x: 0.1, y: 0.2, width: 0.2, height: 0.3 },
      now: 0,
      delta: 0,
    };
    effect.render(frame);
    const plain = ctx.getImageData(0, 0, 100, 100).data;
    const changed = (data: Uint8ClampedArray, x: number, y: number) =>
      data[(y * 100 + x) * 4] !== original.data[(y * 100 + x) * 4];
    const normal = [
      changed(plain, 15, 25),
      changed(plain, 75, 25),
      changed(plain, 5, 5),
    ];
    ctx.putImageData(original, 0, 0);
    settings.mirror = true;
    effect.render(frame);
    const mirrored = ctx.getImageData(0, 0, 100, 100).data;
    return {
      normal,
      mirrored: [
        changed(mirrored, 15, 25),
        changed(mirrored, 75, 25),
        changed(mirrored, 5, 5),
      ],
    };
  });
  expect(result).toEqual({
    normal: [true, false, false],
    mirrored: [false, true, false],
  });
});
