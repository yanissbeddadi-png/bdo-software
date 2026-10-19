import type { XpRuleKey } from "@/lib/domain/types";
import type { GameMetrics } from "./metrics";

export type Rarity = "common" | "rare" | "epic" | "legendary";
export type AchievementCategory = "commercial" | "finance" | "projets" | "equipe" | "strategie" | "rigueur";

export const RARITY_LABELS: Record<Rarity, string> = { common: "Commun", rare: "Rare", epic: "Épique", legendary: "Légendaire" };
export const RARITY_XP_RULE: Record<Rarity, XpRuleKey> = {
  common: "achievement_common",
  rare: "achievement_rare",
  epic: "achievement_epic",
  legendary: "achievement_legendary",
};

export interface AchievementContext {
  pipelineThreshold: number;
  rank: number;
}

export interface AchievementDefinition {
  id: string;
  name: string;
  description: string;
  /** Nom d'icône Lucide. */
  icon: string;
  category: AchievementCategory;
  rarity: Rarity;
  /** Condition lisible, affichée à l'utilisateur. */
  condition: string;
  test: (m: GameMetrics, ctx: AchievementContext) => boolean;
  /** Progression optionnelle (valeur actuelle / cible). */
  progress?: (m: GameMetrics, ctx: AchievementContext) => { current: number; target: number };
}

/**
 * Succès du CRM : chacun repose sur une action réelle et vérifiable dans les données
 * (jamais sur l'ouverture de l'application). Les succès des versions précédentes déjà
 * obtenus restent acquis (XP conservée) mais ne sont plus affichés.
 */
const one = (n: number) => ({ current: Math.min(n, 1), target: 1 });

export const ACHIEVEMENTS: AchievementDefinition[] = [
  {
    id: "first-prospect",
    name: "Premier prospect",
    description: "Le pipeline commence ici.",
    icon: "UserPlus",
    category: "commercial",
    rarity: "common",
    condition: "Ajouter un premier prospect dans le CRM.",
    test: (m) => m.prospectsAdded >= 1,
    progress: (m) => one(m.prospectsAdded),
  },
  {
    id: "first-call",
    name: "Premier appel consigné",
    description: "Chaque échange compte, surtout quand il est noté.",
    icon: "Phone",
    category: "commercial",
    rarity: "common",
    condition: "Consigner un appel.",
    test: (m) => m.callsLogged >= 1,
    progress: (m) => one(m.callsLogged),
  },
  {
    id: "first-followup",
    name: "Première relance effectuée",
    description: "La persévérance paie.",
    icon: "BellRing",
    category: "rigueur",
    rarity: "common",
    condition: "Terminer une mission de relance.",
    test: (m) => m.followupsDone >= 1,
    progress: (m) => one(m.followupsDone),
  },
  {
    id: "first-qualified",
    name: "Première opportunité qualifiée",
    description: "Un besoin réel, un budget, un calendrier.",
    icon: "Crosshair",
    category: "commercial",
    rarity: "common",
    condition: "Faire passer une opportunité à l'étape « En discussion » ou au-delà.",
    test: (m) => m.qualifiedOpportunities >= 1,
    progress: (m) => one(m.qualifiedOpportunities),
  },
  {
    id: "first-proposal",
    name: "Première proposition envoyée",
    description: "Une offre concrète sur la table.",
    icon: "FileSignature",
    category: "commercial",
    rarity: "common",
    condition: "Avoir une opportunité à l'étape « Proposition envoyée » ou au-delà.",
    test: (m) => m.proposalsSent >= 1,
    progress: (m) => one(m.proposalsSent),
  },
  {
    id: "first-sale",
    name: "Premier client gagné",
    description: "La signature tant attendue.",
    icon: "Handshake",
    category: "commercial",
    rarity: "common",
    condition: "Gagner une opportunité.",
    test: (m) => m.wonOpportunities >= 1,
    progress: (m) => one(m.wonOpportunities),
  },
  {
    id: "first-meeting-report",
    name: "Compte rendu exemplaire",
    description: "Un rendez-vous suivi d'un compte rendu.",
    icon: "MessagesSquare",
    category: "rigueur",
    rarity: "common",
    condition: "Terminer un rendez-vous en consignant son résultat.",
    test: (m) => m.meetingReports >= 1,
    progress: (m) => one(m.meetingReports),
  },
  {
    id: "ten-qualified-contacts",
    name: "Carnet d'adresses qualifié",
    description: "Dix fiches contact complètes et exploitables.",
    icon: "Users",
    category: "rigueur",
    rarity: "rare",
    condition: "10 contacts avec entreprise, fonction, e-mail et téléphone.",
    test: (m) => m.qualifiedContacts >= 10,
    progress: (m) => ({ current: Math.min(m.qualifiedContacts, 10), target: 10 }),
  },
  {
    id: "ten-missions",
    name: "Dix missions accomplies",
    description: "Le suivi devient une habitude.",
    icon: "ListChecks",
    category: "rigueur",
    rarity: "rare",
    condition: "Terminer 10 missions commerciales.",
    test: (m) => m.crmMissionsDone >= 10,
    progress: (m) => ({ current: Math.min(m.crmMissionsDone, 10), target: 10 }),
  },
  {
    id: "zero-overdue",
    name: "Zéro relance en retard",
    description: "Aucune action échue, tout est sous contrôle.",
    icon: "ShieldCheck",
    category: "rigueur",
    rarity: "rare",
    condition: "Aucune mission en retard, après au moins 5 missions terminées.",
    test: (m) => m.overdueFollowups === 0 && m.crmMissionsDone >= 5,
  },
  {
    id: "day-cleared",
    name: "Journée bouclée",
    description: "Toutes les actions du jour sont terminées.",
    icon: "CalendarCheck",
    category: "rigueur",
    rarity: "rare",
    condition: "Terminer toutes les missions prévues aujourd'hui (au moins une).",
    test: (m) => m.dayCleared,
  },
  {
    id: "priority-up-to-date",
    name: "Comptes prioritaires sous contrôle",
    description: "Chaque contact prioritaire a une prochaine action planifiée.",
    icon: "Target",
    category: "rigueur",
    rarity: "rare",
    condition: "Au moins 3 contacts prioritaires, tous avec un suivi à jour.",
    test: (m) => m.priorityContactsUpToDate,
  },
  {
    id: "pipeline-threshold",
    name: "Pipeline ambitieux",
    description: "Un carnet d'opportunités qui voit grand.",
    icon: "ChartNoAxesCombined",
    category: "strategie",
    rarity: "rare",
    condition: "Valeur des opportunités ouvertes ≥ seuil configuré.",
    test: (m, c) => m.pipeline >= c.pipelineThreshold,
    progress: (m, c) => ({ current: Math.round(m.pipeline / 100), target: Math.round(c.pipelineThreshold / 100) }),
  },
  {
    id: "five-conversions",
    name: "Cinq conversions",
    description: "Cinq opportunités transformées en contrats.",
    icon: "Trophy",
    category: "commercial",
    rarity: "epic",
    condition: "Gagner 5 opportunités.",
    test: (m) => m.wonOpportunities >= 5,
    progress: (m) => ({ current: Math.min(m.wonOpportunities, 5), target: 5 }),
  },
  {
    id: "rigorous-week",
    name: "Semaine de suivi rigoureux",
    description: "Toutes les relances d'une semaine faites à l'heure.",
    icon: "BadgeCheck",
    category: "rigueur",
    rarity: "epic",
    condition: "Une semaine complète avec au moins 3 relances, toutes réalisées à temps.",
    test: (m) => m.rigorousWeeks >= 1,
    progress: (m) => one(m.rigorousWeeks),
  },
  {
    id: "streak-3",
    name: "Série de 3 jours",
    description: "Trois jours ouvrés d'activité commerciale d'affilée.",
    icon: "Flame",
    category: "rigueur",
    rarity: "common",
    condition: "3 jours ouvrés consécutifs avec au moins une action CRM.",
    test: (m) => m.bestStreak >= 3,
    progress: (m) => ({ current: Math.min(m.bestStreak, 3), target: 3 }),
  },
  {
    id: "streak-7",
    name: "Série de 7 jours",
    description: "Une régularité qui fait la différence.",
    icon: "Flame",
    category: "rigueur",
    rarity: "rare",
    condition: "7 jours ouvrés consécutifs avec au moins une action CRM.",
    test: (m) => m.bestStreak >= 7,
    progress: (m) => ({ current: Math.min(m.bestStreak, 7), target: 7 }),
  },
  {
    id: "streak-14",
    name: "Série de 14 jours",
    description: "Deux semaines sans relâche.",
    icon: "Flame",
    category: "rigueur",
    rarity: "epic",
    condition: "14 jours ouvrés consécutifs avec au moins une action CRM.",
    test: (m) => m.bestStreak >= 14,
    progress: (m) => ({ current: Math.min(m.bestStreak, 14), target: 14 }),
  },
  {
    id: "streak-30",
    name: "Série de 30 jours",
    description: "La relation client comme seconde nature.",
    icon: "Flame",
    category: "rigueur",
    rarity: "legendary",
    condition: "30 jours ouvrés consécutifs avec au moins une action CRM.",
    test: (m) => m.bestStreak >= 30,
    progress: (m) => ({ current: Math.min(m.bestStreak, 30), target: 30 }),
  },
];

export const ACHIEVEMENT_ICON_NAMES = ACHIEVEMENTS.map((a) => a.icon);

export function getAchievement(id: string): AchievementDefinition | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}
