import type { AppData, Cents, ISODate } from "@/lib/domain/types";
import { daysBetween, endOfMonthISO, lastMonthKeys, monthPeriod } from "@/lib/calculations/dates";
import { cashBalance, periodFinancials } from "@/lib/calculations/finance";
import { summarizeInvoices, type InvoiceSummary } from "@/lib/calculations/invoices";
import { conversionRate, pipelineValue } from "@/lib/calculations/pipeline";
import { isTaskLate } from "@/lib/calculations/projects";
import { computeMRR } from "@/lib/calculations/recurring";
import { evaluateGoal } from "@/lib/calculations/goals";
import { RECURRING_CATEGORIES } from "@/lib/calculations/cashflow";
import { expenseTTC } from "@/lib/calculations/money";

/** Indicateurs métier utilisés par les succès et les rangs (calculés une seule fois). */
export interface GameMetrics {
  today: ISODate;
  clients: number;
  activeClients: number;
  quotes: number;
  wonOpportunities: number;
  closedOpportunities: number;
  conversionRate: number | null;
  payments: number;
  paidInvoices: number;
  activeSubscriptions: number;
  projectsDone: number;
  goalsAchieved: number;
  tasksDone: number;
  lateTasks: number;
  salesActivities: number;
  activeEmployees: number;
  departments: number;
  pipeline: Cents;
  billedTotal: Cents;
  mrr: Cents;
  cash: Cents;
  /** Charges récurrentes mensuelles moyennes (TTC, 3 derniers mois complets). */
  monthlyFixedCosts: Cents;
  /** Nombre de mois de charges fixes couverts par la trésorerie. */
  cashMonths: number | null;
  /** Marge opérationnelle cumulée des 3 derniers mois complets (%). */
  margin3m: number | null;
  avgSatisfaction: number | null;
  /** Trésorerie positive en fin de mois sur les 3 derniers mois complets. */
  positiveCash3m: boolean;
  /** Au moins un mois complet avec un résultat opérationnel positif. */
  hadProfitableMonth: boolean;
  /** Au moins un mois où le MRR de fin de mois dépasse celui du mois précédent. */
  hadMrrGrowth: boolean;
  /** Factures en retard de plus de 30 jours. */
  overdue30: number;
  /** Dépenses impayées dont l'échéance est dépassée. */
  overdueExpenses: number;
  /** Jours consécutifs sans tâche en retard (suivi persistant). */
  daysWithoutLateTasks: number;
}

export function computeGameMetrics(data: AppData, today: ISODate, summaries?: InvoiceSummary[]): GameMetrics {
  const sums = summaries ?? summarizeInvoices(data.invoices, data.payments, today);
  const completeMonths = lastMonthKeys(today, 4).slice(0, 3);
  const monthEnds = completeMonths.map((m) => endOfMonthISO(monthPeriod(m).start));

  const fixed = data.expenses
    .filter((e) => RECURRING_CATEGORIES.includes(e.category) && completeMonths.includes(e.date.slice(0, 7)))
    .reduce((s, e) => s + expenseTTC(e), 0);
  const monthlyFixedCosts = Math.round(fixed / 3);
  const cash = cashBalance(data, today);

  const threeMonths = { start: monthPeriod(completeMonths[0]).start, end: monthEnds[2] };
  const pf3 = periodFinancials(data, sums, threeMonths);

  const historyMonths = lastMonthKeys(today, 13).slice(0, 12);
  const hadProfitableMonth = historyMonths.some((m) => periodFinancials(data, sums, monthPeriod(m)).operatingResult > 0);
  let hadMrrGrowth = false;
  for (let i = 1; i < historyMonths.length; i++) {
    const prev = computeMRR(data.subscriptions, endOfMonthISO(monthPeriod(historyMonths[i - 1]).start));
    const cur = computeMRR(data.subscriptions, endOfMonthISO(monthPeriod(historyMonths[i]).start));
    if (cur > prev) hadMrrGrowth = true;
  }

  const satisfactions = data.clients.filter((c) => c.status === "active" && c.satisfaction !== null).map((c) => c.satisfaction!);
  const won = data.opportunities.filter((o) => o.stage === "won").length;
  const lost = data.opportunities.filter((o) => o.stage === "lost").length;
  const activeEmployees = data.employees.filter((e) => e.status === "active");
  const since = data.settings.gamification.noLateTaskSince;

  return {
    today,
    clients: data.clients.length,
    activeClients: data.clients.filter((c) => c.status === "active").length,
    quotes: data.quotes.length,
    wonOpportunities: won,
    closedOpportunities: won + lost,
    conversionRate: conversionRate(data.opportunities),
    payments: data.payments.length,
    paidInvoices: sums.filter((s) => s.status === "paid").length,
    activeSubscriptions: data.subscriptions.filter((s) => s.status === "active").length,
    projectsDone: data.projects.filter((p) => p.status === "done").length,
    goalsAchieved: data.goals.filter((g) => evaluateGoal(g, data, today, sums).status === "achieved").length,
    tasksDone: data.tasks.filter((t) => t.status === "done").length,
    lateTasks: data.tasks.filter((t) => isTaskLate(t, today)).length,
    salesActivities: data.salesActivities.filter((a) => a.done).length,
    activeEmployees: activeEmployees.length,
    departments: new Set(activeEmployees.map((e) => e.department)).size,
    pipeline: pipelineValue(data.opportunities),
    billedTotal: sums.filter((s) => s.invoice.baseStatus === "issued").reduce((s, x) => s + x.totalHT, 0),
    mrr: computeMRR(data.subscriptions, today),
    cash,
    monthlyFixedCosts,
    cashMonths: monthlyFixedCosts > 0 ? cash / monthlyFixedCosts : null,
    margin3m: pf3.operatingMargin,
    avgSatisfaction: satisfactions.length ? satisfactions.reduce((a, b) => a + b, 0) / satisfactions.length : null,
    positiveCash3m: monthEnds.every((d) => cashBalance(data, d) > 0),
    hadProfitableMonth,
    hadMrrGrowth,
    overdue30: sums.filter((s) => s.status === "overdue" && s.daysOverdue > 30).length,
    overdueExpenses: data.expenses.filter((e) => !e.paid && e.dueDate < today).length,
    daysWithoutLateTasks: since ? Math.max(daysBetween(since, today), 0) : 0,
  };
}

/** Met à jour le suivi « depuis quand aucune tâche n'est en retard ». */
export function trackNoLateTasks(current: ISODate | null, lateTasks: number, today: ISODate): ISODate | null {
  if (lateTasks > 0) return null;
  return current ?? today;
}

