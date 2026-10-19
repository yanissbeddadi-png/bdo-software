"use client";
import * as React from "react";
import Link from "next/link";
import { BellRing, Columns3, List, ListPlus } from "lucide-react";
import type { CrmTaskType, Task, TaskStatus } from "@/lib/domain/types";
import { useCommand, useData, useToday } from "@/lib/store/hooks";
import { useParam, useSyncedState } from "@/lib/store/params";
import { useUiStore } from "@/lib/store/ui-store";
import * as C from "@/lib/domain/commands";
import { addDays, weekPeriod } from "@/lib/calculations/dates";
import { compareMissions, isMissionOpen, isMissionOverdue } from "@/lib/crm/views";
import { TASK_TYPE, TASK_TYPE_LABEL } from "@/lib/crm/model";
import { PageHeader } from "@/components/shared/page-header";
import { KanbanBoard } from "@/components/shared/kanban";
import { FilterBar } from "@/components/tables/filter-bar";
import { EmptyState } from "@/components/shared/empty-state";
import { DueLabel, MissionLine, PriorityBadge, TaskTypeIcon } from "@/components/crm/crm-ui";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/tabs";
import { NativeSelect } from "@/components/ui/input";
import { PRIORITY, TASK_STATUS, options } from "@/lib/formatters/labels";
import { cn } from "@/lib/utils";

const VIEWS = {
  open: "Toutes (ouvertes)",
  today: "Aujourd'hui",
  overdue: "En retard",
  upcoming: "À venir",
  week: "Cette semaine",
  done: "Terminées",
  cancelled: "Annulées",
} as const;
type View = keyof typeof VIEWS;

const GROUPS = { none: "Aucun regroupement", contact: "Par contact", owner: "Par responsable", type: "Par type", priority: "Par priorité" } as const;
type Group = keyof typeof GROUPS;

const BOARD: { id: TaskStatus; label: string }[] = [
  { id: "todo", label: "À faire" },
  { id: "in_progress", label: "En cours" },
  { id: "waiting", label: "En attente" },
  { id: "done", label: "Terminée" },
];

/**
 * Missions CRM : actions commerciales à réaliser (appels, relances, rendez-vous…).
 * « En retard » est calculé (échéance dépassée), jamais stocké. Une mission terminée
 * reste dans l'historique et ne change jamais l'étape commerciale.
 */
export function MissionsPage() {
  const data = useData();
  const today = useToday();
  const run = useCommand();
  const openCreate = useUiStore((s) => s.openCreate);
  const focus = useParam("focus");
  const [view, setView] = useSyncedState<View>((useParam("view") as View | null) ?? "open");
  const [layout, setLayout] = React.useState<"list" | "board">("list");
  const [group, setGroup] = React.useState<Group>("none");
  const [type, setType] = React.useState("all");
  const [owner, setOwner] = React.useState("all");
  const [priority, setPriority] = React.useState("all");
  const [status, setStatus] = React.useState("all");
  const week = weekPeriod(today);

  const crm = React.useMemo(() => data.tasks.filter((t) => t.type !== "internal"), [data.tasks]);
  const inView = (t: Task, v: View): boolean => {
    switch (v) {
      case "open":
        return isMissionOpen(t);
      case "today":
        return isMissionOpen(t) && t.dueDate === today;
      case "overdue":
        return isMissionOverdue(t, today);
      case "upcoming":
        return isMissionOpen(t) && !!t.dueDate && t.dueDate > today;
      case "week":
        return !!t.dueDate && t.dueDate >= week.start && t.dueDate <= week.end && t.status !== "cancelled";
      case "done":
        return t.status === "done";
      case "cancelled":
        return t.status === "cancelled";
    }
  };
  const list = crm
    .filter((t) => (layout === "board" ? t.status !== "cancelled" && (isMissionOpen(t) || (t.completedAt ?? "") >= addDays(today, -7)) : inView(t, view)))
    .filter((t) => type === "all" || t.type === type)
    .filter((t) => owner === "all" || t.assigneeId === owner)
    .filter((t) => priority === "all" || t.priority === priority)
    .filter((t) => status === "all" || t.status === status)
    .sort((a, b) => (view === "done" || view === "cancelled" ? (b.completedAt ?? b.updatedAt).localeCompare(a.completedAt ?? a.updatedAt) : compareMissions(a, b)));

  const contacts = new Map(data.contacts.map((c) => [c.id, `${c.firstName} ${c.lastName}`]));
  const companies = new Map(data.clients.map((c) => [c.id, c.name]));
  const employees = new Map(data.employees.map((e) => [e.id, `${e.firstName} ${e.lastName}`]));
  const groupKey = (t: Task): string => {
    switch (group) {
      case "contact":
        return t.contactId ? (contacts.get(t.contactId) ?? "—") : t.clientId ? (companies.get(t.clientId) ?? "—") : "Sans contact";
      case "owner":
        return t.assigneeId ? (employees.get(t.assigneeId) ?? "—") : "Non attribuée";
      case "type":
        return TASK_TYPE_LABEL[t.type];
      case "priority":
        return PRIORITY[t.priority].label;
      default:
        return "";
    }
  };
  const groups = new Map<string, Task[]>();
  for (const t of list) {
    const k = groupKey(t);
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }

  const counts = Object.fromEntries((Object.keys(VIEWS) as View[]).map((v) => [v, crm.filter((t) => inView(t, v)).length]));
  const moveStatus = (t: Task, to: TaskStatus) => {
    if (to === "done") openCreate("complete", { taskId: t.id });
    else run(C.setTaskStatus, { id: t.id, status: to });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Missions"
        description="Actions commerciales à réaliser : appels, relances, rendez-vous, propositions… Une mission est en retard dès que son échéance est dépassée. Les rappels sont internes à l'application."
        actions={
          <>
            <Button variant="secondary" onClick={() => openCreate("action", { type: "followup" })}>
              <BellRing /> Planifier un rappel
            </Button>
            <Button variant="primary" onClick={() => openCreate("action", { type: "call" })}>
              <ListPlus /> Nouvelle mission
            </Button>
          </>
        }
      />
      <div role="tablist" aria-label="Vues des missions" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {(Object.keys(VIEWS) as View[]).map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={view === v && layout === "list"}
            onClick={() => {
              setView(v);
              setLayout("list");
            }}
            className={cn(
              "inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
              view === v && layout === "list" ? "border-accent bg-accent/15 text-fg" : "border-border text-muted hover:text-fg",
              v === "overdue" && counts[v] ? "text-danger" : null,
            )}
          >
            {VIEWS[v]}
            <span className="tabular text-subtle">{counts[v]}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <FilterBar
          filters={[
            {
              id: "type",
              label: "Type",
              value: type,
              onChange: setType,
              options: (Object.keys(TASK_TYPE) as Exclude<CrmTaskType, "internal">[]).map((k) => ({ value: k, label: TASK_TYPE[k].label })),
            },
            {
              id: "owner",
              label: "Responsable",
              value: owner,
              onChange: setOwner,
              options: data.employees.filter((e) => e.status !== "left").map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}` })),
            },
            { id: "priority", label: "Priorité", value: priority, onChange: setPriority, options: options(PRIORITY) },
            { id: "status", label: "Statut", value: status, onChange: setStatus, options: options(TASK_STATUS) },
          ]}
          onReset={() => {
            setType("all");
            setOwner("all");
            setPriority("all");
            setStatus("all");
          }}
        />
        {layout === "list" ? (
          <NativeSelect value={group} onChange={(e) => setGroup(e.target.value as Group)} aria-label="Regrouper" className="h-8 w-auto text-xs">
            {(Object.keys(GROUPS) as Group[]).map((g) => (
              <option key={g} value={g}>
                {GROUPS[g]}
              </option>
            ))}
          </NativeSelect>
        ) : null}
        <span className="ml-auto text-xs text-muted" aria-live="polite">
          {list.length} mission{list.length > 1 ? "s" : ""}
        </span>
        <Segmented
          label="Affichage"
          value={layout}
          onChange={setLayout}
          options={[
            { value: "list", label: "Liste", icon: <List /> },
            { value: "board", label: "Kanban", icon: <Columns3 /> },
          ]}
        />
      </div>

      {layout === "board" ? (
        <>
          <p className="text-xs text-muted">Missions ouvertes et terminées depuis 7 jours. Déposer une carte dans « Terminée » ouvre le formulaire de clôture (résultat, note, suite).</p>
          <KanbanBoard<Task, TaskStatus>
            columns={BOARD}
            items={list}
            getColumn={(t) => t.status}
            onMove={moveStatus}
            itemLabel={(t) => t.title}
            cardClassName={(t) => cn(isMissionOverdue(t, today) && "border-l-2 border-l-danger", focus === t.id && "border-accent")}
            renderCard={(t) => (
              <div className="space-y-1.5 text-xs">
                <div className="flex items-start gap-2">
                  <TaskTypeIcon type={t.type} className="mt-0.5" />
                  <p className="min-w-0 flex-1 text-sm font-medium text-fg">{t.title}</p>
                </div>
                {t.contactId ? (
                  <Link href={`/contacts/${t.contactId}`} className="block truncate text-muted hover:underline">
                    {contacts.get(t.contactId)}
                    {t.clientId ? ` · ${companies.get(t.clientId) ?? ""}` : ""}
                  </Link>
                ) : t.clientId ? (
                  <p className="truncate text-muted">{companies.get(t.clientId)}</p>
                ) : null}
                <div className="flex items-center justify-between gap-2">
                  {t.status === "done" ? <span className="text-success">Terminée</span> : <DueLabel date={t.dueDate} time={t.dueTime} today={today} />}
                  <PriorityBadge priority={t.priority} />
                </div>
              </div>
            )}
          />
        </>
      ) : list.length ? (
        <div className="space-y-5">
          {[...groups.entries()].map(([k, tasks]) => (
            <section key={k || "all"} aria-label={k || "Missions"}>
              {k ? (
                <h2 className="mb-2 text-sm font-medium text-muted">
                  {k} <span className="tabular text-subtle">({tasks.length})</span>
                </h2>
              ) : null}
              <div className="space-y-2">
                {tasks.map((t) => (
                  <div key={t.id} className={cn(focus === t.id && "rounded-lg ring-2 ring-accent")}>
                    <MissionLine task={t} today={today} contactName={t.contactId ? contacts.get(t.contactId) : null} companyName={t.clientId ? companies.get(t.clientId) : null} />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <EmptyState
          title={view === "overdue" ? "Aucune mission en retard" : view === "today" ? "Aucune mission aujourd'hui" : "Aucune mission pour ces critères"}
          description={view === "overdue" ? "Tous les suivis sont à jour." : undefined}
          action={
            <Button variant="primary" onClick={() => openCreate("action", { type: "call" })}>
              <ListPlus /> Nouvelle mission
            </Button>
          }
        />
      )}
    </div>
  );
}
