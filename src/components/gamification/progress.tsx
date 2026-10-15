"use client";
import * as React from "react";
import Link from "next/link";
import { Lock, Sparkles, Swords } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatInt, formatDate, formatDueIn } from "@/lib/formatters";
import type { AchievementDefinition } from "@/lib/gamification/achievements";
import { RARITY_LABELS } from "@/lib/gamification/achievements";
import { ACHIEVEMENT_ICONS } from "./icons";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/misc";
import type { Mission } from "@/lib/domain/types";
import { MISSION_CATEGORY_LABELS, MISSION_DIFFICULTY_LABELS, missionStatus } from "@/lib/gamification/missions";
import { MISSION_STATUS, PRIORITY } from "@/lib/formatters/labels";

export function XPProgressBar({ into, needed, className, label = "Progression vers le niveau suivant" }: { into: number; needed: number; className?: string; label?: string }) {
  const pct = needed > 0 ? (into / needed) * 100 : 100;
  return (
    <div className={cn("space-y-1", className)}>
      <div className="h-2 w-full overflow-hidden rounded-full bg-interactive" role="progressbar" aria-label={label} aria-valuenow={into} aria-valuemin={0} aria-valuemax={needed}>
        <div className="h-full rounded-full bg-gradient-to-r from-violet to-accent transition-[width] duration-1000 ease-out" style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <div className="flex justify-between text-[11px] tabular text-muted">
        <span>{formatInt(into)} XP</span>
        <span>{formatInt(needed)} XP</span>
      </div>
    </div>
  );
}

export function LevelBadge({ level, size = "md", frameColor }: { level: number; size?: "sm" | "md" | "lg"; frameColor?: string }) {
  const dims = { sm: "size-8 text-xs", md: "size-12 text-base", lg: "size-16 text-xl" }[size];
  return (
    <div className={cn("relative grid shrink-0 place-items-center rounded-xl border-2 bg-gradient-to-br from-violet/25 to-accent/10 font-bold tabular text-fg", dims)} style={{ borderColor: frameColor ?? "color-mix(in srgb, var(--violet) 60%, transparent)" }} aria-label={`Niveau ${level}`}>
      {level}
      <span className="absolute -bottom-1.5 rounded bg-bg px-1 text-[8px] font-semibold uppercase tracking-wider text-violet">niv.</span>
    </div>
  );
}

const RARITY_STYLE = {
  common: "border-border text-muted",
  rare: "border-action/40 text-action",
  epic: "border-violet/50 text-violet",
  legendary: "border-gold/60 text-gold",
} as const;

export function AchievementCard({ def, unlockedAt, progress }: { def: AchievementDefinition; unlockedAt?: string; progress?: { current: number; target: number } }) {
  const Icon = ACHIEVEMENT_ICONS[def.icon] ?? Sparkles;
  const unlocked = Boolean(unlockedAt);
  return (
    <div className={cn("flex gap-3 rounded-xl border bg-card p-3.5 transition-colors", unlocked ? RARITY_STYLE[def.rarity] : "border-border opacity-80")}>
      <div className={cn("grid size-11 shrink-0 place-items-center rounded-lg border", unlocked ? cn(RARITY_STYLE[def.rarity], "bg-interactive animate-pop") : "border-border bg-bg-elevated text-subtle")}>{unlocked ? <Icon className="size-5" /> : <Lock className="size-4" />}</div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className={cn("text-sm font-medium", unlocked ? "text-fg" : "text-muted")}>{def.name}</p>
          <Badge tone={def.rarity === "legendary" ? "gold" : def.rarity === "epic" ? "violet" : def.rarity === "rare" ? "info" : "neutral"}>{RARITY_LABELS[def.rarity]}</Badge>
        </div>
        <p className="mt-0.5 text-xs text-muted">{def.condition}</p>
        {unlocked ? (
          <p className="mt-1 text-[11px] text-subtle">Obtenu le {formatDate(unlockedAt)}</p>
        ) : progress ? (
          <div className="mt-2 space-y-1">
            <ProgressBar value={(progress.current / progress.target) * 100} tone="violet" label={`Progression ${def.name}`} />
            <p className="text-[11px] tabular text-subtle">
              {formatInt(Math.min(progress.current, progress.target))} / {formatInt(progress.target)}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function MissionCard({ mission, today, action, compact }: { mission: Mission; today: string; action?: React.ReactNode; compact?: boolean }) {
  const status = missionStatus(mission, today);
  return (
    <div className={cn("flex flex-col gap-2 rounded-xl border bg-card p-3.5 animate-rise", status === "overdue" ? "border-danger/40" : status === "done" ? "border-success/30" : "border-border")}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2.5">
          <div className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg", status === "done" ? "bg-success/15 text-success" : "bg-violet/15 text-violet")}>
            <Swords className="size-3.5" />
          </div>
          <div className="min-w-0">
            <Link href={`/missions?focus=${mission.id}`} className="line-clamp-2 text-sm font-medium text-fg hover:underline">
              {mission.title}
            </Link>
            {!compact ? <p className="mt-0.5 line-clamp-2 text-xs text-muted">{mission.description}</p> : null}
          </div>
        </div>
        <span className="shrink-0 rounded-md bg-gold/10 px-1.5 py-0.5 text-[11px] font-semibold tabular text-gold">+{mission.xpReward} XP</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={MISSION_STATUS[status].tone}>{MISSION_STATUS[status].label}</Badge>
        <Badge tone={PRIORITY[mission.priority].tone}>{PRIORITY[mission.priority].label}</Badge>
        <Badge>{MISSION_DIFFICULTY_LABELS[mission.difficulty]}</Badge>
        {!compact ? <Badge>{MISSION_CATEGORY_LABELS[mission.category]}</Badge> : null}
        <span className="ml-auto text-[11px] text-subtle">Échéance {formatDueIn(mission.dueDate, today)}</span>
      </div>
      {action ? <div className="flex flex-wrap gap-2 pt-1">{action}</div> : null}
    </div>
  );
}
