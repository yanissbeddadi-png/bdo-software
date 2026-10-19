import type { AppData, EntityRef, ISODate, NotificationCategory } from "@/lib/domain/types";
import { addDays, daysBetween, isoWeekKey, monthKey } from "./dates";
import { cashBalance } from "./finance";
import { evaluateGoal } from "./goals";
import type { InvoiceSummary } from "./invoices";
import { isStale } from "./pipeline";
import { isProjectLate, isTaskLate, isTaskOpen, projectFinancials } from "./projects";
import { buildForecast } from "./cashflow";
import { formatEUR, formatMonth } from "@/lib/formatters";
import { nextPeriodToDeclare, vatPeriods } from "./vat";

export type AlertSeverity = "info" | "warning" | "danger";

export type AlertKind =
  | "invoice_overdue"
  | "cash_low"
  | "cash_forecast"
  | "project_late"
  | "project_budget"
  | "opportunity_stale"
  | "contract_ending"
  | "task_critical"
  | "goal_risk"
  | "expense_overdue"
  | "workload"
  | "dependency"
  | "vat_declaration"
  | "vat_payment"
  | "refund_due"
  /* Automatisations CRM (lib/crm/automations.ts) */
  | "crm_overdue"
  | "crm_proposal"
  | "crm_new_prospect"
  | "crm_inactive"
  | "crm_meeting_today"
  | "crm_stale";

export interface Alert {
  /** Clé de déduplication stable. */
  key: string;
  kind: AlertKind;
  category: NotificationCategory;
  severity: AlertSeverity;
  title: string;
  body: string;
  ref: EntityRef | null;
  /** Poids de tri (plus grand = plus prioritaire). */
  weight: number;
}

/** Types d'alertes considérés comme des risques opérationnels (page Opérations). */
export const RISK_KINDS: AlertKind[] = ["project_late", "project_budget", "dependency", "invoice_overdue", "workload", "contract_ending"];

export const ALERT_KIND_LABELS: Record<AlertKind, string> = {
  invoice_overdue: "Facture échue",
  cash_low: "Trésorerie faible",
  cash_forecast: "Prévision de trésorerie",
  project_late: "Projet en retard",
  project_budget: "Dépassement budgétaire",
  opportunity_stale: "Opportunité inactive",
  contract_ending: "Contrat arrivant à échéance",
  task_critical: "Tâche critique",
  goal_risk: "Objectif en risque",
  expense_overdue: "Dépense échue",
  workload: "Charge excessive",
  dependency: "Dépendance critique",
  vat_declaration: "Déclaration de TVA",
  vat_payment: "Paiement de TVA",
  refund_due: "Remboursement client",
  crm_overdue: "Relances en retard",
  crm_proposal: "Proposition sans réponse",
  crm_new_prospect: "Nouveau prospect à traiter",
  crm_inactive: "Client inactif",
  crm_meeting_today: "Rendez-vous du jour",
  crm_stale: "Opportunité sans interaction",
};

const SEVERITY_WEIGHT: Record<AlertSeverity, number> = { danger: 300, warning: 200, info: 100 };

/**
 * Détermine les alertes à partir de règles simples et configurables
 * (`settings.rules`). Il s'agit d'heuristiques explicites, pas d'un modèle prédictif.
 */
export function computeAlerts(data: AppData, today: ISODate, summaries: InvoiceSummary[]): Alert[] {
  const alerts: Alert[] = [];
  const rules = data.settings.rules;
  const clients = new Map(data.clients.map((c) => [c.id, c.name]));
  const push = (a: Omit<Alert, "weight">, extra = 0) => alerts.push({ ...a, weight: SEVERITY_WEIGHT[a.severity] + extra });

  for (const s of summaries) {
    if (s.status !== "overdue") continue;
    const big = s.balance >= rules.bigInvoiceThreshold;
    push(
      {
        key: `invoice-overdue:${s.invoice.id}`,
        kind: "invoice_overdue",
        category: "finance",
        severity: big || s.daysOverdue > 30 ? "danger" : "warning",
        title: `Facture ${s.invoice.number} échue`,
        body: `${clients.get(s.invoice.clientId) ?? "Client"} · solde ${formatEUR(s.balance)} · ${s.daysOverdue} j de retard`,
        ref: { type: "invoice", id: s.invoice.id },
      },
      Math.min(s.daysOverdue, 90),
    );
  }

  const cash = cashBalance(data, today);
  if (cash < data.settings.company.cashAlertThreshold) {
    push(
      {
        key: `cash-low:${isoWeekKey(today)}`,
        kind: "cash_low",
        category: "finance",
        severity: "danger",
        title: "Trésorerie sous le seuil d'alerte",
        body: `Solde ${formatEUR(cash)} pour un seuil de ${formatEUR(data.settings.company.cashAlertThreshold)}.`,
        ref: null,
      },
      50,
    );
  } else {
    const forecast = buildForecast(data, today, "prudent", 3, summaries);
    if (forecast.lowestMonth && forecast.lowestBalance < data.settings.company.cashAlertThreshold) {
      push({
        key: `cash-forecast:${monthKey(today)}`,
        kind: "cash_forecast",
        category: "finance",
        severity: "warning",
        title: "Prévision prudente sous le seuil",
        body: `Le scénario prudent descend à ${formatEUR(forecast.lowestBalance)} (estimation, non bancaire).`,
        ref: null,
      });
    }
  }

  // TVA : prochaine période à déclarer (à 10 jours de l'échéance ou en retard) et déclarations à payer.
  const vatRows = vatPeriods(data, today);
  const toDeclare = nextPeriodToDeclare(vatRows);
  if (toDeclare && toDeclare.dueDate <= addDays(today, 10)) {
    const late = toDeclare.dueDate < today;
    push(
      {
        key: `vat-declare:${toDeclare.period}`,
        kind: "vat_declaration",
        category: "finance",
        severity: late ? "danger" : "warning",
        title: `TVA de ${formatMonth(toDeclare.period, false)} à déclarer`,
        body: `${late ? "Échéance dépassée" : `Échéance le ${toDeclare.dueDate.split("-").reverse().join("/")}`} · net estimé ${formatEUR(toDeclare.net)}`,
        ref: { type: "vat_return", id: toDeclare.period },
      },
      late ? 80 : 20,
    );
  }
  for (const row of vatRows) {
    if (row.state !== "declared" || !row.vatReturn) continue;
    const late = row.dueDate < today;
    if (!late && row.dueDate > addDays(today, 10)) continue;
    push(
      {
        key: `vat-pay:${row.period}`,
        kind: "vat_payment",
        category: "finance",
        severity: late ? "danger" : "warning",
        title: `TVA de ${formatMonth(row.period, false)} à payer`,
        body: `${formatEUR(row.net)} · échéance ${row.dueDate.split("-").reverse().join("/")}`,
        ref: { type: "vat_return", id: row.vatReturn.id },
      },
      late ? 80 : 20,
    );
  }
  for (const s of summaries) {
    if (s.creditBalance <= 0) continue;
    push({
      key: `refund-due:${s.invoice.id}:${s.creditBalance}`,
      kind: "refund_due",
      category: "finance",
      severity: "warning",
      title: `Trop-perçu à rembourser · ${s.invoice.number}`,
      body: `${clients.get(s.invoice.clientId) ?? ""} · ${formatEUR(s.creditBalance)} après avoir`,
      ref: { type: "invoice", id: s.invoice.id },
    });
  }

  for (const e of data.expenses) {
    if (e.paid || e.dueDate >= today) continue;
    push({
      key: `expense-overdue:${e.id}`,
      kind: "expense_overdue",
      category: "finance",
      severity: "warning",
      title: `Dépense échue : ${e.label}`,
      body: `${e.supplier} · échéance ${e.dueDate.split("-").reverse().join("/")}`,
      ref: { type: "expense", id: e.id },
    });
  }

  for (const p of data.projects) {
    if (isProjectLate(p, today)) {
      const late = Math.max(daysBetween(p.dueDate, today), 0);
      push(
        {
          key: `project-late:${p.id}`,
          kind: "project_late",
          category: "projet",
          severity: late > 14 ? "danger" : "warning",
          title: `Projet ${p.code} en retard`,
          body: late > 0 ? `${p.name} · échéance dépassée de ${late} j` : `${p.name} · jalon en retard`,
          ref: { type: "project", id: p.id },
        },
        late,
      );
    }
    if (p.status !== "done" && p.status !== "cancelled") {
      const f = projectFinancials(p, data, summaries);
      if (f.budgetVariance > 0) {
        push({
          key: `project-budget:${p.id}`,
          kind: "project_budget",
          category: "projet",
          severity: "warning",
          title: `Dépassement budgétaire ${p.code}`,
          body: `Coût réel ${formatEUR(f.actualCost)} / budget ${formatEUR(f.budget)}`,
          ref: { type: "project", id: p.id },
        });
      }
    }
  }

  for (const o of data.opportunities) {
    if (!isStale(o, today, data.settings.gamification.staleOpportunityDays)) continue;
    push({
      key: `opp-stale:${o.id}:${o.lastInteractionAt.slice(0, 10)}`,
      kind: "opportunity_stale",
      category: "commercial",
      severity: "info",
      title: `Opportunité inactive : ${o.name}`,
      body: `Dernière interaction il y a ${daysBetween(o.lastInteractionAt.slice(0, 10), today)} j · ${formatEUR(o.amount)}`,
      ref: { type: "opportunity", id: o.id },
    });
  }

  for (const sub of data.subscriptions) {
    if (sub.status !== "active" || !sub.endDate) continue;
    const days = daysBetween(today, sub.endDate);
    if (days < 0 || days > rules.contractNoticeDays) continue;
    push({
      key: `sub-ending:${sub.id}:${sub.endDate}`,
      kind: "contract_ending",
      category: "commercial",
      severity: days <= 15 ? "danger" : "warning",
      title: `Contrat ${sub.offer} à renouveler`,
      body: `${clients.get(sub.clientId) ?? ""} · fin dans ${days} j`,
      ref: { type: "subscription", id: sub.id },
    });
  }

  const tasks = new Map(data.tasks.map((t) => [t.id, t]));
  for (const t of data.tasks) {
    if (!isTaskOpen(t)) continue;
    if (t.priority === "critical" && t.dueDate && t.dueDate <= addDays(today, rules.criticalTaskDays)) {
      push({
        key: `task-critical:${t.id}`,
        kind: "task_critical",
        category: "taches",
        severity: t.dueDate < today ? "danger" : "warning",
        title: `Tâche critique : ${t.title}`,
        body: t.dueDate < today ? "En retard" : `Échéance le ${t.dueDate.split("-").reverse().join("/")}`,
        ref: { type: "task", id: t.id },
      });
    }
    const blocking = t.dependsOn.map((id) => tasks.get(id)).filter((d) => d && isTaskLate(d, today));
    if (blocking.length) {
      push({
        key: `dependency:${t.id}`,
        kind: "dependency",
        category: "taches",
        severity: "warning",
        title: `Dépendance bloquante : ${t.title}`,
        body: `Bloquée par ${blocking.map((d) => `« ${d!.title} »`).join(", ")} (en retard)`,
        ref: { type: "task", id: t.id },
      });
    }
  }

  for (const goal of data.goals) {
    if (goal.archived) continue;
    const ev = evaluateGoal(goal, data, today, summaries);
    if (ev.status !== "at_risk") continue;
    push({
      key: `goal-risk:${goal.id}:${monthKey(today)}`,
      kind: "goal_risk",
      category: "objectifs",
      severity: "warning",
      title: `Objectif en risque : ${goal.title}`,
      body: `Progression ${ev.progress.toFixed(0)} % · échéance ${goal.periodEnd.split("-").reverse().join("/")}`,
      ref: { type: "goal", id: goal.id },
    });
  }

  const horizon = addDays(today, 14);
  for (const emp of data.employees) {
    if (emp.status !== "active") continue;
    const hours = data.tasks.filter((t) => t.assigneeId === emp.id && isTaskOpen(t) && t.dueDate && t.dueDate <= horizon).reduce((s, t) => s + Math.max(t.estimateHours - t.actualHours, 0), 0);
    if (hours > rules.workloadHoursThreshold) {
      push({
        key: `workload:${emp.id}:${isoWeekKey(today)}`,
        kind: "workload",
        category: "taches",
        severity: "warning",
        title: `Charge élevée : ${emp.firstName} ${emp.lastName}`,
        body: `${Math.round(hours)} h de travail restant à échéance sous 14 jours (seuil ${rules.workloadHoursThreshold} h).`,
        ref: { type: "employee", id: emp.id },
      });
    }
  }

  return alerts.sort((a, b) => b.weight - a.weight);
}
