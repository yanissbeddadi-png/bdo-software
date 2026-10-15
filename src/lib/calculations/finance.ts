import type { AppData, Cents, Expense, ExpenseCategory, ISODate, ProductType } from "@/lib/domain/types";
import { inPeriod, lastMonthKeys, monthPeriod, type Period, endOfMonthISO } from "./dates";
import { summarizeInvoices, type InvoiceSummary } from "./invoices";
import { expenseTTC, lineHT, ratio } from "./money";
import { computeARR, computeMRR } from "./recurring";

/**
 * Définitions des indicateurs financiers (voir aussi DATA_MODEL.md § Indicateurs).
 *
 * 1. CA facturé (HT)          : somme HT des factures émises (non brouillon, non annulées) dont la date d'émission est dans la période.
 * 2. Encaissements (TTC)      : somme des paiements clients datés dans la période.
 * 3. Revenus récurrents (MRR) : abonnements actifs normalisés au mois (cf. recurring.ts).
 * 4. Pipeline                 : opportunités ouvertes — jamais comptées comme CA.
 * 5. Prévisions               : cf. cashflow.ts — estimations explicites.
 * 6. Dépenses engagées (HT)   : dépenses dont la date est dans la période, payées ou non.
 * 7. Décaissements (TTC)      : dépenses payées dont la date de paiement est dans la période.
 * 8. Résultat opérationnel estimé : CA facturé HT − dépenses engagées HT de la période.
 * 9. Trésorerie disponible    : solde d'ouverture + encaissements − décaissements jusqu'à la date.
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

export function billedRevenue(summaries: InvoiceSummary[], period: Period): Cents {
  return summaries.filter((s) => isBillable(s) && inPeriod(s.invoice.issueDate, period)).reduce((sum, s) => sum + s.totalHT, 0);
}

export function collectedCash(data: Pick<AppData, "payments">, period: Period): Cents {
  return data.payments.filter((p) => inPeriod(p.date, period)).reduce((sum, p) => sum + p.amount, 0);
}

export function committedExpensesHT(expenses: Expense[], period: Period): Cents {
  return expenses.filter((e) => inPeriod(e.date, period)).reduce((sum, e) => sum + e.amountHT, 0);
}

export function disbursedCash(expenses: Expense[], period: Period): Cents {
  return expenses.filter((e) => e.paid && inPeriod(e.paidDate, period)).reduce((sum, e) => sum + expenseTTC(e), 0);
}

/** Trésorerie à une date : solde d'ouverture + encaissements − décaissements réalisés (dates ≤ `asOf`). */
export function cashBalance(data: Pick<AppData, "payments" | "expenses" | "settings">, asOf: ISODate): Cents {
  const { openingBalance, openingBalanceDate } = data.settings.company;
  const period = { start: openingBalanceDate, end: asOf };
  return openingBalance + collectedCash(data, period) - disbursedCash(data.expenses, period);
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
    disbursed: disbursedCash(data.expenses, period),
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
  const sums = summaries ?? summarizeInvoices(data.invoices, data.payments, today);
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
  for (const s of summaries) {
    if (!isBillable(s) || !inPeriod(s.invoice.issueDate, period)) continue;
    for (const item of s.invoice.items) {
      const type = (item.productId && products.get(item.productId)?.type) || "other";
      totals.set(type, (totals.get(type) ?? 0) + lineHT(item));
    }
  }
  return [...totals.entries()]
    .map(([key, value]) => ({ key, label: PRODUCT_TYPE_LABELS[key], value }))
    .filter((e) => e.value !== 0)
    .sort((a, b) => b.value - a.value);
}

export function revenueByProduct(data: AppData, summaries: InvoiceSummary[], period: Period): { id: string; label: string; value: Cents }[] {
  const products = new Map(data.products.map((p) => [p.id, p]));
  const totals = new Map<string, Cents>();
  for (const s of summaries) {
    if (!isBillable(s) || !inPeriod(s.invoice.issueDate, period)) continue;
    for (const item of s.invoice.items) {
      const key = item.productId ?? "other";
      totals.set(key, (totals.get(key) ?? 0) + lineHT(item));
    }
  }
  return [...totals.entries()].map(([id, value]) => ({ id, label: products.get(id)?.name ?? "Lignes libres", value })).sort((a, b) => b.value - a.value);
}

export function revenueByClient(data: AppData, summaries: InvoiceSummary[], period: Period): { id: string; label: string; billed: Cents; collected: Cents; balance: Cents }[] {
  const clients = new Map(data.clients.map((c) => [c.id, c]));
  const totals = new Map<string, { billed: Cents; collected: Cents; balance: Cents }>();
  for (const s of summaries) {
    if (!isBillable(s) || !inPeriod(s.invoice.issueDate, period)) continue;
    const t = totals.get(s.invoice.clientId) ?? { billed: 0, collected: 0, balance: 0 };
    t.billed += s.totalHT;
    t.collected += s.paid;
    t.balance += s.balance;
    totals.set(s.invoice.clientId, t);
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
    mrr,
    mrrPrevious: computeMRR(data.subscriptions, previous.end),
    arr: computeARR(mrr),
  };
}
