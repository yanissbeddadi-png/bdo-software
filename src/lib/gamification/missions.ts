import type { AppData, ISODate, ISODateTime, Mission, MissionCategory, MissionCondition, MissionDifficulty, MissionStatus, MissionType, Priority } from "@/lib/domain/types";
import { addDays, endOfMonthISO, isoWeekKey, monthKey, weekPeriod } from "@/lib/calculations/dates";
import { summarizeData, type InvoiceSummary } from "@/lib/calculations/invoices";
import { isStale } from "@/lib/calculations/pipeline";
import { isTaskLate } from "@/lib/calculations/projects";
import { computeMRR } from "@/lib/calculations/recurring";

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

/** Les « missions » de gamification sont présentées comme des « défis » dans l'interface. */
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
      // Prospects exploitables (rattachés à une entreprise, avec e-mail ou téléphone) créés depuis la date.
      const n = data.contacts.filter((c) => c.createdAt.slice(0, 10) >= condition.since && c.clientId && (c.email || c.phone) && c.relation !== "archived").length;
      return n >= condition.count ? yes(n, condition.count) : no(n, condition.count);
    }
    case "sales_activities_logged":
    case "interactions_logged": {
      const n = data.salesActivities.filter((a) => a.done && a.type !== "stage_change" && a.type !== "task_done" && a.date.slice(0, 10) >= condition.since && a.date.slice(0, 10) <= today).length;
      return n >= condition.count ? yes(n, condition.count) : no(n, condition.count);
    }
    case "prospects_qualified": {
      const n = data.opportunities.filter((o) => o.qualifiedAt && o.qualifiedAt.slice(0, 10) >= condition.since).length;
      return n >= condition.count ? yes(n, condition.count) : no(n, condition.count);
    }
    case "no_overdue_followups": {
      const late = data.tasks.filter((t) => t.type !== "internal" && t.status !== "done" && t.status !== "cancelled" && t.dueDate && t.dueDate < today).length;
      return late === 0 ? yes() : no(0, 1);
    }
    case "day_actions_done": {
      const list = data.tasks.filter((t) => t.type !== "internal" && t.dueDate === condition.date && t.status !== "cancelled");
      if (!list.length) return obsolete;
      const done = list.filter((t) => t.status === "done").length;
      return done === list.length ? yes(done, list.length) : no(done, list.length);
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
    case "vat_declared":
      return data.vatReturns.some((r) => r.period === condition.period) ? yes() : no();
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
export function autoMissionDrafts(data: AppData, today: ISODate, _summaries: InvoiceSummary[]): AutoMissionDraft[] {
  void _summaries;
  const g = data.settings.gamification;
  const daily = g.xpRewards.mission_daily;
  const drafts: AutoMissionDraft[] = [];
  const week = weekPeriod(today);
  const weekKey = isoWeekKey(today);
  const month = monthKey(today);
  const crmOpen = data.tasks.filter((t) => t.type !== "internal" && t.status !== "done" && t.status !== "cancelled");

  // Défi du jour : boucler toutes les actions prévues aujourd'hui.
  const dueToday = crmOpen.filter((t) => t.dueDate === today);
  if (dueToday.length)
    drafts.push({
      autoKey: `journee:${today}`,
      title: `Boucler les ${dueToday.length} action${dueToday.length > 1 ? "s" : ""} du jour`,
      description: "Terminez toutes les missions CRM prévues aujourd'hui.",
      category: "commercial",
      type: "daily",
      difficulty: dueToday.length > 3 ? "medium" : "easy",
      priority: "high",
      dueDate: today,
      xpReward: daily,
      condition: { kind: "day_actions_done", date: today },
      entity: null,
    });

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
      condition: { kind: "opportunity_touched", opportunityId: o.id, since: o.lastInteractionAt },
      entity: { type: "opportunity", id: o.id },
    });
  }

  drafts.push({
    autoKey: `prospection:${weekKey}`,
    title: `Prospecter : ${g.weeklyProspectingTarget} nouveaux prospects exploitables`,
    description: "Ajoutez des prospects rattachés à une entreprise, avec au moins un moyen de contact.",
    category: "commercial",
    type: "weekly",
    difficulty: "medium",
    priority: "normal",
    dueDate: week.end,
    xpReward: daily * 2,
    condition: { kind: "leads_created", count: g.weeklyProspectingTarget, since: week.start },
    entity: null,
  });

  drafts.push({
    autoKey: `interactions:${weekKey}`,
    title: "Consigner 5 interactions",
    description: "Appels, e-mails, rendez-vous ou relances consignés dans le CRM cette semaine.",
    category: "commercial",
    type: "weekly",
    difficulty: "medium",
    priority: "normal",
    dueDate: week.end,
    xpReward: daily * 2,
    condition: { kind: "interactions_logged", count: 5, since: week.start },
    entity: null,
  });

  drafts.push({
    autoKey: `qualification:${weekKey}`,
    title: "Qualifier 2 opportunités",
    description: "Faites passer deux opportunités à l'étape « En discussion » (besoin, budget, calendrier validés).",
    category: "commercial",
    type: "weekly",
    difficulty: "hard",
    priority: "normal",
    dueDate: week.end,
    xpReward: daily * 2,
    condition: { kind: "prospects_qualified", count: 2, since: week.start },
    entity: null,
  });

  // Défi mensuel généré uniquement s'il y a réellement des relances en retard.
  if (crmOpen.some((t) => t.dueDate && t.dueDate < today))
    drafts.push({
      autoKey: `zero-relance:${month}`,
      title: "Zéro relance en retard",
      description: "Rattrapez toutes les missions échues avant la fin du mois.",
      category: "commercial",
      type: "monthly",
      difficulty: "hard",
      priority: "high",
      dueDate: endOfMonthISO(today),
      xpReward: daily * 3,
      condition: { kind: "no_overdue_followups" },
      entity: null,
    });

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
  return summarizeData(data, today);
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
