import { expect, test } from "@playwright/test";
import { open } from "./helpers";

const PAGES: [string, string][] = [
  ["Centre de missions", "Centre de missions"],
  ["Bureaux 3D", "Bureaux"],
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

test("bureaux 3D : carte plein écran, fiches au clic depuis la liste", async ({ page }) => {
  // Rendu logiciel en CI : qualité basse pour garder une page fluide.
  await page.addInitScript(() => localStorage.setItem("bdo-office-quality", "low"));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page, "/bureaux");
  await expect(page.getByTestId("office-canvas").locator("canvas")).toBeVisible();
  const pick = async (name: RegExp) => {
    await page.getByRole("button", { name: "Liste des zones et collaborateurs" }).click();
    await page.getByTestId("office-list").getByRole("button", { name }).click();
    await expect(page.getByTestId("office-list")).toHaveCount(0);
  };
  await pick(/^Finance/);
  const zonePanel = page.getByTestId("zone-panel");
  await expect(zonePanel.getByText("Trésorerie")).toBeVisible();
  await expect(zonePanel.getByRole("link", { name: /Ouvrir le module/ })).toHaveAttribute("href", "/finances");
  await pick(/^Camille/);
  const person = page.getByTestId("person-panel");
  await expect(person.getByText("Agenda du jour")).toBeVisible();
  await expect(person.getByRole("link", { name: /Fiche collaborateur/ })).toHaveAttribute("href", "/equipe?focus=emp_camille");
  await page.keyboard.press("Escape");
  await expect(person).toHaveCount(0);
  // Zone verrouillée par le rang.
  await pick(/Laboratoire R&D/);
  await expect(page.getByText(/Zone verrouillée — débloquée au rang 4/)).toBeVisible();
  // Heure simulée : à 8 h, les bureaux sont fermés.
  await page.getByLabel("Heure simulée").fill("480");
  await expect(page.getByText(/Bureaux fermés/)).toBeVisible();
});
