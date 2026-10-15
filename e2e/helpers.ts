import { expect, type Page } from "@playwright/test";

/** Ouvre une page et attend que les données de démonstration soient chargées. */
export async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator("main h1").first()).toBeVisible();
}

export async function quickCreate(page: Page, item: string) {
  await page.getByRole("button", { name: "Créer un élément" }).first().click();
  await page.getByRole("menuitem", { name: item, exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
}
