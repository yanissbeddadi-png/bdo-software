import type { AppData, Cents, CreditNote, ISODate, Invoice, InvoiceStatus, Payment, Refund } from "@/lib/domain/types";
import { documentTotals, type DocumentTotals } from "./money";

/** Avoirs et remboursements à prendre en compte dans le calcul des factures. */
export interface InvoiceAdjustments {
  creditNotes: CreditNote[];
  refunds: Refund[];
}

const NO_ADJUSTMENTS: InvoiceAdjustments = { creditNotes: [], refunds: [] };

export interface InvoiceSummary extends DocumentTotals {
  invoice: Invoice;
  /** Avoirs émis (au plus tard à la date d'analyse) sur cette facture. */
  creditNotes: CreditNote[];
  creditedHT: Cents;
  creditedTTC: Cents;
  /** Montant TTC net dû après avoirs. */
  netTTC: Cents;
  /** Encaissé net : paiements − remboursements. */
  paid: Cents;
  refunded: Cents;
  /** Reste à encaisser (jamais négatif). */
  balance: Cents;
  /** Trop-perçu à rembourser au client (après avoir). */
  creditBalance: Cents;
  status: InvoiceStatus;
  daysOverdue: number;
  lastPaymentDate: ISODate | null;
}

function groupBy<T extends { invoiceId: string }>(items: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const it of items) {
    const list = map.get(it.invoiceId);
    if (list) list.push(it);
    else map.set(it.invoiceId, [it]);
  }
  return map;
}

/** Index des paiements par facture (à construire une fois par rendu). */
export function paymentsByInvoice(payments: Payment[]): Map<string, Payment[]> {
  return groupBy(payments);
}

/** Montant encaissé sur une facture, en ne retenant que les paiements datés au plus tard `asOf`. */
export function paidAmount(payments: Payment[], asOf?: ISODate): Cents {
  return payments.filter((p) => !asOf || p.date <= asOf).reduce((s, p) => s + p.amount, 0);
}

/**
 * Statut calculé d'une facture :
 * - `cancelled` / `draft` : statut stocké, prioritaire ;
 * - `credited` : intégralement annulée par avoir(s) (net dû nul) ;
 * - `paid` : encaissé net ≥ montant net dû (et net > 0) ;
 * - `overdue` : solde > 0 et date d'échéance strictement dépassée ;
 * - `partially_paid` : 0 < encaissé < net dû, non échue ;
 * - `issued` : émise, aucun paiement, non échue.
 */
export function computeInvoiceStatus(params: { baseStatus: Invoice["baseStatus"]; totalTTC: Cents; paid: Cents; dueDate: ISODate; today: ISODate; creditedTTC?: Cents }): InvoiceStatus {
  const { baseStatus, totalTTC, paid, dueDate, today } = params;
  const credited = params.creditedTTC ?? 0;
  if (baseStatus === "cancelled") return "cancelled";
  if (baseStatus === "draft") return "draft";
  const net = totalTTC - credited;
  if (credited > 0 && net <= 0) return "credited";
  if (net > 0 && paid >= net) return "paid";
  if (dueDate < today) return "overdue";
  if (paid > 0) return "partially_paid";
  return "issued";
}

export function summarizeInvoice(invoice: Invoice, payments: Payment[], today: ISODate, creditNotes: CreditNote[] = [], refunds: Refund[] = []): InvoiceSummary {
  const totals = documentTotals(invoice.items);
  const relevant = payments.filter((p) => p.date <= today);
  const notes = creditNotes.filter((c) => c.issueDate <= today);
  const credits = notes.map((c) => documentTotals(c.items));
  const creditedHT = credits.reduce((s, c) => s + c.totalHT, 0);
  const creditedTTC = credits.reduce((s, c) => s + c.totalTTC, 0);
  const refunded = refunds.filter((r) => r.date <= today).reduce((s, r) => s + r.amount, 0);
  const paid = paidAmount(relevant) - refunded;
  const netTTC = Math.max(totals.totalTTC - creditedTTC, 0);
  const status = computeInvoiceStatus({ baseStatus: invoice.baseStatus, totalTTC: totals.totalTTC, paid, dueDate: invoice.dueDate, today, creditedTTC });
  const issued = invoice.baseStatus === "issued";
  const balance = issued ? Math.max(netTTC - paid, 0) : 0;
  const creditBalance = issued ? Math.max(paid - netTTC, 0) : 0;
  const daysOverdue = status === "overdue" ? Math.round((Date.parse(today) - Date.parse(invoice.dueDate)) / 86_400_000) : 0;
  const lastPaymentDate = relevant.length
    ? relevant
        .map((p) => p.date)
        .sort()
        .at(-1)!
    : null;
  return { ...totals, invoice, creditNotes: notes, creditedHT, creditedTTC, netTTC, paid, refunded, balance, creditBalance, status, daysOverdue, lastPaymentDate };
}

export function summarizeInvoices(invoices: Invoice[], payments: Payment[], today: ISODate, adjustments: InvoiceAdjustments = NO_ADJUSTMENTS): InvoiceSummary[] {
  const index = groupBy(payments);
  const notes = groupBy(adjustments.creditNotes);
  const refunds = groupBy(adjustments.refunds);
  return invoices.map((inv) => summarizeInvoice(inv, index.get(inv.id) ?? [], today, notes.get(inv.id) ?? [], refunds.get(inv.id) ?? []));
}

/** Résumé de toutes les factures d'un jeu de données (avoirs et remboursements inclus). */
export function summarizeData(data: Pick<AppData, "invoices" | "payments" | "creditNotes" | "refunds">, today: ISODate): InvoiceSummary[] {
  return summarizeInvoices(data.invoices, data.payments, today, { creditNotes: data.creditNotes, refunds: data.refunds });
}

/** Solde restant d'une facture ; une facture brouillon ou annulée n'a pas de solde exigible. */
export function remainingBalance(invoice: Invoice, payments: Payment[], adjustments: InvoiceAdjustments = NO_ADJUSTMENTS): Cents {
  if (invoice.baseStatus !== "issued") return 0;
  return summarizeInvoice(
    invoice,
    payments,
    "9999-12-31",
    adjustments.creditNotes.filter((c) => c.invoiceId === invoice.id),
    adjustments.refunds.filter((r) => r.invoiceId === invoice.id),
  ).balance;
}

export type PaymentValidation = { ok: true } | { ok: false; reason: string };

/** Vérifie qu'un paiement peut être enregistré (pas de trop-perçu). */
export function validatePayment(invoice: Invoice, existing: Payment[], amount: Cents, adjustments: InvoiceAdjustments = NO_ADJUSTMENTS): PaymentValidation {
  if (invoice.baseStatus === "draft") return { ok: false, reason: "Une facture brouillon doit être émise avant d'enregistrer un paiement." };
  if (invoice.baseStatus === "cancelled") return { ok: false, reason: "Impossible d'enregistrer un paiement sur une facture annulée." };
  if (!Number.isInteger(amount) || amount <= 0) return { ok: false, reason: "Le montant doit être strictement positif." };
  const balance = remainingBalance(invoice, existing, adjustments);
  if (amount > balance) return { ok: false, reason: "Le paiement dépasse le solde restant de la facture (trop-perçu non géré)." };
  return { ok: true };
}

/** Montant TTC encore « créditable » sur une facture (total − avoirs déjà émis). */
export function creditableAmount(invoice: Invoice, creditNotes: CreditNote[]): Cents {
  const total = documentTotals(invoice.items).totalTTC;
  const credited = creditNotes.filter((c) => c.invoiceId === invoice.id).reduce((s, c) => s + documentTotals(c.items).totalTTC, 0);
  return Math.max(total - credited, 0);
}

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "Brouillon",
  issued: "Émise",
  partially_paid: "Partiellement payée",
  paid: "Payée",
  overdue: "En retard",
  credited: "Annulée par avoir",
  cancelled: "Annulée",
};
