import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_CLOUD_PORT ?? 3400);
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;

/**
 * Parcours du mode multi-utilisateur contre un Supabase LOCAL (`npx supabase start`).
 * Prérequis : variables NEXT_PUBLIC_SUPABASE_URL (127.0.0.1), NEXT_PUBLIC_SUPABASE_ANON_KEY,
 * SUPABASE_SERVICE_ROLE_KEY et BDO_SETUP_CODE, puis `next build`. La base locale est
 * vidée avant les tests (refusé si l'URL n'est pas locale).
 */
export default defineConfig({
  testDir: "./e2e-cloud",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  workers: 1,
  reporter: [["list"]],
  globalSetup: "./e2e-cloud/reset.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    trace: "retain-on-failure",
    launchOptions: executablePath ? { executablePath } : undefined,
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 900 },
  },
  webServer: { command: `npx next start -p ${PORT}`, url: `http://localhost:${PORT}/connexion`, reuseExistingServer: true, timeout: 120_000 },
});
