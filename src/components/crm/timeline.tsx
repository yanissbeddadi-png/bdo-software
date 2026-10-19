"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowRightLeft, CalendarClock, CheckCircle2, Mail, MessageCircle, MonitorPlay, NotebookPen, Phone, PhoneIncoming, BellRing, Trash2, type LucideIcon } from "lucide-react";
import type { SalesActivity, SalesActivityType } from "@/lib/domain/types";
import { useCommand, useData } from "@/lib/store/hooks";
import * as C from "@/lib/domain/commands";
import { activityLabel } from "@/lib/crm/model";
import { formatDateTime } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/shared/confirm-dialog";
import { cn } from "@/lib/utils";

const ICONS: Record<SalesActivityType, LucideIcon> = {
  call: Phone,
  email: Mail,
  meeting: CalendarClock,
  demo: MonitorPlay,
  message: MessageCircle,
  followup: BellRing,
  note: NotebookPen,
  stage_change: ArrowRightLeft,
  task_done: CheckCircle2,
};

const SYSTEM = new Set<SalesActivityType>(["stage_change", "task_done"]);

/**
 * Historique chronologique (le plus récent en premier) : type, date, auteur, description,
 * résultat, prochaine étape et entités liées. Les événements système (changement d'étape,
 * mission terminée) ne sont pas supprimables.
 */
export function Timeline({ activities, limit, showContact = true, allowDelete = false }: { activities: SalesActivity[]; limit?: number; showContact?: boolean; allowDelete?: boolean }) {
  const data = useData();
  const run = useCommand();
  const { confirm, dialog } = useConfirm();
  const [expanded, setExpanded] = React.useState(false);
  const sorted = React.useMemo(() => [...activities].filter((a) => a.done).sort((a, b) => b.date.localeCompare(a.date)), [activities]);
  const shown = limit && !expanded ? sorted.slice(0, limit) : sorted;
  const employees = new Map(data.employees.map((e) => [e.id, `${e.firstName} ${e.lastName}`]));
  const contacts = new Map(data.contacts.map((c) => [c.id, `${c.firstName} ${c.lastName}`]));
  const opps = new Map(data.opportunities.map((o) => [o.id, o.name]));
  if (!sorted.length) return <p className="text-xs text-muted">Aucune interaction consignée pour l&apos;instant.</p>;
  return (
    <>
      <ol className="relative space-y-3 border-l border-border pl-5">
        {shown.map((a) => {
          const Icon = a.type === "call" && a.direction === "in" ? PhoneIncoming : ICONS[a.type];
          const system = SYSTEM.has(a.type);
          return (
            <li key={a.id} className="relative" data-activity-id={a.id}>
              <span className={cn("absolute -left-[31px] top-0.5 flex size-5 items-center justify-center rounded-full border border-border bg-bg-elevated", system ? "text-subtle" : "text-accent")}>
                <Icon className="size-3" aria-hidden />
              </span>
              <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted">
                <span className="font-medium text-fg">{activityLabel(a)}</span>
                <time dateTime={a.date}>{formatDateTime(a.date)}</time>
                {a.ownerId ? <span>par {employees.get(a.ownerId) ?? "—"}</span> : null}
                {showContact && a.contactId ? (
                  <Link href={`/contacts/${a.contactId}`} className="hover:text-fg hover:underline">
                    {contacts.get(a.contactId)}
                  </Link>
                ) : null}
                {a.opportunityId && opps.get(a.opportunityId) ? <span className="text-subtle">· {opps.get(a.opportunityId)}</span> : null}
                {allowDelete && !system ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="ml-auto h-6 w-6"
                    aria-label={`Supprimer l'interaction ${a.subject}`}
                    onClick={() =>
                      confirm({
                        title: "Supprimer cette interaction ?",
                        description: "Elle disparaîtra de l'historique.",
                        confirmLabel: "Supprimer",
                        tone: "danger",
                        action: () => run(C.deleteInteraction, { id: a.id }),
                      })
                    }
                  >
                    <Trash2 className="size-3" />
                  </Button>
                ) : null}
              </div>
              <p className={cn("mt-0.5 text-sm", system ? "text-muted" : "text-fg")}>{a.subject}</p>
              {a.outcome && a.outcome !== a.subject ? <p className="text-xs text-muted">Résultat : {a.outcome}</p> : null}
              {a.notes ? <p className="mt-0.5 whitespace-pre-line text-xs text-muted">{a.notes}</p> : null}
              {a.nextStep ? <p className="text-xs text-accent">Prochaine étape : {a.nextStep}</p> : null}
            </li>
          );
        })}
      </ol>
      {limit && sorted.length > limit ? (
        <Button variant="link" size="sm" onClick={() => setExpanded((e) => !e)} className="mt-2">
          {expanded ? "Réduire" : `Afficher les ${sorted.length - limit} plus anciennes`}
        </Button>
      ) : null}
      {dialog}
    </>
  );
}
