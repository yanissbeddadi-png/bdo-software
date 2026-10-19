/**
 * Courbe d'expérience du responsable CRM.
 *
 * XP requise pour passer du niveau N au niveau N+1 = 100 + 25 × (N − 1).
 * Le niveau n'est jamais stocké : il est toujours recalculé depuis l'XP totale.
 */

export const MAX_LEVEL = 100;

export function xpRequiredForNext(level: number): number {
  return 100 + 25 * (level - 1);
}

/** XP totale nécessaire pour atteindre `level` depuis le niveau 1. */
export function totalXpForLevel(level: number): number {
  // Σ_{k=1}^{level-1} (100 + 25(k−1)) = 100(L−1) + 25(L−1)(L−2)/2
  const n = level - 1;
  return 100 * n + (25 * n * (n - 1)) / 2;
}

export interface LevelInfo {
  level: number;
  totalXp: number;
  xpIntoLevel: number;
  xpForNext: number;
  /** Progression (0–1) vers le niveau suivant. */
  progress: number;
  isMax: boolean;
}

export function levelFromXp(totalXp: number): LevelInfo {
  const xp = Math.max(0, Math.floor(totalXp));
  let level = 1;
  while (level < MAX_LEVEL && totalXpForLevel(level + 1) <= xp) level++;
  const isMax = level >= MAX_LEVEL;
  const xpForNext = isMax ? 0 : xpRequiredForNext(level);
  const xpIntoLevel = xp - totalXpForLevel(level);
  return { level, totalXp: xp, xpIntoLevel, xpForNext, progress: isMax ? 1 : xpIntoLevel / xpForNext, isMax };
}

/** Titres ludiques du responsable CRM (sans valeur hiérarchique). */
export const LEVEL_TITLES: { level: number; title: string }[] = [
  { level: 1, title: "Débutant" },
  { level: 5, title: "Prospecteur" },
  { level: 10, title: "Négociateur" },
  { level: 20, title: "Gestionnaire de comptes" },
  { level: 35, title: "Expert relation client" },
  { level: 50, title: "Stratège commercial" },
  { level: 75, title: "Maître du CRM" },
];

export function titleForLevel(level: number): string {
  return [...LEVEL_TITLES].reverse().find((t) => level >= t.level)!.title;
}

export function nextTitle(level: number): { level: number; title: string } | null {
  return LEVEL_TITLES.find((t) => t.level > level) ?? null;
}
