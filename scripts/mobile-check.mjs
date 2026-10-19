import { chromium } from "@playwright/test";
const base = process.argv[2] ?? "http://localhost:3200";
const routes = [
  "/",
  "/pipeline",
  "/contacts",
  "/contacts/con_novaretail_sophie",
  "/entreprises",
  "/entreprises/cli_novaretail",
  "/missions",
  "/calendrier",
  "/activites",
  "/statistiques",
  "/progression",
  "/progression?tab=defis",
  "/parametres",
  // Modules historiques (hors navigation principale).
  "/bureaux",
  "/finances",
  "/finances/factures",
  "/finances/depenses",
  "/finances/tresorerie",
  "/finances/tva",
  "/finances/avoirs",
  "/finances/abonnements",
  "/crm/devis",
  "/projets",
  "/projets/prj_006",
  "/taches",
  "/equipe",
  "/catalogue",
  "/operations",
  "/analyses",
  "/objectifs",
  "/notifications",
];
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
for (const r of routes) {
  await page.goto(base + r, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  const res = await page.evaluate(() => {
    const over = document.documentElement.scrollWidth - window.innerWidth;
    const culprits = [];
    if (over > 1)
      for (const el of document.querySelectorAll("main *")) {
        const b = el.getBoundingClientRect();
        if (b.right > window.innerWidth + 2 && !el.closest(".overflow-x-auto")) culprits.push(el.tagName + "." + String(el.className).slice(0, 60));
      }
    return { over, culprits: culprits.slice(0, 3) };
  });
  console.log(r, res.over, res.culprits.join(" | "));
}
await page.screenshot({ path: "/tmp/claude-0/shots/mobile_last.png" });
await page.goto(base + "/", { waitUntil: "networkidle" });
await page.waitForTimeout(500);
await page.screenshot({ path: "/tmp/claude-0/shots/mobile_home.png", fullPage: true });
await browser.close();
