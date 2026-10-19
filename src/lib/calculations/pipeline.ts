import type { Cents, ISODate, Opportunity, OpportunityStage } from "@/lib/domain/types";
import { daysBetween, inPeriod, type Period } from "./dates";
import { roundCents } from "./money";

/**
 * Étapes commerciales du pipeline (cycle de vente). L'état de suivi (à relancer, en
 * retard…) est distinct : il est calculé à partir des missions (`lib/crm/follow-up.ts`).
 */
export const STAGES: { id: OpportunityStage; label: string; short: string; defaultProbability: number; color: string }[] = [
  { id: "new", label: "Nouveaux prospects", short: "Nouveau", defaultProbability: 5, color: "#64748b" },
  { id: "qualify", label: "À qualifier", short: "À qualifier", defaultProbability: 15, color: "#3987e5" },
  { id: "discussion", label: "En discussion", short: "En discussion", defaultProbability: 35, color: "#9085e9" },
  { id: "proposal", label: "Proposition envoyée", short: "Proposition", defaultProbability: 55, color: "#c98500" },
  { id: "negotiation", label: "Négociation", short: "Négociation", defaultProbability: 75, color: "#d95926" },
  { id: "won", label: "Gagné", short: "Gagné", defaultProbability: 100, color: "#199e70" },
  { id: "lost", label: "Perdu / archivé", short: "Perdu", defaultProbability: 0, color: "#e66767" },
];

/** Étapes à partir desquelles une opportunité est considérée comme qualifiée. */
export const QUALIFIED_STAGES: OpportunityStage[] = ["discussion", "proposal", "negotiation", "won"];

export const STAGE_LABELS = Object.fromEntries(STAGES.map((s) => [s.id, s.label])) as Record<OpportunityStage, string>;

export function stageIndex(stage: OpportunityStage): number {
  return STAGES.findIndex((s) => s.id === stage);
}

/** Opportunité active : ni gagnée, ni perdue, ni archivée. */
export function isOpen(opp: Opportunity): boolean {
  return opp.stage !== "won" && opp.stage !== "lost" && !opp.archivedAt;
}

/** Valeur brute du pipeline : somme des montants des opportunités ouvertes. */
export function pipelineValue(opps: Opportunity[]): Cents {
  return opps.filter(isOpen).reduce((s, o) => s + o.amount, 0);
}

/** Valeur pondérée : Σ montant × probabilité / 100 sur les opportunités ouvertes. */
export function weightedPipeline(opps: Opportunity[]): Cents {
  return opps.filter(isOpen).reduce((s, o) => s + roundCents((o.amount * o.probability) / 100), 0);
}

/** Taux de conversion : gagnées / (gagnées + perdues) parmi les opportunités clôturées dans la période. */
export function conversionRate(opps: Opportunity[], period?: Period): number | null {
  const closed = opps.filter((o) => (o.stage === "won" || o.stage === "lost") && (!period || inPeriod(o.closedAt, period)));
  if (closed.length === 0) return null;
  return (closed.filter((o) => o.stage === "won").length / closed.length) * 100;
}

/** Durée moyenne (jours) entre création et gain. */
export function averageSalesCycle(opps: Opportunity[]): number | null {
  const won = opps.filter((o) => o.stage === "won" && o.closedAt);
  if (!won.length) return null;
  return won.reduce((s, o) => s + daysBetween(o.createdAt.slice(0, 10), o.closedAt!.slice(0, 10)), 0) / won.length;
}

export function isStale(opp: Opportunity, today: ISODate, staleDays: number): boolean {
  return isOpen(opp) && daysBetween(opp.lastInteractionAt.slice(0, 10), today) > staleDays;
}

export function pipelineByStage(opps: Opportunity[]): { stage: OpportunityStage; label: string; count: number; value: Cents; weighted: Cents }[] {
  return STAGES.map((s) => {
    const list = opps.filter((o) => o.stage === s.id);
    return {
      stage: s.id,
      label: s.label,
      count: list.length,
      value: list.reduce((sum, o) => sum + o.amount, 0),
      weighted: list.reduce((sum, o) => sum + roundCents((o.amount * o.probability) / 100), 0),
    };
  });
}
