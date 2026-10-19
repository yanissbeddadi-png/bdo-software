"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowRight, BellRing, CalendarClock, CircleAlert, Flame, Gauge, ListChecks, ListPlus, Send, Sparkles, Target, Trophy, UserPlus, Users } from "lucide-react";
import { useData, useToday } from "@/lib/store/hooks";
import { useCrm } from "@/lib/store/crm";
import { useProgression } from "@/lib/store/progression";
import { useUiStore } from "@/lib/store/ui-store";
import { addDays, monthPeriod, inPeriod, monthKey } from "@/lib/calculations/dates";
import { STAGES, isOpen } from "@/lib/calculations/pipeline";
import { evaluateGoal, GOAL_METRICS } from "@/lib/calculations/goals";
import { buildActionCenter, ACTION_KIND, type ActionItem, type ActionKind } from "@/lib/crm/action-center";
import { isMissionOpen } from "@/lib/crm/views";
import { activeDays, computeStreak } from "@/lib/crm/streak";
import { MetricCard } from "@/components/shared/metric-card";
import { SectionTitle } from "@/components/shared/page-header";
import { Avatar, DueLabel, PriorityBadge, QuickActions } from "@/components/crm/crm-ui";
import { Timeline } from "@/components/crm/timeline";
import { LevelBadge, XPProgressBar } from "@/components/gamification/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/misc";
import { formatDateLong, formatDueIn, formatEUR, formatInt, formatXp } from "@/lib/formatters";
import { cn } from "@/lib/utils";

const KIND_TONE: Record<ActionKind, "danger" | "warning" | "gold" | "violet" | "info" | "neutral"> = {
  overdue: "danger",
  today: "warning",
  priority: "gold",
  proposal: "violet",
  new_prospect: "info",
  inactive: "neutral",
};

/** Vue d'ensemble : centre de commande commercial (indicateurs, actions du jour, pipeline, activité). */
export function CrmDashboard() {
  const data = useData();
  const today = useToday();
  const crm = useCrm();
  const p = useProgression();
  const openCreate = useUiStore((s) => s.openCreate);
  const [kind, setKind] = React.useState<ActionKind | "all">("all");
  const [expanded, setExpanded] = React.useState(false);

  const actions = React.useMemo(() => buildActionCenter(data, crm, today), [data, crm, today]);
  const streak = React.useMemo(() => computeStreak(activeDays(data), today, data.settings.crm.workingDays), [data, today]);
  const missions = data.tasks.filter((t) => t.type !== "internal" && isMissionOpen(t));
  const overdue = missions.filter((t) => t.dueDate && t.dueDate < today);
  const todayMissions = missions.filter((t) => t.dueDate === today);
  const meetings = missions.filter((t) => t.type === "meeting" && t.dueDate && t.dueDate >= today && t.dueDate <= addDays(today, 7));
  const newProspects = crm.contacts.filter((c) => c.isNew);
  const openDeals = crm.deals.filter((d) => isOpen(d.opportunity));
  const proposals = openDeals.filter((d) => d.opportunity.stage === "proposal");
  const noNext = openDeals.filter((d) => !d.nextMission);
  const month = monthPeriod(monthKey(today));
  const wonMonth = data.opportunities.filter((o) => o.stage === "won" && inPeriod(o.closedAt, month));
  const goal = data.goals
    .filter((g) => !g.archived)
    .map((g) => evaluateGoal(g, data, today))
    .filter((e) => e.status !== "achieved")
    .sort((a, b) => b.progress - a.progress)[0];

  const shown = actions.filter((a) => kind === "all" || a.kind === kind);
  const visible = expanded ? shown : shown.slice(0, 8);
  const kinds = (Object.keys(ACTION_KIND) as ActionKind[]).filter((k) => actions.some((a) => a.kind === k));
  const recent = data.salesActivities
    .filter((a) => a.done)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 7);

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-fg md:text-[28px]">Bonjour, voici votre centre de commande commercial.</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span className="capitalize">{formatDateLong(today)}</span>
            {data.settings.gamification.enabled ? (
              <>
                <span aria-hidden>·</span>
                <Link href="/progression" className="hover:text-fg">
                  Niveau {p.level.level} · {p.title} · {formatXp(p.xp)}
                </Link>
              </>
            ) : null}
            {goal ? (
              <>
                <span aria-hidden>·</span>
                <Link href="/objectifs" className="inline-flex items-center gap-1 hover:text-fg">
                  <Target className="size-3.5" /> Objectif en cours : {goal.goal.title} ({Math.round(goal.progress)} %)
                </Link>
              </>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => openCreate("prospect")}>
            <UserPlus /> Nouveau prospect
          </Button>
          <Button variant="secondary" onClick={() => openCreate("action", { type: "call" })}>
            <ListPlus /> Nouvelle mission
          </Button>
          <Button variant="secondary" onClick={() => openCreate("action", { type: "followup" })}>
            <BellRing /> Planifier un rappel
          </Button>
        </div>
      </header>

      <section aria-label="Indicateurs clés" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard
          label="Relances en retard"
          value={overdue.length}
          tone={overdue.length ? "danger" : "success"}
          icon={<CircleAlert />}
          href="/missions?view=overdue"
          hint="Missions CRM ouvertes dont l'échéance est dépassée."
        />
        <MetricCard label="Missions du jour" value={todayMissions.length} icon={<ListChecks />} href="/missions?view=today" hint="Missions CRM ouvertes à échéance aujourd'hui." />
        <MetricCard
          label="Nouveaux prospects à traiter"
          value={newProspects.length}
          icon={<Users />}
          href="/contacts?new=1"
          hint={`Prospects créés depuis moins de ${data.settings.crm.newProspectDays} jours, sans interaction consignée.`}
        />
        <MetricCard label="Rendez-vous (7 j)" value={meetings.length} icon={<CalendarClock />} href="/calendrier" hint="Missions de type rendez-vous planifiées dans les 7 prochains jours." />
        <MetricCard label="Propositions en attente" value={proposals.length} icon={<Send />} href="/pipeline?view=proposals" hint="Opportunités actives à l'étape « Proposition envoyée »." />
        <MetricCard label="Sans prochaine action" value={noNext.length} icon={<Gauge />} href="/pipeline?view=no_next" hint="Opportunités actives sans mission ouverte." />
        <MetricCard
          label="Valeur du pipeline"
          value={formatEUR(
            openDeals.reduce((s, d) => s + d.opportunity.amount, 0),
            { round: true, compact: true },
          )}
          href="/pipeline"
          hint="Somme des montants estimés des opportunités actives (non pondérée)."
        />
        <MetricCard
          label="Conversions du mois"
          value={wonMonth.length}
          tone="success"
          icon={<Trophy />}
          href="/statistiques"
          hint="Opportunités gagnées ce mois-ci."
          footer={
            <span className="text-[11px] text-muted">
              {formatEUR(
                wonMonth.reduce((s, o) => s + o.amount, 0),
                { round: true },
              )}
            </span>
          }
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <section aria-label="Centre d'action du jour">
          <SectionTitle title="Centre d'action du jour" description="Trié par urgence, échéance puis priorité. Chaque élément indique pourquoi il apparaît." />
          <div className="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Filtrer les actions">
            {(["all", ...kinds] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={kind === k}
                onClick={() => setKind(k)}
                className={cn("cursor-pointer rounded-full border px-2.5 py-0.5 text-xs", kind === k ? "border-accent bg-accent/15 text-fg" : "border-border text-muted hover:text-fg")}
              >
                {k === "all" ? "Tout" : ACTION_KIND[k].label} <span className="tabular text-subtle">{k === "all" ? actions.length : actions.filter((a) => a.kind === k).length}</span>
              </button>
            ))}
          </div>
          {visible.length ? (
            <ol className="space-y-2">
              {visible.map((a) => (
                <ActionRow key={a.key} item={a} today={today} />
              ))}
            </ol>
          ) : (
            <Card>
              <CardContent className="flex items-center gap-3 pt-5 text-sm text-muted">
                <Sparkles className="size-5 text-success" /> Aucune action en attente : tous les suivis sont à jour.
              </CardContent>
            </Card>
          )}
          {shown.length > 8 ? (
            <Button variant="link" size="sm" className="mt-2" onClick={() => setExpanded((e) => !e)}>
              {expanded ? "Réduire" : `Afficher les ${shown.length - 8} autres actions`}
            </Button>
          ) : null}
        </section>

        <div className="space-y-6">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Pipeline</CardTitle>
              <Link href="/pipeline" className="text-xs text-accent hover:underline">
                Ouvrir le Kanban →
              </Link>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {STAGES.map((s) => {
                const list = crm.deals.filter((d) => d.opportunity.stage === s.id && !d.opportunity.archivedAt);
                const value = list.reduce((sum, d) => sum + d.opportunity.amount, 0);
                const max = Math.max(1, ...STAGES.map((x) => crm.deals.filter((d) => d.opportunity.stage === x.id && !d.opportunity.archivedAt).length));
                return (
                  <Link key={s.id} href={`/pipeline?stage=${s.id}`} className="block rounded-md hover:bg-interactive/40">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5">
                        <span aria-hidden className="size-2 rounded-full" style={{ background: s.color }} />
                        {s.label}
                      </span>
                      <span className="tabular text-muted">
                        {list.length} · {formatEUR(value, { round: true, compact: true })}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-interactive">
                      <div className="h-full rounded-full" style={{ width: `${(list.length / max) * 100}%`, background: s.color }} />
                    </div>
                  </Link>
                );
              })}
            </CardContent>
          </Card>

          {data.settings.gamification.enabled ? (
            <Card>
              <CardContent className="space-y-3 pt-5">
                <div className="flex items-center gap-3">
                  <LevelBadge level={p.level.level} frameColor={p.frameColor} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">
                      Niveau {p.level.level} · {p.title}
                    </p>
                    <XPProgressBar into={p.level.xpIntoLevel} needed={p.level.xpForNext} />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                  <span className="inline-flex items-center gap-1">
                    <Flame className={cn("size-3.5", streak.current ? "text-warning" : "text-subtle")} /> Série : <span className="tabular text-fg">{streak.current} j</span>
                    {!streak.activeToday ? <span className="text-subtle">(à entretenir aujourd&apos;hui)</span> : null}
                  </span>
                  <span>
                    Encore <span className="tabular text-fg">{formatInt(p.level.xpForNext - p.level.xpIntoLevel)} XP</span> pour le niveau {p.level.level + 1}
                  </span>
                </div>
                {goal ? (
                  <div>
                    <div className="mb-1 flex justify-between gap-2 text-xs">
                      <span className="truncate">{goal.goal.title}</span>
                      <span className="tabular text-muted">{GOAL_METRICS[goal.goal.metric].label}</span>
                    </div>
                    <ProgressBar value={goal.progress} label={goal.goal.title} />
                  </div>
                ) : null}
                <Link href="/progression" className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
                  Progression, défis et succès <ArrowRight className="size-3" />
                </Link>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Activité récente</CardTitle>
              <Link href="/activites" className="text-xs text-accent hover:underline">
                Journal →
              </Link>
            </CardHeader>
            <CardContent>
              <Timeline activities={recent} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ActionRow({ item, today }: { item: ActionItem; today: string }) {
  const name = item.contact?.name ?? item.companyName ?? item.title;
  return (
    <li className={cn("rounded-xl border bg-card p-3", item.kind === "overdue" ? "border-danger/40" : "border-border")} data-action-kind={item.kind}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-1 gap-3">
          <Avatar name={name} size="sm" />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {item.contact ? (
                <Link href={`/contacts/${item.contact.contact.id}`} className="truncate text-sm font-medium text-fg hover:underline">
                  {item.contact.name}
                </Link>
              ) : (
                <span className="truncate text-sm font-medium text-fg">{name}</span>
              )}
              {item.companyName && item.contact ? <span className="text-xs text-muted">{item.companyName}</span> : null}
              <Badge tone={KIND_TONE[item.kind]}>{ACTION_KIND[item.kind].label}</Badge>
              <PriorityBadge priority={item.priority} />
            </div>
            <p className="text-sm text-fg">{item.nextAction}</p>
            <p className="text-xs text-muted">
              <span className="text-subtle">Pourquoi : </span>
              {item.reason}
            </p>
            <div className="flex flex-wrap gap-x-3 text-[11px] text-subtle">
              {item.context ? <span>{item.context}</span> : null}
              <span>Dernière interaction : {item.lastInteraction ? formatDueIn(item.lastInteraction, today) : "aucune"}</span>
              {item.dueDate ? <DueLabel date={item.dueDate} time={item.dueTime} today={today} /> : null}
            </div>
          </div>
        </div>
        <QuickActions
          className="sm:shrink-0"
          target={{ contactId: item.contact?.contact.id ?? null, clientId: item.contact?.company?.id ?? null, opportunityId: item.opportunityId, task: item.task }}
        />
      </div>
    </li>
  );
}
