import { expect, test } from "@playwright/test";
import { open, quickCreate } from "./helpers";

test("création d'une entreprise puis affichage des erreurs de validation", async ({ page }) => {
  await open(page, "/entreprises");
  await quickCreate(page, "Entreprise");
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Créer l'entreprise" }).click();
  await expect(dialog.getByText("Le nom est obligatoire")).toBeVisible();
  await dialog.getByLabel("Raison sociale").fill("Quantum Lab");
  await dialog.getByLabel("Secteur").fill("Recherche");
  await dialog.getByRole("button", { name: "Créer l'entreprise" }).click();
  await expect(page).toHaveURL(/\/entreprises\/cli_/);
  await expect(page.locator("main h1")).toHaveText("Quantum Lab");
  // Doublon refusé
  await quickCreate(page, "Entreprise");
  await page.getByRole("dialog").getByLabel("Raison sociale").fill("quantum lab");
  await page.getByRole("dialog").getByRole("button", { name: "Créer l'entreprise" }).click();
  await expect(page.getByText(/existe déjà/).first()).toBeVisible();
});

test("facture : création, paiement partiel puis intégral, soldes recalculés", async ({ page }) => {
  await open(page, "/finances/factures");
  await page.getByRole("button", { name: "Nouvelle facture" }).click();
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
  await open(page, "/finances/factures");
  await page.getByRole("button", { name: "Nouvelle facture" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Client", { exact: true }).selectOption({ label: "PixelForge" });
  await dialog.getByLabel("Désignation ligne 1").fill("Test");
  await dialog.getByLabel("Prix unitaire HT ligne 1").fill("100");
  await dialog.getByRole("button", { name: "Créer la facture" }).click();
  await expect(page.getByText(/Action non autorisée/).first()).toBeVisible();
});

test("avoir total sur une facture payée puis remboursement du trop-perçu", async ({ page }) => {
  await open(page, "/finances/factures");
  await page.getByRole("button", { name: "Nouvelle facture" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Client", { exact: true }).selectOption({ label: "PixelForge" });
  await dialog.getByLabel("Désignation ligne 1").fill("Atelier annulé");
  await dialog.getByLabel("Prix unitaire HT ligne 1").fill("1000");
  await dialog.getByRole("button", { name: "Créer la facture" }).click();
  await expect(page).toHaveURL(/\/finances\/factures\/inv_/);
  await page.getByRole("button", { name: "Enregistrer un paiement" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Enregistrer le paiement" }).click();
  await expect(page.getByText("Payée", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Émettre un avoir" }).click();
  const credit = page.getByRole("dialog");
  await credit.getByRole("button", { name: "Émettre l'avoir" }).click();
  await expect(credit.getByText("Le motif est obligatoire")).toBeVisible();
  await credit.getByLabel("Motif").fill("Atelier annulé par le client");
  await credit.getByRole("button", { name: "Émettre l'avoir" }).click();
  await expect(page.getByText("Annulée par avoir").first()).toBeVisible();
  await expect(page.getByText("Trop-perçu à rembourser", { exact: true })).toBeVisible();
  const avoir = page.getByRole("link", { name: /^AV-\d{4}-\d{4}$/ });
  const number = (await avoir.textContent())!;

  await page.getByRole("button", { name: /^Rembourser/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Enregistrer le remboursement" }).click();
  await expect(page.getByText("Trop-perçu à rembourser", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Encaissé net (après remboursements)")).toBeVisible();

  await avoir.click();
  await expect(page.locator("main h1")).toHaveText(`Avoir ${number}`);
  await expect(page.getByText("Atelier annulé par le client")).toBeVisible();
  await open(page, "/finances/avoirs");
  await expect(page.getByRole("cell", { name: number })).toBeVisible();
});

test("TVA : déclaration de la période puis paiement", async ({ page }) => {
  await open(page, "/finances/tva");
  await expect(page.getByText("À déclarer").or(page.getByText("Déclaration en retard")).first()).toBeVisible();
  await page.getByRole("button", { name: "Déclarer", exact: true }).first().click();
  // Module historique : la déclaration n'est plus liée à un défi (les défis sont centrés CRM).
  await expect(page.getByText("À jour", { exact: true })).toBeVisible();
  const row = page.locator("tbody tr").first();
  const declared = row.getByText("Déclarée — à payer");
  if (await declared.count()) {
    await row.getByRole("button", { name: "Payer" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Référence").fill("TP-E2E");
    await dialog.getByRole("button", { name: "Enregistrer le paiement" }).click();
    await expect(row.getByText("Payée", { exact: true })).toBeVisible();
  } else {
    await expect(row.getByText("Crédit reporté")).toBeVisible();
  }
});
