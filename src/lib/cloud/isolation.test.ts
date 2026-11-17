import { describe, expect, it } from "vitest";
import type { AppData, Client } from "@/lib/domain/types";
import { createSeedData } from "@/lib/database/seed";
import { NOW, OPPORTUNITY_INPUT, TODAY } from "@/test/fixtures";
import { runSharedCommand, type Member, type StateStore } from "./engine";
import { computeScope, distributePortfolio } from "./scope";

/** Intégrité serveur et cloisonnement (chantier A1). */

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
const director = () => member(DIRECTOR, { role: "dirigeant" });

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
let seedCounter = 0;
const run = (store: StateStore, m: Member, name: string, input: unknown) => runSharedCommand(store, m, { name, input, now: NOW, seed: `seed${(seedCounter++).toString().padStart(8, "0")}` }, serverNow);

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
const clientValues = (c: Client) => ({
  name: c.name,
  sector: c.sector,
  status: c.status,
  relation: c.relation,
  size: c.size,
  city: c.city,
  country: c.country,
  website: c.website,
  ownerId: c.ownerId,
  source: c.source,
  satisfaction: c.satisfaction,
  notes: c.notes,
});

/** Contacts et entreprises de Camille et de Hugo dans le portefeuille réparti. */
function cast(data: AppData) {
  const mine = data.contacts.find((c) => c.ownerId === "emp_camille" && c.clientId)!;
  const hugoClient = data.clients.find((c) => c.ownerId === "emp_hugo")!;
  const myClient = data.clients.find((c) => c.id === mine.clientId)!;
  return { mine, hugoClient, myClient };
}

describe("cloisonnement : rattachements et responsables", () => {
  it("refuse de rattacher son contact ou son opportunité à l'entreprise d'un collègue", async () => {
    const data = portfolio();
    const { mine, hugoClient } = cast(data);
    const { store, state } = memoryStore(data);
    const camille = member("emp_camille");
    expect(computeScope(data, "emp_camille").clients.has(hugoClient.id)).toBe(false);

    const moved = await run(store, camille, "updateContact", { id: mine.id, values: { ...contactValues(mine), clientId: hugoClient.id, isPrimary: false } });
    expect(moved.ok).toBe(false);
    if (!moved.ok) expect(moved.error).toMatch(/entreprise de votre portefeuille/);
    expect(state.data.contacts.find((c) => c.id === mine.id)?.clientId).toBe(mine.clientId);

    const opp = await run(store, camille, "createOpportunity", { ...OPPORTUNITY_INPUT, clientId: hugoClient.id, contactId: mine.id, ownerId: "emp_camille" });
    expect(opp.ok).toBe(false);
    // L'entreprise du collègue reste inaccessible.
    const upd = await run(store, camille, "updateClient", { id: hugoClient.id, values: { ...clientValues(hugoClient), notes: "Piratage" } });
    expect(upd.ok).toBe(false);
    expect((await run(store, camille, "deleteClient", { id: hugoClient.id })).ok).toBe(false);
    expect(state.data.clients.find((c) => c.id === hugoClient.id)?.notes).not.toBe("Piratage");
  });

  it("autorise le rattachement à une entreprise de son périmètre ou créée par la même action", async () => {
    const data = portfolio();
    const { mine, myClient } = cast(data);
    const { store, state } = memoryStore(data);
    const camille = member("emp_camille");
    const other = data.contacts.find((c) => c.ownerId === "emp_camille" && c.clientId !== myClient.id)!;
    const ok = await run(store, camille, "updateContact", { id: other.id, values: { ...contactValues(other), clientId: myClient.id, isPrimary: false } });
    expect(ok.ok, ok.ok ? "" : ok.error).toBe(true);

    const created = await run(store, camille, "createProspect", {
      firstName: "Nina",
      lastName: "Nouvelle",
      jobTitle: "",
      email: "nina.nouvelle@nouvelle.example",
      phone: "",
      clientId: null,
      newCompanyName: "Société Toute Neuve",
      source: "",
      ownerId: "emp_camille",
      relation: "prospect",
      priority: "normal",
      stage: "new",
      opportunityName: "",
      amount: 0,
      notes: "",
      nextAction: null,
      confirmDuplicate: false,
    });
    expect(created.ok, created.ok ? "" : created.error).toBe(true);
    expect(state.data.clients.some((c) => c.name === "Société Toute Neuve" && c.ownerId === "emp_camille")).toBe(true);
    void mine;
  });

  it("une entreprise partagée par les liens se modifie, mais son responsable ne change pas", async () => {
    const base = portfolio();
    const { mine, hugoClient } = cast(base);
    // Le directeur rattache le contact de Camille à l'entreprise de Hugo.
    const data: AppData = { ...base, contacts: base.contacts.map((c) => (c.id === mine.id ? { ...c, clientId: hugoClient.id, isPrimary: false } : c)) };
    const { store, state } = memoryStore(data);
    const camille = member("emp_camille");
    expect(computeScope(data, "emp_camille").clients.has(hugoClient.id)).toBe(true);

    const edit = await run(store, camille, "updateClient", { id: hugoClient.id, values: { ...clientValues(hugoClient), city: "Lyon" } });
    expect(edit.ok, edit.ok ? "" : edit.error).toBe(true);
    expect(state.data.clients.find((c) => c.id === hugoClient.id)?.city).toBe("Lyon");

    const current = state.data.clients.find((c) => c.id === hugoClient.id)!;
    const take = await run(store, camille, "updateClient", { id: hugoClient.id, values: { ...clientValues(current), ownerId: "emp_camille" } });
    expect(take.ok).toBe(false);
    if (!take.ok) expect(take.error).toMatch(/directeur commercial/);
    expect(state.data.clients.find((c) => c.id === hugoClient.id)?.ownerId).toBe("emp_hugo");

    // Le directeur reste sans restriction.
    const dir = await run(store, director(), "updateClient", { id: hugoClient.id, values: { ...clientValues(current), ownerId: "emp_camille" } });
    expect(dir.ok, dir.ok ? "" : dir.error).toBe(true);
  });

  it("refuse de s'approprier l'opportunité d'un collègue rattachée à son contact", async () => {
    const base = portfolio();
    const { mine } = cast(base);
    const opp = base.opportunities.find((o) => o.contactId === mine.id) ?? base.opportunities.find((o) => o.ownerId === "emp_camille")!;
    const data: AppData = { ...base, opportunities: base.opportunities.map((o) => (o.id === opp.id ? { ...o, ownerId: "emp_hugo", contactId: mine.id, clientId: mine.clientId } : o)) };
    const { store } = memoryStore(data);
    const camille = member("emp_camille");
    const current = data.opportunities.find((o) => o.id === opp.id)!;
    const values = {
      name: current.name,
      clientId: current.clientId,
      leadId: current.leadId,
      contactId: current.contactId,
      amount: current.amount,
      probability: current.probability,
      stage: current.stage,
      expectedCloseDate: current.expectedCloseDate,
      source: current.source,
      ownerId: current.ownerId,
      priority: current.priority,
      nextAction: current.nextAction,
      notes: current.notes,
    };
    expect((await run(store, camille, "updateOpportunity", { id: opp.id, values: { ...values, ownerId: "emp_camille" } })).ok).toBe(false);
    const edit = await run(store, camille, "updateOpportunity", { id: opp.id, values: { ...values, nextAction: "Rappeler" } });
    expect(edit.ok, edit.ok ? "" : edit.error).toBe(true);
  });
});
