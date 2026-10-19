"use client";
import * as React from "react";
import Link from "next/link";
import { Archive, ArchiveRestore, Columns3, FilePlus2, FolderPlus, Trash2 } from "lucide-react";
import { useCommand, useData, useToday } from "@/lib/store/hooks";
import { useUiStore } from "@/lib/store/ui-store";
import { useCrm } from "@/lib/store/crm";
import * as C from "@/lib/domain/commands";
import { STAGE_LABELS } from "@/lib/calculations/pipeline";
import { FormDialog } from "@/components/forms/quick-create";
import { OpportunityForm } from "@/components/forms/entity-forms";
import { useConfirm } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { FollowUpBadge, MissionLine, QuickActions, StageBadge } from "@/components/crm/crm-ui";
import { Timeline } from "@/components/crm/timeline";
import { formatDueIn, formatEUR } from "@/lib/formatters";

/** Fiche d'une opportunité : résumé, missions, historique, modification. */
export function OpportunityDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const data = useData();
  const today = useToday();
  const run = useCommand();
  const crm = useCrm();
  const openCreate = useUiStore((s) => s.openCreate);
  const { confirm, dialog } = useConfirm();
  const [editing, setEditing] = React.useState(false);
  const deal = crm.dealById.get(id);
  if (!deal) return null;
  const opp = deal.opportunity;
  const contactName = deal.contact ? `${deal.contact.firstName} ${deal.contact.lastName}` : null;
  const activities = data.salesActivities.filter((a) => a.opportunityId === id);
  const quotes = data.quotes.filter((q) => q.opportunityId === id);
  const projects = data.projects.filter((p) => p.opportunityId === id);
  const act = (fn: () => void) => () => {
    onClose();
    fn();
  };
  return (
    <FormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={opp.name}
      description={`${deal.company?.name ?? "Sans entreprise"}${contactName ? ` · ${contactName}` : ""} · dernière interaction ${formatDueIn(deal.lastInteractionAt, today)}`}
      wide
    >
      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <StageBadge stage={opp.stage} />
        <span className="font-semibold tabular">{formatEUR(opp.amount, { round: true })}</span>
        <span className="text-xs text-muted">Probabilité {opp.probability} %</span>
        <FollowUpBadge state={deal.followUp} />
        {opp.archivedAt ? <span className="text-xs text-muted">Archivée</span> : null}
        {opp.lostReason ? <span className="text-xs text-muted">Motif : {opp.lostReason}</span> : null}
      </div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <QuickActions target={{ contactId: opp.contactId, clientId: opp.clientId, opportunityId: id, task: deal.nextMission }} show={["open", "call", "note", "followup"]} />
        <Button size="sm" variant="secondary" onClick={act(() => openCreate("stage", { opportunityId: id }))}>
          <Columns3 /> Changer l&apos;étape
        </Button>
        {opp.clientId ? (
          <Button size="sm" variant="secondary" onClick={act(() => openCreate("quote", { clientId: opp.clientId, opportunityId: id }))}>
            <FilePlus2 /> Proposition
          </Button>
        ) : null}
        {opp.stage === "won" && opp.clientId ? (
          <Button size="sm" variant="secondary" onClick={act(() => openCreate("project", { clientId: opp.clientId, opportunityId: id }))}>
            <FolderPlus /> Créer le projet
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" onClick={() => run(C.archiveOpportunity, { id, archived: !opp.archivedAt })}>
          {opp.archivedAt ? <ArchiveRestore /> : <Archive />} {opp.archivedAt ? "Désarchiver" : "Archiver"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto text-danger"
          onClick={() =>
            confirm({
              title: "Supprimer cette opportunité ?",
              description: "Préférez l'archivage pour conserver l'historique. Les propositions, missions et interactions liées sont conservées mais détachées.",
              confirmLabel: "Supprimer",
              action: () => {
                const r = run(C.deleteOpportunity, { id });
                if (r.ok) onClose();
              },
            })
          }
        >
          <Trash2 /> Supprimer
        </Button>
      </div>
      {quotes.length || projects.length ? (
        <div className="mb-4 flex flex-wrap gap-2 text-xs">
          {quotes.map((q) => (
            <Link key={q.id} href={`/crm/devis/${q.id}`} className="rounded-md border border-border px-2 py-1 hover:bg-interactive">
              Proposition {q.number}
            </Link>
          ))}
          {projects.map((p) => (
            <Link key={p.id} href={`/projets/${p.id}`} className="rounded-md border border-border px-2 py-1 hover:bg-interactive">
              Projet {p.code}
            </Link>
          ))}
        </div>
      ) : null}
      <section className="mb-5">
        <h3 className="mb-2 text-sm font-medium">Missions ouvertes ({deal.openMissions.length})</h3>
        <div className="space-y-2">
          {deal.openMissions.map((t) => (
            <MissionLine key={t.id} task={t} today={today} showLinks={false} />
          ))}
          {!deal.openMissions.length ? <p className="text-xs text-muted">Aucune prochaine action planifiée.</p> : null}
        </div>
      </section>
      {editing ? (
        <OpportunityForm entity={opp} onDone={() => setEditing(false)} onCancel={() => setEditing(false)} />
      ) : (
        <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
          Modifier l&apos;opportunité ({STAGE_LABELS[opp.stage]})
        </Button>
      )}
      <section className="mt-6">
        <h3 className="mb-2 text-sm font-medium">Historique ({activities.length})</h3>
        <Timeline activities={activities} limit={8} />
      </section>
      {dialog}
    </FormDialog>
  );
}
