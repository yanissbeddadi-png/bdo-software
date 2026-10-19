import { expect, test } from "@playwright/test";
import { open } from "./helpers";

test("nouveau contact : avertissement de doublon, confirmation explicite, puis création d'un prospect complet", async ({ page }) => {
  await open(page, "/contacts");
  await page.getByRole("button", { name: "Nouveau contact" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Prénom").fill("Sophie");
  await dialog.getByLabel("Nom", { exact: true }).fill("Garnier");
  await dialog.getByLabel("E-mail").fill("sophie.garnier@novaretail.example");
  await dialog.getByLabel("Entreprise existante").selectOption({ label: "NovaRetail" });
  await dialog.getByLabel("Étape commerciale").selectOption("");
  await dialog.getByRole("button", { name: "Créer le contact" }).click();
  await expect(dialog.getByRole("alert").filter({ hasText: "Doublon probable" })).toBeVisible();
  await expect(dialog.getByText(/Aucune fusion automatique/)).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Nouveau contact" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Prénom").fill("Zoé");
  await dialog.getByLabel("Nom", { exact: true }).fill("Petit");
  await dialog.getByLabel("Fonction").fill("Directrice générale");
  await dialog.getByLabel("ou nouvelle entreprise").fill("Quantix");
  await dialog.getByLabel("Valeur estimée HT").fill("8000");
  await dialog.getByRole("button", { name: "Créer le contact" }).click();
  await expect(page).toHaveURL(/\/contacts\/con_/);
  await expect(page.locator("main h1")).toHaveText("Zoé Petit");
  await expect(page.getByRole("link", { name: "Quantix" })).toBeVisible();
  await expect(page.getByText("Premier appel de découverte").first()).toBeVisible();
  await page.getByRole("tab", { name: /Opportunités/ }).click();
  await expect(page.getByText("8 000 €").first()).toBeVisible();
});

test("fiche 360° : consigner un appel avec suite, visible dans la timeline et les missions", async ({ page }) => {
  await open(page, "/contacts/con_novaretail_sophie");
  await expect(page.getByText("Résumé de la relation")).toBeVisible();
  await page.getByRole("button", { name: "Appel", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Résumé").fill("Point sur la remise multi-sites");
  await dialog.getByLabel("Résultat").fill("Accord de principe, attend la version finale");
  await dialog.getByText("Planifier la prochaine action").click();
  await dialog.getByRole("textbox", { name: "Prochaine action" }).fill("Envoyer la version finale de l'offre");
  await dialog.getByRole("button", { name: "Consigner l'interaction" }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("tab", { name: /Activités/ }).click();
  await expect(page.getByText("Point sur la remise multi-sites").first()).toBeVisible();
  await page.getByRole("tab", { name: /Missions/ }).click();
  await expect(page.getByText("Envoyer la version finale de l'offre")).toBeVisible();
  // L'étape commerciale n'a pas changé.
  await expect(page.getByText("Négociation").first()).toBeVisible();
});

test("missions : terminer une mission du jour avec résultat et suite proposée", async ({ page }) => {
  await open(page, "/missions?view=today");
  const tab = page.getByRole("tab", { name: /Aujourd'hui/ });
  await expect(tab).toHaveAttribute("aria-selected", "true");
  const before = Number((await tab.locator("span").last().textContent()) ?? "0");
  expect(before).toBeGreaterThan(0);
  const row = page.locator("[data-task-id]").first();
  const title = (await row.locator("p").first().textContent())!;
  await row.getByRole("button", { name: `Terminer ${title}` }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Résultat/).fill("Échange réalisé, besoin confirmé");
  await dialog.getByRole("button", { name: "Terminer la mission" }).click();
  await expect(page.getByText(/Mission terminée/).first()).toBeVisible();
  await expect(tab.locator("span").last()).toHaveText(String(before - 1));
  await page.getByRole("tab", { name: /Terminées/ }).click();
  await expect(page.locator("[data-task-id]", { hasText: title }).getByText("Résultat : Échange réalisé, besoin confirmé")).toBeVisible();
});

test("pipeline : changement d'étape accessible et motif de perte", async ({ page }) => {
  await open(page, "/pipeline");
  const card = page.locator("[data-card-id]", { hasText: "Brasserie Lumen" }).first();
  await expect(page.locator('section[data-column="new"]').locator("[data-card-id]", { hasText: "Brasserie Lumen" })).toBeVisible();
  await card.getByLabel(/Déplacer Click & collect Brasserie Lumen/).selectOption("qualify");
  await expect(page.locator('section[data-column="qualify"]').locator("[data-card-id]", { hasText: "Brasserie Lumen" })).toBeVisible();
  // Perdu : un motif est demandé.
  await page
    .locator("[data-card-id]", { hasText: "Brasserie Lumen" })
    .first()
    .getByLabel(/Déplacer/)
    .selectOption("lost");
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Motif de perte").fill("Budget reporté");
  await dialog.getByRole("button", { name: "Changer l'étape" }).click();
  await expect(page.locator('section[data-column="lost"]').locator("[data-card-id]", { hasText: "Brasserie Lumen" })).toBeVisible();
  // Vue enregistrée « Perdues ».
  await page.getByRole("tab", { name: /Perdues/ }).click();
  await expect(page.locator("[data-card-id]", { hasText: "Brasserie Lumen" })).toBeVisible();
  await expect(page.locator("[data-card-id]", { hasText: "NovaRetail" })).toHaveCount(0);
});

test("calendrier : événement de la semaine, contexte et clôture", async ({ page }) => {
  await open(page, "/calendrier");
  await expect(page.getByText(/aucun agenda externe/)).toBeVisible();
  await page
    .getByRole("button", { name: /Revue de l'offre multi-sites/ })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("link", { name: /Sophie Garnier/ })).toBeVisible();
  await expect(dialog.getByText(/· Négociation/).first()).toBeVisible();
  await dialog.getByRole("button", { name: "Marquer comme réalisée" }).click();
  const complete = page.getByRole("dialog");
  await expect(complete.getByRole("heading", { name: /Terminer :/ })).toBeVisible();
  await complete.getByLabel(/Résultat/).fill("Offre validée sur le principe");
  await complete.getByRole("button", { name: "Terminer la mission" }).click();
  await expect(page.getByText(/Mission terminée/).first()).toBeVisible();
});

test("statistiques : les filtres recalculent les indicateurs", async ({ page }) => {
  await open(page, "/statistiques");
  // Carte d'indicateur : libellé → en-tête → carte.
  const value = page.getByText("Opportunités actives", { exact: true }).locator("xpath=../..");
  const all = await value.textContent();
  await page.getByLabel("Étape", { exact: true }).selectOption("proposal");
  await expect(value).not.toHaveText(all!);
  await expect(page.getByRole("button", { name: "Définition : Taux de conversion" })).toBeVisible();
});
