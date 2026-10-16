import { describe, expect, it } from "vitest";
import { createSeedData } from "./seed";
import { summarizeData } from "@/lib/calculations/invoices";
import { vatAmounts, vatPeriods } from "@/lib/calculations/vat";
import { monthPeriod } from "@/lib/calculations/dates";
import { SEED_VERSION } from "./seed";
import { documentTotals } from "@/lib/calculations/money";
import { isAppData } from "./repository";
import { finalize } from "@/lib/domain/runtime";

const ANCHOR = "2026-10-15";

describe("jeu de données de démonstration", () => {
  const d = createSeedData(ANCHOR);

  it("respecte les volumes minimaux du cahier des charges", () => {
    expect(d.clients.length).toBeGreaterThanOrEqual(15);
    expect(d.contacts.length).toBeGreaterThanOrEqual(20);
    expect(d.leads.length).toBeGreaterThanOrEqual(12);
    expect(d.opportunities.length).toBeGreaterThanOrEqual(10);
    expect(d.products.length).toBeGreaterThanOrEqual(8);
    expect(d.projects.length).toBeGreaterThanOrEqual(12);
    expect(d.tasks.length).toBeGreaterThanOrEqual(40);
    expect(d.invoices.length).toBeGreaterThanOrEqual(20);
    expect(d.expenses.length).toBeGreaterThanOrEqual(15);
    expect(d.quotes.length).toBeGreaterThanOrEqual(10);
    expect(d.employees.length).toBeGreaterThanOrEqual(6);
    expect(d.goals.length).toBeGreaterThanOrEqual(8);
    expect(d.missions.length).toBeGreaterThanOrEqual(12);
    expect(d.achievements.length).toBeGreaterThanOrEqual(10);
    expect(d.activity.length).toBeGreaterThanOrEqual(20);
    expect(d.notifications.length).toBeGreaterThan(1);
    expect(isAppData(d)).toBe(true);
  });

  it("est reproductible pour une même date d'ancrage (hors identifiants techniques générés)", () => {
    const again = createSeedData(ANCHOR);
    expect(again.invoices).toEqual(d.invoices);
    expect(again.payments).toEqual(d.payments);
    expect(again.xpTransactions.map((x) => x.idempotencyKey)).toEqual(d.xpTransactions.map((x) => x.idempotencyKey));
  });

  it("cohérence financière : relations valides, paiements jamais supérieurs aux factures ni futurs", () => {
    const clientIds = new Set(d.clients.map((c) => c.id));
    expect(d.invoices.every((i) => clientIds.has(i.clientId))).toBe(true);
    expect(d.projects.every((p) => clientIds.has(p.clientId))).toBe(true);
    expect(d.payments.every((p) => p.date <= ANCHOR)).toBe(true);
    for (const inv of d.invoices) {
      const paid = d.payments.filter((p) => p.invoiceId === inv.id).reduce((s, p) => s + p.amount, 0);
      expect(paid).toBeLessThanOrEqual(documentTotals(inv.items).totalTTC);
      if (inv.baseStatus !== "issued") expect(paid).toBe(0);
    }
    expect(d.expenses.every((e) => !e.paid || (e.paidDate !== null && e.paidDate <= ANCHOR))).toBe(true);
  });

  it("répartit les factures sur plusieurs mois et illustre tous les statuts", () => {
    expect(new Set(d.invoices.map((i) => i.issueDate.slice(0, 7))).size).toBeGreaterThanOrEqual(10);
    const statuses = new Set(summarizeData(d, ANCHOR).map((s) => s.status));
    for (const s of ["draft", "issued", "partially_paid", "paid", "overdue", "cancelled", "credited"]) expect(statuses.has(s as never)).toBe(true);
  });

  it("les numéros de facture émises sont uniques et continus", () => {
    const nums = d.invoices
      .filter((i) => i.baseStatus !== "draft")
      .map((i) => Number(i.number.slice(-4)))
      .sort((a, b) => a - b);
    expect(nums).toEqual(nums.map((_, i) => i + 1));
  });

  it("le rattrapage de gamification est stable (aucune récompense supplémentaire au rechargement)", () => {
    const res = finalize(d, { now: `${ANCHOR}T12:00:00.000Z`, today: ANCHOR });
    expect(res.awarded).toHaveLength(0);
  });

  it("avoirs, remboursements et déclarations de TVA cohérents (version " + SEED_VERSION + ")", () => {
    expect(d.settings.demo.version).toBe(SEED_VERSION);
    const sums = summarizeData(d, ANCHOR);
    // Aucun trop-perçu non remboursé, aucun encaissement net négatif.
    expect(sums.every((s) => s.creditBalance === 0 && s.paid >= 0)).toBe(true);
    for (const c of d.creditNotes) {
      const inv = d.invoices.find((i) => i.id === c.invoiceId)!;
      expect(inv.baseStatus).toBe("issued");
      expect(c.issueDate >= inv.issueDate && c.issueDate <= ANCHOR).toBe(true);
    }
    // Chaque déclaration correspond exactement aux flux de sa période et le report de crédit est séquentiel.
    let carry = 0;
    for (const r of [...d.vatReturns].sort((a, b) => a.period.localeCompare(b.period))) {
      const amounts = vatAmounts(d, monthPeriod(r.period));
      expect(r.collected).toBe(amounts.collected);
      expect(r.deductible).toBe(amounts.deductible);
      expect(r.creditCarriedIn).toBe(carry);
      expect(r.net).toBe(r.collected - r.deductible - r.creditCarriedIn);
      expect(r.status === "credit").toBe(r.net <= 0);
      carry = r.net < 0 ? -r.net : 0;
    }
    // Seule la dernière période complète reste à déclarer.
    expect(vatPeriods(d, ANCHOR).filter((r) => !r.vatReturn)).toHaveLength(1);
  });
});
