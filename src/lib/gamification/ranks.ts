import { formatEUR, formatNumber } from "@/lib/formatters";
import type { GameMetrics } from "./metrics";

/**
 * Rangs de l'entreprise (portefeuille commercial). Chaque rang combine plusieurs
 * critères CRM : clients actifs, conversions, pipeline, rigueur du suivi, satisfaction,
 * objectifs et régularité. Un rang est atteint lorsque
 * tous ses critères (et ceux des rangs précédents) sont remplis.
 */

export interface RankCriterion {
  id: string;
  label: string;
  current: number | null;
  target: number;
  display: (v: number | null) => string;
  met: boolean;
}

export interface RankDefinition {
  rank: number;
  name: string;
  description: string;
  criteria: (m: GameMetrics) => Omit<RankCriterion, "met">[];
}

const count = (v: number | null) => (v === null ? "—" : String(Math.round(v)));
const euros = (v: number | null) => (v === null ? "—" : formatEUR(v, { compact: true }));
const pct = (v: number | null) => (v === null ? "—" : `${formatNumber(v, 1)} %`);
const score = (v: number | null) => (v === null ? "—" : `${formatNumber(v, 1)} / 5`);

function crit(id: string, label: string, current: number | null, target: number, display: (v: number | null) => string) {
  return { id, label, current, target, display };
}

export const RANKS: RankDefinition[] = [
  { rank: 1, name: "Startup commerciale", description: "Le portefeuille démarre.", criteria: () => [] },
  {
    rank: 2,
    name: "Portefeuille naissant",
    description: "Premiers clients signés et premières actions de suivi.",
    criteria: (m) => [crit("clients", "Clients actifs", m.activeClients, 3, count), crit("won", "Opportunités gagnées", m.wonOpportunities, 1, count)],
  },
  {
    rank: 3,
    name: "Équipe commerciale rodée",
    description: "Un pipeline nourri et un rythme de conversion établi.",
    criteria: (m) => [
      crit("clients", "Clients actifs", m.activeClients, 6, count),
      crit("won", "Opportunités gagnées", m.wonOpportunities, 3, count),
      crit("pipeline", "Pipeline actif", m.pipeline, 15_000_000, euros),
    ],
  },
  {
    rank: 4,
    name: "Machine commerciale",
    description: "Un suivi rigoureux et des objectifs tenus.",
    criteria: (m) => [
      crit("clients", "Clients actifs", m.activeClients, 10, count),
      crit("won", "Opportunités gagnées", m.wonOpportunities, 5, count),
      crit("missions", "Missions commerciales terminées", m.crmMissionsDone, 30, count),
      crit("goals", "Objectifs atteints", m.goalsAchieved, 1, count),
    ],
  },
  {
    rank: 5,
    name: "Référence relation client",
    description: "Des clients satisfaits et un suivi exemplaire.",
    criteria: (m) => [
      crit("clients", "Clients actifs", m.activeClients, 12, count),
      crit("conversion", "Taux de conversion", m.conversionRate, 40, pct),
      crit("satisfaction", "Satisfaction client moyenne", m.avgSatisfaction, 4, score),
      crit("weeks", "Semaines de suivi rigoureux", m.rigorousWeeks, 2, count),
    ],
  },
  {
    rank: 6,
    name: "Acteur reconnu",
    description: "Une référence sur son marché.",
    criteria: (m) => [
      crit("clients", "Clients actifs", m.activeClients, 20, count),
      crit("won", "Opportunités gagnées", m.wonOpportunities, 15, count),
      crit("goals", "Objectifs atteints", m.goalsAchieved, 5, count),
      crit("streak", "Meilleure série d'activité (jours)", m.bestStreak, 14, count),
    ],
  },
  {
    rank: 7,
    name: "Leader du marché",
    description: "Un portefeuille solide, fidèle et en croissance.",
    criteria: (m) => [
      crit("clients", "Clients actifs", m.activeClients, 35, count),
      crit("won", "Opportunités gagnées", m.wonOpportunities, 30, count),
      crit("pipeline", "Pipeline actif", m.pipeline, 100_000_000, euros),
      crit("streak", "Meilleure série d'activité (jours)", m.bestStreak, 30, count),
    ],
  },
];

export function evaluateCriteria(def: RankDefinition, m: GameMetrics): RankCriterion[] {
  return def.criteria(m).map((c) => ({ ...c, met: c.current !== null && c.current >= c.target }));
}

export interface RankStatus {
  rank: number;
  name: string;
  next: { rank: number; name: string; criteria: RankCriterion[]; metCount: number } | null;
  /** Progression (0–1) vers le rang suivant : part des critères remplis. */
  progress: number;
}

export function computeRank(m: GameMetrics): RankStatus {
  let current = RANKS[0];
  for (const def of RANKS.slice(1)) {
    if (evaluateCriteria(def, m).every((c) => c.met)) current = def;
    else break;
  }
  const nextDef = RANKS.find((r) => r.rank === current.rank + 1);
  if (!nextDef) return { rank: current.rank, name: current.name, next: null, progress: 1 };
  const criteria = evaluateCriteria(nextDef, m);
  const metCount = criteria.filter((c) => c.met).length;
  return { rank: current.rank, name: current.name, next: { rank: nextDef.rank, name: nextDef.name, criteria, metCount }, progress: criteria.length ? metCount / criteria.length : 0 };
}

export function rankName(rank: number): string {
  return RANKS.find((r) => r.rank === rank)?.name ?? "—";
}
