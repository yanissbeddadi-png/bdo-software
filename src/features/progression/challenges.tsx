"use client";
import * as React from "react";
import { History, Plus } from "lucide-react";
import type { Mission, MissionCategory, MissionType } from "@/lib/domain/types";
import { useData, useSummaries, useToday } from "@/lib/store/hooks";
import { useParam, useSyncedState } from "@/lib/store/params";
import { useUiStore } from "@/lib/store/ui-store";
import { evaluateCondition, MISSION_CATEGORY_LABELS, MISSION_TYPE_LABELS, missionStatus, recommendedMissions, PRIORITY_ORDER } from "@/lib/gamification/missions";
import { SectionTitle } from "@/components/shared/page-header";
import { MetricCard } from "@/components/shared/metric-card";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar, useFilters } from "@/components/tables/filter-bar";
import { FormDialog } from "@/components/forms/quick-create";
import { MissionCard } from "@/components/gamification/progress";
import { MissionActions } from "@/components/gamification/mission-actions";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProgressBar } from "@/components/ui/misc";
import { MISSION_STATUS } from "@/lib/formatters/labels";
import { formatDateTime, formatInt } from "@/lib/formatters";

const CONDITION_LABELS: Record<Mission["condition"]["kind"], string> = {
  manual: "Validation manuelle après réalisation",
  invoice_followed_up: "Consigner une relance (ou encaisser la facture)",
  invoice_paid: "Facture intégralement payée",
  task_done: "Tâche terminée",
  opportunity_touched: "Nouvelle interaction ou changement d'étape",
  leads_created: "Nombre de contacts prospects créés depuis le début de la période",
  sales_activities_logged: "Interactions commerciales consignées cette semaine",
  interactions_logged: "Interactions consignées depuis le début de la période",
  prospects_qualified: "Prospects qualifiés (opportunité passée « En discussion » ou au-delà)",
  no_overdue_followups: "Aucune mission CRM en retard",
  day_actions_done: "Toutes les missions CRM du jour terminées",
  projects_done: "Projets prioritaires terminés",
  mrr_reached: "MRR atteint",
  cash_review: "Revue de trésorerie validée cette semaine",
  no_late_tasks: "Aucune tâche en retard",
  vat_declared: "Déclaration de TVA de la période enregistrée",
};

/** Défis (gamification) : objectifs courts dérivés des données CRM. Distincts des missions CRM. */
export function ChallengesPanel() {
  const data = useData();
  const today = useToday();
  const summaries = useSummaries();
  const openCreate = useUiStore((s) => s.openCreate);
  const focus = useParam("focus");
  const [tab, setTab] = React.useState<"active" | "done" | "all">("active");
  const [historyId, setHistoryId] = useSyncedState<string | null>(focus);
  const f = useFilters(["category", "type"] as const);

  const history = data.missions.find((m) => m.id === historyId) ?? null;
  const setHistory = (m: Mission | null) => setHistoryId(m?.id ?? null);

  const list = data.missions
    .filter((m) => (tab === "active" ? m.status === "todo" || m.status === "in_progress" : tab === "done" ? m.status === "done" || m.status === "cancelled" : true))
    .filter((m) => f.match("category", m.category) && f.match("type", m.type))
    .sort((a, b) => (tab === "done" ? (b.completedAt ?? "").localeCompare(a.completedAt ?? "") : PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.dueDate.localeCompare(b.dueDate)));
  const daily = recommendedMissions(data.missions, today, 5);
  const done = data.missions.filter((m) => m.status === "done");
  const xpFromMissions = data.xpTransactions.filter((x) => x.source === "mission").reduce((s, x) => s + x.amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <p className="max-w-3xl text-sm text-muted">
          Défis générés à partir de vos données CRM (journée de suivi, prospection, qualification, zéro relance en retard…) et défis personnalisés. Une même situation ne recrée jamais le même défi.
        </p>
        <Button variant="primary" onClick={() => openCreate("challenge")}>
          <Plus /> Défi personnalisé
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Défis actifs" value={data.missions.filter((m) => m.status === "todo" || m.status === "in_progress").length} />
        <MetricCard label="En retard" value={data.missions.filter((m) => missionStatus(m, today) === "overdue").length} tone="danger" />
        <MetricCard label="Terminées" value={done.length} tone="success" />
        <MetricCard label="XP gagnée via les défis" value={`${formatInt(xpFromMissions)} XP`} tone="gold" hint="L'XP est une unité ludique, sans valeur monétaire." />
      </div>
      <section>
        <SectionTitle title="Défis du jour" description="Recommandés selon la priorité et l'échéance" />
        {daily.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {daily.map((m) => (
              <MissionCard key={m.id} mission={m} today={today} action={<MissionActions mission={m} />} />
            ))}
          </div>
        ) : (
          <EmptyState title="Aucun défi actif" />
        )}
      </section>
      <section className="space-y-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            <TabsTrigger value="active">Actives</TabsTrigger>
            <TabsTrigger value="done">Terminées / annulées</TabsTrigger>
            <TabsTrigger value="all">Toutes</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex flex-wrap gap-2">
          <FilterBar
            onReset={f.reset}
            filters={[
              {
                id: "category",
                label: "Catégorie",
                value: f.values.category,
                onChange: f.set("category"),
                options: (Object.keys(MISSION_CATEGORY_LABELS) as MissionCategory[]).map((k) => ({ value: k, label: MISSION_CATEGORY_LABELS[k] })),
              },
              {
                id: "type",
                label: "Type",
                value: f.values.type,
                onChange: f.set("type"),
                options: (Object.keys(MISSION_TYPE_LABELS) as MissionType[]).map((k) => ({ value: k, label: MISSION_TYPE_LABELS[k] })),
              },
            ]}
          />
        </div>
        {list.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {list.map((m) => {
              const ev = evaluateCondition(m.condition, data, today, summaries);
              return (
                <div key={m.id} className="space-y-0" data-mission={m.id}>
                  <MissionCard
                    mission={m}
                    today={today}
                    action={
                      <>
                        {m.status !== "done" && m.status !== "cancelled" && ev.target > 1 ? (
                          <div className="w-full">
                            <ProgressBar value={(Math.min(ev.current, ev.target) / ev.target) * 100} tone="violet" label="Progression du défi" />
                            <p className="mt-1 text-[11px] text-subtle tabular">
                              {m.condition.kind === "mrr_reached" ? `${formatInt(Math.round(ev.current / 100))} € / ${formatInt(Math.round(ev.target / 100))} €` : `${ev.current} / ${ev.target}`}
                            </p>
                          </div>
                        ) : null}
                        <MissionActions mission={m} showCancel />
                        <Button size="sm" variant="ghost" onClick={() => setHistory(m)}>
                          <History /> Historique
                        </Button>
                      </>
                    }
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState title="Aucun défi pour ces critères" />
        )}
      </section>
      <FormDialog
        open={!!history}
        onOpenChange={(o) => !o && setHistory(null)}
        title={history?.title ?? ""}
        description={
          history ? `${MISSION_TYPE_LABELS[history.type]} · ${MISSION_CATEGORY_LABELS[history.category]} · ${MISSION_STATUS[missionStatus(history, today)].label} · +${history.xpReward} XP` : undefined
        }
      >
        {history ? (
          <div className="space-y-4 text-sm">
            <p className="text-muted">{history.description}</p>
            <p>
              <span className="text-muted">Condition de réussite : </span>
              {CONDITION_LABELS[history.condition.kind]}
            </p>
            <p className="text-xs text-subtle">
              Origine : {history.source === "auto" ? `règle automatique (clé ${history.autoKey})` : history.source === "custom" ? "défi personnalisé" : "jeu de démonstration"}
            </p>
            <ol className="space-y-1.5 border-l border-border pl-4">
              {history.history.map((h, i) => (
                <li key={i} className="text-xs">
                  <span className="text-subtle">{formatDateTime(h.at)}</span> — {h.text}
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap gap-2">
              <MissionActions mission={history} showCancel />
            </div>
          </div>
        ) : null}
      </FormDialog>
    </div>
  );
}
