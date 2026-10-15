"use client";
import * as React from "react";
import Link from "next/link";
import { CalendarClock, FilePlus2, FolderPlus, GripVertical, MessageSquarePlus, Plus, Trash2 } from "lucide-react";
import type { Opportunity, OpportunityStage } from "@/lib/domain/types";
import { useCommand, useData, useLookups, useToday } from "@/lib/store/hooks";
import { useParam, useSyncedState } from "@/lib/store/params";
import { useUiStore } from "@/lib/store/ui-store";
import * as C from "@/lib/domain/commands";
import { STAGES, STAGE_LABELS, conversionRate, isOpen, isStale, pipelineValue, weightedPipeline } from "@/lib/calculations/pipeline";
import { PageHeader } from "@/components/shared/page-header";
import { MetricCard } from "@/components/shared/metric-card";
import { FormDialog } from "@/components/forms/quick-create";
import { OpportunityForm } from "@/components/forms/entity-forms";
import { useConfirm } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label, NativeSelect } from "@/components/ui/input";
import { formatDate, formatDateTime, formatDueIn, formatEUR, formatPercent } from "@/lib/formatters";
import { ACTIVITY_TYPE } from "@/lib/formatters/labels";
import { cn } from "@/lib/utils";

export function PipelinePage() {
  const data = useData();
  const today = useToday();
  const run = useCommand();
  const { clients, leads, employees } = useLookups();
  const openCreate = useUiStore((s) => s.openCreate);
  const focus = useParam("focus");
  const [selected, setSelected] = useSyncedState<string | null>(focus);
  const [dragging, setDragging] = React.useState<string | null>(null);
  const [over, setOver] = React.useState<OpportunityStage | null>(null);
  const [lost, setLost] = React.useState<{ id: string; reason: string } | null>(null);
  const [owner, setOwner] = React.useState("all");


  const opps = data.opportunities.filter((o) => owner === "all" || o.ownerId === owner);
  const move = (id: string, stage: OpportunityStage) => {
    if (stage === "lost") {
      setLost({ id, reason: "" });
      return;
    }
    run(C.moveOpportunity, { id, stage });
  };
  const company = (o: Opportunity) => (o.clientId ? clients.get(o.clientId)?.name : o.leadId ? `${leads.get(o.leadId)?.company ?? ""} (prospect)` : "—");
  const upcoming = data.salesActivities.filter((a) => !a.done).length;
  const won = data.opportunities.filter((o) => o.stage === "won");
  const conv = conversionRate(data.opportunities);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ventes et CRM"
        description="Pipeline commercial. Faites glisser une opportunité d'une étape à l'autre (ou utilisez le menu « Étape »). Une opportunité gagnée n'est pas un encaissement."
        actions={
          <>
            <Button variant="secondary" onClick={() => openCreate("activity")}>
              <MessageSquarePlus /> Activité
            </Button>
            <Button variant="primary" onClick={() => openCreate("opportunity")}>
              <Plus /> Nouvelle opportunité
            </Button>
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 2xl:grid-cols-8">
        <MetricCard label="Prospects" value={data.leads.filter((l) => l.status !== "converted").length} href="/crm/prospects" />
        <MetricCard label="Opportunités actives" value={data.opportunities.filter(isOpen).length} />
        <MetricCard label="Valeur du pipeline" value={formatEUR(pipelineValue(data.opportunities), { round: true })} hint="Somme des montants estimés des opportunités ouvertes." />
        <MetricCard label="Valeur pondérée" value={formatEUR(weightedPipeline(data.opportunities), { round: true })} hint="Σ montant × probabilité des opportunités ouvertes." />
        <MetricCard label="Taux de conversion" value={formatPercent(conv)} hint="Gagnées ÷ (gagnées + perdues)." />
        <MetricCard label="Ventes gagnées" value={won.length} tone="success" footer={<span className="text-[11px] text-muted">{formatEUR(won.reduce((s, o) => s + o.amount, 0), { round: true })}</span>} />
        <MetricCard label="Ventes perdues" value={data.opportunities.filter((o) => o.stage === "lost").length} />
        <MetricCard label="Activités à venir" value={upcoming} href="/crm/activites" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect value={owner} onChange={(e) => setOwner(e.target.value)} className="h-8 w-auto text-xs" aria-label="Commercial">
          <option value="all">Commercial : tous</option>
          {data.employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.firstName} {e.lastName}
            </option>
          ))}
        </NativeSelect>
        <span className="text-xs text-muted">{opps.length} opportunité(s)</span>
      </div>
      <div className="-mx-4 overflow-x-auto px-4 pb-2 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
        <div className="flex min-w-max gap-3">
          {STAGES.map((stage) => {
            const list = opps.filter((o) => o.stage === stage.id).sort((a, b) => b.amount - a.amount);
            return (
              <section
                key={stage.id}
                aria-label={stage.label}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOver(stage.id);
                }}
                onDragLeave={() => setOver((s) => (s === stage.id ? null : s))}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData("text/plain");
                  setOver(null);
                  setDragging(null);
                  if (id) move(id, stage.id);
                }}
                data-stage={stage.id}
                className={cn("flex w-72 shrink-0 flex-col rounded-xl border bg-bg-elevated transition-colors", over === stage.id ? "border-accent bg-accent/5" : "border-border")}
              >
                <header className="flex items-center justify-between border-b border-border px-3 py-2.5">
                  <div>
                    <h3 className="text-sm font-medium text-fg">{stage.label}</h3>
                    <p className="text-[11px] tabular text-muted">
                      {list.length} · {formatEUR(list.reduce((s, o) => s + o.amount, 0), { round: true })}
                    </p>
                  </div>
                  <Badge tone={stage.id === "won" ? "success" : stage.id === "lost" ? "neutral" : "info"}>{stage.defaultProbability} %</Badge>
                </header>
                <div className="flex min-h-24 flex-1 flex-col gap-2 p-2">
                  {list.map((o) => {
                    const stale = isStale(o, today, data.settings.gamification.staleOpportunityDays);
                    return (
                      <article
                        key={o.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", o.id);
                          setDragging(o.id);
                        }}
                        onDragEnd={() => setDragging(null)}
                        data-opportunity={o.id}
                        className={cn("group cursor-grab rounded-lg border bg-card p-3 text-left shadow-sm transition active:cursor-grabbing", dragging === o.id && "opacity-50", focus === o.id ? "border-accent" : "border-border hover:border-border-strong")}
                      >
                        <div className="flex items-start gap-2">
                          <GripVertical className="mt-0.5 size-3.5 shrink-0 text-subtle" aria-hidden />
                          <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setSelected(o.id)}>
                            <p className="line-clamp-2 text-sm font-medium text-fg">{o.name}</p>
                            <p className="truncate text-xs text-muted">{company(o)}</p>
                          </button>
                        </div>
                        <div className="mt-2 flex items-center justify-between text-xs">
                          <span className="font-semibold tabular text-fg">{formatEUR(o.amount, { round: true })}</span>
                          <span className="tabular text-muted">{o.probability} %</span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-subtle">
                          {isOpen(o) ? <span className="inline-flex items-center gap-1"><CalendarClock className="size-3" /> {formatDate(o.expectedCloseDate)}</span> : <span>Clôturée le {formatDate(o.closedAt)}</span>}
                          {stale ? <Badge tone="warning">Inactive</Badge> : null}
                          {o.ownerId ? <span className="ml-auto">{employees.get(o.ownerId)?.firstName}</span> : null}
                        </div>
                        <label className="mt-2 flex items-center gap-1.5 text-[11px] text-muted">
                          <span className="sr-only sm:not-sr-only">Étape</span>
                          <NativeSelect aria-label={`Étape de ${o.name}`} value={o.stage} onChange={(e) => move(o.id, e.target.value as OpportunityStage)} className="h-7 flex-1 text-[11px]">
                            {STAGES.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.label}
                              </option>
                            ))}
                          </NativeSelect>
                        </label>
                      </article>
                    );
                  })}
                  {!list.length ? <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-[11px] text-subtle">Déposez une opportunité ici</p> : null}
                </div>
              </section>
            );
          })}
        </div>
      </div>
      {selected ? <OpportunityDialog id={selected} onClose={() => setSelected(null)} /> : null}
      <FormDialog open={!!lost} onOpenChange={(o) => !o && setLost(null)} title="Opportunité perdue" description="Indiquez le motif de la perte (utile pour l'analyse des ventes perdues).">
        <Label htmlFor="lost-reason">Motif</Label>
        <Input id="lost-reason" className="mt-1.5" value={lost?.reason ?? ""} onChange={(e) => setLost((l) => (l ? { ...l, reason: e.target.value } : l))} placeholder="Budget, concurrent, timing…" />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setLost(null)}>
            Annuler
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (!lost) return;
              const r = run(C.moveOpportunity, { id: lost.id, stage: "lost", lostReason: lost.reason });
              if (r.ok) setLost(null);
            }}
          >
            Marquer comme perdue
          </Button>
        </div>
      </FormDialog>
    </div>
  );
}

function OpportunityDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const data = useData();
  const today = useToday();
  const run = useCommand();
  const openCreate = useUiStore((s) => s.openCreate);
  const { confirm, dialog } = useConfirm();
  const opp = data.opportunities.find((o) => o.id === id);
  if (!opp) return null;
  const activities = data.salesActivities.filter((a) => a.opportunityId === id).sort((a, b) => b.date.localeCompare(a.date));
  const quotes = data.quotes.filter((q) => q.opportunityId === id);
  const projects = data.projects.filter((p) => p.opportunityId === id);
  return (
    <FormDialog open onOpenChange={(o) => !o && onClose()} title={opp.name} description={`${STAGE_LABELS[opp.stage]} · dernière interaction ${formatDueIn(opp.lastInteractionAt, today)}${opp.lostReason ? ` · motif : ${opp.lostReason}` : ""}`} wide>
      <div className="mb-5 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => { onClose(); openCreate("activity", { opportunityId: id, clientId: opp.clientId, leadId: opp.leadId }); }}>
          <MessageSquarePlus /> Consigner une activité
        </Button>
        {opp.clientId ? (
          <Button size="sm" variant="secondary" onClick={() => { onClose(); openCreate("quote", { clientId: opp.clientId, opportunityId: id }); }}>
            <FilePlus2 /> Créer un devis
          </Button>
        ) : null}
        {opp.stage === "won" && opp.clientId ? (
          <Button size="sm" variant="secondary" onClick={() => { onClose(); openCreate("project", { clientId: opp.clientId, opportunityId: id }); }}>
            <FolderPlus /> Créer le projet
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" className="ml-auto text-danger" onClick={() => confirm({ title: "Supprimer cette opportunité ?", description: "Les devis, projets et activités liés seront conservés mais détachés.", confirmLabel: "Supprimer", action: () => { const r = run(C.deleteOpportunity, { id }); if (r.ok) onClose(); } })}>
          <Trash2 /> Supprimer
        </Button>
      </div>
      {quotes.length || projects.length ? (
        <div className="mb-4 flex flex-wrap gap-2 text-xs">
          {quotes.map((q) => (
            <Link key={q.id} href={`/crm/devis/${q.id}`} className="rounded-md border border-border px-2 py-1 hover:bg-interactive">
              Devis {q.number}
            </Link>
          ))}
          {projects.map((p) => (
            <Link key={p.id} href={`/projets/${p.id}`} className="rounded-md border border-border px-2 py-1 hover:bg-interactive">
              Projet {p.code}
            </Link>
          ))}
        </div>
      ) : null}
      <OpportunityForm entity={opp} onDone={onClose} onCancel={onClose} />
      <div className="mt-6">
        <h3 className="mb-2 text-sm font-medium">Historique des interactions ({activities.length})</h3>
        <ul className="space-y-1.5 text-xs">
          {activities.map((a) => (
            <li key={a.id} className="flex gap-2">
              <Badge tone={a.done ? "neutral" : "info"}>{ACTIVITY_TYPE[a.type]}</Badge>
              <span className="text-muted">{formatDateTime(a.date)}</span>
              <span className="truncate text-fg">{a.subject}</span>
            </li>
          ))}
          {!activities.length ? <li className="text-muted">Aucune interaction consignée.</li> : null}
        </ul>
      </div>
      {dialog}
    </FormDialog>
  );
}
