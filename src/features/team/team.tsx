"use client";
import * as React from "react";
import { Pencil, Plus } from "lucide-react";
import type { Employee, SkillKey } from "@/lib/domain/types";
import { useData, useToday } from "@/lib/store/hooks";
import { useParam, useSyncedState } from "@/lib/store/params";
import { useUiStore } from "@/lib/store/ui-store";
import { isTaskLate, isTaskOpen } from "@/lib/calculations/projects";
import { PageHeader, SectionTitle } from "@/components/shared/page-header";
import { MetricCard } from "@/components/shared/metric-card";
import { FormDialog } from "@/components/forms/quick-create";
import { EmployeeForm } from "@/components/forms/entity-forms";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/misc";
import { HorizontalBars, SERIES } from "@/components/charts/charts";
import { DEPARTMENT, SKILL } from "@/lib/formatters/labels";
import { formatDate, formatEUR, formatNumber, initials } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { addDays } from "@/lib/calculations/dates";

export function TeamPage() {
  const data = useData();
  const today = useToday();
  const openCreate = useUiStore((s) => s.openCreate);
  const focus = useParam("focus");
  const [editId, setEditId] = useSyncedState<string | null>(focus);
  const edit = data.employees.find((x) => x.id === editId) ?? null;
  const setEdit = (e: Employee | null) => setEditId(e?.id ?? null);

  const active = data.employees.filter((e) => e.status === "active");
  const horizon = addDays(today, 14);
  const stats = data.employees.map((e) => {
    const tasks = data.tasks.filter((t) => t.assigneeId === e.id);
    const open = tasks.filter(isTaskOpen);
    return {
      e,
      open: open.length,
      done: tasks.filter((t) => t.status === "done").length,
      late: tasks.filter((t) => isTaskLate(t, today)).length,
      remaining: open.filter((t) => t.dueDate && t.dueDate <= horizon).reduce((s, t) => s + Math.max(t.estimateHours - t.actualHours, 0), 0),
      projects: data.projects.filter((p) => (p.memberIds.includes(e.id) || p.managerId === e.id) && p.status !== "done" && p.status !== "cancelled"),
    };
  });
  const byDept = Object.entries(DEPARTMENT)
    .map(([k, label]) => ({ key: k, label, value: active.filter((e) => e.department === k).length }))
    .filter((d) => d.value > 0);
  const threshold = data.settings.rules.workloadHoursThreshold;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Équipe"
        description="Gestion simplifiée des collaborateurs (données fictives). Les indicateurs de charge servent à l'organisation du travail : ils ne mesurent pas la valeur d'une personne."
        actions={
          <Button variant="primary" onClick={() => openCreate("employee")}>
            <Plus /> Nouveau collaborateur
          </Button>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <MetricCard label="Effectif actif" value={active.length} />
        <MetricCard
          label="Coût de personnel estimé"
          value={`${formatEUR(
            active.reduce((s, e) => s + e.monthlyCost, 0),
            { round: true },
          )} / mois`}
          hint="Somme des coûts mensuels chargés estimés (données de simulation)."
        />
        <MetricCard label="Tâches ouvertes" value={stats.reduce((s, x) => s + x.open, 0)} />
        <MetricCard label="Tâches terminées" value={stats.reduce((s, x) => s + x.done, 0)} tone="success" />
        <MetricCard label="Tâches en retard" value={stats.reduce((s, x) => s + x.late, 0)} tone="danger" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <section>
          <SectionTitle title="Collaborateurs" />
          <div className="grid gap-3 md:grid-cols-2">
            {stats.map(({ e, open, late, done, remaining, projects }) => (
              <Card key={e.id} className={cn(focus === e.id && "border-accent")}>
                <CardContent className="space-y-3 pt-4">
                  <div className="flex items-start gap-3">
                    <div className="grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-accent/30 to-violet/30 text-sm font-semibold">
                      {initials(`${e.firstName} ${e.lastName}`)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-fg">
                        {e.firstName} {e.lastName}
                      </p>
                      <p className="text-xs text-muted">
                        {e.jobTitle} · {DEPARTMENT[e.department]}
                      </p>
                      <p className="text-[11px] text-subtle">
                        {e.email} · arrivé(e) le {formatDate(e.hireDate)}
                      </p>
                    </div>
                    <Button size="icon-sm" variant="ghost" aria-label={`Modifier ${e.firstName}`} onClick={() => setEdit(e)}>
                      <Pencil />
                    </Button>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center text-xs">
                    <div className="rounded-lg bg-bg-elevated p-2">
                      <p className="tabular text-fg">{open}</p>
                      <p className="text-[10px] text-subtle">ouvertes</p>
                    </div>
                    <div className="rounded-lg bg-bg-elevated p-2">
                      <p className={cn("tabular", late ? "text-danger" : "text-fg")}>{late}</p>
                      <p className="text-[10px] text-subtle">en retard</p>
                    </div>
                    <div className="rounded-lg bg-bg-elevated p-2">
                      <p className="tabular text-fg">{done}</p>
                      <p className="text-[10px] text-subtle">terminées</p>
                    </div>
                    <div className="rounded-lg bg-bg-elevated p-2">
                      <p className="tabular text-fg">{formatEUR(e.monthlyCost, { compact: true })}</p>
                      <p className="text-[10px] text-subtle">coût/mois</p>
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 flex justify-between text-[11px] text-muted">
                      <span>Charge à 14 jours</span>
                      <span className={cn("tabular", remaining > threshold && "text-warning")}>
                        {formatNumber(remaining)} h / {threshold} h
                      </span>
                    </div>
                    <ProgressBar value={(remaining / threshold) * 100} tone={remaining > threshold ? "warning" : "accent"} label={`Charge de ${e.firstName}`} />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(Object.entries(e.skills) as [SkillKey, number][]).map(([k, v]) => (
                      <Badge key={k} tone="violet">
                        {SKILL[k]} {"●".repeat(v)}
                        <span className="opacity-30">{"●".repeat(5 - v)}</span>
                      </Badge>
                    ))}
                  </div>
                  {projects.length ? <p className="text-[11px] text-muted">Projets : {projects.map((p) => p.code).join(", ")}</p> : null}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Répartition par département</CardTitle>
            </CardHeader>
            <CardContent>
              <HorizontalBars money={false} items={byDept} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Compétences de l&apos;équipe</CardTitle>
                <CardDescription>Système ludique et déclaratif — il ne mesure pas objectivement la valeur d&apos;un collaborateur.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <HorizontalBars
                money={false}
                suffix=" / 5"
                max={5}
                color={SERIES[6]}
                items={(Object.keys(SKILL) as SkillKey[]).map((k) => {
                  const vals = active.map((e) => e.skills[k]).filter((v): v is number => !!v);
                  return { key: k, label: `${SKILL[k]} (${vals.length})`, value: vals.length ? Math.max(...vals) : 0, hint: "niveau max." };
                })}
              />
            </CardContent>
          </Card>
        </div>
      </div>
      <FormDialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)} title="Modifier le collaborateur">
        {edit ? <EmployeeForm entity={edit} onDone={() => setEdit(null)} onCancel={() => setEdit(null)} /> : null}
      </FormDialog>
    </div>
  );
}
