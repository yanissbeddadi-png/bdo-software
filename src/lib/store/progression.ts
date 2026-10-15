"use client";
import { useMemo } from "react";
import { useData, useSummaries, useToday } from "./hooks";
import { levelFromXp, nextTitle, titleForLevel } from "@/lib/gamification/levels";
import { computeGameMetrics } from "@/lib/gamification/metrics";
import { computeRank } from "@/lib/gamification/ranks";
import { ACHIEVEMENTS } from "@/lib/gamification/achievements";
import { ALL_REWARDS, isRewardUnlocked, themeColor, FRAMES } from "@/lib/gamification/rewards";
import { totalXp } from "@/lib/gamification/engine";

/** État de progression dérivé (niveau, rang, succès, récompenses). */
export function useProgression() {
  const data = useData();
  const today = useToday();
  const summaries = useSummaries();
  return useMemo(() => {
    const xp = totalXp(data);
    const level = levelFromXp(xp);
    const metrics = computeGameMetrics(data, today, summaries);
    const rank = computeRank(metrics);
    const unlocked = new Set(data.achievements.map((a) => a.achievementId));
    const g = data.settings.gamification;
    const rewardCtx = { level: level.level, rank: rank.rank, achievements: unlocked };
    const nextReward = ALL_REWARDS.filter((r) => !isRewardUnlocked(r, rewardCtx) && r.unlock.type === "level").sort((a, b) =>
      a.unlock.type === "level" && b.unlock.type === "level" ? a.unlock.level - b.unlock.level : 0,
    )[0];
    return {
      xp,
      level,
      title: g.equippedTitle ? (ALL_REWARDS.find((r) => r.id === g.equippedTitle)?.name ?? titleForLevel(level.level)) : titleForLevel(level.level),
      nextTitle: nextTitle(level.level),
      metrics,
      rank,
      unlocked,
      achievementsCount: unlocked.size,
      achievementsTotal: ACHIEVEMENTS.length,
      missionsDone: data.missions.filter((m) => m.status === "done").length,
      nextReward,
      rewardCtx,
      accent: themeColor(g.equippedTheme),
      frameColor: g.equippedFrame ? FRAMES.find((f) => f.id === g.equippedFrame)?.color : undefined,
    };
  }, [data, today, summaries]);
}
