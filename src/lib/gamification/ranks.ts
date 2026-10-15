import { formatEUR, formatNumber } from "@/lib/formatters";
import type { GameMetrics } from "./metrics";

/**
 * Rangs de l'entreprise. Le rang n'est jamais lié à une seule métrique de CA : chaque
 * rang combine clients actifs, revenus récurrents, livraisons, rentabilité,
 * satisfaction, objectifs et solidité de trésorerie. Un rang est atteint lorsque
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
const months = (v: number | null) => (v === null ? "—" : `${formatNumber(v, 1)} mois`);
const score = (v: number | null) => (v === null ? "—" : `${formatNumber(v, 1)} / 5`);

function crit(id: string, label: string, current: number | null, target: number, display: (v: number | null) => string) {
  return { id, label, current, target, display };
}

export const RANKS: RankDefinition[] = [
  { rank: 1, name: "Startup", description: "L'aventure commence.", criteria: () => [] },
  {
    rank: 2,
    name: "Studio numérique",
    description: "Premiers clients fidèles et premières livraisons.",
    criteria: (m) => [crit("clients", "Clients actifs", m.activeClients, 3, count), crit("projects", "Projets livrés", m.projectsDone, 1, count)],
  },
  {
    rank: 3,
    name: "Agence en croissance",
    description: "Des revenus récurrents et un rythme de livraison établi.",
    criteria: (m) => [
      crit("clients", "Clients actifs", m.activeClients, 6, count),
      crit("mrr", "MRR", m.mrr, 300_000, euros),
      crit("projects", "Projets livrés", m.projectsDone, 3, count),
    ],
  },
  {
    rank: 4,
    name: "Société structurée",
    description: "Une base clients solide et une gestion maîtrisée.",
    criteria: (m) => [
      crit("clients", "Clients actifs", m.activeClients, 10, count),
      crit("mrr", "MRR", m.mrr, 800_000, euros),
      crit("projects", "Projets livrés", m.projectsDone, 5, count),
      crit("goals", "Objectifs atteints", m.goalsAchieved, 1, count),
      crit("cash", "Trésorerie (mois de charges fixes)", m.cashMonths, 2, months),
    ],
  },
  {
    rank: 5,
    name: "Entreprise rentable",
    description: "Rentabilité durable et clients satisfaits.",
    criteria: (m) => [
      crit("clients", "Clients actifs", m.activeClients, 12, count),
      crit("mrr", "MRR", m.mrr, 1_500_000, euros),
      crit("margin", "Marge opérationnelle (3 mois)", m.margin3m, 10, pct),
      crit("satisfaction", "Satisfaction client moyenne", m.avgSatisfaction, 4, score),
      crit("cash", "Trésorerie (mois de charges fixes)", m.cashMonths, 3, months),
    ],
  },
  {
    rank: 6,
    name: "Acteur reconnu",
    description: "Une référence sur son marché.",
    criteria: (m) => [
      crit("clients", "Clients actifs", m.activeClients, 20, count),
      crit("mrr", "MRR", m.mrr, 3_000_000, euros),
      crit("projects", "Projets livrés", m.projectsDone, 15, count),
      crit("margin", "Marge opérationnelle (3 mois)", m.margin3m, 15, pct),
      crit("goals", "Objectifs atteints", m.goalsAchieved, 5, count),
    ],
  },
  {
    rank: 7,
    name: "Groupe numérique",
    description: "Un groupe solide, rentable et diversifié.",
    criteria: (m) => [
      crit("clients", "Clients actifs", m.activeClients, 35, count),
      crit("mrr", "MRR", m.mrr, 6_000_000, euros),
      crit("projects", "Projets livrés", m.projectsDone, 30, count),
      crit("margin", "Marge opérationnelle (3 mois)", m.margin3m, 20, pct),
      crit("cash", "Trésorerie (mois de charges fixes)", m.cashMonths, 6, months),
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
