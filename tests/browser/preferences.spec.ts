import { expect, test } from "@playwright/test";

test("visual controls persist in the browser and keep uploads ephemeral", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Mirror webcam" }).click();
  await page.getByRole("switch", { name: "Enable Backdrop Blur" }).click();
  await page.getByRole("slider", { name: "Strength" }).fill("72");
  await page.getByRole("slider", { name: "Blur ramp" }).fill("41");
  await page.getByRole("switch", { name: "Enable Film Grain" }).click();
  await page.getByRole("slider", { name: "Intensity" }).fill("36");
  await page.getByRole("slider", { name: "Scale" }).fill("24");
  await page.getByRole("switch", { name: "Enable Face Mosaic" }).click();
  await page.getByRole("slider", { name: "Block size" }).fill("32");
  await page.getByRole("combobox", { name: "Duration" }).selectOption("-1");
  await page.locator("#custom-seconds").fill("42");
  await expect(
    page.getByText("Freeze / release", { exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(200);

  await page.reload();

  await expect(
    page.getByRole("button", { name: "Mirror webcam" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("switch", { name: "Enable Backdrop Blur" }),
  ).toBeChecked();
  await expect(page.getByRole("slider", { name: "Strength" })).toHaveValue(
    "72",
  );
  await expect(page.getByRole("slider", { name: "Blur ramp" })).toHaveValue(
    "41",
  );
  await expect(
    page.getByRole("switch", { name: "Enable Film Grain" }),
  ).toBeChecked();
  await expect(page.getByRole("slider", { name: "Intensity" })).toHaveValue(
    "36",
  );
  await expect(page.getByRole("slider", { name: "Scale" })).toHaveValue("24");
  await expect(
    page.getByRole("switch", { name: "Enable Face Mosaic" }),
  ).toBeChecked();
  await expect(page.getByRole("slider", { name: "Block size" })).toHaveValue(
    "32",
  );
  await expect(page.getByRole("combobox", { name: "Duration" })).toHaveValue(
    "-1",
  );
  await expect(page.locator("#custom-seconds")).toHaveValue("42");
  await expect(
    page.getByRole("switch", { name: "Enable Image Layer" }),
  ).not.toBeChecked();

  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("magic-cam.controls.v1") || "null"),
  );
  expect(saved.settings.imageMode).toBe("off");
});
