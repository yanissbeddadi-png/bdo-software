"use client";
import * as React from "react";
import Link from "next/link";
import { CalendarDays, CheckCircle2, Circle, Clock, Columns3, List, MessageSquare, Pencil, Plus, Repeat, Trash2, Users } from "lucide-react";
import type { Task, TaskStatus } from "@/lib/domain/types";
import { useCommand, useData, useLookups, useToday } from "@/lib/store/hooks";
import { useParam, useSyncedState } from "@/lib/store/params";
import { useUiStore } from "@/lib/store/ui-store";
import * as C from "@/lib/domain/commands";
import { isTaskLate, isTaskOpen } from "@/lib/calculations/projects";
import { DataTable, type Column } from "@/components/tables/data-table";
import { FilterBar, useFilters } from "@/components/tables/filter-bar";
import { PageHeader } from "@/components/shared/page-header";
import { MetricCard } from "@/components/shared/metric-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { RowActions } from "@/components/shared/row-actions";
import { useConfirm } from "@/components/shared/confirm-dialog";
import { KanbanBoard } from "@/components/shared/kanban";
import { MonthCalendar, LegendDot, type CalendarEvent } from "@/components/shared/calendar";
import { FormDialog } from "@/components/forms/quick-create";
import { TaskForm } from "@/components/forms/entity-forms";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Segmented, Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input, Label, NativeSelect, Textarea } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { COMPLEXITY, PRIORITY, TASK_STATUS } from "@/lib/formatters/labels";
import { formatDate, formatDateTime, formatDueIn, formatNumber } from "@/lib/formatters";
import { cn } from "@/lib/utils";

const STATUSES: TaskStatus[] = ["todo", "in_progress", "waiting", "done", "cancelled"];
const XP_RULE = { simple: "task_simple", standard: "task_standard", complex: "task_complex" } as const;

/** Tableau de tâches réutilisable (page Tâches, fiche projet). */
export function TaskTable({ tasks, focusId, compact, toolbar }: { tasks: Task[]; focusId?: string | null; compact?: boolean; toolbar?: React.ReactNode }) {
  const today = useToday();
  const run = useCommand();
  const { employees, projects } = useLookups();
  const { confirm, dialog } = useConfirm();
  const [open, setOpen] = useSyncedState<string | null>(focusId && tasks.some((t) => t.id === focusId) ? focusId : null);

  const toggle = (t: Task) => run(C.setTaskStatus, { id: t.id, status: t.status === "done" ? "todo" : "done" });
  const columns: Column<Task>[] = [
    {
      id: "check",
      header: "",
      cell: (t) => (
        <button
          type="button"
          onClick={() => toggle(t)}
          disabled={t.status === "cancelled"}
          aria-label={t.status === "done" ? `Rouvrir « ${t.title} »` : `Terminer « ${t.title} »`}
          className="grid place-items-center text-subtle hover:text-success cursor-pointer"
        >
          {t.status === "done" ? <CheckCircle2 className="size-5 text-success" /> : <Circle className="size-5" />}
        </button>
      ),
    },
    {
      id: "title",
      header: "Tâche",
      cell: (t) => (
        <div className="min-w-48">
          <p className={cn("text-fg", t.status === "done" && "text-muted line-through")}>
            {t.title}
            {t.recurrence !== "none" ? <Repeat className="ml-1.5 inline size-3 text-subtle" aria-label="Récurrente" /> : null}
            {t.comments.length ? (
              <span className="ml-1.5 inline-flex items-center gap-0.5 text-[11px] text-subtle">
                <MessageSquare className="size-3" />
                {t.comments.length}
              </span>
            ) : null}
          </p>
          {!compact && t.projectId ? (
            <p className="text-[11px] text-muted">
              {projects.get(t.projectId)?.code} · {projects.get(t.projectId)?.name}
            </p>
          ) : null}
        </div>
      ),
      sortValue: (t) => t.title,
      csv: (t) => t.title,
    },
    {
      id: "assignee",
      header: "Responsable",
      cell: (t) => (t.assigneeId ? `${employees.get(t.assigneeId)?.firstName ?? ""}` : <span className="text-subtle">—</span>),
      sortValue: (t) => (t.assigneeId ? (employees.get(t.assigneeId)?.firstName ?? "") : ""),
      csv: (t) => (t.assigneeId ? `${employees.get(t.assigneeId)?.firstName} ${employees.get(t.assigneeId)?.lastName}` : ""),
      hideBelow: "md",
    },
    {
      id: "priority",
      header: "Priorité",
      cell: (t) => <StatusBadge meta={PRIORITY[t.priority]} />,
      sortValue: (t) => ["critical", "high", "normal", "low"].indexOf(t.priority),
      csv: (t) => PRIORITY[t.priority].label,
    },
    {
      id: "due",
      header: "Échéance",
      cell: (t) => (
        <span className={cn("whitespace-nowrap text-xs", isTaskLate(t, today) ? "text-danger" : "text-muted")}>{t.dueDate ? `${formatDate(t.dueDate)} · ${formatDueIn(t.dueDate, today)}` : "—"}</span>
      ),
      sortValue: (t) => t.dueDate ?? "9999",
      csv: (t) => t.dueDate ?? "",
    },
    {
      id: "time",
      header: "Temps",
      align: "right",
      cell: (t) => (
        <span className="text-xs">
          {formatNumber(t.actualHours, 1)} / {formatNumber(t.estimateHours, 1)} h
        </span>
      ),
      sortValue: (t) => t.estimateHours,
      csv: (t) => `${t.actualHours}/${t.estimateHours}`,
      hideBelow: "lg",
    },
    {
      id: "status",
      header: "Statut",
      cell: (t) => <StatusBadge meta={isTaskLate(t, today) ? { label: "En retard", tone: "danger" } : TASK_STATUS[t.status]} />,
      sortValue: (t) => STATUSES.indexOf(t.status),
      csv: (t) => TASK_STATUS[t.status].label,
    },
    {
      id: "actions",
      header: "",
      align: "right",
      cell: (t) => (
        <RowActions
          actions={[
            { label: "Ouvrir", icon: <Pencil />, onSelect: () => setOpen(t.id) },
            t.status !== "in_progress" && t.status !== "done" && { label: "Démarrer", icon: <Clock />, onSelect: () => run(C.setTaskStatus, { id: t.id, status: "in_progress" }) },
            isTaskOpen(t) && { label: "Annuler", onSelect: () => run(C.setTaskStatus, { id: t.id, status: "cancelled" }) },
            {
              label: "Supprimer",
              icon: <Trash2 />,
              danger: true,
              separatorBefore: true,
              onSelect: () => confirm({ title: "Supprimer cette tâche ?", description: t.title, confirmLabel: "Supprimer", action: () => run(C.deleteTask, { id: t.id }) }),
            },
          ]}
        />
      ),
    },
  ];
  return (
    <>
      <DataTable
        caption="Tâches"
        rows={tasks}
        columns={columns}
        searchText={compact ? undefined : (t) => `${t.title} ${t.description}`}
        onRowClick={(t) => setOpen(t.id)}
        highlightId={focusId}
        exportName={compact ? undefined : "taches"}
        initialSort={{ id: "due", dir: "asc" }}
        toolbar={toolbar}
        pageSize={compact ? 10 : 20}
        emptyTitle="Aucune tâche"
        rowClassName={(t) => (isTaskLate(t, today) ? "bg-danger/5" : undefined)}
      />
      {open ? <TaskDialog id={open} onClose={() => setOpen(null)} /> : null}
      {dialog}
    </>
  );
}

function TaskDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const data = useData();
  const run = useCommand();
  const [mode, setMode] = React.useState<"detail" | "edit">("detail");
  const [hours, setHours] = React.useState("1");
  const [comment, setComment] = React.useState("");
  const { employees, projects, tasks } = useLookups();
  const t = data.tasks.find((x) => x.id === id);
  if (!t) return null;
  const xp = data.settings.gamification.xpRewards[XP_RULE[t.complexity]];
  return (
    <FormDialog open onOpenChange={(o) => !o && onClose()} title={t.title} description={`${TASK_STATUS[t.status].label} · ${COMPLEXITY[t.complexity]} (+${xp} XP à la clôture)`} wide>
      {mode === "edit" ? (
        <TaskForm entity={t} onDone={() => setMode("detail")} onCancel={() => setMode("detail")} />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            {t.status !== "done" ? (
              <Button variant="success" size="sm" onClick={() => run(C.setTaskStatus, { id, status: "done" })}>
                <CheckCircle2 /> Terminer
              </Button>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => run(C.setTaskStatus, { id, status: "todo" })}>
                Rouvrir
              </Button>
            )}
            <NativeSelect aria-label="Statut" value={t.status} onChange={(e) => run(C.setTaskStatus, { id, status: e.target.value as TaskStatus })} className="h-8 w-auto text-xs">
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {TASK_STATUS[s].label}
                </option>
              ))}
            </NativeSelect>
            <Button variant="secondary" size="sm" onClick={() => setMode("edit")}>
              <Pencil /> Modifier
            </Button>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-[11px] text-muted">Responsable</dt>
              <dd>{t.assigneeId ? `${employees.get(t.assigneeId)?.firstName} ${employees.get(t.assigneeId)?.lastName}` : "—"}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted">Échéance</dt>
              <dd>{formatDate(t.dueDate)}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted">Priorité</dt>
              <dd>
                <StatusBadge meta={PRIORITY[t.priority]} />
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted">Temps passé</dt>
              <dd className="tabular">
                {formatNumber(t.actualHours, 1)} h / {formatNumber(t.estimateHours, 1)} h
              </dd>
            </div>
            {t.projectId ? (
              <div className="col-span-2">
                <dt className="text-[11px] text-muted">Projet</dt>
                <dd>
                  <Link className="text-accent hover:underline" href={`/projets/${t.projectId}`}>
                    {projects.get(t.projectId)?.code} · {projects.get(t.projectId)?.name}
                  </Link>
                </dd>
              </div>
            ) : null}
            {t.dependsOn.length ? (
              <div className="col-span-2">
                <dt className="text-[11px] text-muted">Dépend de</dt>
                <dd className="text-xs">{t.dependsOn.map((d) => `${tasks.get(d)?.title ?? "?"} (${TASK_STATUS[tasks.get(d)?.status ?? "todo"].label})`).join(", ")}</dd>
              </div>
            ) : null}
          </dl>
          {t.description ? <p className="whitespace-pre-line rounded-lg bg-bg-elevated p-3 text-sm text-muted">{t.description}</p> : null}
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const r = run(C.logTaskTime, { id, hours: Number(hours.replace(",", ".")) });
              if (r.ok) setHours("1");
            }}
          >
            <div>
              <Label htmlFor="log-hours">Suivi du temps (heures)</Label>
              <Input id="log-hours" className="mt-1 w-28" inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} />
            </div>
            <Button type="submit" variant="secondary">
              <Clock /> Ajouter
            </Button>
          </form>
          <div>
            <h3 className="mb-2 text-sm font-medium">Commentaires ({t.comments.length})</h3>
            <ul className="mb-3 space-y-2">
              {t.comments.map((c) => (
                <li key={c.id} className="rounded-lg bg-bg-elevated p-3 text-sm">
                  <p className="text-[11px] text-muted">
                    {c.author} · {formatDateTime(c.at)}
                  </p>
                  <p className="mt-0.5 whitespace-pre-line">{c.text}</p>
                </li>
              ))}
            </ul>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const r = run(C.addTaskComment, { id, text: comment });
                if (r.ok) setComment("");
              }}
              className="space-y-2"
            >
              <Textarea aria-label="Nouveau commentaire" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Ajouter un commentaire…" />
              <div className="flex justify-end">
                <Button type="submit" variant="secondary" size="sm" disabled={!comment.trim()}>
                  Commenter
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </FormDialog>
  );
}

export function TasksPage() {
  const data = useData();
  const today = useToday();
  const run = useCommand();
  const openCreate = useUiStore((s) => s.openCreate);
  const focus = useParam("focus");
  const viewParam = useParam("view");
  const { employees, projects } = useLookups();
  const [scope, setScope] = React.useState<string>(viewParam === "late" ? "late" : "all");
  const [view, setView] = React.useState<"list" | "kanban" | "calendar" | "team">("list");
  const [me, setMe] = React.useState(data.employees[0]?.id ?? "");
  const [quick, setQuick] = React.useState("");
  const f = useFilters(["status", "priority", "assignee", "project"] as const);

  // Les missions CRM (appels, relances…) sont gérées dans /missions ; ce module liste les tâches internes.
  const internal = data.tasks.filter((t) => t.type === "internal");
  const scoped = internal.filter((t) => {
    if (scope === "today") return isTaskOpen(t) && t.dueDate === today;
    if (scope === "late") return isTaskLate(t, today);
    if (scope === "mine") return t.assigneeId === me;
    return true;
  });
  const rows = scoped.filter((t) => f.match("status", t.status) && f.match("priority", t.priority) && f.match("assignee", t.assigneeId ?? "") && f.match("project", t.projectId ?? "none"));
  const events: CalendarEvent[] = rows
    .filter((t) => t.dueDate)
    .map((t) => ({
      id: t.id,
      date: t.dueDate!,
      title: t.title,
      tone: t.status === "done" ? "success" : isTaskLate(t, today) ? "danger" : t.priority === "critical" ? "warning" : "accent",
      href: `/taches?focus=${t.id}`,
    }));

  const filterBar = (
    <FilterBar
      onReset={f.reset}
      filters={[
        { id: "status", label: "Statut", value: f.values.status, onChange: f.set("status"), options: STATUSES.map((s) => ({ value: s, label: TASK_STATUS[s].label })) },
        { id: "priority", label: "Priorité", value: f.values.priority, onChange: f.set("priority"), options: Object.entries(PRIORITY).map(([value, m]) => ({ value, label: m.label })) },
        { id: "assignee", label: "Responsable", value: f.values.assignee, onChange: f.set("assignee"), options: data.employees.map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}` })) },
        {
          id: "project",
          label: "Projet",
          value: f.values.project,
          onChange: f.set("project"),
          options: [{ value: "none", label: "Sans projet" }, ...data.projects.filter((p) => p.status !== "cancelled").map((p) => ({ value: p.id, label: p.code }))],
        },
      ]}
    />
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tâches internes"
        description="Tâches internes hors CRM (projets, administratif). Les actions commerciales (appels, relances, rendez-vous) sont gérées dans Missions."
        actions={
          <Button variant="primary" onClick={() => openCreate("task")}>
            <Plus /> Nouvelle tâche
          </Button>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <MetricCard label="Ouvertes" value={internal.filter(isTaskOpen).length} />
        <MetricCard label="Aujourd'hui" value={internal.filter((t) => isTaskOpen(t) && t.dueDate === today).length} />
        <MetricCard label="En retard" value={internal.filter((t) => isTaskLate(t, today)).length} tone={internal.some((t) => isTaskLate(t, today)) ? "danger" : "default"} />
        <MetricCard label="Critiques ouvertes" value={internal.filter((t) => isTaskOpen(t) && t.priority === "critical").length} />
        <MetricCard
          label="Terminées (30 j)"
          value={internal.filter((t) => t.completedAt && t.completedAt.slice(0, 10) >= new Date(Date.parse(today) - 30 * 86_400_000).toISOString().slice(0, 10)).length}
          tone="success"
        />
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!quick.trim()) return;
          const r = run(C.createTask, {
            title: quick,
            description: "",
            type: "internal",
            contactId: null,
            opportunityId: null,
            dueTime: null,
            assigneeId: scope === "mine" ? me : null,
            priority: "normal",
            status: "todo",
            complexity: "standard",
            dueDate: today,
            estimateHours: 1,
            projectId: null,
            clientId: null,
            goalId: null,
            dependsOn: [],
            recurrence: "none",
          });
          if (r.ok) setQuick("");
        }}
      >
        <Input aria-label="Création rapide de tâche" placeholder="Création rapide : saisissez un titre puis Entrée (échéance aujourd'hui)" value={quick} onChange={(e) => setQuick(e.target.value)} />
        <Button type="submit" variant="secondary">
          <Plus /> Ajouter
        </Button>
      </form>
      <Tabs value={scope} onValueChange={setScope}>
        <TabsList>
          <TabsTrigger value="all">Toutes</TabsTrigger>
          <TabsTrigger value="today">Aujourd&apos;hui</TabsTrigger>
          <TabsTrigger value="late">En retard</TabsTrigger>
          <TabsTrigger value="mine">Vue personnelle</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label="Vue"
          value={view}
          onChange={setView}
          options={[
            { value: "list", label: "Liste", icon: <List /> },
            { value: "kanban", label: "Kanban", icon: <Columns3 /> },
            { value: "calendar", label: "Calendrier", icon: <CalendarDays /> },
            { value: "team", label: "Équipe", icon: <Users /> },
          ]}
        />
        {scope === "mine" ? (
          <NativeSelect aria-label="Collaborateur" value={me} onChange={(e) => setMe(e.target.value)} className="h-8 w-auto text-xs">
            {data.employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.firstName} {e.lastName}
              </option>
            ))}
          </NativeSelect>
        ) : null}
        {view !== "list" ? filterBar : null}
      </div>
      {view === "list" ? (
        <TaskTable tasks={rows} focusId={focus} toolbar={filterBar} />
      ) : view === "kanban" ? (
        <KanbanBoard
          columns={STATUSES.map((s) => ({ id: s, label: TASK_STATUS[s].label }))}
          items={rows}
          getColumn={(t) => t.status}
          onMove={(t, s) => run(C.setTaskStatus, { id: t.id, status: s })}
          itemLabel={(t) => t.title}
          renderCard={(t) => (
            <div>
              <p className={cn("text-sm text-fg", t.status === "done" && "line-through text-muted")}>{t.title}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                <StatusBadge meta={PRIORITY[t.priority]} />
                {t.projectId ? <span>{projects.get(t.projectId)?.code}</span> : null}
                {t.assigneeId ? <span>{employees.get(t.assigneeId)?.firstName}</span> : null}
                {t.dueDate ? <span className={cn(isTaskLate(t, today) && "text-danger")}>{formatDueIn(t.dueDate, today)}</span> : null}
              </div>
            </div>
          )}
        />
      ) : view === "calendar" ? (
        <MonthCalendar
          events={events}
          today={today}
          legend={
            <>
              <LegendDot tone="accent" label="À faire" />
              <LegendDot tone="warning" label="Critique" />
              <LegendDot tone="danger" label="En retard" />
              <LegendDot tone="success" label="Terminée" />
            </>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.employees.map((e) => {
            const list = rows.filter((t) => t.assigneeId === e.id && isTaskOpen(t));
            const hours = list.reduce((s, t) => s + Math.max(t.estimateHours - t.actualHours, 0), 0);
            return (
              <Card key={e.id}>
                <CardContent className="pt-4">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="font-medium">
                      {e.firstName} {e.lastName}
                    </p>
                    <Badge tone={hours > data.settings.rules.workloadHoursThreshold ? "warning" : "neutral"}>{formatNumber(hours)} h restantes</Badge>
                  </div>
                  <ul className="space-y-1.5 text-sm">
                    {list.slice(0, 8).map((t) => (
                      <li key={t.id} className="flex justify-between gap-2">
                        <Link href={`/taches?focus=${t.id}`} className="truncate hover:underline">
                          {t.title}
                        </Link>
                        <span className={cn("shrink-0 text-[11px]", isTaskLate(t, today) ? "text-danger" : "text-subtle")}>{t.dueDate ? formatDueIn(t.dueDate, today) : ""}</span>
                      </li>
                    ))}
                    {!list.length ? <li className="text-muted">Aucune tâche ouverte.</li> : null}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
