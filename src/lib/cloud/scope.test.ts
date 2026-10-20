import { describe, expect, it } from "vitest";
import type { AppData } from "@/lib/domain/types";
import { createSeedData } from "@/lib/database/seed";
import { NOW, TODAY } from "@/test/fixtures";
import { runSharedCommand, sessionUser, type Member, type StateStore } from "./engine";
import { computeScope, distributePortfolio, projectForUser, scopeViolation } from "./scope";

const DIRECTOR = "emp_sacha";
const portfolio = () => distributePortfolio(createSeedData(TODAY, NOW), DIRECTOR);

const member = (employeeId: string, p: Partial<Member> = {}): Member => ({
  userId: `u_${employeeId}`,
  organizationId: "org_bdo",
  role: "commercial",
  name: employeeId,
  email: `${employeeId}@x.example`,
  employeeId,
  active: true,
  ...p,
});

function memoryStore(initial: AppData) {
  const state = { data: initial, version: 1 };
  const store: StateStore = {
    async load() {
      return { data: structuredClone(state.data), version: state.version };
    },
    async save(_org, data, expected) {
      if (expected !== state.version) return false;
      state.data = data;
      state.version++;
      return true;
    },
  };
  return { store, state };
}

const serverNow = new Date(NOW);
const run = (store: StateStore, m: Member, name: string, input: unknown) => runSharedCommand(store, m, { name, input, now: NOW, seed: "abc123def456" }, serverNow);
const contactValues = (c: AppData["contacts"][number]) => ({
  clientId: c.clientId,
  firstName: c.firstName,
  lastName: c.lastName,
  jobTitle: c.jobTitle,
  email: c.email,
  phone: c.phone,
  relation: c.relation,
  ownerId: c.ownerId,
  source: c.source,
  priority: c.priority,
  isPrimary: c.isPrimary,
  notes: c.notes,
});

describe("cloisonnement des données par collaborateur", () => {
  it("répartit le portefeuille de démonstration entre les collaborateurs, hors directeur commercial", () => {
    const data = portfolio();
    const owners = new Set(data.contacts.map((c) => c.ownerId));
    expect(owners.has(DIRECTOR)).toBe(false);
    for (const e of data.employees.filter((x) => x.status === "active" && x.id !== DIRECTOR)) {
      expect(computeScope(data, e.id).contacts.size, e.id).toBeGreaterThan(0);
    }
    // Les opportunités suivent le responsable de leur contact.
    for (const o of data.opportunities) {
      const c = data.contacts.find((x) => x.id === o.contactId);
      if (c) expect(o.ownerId).toBe(c.ownerId);
    }
  });

  it("n'envoie à un collaborateur que son portefeuille, sans finances ni coûts salariaux", () => {
    const data = portfolio();
    const camille = sessionUser(member("emp_camille"));
    const view = projectForUser(data, camille);
    expect(view.contacts.length).toBeGreaterThan(0);
    expect(view.contacts.length).toBeLessThan(data.contacts.length);
    expect(view.contacts.every((c) => c.ownerId === "emp_camille")).toBe(true);
    expect(view.opportunities.every((o) => o.ownerId === "emp_camille" || view.contacts.some((c) => c.id === o.contactId))).toBe(true);
    expect(view.tasks.every((t) => t.assigneeId === "emp_camille" || !t.assigneeId)).toBe(true);
    expect(view.invoices).toHaveLength(0);
    expect(view.payments).toHaveLength(0);
    expect(view.expenses).toHaveLength(0);
    expect(view.auditLogs).toHaveLength(0);
    expect(view.employees.every((e) => e.monthlyCost === 0)).toBe(true);
    // Deux collaborateurs ont des portefeuilles disjoints.
    const hugo = projectForUser(data, sessionUser(member("emp_hugo")));
    const ids = new Set(view.contacts.map((c) => c.id));
    expect(hugo.contacts.some((c) => ids.has(c.id))).toBe(false);
  });

  it("donne tout au directeur commercial", () => {
    const data = portfolio();
    const view = projectForUser(data, sessionUser(member(DIRECTOR, { role: "dirigeant" })));
    expect(view).toBe(data);
  });

  it("autorise un collaborateur à travailler sur ses contacts et refuse ceux des autres", async () => {
    const data = portfolio();
    const { store, state } = memoryStore(data);
    const camille = member("emp_camille");
    const mine = data.contacts.find((c) => c.ownerId === "emp_camille")!;
    const other = data.contacts.find((c) => c.ownerId === "emp_hugo")!;

    const ok = await run(store, camille, "updateContact", { id: mine.id, values: { ...contactValues(mine), jobTitle: "Directrice achats" } });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.data.contacts.every((c) => c.ownerId === "emp_camille")).toBe(true);
      expect(ok.data.invoices).toHaveLength(0);
    }
    expect(state.data.contacts.find((c) => c.id === mine.id)?.jobTitle).toBe("Directrice achats");
    // Le document complet est conservé côté serveur.
    expect(state.data.contacts).toHaveLength(data.contacts.length);
    expect(state.data.invoices.length).toBe(data.invoices.length);

    const denied = await run(store, camille, "updateContact", { id: other.id, values: { ...contactValues(other), jobTitle: "Piratage" } });
    expect(denied.ok).toBe(false);
    expect(state.data.contacts.find((c) => c.id === other.id)?.jobTitle).not.toBe("Piratage");

    const deleted = await run(store, camille, "deleteContact", { id: other.id });
    expect(deleted.ok).toBe(false);
    expect(state.data.contacts.some((c) => c.id === other.id)).toBe(true);
  });

  it("interdit de réaffecter son portefeuille ou de créer un contact pour un autre", async () => {
    const data = portfolio();
    const { store, state } = memoryStore(data);
    const camille = member("emp_camille");
    const mine = data.contacts.find((c) => c.ownerId === "emp_camille")!;

    const moved = await run(store, camille, "bulkUpdateContacts", { ids: [mine.id], ownerId: "emp_hugo" });
    expect(moved.ok).toBe(false);
    if (!moved.ok) expect(moved.error).toMatch(/directeur commercial/);
    expect(state.data.contacts.find((c) => c.id === mine.id)?.ownerId).toBe("emp_camille");

    const base = { ...contactValues(mine), clientId: null, firstName: "Nouvelle", lastName: "Personne", email: "nouvelle.personne@client.example", isPrimary: false };
    expect((await run(store, camille, "createContact", { ...base, ownerId: "emp_hugo" })).ok).toBe(false);
    const created = await run(store, camille, "createContact", { ...base, ownerId: "emp_camille" });
    expect(created.ok).toBe(true);
    expect(state.data.contacts.some((c) => c.lastName === "Personne" && c.ownerId === "emp_camille")).toBe(true);
  });

  it("réserve les modules financiers et les réglages au directeur commercial", () => {
    const data = portfolio();
    const camille = sessionUser(member("emp_camille"));
    const after = { ...data, invoices: data.invoices.slice(1) };
    expect(scopeViolation(data, after, camille)).toMatch(/directeur commercial/);
    expect(scopeViolation(data, after, sessionUser(member(DIRECTOR, { role: "dirigeant" })))).toBeNull();
    // Le suivi automatique de la gamification n'est pas une modification des réglages.
    const tracked = { ...data, settings: { ...data.settings, gamification: { ...data.settings.gamification, announcedLevel: 99 } } };
    expect(scopeViolation(data, tracked, camille)).toBeNull();
  });
});
