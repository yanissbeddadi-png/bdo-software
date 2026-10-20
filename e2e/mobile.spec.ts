import { expect, test } from "@playwright/test";
import { open } from "./helpers";

test("navigation mobile via le menu", async ({ page }) => {
  await open(page, "/");
  await page.getByRole("button", { name: "Ouvrir le menu" }).click();
  await page
    .getByRole("dialog")
    .getByRole("link", { name: /^Missions/ })
    .click();
  await expect(page.locator("main h1")).toHaveText("Missions");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("pages CRM sans débordement horizontal sur mobile", async ({ page }) => {
  for (const path of [
    "/",
    "/pipeline",
    "/contacts",
    "/contacts/con_novaretail_sophie",
    "/entreprises",
    "/missions",
    "/calendrier",
    "/activites",
    "/statistiques",
    "/parametres?tab=entreprise",
    "/parametres?tab=crm",
    "/parametres?tab=modules",
  ]) {
    await open(page, path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(1);
  }
});
