import { describe, expect, it } from "vitest";
import { billedRevenue, cashBalance, collectedCash, committedExpensesHT, disbursedCash, payables, periodFinancials, receivables } from "./finance";
import { summarizeInvoices } from "./invoices";
import { buildForecast } from "./cashflow";
import { emptyData, invoice, line, NOW, TODAY } from "@/test/fixtures";
import type { AppData, Expense } from "@/lib/domain/types";

const expense = (p: Partial<Expense>): Expense => ({
  id: Math.random().toString(),
  label: "Dépense",
  supplier: "F",
  category: "software",
  date: "2026-10-05",
  amountHT: 100_000,
  vatRate: 2000,
  paid: true,
  paidDate: "2026-10-05",
  dueDate: "2026-10-05",
  projectId: null,
  notes: "",
  createdAt: NOW,
  updatedAt: NOW,
  ...p,
});

function dataset(): AppData {
  const d = emptyData();
  d.settings.company.openingBalance = 1_000_000;
  d.settings.company.openingBalanceDate = "2026-01-01";
  d.invoices = [
    invoice({ id: "a", issueDate: "2026-10-02", dueDate: "2026-11-01", items: [line(1, 1000)] }),
    invoice({ id: "b", issueDate: "2026-09-02", dueDate: "2026-10-02", items: [line(1, 500)] }),
    invoice({ id: "c", issueDate: "2026-10-03", dueDate: "2026-11-03", items: [line(1, 9999)], baseStatus: "cancelled" }),
    invoice({ id: "d", issueDate: "2026-10-04", dueDate: "2026-11-04", items: [line(1, 300)], baseStatus: "draft" }),
  ];
  d.payments = [{ id: "p1", invoiceId: "b", date: "2026-10-10", amount: 30_000, method: "transfer", reference: "", notes: "", createdAt: NOW }];
  d.expenses = [expense({}), expense({ paid: false, paidDate: null, dueDate: "2026-11-10", amountHT: 50_000 }), expense({ date: "2026-09-20", paidDate: "2026-10-01", amountHT: 20_000, vatRate: 0 })];
  return d;
}

describe("indicateurs financiers", () => {
  const d = dataset();
  const s = summarizeInvoices(d.invoices, d.payments, TODAY);
  const oct = { start: "2026-10-01", end: "2026-10-31" };

  it("CA facturé : HT des factures émises de la période, hors brouillons et annulations", () => {
    expect(billedRevenue(s, oct)).toBe(100_000);
  });

  it("encaissements : paiements datés dans la période (distincts du CA facturé)", () => {
    expect(collectedCash(d, oct)).toBe(30_000);
  });

  it("dépenses engagées (date) et décaissements (date de paiement, TTC) sont distincts", () => {
    expect(committedExpensesHT(d.expenses, oct)).toBe(150_000);
    expect(disbursedCash(d.expenses, oct)).toBe(120_000 + 20_000);
  });

  it("résultat opérationnel estimé et marge", () => {
    const pf = periodFinancials(d, s, oct);
    expect(pf.operatingResult).toBe(-50_000);
    expect(pf.operatingMargin).toBe(-50);
  });

  it("trésorerie = ouverture + encaissements − décaissements réalisés (pas factures − dépenses)", () => {
    expect(cashBalance(d, TODAY)).toBe(1_000_000 + 30_000 - 140_000);
  });

  it("créances et dettes", () => {
    expect(receivables(s)).toBe(120_000 + 30_000);
    expect(payables(d.expenses)).toBe(60_000);
  });
});

describe("prévisions de trésorerie", () => {
  it("part du solde réel et ordonne les scénarios prudent ≤ central ≤ optimiste", () => {
    const d = dataset();
    d.opportunities = [
      {
        id: "o",
        name: "Deal",
        clientId: null,
        leadId: "l",
        contactId: null,
        amount: 5_000_000,
        probability: 50,
        stage: "proposal",
        expectedCloseDate: "2026-10-20",
        source: "",
        ownerId: null,
        lastInteractionAt: NOW,
        nextAction: "",
        notes: "",
        closedAt: null,
        lostReason: "",
        priority: "normal",
        qualifiedAt: null,
        archivedAt: null,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ];
    const p = buildForecast(d, TODAY, "prudent");
    const c = buildForecast(d, TODAY, "central");
    const o = buildForecast(d, TODAY, "optimistic");
    expect(p.startBalance).toBe(cashBalance(d, TODAY));
    expect(p.items.some((i) => i.kind === "pipeline")).toBe(false);
    expect(c.items.some((i) => i.kind === "pipeline")).toBe(true);
    const last = (f: typeof p) => f.months.at(-1)!.closingBalance;
    expect(last(p)).toBeLessThanOrEqual(last(c));
    expect(last(c)).toBeLessThanOrEqual(last(o));
  });

  it("intègre les dépenses non payées et les factures ouvertes", () => {
    const f = buildForecast(dataset(), TODAY, "optimistic");
    expect(f.items.find((i) => i.kind === "expense")?.amount).toBe(-Math.round(60_000 * 0.97));
    expect(f.items.filter((i) => i.kind === "invoice").reduce((s, i) => s + i.amount, 0)).toBe(120_000);
    expect(f.items.filter((i) => i.kind === "overdue_invoice").reduce((s, i) => s + i.amount, 0)).toBe(Math.round(30_000 * 0.85));
  });
});
