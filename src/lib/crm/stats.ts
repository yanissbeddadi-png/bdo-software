import type { AppData, ISODate, Opportunity, OpportunityStage } from "@/lib/domain/types";
import { addDays, daysBetween, inPeriod, isoWeekKey, lastMonthKeys, monthPeriod, type Period } from "@/lib/calculations/dates";
import { STAGES, isOpen } from "@/lib/calculations/pipeline";
import { TASK_TYPE_LABEL } from "./model";
import { buildCrmIndex, isMissionOverdue, isRealInteraction } from "./views";

/**
 * Statistiques CRM. Chaque indicateur documente son périmètre (numérateur,
 * dénominateur, période). Les filtres « responsable », « source » et « étape »
 * s'appliquent aux opportunités et aux contacts concernés.
 */

export interface CrmStatsFilters {
  period: Period;
  ownerId: string | null;
  source: string | null;
  stage: OpportunityStage | null;
}

export interface Kpi {
  label: string;
  value: number | null;
  unit: "count" | "pct" | "days" | "eur";
  definition: string;
}

export interface CrmStats {
  kpis: Record<
    | "prospectsCreated"
    | "prospectsQualified"
    | "activeOpportunities"
    | "conversions"
    | "conversionRate"
    | "prospectConversion"
    | "missionsDone"
    | "overdueFollowups"
    | "noNextAction"
    | "firstContactDelay"
    | "salesCycle"
    | "pipelineValue",
    Kpi
  >;
  bySource: { source: string; created: number; won: number; value: number }[];
  byStage: { stage: OpportunityStage; label: string; count: number; value: number; color: string }[];
  weekly: { week: string; prospects: number; conversions: number; interactions: number; missions: number; onTime: number; late: number }[];
  missionsByType: { type: string; label: string; count: number }[];
  byOwner: { ownerId: string; name: string; interactions: number; missions: number; won: number }[];
  monthlyConversion: { month: string; rate: number | null; won: number; lost: number }[];
}

export function computeCrmStats(data: AppData, today: ISODate, f: CrmStatsFilters): CrmStats {
  const index = buildCrmIndex(data, today);
  const oppOk = (o: Opportunity) => (!f.ownerId || o.ownerId === f.ownerId) && (!f.source || o.source === f.source) && (!f.stage || o.stage === f.stage);
  const opps = data.opportunities.filter(oppOk);
  const contacts = data.contacts.filter((c) => (!f.ownerId || c.ownerId === f.ownerId) && (!f.source || c.source === f.source));
  const crmTasks = data.tasks.filter((t) => t.type !== "internal" && (!f.ownerId || t.assigneeId === f.ownerId));
  const interactions = data.salesActivities.filter((a) => a.done && isRealInteraction(a) && a.type !== "task_done" && (!f.ownerId || a.ownerId === f.ownerId));
  const isProspectLike = (id: string, relation: string) => relation === "prospect" || data.opportunities.some((o) => o.contactId === id);

  const prospectsCreated = contacts.filter((c) => inPeriod(c.createdAt, f.period) && isProspectLike(c.id, c.relation));
  const qualified = opps.filter((o) => inPeriod(o.qualifiedAt, f.period));
  const won = opps.filter((o) => o.stage === "won" && inPeriod(o.closedAt, f.period));
  const lost = opps.filter((o) => o.stage === "lost" && inPeriod(o.closedAt, f.period));
  const convertedProspects = prospectsCreated.filter((c) => data.opportunities.some((o) => o.contactId === c.id && o.stage === "won"));
  const firstDelays = prospectsCreated
    .map((c) => {
      const first = data.salesActivities.filter((a) => a.contactId === c.id && isRealInteraction(a) && a.date >= c.createdAt).sort((a, b) => a.date.localeCompare(b.date))[0];
      return first ? daysBetween(c.createdAt.slice(0, 10), first.date.slice(0, 10)) : null;
    })
    .filter((v): v is number => v !== null);
  const cycles = won.map((o) => daysBetween(o.createdAt.slice(0, 10), o.closedAt!.slice(0, 10)));
  const mean = (list: number[]) => (list.length ? Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 10) / 10 : null);
  const missionsDone = crmTasks.filter((t) => t.status === "done" && inPeriod(t.completedAt, f.period));

  const kpis: CrmStats["kpis"] = {
    prospectsCreated: { label: "Prospects créés", value: prospectsCreated.length, unit: "count", definition: "Contacts prospects (ou reliés à une opportunité) créés dans la période." },
    prospectsQualified: {
      label: "Opportunités qualifiées",
      value: qualified.length,
      unit: "count",
      definition: "Opportunités entrées pour la première fois à l'étape « En discussion » ou au-delà dans la période.",
    },
    activeOpportunities: { label: "Opportunités actives", value: opps.filter(isOpen).length, unit: "count", definition: "Opportunités ni gagnées, ni perdues, ni archivées (à date)." },
    conversions: { label: "Conversions", value: won.length, unit: "count", definition: "Opportunités gagnées (date de clôture dans la période)." },
    conversionRate: {
      label: "Taux de conversion",
      value: won.length + lost.length ? Math.round((won.length / (won.length + lost.length)) * 1000) / 10 : null,
      unit: "pct",
      definition: "Gagnées ÷ (gagnées + perdues), opportunités clôturées dans la période. Les opportunités ouvertes ne sont pas au dénominateur.",
    },
    prospectConversion: {
      label: "Prospects devenus clients",
      value: prospectsCreated.length ? Math.round((convertedProspects.length / prospectsCreated.length) * 1000) / 10 : null,
      unit: "pct",
      definition: "Parmi les prospects créés dans la période, part dont au moins une opportunité est gagnée (à date).",
    },
    missionsDone: { label: "Missions terminées", value: missionsDone.length, unit: "count", definition: "Missions CRM terminées dans la période." },
    overdueFollowups: {
      label: "Relances en retard",
      value: crmTasks.filter((t) => isMissionOverdue(t, today)).length,
      unit: "count",
      definition: "Missions ouvertes dont l'échéance est dépassée (à date).",
    },
    noNextAction: {
      label: "Contacts sans prochaine action",
      value: index.contacts.filter((c) => !c.archived && c.followUp === "no_next_action" && (!f.ownerId || c.contact.ownerId === f.ownerId)).length,
      unit: "count",
      definition: "Contacts non archivés sans aucune mission ouverte (à date).",
    },
    firstContactDelay: {
      label: "Délai de première prise de contact",
      value: mean(firstDelays),
      unit: "days",
      definition: "Moyenne (jours) entre la création d'un prospect de la période et sa première interaction.",
    },
    salesCycle: { label: "Cycle de vente moyen", value: mean(cycles), unit: "days", definition: "Moyenne (jours) entre la création et le gain des opportunités gagnées dans la période." },
    pipelineValue: { label: "Valeur du pipeline", value: opps.filter(isOpen).reduce((s, o) => s + o.amount, 0), unit: "eur", definition: "Somme des montants des opportunités actives (à date)." },
  };

  const sources = new Map<string, { created: number; won: number; value: number }>();
  for (const o of opps.filter((x) => inPeriod(x.createdAt, f.period))) {
    const k = o.source || "Non renseignée";
    const v = sources.get(k) ?? { created: 0, won: 0, value: 0 };
    v.created++;
    if (o.stage === "won") {
      v.won++;
      v.value += o.amount;
    }
    sources.set(k, v);
  }

  const byStage = STAGES.map((s) => {
    const list = opps.filter((o) => o.stage === s.id && !o.archivedAt);
    return { stage: s.id, label: s.label, count: list.length, value: list.reduce((a, o) => a + o.amount, 0), color: s.color };
  });

  // Séries hebdomadaires sur les 12 dernières semaines (indépendantes de la période).
  const weekly: CrmStats["weekly"] = [];
  for (let i = 11; i >= 0; i--) {
    const end = addDays(today, -7 * i);
    const key = isoWeekKey(end);
    const inWeek = (d: string | null | undefined) => !!d && isoWeekKey(d.slice(0, 10)) === key;
    const followDone = crmTasks.filter((t) => t.status === "done" && t.dueDate && inWeek(t.completedAt));
    weekly.push({
      week: key,
      prospects: contacts.filter((c) => inWeek(c.createdAt) && isProspectLike(c.id, c.relation)).length,
      conversions: opps.filter((o) => o.stage === "won" && inWeek(o.closedAt)).length,
      interactions: interactions.filter((a) => inWeek(a.date)).length,
      missions: followDone.length,
      onTime: followDone.filter((t) => t.completedAt!.slice(0, 10) <= t.dueDate!).length,
      late: followDone.filter((t) => t.completedAt!.slice(0, 10) > t.dueDate!).length,
    });
  }

  const types = new Map<string, number>();
  for (const t of missionsDone) types.set(t.type, (types.get(t.type) ?? 0) + 1);

  const owners = new Map<string, { interactions: number; missions: number; won: number }>();
  const bump = (id: string | null, k: "interactions" | "missions" | "won") => {
    if (!id) return;
    const v = owners.get(id) ?? { interactions: 0, missions: 0, won: 0 };
    v[k]++;
    owners.set(id, v);
  };
  for (const a of interactions) if (inPeriod(a.date, f.period)) bump(a.ownerId, "interactions");
  for (const t of missionsDone) bump(t.assigneeId, "missions");
  for (const o of won) bump(o.ownerId, "won");
  const employees = new Map(data.employees.map((e) => [e.id, `${e.firstName} ${e.lastName}`]));

  const monthlyConversion = lastMonthKeys(today, 6).map((m) => {
    const p = monthPeriod(m);
    const w = opps.filter((o) => o.stage === "won" && inPeriod(o.closedAt, p)).length;
    const l = opps.filter((o) => o.stage === "lost" && inPeriod(o.closedAt, p)).length;
    return { month: m, won: w, lost: l, rate: w + l ? Math.round((w / (w + l)) * 1000) / 10 : null };
  });

  return {
    kpis,
    bySource: [...sources.entries()].map(([source, v]) => ({ source, ...v })).sort((a, b) => b.created - a.created),
    byStage,
    weekly,
    missionsByType: [...types.entries()].map(([type, count]) => ({ type, label: TASK_TYPE_LABEL[type as keyof typeof TASK_TYPE_LABEL] ?? type, count })).sort((a, b) => b.count - a.count),
    byOwner: [...owners.entries()].map(([ownerId, v]) => ({ ownerId, name: employees.get(ownerId) ?? "—", ...v })).sort((a, b) => b.interactions + b.missions - (a.interactions + a.missions)),
    monthlyConversion,
  };
}
