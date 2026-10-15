"use client";
import { toast } from "sonner";
import { Sparkles, Trophy, ArrowUpCircle, Building2 } from "lucide-react";
import type { GamificationSettings } from "@/lib/domain/types";
import type { ReconcileResult } from "@/lib/gamification/engine";
import { getAchievement, RARITY_LABELS } from "@/lib/gamification/achievements";
import { titleForLevel } from "@/lib/gamification/levels";
import { rankName } from "@/lib/gamification/ranks";

/** Toasts de progression : XP, succès, niveau, rang. Purement informatifs. */
export function announceRewards(res: Pick<ReconcileResult, "awarded" | "unlockedAchievements" | "levelUps" | "rankUp">, settings: GamificationSettings) {
  if (!settings.enabled) return;
  const xp = res.awarded.reduce((s, x) => s + x.amount, 0);
  if (xp > 0) {
    const reasons = res.awarded.filter((x) => x.source !== "achievement").map((x) => x.reason);
    toast(`+${xp} XP`, {
      description: reasons.slice(0, 2).join(" · ") || "Progression",
      icon: <Sparkles className="size-4 text-violet" />,
      className: "xp-toast",
    });
  }
  for (const id of res.unlockedAchievements) {
    const def = getAchievement(id);
    if (!def) continue;
    toast(`Succès débloqué : ${def.name}`, {
      description: `${RARITY_LABELS[def.rarity]} — ${def.description}`,
      icon: <Trophy className="size-4 text-gold animate-pop" />,
      duration: 6000,
    });
  }
  const level = res.levelUps.at(-1);
  if (level) {
    toast(`Niveau ${level} atteint`, { description: `Titre : ${titleForLevel(level)}`, icon: <ArrowUpCircle className="size-4 text-gold animate-pop" />, duration: 6000 });
  }
  if (res.rankUp) {
    toast(`Nouveau rang : ${rankName(res.rankUp)}`, { description: "BDO Software franchit une nouvelle étape.", icon: <Building2 className="size-4 text-gold animate-pop" />, duration: 7000 });
  }
}
