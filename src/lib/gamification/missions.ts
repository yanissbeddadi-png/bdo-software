import type { AppData, ISODate, ISODateTime, Mission, MissionCategory, MissionCondition, MissionDifficulty, MissionStatus, MissionType, Priority } from "@/lib/domain/types";
import { addDays, endOfMonthISO, isoWeekKey, monthKey, weekPeriod } from "@/lib/calculations/dates";
import { summarizeInvoices, type InvoiceSummary } from "@/lib/calculations/invoices";
import { isStale } from "@/lib/calculations/pipeline";
import { isTaskLate, isTaskOpen, projectFinancials } from "@/lib/calculations/projects";
import { computeMRR } from "@/lib/calculations/recurring";
import { formatEUR } from "@/lib/formatters";

export const MISSION_CATEGORY_LABELS: Record<MissionCategory, string> = {
  finance: "Finance",
  commercial: "Commercial",
  operations: "Opérations",
  projects: "Projets",
  team: "Équipe",
  strategy: "Stratégie",
  personal: "Développement personnel",
};

export const MISSION_TYPE_LABELS: Record<MissionType, string> = {
  daily: "Quotidienne",
  weekly: "Hebdomadaire",
  monthly: "Mensuelle",
  strategic: "Stratégique",
  custom: "Personnalisée",
};

export const MISSION_DIFFICULTY_LABELS: Record<MissionDifficulty, string> = {
  easy: "Facile",
  medium: "Moyenne",
  hard: "Difficile",
  epic: "Épique",
};

export const MISSION_STATUS_LABELS: Record<MissionStatus, string> = {
  todo: "À faire",
  in_progress: "En cours",
  done: "Terminée",
  overdue: "En retard",
  cancelled: "Annulée",
};

/** Statut affiché : une mission non terminée dont l'échéance est dépassée est « en retard ». */
export function missionStatus(m: Mission, today: ISODate): MissionStatus {
  if (m.status === "done" || m.status === "cancelled") return m.status;
  return m.dueDate < today ? "overdue" : m.status;
}

export interface MissionEvaluation {
  satisfied: boolean;
  /** Progression mesurable de la condition. */
  current: number;
  target: number;
  /** La condition n'a plus d'objet (entité supprimée / annulée). */
  obsolete: boolean;
}

export function evaluateCondition(condition: MissionCondition, data: AppData, today: ISODate, summaries: InvoiceSummary[]): MissionEvaluation {
  const yes = (current = 1, target = 1): MissionEvaluation => ({
    satisfied: true,
    current,
    target,
    obsolete: false,
  });
  const no = (current = 0, target = 1): MissionEvaluation => ({
    satisfied: false,
    current,
    target,
    obsolete: false,
  });
  const obsolete: MissionEvaluation = {
    satisfied: false,
    current: 0,
    target: 1,
    obsolete: true,
  };
  switch (condition.kind) {
    case "manual":
      return no();
    case "invoice_paid":
    case "invoice_followed_up": {
      const s = summaries.find((x) => x.invoice.id === condition.invoiceId);
      if (!s || s.status === "cancelled") return obsolete;
      if (s.status === "paid") return yes();
      if (condition.kind === "invoice_paid") return no();
      const followed = data.salesActivities.some((a) => a.invoiceId === condition.invoiceId && a.type === "followup" && a.done);
      return followed ? yes() : no();
    }
    case "task_done": {
      const t = data.tasks.find((x) => x.id === condition.taskId);
      if (!t || t.status === "cancelled") return obsolete;
      return t.status === "done" ? yes() : no();
    }
    case "opportunity_touched": {
      const o = data.opportunities.find((x) => x.id === condition.opportunityId);
      if (!o) return obsolete;
      return o.lastInteractionAt > condition.since || o.stage === "won" || o.stage === "lost" ? yes() : no();
    }
    case "leads_created": {
      const n = data.leads.filter((l) => l.createdAt.slice(0, 10) >= condition.since).length;
      return n >= condition.count ? yes(n, condition.count) : no(n, condition.count);
    }
    case "sales_activities_logged": {
      const n = data.salesActivities.filter((a) => a.done && a.date.slice(0, 10) >= condition.since && a.date.slice(0, 10) <= today).length;
      return n >= condition.count ? yes(n, condition.count) : no(n, condition.count);
    }
    case "projects_done": {
      const list = data.projects.filter((p) => condition.projectIds.includes(p.id) && p.status !== "cancelled");
      if (!list.length) return obsolete;
      const done = list.filter((p) => p.status === "done").length;
      return done === list.length ? yes(done, list.length) : no(done, list.length);
    }
    case "mrr_reached": {
      const mrr = computeMRR(data.subscriptions, today);
      return mrr >= condition.target ? yes(mrr, condition.target) : no(mrr, condition.target);
    }
    case "cash_review": {
      const at = data.settings.gamification.lastCashReviewAt;
      return at && at >= condition.since ? yes() : no();
    }
    case "no_late_tasks": {
      const late = data.tasks.filter((t) => isTaskLate(t, today)).length;
      return late === 0 ? yes() : no(0, 1);
    }
  }
}

interface AutoMissionDraft {
  autoKey: string;
  title: string;
  description: string;
  category: MissionCategory;
  type: MissionType;
  difficulty: MissionDifficulty;
  priority: Priority;
  dueDate: ISODate;
  xpReward: number;
  condition: MissionCondition;
  entity: Mission["entity"];
}

/**
 * Règles de génération des missions automatiques. Chaque mission porte une clé
 * `autoKey` déterministe : une même situation ne recrée jamais la même mission.
 */
export function autoMissionDrafts(data: AppData, today: ISODate, summaries: InvoiceSummary[]): AutoMissionDraft[] {
  const g = data.settings.gamification;
  const daily = g.xpRewards.mission_daily;
  const clients = new Map(data.clients.map((c) => [c.id, c.name]));
  const drafts: AutoMissionDraft[] = [];
  const week = weekPeriod(today);
  const weekKey = isoWeekKey(today);
  const month = monthKey(today);

  for (const s of summaries) {
    if (s.status !== "overdue") continue;
    drafts.push({
      autoKey: `relance:${s.invoice.id}`,
      title: `Relancer ${clients.get(s.invoice.clientId) ?? "le client"} — ${s.invoice.number}`,
      description: `La facture ${s.invoice.number} est échue depuis ${s.daysOverdue} j (solde ${formatEUR(s.balance)}). Consignez une relance ou enregistrez le paiement.`,
      category: "finance",
      type: "daily",
      difficulty: "easy",
      priority: s.balance >= 500_000 ? "high" : "normal",
      dueDate: addDays(today, 2),
      xpReward: daily,
      condition: { kind: "invoice_followed_up", invoiceId: s.invoice.id },
      entity: { type: "invoice", id: s.invoice.id },
    });
  }

  for (const o of data.opportunities) {
    if (!isStale(o, today, g.staleOpportunityDays)) continue;
    drafts.push({
      autoKey: `opportunite:${o.id}:${o.lastInteractionAt.slice(0, 10)}`,
      title: `Faire avancer « ${o.name} »`,
      description: `Aucune interaction depuis plus de ${g.staleOpportunityDays} jours. Consignez un échange ou faites évoluer l'étape.`,
      category: "commercial",
      type: "daily",
      difficulty: "medium",
      priority: o.amount >= 2_000_000 ? "high" : "normal",
      dueDate: addDays(today, 3),
      xpReward: daily,
      condition: {
        kind: "opportunity_touched",
        opportunityId: o.id,
        since: o.lastInteractionAt,
      },
      entity: { type: "opportunity", id: o.id },
    });
  }

  for (const t of data.tasks) {
    if (!isTaskOpen(t) || !t.dueDate || t.priority !== "critical") continue;
    if (t.dueDate > addDays(today, 2)) continue;
    drafts.push({
      autoKey: `tache-critique:${t.id}`,
      title: `Terminer « ${t.title} »`,
      description: `Tâche critique ${t.dueDate < today ? "en retard" : "à échéance imminente"}.`,
      category: t.projectId ? "projects" : "operations",
      type: "daily",
      difficulty: t.complexity === "complex" ? "hard" : "medium",
      priority: "critical",
      dueDate: t.dueDate < today ? addDays(today, 1) : t.dueDate,
      xpReward: daily,
      condition: { kind: "task_done", taskId: t.id },
      entity: { type: "task", id: t.id },
    });
  }

  for (const p of data.projects) {
    if (p.status === "done" || p.status === "cancelled") continue;
    const f = projectFinancials(p, data, summaries);
    if (f.budgetVariance <= 0) continue;
    drafts.push({
      autoKey: `budget:${p.id}`,
      title: `Analyser le dépassement budgétaire de ${p.code}`,
      description: `Coût réel ${formatEUR(f.actualCost)} pour un budget de ${formatEUR(f.budget)} (+${formatEUR(f.budgetVariance)}). Vérifiez la situation puis validez la mission.`,
      category: "finance",
      type: "daily",
      difficulty: "medium",
      priority: "high",
      dueDate: addDays(today, 3),
      xpReward: daily,
      condition: { kind: "manual" },
      entity: { type: "project", id: p.id },
    });
  }

  drafts.push({
    autoKey: `revue-tresorerie:${weekKey}`,
    title: "Mettre à jour les prévisions de trésorerie",
    description: "Passez en revue les scénarios de trésorerie et validez la revue depuis la page Trésorerie.",
    category: "finance",
    type: "weekly",
    difficulty: "easy",
    priority: "normal",
    dueDate: week.end,
    xpReward: daily,
    condition: { kind: "cash_review", since: `${week.start}T00:00:00.000Z` },
    entity: null,
  });

  drafts.push({
    autoKey: `prospection:${weekKey}`,
    title: `Prospecter : ${g.weeklyProspectingTarget} nouveaux prospects`,
    description: "Ajoutez de nouveaux prospects qualifiables dans le CRM cette semaine.",
    category: "commercial",
    type: "weekly",
    difficulty: "medium",
    priority: "normal",
    dueDate: week.end,
    xpReward: daily * 2,
    condition: {
      kind: "leads_created",
      count: g.weeklyProspectingTarget,
      since: week.start,
    },
    entity: null,
  });

  drafts.push({
    autoKey: `activites:${weekKey}`,
    title: "Réaliser 5 activités commerciales",
    description: "Appels, rendez-vous, démonstrations ou relances consignés dans le CRM cette semaine.",
    category: "commercial",
    type: "weekly",
    difficulty: "medium",
    priority: "normal",
    dueDate: week.end,
    xpReward: daily * 2,
    condition: { kind: "sales_activities_logged", count: 5, since: week.start },
    entity: null,
  });

  // Missions mensuelles : générées uniquement si elles représentent un vrai défi
  // (pas de MRR nul, pas de mission « zéro retard » déjà remplie à la création).
  const mrr = computeMRR(data.subscriptions, today);
  const target = Math.max(Math.ceil((mrr * 1.05) / 50_000) * 50_000, mrr + 50_000);
  if (mrr > 0)
    drafts.push({
      autoKey: `mrr:${month}`,
      title: `Atteindre ${formatEUR(target, { round: true })} de MRR`,
      description: "Faites progresser le revenu mensuel récurrent d'environ 5 % ce mois-ci (nouveaux abonnements ou montées en gamme).",
      category: "strategy",
      type: "monthly",
      difficulty: "hard",
      priority: "high",
      dueDate: endOfMonthISO(today),
      xpReward: daily * 4,
      condition: { kind: "mrr_reached", target },
      entity: null,
    });

  const lateNow = data.tasks.filter((t) => isTaskLate(t, today)).length;
  if (lateNow > 0)
    drafts.push({
      autoKey: `zero-retard:${month}`,
      title: "Zéro tâche en retard",
      description: "Ramenez à zéro le nombre de tâches en retard avant la fin du mois.",
      category: "operations",
      type: "monthly",
      difficulty: "hard",
      priority: "normal",
      dueDate: endOfMonthISO(today),
      xpReward: daily * 3,
      condition: { kind: "no_late_tasks" },
      entity: null,
    });

  const priorityProjects = data.projects.filter((p) => (p.priority === "high" || p.priority === "critical") && p.status !== "done" && p.status !== "cancelled");
  if (priorityProjects.length) {
    const quarter = `${today.slice(0, 4)}-T${Math.floor((Number(today.slice(5, 7)) - 1) / 3) + 1}`;
    drafts.push({
      autoKey: `projets-prioritaires:${quarter}`,
      title: `Livrer les ${priorityProjects.length} projets prioritaires`,
      description: priorityProjects.map((p) => p.code).join(", "),
      category: "projects",
      type: "strategic",
      difficulty: "epic",
      priority: "high",
      dueDate: priorityProjects
        .map((p) => p.dueDate)
        .sort()
        .at(-1)!,
      xpReward: daily * 5,
      condition: {
        kind: "projects_done",
        projectIds: priorityProjects.map((p) => p.id),
      },
      entity: null,
    });
  }

  return drafts;
}

export function draftToMission(d: AutoMissionDraft, id: string, today: ISODate, now: ISODateTime): Mission {
  return {
    id,
    title: d.title,
    description: d.description,
    category: d.category,
    type: d.type,
    difficulty: d.difficulty,
    priority: d.priority,
    status: "todo",
    startDate: today,
    dueDate: d.dueDate,
    xpReward: d.xpReward,
    condition: d.condition,
    entity: d.entity,
    history: [
      {
        at: now,
        text: "Mission générée automatiquement à partir des données.",
      },
    ],
    source: "auto",
    autoKey: d.autoKey,
    completedAt: null,
    createdAt: now,
  };
}

export function missionsSummaries(data: AppData, today: ISODate): InvoiceSummary[] {
  return summarizeInvoices(data.invoices, data.payments, today);
}

export const PRIORITY_ORDER: Record<Priority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

/** Missions recommandées du jour : actives, triées par priorité puis échéance. */
export function recommendedMissions(missions: Mission[], today: ISODate, limit = 5): Mission[] {
  return missions
    .filter((m) => m.status !== "done" && m.status !== "cancelled" && m.startDate <= today)
    .sort((a, b) => {
      const order = (m: Mission) => (m.type === "daily" ? 0 : m.type === "weekly" ? 1 : 2);
      return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || order(a) - order(b) || a.dueDate.localeCompare(b.dueDate);
    })
    .slice(0, limit);
}
