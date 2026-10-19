"use client";
import * as React from "react";
import Link from "next/link";
import {
  BellRing,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  Columns3,
  ExternalLink,
  FilePen,
  Filter,
  HeartHandshake,
  LifeBuoy,
  Mail,
  NotebookPen,
  Phone,
  Send,
  TrendingUp,
  CalendarPlus,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { CrmTaskType, ISODate, OpportunityStage, Priority, RelationType, Task } from "@/lib/domain/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { STAGES } from "@/lib/calculations/pipeline";
import { RELATION, TASK_TYPE_LABEL } from "@/lib/crm/model";
import { FOLLOW_UP, isMissionOverdue, type FollowUpState } from "@/lib/crm/views";
import { PRIORITY, TASK_STATUS } from "@/lib/formatters/labels";
import { formatDate, formatDueIn, initials } from "@/lib/formatters";
import { useUiStore } from "@/lib/store/ui-store";
import { cn } from "@/lib/utils";

/* ----------------------------- Identité ----------------------------- */

const AVATAR_TONES = ["bg-accent/20 text-accent", "bg-violet/20 text-violet", "bg-gold/20 text-gold", "bg-success/20 text-success", "bg-action/20 text-action", "bg-warning/20 text-warning"];

/** Pastille d'initiales (couleur stable dérivée du nom). */
export function Avatar({ name, size = "md", className }: { name: string; size?: "sm" | "md" | "lg"; className?: string }) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold",
        AVATAR_TONES[h % AVATAR_TONES.length],
        size === "sm" ? "size-7 text-[10px]" : size === "lg" ? "size-14 text-lg" : "size-9 text-xs",
        className,
      )}
    >
      {initials(name) || "?"}
    </span>
  );
}

/* ----------------------------- Badges ----------------------------- */

export function FollowUpBadge({ state, className }: { state: FollowUpState; className?: string }) {
  const meta = FOLLOW_UP[state];
  return (
    <Tooltip content={meta.explain}>
      <Badge tone={meta.tone} className={className} tabIndex={0}>
        {meta.label}
      </Badge>
    </Tooltip>
  );
}

export function StageBadge({ stage, className }: { stage: OpportunityStage | null; className?: string }) {
  if (!stage) return <span className="text-xs text-subtle">Aucune opportunité</span>;
  const s = STAGES.find((x) => x.id === stage)!;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs whitespace-nowrap text-fg", className)}>
      <span aria-hidden className="size-2 rounded-full" style={{ background: s.color }} />
      {s.short}
    </span>
  );
}

export function PriorityBadge({ priority, hideNormal = true }: { priority: Priority; hideNormal?: boolean }) {
  if (hideNormal && (priority === "normal" || priority === "low")) return null;
  return <Badge tone={PRIORITY[priority].tone}>{PRIORITY[priority].label}</Badge>;
}

export function RelationBadge({ relation }: { relation: RelationType }) {
  return <Badge tone={RELATION[relation].tone}>{RELATION[relation].label}</Badge>;
}

export const TASK_ICONS: Record<CrmTaskType, LucideIcon> = {
  call: Phone,
  email: Mail,
  followup: BellRing,
  meeting: CalendarClock,
  qualification: Filter,
  proposal_prep: FilePen,
  proposal_send: Send,
  sales_followup: TrendingUp,
  retention: HeartHandshake,
  request: LifeBuoy,
  other: CircleDot,
  internal: Wrench,
};

export function TaskTypeIcon({ type, className }: { type: CrmTaskType; className?: string }) {
  const Icon = TASK_ICONS[type];
  return <Icon aria-label={TASK_TYPE_LABEL[type]} className={cn("size-4 shrink-0 text-muted", className)} />;
}

/** Échéance lisible : « En retard de 3 j », « Aujourd'hui 14:30 », « dans 2 j ». */
export function DueLabel({ date, time, today, done, className }: { date: ISODate | null; time?: string | null; today: ISODate; done?: boolean; className?: string }) {
  if (!date) return <span className={cn("text-xs text-subtle", className)}>Sans échéance</span>;
  const late = !done && date < today;
  const isToday = date === today;
  const text = late ? `En retard · ${formatDate(date, "dd/MM")}` : isToday ? "Aujourd'hui" : formatDueIn(date, today);
  return (
    <span
      className={cn("inline-flex items-center gap-1 text-xs whitespace-nowrap tabular", late ? "font-medium text-danger" : isToday ? "font-medium text-warning" : "text-muted", className)}
      title={formatDate(date)}
    >
      {text}
      {time ? ` · ${time}` : null}
    </span>
  );
}

/* ----------------------------- Actions rapides ----------------------------- */

export interface QuickActionTarget {
  contactId?: string | null;
  clientId?: string | null;
  opportunityId?: string | null;
  task?: Task | null;
}

/**
 * Actions rapides standard d'une ligne CRM : ouvrir la fiche, consigner un appel, ajouter
 * une note, planifier une relance, terminer la mission, changer l'étape. Chaque bouton
 * ouvre un formulaire réel ; aucun n'est décoratif.
 */
export function QuickActions({
  target,
  size = "sm",
  show = ["open", "call", "note", "followup", "complete", "stage"],
  className,
}: {
  target: QuickActionTarget;
  size?: "sm" | "xs";
  show?: string[];
  className?: string;
}) {
  const openCreate = useUiStore((s) => s.openCreate);
  const { contactId = null, clientId = null, opportunityId = null, task = null } = target;
  const refs = { contactId, clientId, opportunityId };
  const btn = size === "xs" ? "h-7 w-7" : "";
  const items: { key: string; label: string; icon: LucideIcon; onClick?: () => void; href?: string }[] = [];
  if (show.includes("open") && (contactId || clientId))
    items.push({ key: "open", label: "Ouvrir la fiche", icon: ExternalLink, href: contactId ? `/contacts/${contactId}` : `/entreprises/${clientId}` });
  if (show.includes("call"))
    items.push({
      key: "call",
      label: task && (task.type === "call" || task.type === "followup") ? "Consigner l'appel (termine la mission)" : "Consigner un appel",
      icon: Phone,
      onClick: () => openCreate("interaction", { ...refs, type: "call", taskId: task && (task.type === "call" || task.type === "followup") && task.status !== "done" ? task.id : null }),
    });
  if (show.includes("note")) items.push({ key: "note", label: "Ajouter une note", icon: NotebookPen, onClick: () => openCreate("note", refs) });
  if (show.includes("followup")) items.push({ key: "followup", label: "Planifier une relance", icon: CalendarPlus, onClick: () => openCreate("action", { ...refs, type: "followup" }) });
  if (show.includes("complete") && task && task.status !== "done" && task.status !== "cancelled")
    items.push({ key: "complete", label: "Terminer la mission", icon: CheckCircle2, onClick: () => openCreate("complete", { taskId: task.id }) });
  if (show.includes("stage") && opportunityId) items.push({ key: "stage", label: "Changer l'étape", icon: Columns3, onClick: () => openCreate("stage", { opportunityId }) });
  return (
    <div className={cn("flex flex-wrap items-center gap-0.5", className)}>
      {items.map((i) => (
        <Tooltip key={i.key} content={i.label}>
          {i.href ? (
            <Button asChild variant="ghost" size="icon-sm" className={btn} aria-label={i.label}>
              <Link href={i.href}>
                <i.icon />
              </Link>
            </Button>
          ) : (
            <Button variant="ghost" size="icon-sm" className={btn} aria-label={i.label} onClick={i.onClick}>
              <i.icon />
            </Button>
          )}
        </Tooltip>
      ))}
    </div>
  );
}

/* ----------------------------- Mission ----------------------------- */

/** Ligne de mission compacte (fiches, centre d'action, calendrier en liste). */
export function MissionLine({
  task,
  today,
  contactName,
  companyName,
  showLinks = true,
}: {
  task: Task;
  today: ISODate;
  contactName?: string | null;
  companyName?: string | null;
  showLinks?: boolean;
}) {
  const openCreate = useUiStore((s) => s.openCreate);
  const done = task.status === "done" || task.status === "cancelled";
  const overdue = isMissionOverdue(task, today);
  return (
    <div className={cn("flex items-start gap-3 rounded-lg border px-3 py-2.5", overdue ? "border-danger/40 bg-danger/5" : "border-border bg-card")} data-task-id={task.id}>
      <TaskTypeIcon type={task.type} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-sm font-medium", done ? "text-muted line-through" : "text-fg")}>{task.title}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <span>{TASK_TYPE_LABEL[task.type]}</span>
          {showLinks && contactName && task.contactId ? (
            <Link href={`/contacts/${task.contactId}`} className="hover:text-fg hover:underline">
              {contactName}
            </Link>
          ) : null}
          {showLinks && companyName ? <span>{companyName}</span> : null}
          {done ? (
            <Badge tone={TASK_STATUS[task.status].tone}>
              {TASK_STATUS[task.status].label}
              {task.completedAt ? ` le ${formatDate(task.completedAt, "dd/MM")}` : ""}
            </Badge>
          ) : (
            <DueLabel date={task.dueDate} time={task.dueTime} today={today} />
          )}
          {task.status === "waiting" ? <Badge tone="warning">En attente</Badge> : null}
          <PriorityBadge priority={task.priority} />
        </div>
        {done && task.result ? <p className="mt-1 text-xs text-muted">Résultat : {task.result}</p> : null}
      </div>
      {!done ? (
        <div className="flex shrink-0 items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => openCreate("reschedule", { taskId: task.id })} aria-label={`Replanifier ${task.title}`}>
            Replanifier
          </Button>
          <Button size="sm" variant="success" onClick={() => openCreate("complete", { taskId: task.id })} aria-label={`Terminer ${task.title}`}>
            <CheckCircle2 /> Terminer
          </Button>
        </div>
      ) : null}
    </div>
  );
}
