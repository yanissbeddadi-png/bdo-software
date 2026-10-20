import { expect, test } from "@playwright/test";
import { open } from "./helpers";

test("configuration de l'espace : modules, identité visuelle, puis espace vidé", async ({ page }) => {
  // Modules : Bureaux 3D masqué.
  await open(page, "/parametres?tab=modules");
  await page.getByRole("switch", { name: "Module Bureaux 3D" }).click();
  await expect(page.getByText("Modules enregistrés.")).toBeVisible();
  await page.goto("/bureaux");
  await expect(page.getByText("Module « Bureaux 3D » désactivé")).toBeVisible();

  // Identité visuelle : couleur appliquée à toute l'application.
  await open(page, "/parametres?tab=entreprise");
  await page.getByLabel("Couleur principale").fill("#0A7F5A");
  await page.getByRole("button", { name: "Enregistrer l'identité visuelle" }).click();
  await expect(page.getByText("Identité visuelle enregistrée.")).toBeVisible();
  await expect(page.locator("div.flex.min-h-screen").first()).toHaveAttribute("style", /--accent:\s*#0A7F5A/);

  // Vider l'espace : plus de contacts, l'équipe et les réglages restent.
  await open(page, "/parametres?tab=donnees");
  await page.getByRole("button", { name: "Vider l'espace" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Vider l'espace" }).click();
  await expect(page.getByText("Espace vidé : réglages et équipe conservés.")).toBeVisible();
  await open(page, "/contacts");
  await expect(page.getByText(/Aucun contact/).first()).toBeVisible();
  await open(page, "/equipe");
  await expect(page.getByText("Camille Laurent").first()).toBeVisible();
  await expect(page.locator("div.flex.min-h-screen").first()).toHaveAttribute("style", /--accent:\s*#0A7F5A/);
});
