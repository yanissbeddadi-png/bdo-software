import { expect, test } from "@playwright/test";
import { open } from "./helpers";

const PAGES: [string, string][] = [
  ["Centre de missions", "Centre de missions"],
  ["Finances", "Finances"],
  ["Ventes et CRM", "Ventes et CRM"],
  ["Clients", "Clients"],
  ["Projets", "Projets"],
  ["Tâches", "Tâches"],
  ["Équipe", "Équipe"],
  ["Produits et services", "Produits et services"],
  ["Opérations", "Opérations"],
  ["Analyses", "Analyses et rapports"],
  ["Objectifs", "Objectifs et OKR"],
  ["Progression", "Progression"],
  ["Notifications", "Centre de notifications"],
  ["Paramètres", "Paramètres"],
  ["Vue d'ensemble", "Bonjour, dirigeant."],
];

test("navigation latérale vers tous les modules", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page, "/");
  await expect(page.getByRole("heading", { name: "Indicateurs financiers" }).first()).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Navigation principale" });
  for (const [link, title] of PAGES) {
    await nav.getByRole("link", { name: link, exact: link !== "Notifications" }).click();
    await expect(page.locator("main h1").first()).toHaveText(title);
  }
  expect(errors).toEqual([]);
});

test("le Command Center affiche KPI, alertes, missions et données de démonstration", async ({ page }) => {
  await open(page, "/");
  for (const label of ["Chiffre d'affaires facturé", "Trésorerie disponible", "MRR", "Pipeline commercial"]) await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Alertes prioritaires" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Missions du jour" })).toBeVisible();
  await expect(page.getByText(/Mode démonstration/)).toBeVisible();
});

test("recherche globale au clavier", async ({ page }) => {
  await open(page, "/");
  await page.keyboard.press("Control+k");
  const input = page.getByPlaceholder("Rechercher un client, une facture, un projet…");
  await input.fill("NovaRetail");
  await expect(page.getByRole("option", { name: /NovaRetail/ }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/clients\/cli_novaretail/);
  await expect(page.locator("main h1")).toHaveText("NovaRetail");
});

test("la recherche sans résultat propose de créer un élément", async ({ page }) => {
  await open(page, "/");
  await page.keyboard.press("Control+k");
  await page.getByPlaceholder("Rechercher un client, une facture, un projet…").fill("zzzz-introuvable");
  await expect(page.getByText(/Aucun résultat pour/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Créer un client" })).toBeVisible();
});
