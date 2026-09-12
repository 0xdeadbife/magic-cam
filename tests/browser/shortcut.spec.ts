import { expect, test } from "@playwright/test";

test("Space toggles hold once, uses the configured duration and respects editing", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start camera", exact: true }).click();
  await expect(page.getByTestId("camera-status")).toHaveAttribute(
    "data-live",
    "true",
  );
  // Camera button still has focus after clicking Start.
  await page.keyboard.down("Space");
  await expect(
    page.getByRole("button", { name: "Release frame", exact: true }),
  ).toBeVisible();
  await page.keyboard.down("Space");
  await expect(
    page.getByRole("button", { name: "Release frame", exact: true }),
  ).toBeVisible();
  await page.keyboard.up("Space");
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("button", { name: "Freeze frame", exact: true }),
  ).toBeVisible();
  await page.getByRole("combobox", { name: "Hold for" }).selectOption("-1");
  await page.locator("#custom-seconds").fill("1");
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("button", { name: "Freeze frame", exact: true }),
  ).toBeVisible();
  await page.locator("canvas").click();
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("button", { name: "Release frame", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Freeze frame", exact: true }),
  ).toBeVisible({ timeout: 3000 });
  await page.getByRole("button", { name: "OBS setup guide" }).click();
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("button", { name: "Release frame", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Freeze frame", exact: true }).focus();
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("button", { name: "Release frame", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("button", { name: "Freeze frame", exact: true }),
  ).toBeVisible();
});
