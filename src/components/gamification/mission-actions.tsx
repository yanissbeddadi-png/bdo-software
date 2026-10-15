"use client";
import * as React from "react";
import Link from "next/link";
import { CheckCircle2, ExternalLink, Play, Send, X } from "lucide-react";
import type { Mission } from "@/lib/domain/types";
import { Button } from "@/components/ui/button";
import { useCommand, useData } from "@/lib/store/hooks";
import { useUiStore } from "@/lib/store/ui-store";
import { setMissionStatus, setTaskStatus } from "@/lib/domain/commands";
import { entityHref } from "@/lib/domain/routes";
import { FollowUpDialog } from "@/components/shared/follow-up-dialog";

/** Bouton d'action d'une mission, adapté à sa condition de réussite. */
export function MissionActions({ mission, showCancel }: { mission: Mission; showCancel?: boolean }) {
  const run = useCommand();
  const data = useData();
  const openCreate = useUiStore((s) => s.openCreate);
  const [followUp, setFollowUp] = React.useState<string | null>(null);
  if (mission.status === "done" || mission.status === "cancelled") return null;
  const c = mission.condition;
  const href = entityHref(mission.entity, data);
  const actions: React.ReactNode[] = [];

  switch (c.kind) {
    case "invoice_followed_up":
      actions.push(
        <Button key="r" size="sm" variant="primary" onClick={() => setFollowUp(c.invoiceId)}>
          <Send /> Consigner une relance
        </Button>,
      );
      break;
    case "task_done":
      actions.push(
        <Button key="t" size="sm" variant="primary" onClick={() => run(setTaskStatus, { id: c.taskId, status: "done" })}>
          <CheckCircle2 /> Terminer la tâche
        </Button>,
      );
      break;
    case "opportunity_touched":
      actions.push(
        <Button
          key="o"
          size="sm"
          variant="primary"
          onClick={() =>
            openCreate("activity", {
              opportunityId: c.opportunityId,
              clientId: data.opportunities.find((o) => o.id === c.opportunityId)?.clientId ?? null,
              leadId: data.opportunities.find((o) => o.id === c.opportunityId)?.leadId ?? null,
            })
          }
        >
          <Send /> Consigner un échange
        </Button>,
      );
      break;
    case "leads_created":
      actions.push(
        <Button key="l" size="sm" variant="primary" onClick={() => openCreate("lead")}>
          Ajouter un prospect
        </Button>,
      );
      break;
    case "sales_activities_logged":
      actions.push(
        <Button key="a" size="sm" variant="primary" onClick={() => openCreate("activity")}>
          Consigner une activité
        </Button>,
      );
      break;
    case "cash_review":
      actions.push(
        <Button key="c" size="sm" variant="primary" asChild>
          <Link href="/finances/tresorerie#revue">Ouvrir la trésorerie</Link>
        </Button>,
      );
      break;
    case "mrr_reached":
      actions.push(
        <Button key="m" size="sm" variant="secondary" asChild>
          <Link href="/finances/abonnements">Voir les revenus récurrents</Link>
        </Button>,
      );
      break;
    case "no_late_tasks":
      actions.push(
        <Button key="n" size="sm" variant="secondary" asChild>
          <Link href="/taches?view=late">Voir les tâches en retard</Link>
        </Button>,
      );
      break;
    case "projects_done":
      actions.push(
        <Button key="p" size="sm" variant="secondary" asChild>
          <Link href="/projets">Voir les projets</Link>
        </Button>,
      );
      break;
    case "manual":
      if (mission.status === "todo")
        actions.push(
          <Button key="s" size="sm" variant="secondary" onClick={() => run(setMissionStatus, { id: mission.id, status: "in_progress" })}>
            <Play /> Démarrer
          </Button>,
        );
      actions.push(
        <Button key="d" size="sm" variant="primary" onClick={() => run(setMissionStatus, { id: mission.id, status: "done" })}>
          <CheckCircle2 /> Valider
        </Button>,
      );
      break;
    case "invoice_paid":
      break;
  }
  if (href)
    actions.push(
      <Button key="h" size="sm" variant="ghost" asChild>
        <Link href={href}>
          <ExternalLink /> Ouvrir
        </Link>
      </Button>,
    );
  if (showCancel && mission.source !== "auto")
    actions.push(
      <Button key="x" size="sm" variant="ghost" onClick={() => run(setMissionStatus, { id: mission.id, status: "cancelled" })}>
        <X /> Annuler
      </Button>,
    );
  return (
    <>
      {actions}
      {followUp ? <FollowUpDialog invoiceId={followUp} onClose={() => setFollowUp(null)} /> : null}
    </>
  );
}
