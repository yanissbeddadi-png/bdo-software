import { SEED_VERSION } from "@/lib/database/seed";
import { describe, expect, it } from "vitest";
import { execute, finalize } from "@/lib/domain/runtime";
import * as C from "@/lib/domain/commands";
import { summarizeData } from "@/lib/calculations/invoices";
import { cashBalance, billedRevenue } from "@/lib/calculations/finance";
import { documentTotals } from "@/lib/calculations/money";
import { vatPeriods, currentVatEstimate } from "@/lib/calculations/vat";
import { buildForecast } from "@/lib/calculations/cashflow";
import { computeAlerts } from "@/lib/calculations/alerts";
import { migrateData } from "@/lib/database/migrations";
import { ctx, emptyData, line, NOW, TODAY, client } from "@/test/fixtures";
import type { AppData, Expense } from "@/lib/domain/types";

function ok<R>(res: ReturnType<typeof execute<unknown, R>>): Extract<typeof res, { ok: true }> {
  if (!res.ok) throw new Error(res.error);
  return res;
}

function base(): AppData {
  const d = emptyData();
  d.clients = [client()];
  d.settings.company.vatTrackingStart = "2026-08-01";
  d.settings.company.vatDueDay = 24;
  d.settings.company.openingBalance = 1_000_000;
  d.settings.company.openingBalanceDate = "2026-01-01";
  return d;
}

/** Facture de 1 000 € HT à 20 % (1 200 € TTC), émise le `issueDate`. */
function withInvoice(d: AppData, issueDate = "2026-08-05") {
  const r = ok(execute(d, C.createInvoice, { clientId: "cli_1", issueDate, dueDate: "2026-12-31", items: [line(1, 1000)], projectId: null, notes: "", issue: true }, ctx()));
  return { data: r.data, id: r.result.id };
}

const pay = (invoiceId: string, date: string, amount: number) => ({ invoiceId, date, amount, method: "transfer" as const, reference: "", notes: "" });

function expense(id: string, paidDate: string | null, amountHT: number): Expense {
  return {
    id,
    label: "Hébergement",
    supplier: "Cloud",
    category: "hosting",
    date: paidDate ?? "2026-08-01",
    amountHT,
    vatRate: 2000,
    paid: paidDate !== null,
    paidDate,
    dueDate: paidDate ?? "2026-11-30",
    projectId: null,
    notes: "",
    createdAt: NOW,
    updatedAt: NOW,
  };
}

describe("avoirs et remboursements", () => {
  it("un avoir total sur une facture payée la solde « annulée par avoir » et crée un trop-perçu à rembourser", () => {
    const init = withInvoice(base());
    let d = init.data;
    const id = init.id;
    d = ok(execute(d, C.recordPayment, pay(id, "2026-10-01", 120_000), ctx())).data;
    const inv = d.invoices[0]!;
    const note = ok(execute(d, C.createCreditNote, { invoiceId: id, issueDate: TODAY, items: inv.items, reason: "Prestation annulée" }, ctx()));
    expect(note.result.number).toBe("AV-2026-0001");
    expect(note.message).toContain("Trop-perçu");
    d = note.data;
    let s = summarizeData(d, TODAY)[0]!;
    expect(s.status).toBe("credited");
    expect(s.balance).toBe(0);
    expect(s.creditBalance).toBe(120_000);
    // CA facturé net de l'avoir sur octobre (facture en août, avoir en octobre).
    expect(billedRevenue(summarizeData(d, TODAY), { start: "2026-10-01", end: "2026-10-31" })).toBe(-100_000);

    expect(execute(d, C.recordRefund, { invoiceId: id, creditNoteId: note.result.id, date: TODAY, amount: 120_001, method: "transfer", reference: "" }, ctx()).ok).toBe(false);
    const cashBefore = cashBalance(d, TODAY);
    d = ok(execute(d, C.recordRefund, { invoiceId: id, creditNoteId: note.result.id, date: TODAY, amount: 120_000, method: "transfer", reference: "VIR-1" }, ctx())).data;
    s = summarizeData(d, TODAY)[0]!;
    expect(s.creditBalance).toBe(0);
    expect(s.paid).toBe(0);
    expect(cashBalance(d, TODAY)).toBe(cashBefore - 120_000);
    expect(execute(d, C.recordRefund, { invoiceId: id, creditNoteId: null, date: TODAY, amount: 1, method: "transfer", reference: "" }, ctx()).ok).toBe(false);
  });

  it("un avoir partiel réduit le net dû ; le cumul des avoirs ne peut dépasser la facture", () => {
    const init = withInvoice(base());
    let d = init.data;
    const id = init.id;
    const half = [{ ...line(1, 400), id: "li_cn" }];
    d = ok(execute(d, C.createCreditNote, { invoiceId: id, issueDate: TODAY, items: half, reason: "Geste commercial" }, ctx())).data;
    const s = summarizeData(d, TODAY)[0]!;
    expect(s.creditedTTC).toBe(48_000);
    expect(s.netTTC).toBe(72_000);
    expect(s.balance).toBe(72_000);
    expect(s.status).toBe("issued");
    // Paiement limité au net dû.
    expect(execute(d, C.recordPayment, pay(id, TODAY, 72_001), ctx()).ok).toBe(false);
    // 400 € + 700 € > 1 000 € : refusé ; 600 € : accepté et solde la facture.
    expect(execute(d, C.createCreditNote, { invoiceId: id, issueDate: TODAY, items: [line(1, 700)], reason: "Trop" }, ctx()).ok).toBe(false);
    d = ok(execute(d, C.createCreditNote, { invoiceId: id, issueDate: TODAY, items: [line(1, 600)], reason: "Solde" }, ctx())).data;
    expect(summarizeData(d, TODAY)[0]!.status).toBe("credited");
    expect(d.creditNotes.map((c) => c.number)).toEqual(["AV-2026-0001", "AV-2026-0002"]);
    // Une facture créditée ne peut plus être annulée.
    expect(execute(d, C.cancelInvoice, { id, reason: "x" }, ctx()).ok).toBe(false);
  });

  it("refuse un avoir sur un brouillon, daté dans le futur ou avant la facture, ou sans permission", () => {
    const draft = ok(execute(base(), C.createInvoice, { clientId: "cli_1", issueDate: "2026-10-01", dueDate: "2026-10-31", items: [line(1, 100)], projectId: null, notes: "", issue: false }, ctx()));
    expect(execute(draft.data, C.createCreditNote, { invoiceId: draft.result.id, issueDate: TODAY, items: [line(1, 10)], reason: "x" }, ctx()).ok).toBe(false);
    const { data: d, id } = withInvoice(base());
    expect(execute(d, C.createCreditNote, { invoiceId: id, issueDate: "2026-12-01", items: [line(1, 10)], reason: "x" }, ctx()).ok).toBe(false);
    expect(execute(d, C.createCreditNote, { invoiceId: id, issueDate: "2026-08-01", items: [line(1, 10)], reason: "x" }, ctx()).ok).toBe(false);
    expect(execute(d, C.createCreditNote, { invoiceId: id, issueDate: TODAY, items: [line(1, 10)], reason: "x" }, ctx("collaborateur")).ok).toBe(false);
  });

  it("retire l'XP « facture payée » quand la facture est intégralement annulée par avoir", () => {
    const init = withInvoice(base());
    let d = init.data;
    const id = init.id;
    const paid = ok(execute(d, C.recordPayment, pay(id, TODAY, 120_000), ctx()));
    const reward = paid.data.xpTransactions.find((x) => x.idempotencyKey === `invoice:${id}`);
    expect(reward?.amount).toBeGreaterThan(0);
    d = ok(execute(paid.data, C.createCreditNote, { invoiceId: id, issueDate: TODAY, items: paid.data.invoices[0]!.items, reason: "Annulation" }, ctx())).data;
    const reversal = d.xpTransactions.filter((x) => x.idempotencyKey === `invoice-reversal:${id}`);
    expect(reversal).toHaveLength(1);
    expect(reversal[0]!.amount).toBe(-reward!.amount);
    // Idempotent : une nouvelle réconciliation n'ajoute rien.
    expect(finalize(d, { now: NOW, today: TODAY }).awarded).toHaveLength(0);
  });
});

describe("TVA", () => {
  /** Août : encaissement 1 200 € TTC (200 € de TVA) ; septembre : dépense payée 500 € HT (100 € de TVA). */
  function scenario() {
    const init = withInvoice(base());
    let d = init.data;
    const id = init.id;
    d = ok(execute(d, C.recordPayment, pay(id, "2026-08-20", 120_000), ctx())).data;
    d = { ...d, expenses: [expense("exp_1", "2026-09-10", 50_000)] };
    return { data: d, invoiceId: id };
  }

  it("calcule collectée, déductible et net par période sur les encaissements", () => {
    const { data } = scenario();
    const rows = vatPeriods(data, TODAY);
    expect(rows.map((r) => r.period)).toEqual(["2026-08", "2026-09"]);
    expect(rows[0]).toMatchObject({ collected: 20_000, deductible: 0, net: 20_000, state: "late", dueDate: "2026-09-24" });
    expect(rows[1]).toMatchObject({ collected: 0, deductible: 10_000, net: -10_000, state: "to_declare" });
    expect(currentVatEstimate(data, TODAY)).toMatchObject({ period: "2026-10", creditCarriedIn: 10_000 });
  });

  it("déclare dans l'ordre, fige les montants, clôture la période et intègre le paiement à la trésorerie", () => {
    const init = scenario();
    let d = init.data;
    const invoiceId = init.invoiceId;
    expect(execute(d, C.declareVatReturn, { period: "2026-09" }, ctx()).ok).toBe(false);
    expect(execute(d, C.declareVatReturn, { period: "2026-10" }, ctx()).ok).toBe(false);
    const aug = ok(execute(d, C.declareVatReturn, { period: "2026-08" }, ctx()));
    expect(aug.result).toMatchObject({ status: "declared", net: 20_000 });
    d = aug.data;
    expect(execute(d, C.declareVatReturn, { period: "2026-08" }, ctx()).ok).toBe(false);

    // Période clôturée : plus aucun flux daté en août.
    expect(execute(d, C.deletePayment, { id: d.payments[0]!.id }, ctx()).ok).toBe(false);
    expect(execute(d, C.createCreditNote, { invoiceId, issueDate: TODAY, items: [line(1, 100)], reason: "x" }, ctx()).ok).toBe(true);

    const sep = ok(execute(d, C.declareVatReturn, { period: "2026-09" }, ctx()));
    expect(sep.result).toMatchObject({ status: "credit", net: -10_000 });
    d = sep.data;
    expect(execute(d, C.payVatReturn, { id: sep.result.id, paidDate: TODAY, reference: "" }, ctx()).ok).toBe(false);

    const cashBefore = cashBalance(d, TODAY);
    expect(execute(d, C.payVatReturn, { id: aug.result.id, paidDate: "2026-08-31", reference: "" }, ctx()).ok).toBe(false);
    expect(execute(d, C.payVatReturn, { id: aug.result.id, paidDate: "2026-12-01", reference: "" }, ctx()).ok).toBe(false);
    d = ok(execute(d, C.payVatReturn, { id: aug.result.id, paidDate: TODAY, reference: "TP-1" }, ctx())).data;
    expect(d.vatReturns.find((r) => r.id === aug.result.id)).toMatchObject({ status: "paid", paidDate: TODAY, reference: "TP-1" });
    expect(cashBalance(d, TODAY)).toBe(cashBefore - 20_000);
    expect(execute(d, C.payVatReturn, { id: aug.result.id, paidDate: TODAY, reference: "" }, ctx()).ok).toBe(false);
  });

  it("une période déclarée reste figée même si les données changent ensuite", () => {
    let { data: d } = scenario();
    d = ok(execute(d, C.declareVatReturn, { period: "2026-08" }, ctx())).data;
    // Dépense payée en août refusée (période close) ; en octobre acceptée.
    const exp = {
      label: "Licence",
      supplier: "SaaS",
      category: "software" as const,
      date: "2026-08-15",
      amountHT: 10_000,
      vatRate: 2000,
      paid: true,
      paidDate: "2026-08-15",
      dueDate: "2026-08-15",
      projectId: null,
      notes: "",
    };
    expect(execute(d, C.createExpense, exp, ctx()).ok).toBe(false);
    d = ok(execute(d, C.createExpense, { ...exp, date: TODAY, paidDate: TODAY, dueDate: TODAY }, ctx())).data;
    expect(vatPeriods(d, TODAY)[0]).toMatchObject({ net: 20_000, state: "declared" });
  });

  it("un remboursement réduit la TVA collectée du mois", () => {
    const init = scenario();
    let d = init.data;
    const invoiceId = init.invoiceId;
    d = ok(execute(d, C.createCreditNote, { invoiceId, issueDate: TODAY, items: [line(1, 500)], reason: "Remise" }, ctx())).data;
    d = ok(execute(d, C.recordRefund, { invoiceId, creditNoteId: null, date: TODAY, amount: 60_000, method: "transfer", reference: "" }, ctx())).data;
    expect(currentVatEstimate(d, TODAY).collected).toBe(-10_000);
  });

  it("réservé aux rôles autorisés", () => {
    const { data } = scenario();
    expect(execute(data, C.declareVatReturn, { period: "2026-08" }, ctx("commercial")).ok).toBe(false);
    expect(execute(data, C.declareVatReturn, { period: "2026-08" }, ctx("finance")).ok).toBe(true);
  });

  it("alerte et prévision de trésorerie", () => {
    const { data } = scenario();
    const alerts = computeAlerts(data, TODAY, summarizeData(data, TODAY));
    expect(alerts.some((a) => a.key === "vat-declare:2026-08")).toBe(true);
    const f = buildForecast(data, TODAY, "central");
    expect(f.items.some((i) => i.kind === "vat" && i.amount === -20_000)).toBe(true);

    // Les défis automatiques sont désormais centrés CRM : la TVA reste suivie par les alertes du module Finances.
    const declared = ok(execute(data, C.declareVatReturn, { period: "2026-08" }, ctx()));
    expect(computeAlerts(declared.data, TODAY, summarizeData(declared.data, TODAY)).some((a) => a.key === "vat-declare:2026-08")).toBe(false);
  });
});

describe("migration des données locales", () => {
  it("ajoute avoirs, remboursements et TVA aux données v1 sans perdre l'existant", () => {
    const { data } = scenario1();
    const legacy = structuredClone(data) as unknown as Record<string, unknown> & { settings: { demo: { version: number }; company: Record<string, unknown> }; sequences: Record<string, unknown> };
    delete legacy.creditNotes;
    delete legacy.refunds;
    delete legacy.vatReturns;
    delete legacy.sequences.creditNote;
    delete legacy.settings.company.vatTrackingStart;
    delete legacy.settings.company.vatDueDay;
    legacy.settings.demo.version = 1;
    const migrated = migrateData(legacy as unknown as AppData, TODAY);
    expect(migrated.settings.demo.version).toBe(SEED_VERSION);
    expect(migrated.creditNotes).toEqual([]);
    expect(migrated.vatReturns).toEqual([]);
    expect(migrated.sequences.creditNote).toBe(0);
    expect(migrated.settings.company.vatTrackingStart).toBe("2026-09-01");
    expect(migrated.invoices).toEqual(data.invoices);
    expect(vatPeriods(migrated, TODAY).map((r) => r.period)).toEqual(["2026-09"]);
    expect(migrateData(migrated, TODAY)).toBe(migrated);
  });
});

function scenario1() {
  const { data, id } = withInvoice(base());
  return { data, id, ttc: documentTotals(data.invoices[0]!.items).totalTTC };
}
