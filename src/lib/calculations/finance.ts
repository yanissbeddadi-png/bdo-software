import type { AppData, Cents, Expense, ExpenseCategory, ISODate, ProductType } from "@/lib/domain/types";
import { inPeriod, lastMonthKeys, monthPeriod, type Period, endOfMonthISO } from "./dates";
import { summarizeData, type InvoiceSummary } from "./invoices";
import { documentTotals, expenseTTC, lineHT, ratio } from "./money";
import { computeARR, computeMRR } from "./recurring";
import { vatOutstanding, vatPaid } from "./vat";

/**
 * Définitions des indicateurs financiers (voir aussi DATA_MODEL.md § Indicateurs).
 *
 * 1. CA facturé (HT)          : somme HT des factures émises (non brouillon, non annulées) dont la date d'émission est dans la période,
 *                               moins les avoirs (HT) émis dans la période.
 * 2. Encaissements (TTC)      : paiements clients − remboursements datés dans la période.
 * 3. Revenus récurrents (MRR) : abonnements actifs normalisés au mois (cf. recurring.ts).
 * 4. Pipeline                 : opportunités ouvertes — jamais comptées comme CA.
 * 5. Prévisions               : cf. cashflow.ts — estimations explicites.
 * 6. Dépenses engagées (HT)   : dépenses dont la date est dans la période, payées ou non.
 * 7. Décaissements (TTC)      : dépenses payées (date de paiement) + TVA reversée dans la période.
 * 8. Résultat opérationnel estimé : CA facturé HT − dépenses engagées HT de la période.
 * 9. Trésorerie disponible    : solde d'ouverture + encaissements nets − décaissements (dépenses + TVA) jusqu'à la date.
 */

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  salaries: "Salaires",
  software: "Logiciels",
  hosting: "Hébergement",
  marketing: "Marketing",
  contractors: "Prestataires",
  hardware: "Matériel",
  office: "Locaux",
  travel: "Déplacements",
  bank_fees: "Frais bancaires",
  misc: "Divers",
};

export const PRODUCT_TYPE_LABELS: Record<ProductType | "other", string> = {
  saas: "Abonnement SaaS",
  license: "Licence",
  custom_dev: "Développement sur mesure",
  maintenance: "Maintenance",
  consulting: "Conseil",
  integration: "Intégration",
  support: "Support",
  other: "Autre",
};

/** Factures comptant dans le CA facturé : émises (y compris payées / en retard), hors brouillons et annulations. */
export function isBillable(summary: InvoiceSummary): boolean {
  return summary.invoice.baseStatus === "issued";
}

export interface RevenueLine {
  clientId: string;
  productId: string | null;
  projectId: string | null;
  invoiceId: string;
  date: string;
  /** HT signé : positif pour une ligne de facture, négatif pour une ligne d'avoir. */
  ht: Cents;
}

/** Lignes de chiffre d'affaires de la période : lignes de factures émises et lignes d'avoirs (en négatif). */
export function revenueLines(summaries: InvoiceSummary[], period: Period): RevenueLine[] {
  const out: RevenueLine[] = [];
  for (const s of summaries) {
    if (!isBillable(s)) continue;
    const base = { clientId: s.invoice.clientId, projectId: s.invoice.projectId, invoiceId: s.invoice.id };
    if (inPeriod(s.invoice.issueDate, period)) for (const item of s.invoice.items) out.push({ ...base, productId: item.productId, date: s.invoice.issueDate, ht: lineHT(item) });
    for (const cn of s.creditNotes) {
      if (!inPeriod(cn.issueDate, period)) continue;
      for (const item of cn.items) out.push({ ...base, productId: item.productId, date: cn.issueDate, ht: -lineHT(item) });
    }
  }
  return out;
}

/** CA facturé HT de la période, net des avoirs émis dans la période. */
export function billedRevenue(summaries: InvoiceSummary[], period: Period): Cents {
  let total = 0;
  for (const s of summaries) {
    if (!isBillable(s)) continue;
    if (inPeriod(s.invoice.issueDate, period)) total += s.totalHT;
    for (const cn of s.creditNotes) if (inPeriod(cn.issueDate, period)) total -= documentTotals(cn.items).totalHT;
  }
  return total;
}

/** Encaissements nets : paiements clients − remboursements de la période. */
export function collectedCash(data: Pick<AppData, "payments" | "refunds">, period: Period): Cents {
  const payments = data.payments.filter((p) => inPeriod(p.date, period)).reduce((sum, p) => sum + p.amount, 0);
  const refunds = data.refunds.filter((r) => inPeriod(r.date, period)).reduce((sum, r) => sum + r.amount, 0);
  return payments - refunds;
}

export function committedExpensesHT(expenses: Expense[], period: Period): Cents {
  return expenses.filter((e) => inPeriod(e.date, period)).reduce((sum, e) => sum + e.amountHT, 0);
}

export function disbursedCash(expenses: Expense[], period: Period): Cents {
  return expenses.filter((e) => e.paid && inPeriod(e.paidDate, period)).reduce((sum, e) => sum + expenseTTC(e), 0);
}

/** Décaissements réalisés : dépenses payées (TTC) + TVA reversée. */
export function cashOutflows(data: Pick<AppData, "expenses" | "vatReturns">, period: Period): Cents {
  return disbursedCash(data.expenses, period) + vatPaid(data.vatReturns, period);
}

/** Trésorerie à une date : solde d'ouverture + encaissements nets − décaissements réalisés (dates ≤ `asOf`). */
export function cashBalance(data: Pick<AppData, "payments" | "refunds" | "expenses" | "vatReturns" | "settings">, asOf: ISODate): Cents {
  const { openingBalance, openingBalanceDate } = data.settings.company;
  const period = { start: openingBalanceDate, end: asOf };
  return openingBalance + collectedCash(data, period) - cashOutflows(data, period);
}

/** Créances clients : soldes restants des factures émises. */
export function receivables(summaries: InvoiceSummary[]): Cents {
  return summaries.reduce((sum, s) => sum + s.balance, 0);
}

export function overdueReceivables(summaries: InvoiceSummary[]): Cents {
  return summaries.filter((s) => s.status === "overdue").reduce((sum, s) => sum + s.balance, 0);
}

/** Dettes fournisseurs : dépenses non payées (TTC). */
export function payables(expenses: Expense[]): Cents {
  return expenses.filter((e) => !e.paid).reduce((sum, e) => sum + expenseTTC(e), 0);
}

export interface PeriodFinancials {
  billed: Cents;
  collected: Cents;
  disbursed: Cents;
  expenses: Cents;
  operatingResult: Cents;
  /** Marge opérationnelle en % du CA facturé, `null` si CA nul. */
  operatingMargin: number | null;
}

export function periodFinancials(data: AppData, summaries: InvoiceSummary[], period: Period): PeriodFinancials {
  const billed = billedRevenue(summaries, period);
  const expenses = committedExpensesHT(data.expenses, period);
  const operatingResult = billed - expenses;
  return {
    billed,
    collected: collectedCash(data, period),
    disbursed: cashOutflows(data, period),
    expenses,
    operatingResult,
    operatingMargin: ratio(operatingResult, billed),
  };
}

export interface MonthlyPoint {
  month: string;
  billed: Cents;
  collected: Cents;
  disbursed: Cents;
  expenses: Cents;
  result: Cents;
  cash: Cents;
  mrr: Cents;
  clients: number;
}

/** Série mensuelle construite exclusivement à partir des données des modules. */
export function monthlySeries(data: AppData, today: ISODate, months: number, summaries?: InvoiceSummary[]): MonthlyPoint[] {
  const sums = summaries ?? summarizeData(data, today);
  return lastMonthKeys(today, months).map((month) => {
    const period = monthPeriod(month);
    const end = endOfMonthISO(period.start);
    const asOf = end > today ? today : end;
    const pf = periodFinancials(data, sums, period);
    return {
      month,
      billed: pf.billed,
      collected: pf.collected,
      disbursed: pf.disbursed,
      expenses: pf.expenses,
      result: pf.operatingResult,
      cash: cashBalance(data, asOf),
      mrr: computeMRR(data.subscriptions, asOf),
      clients: data.clients.filter((c) => c.createdAt.slice(0, 10) <= asOf && c.status !== "churned").length,
    };
  });
}

/** Répartition du CA facturé HT par type de produit (lignes rattachées au catalogue). */
export function revenueByProductType(data: AppData, summaries: InvoiceSummary[], period: Period): { key: ProductType | "other"; label: string; value: Cents }[] {
  const products = new Map(data.products.map((p) => [p.id, p]));
  const totals = new Map<ProductType | "other", Cents>();
  for (const l of revenueLines(summaries, period)) {
    const type = (l.productId && products.get(l.productId)?.type) || "other";
    totals.set(type, (totals.get(type) ?? 0) + l.ht);
  }
  return [...totals.entries()]
    .map(([key, value]) => ({ key, label: PRODUCT_TYPE_LABELS[key], value }))
    .filter((e) => e.value !== 0)
    .sort((a, b) => b.value - a.value);
}

export function revenueByProduct(data: AppData, summaries: InvoiceSummary[], period: Period): { id: string; label: string; value: Cents }[] {
  const products = new Map(data.products.map((p) => [p.id, p]));
  const totals = new Map<string, Cents>();
  for (const l of revenueLines(summaries, period)) {
    const key = l.productId ?? "other";
    totals.set(key, (totals.get(key) ?? 0) + l.ht);
  }
  return [...totals.entries()].map(([id, value]) => ({ id, label: products.get(id)?.name ?? "Lignes libres", value })).sort((a, b) => b.value - a.value);
}

export function revenueByClient(data: AppData, summaries: InvoiceSummary[], period: Period): { id: string; label: string; billed: Cents; collected: Cents; balance: Cents }[] {
  const clients = new Map(data.clients.map((c) => [c.id, c]));
  const totals = new Map<string, { billed: Cents; collected: Cents; balance: Cents }>();
  const get = (id: string) => {
    const t = totals.get(id) ?? { billed: 0, collected: 0, balance: 0 };
    totals.set(id, t);
    return t;
  };
  for (const l of revenueLines(summaries, period)) get(l.clientId).billed += l.ht;
  for (const s of summaries) {
    if (!isBillable(s) || !inPeriod(s.invoice.issueDate, period)) continue;
    const t = get(s.invoice.clientId);
    t.collected += s.paid;
    t.balance += s.balance;
  }
  return [...totals.entries()].map(([id, t]) => ({ id, label: clients.get(id)?.name ?? "Client supprimé", ...t })).sort((a, b) => b.billed - a.billed);
}

export function expensesByCategory(expenses: Expense[], period: Period): { key: ExpenseCategory; label: string; value: Cents }[] {
  const totals = new Map<ExpenseCategory, Cents>();
  for (const e of expenses) {
    if (!inPeriod(e.date, period)) continue;
    totals.set(e.category, (totals.get(e.category) ?? 0) + e.amountHT);
  }
  return [...totals.entries()].map(([key, value]) => ({ key, label: EXPENSE_CATEGORY_LABELS[key], value })).sort((a, b) => b.value - a.value);
}

/** Échéancier des créances par ancienneté de retard. */
export function receivablesAging(summaries: InvoiceSummary[]): { bucket: string; value: Cents; count: number }[] {
  const buckets = [
    { bucket: "Non échues", test: (s: InvoiceSummary) => s.status !== "overdue" },
    { bucket: "1–30 j", test: (s: InvoiceSummary) => s.status === "overdue" && s.daysOverdue <= 30 },
    { bucket: "31–60 j", test: (s: InvoiceSummary) => s.status === "overdue" && s.daysOverdue > 30 && s.daysOverdue <= 60 },
    { bucket: "61–90 j", test: (s: InvoiceSummary) => s.status === "overdue" && s.daysOverdue > 60 && s.daysOverdue <= 90 },
    { bucket: "> 90 j", test: (s: InvoiceSummary) => s.status === "overdue" && s.daysOverdue > 90 },
  ];
  const open = summaries.filter((s) => s.balance > 0);
  return buckets.map((b) => {
    const list = open.filter(b.test);
    return { bucket: b.bucket, value: list.reduce((sum, s) => sum + s.balance, 0), count: list.length };
  });
}

export interface FinancialSnapshot {
  period: Period;
  current: PeriodFinancials;
  previous: PeriodFinancials;
  cash: Cents;
  cashPrevious: Cents;
  receivables: Cents;
  overdueReceivables: Cents;
  overdueCount: number;
  payables: Cents;
  /** TVA déclarée restant à payer. */
  vatOutstanding: Cents;
  mrr: Cents;
  mrrPrevious: Cents;
  arr: Cents;
}

export function financialSnapshot(data: AppData, summaries: InvoiceSummary[], period: Period, previous: Period, today: ISODate): FinancialSnapshot {
  const asOf = period.end > today ? today : period.end;
  const mrr = computeMRR(data.subscriptions, asOf);
  return {
    period,
    current: periodFinancials(data, summaries, period),
    previous: periodFinancials(data, summaries, previous),
    cash: cashBalance(data, asOf),
    cashPrevious: cashBalance(data, previous.end),
    receivables: receivables(summaries),
    overdueReceivables: overdueReceivables(summaries),
    overdueCount: summaries.filter((s) => s.status === "overdue").length,
    payables: payables(data.expenses),
    vatOutstanding: vatOutstanding(data.vatReturns),
    mrr,
    mrrPrevious: computeMRR(data.subscriptions, previous.end),
    arr: computeARR(mrr),
  };
}
