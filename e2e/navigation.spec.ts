import { expect, test } from "@playwright/test";
import { open } from "./helpers";

const PAGES: [string, string][] = [
  ["Pipeline CRM", "Pipeline CRM"],
  ["Contacts", "Contacts"],
  ["Entreprises clientes", "Entreprises clientes"],
  ["Missions", "Missions"],
  ["Calendrier", "Calendrier"],
  ["Activités", "Activités"],
  ["Statistiques", "Statistiques"],
  ["Progression", "Progression"],
  ["Paramètres", "Paramètres"],
  ["Vue d'ensemble", "Bonjour, voici votre centre de commande commercial."],
];

test("navigation latérale vers tous les modules CRM", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page, "/");
  const nav = page.getByRole("navigation", { name: "Navigation principale" });
  // Les modules historiques ne sont plus dans la navigation principale.
  await expect(nav.getByRole("link", { name: "Finances" })).toHaveCount(0);
  for (const [link, title] of PAGES) {
    await nav.getByRole("link", { name: link }).click();
    await expect(page.locator("main h1").first()).toHaveText(title);
  }
  expect(errors).toEqual([]);
});

test("les anciennes routes redirigent vers les modules CRM et les modules historiques restent accessibles", async ({ page }) => {
  await page.goto("/crm");
  await expect(page).toHaveURL(/\/pipeline$/);
  await page.goto("/clients/cli_novaretail");
  await expect(page).toHaveURL(/\/entreprises\/cli_novaretail$/);
  await expect(page.locator("main h1")).toHaveText("NovaRetail");
  await open(page, "/parametres");
  await page.getByRole("link", { name: /^Finances/ }).click();
  await expect(page.locator("main h1")).toHaveText("Finances");
});

test("la vue d'ensemble affiche indicateurs, centre d'action expliqué et pipeline", async ({ page }) => {
  await open(page, "/");
  for (const label of ["Relances en retard", "Missions du jour", "Nouveaux prospects à traiter", "Propositions en attente", "Valeur du pipeline"])
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Centre d'action du jour" })).toBeVisible();
  const first = page.locator("[data-action-kind]").first();
  await expect(first).toHaveAttribute("data-action-kind", "overdue");
  await expect(first.getByText("Pourquoi :")).toBeVisible();
  await expect(page.getByText(/Mode démonstration/)).toBeVisible();
  // Les compteurs ouvrent des vues filtrées.
  await page.getByRole("link", { name: /Relances en retard/ }).click();
  await expect(page).toHaveURL(/\/missions\?view=overdue/);
  await expect(page.getByRole("tab", { name: /En retard/ })).toHaveAttribute("aria-selected", "true");
});

test("recherche globale au clavier", async ({ page }) => {
  await open(page, "/");
  await page.keyboard.press("Control+k");
  const input = page.getByPlaceholder("Rechercher un contact, une entreprise, une opportunité, une note…");
  await input.fill("Sophie Garnier");
  await expect(page.getByRole("option", { name: /Sophie Garnier/ }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/contacts\/con_novaretail_sophie/);
  await expect(page.locator("main h1")).toHaveText("Sophie Garnier");
});

test("la recherche sans résultat propose de créer un élément", async ({ page }) => {
  await open(page, "/");
  await page.keyboard.press("Control+k");
  await page.getByPlaceholder("Rechercher un contact, une entreprise, une opportunité, une note…").fill("zzzz-introuvable");
  await expect(page.getByText(/Aucun résultat pour/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Créer un contact" })).toBeVisible();
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
