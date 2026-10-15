import type { AppData, Goal, GoalMetric, ISODate } from "@/lib/domain/types";
import { daysBetween, inPeriod } from "./dates";
import { summarizeInvoices, type InvoiceSummary } from "./invoices";
import { billedRevenue, overdueReceivables } from "./finance";
import { computeMRR } from "./recurring";
import { averageEstimatedMargin, isTaskLate } from "./projects";

export const GOAL_METRICS: Record<GoalMetric, { label: string; unit: string; direction: "up" | "down"; auto: boolean }> = {
  manual: { label: "Saisie manuelle", unit: "", direction: "up", auto: false },
  mrr: { label: "MRR (revenu mensuel récurrent)", unit: "€", direction: "up", auto: true },
  overdue_receivables: { label: "Montant des factures échues", unit: "€", direction: "down", auto: true },
  won_opportunities: { label: "Opportunités gagnées sur la période", unit: "contrats", direction: "up", auto: true },
  projects_completed: { label: "Projets terminés sur la période", unit: "projets", direction: "up", auto: true },
  avg_project_margin: { label: "Marge estimée moyenne des projets", unit: "%", direction: "up", auto: true },
  late_tasks: { label: "Tâches en retard", unit: "tâches", direction: "down", auto: true },
  billed_revenue: { label: "CA facturé HT sur la période", unit: "€", direction: "up", auto: true },
  active_clients: { label: "Clients actifs", unit: "clients", direction: "up", auto: true },
  new_leads: { label: "Nouveaux prospects sur la période", unit: "prospects", direction: "up", auto: true },
  new_subscriptions: { label: "Nouveaux abonnements sur la période", unit: "contrats", direction: "up", auto: true },
};

/** Valeur actuelle d'un objectif, calculée depuis les données métier (montants exprimés en euros). */
export function goalCurrentValue(goal: Goal, data: AppData, today: ISODate, summaries?: InvoiceSummary[]): number {
  const period = { start: goal.periodStart, end: goal.periodEnd };
  const sums = () => summaries ?? summarizeInvoices(data.invoices, data.payments, today);
  switch (goal.metric) {
    case "manual":
      return goal.manualValue;
    case "mrr":
      return computeMRR(data.subscriptions, today) / 100;
    case "overdue_receivables":
      return overdueReceivables(sums()) / 100;
    case "won_opportunities":
      return data.opportunities.filter((o) => o.stage === "won" && inPeriod(o.closedAt, period)).length;
    case "projects_completed":
      return data.projects.filter((p) => p.status === "done" && inPeriod(p.completedAt, period)).length;
    case "avg_project_margin":
      return Math.round((averageEstimatedMargin(data.projects) ?? 0) * 10) / 10;
    case "late_tasks":
      return data.tasks.filter((t) => isTaskLate(t, today)).length;
    case "billed_revenue":
      return billedRevenue(sums(), period) / 100;
    case "active_clients":
      return data.clients.filter((c) => c.status === "active").length;
    case "new_leads":
      return data.leads.filter((l) => inPeriod(l.createdAt, period)).length;
    case "new_subscriptions":
      return data.subscriptions.filter((s) => inPeriod(s.startDate, period)).length;
  }
}

/** Progression (0–100) entre valeur initiale et cible ; fonctionne pour les objectifs croissants et décroissants. */
export function goalProgress(start: number, target: number, current: number): number {
  if (target === start) return current === target || (target > 0 ? current >= target : current <= target) ? 100 : 0;
  const value = ((current - start) / (target - start)) * 100;
  return Math.max(0, Math.min(100, Math.round(value * 10) / 10));
}

export type GoalStatus = "achieved" | "on_track" | "at_risk" | "missed" | "not_started";

export const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  achieved: "Atteint",
  on_track: "En bonne voie",
  at_risk: "En risque",
  missed: "Non atteint",
  not_started: "Pas commencé",
};

/** Statut : comparaison entre progression et part du temps écoulé (écart > 25 points = en risque). */
export function goalStatus(goal: Goal, progress: number, today: ISODate): GoalStatus {
  if (progress >= 100) return "achieved";
  if (today > goal.periodEnd) return "missed";
  if (today < goal.periodStart) return "not_started";
  const total = Math.max(daysBetween(goal.periodStart, goal.periodEnd), 1);
  const elapsed = (daysBetween(goal.periodStart, today) / total) * 100;
  return elapsed - progress > 25 ? "at_risk" : "on_track";
}

export interface GoalEvaluation {
  goal: Goal;
  current: number;
  progress: number;
  status: GoalStatus;
  auto: boolean;
}

export function evaluateGoal(goal: Goal, data: AppData, today: ISODate, summaries?: InvoiceSummary[]): GoalEvaluation {
  const current = goalCurrentValue(goal, data, today, summaries);
  const progress = goalProgress(goal.startValue, goal.targetValue, current);
  return { goal, current, progress, status: goalStatus(goal, progress, today), auto: GOAL_METRICS[goal.metric].auto };
}

export function keyResultProgress(kr: { target: number; current: number }): number {
  if (kr.target === 0) return kr.current >= 0 ? 100 : 0;
  return Math.max(0, Math.min(100, Math.round((kr.current / kr.target) * 1000) / 10));
}
