import { expect, test, type Browser, type Page } from "@playwright/test";

const ADMIN = { email: "admin@bdo-test.fr", password: "MotDePasse-Test-2026" };
let accounts: { head: string; email: string; password: string }[] = [];

async function login(browser: Browser, email: string, password: string, path = "/"): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto(path);
  await expect(page).toHaveURL(/\/connexion/);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.locator("main h1").first()).toBeVisible();
  return page;
}

test.describe.serial("mode multi-utilisateur", () => {
  test("installation : code requis, espace et compte administrateur créés", async ({ page }) => {
    await page.goto("/pipeline");
    await expect(page).toHaveURL(/\/connexion\?suite=%2Fpipeline/);
    await page.goto("/installation");
    await page.getByLabel("Code d'installation").fill("mauvais-code");
    await page.getByLabel("Votre nom").fill("Admin Test");
    await page.getByLabel("E-mail (identifiant)").fill(ADMIN.email);
    await page.getByLabel("Mot de passe (10 caractères minimum)").fill(ADMIN.password);
    await page.getByLabel("Confirmer le mot de passe").fill(ADMIN.password);
    await page.getByRole("button", { name: /Créer l'espace/ }).click();
    await expect(page.getByText("Code d'installation incorrect.")).toBeVisible();
    await page.getByLabel("Code d'installation").fill(process.env.BDO_SETUP_CODE ?? "");
    await page.getByRole("button", { name: /Créer l'espace/ }).click();
    await expect(page).toHaveURL(/parametres\?tab=roles/);
    await expect(page.getByRole("heading", { name: "Utilisateurs de l'équipe" })).toBeVisible();
    // Une seconde installation est impossible.
    await page.goto("/installation");
    await expect(page.getByText("L'installation est déjà terminée.")).toBeVisible();
  });

  test("comptes de test : identifiants affichés une fois, connexion refusée avec un mauvais mot de passe", async ({ browser }) => {
    const admin = await login(browser, ADMIN.email, ADMIN.password, "/parametres?tab=roles");
    await admin.getByRole("button", { name: /Créer les comptes de test/ }).click();
    const list = admin.getByTestId("credentials");
    await expect(list).toBeVisible();
    accounts = (await list.locator("li").allInnerTexts()).map((t) => {
      const [head, email, password] = t
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      return { head: head!, email: email!, password: password! };
    });
    expect(accounts.length).toBeGreaterThanOrEqual(5);
    const page = await (await browser.newContext()).newPage();
    await page.goto("/connexion");
    await page.getByLabel("E-mail").fill(accounts[0]!.email);
    await page.getByLabel("Mot de passe").fill("incorrect-123");
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page.getByText("E-mail ou mot de passe incorrect.")).toBeVisible();
  });

  test("données partagées entre deux sessions, rôle imposé par le serveur", async ({ browser }) => {
    const admin = await login(browser, ADMIN.email, ADMIN.password, "/contacts");
    await admin.getByRole("button", { name: "Nouveau contact" }).click();
    const dialog = admin.getByRole("dialog");
    await dialog.getByLabel("Prénom").fill("Partage");
    await dialog.getByLabel("Nom", { exact: true }).fill("Synchro");
    await dialog.getByLabel("ou nouvelle entreprise").fill("SyncCorp");
    await dialog.getByRole("button", { name: "Créer le contact" }).click();
    await expect(admin).toHaveURL(/\/contacts\/con_/);
    await expect(admin.getByText("Enregistré", { exact: true })).toBeVisible();
    const contactPath = new URL(admin.url()).pathname;

    const commercial = accounts.find((a) => /Commercial/.test(a.head))!;
    const c = await login(browser, commercial.email, commercial.password, contactPath);
    await expect(c.locator("main h1")).toHaveText("Partage Synchro");
    await c.getByRole("button", { name: "Appel", exact: true }).click();
    await c.getByRole("dialog").getByLabel("Résumé").fill("Appel de synchronisation");
    await c.getByRole("dialog").getByRole("button", { name: "Consigner l'interaction" }).click();
    await expect(c.getByText("Enregistré", { exact: true })).toBeVisible();

    await admin.reload();
    await admin.getByRole("tab", { name: /Activités/ }).click();
    await expect(admin.getByText("Appel de synchronisation").first()).toBeVisible();

    const collab = accounts.find((a) => /Collaborateur/.test(a.head))!;
    const u = await login(browser, collab.email, collab.password, "/entreprises");
    await u.getByRole("button", { name: "Nouvelle entreprise" }).click();
    await u.getByRole("dialog").getByLabel("Raison sociale").fill("Interdite SA");
    await u.getByRole("dialog").getByRole("button", { name: "Créer l'entreprise" }).click();
    await expect(u.getByText(/Action non autorisée/).first()).toBeVisible();
    await u.goto("/parametres?tab=roles");
    await expect(u.getByRole("heading", { name: "Mon compte" })).toBeVisible();
    await expect(u.getByText("Utilisateurs de l'équipe")).toHaveCount(0);
  });

  test("désactivation d'un compte et déconnexion", async ({ browser }) => {
    const target = accounts.find((a) => /Finance/.test(a.head))!;
    const admin = await login(browser, ADMIN.email, ADMIN.password, "/parametres?tab=roles");
    const row = admin.locator(`[data-member="${target.email}"]`);
    await row.getByRole("button", { name: "Désactiver" }).click();
    await expect(row.getByText("Désactivé")).toBeVisible();
    const page = await (await browser.newContext()).newPage();
    await page.goto("/connexion");
    await page.getByLabel("E-mail").fill(target.email);
    await page.getByLabel("Mot de passe").fill(target.password);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page.getByText(/désactivé/)).toBeVisible();

    await admin.getByRole("button", { name: "Menu du profil" }).click();
    await admin.getByRole("menuitem", { name: "Se déconnecter" }).click();
    await expect(admin).toHaveURL(/\/connexion/);
    await admin.goto("/pipeline");
    await expect(admin).toHaveURL(/\/connexion/);
  });
});
