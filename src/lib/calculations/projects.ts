import type { AppData, Cents, Employee, ISODate, Project, ProjectStatus, Task } from "@/lib/domain/types";
import { ratio, roundCents } from "./money";
import { summarizeData, type InvoiceSummary } from "./invoices";

/** Heures mensuelles de référence (35 h × 52 / 12) pour convertir un coût mensuel en coût horaire. */
export const MONTHLY_HOURS = 151.67;

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  to_plan: "À planifier",
  planned: "Planifié",
  in_progress: "En cours",
  on_hold: "En attente",
  at_risk: "En risque",
  done: "Terminé",
  cancelled: "Annulé",
};

export function isTaskOpen(task: Task): boolean {
  return task.status !== "done" && task.status !== "cancelled";
}

export function isTaskLate(task: Task, today: ISODate): boolean {
  return isTaskOpen(task) && !!task.dueDate && task.dueDate < today;
}

export function isProjectActive(project: Project): boolean {
  return project.status !== "done" && project.status !== "cancelled";
}

export function isProjectLate(project: Project, today: ISODate): boolean {
  if (!isProjectActive(project)) return false;
  return project.dueDate < today || project.milestones.some((m) => !m.done && m.dueDate < today);
}

/**
 * Progression d'un projet (0–100) :
 * - projet terminé → 100 ;
 * - sinon, part des heures estimées des tâches terminées (pondération par l'effort,
 *   une tâche mineure ne peut donc pas faire passer le projet à 100 %) ;
 * - combinée à 70 / 30 avec la part des jalons atteints lorsqu'il y en a ;
 * - plafonnée à 99 % tant que le projet n'est pas marqué terminé.
 */
export function projectProgress(project: Project, tasks: Task[]): number {
  if (project.status === "done") return 100;
  const relevant = tasks.filter((t) => t.projectId === project.id && t.status !== "cancelled");
  const totalWeight = relevant.reduce((s, t) => s + Math.max(t.estimateHours, 1), 0);
  const doneWeight = relevant.filter((t) => t.status === "done").reduce((s, t) => s + Math.max(t.estimateHours, 1), 0);
  const taskShare = totalWeight > 0 ? doneWeight / totalWeight : null;
  const milestoneShare = project.milestones.length ? project.milestones.filter((m) => m.done).length / project.milestones.length : null;
  let value: number;
  if (taskShare !== null && milestoneShare !== null) value = taskShare * 0.7 + milestoneShare * 0.3;
  else value = taskShare ?? milestoneShare ?? 0;
  return Math.min(Math.round(value * 100), 99);
}

export function hourlyCost(employee: Employee | undefined, fallback: Cents): Cents {
  if (!employee) return fallback;
  return roundCents(employee.monthlyCost / MONTHLY_HOURS);
}

export function averageHourlyCost(employees: Employee[]): Cents {
  const active = employees.filter((e) => e.status !== "left");
  if (!active.length) return 0;
  return roundCents(active.reduce((s, e) => s + e.monthlyCost, 0) / active.length / MONTHLY_HOURS);
}

export interface ProjectFinancials {
  budget: Cents;
  salePrice: Cents;
  estimatedCost: Cents;
  /** Coûts saisis : dépenses rattachées au projet (HT). */
  expenseCost: Cents;
  /** Coût du temps saisi sur les tâches (heures réelles × coût horaire du responsable). */
  laborCost: Cents;
  /** Coût réel = coûts saisis + coût du temps saisi. Jamais déduit du budget. */
  actualCost: Cents;
  /** CA réellement facturé (HT) sur ce projet. */
  invoiced: Cents;
  collected: Cents;
  /** Marge estimée = prix de vente − coût estimé. */
  estimatedMargin: Cents;
  estimatedMarginRate: number | null;
  /** Marge à date = CA facturé − coût réel. */
  currentMargin: Cents;
  /** Écart budgétaire = coût réel − budget (positif = dépassement). */
  budgetVariance: Cents;
  budgetConsumption: number | null;
  estimatedHours: number;
  actualHours: number;
}

export function projectFinancials(project: Project, data: AppData, summaries?: InvoiceSummary[], today?: ISODate): ProjectFinancials {
  const employees = new Map(data.employees.map((e) => [e.id, e]));
  const fallback = averageHourlyCost(data.employees);
  const tasks = data.tasks.filter((t) => t.projectId === project.id);
  const laborCost = tasks.reduce((s, t) => s + roundCents(t.actualHours * hourlyCost(t.assigneeId ? employees.get(t.assigneeId) : undefined, fallback)), 0);
  const expenseCost = data.expenses.filter((e) => e.projectId === project.id).reduce((s, e) => s + e.amountHT, 0);
  const sums = (summaries ?? summarizeData(data, today ?? "9999-12-31")).filter((s) => s.invoice.projectId === project.id && s.invoice.baseStatus === "issued");
  const invoiced = sums.reduce((s, x) => s + x.totalHT, 0);
  const collected = sums.reduce((s, x) => s + x.paid, 0);
  const actualCost = expenseCost + laborCost;
  const estimatedMargin = project.salePrice - project.estimatedCost;
  return {
    budget: project.budget,
    salePrice: project.salePrice,
    estimatedCost: project.estimatedCost,
    expenseCost,
    laborCost,
    actualCost,
    invoiced,
    collected,
    estimatedMargin,
    estimatedMarginRate: ratio(estimatedMargin, project.salePrice),
    currentMargin: invoiced - actualCost,
    budgetVariance: actualCost - project.budget,
    budgetConsumption: ratio(actualCost, project.budget),
    estimatedHours: tasks.reduce((s, t) => s + t.estimateHours, 0),
    actualHours: tasks.reduce((s, t) => s + t.actualHours, 0),
  };
}

/** Marge estimée moyenne (%) des projets non annulés. */
export function averageEstimatedMargin(projects: Project[]): number | null {
  const list = projects.filter((p) => p.status !== "cancelled" && p.salePrice > 0);
  if (!list.length) return null;
  return list.reduce((s, p) => s + ((p.salePrice - p.estimatedCost) / p.salePrice) * 100, 0) / list.length;
}

/** Taux de livraison dans les délais : projets terminés au plus tard à l'échéance / projets terminés. */
export function onTimeDeliveryRate(projects: Project[]): number | null {
  const done = projects.filter((p) => p.status === "done" && p.completedAt);
  if (!done.length) return null;
  return (done.filter((p) => p.completedAt!.slice(0, 10) <= p.dueDate).length / done.length) * 100;
}
