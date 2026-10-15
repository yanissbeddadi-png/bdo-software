import { describe, expect, it } from "vitest";
import { computeInvoiceStatus, remainingBalance, summarizeInvoice, validatePayment } from "./invoices";
import { invoice, NOW } from "@/test/fixtures";
import type { Payment } from "@/lib/domain/types";

const pay = (amount: number, date = "2026-09-10"): Payment => ({ id: `p${amount}${date}`, invoiceId: "inv_1", date, amount, method: "transfer", reference: "", notes: "", createdAt: NOW });

describe("statut et solde des factures", () => {
  const inv = invoice(); // 1 000 € HT → 1 200 € TTC, échéance 01/10/2026

  it("facture émise sans paiement, non échue", () => {
    expect(summarizeInvoice(inv, [], "2026-09-15").status).toBe("issued");
  });

  it("paiement partiel : partiellement payée, jamais payée", () => {
    const s = summarizeInvoice(inv, [pay(50_000)], "2026-09-15");
    expect(s.status).toBe("partially_paid");
    expect(s.balance).toBe(70_000);
  });

  it("paiement intégral en plusieurs fois : payée, solde nul", () => {
    const s = summarizeInvoice(inv, [pay(50_000), pay(70_000, "2026-09-20")], "2026-10-15");
    expect(s.status).toBe("paid");
    expect(s.balance).toBe(0);
    expect(s.lastPaymentDate).toBe("2026-09-20");
  });

  it("facture échue avec solde : en retard, même partiellement payée", () => {
    const s = summarizeInvoice(inv, [pay(50_000)], "2026-10-15");
    expect(s.status).toBe("overdue");
    expect(s.daysOverdue).toBe(14);
    expect(s.balance).toBe(70_000);
  });

  it("facture annulée : statut annulé, aucun solde exigible", () => {
    const s = summarizeInvoice(invoice({ baseStatus: "cancelled" }), [], "2026-12-01");
    expect(s.status).toBe("cancelled");
    expect(s.balance).toBe(0);
  });

  it("brouillon : pas de solde exigible", () => {
    expect(remainingBalance(invoice({ baseStatus: "draft" }), [])).toBe(0);
    expect(computeInvoiceStatus({ baseStatus: "draft", totalTTC: 100, paid: 0, dueDate: "2000-01-01", today: "2026-01-01" })).toBe("draft");
  });

  it("ignore les paiements datés après la date d'analyse", () => {
    const s = summarizeInvoice(inv, [pay(120_000, "2026-11-01")], "2026-09-15");
    expect(s.paid).toBe(0);
  });

  it("refuse un paiement supérieur au solde (pas de trop-perçu)", () => {
    expect(validatePayment(inv, [pay(100_000)], 30_000).ok).toBe(false);
    expect(validatePayment(inv, [pay(100_000)], 20_000).ok).toBe(true);
    expect(validatePayment(invoice({ baseStatus: "cancelled" }), [], 100).ok).toBe(false);
    expect(validatePayment(inv, [], 0).ok).toBe(false);
  });
});
