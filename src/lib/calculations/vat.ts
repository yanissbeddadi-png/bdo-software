import type { AppData, Cents, ISODate, Invoice, VatReturn } from "@/lib/domain/types";
import { addMonths, inPeriod, monthKey, monthPeriod, monthsBetween, type Period } from "./dates";
import { documentTotals, expenseTTC, roundCents } from "./money";

/**
 * TVA — règles de la simulation (documentées dans DATA_MODEL.md § TVA) :
 *
 * - Régime : TVA sur les **encaissements** (prestations de services), déclaration mensuelle.
 * - TVA collectée d'un mois = part de TVA contenue dans les paiements clients du mois
 *   (montant × TVA facture ÷ TTC facture), moins la part de TVA des remboursements du mois.
 * - TVA déductible d'un mois = TVA des dépenses **payées** dans le mois.
 * - Net = collectée − déductible − crédit reporté. Un net négatif devient un crédit de
 *   TVA reporté sur la période suivante (aucun remboursement demandé dans la simulation).
 * - Échéance : jour `vatDueDay` du mois suivant. Le paiement est un décaissement réel
 *   qui réduit la trésorerie.
 *
 * Il s'agit d'un outil de gestion : il ne produit pas de déclaration fiscale officielle.
 */

type VatData = Pick<AppData, "invoices" | "payments" | "refunds" | "expenses" | "vatReturns" | "settings">;

export type VatPeriodState = "to_declare" | "late" | "declared" | "paid" | "credit";

export interface VatPeriodRow {
  period: string;
  collected: Cents;
  deductible: Cents;
  creditCarriedIn: Cents;
  net: Cents;
  dueDate: ISODate;
  state: VatPeriodState;
  vatReturn: VatReturn | null;
}

/** Part de TVA d'une facture (TVA ÷ TTC), 0 si TTC nul. */
export function vatShare(invoice: Invoice): number {
  const t = documentTotals(invoice.items);
  return t.totalTTC > 0 ? t.totalVAT / t.totalTTC : 0;
}

export function vatDueDate(period: string, dueDay: number): ISODate {
  const next = addMonths(`${period}-01`, 1);
  return `${next.slice(0, 7)}-${String(Math.min(Math.max(dueDay, 1), 28)).padStart(2, "0")}`;
}

/** TVA collectée et déductible sur une période calendaire (montants calculés, non déclarés). */
export function vatAmounts(data: VatData, period: Period): { collected: Cents; deductible: Cents } {
  const shares = new Map<string, number>();
  const share = (invoiceId: string) => {
    let v = shares.get(invoiceId);
    if (v === undefined) {
      const inv = data.invoices.find((i) => i.id === invoiceId);
      v = inv ? vatShare(inv) : 0;
      shares.set(invoiceId, v);
    }
    return v;
  };
  const fromPayments = data.payments.filter((p) => inPeriod(p.date, period)).reduce((s, p) => s + roundCents(p.amount * share(p.invoiceId)), 0);
  const fromRefunds = data.refunds.filter((r) => inPeriod(r.date, period)).reduce((s, r) => s + roundCents(r.amount * share(r.invoiceId)), 0);
  const deductible = data.expenses.filter((e) => e.paid && inPeriod(e.paidDate, period)).reduce((s, e) => s + (expenseTTC(e) - e.amountHT), 0);
  return { collected: fromPayments - fromRefunds, deductible };
}

/**
 * Périodes de TVA complètes (du début du suivi au mois précédent `today`), avec report
 * séquentiel du crédit. Une période déclarée utilise l'instantané figé de la déclaration.
 */
export function vatPeriods(data: VatData, today: ISODate): VatPeriodRow[] {
  const startKey = monthKey(data.settings.company.vatTrackingStart);
  const lastKey = monthKey(addMonths(`${monthKey(today)}-01`, -1));
  if (startKey > lastKey) return [];
  const returns = new Map(data.vatReturns.map((r) => [r.period, r]));
  let carry = 0;
  return monthsBetween(`${startKey}-01`, `${lastKey}-01`).map((period) => {
    const ret = returns.get(period) ?? null;
    const dueDate = vatDueDate(period, data.settings.company.vatDueDay);
    let row: VatPeriodRow;
    if (ret) {
      row = { period, collected: ret.collected, deductible: ret.deductible, creditCarriedIn: ret.creditCarriedIn, net: ret.net, dueDate: ret.dueDate, state: ret.status, vatReturn: ret };
    } else {
      const { collected, deductible } = vatAmounts(data, monthPeriod(period));
      const net = collected - deductible - carry;
      row = { period, collected, deductible, creditCarriedIn: carry, net, dueDate, state: dueDate < today ? "late" : "to_declare", vatReturn: null };
    }
    carry = row.net < 0 ? -row.net : 0;
    return row;
  });
}

/** Estimation de la période en cours (non déclarable avant la fin du mois). */
export function currentVatEstimate(data: VatData, today: ISODate): VatPeriodRow {
  const rows = vatPeriods(data, today);
  const last = rows.at(-1);
  const carry = last && last.net < 0 ? -last.net : 0;
  const period = monthKey(today);
  const { collected, deductible } = vatAmounts(data, { start: `${period}-01`, end: today });
  return {
    period,
    collected,
    deductible,
    creditCarriedIn: carry,
    net: collected - deductible - carry,
    dueDate: vatDueDate(period, data.settings.company.vatDueDay),
    state: "to_declare",
    vatReturn: null,
  };
}

/** Première période complète non encore déclarée (les déclarations sont séquentielles). */
export function nextPeriodToDeclare(rows: VatPeriodRow[]): VatPeriodRow | null {
  return rows.find((r) => !r.vatReturn) ?? null;
}

/** TVA effectivement payée (décaissements) sur une période. */
export function vatPaid(returns: VatReturn[], period: Period): Cents {
  return returns.filter((r) => r.status === "paid" && inPeriod(r.paidDate, period)).reduce((s, r) => s + Math.max(r.net, 0), 0);
}

/** TVA déclarée restant à payer. */
export function vatOutstanding(returns: VatReturn[]): Cents {
  return returns.filter((r) => r.status === "declared").reduce((s, r) => s + Math.max(r.net, 0), 0);
}

export const VAT_STATE_LABELS: Record<VatPeriodState, string> = {
  to_declare: "À déclarer",
  late: "Déclaration en retard",
  declared: "Déclarée — à payer",
  paid: "Payée",
  credit: "Crédit reporté",
};
