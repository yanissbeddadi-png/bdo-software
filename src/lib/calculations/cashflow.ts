import type { AppData, Cents, ExpenseCategory, ISODate } from "@/lib/domain/types";
import { addDays, daysBetween, endOfMonthISO, lastMonthKeys, monthKey, monthPeriod, nextMonthKeys } from "./dates";
import { summarizeInvoices, type InvoiceSummary } from "./invoices";
import { cashBalance } from "./finance";
import { expenseTTC, roundCents, vatOn } from "./money";
import { billingDates } from "./recurring";
import { isOpen } from "./pipeline";

export type ScenarioKey = "prudent" | "central" | "optimistic";

export interface ScenarioAssumptions {
  label: string;
  /** Part des factures non échues effectivement encaissée. */
  currentInvoiceRate: number;
  /** Retard moyen d'encaissement après échéance (jours). */
  paymentDelayDays: number;
  /** Part des factures déjà échues finalement encaissée (dans les 30 jours). */
  overdueRecoveryRate: number;
  /** Part des abonnements facturés effectivement encaissée. */
  subscriptionRate: number;
  /** Coefficient appliqué à la valeur pondérée du pipeline. */
  pipelineFactor: number;
  /** Coefficient appliqué aux décaissements prévus. */
  outflowFactor: number;
}

/** Hypothèses explicites des scénarios (affichées dans l'interface). */
export const SCENARIOS: Record<ScenarioKey, ScenarioAssumptions> = {
  prudent: { label: "Prudent", currentInvoiceRate: 0.85, paymentDelayDays: 20, overdueRecoveryRate: 0.3, subscriptionRate: 0.95, pipelineFactor: 0, outflowFactor: 1.05 },
  central: { label: "Central", currentInvoiceRate: 0.97, paymentDelayDays: 7, overdueRecoveryRate: 0.6, subscriptionRate: 1, pipelineFactor: 0.5, outflowFactor: 1 },
  optimistic: { label: "Optimiste", currentInvoiceRate: 1, paymentDelayDays: 0, overdueRecoveryRate: 0.85, subscriptionRate: 1, pipelineFactor: 1, outflowFactor: 0.97 },
};

/** Catégories de charges considérées comme récurrentes (projetées chaque mois). */
export const RECURRING_CATEGORIES: ExpenseCategory[] = ["salaries", "software", "hosting", "office", "bank_fees"];
/** Délai de paiement des abonnements et des affaires gagnées (jours). */
export const SUBSCRIPTION_PAYMENT_TERM = 30;
export const PIPELINE_PAYMENT_DELAY = 45;

export type ForecastItemKind = "invoice" | "overdue_invoice" | "subscription" | "pipeline" | "expense" | "recurring_cost" | "variable_cost";

export interface ForecastItem {
  date: ISODate;
  label: string;
  kind: ForecastItemKind;
  /** Montant signé (positif = encaissement, négatif = décaissement), après hypothèses du scénario. */
  amount: Cents;
}

export interface ForecastMonth {
  month: string;
  inflows: Cents;
  outflows: Cents;
  net: Cents;
  closingBalance: Cents;
}

export interface Forecast {
  scenario: ScenarioKey;
  startBalance: Cents;
  months: ForecastMonth[];
  items: ForecastItem[];
  lowestBalance: Cents;
  lowestMonth: string | null;
}

function baselineByCategory(data: AppData, today: ISODate): Map<ExpenseCategory, Cents> {
  // Moyenne mensuelle (TTC) sur les 3 derniers mois complets.
  const months = lastMonthKeys(today, 4).slice(0, 3);
  const totals = new Map<ExpenseCategory, Cents>();
  for (const e of data.expenses) {
    if (!months.includes(monthKey(e.date))) continue;
    totals.set(e.category, (totals.get(e.category) ?? 0) + expenseTTC(e));
  }
  const result = new Map<ExpenseCategory, Cents>();
  for (const [k, v] of totals) result.set(k, roundCents(v / months.length));
  return result;
}

export function buildForecast(data: AppData, today: ISODate, scenario: ScenarioKey, horizonMonths = 6, summaries?: InvoiceSummary[]): Forecast {
  const a = SCENARIOS[scenario];
  const sums = summaries ?? summarizeInvoices(data.invoices, data.payments, today);
  const months = nextMonthKeys(today, horizonMonths);
  const horizonEnd = endOfMonthISO(monthPeriod(months.at(-1)!).start);
  const items: ForecastItem[] = [];
  const vat = data.settings.company.defaultVatRate;
  const clients = new Map(data.clients.map((c) => [c.id, c.name]));

  // 1. Factures ouvertes.
  for (const s of sums) {
    if (s.balance <= 0) continue;
    const name = clients.get(s.invoice.clientId) ?? "Client";
    if (s.status === "overdue") {
      items.push({ date: addDays(today, 15), label: `Recouvrement ${s.invoice.number} · ${name}`, kind: "overdue_invoice", amount: roundCents(s.balance * a.overdueRecoveryRate) });
    } else {
      const date = addDays(s.invoice.dueDate, a.paymentDelayDays);
      if (date <= horizonEnd) items.push({ date: date < today ? today : date, label: `Facture ${s.invoice.number} · ${name}`, kind: "invoice", amount: roundCents(s.balance * a.currentInvoiceRate) });
    }
  }

  // 2. Abonnements actifs : facturations futures (après aujourd'hui), encaissées à 30 jours.
  for (const sub of data.subscriptions) {
    if (sub.status !== "active") continue;
    for (const d of billingDates(sub, addDays(today, 1), horizonEnd)) {
      const cashDate = addDays(d, SUBSCRIPTION_PAYMENT_TERM);
      if (cashDate > horizonEnd) continue;
      const ttc = sub.amount + vatOn(sub.amount, vat);
      items.push({ date: cashDate, label: `Abonnement ${sub.offer} · ${clients.get(sub.clientId) ?? ""}`, kind: "subscription", amount: roundCents(ttc * a.subscriptionRate) });
    }
  }

  // 3. Pipeline pondéré (jamais dans le scénario prudent).
  if (a.pipelineFactor > 0) {
    for (const o of data.opportunities) {
      if (!isOpen(o)) continue;
      const date = addDays(o.expectedCloseDate < today ? today : o.expectedCloseDate, PIPELINE_PAYMENT_DELAY);
      if (date > horizonEnd) continue;
      const weighted = roundCents((o.amount * o.probability) / 100);
      const amount = roundCents((weighted + vatOn(weighted, vat)) * a.pipelineFactor);
      if (amount > 0) items.push({ date, label: `Pipeline · ${o.name}`, kind: "pipeline", amount });
    }
  }

  // 4. Dépenses saisies non payées.
  for (const e of data.expenses) {
    if (e.paid) continue;
    const date = e.dueDate < today ? today : e.dueDate;
    if (date > horizonEnd) continue;
    items.push({ date, label: `${e.label} · ${e.supplier}`, kind: "expense", amount: -roundCents(expenseTTC(e) * a.outflowFactor) });
  }

  // 5. Charges récurrentes non encore saisies + charges variables moyennes.
  const baseline = baselineByCategory(data, today);
  for (const m of months) {
    const p = monthPeriod(m);
    for (const cat of RECURRING_CATEGORIES) {
      const amount = baseline.get(cat) ?? 0;
      if (!amount) continue;
      const already = data.expenses.some((e) => e.category === cat && monthKey(e.date) === m);
      if (already) continue;
      const date = `${m}-28`;
      if (date < today) continue;
      items.push({ date, label: `Charge récurrente estimée · ${cat}`, kind: "recurring_cost", amount: -roundCents(amount * a.outflowFactor) });
    }
    const variable = [...baseline.entries()].filter(([k]) => !RECURRING_CATEGORIES.includes(k)).reduce((s, [, v]) => s + v, 0);
    if (variable > 0) {
      const remainingShare = p.start <= today ? Math.max(daysBetween(today, p.end), 0) / (daysBetween(p.start, p.end) + 1) : 1;
      const amount = roundCents(variable * remainingShare * a.outflowFactor);
      if (amount > 0) items.push({ date: p.start <= today ? p.end : `${m}-15`, label: "Charges variables estimées (moyenne 3 mois)", kind: "variable_cost", amount: -amount });
    }
  }

  items.sort((x, y) => x.date.localeCompare(y.date));
  const startBalance = cashBalance(data, today);
  let running = startBalance;
  let lowestBalance = startBalance;
  let lowestMonth: string | null = null;
  const monthRows: ForecastMonth[] = months.map((m) => {
    const list = items.filter((i) => monthKey(i.date) === m);
    const inflows = list.filter((i) => i.amount > 0).reduce((s, i) => s + i.amount, 0);
    const outflows = -list.filter((i) => i.amount < 0).reduce((s, i) => s + i.amount, 0);
    running += inflows - outflows;
    if (running < lowestBalance) {
      lowestBalance = running;
      lowestMonth = m;
    }
    return { month: m, inflows, outflows, net: inflows - outflows, closingBalance: running };
  });
  return { scenario, startBalance, months: monthRows, items, lowestBalance, lowestMonth };
}
