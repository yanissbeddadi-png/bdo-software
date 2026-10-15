"use client";
import * as React from "react";
import { Archive, ArchiveRestore, Bot, Hand, Pencil, Plus, Save } from "lucide-react";
import type { Goal } from "@/lib/domain/types";
import { useCommand, useData, useLookups, useSummaries, useToday } from "@/lib/store/hooks";
import { useParam } from "@/lib/store/params";
import { useUiStore } from "@/lib/store/ui-store";
import * as C from "@/lib/domain/commands";
import { evaluateGoal, GOAL_METRICS, keyResultProgress, type GoalEvaluation } from "@/lib/calculations/goals";
import { PageHeader } from "@/components/shared/page-header";
import { MetricCard } from "@/components/shared/metric-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { FormDialog } from "@/components/forms/quick-create";
import { GoalForm } from "@/components/forms/entity-forms";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ProgressBar } from "@/components/ui/misc";
import { Segmented } from "@/components/ui/tabs";
import { GOAL_STATUS, GOAL_TYPE } from "@/lib/formatters/labels";
import { formatDate, formatEUR, formatNumber } from "@/lib/formatters";
import { cn } from "@/lib/utils";

function fmtValue(v: number, unit: string) {
  return unit === "€" ? formatEUR(Math.round(v * 100), { round: true }) : `${formatNumber(v, 1)} ${unit}`.trim();
}

export function GoalsPage() {
  const data = useData();
  const today = useToday();
  const summaries = useSummaries();
  const openCreate = useUiStore((s) => s.openCreate);
  const focus = useParam("focus");
  const [show, setShow] = React.useState<"active" | "archived">("active");
  const evals = React.useMemo(() => data.goals.map((g) => evaluateGoal(g, data, today, summaries)), [data, today, summaries]);
  const list = evals.filter((e) => (show === "active" ? !e.goal.archived : e.goal.archived));
  React.useEffect(() => {
    if (focus) document.querySelector(`[data-goal="${focus}"]`)?.scrollIntoView({ block: "center" });
  }, [focus]);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Objectifs et OKR"
        description="La progression est calculée depuis les données métier lorsque c'est possible (badge « Automatique ») ; les objectifs manuels sont signalés comme tels. Chaque seuil (50 % puis 100 %) n'est récompensé qu'une fois."
        actions={
          <Button variant="primary" onClick={() => openCreate("goal")}>
            <Plus /> Nouvel objectif
          </Button>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Objectifs actifs" value={evals.filter((e) => !e.goal.archived).length} />
        <MetricCard label="Atteints" value={evals.filter((e) => e.status === "achieved").length} tone="gold" />
        <MetricCard label="En risque" value={evals.filter((e) => e.status === "at_risk").length} tone="danger" />
        <MetricCard
          label="Progression moyenne"
          value={`${Math.round(evals.filter((e) => !e.goal.archived).reduce((s, e) => s + e.progress, 0) / Math.max(evals.filter((e) => !e.goal.archived).length, 1))} %`}
        />
      </div>
      <Segmented
        label="Affichage"
        value={show}
        onChange={setShow}
        options={[
          { value: "active", label: "Actifs" },
          { value: "archived", label: "Archivés" },
        ]}
      />
      {list.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {list.map((e) => (
            <GoalCard key={e.goal.id} ev={e} highlighted={focus === e.goal.id} />
          ))}
        </div>
      ) : (
        <EmptyState title="Aucun objectif" />
      )}
    </div>
  );
}

function GoalCard({ ev, highlighted }: { ev: GoalEvaluation; highlighted: boolean }) {
  const run = useCommand();
  const { employees } = useLookups();
  const [edit, setEdit] = React.useState(false);
  const [manual, setManual] = React.useState(String(ev.goal.manualValue));
  const [krs, setKrs] = React.useState<Record<string, string>>(Object.fromEntries(ev.goal.keyResults.map((k) => [k.id, String(k.current)])));
  const g: Goal = ev.goal;
  const metric = GOAL_METRICS[g.metric];
  const dirty = g.metric === "manual" && Number(manual.replace(",", ".")) !== g.manualValue;
  const krDirty = g.keyResults.some((k) => Number((krs[k.id] ?? "").replace(",", ".")) !== k.current);
  return (
    <Card data-goal={g.id} className={cn(highlighted && "border-accent", ev.status === "achieved" && "border-gold/40")}>
      <CardContent className="space-y-4 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap gap-1.5">
              <Badge>{GOAL_TYPE[g.type]}</Badge>
              <Badge>{g.periodLabel}</Badge>
              {ev.auto ? (
                <Badge tone="info">
                  <Bot /> Automatique
                </Badge>
              ) : (
                <Badge tone="warning">
                  <Hand /> Manuel
                </Badge>
              )}
            </div>
            <h3 className="font-semibold text-fg">{g.title}</h3>
            <p className="text-xs text-muted">
              {metric.label} · responsable {g.ownerId ? employees.get(g.ownerId)?.firstName : "—"} · échéance {formatDate(g.periodEnd)}
            </p>
          </div>
          <StatusBadge meta={GOAL_STATUS[ev.status]} />
        </div>
        <div>
          <div className="mb-1 flex items-baseline justify-between text-sm">
            <span className="tabular text-fg">
              {fmtValue(ev.current, g.unit)} <span className="text-xs text-muted">/ cible {fmtValue(g.targetValue, g.unit)}</span>
            </span>
            <span className="text-lg font-semibold tabular">{Math.round(ev.progress)} %</span>
          </div>
          <ProgressBar value={ev.progress} className="h-2" tone={ev.status === "achieved" ? "gold" : ev.status === "at_risk" ? "danger" : "accent"} label={g.title} />
          <p className="mt-1 text-[11px] text-subtle">
            Valeur initiale {fmtValue(g.startValue, g.unit)}
            {metric.direction === "down" ? " · objectif de réduction" : ""}
          </p>
        </div>
        {g.metric === "manual" ? (
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              run(C.setGoalProgress, { id: g.id, manualValue: Number(manual.replace(",", ".")) });
            }}
          >
            <label className="flex-1 text-xs text-muted">
              Valeur actuelle (saisie manuelle)
              <Input className="mt-1" inputMode="decimal" value={manual} onChange={(e) => setManual(e.target.value)} />
            </label>
            <Button type="submit" variant="secondary" disabled={!dirty}>
              <Save /> Mettre à jour
            </Button>
          </form>
        ) : null}
        {g.keyResults.length ? (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted">Résultats clés</p>
            {g.keyResults.map((kr) => (
              <div key={kr.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate">{kr.title}</p>
                  <ProgressBar value={keyResultProgress(kr)} tone="violet" className="mt-1" label={kr.title} />
                </div>
                <Input aria-label={`Valeur de ${kr.title}`} className="h-8 w-20 text-right tabular" value={krs[kr.id] ?? ""} onChange={(e) => setKrs({ ...krs, [kr.id]: e.target.value })} />
                <span className="w-24 text-xs text-muted">
                  / {formatNumber(kr.target, 1)} {kr.unit}
                </span>
              </div>
            ))}
            {krDirty ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => run(C.setGoalProgress, { id: g.id, keyResults: g.keyResults.map((k) => ({ id: k.id, current: Number((krs[k.id] ?? "0").replace(",", ".")) })) })}
              >
                <Save /> Enregistrer les résultats clés
              </Button>
            ) : null}
          </div>
        ) : null}
        {g.description ? <p className="text-xs text-muted">{g.description}</p> : null}
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => setEdit(true)}>
            <Pencil /> Modifier
          </Button>
          <Button size="sm" variant="ghost" onClick={() => run(C.archiveGoal, { id: g.id, archived: !g.archived })}>
            {g.archived ? <ArchiveRestore /> : <Archive />} {g.archived ? "Restaurer" : "Archiver"}
          </Button>
        </div>
      </CardContent>
      <FormDialog open={edit} onOpenChange={setEdit} title="Modifier l'objectif" wide>
        <GoalForm entity={g} onDone={() => setEdit(false)} onCancel={() => setEdit(false)} />
      </FormDialog>
    </Card>
  );
}
