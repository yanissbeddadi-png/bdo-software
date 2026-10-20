import { LEVEL_TITLES } from "./levels";

/**
 * Récompenses cosmétiques. Aucune fonctionnalité de gestion n'est jamais bloquée
 * derrière un niveau : les récompenses modifient l'apparence (titre, thème
 * d'accent, cadre d'avatar) ou ajoutent des éléments au siège virtuel.
 */

export type RewardKind = "title" | "theme" | "frame" | "hq";

export type RewardUnlock = { type: "level"; level: number } | { type: "achievement"; id: string } | { type: "rank"; rank: number };

export interface RewardDefinition {
  id: string;
  kind: RewardKind;
  name: string;
  description: string;
  unlock: RewardUnlock;
  /** Pour les thèmes : couleur d'accent ; pour les cadres : couleur de bordure. */
  color?: string;
}

export const THEMES: RewardDefinition[] = [
  {
    id: "theme-default",
    kind: "theme",
    name: "Couleur de l'entreprise",
    description: "Couleur principale de l'espace (Paramètres › Entreprise).",
    unlock: { type: "level", level: 1 },
    color: "#E81A3B",
  },
  { id: "theme-emerald", kind: "theme", name: "Émeraude", description: "Accent vert profond.", unlock: { type: "level", level: 5 }, color: "#1A7F4E" },
  { id: "theme-violet", kind: "theme", name: "Améthyste", description: "Accent violet des stratèges.", unlock: { type: "level", level: 10 }, color: "#6B4FBB" },
  { id: "theme-gold", kind: "theme", name: "Or impérial", description: "Accent doré réservé aux dirigeants aguerris.", unlock: { type: "level", level: 20 }, color: "#8F5E00" },
  { id: "theme-cyan", kind: "theme", name: "Cyan orbital", description: "Débloqué par le succès « Cinq conversions ».", unlock: { type: "achievement", id: "five-conversions" }, color: "#00788F" },
];

export const FRAMES: RewardDefinition[] = [
  { id: "frame-bronze", kind: "frame", name: "Cadre bronze", description: "Premier client gagné.", unlock: { type: "achievement", id: "first-sale" }, color: "#D97706" },
  { id: "frame-silver", kind: "frame", name: "Cadre argent", description: "Dix missions accomplies.", unlock: { type: "achievement", id: "ten-missions" }, color: "#8B98A9" },
  { id: "frame-gold", kind: "frame", name: "Cadre or", description: "Semaine de suivi rigoureux.", unlock: { type: "achievement", id: "rigorous-week" }, color: "#FBBF24" },
  { id: "frame-violet", kind: "frame", name: "Cadre épique", description: "Série de 14 jours.", unlock: { type: "achievement", id: "streak-14" }, color: "#A78BFA" },
];

export const TITLES: RewardDefinition[] = [
  ...LEVEL_TITLES.map((t) => ({ id: `title-${t.level}`, kind: "title" as const, name: t.title, description: `Titre du niveau ${t.level}.`, unlock: { type: "level" as const, level: t.level } })),
  { id: "title-closer", kind: "title", name: "Closer", description: "Débloqué par « Cinq conversions ».", unlock: { type: "achievement", id: "five-conversions" } },
  { id: "title-followup", kind: "title", name: "Maître des relances", description: "Débloqué par « Zéro relance en retard ».", unlock: { type: "achievement", id: "zero-overdue" } },
];

/** Bâtiments du siège virtuel, débloqués par le rang de l'entreprise. */
export const HQ_BUILDINGS: RewardDefinition[] = [
  { id: "hq-garage", kind: "hq", name: "Le garage", description: "Là où tout a commencé.", unlock: { type: "rank", rank: 1 } },
  { id: "hq-studio", kind: "hq", name: "Studio de production", description: "Les premiers bureaux.", unlock: { type: "rank", rank: 2 } },
  { id: "hq-lab", kind: "hq", name: "Laboratoire R&D", description: "Innovation et produits SaaS.", unlock: { type: "rank", rank: 3 } },
  { id: "hq-tower", kind: "hq", name: "Tour administrative", description: "Finance, RH et pilotage.", unlock: { type: "rank", rank: 4 } },
  { id: "hq-datacenter", kind: "hq", name: "Datacenter", description: "Infrastructure cloud maîtrisée.", unlock: { type: "rank", rank: 5 } },
  { id: "hq-campus", kind: "hq", name: "Campus", description: "Un lieu reconnu de l'écosystème.", unlock: { type: "rank", rank: 6 } },
  { id: "hq-skyline", kind: "hq", name: "Siège du groupe", description: "La skyline du groupe numérique.", unlock: { type: "rank", rank: 7 } },
];

export const ALL_REWARDS: RewardDefinition[] = [...TITLES, ...THEMES, ...FRAMES, ...HQ_BUILDINGS];

export function isRewardUnlocked(reward: RewardDefinition, ctx: { level: number; rank: number; achievements: Set<string> }): boolean {
  switch (reward.unlock.type) {
    case "level":
      return ctx.level >= reward.unlock.level;
    case "rank":
      return ctx.rank >= reward.unlock.rank;
    case "achievement":
      return ctx.achievements.has(reward.unlock.id);
  }
}

export function unlockLabel(unlock: RewardUnlock, achievementName?: (id: string) => string): string {
  switch (unlock.type) {
    case "level":
      return `Niveau ${unlock.level}`;
    case "rank":
      return `Rang ${unlock.rank}`;
    case "achievement":
      return `Succès « ${achievementName?.(unlock.id) ?? unlock.id} »`;
  }
}

export function themeColor(themeId: string): string {
  return THEMES.find((t) => t.id === themeId)?.color ?? "#E81A3B";
}
