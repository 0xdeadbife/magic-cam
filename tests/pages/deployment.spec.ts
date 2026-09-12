import { expect, test } from "@playwright/test";

test("compiled studio loads models and shared output from a repository subpath", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  const failed: string[] = [];
  const requests: string[] = [];
  context.on("page", (tab) =>
    tab.on("pageerror", (error) => errors.push(error.message)),
  );
  page.on("pageerror", (error) => errors.push(error.message));
  context.on("response", (response) => {
    if (response.status() >= 400) failed.push(response.url());
  });
  context.on("request", (request) => {
    if (request.url().startsWith("http")) requests.push(request.url());
  });
  await page.addInitScript(() => {
    const acquire = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    (window as unknown as { cameraRequests: number }).cameraRequests = 0;
    navigator.mediaDevices.getUserMedia = (constraints) => {
      (window as unknown as { cameraRequests: number }).cameraRequests++;
      return acquire(constraints);
    };
  });
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Magic Cam", exact: true }),
  ).toBeVisible();
  expect(
    await page
      .locator(".brand img")
      .evaluate(
        (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
      ),
  ).toBe(true);
  await page.getByRole("button", { name: "Start camera", exact: true }).click();
  await expect(page.getByTestId("camera-status")).toHaveAttribute(
    "data-live",
    "true",
  );
  await page.getByRole("switch", { name: "Enable background blur" }).click();
  await page.getByRole("switch", { name: "Enable face pixelation" }).click();
  await page.getByRole("switch", { name: "Enable film grain" }).click();
  await expect(page.getByTestId("tracking-status")).toHaveAttribute(
    "data-mode",
    "worker",
    { timeout: 30000 },
  );
  await expect(page.getByTestId("segmentation-status")).toContainText("ms", {
    timeout: 30000,
  });
  expect(page.workers()).toHaveLength(2);
  await page.getByRole("combobox", { name: "Hold for" }).selectOption("0");
  await page.getByRole("button", { name: "Freeze frame", exact: true }).click();
  const held = await page
    .locator("canvas")
    .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Open clean output" }).click();
  const output = await popupPromise;
  await expect(output).toHaveURL(/\/pages-check\/\?output=1$/);
  await expect
    .poll(() =>
      output
        .locator("video")
        .evaluate((video: HTMLVideoElement) => video.readyState),
    )
    .toBeGreaterThanOrEqual(2);
  expect(await output.locator("button").count()).toBe(0);
  expect(output.workers()).toHaveLength(0);
  expect(
    await page.evaluate(
      () => (window as unknown as { cameraRequests: number }).cameraRequests,
    ),
  ).toBe(1);
  // Controls still operate in the studio while the clean window is open.
  await page.getByRole("slider", { name: "Grain amount" }).fill("72");
  expect(
    await page
      .locator("canvas")
      .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL()),
  ).toBe(held);
  await page
    .getByRole("button", { name: "Release frame", exact: true })
    .click();
  await expect
    .poll(() =>
      page
        .locator("canvas")
        .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL()),
    )
    .not.toBe(held);
  await output.close();
  await page.getByRole("button", { name: "Reset all effects" }).click();
  await expect.poll(() => page.workers().length).toBe(0);
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(page.getByTestId("camera-status")).toHaveAttribute(
    "data-live",
    "false",
  );
  expect(
    requests.filter(
      (url) => !url.startsWith("http://127.0.0.1:4174/pages-check/"),
    ),
  ).toEqual([]);
  expect(failed).toEqual([]);
  expect(errors).toEqual([]);
});

test("compiled main-thread fallback resolves WASM and model inside the repository", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.Worker = class {
      constructor() {
        throw new Error("Worker disabled in this test");
      }
    } as unknown as typeof Worker;
  });
  await page.goto("./");
  await page.getByRole("button", { name: "Start camera", exact: true }).click();
  await expect(page.getByTestId("camera-status")).toHaveAttribute(
    "data-live",
    "true",
  );
  await page.getByRole("switch", { name: "Enable face pixelation" }).click();
  await expect(page.getByTestId("tracking-status")).toHaveAttribute(
    "data-mode",
    "main",
    { timeout: 30000 },
  );
  await expect(page.getByTestId("tracking-status")).toContainText(
    /Face (lost|tracked)/,
    { timeout: 10000 },
  );
  await page.getByRole("button", { name: "Stop", exact: true }).click();
});

test("direct clean-output URL is static and never requests its own camera", async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new Error("Unexpected camera request");
    };
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./?output=1");
  await expect(
    page.getByText("Open Clean output from the Magic Cam studio", {
      exact: false,
    }),
  ).toBeVisible();
  expect(page.workers()).toHaveLength(0);
  expect(errors).toEqual([]);
});
