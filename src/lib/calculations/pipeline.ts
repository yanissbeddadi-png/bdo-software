import type { Cents, ISODate, Opportunity, OpportunityStage } from "@/lib/domain/types";
import { daysBetween, inPeriod, type Period } from "./dates";
import { roundCents } from "./money";

export const STAGES: { id: OpportunityStage; label: string; defaultProbability: number }[] = [
  { id: "new", label: "Nouveau prospect", defaultProbability: 5 },
  { id: "contacted", label: "Contact établi", defaultProbability: 10 },
  { id: "qualification", label: "Qualification", defaultProbability: 20 },
  { id: "meeting", label: "Rendez-vous", defaultProbability: 35 },
  { id: "proposal", label: "Proposition envoyée", defaultProbability: 50 },
  { id: "negotiation", label: "Négociation", defaultProbability: 70 },
  { id: "won", label: "Gagnée", defaultProbability: 100 },
  { id: "lost", label: "Perdue", defaultProbability: 0 },
];

export const STAGE_LABELS = Object.fromEntries(STAGES.map((s) => [s.id, s.label])) as Record<OpportunityStage, string>;

export function stageIndex(stage: OpportunityStage): number {
  return STAGES.findIndex((s) => s.id === stage);
}

export function isOpen(opp: Opportunity): boolean {
  return opp.stage !== "won" && opp.stage !== "lost";
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
