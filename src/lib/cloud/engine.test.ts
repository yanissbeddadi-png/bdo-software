import { describe, expect, it } from "vitest";
import type { AppData } from "@/lib/domain/types";
import { execute } from "@/lib/domain/runtime";
import { withIdSeed } from "@/lib/domain/ids";
import { createSeedData } from "@/lib/database/seed";
import { CLIENT_INPUT, NOW, TODAY } from "@/test/fixtures";
import { defaultRoleFor, replaceSharedState, runSharedCommand, sessionUser, temporaryPassword, withUser, type Member, type StateStore } from "./engine";
import * as C from "@/lib/domain/commands";

/** Stockage en mémoire avec contrôle de version (et conflit simulable). */
function memoryStore(initial: AppData) {
  const state = { data: initial, version: 1, conflicts: 0, saves: 0 };
  const store: StateStore = {
    async load() {
      return { data: structuredClone(state.data), version: state.version };
    },
    async save(_org, data, expected) {
      if (state.conflicts > 0) {
        // Un autre utilisateur enregistre juste avant nous.
        state.conflicts--;
        state.data = {
          ...state.data,
          notes: [
            ...state.data.notes,
            { id: "note_autre", title: "Autre utilisateur", body: "", clientId: null, projectId: null, contactId: null, opportunityId: null, createdAt: NOW, updatedAt: NOW },
          ],
        };
        state.version++;
        return false;
      }
      if (expected !== state.version) return false;
      state.data = data;
      state.version++;
      state.saves++;
      return true;
    },
  };
  return { store, state };
}

const member = (p: Partial<Member> = {}): Member => ({
  userId: "u_1",
  organizationId: "org_bdo",
  role: "commercial",
  name: "Camille",
  email: "camille@x.example",
  employeeId: "emp_camille",
  active: true,
  ...p,
});
const serverNow = new Date(NOW);
const seedData = () => createSeedData(TODAY, NOW);

describe("mode multi-utilisateur : exécution côté serveur", () => {
  it("rejoue la commande avec les mêmes identifiants que le navigateur et enregistre une nouvelle version", async () => {
    const { store, state } = memoryStore(seedData());
    const input = { ...CLIENT_INPUT, name: "Synchro SA" };
    const local = withIdSeed("abc123def456", () => execute(withUser(state.data, sessionUser(member())), C.createClient, input, { today: TODAY, now: NOW, user: sessionUser(member()) }));
    expect(local.ok).toBe(true);
    const res = await runSharedCommand(store, member(), { name: "createClient", input, now: NOW, seed: "abc123def456" }, serverNow);
    expect(res.ok).toBe(true);
    if (!res.ok || !local.ok) return;
    expect(res.version).toBe(2);
    const id = (r: AppData) => r.clients.find((c) => c.name === "Synchro SA")?.id;
    expect(id(res.data)).toBeDefined();
    expect(id(res.data)).toBe(id(local.data));
    expect(state.saves).toBe(1);
  });

  it("applique le rôle du compte (base), jamais celui affirmé par le navigateur", async () => {
    const { store, state } = memoryStore(seedData());
    const res = await runSharedCommand(store, member({ role: "collaborateur" }), { name: "createClient", input: { ...CLIENT_INPUT, name: "Interdite" }, now: NOW, seed: "abc123def456" }, serverNow);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/non autorisée/);
    expect(state.saves).toBe(0);
  });

  it("refuse le changement de rôle de démonstration, une action inconnue et un compte désactivé", async () => {
    const { store } = memoryStore(seedData());
    const req = { input: { role: "admin" }, now: NOW, seed: "abc123def456" };
    expect((await runSharedCommand(store, member(), { ...req, name: "switchDemoRole" }, serverNow)).ok).toBe(false);
    expect((await runSharedCommand(store, member(), { ...req, name: "constructor" }, serverNow)).ok).toBe(false);
    expect((await runSharedCommand(store, member({ active: false }), { ...req, name: "createClient", input: CLIENT_INPUT }, serverNow)).ok).toBe(false);
  });

  it("réserve les réglages partagés (date simulée…) aux rôles autorisés", async () => {
    const { store } = memoryStore(seedData());
    const req = { name: "updatePreferences", input: { referenceDate: "2026-01-01" }, now: NOW, seed: "abc123def456" };
    expect((await runSharedCommand(store, member({ role: "commercial" }), req, serverNow)).ok).toBe(false);
    expect((await runSharedCommand(store, member({ role: "dirigeant" }), req, serverNow)).ok).toBe(true);
  });

  it("rejoue sur la version à jour en cas d'écriture concurrente, sans perdre la modification de l'autre", async () => {
    const { store, state } = memoryStore(seedData());
    state.conflicts = 1;
    const res = await runSharedCommand(store, member(), { name: "createClient", input: { ...CLIENT_INPUT, name: "Concurrente" }, now: NOW, seed: "abc123def456" }, serverNow);
    expect(res.ok).toBe(true);
    expect(state.data.notes.some((n) => n.id === "note_autre")).toBe(true);
    expect(state.data.clients.some((c) => c.name === "Concurrente")).toBe(true);
    expect(state.version).toBe(3);
  });

  it("ignore une horloge de navigateur trop décalée", async () => {
    const { store, state } = memoryStore(seedData());
    await runSharedCommand(store, member(), { name: "createClient", input: { ...CLIENT_INPUT, name: "Horloge" }, now: "2030-01-01T00:00:00.000Z", seed: "abc123def456" }, serverNow);
    expect(state.data.clients.find((c) => c.name === "Horloge")?.createdAt).toBe(serverNow.toISOString());
  });

  it("réserve le remplacement complet des données et refuse un fichier invalide", async () => {
    const { store, state } = memoryStore(seedData());
    expect((await replaceSharedState(store, member({ role: "commercial" }), seedData(), serverNow)).ok).toBe(false);
    expect((await replaceSharedState(store, member({ role: "dirigeant" }), { pas: "valide" }, serverNow)).ok).toBe(false);
    const res = await replaceSharedState(store, member({ role: "dirigeant" }), seedData(), serverNow);
    expect(res.ok).toBe(true);
    expect(state.saves).toBe(1);
  });

  it("mots de passe temporaires robustes et rôles par défaut des comptes de test", () => {
    const a = temporaryPassword();
    expect(a).toMatch(/^[A-Za-z2-9]{4}-[A-Za-z2-9]{5}-[A-Za-z2-9]{5}$/);
    expect(temporaryPassword()).not.toBe(a);
    expect(defaultRoleFor("sales")).toBe("commercial");
    expect(defaultRoleFor("direction")).toBe("dirigeant");
    expect(defaultRoleFor("development")).toBe("collaborateur");
  });
});
