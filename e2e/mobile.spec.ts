import { expect, test } from "@playwright/test";
import { open } from "./helpers";

test("navigation mobile via le menu", async ({ page }) => {
  await open(page, "/");
  await page.getByRole("button", { name: "Ouvrir le menu" }).click();
  await page.getByRole("dialog").getByRole("link", { name: "Tâches", exact: true }).click();
  await expect(page.locator("main h1")).toHaveText("Tâches");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
