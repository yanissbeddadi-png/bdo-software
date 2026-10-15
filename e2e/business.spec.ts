import { expect, test } from "@playwright/test";
import { open, quickCreate } from "./helpers";

test("création d'un client puis affichage des erreurs de validation", async ({ page }) => {
  await open(page, "/clients");
  await quickCreate(page, "Client");
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Créer le client" }).click();
  await expect(dialog.getByText("Le nom est obligatoire")).toBeVisible();
  await dialog.getByLabel("Nom", { exact: true }).fill("Quantum Lab");
  await dialog.getByLabel("Secteur").fill("Recherche");
  await dialog.getByRole("button", { name: "Créer le client" }).click();
  await expect(page).toHaveURL(/\/clients\/cli_/);
  await expect(page.locator("main h1")).toHaveText("Quantum Lab");
  // Doublon refusé
  await quickCreate(page, "Client");
  await page.getByRole("dialog").getByLabel("Nom", { exact: true }).fill("quantum lab");
  await page.getByRole("dialog").getByRole("button", { name: "Créer le client" }).click();
  await expect(page.getByText(/existe déjà/).first()).toBeVisible();
});

test("facture : création, paiement partiel puis intégral, soldes recalculés", async ({ page }) => {
  await open(page, "/finances/factures");
  await quickCreate(page, "Facture");
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Client", { exact: true }).selectOption({ label: "PixelForge" });
  await dialog.getByLabel("Désignation ligne 1").fill("Audit de sécurité");
  await dialog.getByLabel("Quantité ligne 1").fill("2");
  await dialog.getByLabel("Prix unitaire HT ligne 1").fill("500");
  await expect(dialog.getByText("1 200,00 €")).toBeVisible(); // 1 000 € HT + 20 % TVA
  await dialog.getByRole("button", { name: "Créer la facture" }).click();
  await expect(page).toHaveURL(/\/finances\/factures\/inv_/);
  await expect(page.locator("main h1")).toContainText("Facture FAC-");
  await expect(page.getByText("Émise", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Enregistrer un paiement" }).click();
  const pay = page.getByRole("dialog");
  await pay.getByLabel("Montant reçu").fill("400");
  await pay.getByRole("button", { name: "Enregistrer le paiement" }).click();
  await expect(page.getByText("Partiellement payée").first()).toBeVisible();
  await expect(page.locator("dl").getByText("800,00 €")).toBeVisible();

  // Trop-perçu refusé
  await page.getByRole("button", { name: "Enregistrer un paiement" }).click();
  await page.getByRole("dialog").getByLabel("Montant reçu").fill("900");
  await page.getByRole("dialog").getByRole("button", { name: "Enregistrer le paiement" }).click();
  await expect(page.getByText(/dépasse le solde restant/).first()).toBeVisible();
  await page.getByRole("dialog").getByLabel("Montant reçu").fill("800");
  await page.getByRole("dialog").getByRole("button", { name: "Enregistrer le paiement" }).click();
  await expect(page.getByText("Payée", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("+30 XP").first()).toBeVisible();
});

test("opportunité : création puis déplacement dans le pipeline", async ({ page }) => {
  await open(page, "/crm");
  await page.getByRole("button", { name: "Nouvelle opportunité" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nom de l'opportunité").fill("Refonte API Orbis");
  await dialog.getByLabel("Client", { exact: true }).selectOption({ label: "Orbis Industrie" });
  await dialog.getByLabel("Montant estimé HT").fill("12000");
  await dialog.getByRole("button", { name: "Créer l'opportunité" }).click();
  await expect(page).toHaveURL(/focus=opp_/);
  await page.keyboard.press("Escape");
  const card = page.locator("article[data-opportunity]", { hasText: "Refonte API Orbis" });
  await expect(page.locator('section[data-stage="new"]').locator("article", { hasText: "Refonte API Orbis" })).toBeVisible();
  await card.getByLabel("Étape de Refonte API Orbis").selectOption("negotiation");
  await expect(page.locator('section[data-stage="negotiation"]').locator("article", { hasText: "Refonte API Orbis" })).toBeVisible();
  await expect(page.locator('section[data-stage="negotiation"]').locator("article", { hasText: "Refonte API Orbis" }).getByText("70 %")).toBeVisible();
});

test("devis : création depuis le catalogue", async ({ page }) => {
  await open(page, "/crm/devis");
  await page.getByRole("button", { name: "Nouveau devis" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Client", { exact: true }).selectOption({ label: "DataSpring" });
  await dialog.getByLabel("Produit ligne 1").selectOption({ label: "BDO Consulting" });
  await dialog.getByLabel("Quantité ligne 1").fill("3");
  await dialog.getByRole("button", { name: "Créer le devis" }).click();
  await expect(page).toHaveURL(/\/crm\/devis\/quo_/);
  await expect(page.getByText("3 300,00 €").first()).toBeVisible();
  await page.getByRole("button", { name: "Marquer comme envoyé" }).click();
  await page.getByRole("button", { name: "Accepté" }).click();
  await page.getByRole("button", { name: "Convertir en facture" }).click();
  await expect(page).toHaveURL(/\/finances\/factures\/inv_/);
  await expect(page.getByText("Brouillon", { exact: true }).first()).toBeVisible();
});

test("tâche : création rapide puis clôture avec gain d'XP unique", async ({ page }) => {
  await open(page, "/taches");
  await page.getByLabel("Création rapide de tâche").fill("Préparer la démo e2e");
  await page.getByRole("button", { name: "Ajouter", exact: true }).click();
  await page.getByPlaceholder("Rechercher…").fill("Préparer la démo e2e");
  await page.getByRole("button", { name: "Terminer « Préparer la démo e2e »" }).click();
  await expect(page.getByText("+20 XP").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Rouvrir « Préparer la démo e2e »" })).toBeVisible();
});

test("objectif manuel : mise à jour de la progression", async ({ page }) => {
  await open(page, "/objectifs");
  const card = page.locator('[data-goal="goal_satisfaction"]');
  await expect(card.getByText("50 %")).toBeVisible();
  await card.getByLabel("Valeur actuelle (saisie manuelle)").fill("4,5");
  await card.getByRole("button", { name: "Mettre à jour" }).click();
  await expect(card.getByText("100 %")).toBeVisible();
  await expect(card.getByText("Atteint")).toBeVisible();
});

test("les filtres modifient réellement la liste des factures", async ({ page }) => {
  await open(page, "/finances/factures");
  const rows = page.locator("tbody tr");
  await page.getByLabel("Statut").selectOption({ label: "En retard" });
  await expect(rows.first()).toBeVisible();
  const count = await rows.count();
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThan(15);
  for (let i = 0; i < count; i++) await expect(rows.nth(i).getByText("En retard")).toBeVisible();
});

test("permissions : un collaborateur ne peut pas émettre de facture", async ({ page }) => {
  await open(page, "/parametres?tab=roles");
  await page.getByLabel("Rôle simulé").selectOption("collaborateur");
  await quickCreate(page, "Facture");
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Client", { exact: true }).selectOption({ label: "PixelForge" });
  await dialog.getByLabel("Désignation ligne 1").fill("Test");
  await dialog.getByLabel("Prix unitaire HT ligne 1").fill("100");
  await dialog.getByRole("button", { name: "Créer la facture" }).click();
  await expect(page.getByText(/Action non autorisée/).first()).toBeVisible();
});
