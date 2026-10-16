import { chromium } from "@playwright/test";
const base = process.argv[2] ?? "http://localhost:3100";
const outDir = process.argv[3] ?? "/tmp/claude-0/shots";
const routes = [
  "/",
  "/missions",
  "/bureaux",
  "/finances",
  "/finances/factures",
  "/finances/depenses",
  "/finances/tresorerie",
  "/finances/tva",
  "/finances/avoirs",
  "/finances/abonnements",
  "/crm",
  "/crm/prospects",
  "/crm/devis",
  "/crm/activites",
  "/clients",
  "/projets",
  "/taches",
  "/equipe",
  "/catalogue",
  "/operations",
  "/analyses",
  "/objectifs",
  "/progression",
  "/notifications",
  "/parametres",
];
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
let errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") errors.push(m.type() + ": " + m.text().slice(0, 300));
});
await page.goto(base + "/", { waitUntil: "networkidle" });
// détail pages
const ids = await page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem("bdo-software:demo-data:v1"));
  return { inv: d.invoices[5].id, cli: d.clients[0].id, prj: d.projects[5].id, quo: d.quotes[0].id };
});
routes.push(`/finances/factures/${ids.inv}`, `/clients/${ids.cli}`, `/projets/${ids.prj}`, `/crm/devis/${ids.quo}`, "/finances/avoirs/cn_001", "/route-inexistante");
for (const r of routes) {
  errors = [];
  await page.goto(base + r, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  const name = r === "/" ? "home" : r.replace(/\//g, "_").slice(1);
  await page.screenshot({ path: `${outDir}/${name}.png`, fullPage: false });
  const h1 = await page
    .locator("h1")
    .first()
    .textContent()
    .catch(() => "?");
  console.log(`${r} → ${h1}${errors.length ? "\n   " + errors.join("\n   ") : ""}`);
}
await browser.close();
