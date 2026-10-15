import type { Cents, ISODate, Invoice, InvoiceStatus, Payment } from "@/lib/domain/types";
import { documentTotals, type DocumentTotals } from "./money";

export interface InvoiceSummary extends DocumentTotals {
  invoice: Invoice;
  paid: Cents;
  balance: Cents;
  status: InvoiceStatus;
  daysOverdue: number;
  lastPaymentDate: ISODate | null;
}

/** Index des paiements par facture (à construire une fois par rendu). */
export function paymentsByInvoice(payments: Payment[]): Map<string, Payment[]> {
  const map = new Map<string, Payment[]>();
  for (const p of payments) {
    const list = map.get(p.invoiceId);
    if (list) list.push(p);
    else map.set(p.invoiceId, [p]);
  }
  return map;
}

/** Montant encaissé sur une facture, en ne retenant que les paiements datés au plus tard `asOf`. */
export function paidAmount(payments: Payment[], asOf?: ISODate): Cents {
  return payments.filter((p) => !asOf || p.date <= asOf).reduce((s, p) => s + p.amount, 0);
}

/**
 * Statut calculé d'une facture :
 * - `cancelled` / `draft` : statut stocké, prioritaire ;
 * - `paid` : montant encaissé ≥ TTC (et TTC > 0) ;
 * - `overdue` : solde > 0 et date d'échéance strictement dépassée ;
 * - `partially_paid` : 0 < encaissé < TTC, non échue ;
 * - `issued` : émise, aucun paiement, non échue.
 */
export function computeInvoiceStatus(params: { baseStatus: Invoice["baseStatus"]; totalTTC: Cents; paid: Cents; dueDate: ISODate; today: ISODate }): InvoiceStatus {
  const { baseStatus, totalTTC, paid, dueDate, today } = params;
  if (baseStatus === "cancelled") return "cancelled";
  if (baseStatus === "draft") return "draft";
  if (totalTTC > 0 && paid >= totalTTC) return "paid";
  if (dueDate < today) return "overdue";
  if (paid > 0) return "partially_paid";
  return "issued";
}

export function summarizeInvoice(invoice: Invoice, payments: Payment[], today: ISODate): InvoiceSummary {
  const totals = documentTotals(invoice.items);
  const relevant = payments.filter((p) => p.date <= today);
  const paid = paidAmount(relevant);
  const status = computeInvoiceStatus({ baseStatus: invoice.baseStatus, totalTTC: totals.totalTTC, paid, dueDate: invoice.dueDate, today });
  const balance = invoice.baseStatus === "issued" ? Math.max(totals.totalTTC - paid, 0) : 0;
  const daysOverdue = status === "overdue" ? Math.round((Date.parse(today) - Date.parse(invoice.dueDate)) / 86_400_000) : 0;
  const lastPaymentDate = relevant.length
    ? relevant
        .map((p) => p.date)
        .sort()
        .at(-1)!
    : null;
  return { ...totals, invoice, paid, balance, status, daysOverdue, lastPaymentDate };
}

export function summarizeInvoices(invoices: Invoice[], payments: Payment[], today: ISODate): InvoiceSummary[] {
  const index = paymentsByInvoice(payments);
  return invoices.map((inv) => summarizeInvoice(inv, index.get(inv.id) ?? [], today));
}

/** Solde restant d'une facture ; une facture brouillon ou annulée n'a pas de solde exigible. */
export function remainingBalance(invoice: Invoice, payments: Payment[]): Cents {
  if (invoice.baseStatus !== "issued") return 0;
  return Math.max(documentTotals(invoice.items).totalTTC - paidAmount(payments), 0);
}

export type PaymentValidation = { ok: true } | { ok: false; reason: string };

/** Vérifie qu'un paiement peut être enregistré (pas de trop-perçu). */
export function validatePayment(invoice: Invoice, existing: Payment[], amount: Cents): PaymentValidation {
  if (invoice.baseStatus === "draft") return { ok: false, reason: "Une facture brouillon doit être émise avant d'enregistrer un paiement." };
  if (invoice.baseStatus === "cancelled") return { ok: false, reason: "Impossible d'enregistrer un paiement sur une facture annulée." };
  if (!Number.isInteger(amount) || amount <= 0) return { ok: false, reason: "Le montant doit être strictement positif." };
  const balance = remainingBalance(invoice, existing);
  if (amount > balance) return { ok: false, reason: "Le paiement dépasse le solde restant de la facture (trop-perçu non géré)." };
  return { ok: true };
}

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "Brouillon",
  issued: "Émise",
  partially_paid: "Partiellement payée",
  paid: "Payée",
  overdue: "En retard",
  cancelled: "Annulée",
};
