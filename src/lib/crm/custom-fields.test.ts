import { describe, expect, it } from "vitest";
import { execute } from "@/lib/domain/runtime";
import * as C from "@/lib/domain/commands";
import type { AppData, CustomFieldDef } from "@/lib/domain/types";
import type { ContactInput, ProspectInput } from "@/lib/validation/schemas";
import { client, CLIENT_INPUT, ctx, emptyData, OPPORTUNITY_INPUT } from "@/test/fixtures";
import { applyCustomInput, cleanCustomValue, customSearchText, formatCustomValue, importCustomValue, isIsoDate } from "./custom-fields";

function ok<R>(res: ReturnType<typeof execute<unknown, R>>): Extract<typeof res, { ok: true }> {
  if (!res.ok) throw new Error(res.error);
  return res;
}

const TEXT: CustomFieldDef = { id: "cf_text", entity: "contact", label: "Commentaire", type: "text", options: [] };
const NUM: CustomFieldDef = { id: "cf_num", entity: "contact", label: "Effectif", type: "number", options: [] };
const DATE: CustomFieldDef = { id: "cf_date", entity: "contact", label: "Échéance", type: "date", options: [] };
const LIST: CustomFieldDef = { id: "cf_list", entity: "contact", label: "Canal", type: "select", options: ["E-mail", "Téléphone"] };
const YES: CustomFieldDef = { id: "cf_yes", entity: "contact", label: "Abonné", type: "yesno", options: [] };
const DEFS = [TEXT, NUM, DATE, LIST, YES];

describe("nettoyage des valeurs personnalisées", () => {
  it("contrôle chaque type", () => {
    expect(cleanCustomValue(TEXT, "  bonjour  ")).toEqual({ ok: true, value: "bonjour" });
    expect(cleanCustomValue(TEXT, "x".repeat(501)).ok).toBe(false);
    expect(cleanCustomValue(TEXT, 12).ok).toBe(false);
    expect(cleanCustomValue(NUM, 12.5)).toEqual({ ok: true, value: 12.5 });
    expect(cleanCustomValue(NUM, "1 234,5")).toEqual({ ok: true, value: 1234.5 });
    expect(cleanCustomValue(NUM, Number.NaN).ok).toBe(false);
    expect(cleanCustomValue(NUM, Number.POSITIVE_INFINITY).ok).toBe(false);
    expect(cleanCustomValue(DATE, "2026-02-28")).toEqual({ ok: true, value: "2026-02-28" });
    expect(cleanCustomValue(DATE, "2026-02-30").ok).toBe(false);
    expect(cleanCustomValue(DATE, "28/02/2026").ok).toBe(false);
    expect(cleanCustomValue(LIST, "E-mail")).toEqual({ ok: true, value: "E-mail" });
    expect(cleanCustomValue(LIST, "Fax").ok).toBe(false);
    // Valeur retirée de la liste mais déjà enregistrée : conservée.
    expect(cleanCustomValue(LIST, "Fax", "Fax")).toEqual({ ok: true, value: "Fax" });
    expect(cleanCustomValue(YES, true)).toEqual({ ok: true, value: true });
    expect(cleanCustomValue(YES, "oui").ok).toBe(false);
    for (const def of DEFS) expect(cleanCustomValue(def, null)).toEqual({ ok: true, value: undefined });
    expect(cleanCustomValue(TEXT, "   ")).toEqual({ ok: true, value: undefined });
  });

  it("fusionne la saisie sans effacer les champs absents ni les valeurs masquées", () => {
    const current = { cf_text: "ancien", cf_num: 3, cf_deleted: "masqué" };
    const { values, errors } = applyCustomInput(DEFS, current, { cf_num: 4, cf_list: "Téléphone", cf_inconnu: "x", cf_text: "" });
    expect(errors).toEqual([]);
    expect(values).toEqual({ cf_num: 4, cf_list: "Téléphone", cf_deleted: "masqué" });
    expect(applyCustomInput(DEFS, undefined, { cf_text: "" }).values).toBeUndefined();
    expect(applyCustomInput(DEFS, current, undefined).values).toEqual(current);
    expect(applyCustomInput(DEFS, undefined, { cf_date: "demain" }).errors[0]?.fieldId).toBe("cf_date");
  });

  it("formate, recherche et importe", () => {
    expect(formatCustomValue(YES, false)).toBe("Non");
    expect(formatCustomValue(DATE, "2026-10-05")).toBe("05/10/2026");
    expect(formatCustomValue(TEXT, undefined)).toBe("");
    expect(customSearchText(DEFS, { cf_text: "Sage", cf_list: "E-mail", cf_num: 4 })).toBe("Sage E-mail");
    expect(importCustomValue(YES, "Oui")).toEqual({ ok: true, value: true });
    expect(importCustomValue(YES, "peut-être").ok).toBe(false);
    expect(importCustomValue(DATE, "5/10/2026")).toEqual({ ok: true, value: "2026-10-05" });
    expect(importCustomValue(DATE, new Date(Date.UTC(2026, 9, 5)))).toEqual({ ok: true, value: "2026-10-05" });
    expect(importCustomValue(LIST, "téléphone")).toEqual({ ok: true, value: "Téléphone" });
    expect(importCustomValue(NUM, 42)).toEqual({ ok: true, value: 42 });
    expect(isIsoDate("2024-02-29")).toBe(true);
    expect(isIsoDate("2025-02-29")).toBe(false);
  });
});

function withFields(): AppData {
  const d = emptyData();
  d.clients = [client()];
  d.settings.customFields = [
    LIST,
    NUM,
    { id: "cf_logiciel", entity: "company", label: "Logiciel", type: "select", options: ["Sage 100", "EBP"] },
    { id: "cf_concurrent", entity: "opportunity", label: "Concurrent", type: "text", options: [] },
  ];
  return d;
}

const CONTACT: ContactInput = {
  clientId: "cli_1",
  firstName: "Léa",
  lastName: "Martin",
  jobTitle: "",
  email: "lea@acme.example",
  phone: "",
  relation: "prospect",
  ownerId: null,
  source: "",
  priority: "normal",
  isPrimary: false,
  notes: "",
};

describe("commandes et champs personnalisés", () => {
  it("contact : création, modification partielle, refus d'une valeur invalide", () => {
    const created = ok(execute(withFields(), C.createContact, { ...CONTACT, custom: { cf_list: "E-mail", cf_num: 12, cf_company_only: "x" } }, ctx()));
    expect(created.result.custom).toEqual({ cf_list: "E-mail", cf_num: 12 });
    // Valeur masquée (champ supprimé) déjà présente sur la fiche.
    const d = created.data;
    d.contacts = d.contacts.map((c) => ({ ...c, custom: { ...c.custom, cf_old: "conservée" } }));
    const updated = ok(execute(d, C.updateContact, { id: created.result.id, values: { ...CONTACT, custom: { cf_num: 13 } } }, ctx()));
    expect(updated.result.custom).toEqual({ cf_list: "E-mail", cf_num: 13, cf_old: "conservée" });
    const cleared = ok(execute(updated.data, C.updateContact, { id: created.result.id, values: { ...CONTACT, custom: { cf_list: "", cf_num: null } } }, ctx()));
    expect(cleared.result.custom).toEqual({ cf_old: "conservée" });
    const bad = execute(updated.data, C.updateContact, { id: created.result.id, values: { ...CONTACT, custom: { cf_list: "Fax" } } }, ctx());
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.error).toContain("Canal");
      expect(bad.fieldErrors.custom).toBeDefined();
    }
    // Sans saisie personnalisée : valeurs inchangées.
    const untouched = ok(execute(updated.data, C.updateContact, { id: created.result.id, values: CONTACT }, ctx()));
    expect(untouched.result.custom).toEqual(updated.result.custom);
  });

  it("une fiche sans valeur n'a pas de clé custom", () => {
    const created = ok(execute(withFields(), C.createContact, { ...CONTACT, custom: { cf_list: "" } }, ctx()));
    expect("custom" in created.result).toBe(false);
  });

  it("entreprise et opportunité", () => {
    const company = ok(execute(withFields(), C.createClient, { ...CLIENT_INPUT, name: "Beta", custom: { cf_logiciel: "EBP", cf_list: "E-mail" } }, ctx()));
    expect(company.result.custom).toEqual({ cf_logiciel: "EBP" });
    const upd = ok(execute(company.data, C.updateClient, { id: company.result.id, values: { ...CLIENT_INPUT, name: "Beta", custom: { cf_logiciel: "Sage 100" } } }, ctx()));
    expect(upd.result.custom).toEqual({ cf_logiciel: "Sage 100" });
    expect(execute(company.data, C.createClient, { ...CLIENT_INPUT, name: "Gamma", custom: { cf_logiciel: "Cegid" } }, ctx()).ok).toBe(false);

    const opp = ok(execute(withFields(), C.createOpportunity, { ...OPPORTUNITY_INPUT, custom: { cf_concurrent: "  Concurrent A " } }, ctx()));
    expect(opp.result.custom).toEqual({ cf_concurrent: "Concurrent A" });
    // Le changement d'étape conserve les valeurs.
    const moved = ok(execute(opp.data, C.updateOpportunity, { id: opp.result.id, values: { ...OPPORTUNITY_INPUT, stage: "qualify" } }, ctx()));
    expect(moved.result.custom).toEqual({ cf_concurrent: "Concurrent A" });
    expect(moved.data.opportunities.find((o) => o.id === opp.result.id)?.custom).toEqual({ cf_concurrent: "Concurrent A" });
  });

  it("createProspect enregistre les champs du contact", () => {
    const input: ProspectInput = {
      firstName: "Paul",
      lastName: "Durand",
      jobTitle: "",
      email: "",
      phone: "",
      clientId: null,
      newCompanyName: "Delta",
      source: "",
      ownerId: null,
      relation: "prospect",
      priority: "normal",
      stage: null,
      opportunityName: "",
      amount: 0,
      notes: "",
      nextAction: null,
      confirmDuplicate: false,
      custom: { cf_list: "Téléphone" },
    };
    const res = ok(execute(withFields(), C.createProspect, input, ctx()));
    expect(res.result.contact.custom).toEqual({ cf_list: "Téléphone" });
    expect(execute(withFields(), C.createProspect, { ...input, custom: { cf_num: "beaucoup" } }, ctx()).ok).toBe(false);
  });

  it("valeurs hors schéma refusées", () => {
    expect(execute(withFields(), C.createContact, { ...CONTACT, custom: { cf_list: { a: 1 } } } as unknown as ContactInput, ctx()).ok).toBe(false);
  });
});
