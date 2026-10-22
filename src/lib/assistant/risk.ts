import type { AppData, ISODate, Opportunity, OpportunityStage } from "@/lib/domain/types";
import { daysBetween } from "@/lib/calculations/dates";
import { STAGE_LABELS, isOpen } from "@/lib/calculations/pipeline";
import type { DealView } from "@/lib/crm/views";

/**
 * Score de risque d'une opportunité ouverte (0 à 100), entièrement explicable : chaque
 * point vient d'une règle nommée, affichée à l'utilisateur. Aucune donnée n'est envoyée
 * à un service externe pour le calculer.
 */

export type RiskLevel = "low" | "medium" | "high";

export const RISK_LEVEL: Record<RiskLevel, { label: string; tone: "success" | "warning" | "danger" }> = {
  low: { label: "Risque faible", tone: "success" },
  medium: { label: "À surveiller", tone: "warning" },
  high: { label: "À risque", tone: "danger" },
};

export interface RiskFactor {
  key: "no_next_action" | "overdue_mission" | "silence" | "proposal_pending" | "close_date_passed" | "close_date_near" | "stuck_in_stage" | "no_contact";
  label: string;
  points: number;
}

export interface DealRisk {
  score: number;
  level: RiskLevel;
  factors: RiskFactor[];
  /** Jours passés dans l'étape actuelle. */
  stageAgeDays: number;
}

/** Au-delà de ce nombre de jours dans la même étape, une affaire est jugée bloquée. */
export const STUCK_STAGE_DAYS = 45;
const EARLY_STAGES: OpportunityStage[] = ["new", "qualify", "discussion"];

const fr = (d: ISODate) => d.split("-").reverse().join("/");
const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;

/** Dernier changement d'étape consigné, par opportunité (un seul parcours des interactions). */
export function stageChangeIndex(data: Pick<AppData, "salesActivities">): Map<string, string> {
  const index = new Map<string, string>();
  for (const a of data.salesActivities) {
    if (a.type !== "stage_change" || !a.opportunityId) continue;
    const prev = index.get(a.opportunityId);
    if (!prev || a.date > prev) index.set(a.opportunityId, a.date);
  }
  return index;
}

/** Date d'entrée dans l'étape actuelle : dernier changement d'étape consigné, sinon la création. */
export function stageEnteredAt(opp: Opportunity, index: Map<string, string>): string {
  const last = index.get(opp.id);
  return last && last > opp.createdAt ? last : opp.createdAt;
}

export function levelOf(score: number): RiskLevel {
  return score >= 50 ? "high" : score >= 25 ? "medium" : "low";
}

export function dealRisk(deal: DealView, data: Pick<AppData, "salesActivities" | "settings">, today: ISODate, stageIndex: Map<string, string> = stageChangeIndex(data)): DealRisk {
  const o = deal.opportunity;
  const stageAgeDays = Math.max(0, daysBetween(stageEnteredAt(o, stageIndex).slice(0, 10), today));
  if (!isOpen(o)) return { score: 0, level: "low", factors: [], stageAgeDays };
  const factors: RiskFactor[] = [];
  const staleDays = Math.max(1, data.settings.gamification.staleOpportunityDays);
  const proposalDays = data.settings.crm.proposalPendingDays;

  if (!deal.openMissions.length) factors.push({ key: "no_next_action", label: "Aucune prochaine action planifiée", points: 25 });
  else if (deal.overdue) {
    const late = deal.openMissions.filter((t) => t.dueDate && t.dueDate < today);
    const oldest = late.reduce((m, t) => Math.max(m, daysBetween(t.dueDate!, today)), 0);
    factors.push({ key: "overdue_mission", label: `${late.length > 1 ? `${late.length} missions en retard` : "Mission en retard"} (jusqu'à ${plural(oldest, "jour")})`, points: 20 });
  }

  const silence = deal.daysSinceInteraction;
  if (silence > staleDays) factors.push({ key: "silence", label: `Aucun échange depuis ${plural(silence, "jour")} (seuil : ${staleDays})`, points: 25 });
  else if (silence > Math.ceil(staleDays / 2)) factors.push({ key: "silence", label: `Pas d'échange depuis ${plural(silence, "jour")}`, points: 10 });

  if (o.stage === "proposal" && silence >= proposalDays) factors.push({ key: "proposal_pending", label: `Proposition sans réponse depuis ${plural(silence, "jour")}`, points: 15 });

  if (o.expectedCloseDate && o.expectedCloseDate < today) factors.push({ key: "close_date_passed", label: `Date de signature prévue dépassée (${fr(o.expectedCloseDate)})`, points: 20 });
  else if (o.expectedCloseDate && daysBetween(today, o.expectedCloseDate) <= 7 && EARLY_STAGES.includes(o.stage))
    factors.push({ key: "close_date_near", label: `Signature prévue le ${fr(o.expectedCloseDate)} mais l'affaire est encore à l'étape « ${STAGE_LABELS[o.stage]} »`, points: 10 });

  if (stageAgeDays > STUCK_STAGE_DAYS) factors.push({ key: "stuck_in_stage", label: `À l'étape « ${STAGE_LABELS[o.stage]} » depuis ${plural(stageAgeDays, "jour")}`, points: 10 });

  if (!o.contactId) factors.push({ key: "no_contact", label: "Aucun interlocuteur rattaché", points: 5 });

  const score = Math.min(100, factors.reduce((s, f) => s + f.points, 0));
  return { score, level: levelOf(score), factors: factors.sort((a, b) => b.points - a.points), stageAgeDays };
}

/** Opportunités ouvertes classées par risque décroissant, puis par montant. */
export function rankDealsByRisk(deals: DealView[], data: Pick<AppData, "salesActivities" | "settings">, today: ISODate): { deal: DealView; risk: DealRisk }[] {
  const index = stageChangeIndex(data);
  return deals
    .filter((d) => isOpen(d.opportunity))
    .map((deal) => ({ deal, risk: dealRisk(deal, data, today, index) }))
    .sort((a, b) => b.risk.score - a.risk.score || b.deal.opportunity.amount - a.deal.opportunity.amount);
}
