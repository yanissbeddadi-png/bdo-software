import { afterEach, describe, expect, it } from "vitest";
import { execute, finalize } from "@/lib/domain/runtime";
import * as C from "@/lib/domain/commands";
import { CLIENT_INPUT, NOW, TODAY, ctx } from "@/test/fixtures";
import { createSeedData, defaultCrmSettings, SEED_VERSION } from "./seed";
import { clearWorkspace, createEmptyData, demoInWorkspace } from "./empty";
import { migrateData } from "./migrations";
import { applyCrmVocabulary } from "@/lib/crm/vocabulary";
import { STAGES, STAGE_LABELS } from "@/lib/calculations/pipeline";
import { SOURCES } from "@/lib/crm/model";
import { disabledModuleAt } from "@/lib/domain/modules";
import type { AppData } from "@/lib/domain/types";

const OWNER = { firstName: "Claire", lastName: "Martin", jobTitle: "Directrice commerciale", email: "Claire.Martin@client.example" };
const empty = () => createEmptyData(TODAY, NOW, "Martin Conseil", OWNER, "emp_owner");

describe("espace vide pour un nouveau client", () => {
  it("ne contient aucune donnée métier, une seule fiche (la personne qui installe) et une identité neutre", () => {
    const d = empty();
    for (const k of ["clients", "contacts", "opportunities", "tasks", "invoices", "projects", "products", "missions", "xpTransactions", "notifications", "auditLogs"] as const)
      expect(d[k], k).toHaveLength(0);
    expect(d.employees).toHaveLength(1);
    expect(d.employees[0]).toMatchObject({ id: "emp_owner", firstName: "Claire", lastName: "Martin", email: "claire.martin@client.example" });
    expect(d.settings.company.name).toBe("Martin Conseil");
    expect(d.settings.company.openingBalance).toBe(0);
    expect(d.settings.branding.bdoMark).toBe(false);
    expect(d.settings.demo).toMatchObject({ version: SEED_VERSION, sample: false });
    expect(d.settings.user).toMatchObject({ role: "dirigeant", employeeId: "emp_owner" });
    expect(Object.values(d.settings.modules).every(Boolean)).toBe(true);
  });

  it("fonctionne d'emblée : rafraîchissement quotidien et première entreprise", () => {
    const d = finalize(empty(), { today: TODAY, now: NOW }).data;
    expect(d.clients).toHaveLength(0);
    const r = execute(d, C.createClient, { ...CLIENT_INPUT, name: "Premier client", ownerId: "emp_owner" }, ctx("dirigeant"));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.clients.map((c) => c.name)).toEqual(["Premier client"]);
  });

  it("vider un espace garde les réglages, l'identité et l'équipe", () => {
    const seed = createSeedData(TODAY, NOW);
    const branded: AppData = { ...seed, settings: { ...seed.settings, branding: { logo: null, color: "#112233", bdoMark: false } } };
    const cleared = clearWorkspace(branded, TODAY);
    expect(cleared.contacts).toHaveLength(0);
    expect(cleared.invoices).toHaveLength(0);
    expect(cleared.employees).toEqual(seed.employees);
    expect(cleared.settings.branding.color).toBe("#112233");
    expect(cleared.settings.demo.sample).toBe(false);
  });

  it("charger la démonstration dans un espace garde son nom, son identité et ses fiches", () => {
    const current = empty();
    const d = demoInWorkspace(createSeedData(TODAY, NOW), current);
    expect(d.contacts.length).toBeGreaterThan(0);
    expect(d.settings.company.name).toBe("Martin Conseil");
    expect(d.settings.branding).toEqual(current.settings.branding);
    expect(d.employees.some((e) => e.id === "emp_owner")).toBe(true);
    expect(d.settings.demo.sample).toBe(true);
  });
});

describe("migration v3 → v4 (espaces existants)", () => {
  it("ajoute identité BDO, modules actifs, étapes et sources par défaut sans toucher aux règles", () => {
    const seed = createSeedData(TODAY, NOW);
    const { stages: _s, sources: _src, ...crmV3 } = seed.settings.crm;
    void _s;
    void _src;
    const { branding: _b, modules: _m, ...settingsV3 } = seed.settings;
    void _b;
    void _m;
    const v3 = { ...seed, settings: { ...settingsV3, crm: { ...crmV3, inactivityDays: 30 }, demo: { ...seed.settings.demo, version: 3 } } } as unknown as AppData;
    const m = migrateData(v3, TODAY);
    expect(m.settings.demo.version).toBe(4);
    expect(m.settings.branding).toEqual({ logo: null, color: "#E81A3B", bdoMark: true });
    expect(Object.values(m.settings.modules).every(Boolean)).toBe(true);
    expect(m.settings.crm.inactivityDays).toBe(30);
    expect(m.settings.crm.stages.won).toEqual({ label: "Gagné", probability: 100 });
    expect(m.settings.crm.sources.length).toBeGreaterThan(3);
  });
});

describe("réglages configurables par client", () => {
  afterEach(() => applyCrmVocabulary(defaultCrmSettings()));

  it("étapes renommées et sources personnalisées appliquées partout", () => {
    const crm = defaultCrmSettings();
    const data = { ...createSeedData(TODAY, NOW) };
    const r = execute(
      data,
      C.updateCrmSettings,
      {
        ...crm,
        stages: { ...crm.stages, discussion: { label: "Rendez-vous découverte", probability: 30 }, won: { label: "Signé", probability: 40 } },
        sources: ["Bouche-à-oreille", "Salon", "Salon"],
      },
      ctx("dirigeant"),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.settings.crm.stages.won).toEqual({ label: "Signé", probability: 100 });
    expect(r.data.settings.crm.sources).toEqual(["Bouche-à-oreille", "Salon"]);
    applyCrmVocabulary(r.data.settings.crm);
    expect(STAGE_LABELS.discussion).toBe("Rendez-vous découverte");
    expect(STAGES.find((s) => s.id === "discussion")?.defaultProbability).toBe(30);
    expect(SOURCES).toEqual(["Bouche-à-oreille", "Salon"]);
    applyCrmVocabulary(defaultCrmSettings());
    expect(STAGE_LABELS.discussion).toBe("En discussion");
  });

  it("refuse un libellé d'étape vide et réserve les réglages au directeur commercial", () => {
    const crm = defaultCrmSettings();
    const data = createSeedData(TODAY, NOW);
    expect(execute(data, C.updateCrmSettings, { ...crm, stages: { ...crm.stages, new: { label: " ", probability: 5 } } }, ctx("dirigeant")).ok).toBe(false);
    expect(execute(data, C.updateCrmSettings, crm, ctx("commercial")).ok).toBe(false);
  });

  it("identité visuelle : couleur et logo validés", () => {
    const data = empty();
    expect(execute(data, C.updateBranding, { color: "rouge" }, ctx("dirigeant")).ok).toBe(false);
    expect(execute(data, C.updateBranding, { logo: "data:text/html;base64,PHNjcmlwdD4=" }, ctx("dirigeant")).ok).toBe(false);
    expect(execute(data, C.updateBranding, { logo: `data:image/png;base64,${"A".repeat(500_000)}` }, ctx("dirigeant")).ok).toBe(false);
    const ok = execute(data, C.updateBranding, { color: "#0a7f5a", logo: "data:image/png;base64,iVBORw0KGgo=" }, ctx("dirigeant"));
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.data.settings.branding).toEqual({ logo: "data:image/png;base64,iVBORw0KGgo=", color: "#0A7F5A", bdoMark: false });
    expect(execute(data, C.updateBranding, { color: "#000000" }, ctx("commercial")).ok).toBe(false);
  });

  it("modules : désactivation des pages, clé inconnue refusée", () => {
    const data = empty();
    const r = execute(data, C.updateModules, { finance: false, offices: false }, ctx("dirigeant"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(disabledModuleAt("/finances/factures/inv_1", r.data.settings.modules)?.key).toBe("finance");
    expect(disabledModuleAt("/bureaux", r.data.settings.modules)?.key).toBe("offices");
    expect(disabledModuleAt("/projets", r.data.settings.modules)).toBeNull();
    expect(disabledModuleAt("/contacts", r.data.settings.modules)).toBeNull();
    expect(execute(data, C.updateModules, { inconnu: false } as never, ctx("dirigeant")).ok).toBe(false);
  });
});
