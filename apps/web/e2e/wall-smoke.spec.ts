import { expect, test } from "@playwright/test";

test("wall route resolves a render mode and single visible layer family", async ({ page }) => {
  await page.goto("/wall?mode=test");

  const wallScene = page.getByTestId("wall-scene");
  await expect(wallScene).toBeVisible();

  await expect
    .poll(async () => wallScene.getAttribute("data-renderer-mode"), { timeout: 15000 })
    .toMatch(/^(primary|fallback)$/);

  const mode = await wallScene.getAttribute("data-renderer-mode");
  const frontLayer = page.getByTestId("scene-layer-front");
  const backLayer = page.getByTestId("scene-layer-back");
  const fallbackLayer = page.getByTestId("scene-fallback-css");

  if (mode === "primary") {
    await expect(frontLayer).toBeVisible();
    await expect(backLayer).toBeVisible();
    await expect(fallbackLayer).toBeHidden();
    return;
  }

  await expect(fallbackLayer).toBeVisible();
  await expect(frontLayer).toBeHidden();
  await expect(backLayer).toBeHidden();
});
