"use client";
import * as React from "react";
import Link from "next/link";
import { Box, Check, CheckCircle2, Circle, Crown, Flame, Lock, Paintbrush, ScrollText, Sparkles, Swords, Trophy } from "lucide-react";
import { useCommand, useData, useToday } from "@/lib/store/hooks";
import { useParam, useSyncedState } from "@/lib/store/params";
import { useProgression } from "@/lib/store/progression";
import { equipReward } from "@/lib/domain/commands";
import { ACHIEVEMENTS, getAchievement, RARITY_LABELS } from "@/lib/gamification/achievements";
import { LEVEL_TITLES, totalXpForLevel } from "@/lib/gamification/levels";
import { evaluateCriteria, RANKS } from "@/lib/gamification/ranks";
import { FRAMES, THEMES, TITLES, isRewardUnlocked, unlockLabel, type RewardDefinition } from "@/lib/gamification/rewards";
import { recommendedMissions } from "@/lib/gamification/missions";
import { lastMonthKeys } from "@/lib/calculations/dates";
import { PageHeader, SectionTitle } from "@/components/shared/page-header";
import { MetricCard } from "@/components/shared/metric-card";
import { AchievementCard, LevelBadge, MissionCard, XPProgressBar } from "@/components/gamification/progress";
import { MissionActions } from "@/components/gamification/mission-actions";
import { ChartCard, MonthlyLineChart, SERIES } from "@/components/charts/charts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/misc";
import { formatDateTime, formatInt, formatXp } from "@/lib/formatters";
import { Headquarters } from "./headquarters";
import { ChallengesPanel } from "./challenges";
import { activeDays, computeStreak } from "@/lib/crm/streak";
import { cn } from "@/lib/utils";
import { evaluateGoal } from "@/lib/calculations/goals";
import { GOAL_STATUS } from "@/lib/formatters/labels";

export function ProgressionPage() {
  const data = useData();
  const today = useToday();
  const p = useProgression();
  const run = useCommand();
  const tabParam = useParam("tab");
  const [tab, setTab] = useSyncedState(tabParam ?? "apercu");
  const g = data.settings.gamification;
  const streak = React.useMemo(() => computeStreak(activeDays(data), today, data.settings.crm.workingDays), [data, today]);

  if (!g.enabled)
    return (
      <div>
        <PageHeader title="Progression" description="La gamification est désactivée dans les paramètres. Les fonctions de gestion restent intégralement disponibles." />
        <Button asChild>
          <Link href="/parametres?tab=gamification">Réactiver la gamification</Link>
        </Button>
      </div>
    );

  const unlockedAt = new Map(data.achievements.map((a) => [a.achievementId, a.unlockedAt]));
  const ctx = { pipelineThreshold: g.pipelineAchievementThreshold, rank: p.rank.rank };
  const journal = [
    ...data.xpTransactions.map((x) => ({ id: x.id, at: x.at, kind: "xp" as const, message: x.reason, amount: x.amount })),
    ...data.progression.map((e) => ({ id: e.id, at: e.at, kind: e.kind, message: e.message, amount: undefined as number | undefined })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const months = lastMonthKeys(today, 12);
  const xpSeries = months.map((m) => ({ month: m, xp: data.xpTransactions.filter((x) => x.at.slice(0, 7) <= m).reduce((s, x) => s + x.amount, 0) }));
  const weekly = data.missions.filter((m) => m.type === "weekly" && (m.status === "todo" || m.status === "in_progress"));
  const strategic = data.goals.filter((goal) => !goal.archived).map((goal) => evaluateGoal(goal, data, today));
  const kindLabel: Record<string, string> = { xp: "XP", level_up: "Niveau", mission: "Défi", achievement: "Succès", rank: "Rang", reward: "Récompense" };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Progression"
        description="Dimension ludique du CRM : l'XP récompense des actions commerciales réellement réalisées (qualification, suivi, rendez-vous, conversion), une seule fois. L'XP n'a aucune valeur monétaire ; aucune fonction de gestion n'est bloquée par le niveau."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,color-mix(in_srgb,var(--violet)_16%,transparent),transparent_60%)]" aria-hidden />
          <CardContent className="relative flex items-center gap-5 pt-5">
            <LevelBadge level={p.level.level} size="lg" frameColor={p.frameColor} />
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-xs uppercase tracking-wide text-violet">Niveau commercial</p>
              <p className="text-xl font-semibold">
                Niveau {p.level.level} · {p.title}
              </p>
              <XPProgressBar into={p.level.xpIntoLevel} needed={p.level.xpForNext} />
              <p className="text-xs text-muted">
                {formatXp(p.xp)} au total · niveau {p.level.level + 1} à {formatInt(totalXpForLevel(p.level.level + 1))} XP
                {p.nextTitle ? ` · titre « ${p.nextTitle.title} » au niveau ${p.nextTitle.level}` : ""}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden">
          <CardContent className="space-y-2 pt-5">
            <p className="text-xs uppercase tracking-wide text-gold">Rang de l&apos;entreprise</p>
            <p className="text-xl font-semibold">
              Rang {p.rank.rank} · {p.rank.name}
            </p>
            {p.rank.next ? (
              <>
                <ProgressBar value={p.rank.progress * 100} tone="gold" className="h-2" label="Progression du rang" />
                <p className="text-xs text-muted">
                  Prochain rang : <span className="text-fg">{p.rank.next.name}</span> — {p.rank.next.metCount}/{p.rank.next.criteria.length} critères remplis
                </p>
                <ul className="grid gap-1 text-xs sm:grid-cols-2">
                  {p.rank.next.criteria.map((c) => (
                    <li key={c.id} className={cn("flex items-center gap-1.5", c.met ? "text-success" : "text-muted")}>
                      {c.met ? <CheckCircle2 className="size-3.5" /> : <Circle className="size-3.5" />}
                      {c.label} : <span className="tabular text-fg">{c.display(c.current)}</span> / {c.display(c.target)}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-sm text-gold">Rang maximal atteint.</p>
            )}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardContent className="flex flex-col gap-4 pt-5 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <span className={cn("flex size-12 items-center justify-center rounded-full", streak.current ? "bg-warning/15 text-warning" : "bg-interactive text-subtle")}>
              <Flame className="size-6" aria-hidden />
            </span>
            <div>
              <p className="text-xs uppercase tracking-wide text-warning">Série de suivi</p>
              <p className="text-xl font-semibold tabular">
                {streak.current} jour{streak.current > 1 ? "s" : ""} ouvré{streak.current > 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <div className="flex-1 text-xs text-muted">
            <p>
              Meilleure série : <span className="tabular text-fg">{streak.best} j</span> · Semaines de suivi rigoureux : <span className="tabular text-fg">{p.metrics.rigorousWeeks}</span>
            </p>
            <p className="mt-1">
              {streak.activeToday
                ? "Série entretenue aujourd'hui."
                : "Aujourd'hui ne compte pas encore : consignez une interaction ou terminez une mission. Une journée non ouvrée n'interrompt jamais la série."}
            </p>
            <p className="mt-1 text-subtle">Paliers : 3, 7, 14 et 30 jours. Ouvrir l&apos;application ne compte pas ; seules les actions CRM réelles comptent.</p>
          </div>
        </CardContent>
      </Card>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="XP totale" value={formatXp(p.xp)} tone="gold" />
        <MetricCard label="Succès obtenus" value={`${p.achievementsCount} / ${p.achievementsTotal}`} />
        <MetricCard label="Défis relevés" value={p.missionsDone} />
        <MetricCard label="Récompenses débloquées" value={[...TITLES, ...THEMES, ...FRAMES].filter((r) => isRewardUnlocked(r, p.rewardCtx)).length} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="apercu">
            <Sparkles /> Aperçu
          </TabsTrigger>
          <TabsTrigger value="defis">
            <Swords /> Défis
          </TabsTrigger>
          <TabsTrigger value="succes">
            <Trophy /> Succès
          </TabsTrigger>
          <TabsTrigger value="recompenses">
            <Paintbrush /> Récompenses
          </TabsTrigger>
          <TabsTrigger value="rangs">
            <Crown /> Rangs
          </TabsTrigger>
          <TabsTrigger value="journal">
            <ScrollText /> Journal
          </TabsTrigger>
        </TabsList>

        <TabsContent value="apercu" className="space-y-6">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Siège virtuel de BDO Software</CardTitle>
                <CardDescription>Le quartier se développe à chaque nouveau rang d&apos;entreprise.</CardDescription>
              </div>
              <Button asChild size="sm" variant="secondary">
                <Link href="/bureaux">
                  <Box /> Bureaux 3D
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              <Headquarters rank={p.rank.rank} />
            </CardContent>
          </Card>
          <div className="grid gap-4 xl:grid-cols-2">
            <ChartCard title="Historique d'XP" description="XP cumulée en fin de mois">
              <MonthlyLineChart money={false} area data={xpSeries} series={[{ key: "xp", label: "XP cumulée", color: SERIES[6] }]} />
            </ChartCard>
            <section>
              <SectionTitle title="Défis hebdomadaires" description="Défis de la semaine en cours" />
              <div className="space-y-2.5">
                {weekly.length ? (
                  weekly.map((m) => <MissionCard key={m.id} mission={m} today={today} compact action={<MissionActions mission={m} />} />)
                ) : (
                  <p className="text-sm text-muted">Tous les défis de la semaine sont relevés.</p>
                )}
              </div>
            </section>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <section>
              <SectionTitle
                title="Défis actifs"
                actions={
                  <button type="button" onClick={() => setTab("defis")} className="cursor-pointer text-xs text-accent hover:underline">
                    Tous les défis →
                  </button>
                }
              />
              <div className="space-y-2.5">
                {recommendedMissions(data.missions, today, 3).map((m) => (
                  <MissionCard key={m.id} mission={m} today={today} compact action={<MissionActions mission={m} />} />
                ))}
              </div>
            </section>
            <section>
              <SectionTitle
                title="Objectifs stratégiques"
                actions={
                  <Link href="/objectifs" className="text-xs text-accent hover:underline">
                    Objectifs →
                  </Link>
                }
              />
              <Card>
                <CardContent className="space-y-3 pt-4">
                  {strategic.map((e) => (
                    <div key={e.goal.id}>
                      <div className="mb-1 flex justify-between gap-2 text-xs">
                        <span className="truncate">{e.goal.title}</span>
                        <Badge tone={GOAL_STATUS[e.status].tone}>{Math.round(e.progress)} %</Badge>
                      </div>
                      <ProgressBar value={e.progress} tone={e.status === "achieved" ? "gold" : "accent"} label={e.goal.title} />
                    </div>
                  ))}
                </CardContent>
              </Card>
            </section>
          </div>
        </TabsContent>

        <TabsContent value="defis" className="space-y-6">
          <ChallengesPanel />
        </TabsContent>

        <TabsContent value="succes" className="space-y-6">
          <section>
            <SectionTitle title={`Succès obtenus (${p.achievementsCount})`} />
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {ACHIEVEMENTS.filter((a) => unlockedAt.has(a.id)).map((a) => (
                <AchievementCard key={a.id} def={a} unlockedAt={unlockedAt.get(a.id)} />
              ))}
            </div>
          </section>
          <section>
            <SectionTitle
              title={`Succès verrouillés (${ACHIEVEMENTS.length - p.achievementsCount})`}
              description="La condition de chaque succès est affichée ; la rareté est une distinction ludique, pas une mesure comptable."
            />
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {ACHIEVEMENTS.filter((a) => !unlockedAt.has(a.id)).map((a) => (
                <AchievementCard key={a.id} def={a} progress={a.progress?.(p.metrics, ctx)} />
              ))}
            </div>
          </section>
        </TabsContent>

        <TabsContent value="recompenses" className="space-y-6">
          <p className="text-xs text-muted">
            Récompenses purement cosmétiques : titres, thèmes d&apos;accent et cadres de profil. Les informations financières et les fonctions de gestion ne sont jamais verrouillées.
          </p>
          <RewardGroup title="Titres" kind="title" rewards={TITLES} equipped={g.equippedTitle} ctx={p.rewardCtx} onEquip={(id) => run(equipReward, { rewardId: id, kind: "title" })} />
          <RewardGroup title="Thèmes d'interface" kind="theme" rewards={THEMES} equipped={g.equippedTheme} ctx={p.rewardCtx} onEquip={(id) => run(equipReward, { rewardId: id, kind: "theme" })} />
          <RewardGroup title="Cadres de profil" kind="frame" rewards={FRAMES} equipped={g.equippedFrame} ctx={p.rewardCtx} onEquip={(id) => run(equipReward, { rewardId: id, kind: "frame" })} />
        </TabsContent>

        <TabsContent value="rangs" className="space-y-3">
          {RANKS.map((r) => {
            const crit = evaluateCriteria(r, p.metrics);
            const reached = r.rank <= p.rank.rank;
            return (
              <Card key={r.rank} className={cn(r.rank === p.rank.rank && "border-gold/50")}>
                <CardContent className="flex flex-col gap-3 pt-4 md:flex-row md:items-center">
                  <div className={cn("grid size-10 shrink-0 place-items-center rounded-lg text-sm font-bold", reached ? "bg-gold/15 text-gold" : "bg-interactive text-subtle")}>{r.rank}</div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {r.name} {r.rank === p.rank.rank ? <Badge tone="gold">Rang actuel</Badge> : null}
                    </p>
                    <p className="text-xs text-muted">{r.description}</p>
                  </div>
                  <ul className="flex flex-wrap gap-1.5 md:max-w-[60%] md:justify-end">
                    {crit.length ? (
                      crit.map((c) => (
                        <li key={c.id}>
                          <Badge tone={c.met ? "success" : "neutral"}>
                            {c.met ? <Check /> : <Lock />} {c.label} ≥ {c.display(c.target)}
                          </Badge>
                        </li>
                      ))
                    ) : (
                      <li className="text-xs text-muted">Rang de départ</li>
                    )}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
          <p className="text-[11px] text-subtle">
            Un rang combine plusieurs critères (clients, revenus récurrents, livraisons, rentabilité, satisfaction, objectifs, trésorerie) ; il ne dépend jamais du seul chiffre d&apos;affaires.
          </p>
        </TabsContent>

        <TabsContent value="journal">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Journal de progression</CardTitle>
                <CardDescription>Chaque gain d&apos;XP est daté de l&apos;événement d&apos;origine et protégé par une clé d&apos;idempotence.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border/60">
                {journal.slice(0, 150).map((j) => (
                  <li key={j.id} className="flex items-center gap-3 py-2 text-sm">
                    <span className="w-32 shrink-0 text-[11px] tabular text-subtle">{formatDateTime(j.at)}</span>
                    <Badge tone={j.kind === "xp" ? "violet" : j.kind === "achievement" || j.kind === "level_up" || j.kind === "rank" ? "gold" : "info"}>{kindLabel[j.kind]}</Badge>
                    <span className="min-w-0 flex-1 truncate">{j.message}</span>
                    {j.amount ? <span className="shrink-0 text-xs font-semibold tabular text-gold">+{j.amount} XP</span> : null}
                  </li>
                ))}
                {!journal.length ? <li className="py-6 text-center text-sm text-muted">Aucun événement de progression.</li> : null}
              </ul>
            </CardContent>
          </Card>
          <p className="mt-2 text-[11px] text-subtle">
            Titres de niveau : {LEVEL_TITLES.map((t) => `${t.level} ${t.title}`).join(" · ")}. Rareté des succès : {Object.values(RARITY_LABELS).join(", ")}.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function RewardGroup({
  title,
  rewards,
  equipped,
  ctx,
  onEquip,
  kind,
}: {
  title: string;
  kind: "title" | "theme" | "frame";
  rewards: RewardDefinition[];
  equipped: string | null;
  ctx: { level: number; rank: number; achievements: Set<string> };
  onEquip: (id: string | null) => void;
}) {
  return (
    <section>
      <SectionTitle title={title} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {rewards.map((r) => {
          const unlocked = isRewardUnlocked(r, ctx);
          const isOn = equipped === r.id;
          return (
            <Card key={r.id} className={cn(isOn && "border-accent", !unlocked && "opacity-70")}>
              <CardContent className="flex items-center gap-3 pt-4">
                {r.color ? (
                  <span
                    className={cn("size-8 shrink-0", kind === "frame" ? "rounded-lg border-2 bg-transparent" : "rounded-full")}
                    style={kind === "frame" ? { borderColor: r.color } : { background: r.color }}
                    aria-hidden
                  />
                ) : (
                  <Crown className={cn("size-6 shrink-0", unlocked ? "text-gold" : "text-subtle")} />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.name}</p>
                  <p className="text-[11px] text-muted">{unlocked ? r.description : `Débloqué par : ${unlockLabel(r.unlock, (id) => getAchievement(id)?.name ?? id)}`}</p>
                </div>
                {unlocked ? (
                  <Button size="sm" variant={isOn ? "primary" : "secondary"} onClick={() => onEquip(isOn && kind !== "theme" ? null : r.id)} aria-pressed={isOn}>
                    {isOn ? "Équipé" : "Équiper"}
                  </Button>
                ) : (
                  <Lock className="size-4 text-subtle" />
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
