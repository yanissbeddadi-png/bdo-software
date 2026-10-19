"use client";
import * as React from "react";
import Link from "next/link";
import { CalendarPlus, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import type { ISODate, Task } from "@/lib/domain/types";
import { useData, useToday } from "@/lib/store/hooks";
import { useCrm } from "@/lib/store/crm";
import { useUiStore } from "@/lib/store/ui-store";
import { addDays, weekPeriod } from "@/lib/calculations/dates";
import { STAGE_LABELS } from "@/lib/calculations/pipeline";
import { compareMissions, isMissionOverdue } from "@/lib/crm/views";
import { TASK_TYPE, TASK_TYPE_LABEL } from "@/lib/crm/model";
import { PageHeader } from "@/components/shared/page-header";
import { MonthCalendar, LegendDot, type CalendarEvent } from "@/components/shared/calendar";
import { FormDialog } from "@/components/forms/quick-create";
import { DueLabel, MissionLine, TaskTypeIcon } from "@/components/crm/crm-ui";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/tabs";
import { NativeSelect } from "@/components/ui/input";
import { formatDate, formatDateLong, formatDueIn } from "@/lib/formatters";
import { cn } from "@/lib/utils";

type Mode = "day" | "week" | "month" | "list";

const TONE: Partial<Record<Task["type"], CalendarEvent["tone"]>> = { meeting: "violet", call: "accent", followup: "warning", proposal_send: "gold", proposal_prep: "gold" };

/**
 * Calendrier commercial : les événements sont les missions CRM datées (appels, rendez-vous,
 * relances, échéances). Les rappels sont internes : aucun agenda externe n'est lu ni modifié.
 */
export function CalendarPage() {
  const data = useData();
  const today = useToday();
  const openCreate = useUiStore((s) => s.openCreate);
  const [mode, setMode] = React.useState<Mode>("week");
  const [anchor, setAnchor] = React.useState<ISODate>(today);
  const [type, setType] = React.useState("all");
  const [selected, setSelected] = React.useState<string | null>(null);
  const contacts = new Map(data.contacts.map((c) => [c.id, `${c.firstName} ${c.lastName}`]));
  const companies = new Map(data.clients.map((c) => [c.id, c.name]));

  const events = data.tasks.filter((t) => t.type !== "internal" && t.dueDate && t.status !== "cancelled" && (type === "all" || t.type === type)).sort(compareMissions);
  const byDay = new Map<string, Task[]>();
  for (const t of events) byDay.set(t.dueDate!, [...(byDay.get(t.dueDate!) ?? []), t]);
  const week = weekPeriod(anchor);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(week.start, i));
  const working = new Set(data.settings.crm.workingDays);
  const overdue = events.filter((t) => isMissionOverdue(t, today));
  const step = mode === "day" ? 1 : 7;

  const eventLabel = (t: Task) => `${t.dueTime ? `${t.dueTime} ` : ""}${t.title}${t.contactId ? ` — ${contacts.get(t.contactId) ?? ""}` : ""}`;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Calendrier"
        description="Appels, rendez-vous, relances et échéances de missions. Les rappels sont internes à l'application : aucun agenda externe (Google, Outlook…) n'est synchronisé."
        actions={
          <>
            <Button variant="secondary" onClick={() => openCreate("action", { type: "followup", dueDate: anchor >= today ? anchor : today })}>
              <CalendarPlus /> Planifier une relance
            </Button>
            <Button variant="primary" onClick={() => openCreate("action", { type: "meeting", dueDate: anchor >= today ? anchor : addDays(today, 1), title: "Rendez-vous" })}>
              <Plus /> Nouveau rendez-vous
            </Button>
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label="Vue du calendrier"
          value={mode}
          onChange={setMode}
          options={[
            { value: "day", label: "Aujourd'hui" },
            { value: "week", label: "Semaine" },
            { value: "month", label: "Mois" },
            { value: "list", label: "Liste" },
          ]}
        />
        {mode === "day" || mode === "week" ? (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" aria-label="Période précédente" onClick={() => setAnchor(addDays(anchor, -step))}>
              <ChevronLeft />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setAnchor(today)}>
              Aujourd&apos;hui
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Période suivante" onClick={() => setAnchor(addDays(anchor, step))}>
              <ChevronRight />
            </Button>
            <span className={cn("ml-1 text-sm font-medium", mode === "day" && "capitalize")}>{mode === "day" ? formatDateLong(anchor) : `Semaine du ${formatDate(week.start, "d MMMM")}`}</span>
          </div>
        ) : null}
        <NativeSelect value={type} onChange={(e) => setType(e.target.value)} aria-label="Type d'événement" className="ml-auto h-8 w-auto text-xs">
          <option value="all">Tous les types</option>
          {Object.entries(TASK_TYPE).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </NativeSelect>
      </div>
      {overdue.length ? (
        <p role="status" className="rounded-lg border border-danger/40 bg-danger/5 px-3 py-2 text-xs text-danger">
          {overdue.length} mission(s) en retard (affichées en rouge à leur date d&apos;échéance).{" "}
          <Link href="/missions?view=overdue" className="underline">
            Les traiter
          </Link>
        </p>
      ) : null}

      {mode === "day" ? (
        <DayAgenda day={anchor} tasks={byDay.get(anchor) ?? []} today={today} contacts={contacts} companies={companies} onPlan={() => openCreate("action", { type: "call", dueDate: anchor })} />
      ) : null}

      {mode === "week" ? (
        <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
          <div className="grid min-w-[56rem] grid-cols-7 gap-2">
            {weekDays.map((d) => {
              const list = byDay.get(d) ?? [];
              return (
                <section
                  key={d}
                  aria-label={formatDateLong(d)}
                  className={cn(
                    "flex min-h-48 flex-col rounded-xl border bg-bg-elevated",
                    d === today ? "border-accent" : "border-border",
                    !working.has(new Date(`${d}T12:00:00Z`).getUTCDay()) && "opacity-70",
                  )}
                >
                  <header className="flex items-center justify-between border-b border-border px-2.5 py-2">
                    <span className={cn("text-xs font-medium capitalize", d === today ? "text-accent" : "text-fg")}>{formatDate(d, "EEE d")}</span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="h-6 w-6"
                      aria-label={`Planifier le ${formatDate(d)}`}
                      onClick={() => openCreate("action", { type: "call", dueDate: d < today ? today : d })}
                    >
                      <Plus className="size-3" />
                    </Button>
                  </header>
                  <div className="flex flex-1 flex-col gap-1.5 p-1.5">
                    {list.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setSelected(t.id)}
                        className={cn(
                          "cursor-pointer rounded-md border-l-2 px-2 py-1.5 text-left text-[11px] hover:brightness-110",
                          t.status === "done"
                            ? "border-l-success bg-success/10 text-muted line-through"
                            : isMissionOverdue(t, today)
                              ? "border-l-danger bg-danger/10"
                              : t.type === "meeting"
                                ? "border-l-violet bg-violet/10"
                                : "border-l-accent bg-accent/10",
                        )}
                      >
                        <span className="flex items-center gap-1 font-medium text-fg">
                          <TaskTypeIcon type={t.type} className="size-3" />
                          {t.dueTime ?? ""}
                        </span>
                        <span className="line-clamp-2">{t.title}</span>
                        {t.contactId ? <span className="block truncate text-muted">{contacts.get(t.contactId)}</span> : null}
                      </button>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      ) : null}

      {mode === "month" ? (
        <MonthCalendar
          today={today}
          events={events.map((t) => ({
            id: t.id,
            date: t.dueDate!,
            title: eventLabel(t),
            tone: t.status === "done" ? "success" : isMissionOverdue(t, today) ? "danger" : (TONE[t.type] ?? "neutral"),
            onClick: () => setSelected(t.id),
          }))}
          legend={
            <>
              <LegendDot tone="violet" label="Rendez-vous" />
              <LegendDot tone="accent" label="Appel" />
              <LegendDot tone="warning" label="Relance" />
              <LegendDot tone="gold" label="Proposition" />
              <LegendDot tone="danger" label="En retard" />
              <LegendDot tone="success" label="Terminé" />
            </>
          }
        />
      ) : null}

      {mode === "list" ? (
        <div className="space-y-4">
          {[...byDay.entries()]
            .filter(([d]) => d >= today)
            .sort(([a], [b]) => a.localeCompare(b))
            .slice(0, 30)
            .map(([d, list]) => (
              <section key={d}>
                <h2 className="mb-2 text-sm font-medium capitalize text-muted">
                  {formatDateLong(d)} <span className="text-subtle">· {formatDueIn(d, today)}</span>
                </h2>
                <div className="space-y-2">
                  {list.map((t) => (
                    <MissionLine key={t.id} task={t} today={today} contactName={t.contactId ? contacts.get(t.contactId) : null} companyName={t.clientId ? companies.get(t.clientId) : null} />
                  ))}
                </div>
              </section>
            ))}
          {![...byDay.keys()].some((d) => d >= today) ? <p className="text-sm text-muted">Aucun événement à venir.</p> : null}
        </div>
      ) : null}

      {selected ? <EventDialog id={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}

function DayAgenda({
  day,
  tasks,
  today,
  contacts,
  companies,
  onPlan,
}: {
  day: ISODate;
  tasks: Task[];
  today: ISODate;
  contacts: Map<string, string>;
  companies: Map<string, string>;
  onPlan: () => void;
}) {
  return (
    <div className="space-y-2">
      {tasks.map((t) => (
        <div key={t.id} className="flex gap-3">
          <span className="w-12 shrink-0 pt-3 text-right text-xs tabular text-muted">{t.dueTime ?? "—"}</span>
          <div className="min-w-0 flex-1">
            <MissionLine task={t} today={today} contactName={t.contactId ? contacts.get(t.contactId) : null} companyName={t.clientId ? companies.get(t.clientId) : null} />
          </div>
        </div>
      ))}
      {!tasks.length ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
          Rien de prévu {day === today ? "aujourd'hui" : `le ${formatDate(day)}`}.{" "}
          <Button variant="link" size="sm" onClick={onPlan}>
            Planifier une action
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** Contexte d'un événement : mission, contact, opportunité, dernière interaction, actions. */
function EventDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const data = useData();
  const today = useToday();
  const crm = useCrm();
  const openCreate = useUiStore((s) => s.openCreate);
  const task = data.tasks.find((t) => t.id === id);
  if (!task) return null;
  const cv = task.contactId ? crm.contactById.get(task.contactId) : null;
  const opp = task.opportunityId ? data.opportunities.find((o) => o.id === task.opportunityId) : (cv?.mainOpportunity ?? null);
  const go = (fn: () => void) => () => {
    onClose();
    fn();
  };
  const open = task.status !== "done" && task.status !== "cancelled";
  return (
    <FormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={task.title}
      description={`${TASK_TYPE_LABEL[task.type]} · ${formatDateLong(task.dueDate)}${task.dueTime ? ` à ${task.dueTime}` : ""}`}
    >
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          {open ? <DueLabel date={task.dueDate} time={task.dueTime} today={today} /> : <span className="text-success">Terminée{task.result ? ` — ${task.result}` : ""}</span>}
        </div>
        {task.description ? <p className="text-muted">{task.description}</p> : null}
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
          <dt className="text-subtle">Contact</dt>
          <dd>
            {cv ? (
              <Link href={`/contacts/${cv.contact.id}`} className="hover:underline" onClick={onClose}>
                {cv.name}
                {cv.contact.jobTitle ? ` · ${cv.contact.jobTitle}` : ""}
              </Link>
            ) : (
              "—"
            )}
          </dd>
          <dt className="text-subtle">Entreprise</dt>
          <dd>
            {task.clientId ? (
              <Link href={`/entreprises/${task.clientId}`} className="hover:underline" onClick={onClose}>
                {data.clients.find((c) => c.id === task.clientId)?.name}
              </Link>
            ) : (
              "—"
            )}
          </dd>
          <dt className="text-subtle">Opportunité</dt>
          <dd>{opp ? `${opp.name} · ${STAGE_LABELS[opp.stage]}` : "—"}</dd>
          <dt className="text-subtle">Dernière interaction</dt>
          <dd>{cv?.lastInteraction ? `${formatDueIn(cv.lastInteraction.date, today)} · ${cv.lastInteraction.subject}` : "—"}</dd>
          {cv?.contact.phone ? (
            <>
              <dt className="text-subtle">Téléphone</dt>
              <dd>
                <a href={`tel:${cv.contact.phone.replace(/\s/g, "")}`} className="hover:underline">
                  {cv.contact.phone}
                </a>
              </dd>
            </>
          ) : null}
        </dl>
        <div className="flex flex-wrap gap-2">
          {open ? (
            <>
              <Button size="sm" variant="success" onClick={go(() => openCreate("complete", { taskId: id }))}>
                Marquer comme réalisée
              </Button>
              <Button size="sm" variant="secondary" onClick={go(() => openCreate("reschedule", { taskId: id }))}>
                Replanifier
              </Button>
            </>
          ) : null}
          <Button size="sm" variant="secondary" onClick={go(() => openCreate("action", { type: "followup", contactId: task.contactId, clientId: task.clientId, opportunityId: task.opportunityId }))}>
            Planifier une relance
          </Button>
        </div>
      </div>
    </FormDialog>
  );
}
